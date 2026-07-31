/**
 * backend/src/security/dependency_scanner.js
 * Dependency Vulnerability Scanner: Checks package.json / requirements.txt / go.mod
 * against the OSV.dev (Open Source Vulnerabilities) database for known CVEs.
 *
 * Features:
 *  - Supports npm, PyPI, and Go ecosystems
 *  - Uses the free public OSV.dev API (no API key needed)
 *  - Returns structured vuln objects compatible with the SAST report format
 *  - Batch queries to stay within API limits
 */

const OSV_API_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_BATCH_SIZE = 20;

function parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return Object.entries(deps).map(([name, versionSpec]) => ({
      name,
      version: versionSpec.replace(/^[\^~>=<*]+/, '').split(' ')[0].trim(),
      ecosystem: 'npm'
    })).filter(d => d.version && !d.version.startsWith('file:'));
  } catch (e) {
    console.error('[Dependency Scanner] Failed to parse package.json:', e.message);
    return [];
  }
}

function parsePythonRequirements(content) {
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('=='))
    .map(line => {
      const [name, version] = line.split('==');
      return { name: name.trim(), version: version?.trim(), ecosystem: 'PyPI' };
    }).filter(d => d.name && d.version);
}

function parseGoMod(content) {
  const requires = [];
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/g) || [];
  requireBlock.forEach(block => {
    block.replace(/require\s*\(/, '').replace(')', '').split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && !parts[0].startsWith('//')) {
        requires.push({ name: parts[0], version: parts[1].replace(/^v/, ''), ecosystem: 'Go' });
      }
    });
  });
  return requires;
}

async function queryOSV(packages) {
  const allVulnerabilities = [];
  for (let i = 0; i < packages.length; i += OSV_BATCH_SIZE) {
    const batch = packages.slice(i, i + OSV_BATCH_SIZE);
    const queries = batch.map(pkg => ({
      version: pkg.version,
      package: { name: pkg.name, ecosystem: pkg.ecosystem }
    }));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(OSV_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) { console.warn(`[Dependency Scanner] OSV API HTTP ${response.status}`); continue; }
      const data = await response.json();
      (data.results || []).forEach((result, idx) => {
        const pkg = batch[idx];
        (result.vulns || []).forEach(vuln => {
          allVulnerabilities.push({
            packageName: pkg.name,
            packageVersion: pkg.version,
            ecosystem: pkg.ecosystem,
            osvId: vuln.id,
            aliases: vuln.aliases || [],
            summary: vuln.summary || 'No summary available',
            severity: normalizeSeverity(vuln),
            fixedVersion: extractFixedVersion(vuln, pkg.name),
            osvLink: `https://osv.dev/vulnerability/${vuln.id}`
          });
        });
      });
    } catch (err) {
      console.error('[Dependency Scanner] OSV API error:', err.name === 'AbortError' ? 'Timeout' : err.message);
    }
  }
  return allVulnerabilities;
}

function normalizeSeverity(vuln) {
  const dbSeverity = vuln.database_specific?.severity;
  if (dbSeverity) {
    const s = dbSeverity.toUpperCase();
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(s)) return s;
  }
  return 'MEDIUM';
}

function extractFixedVersion(vuln, pkgName) {
  for (const a of (vuln.affected || [])) {
    if (a.package?.name?.toLowerCase() === pkgName.toLowerCase()) {
      for (const range of (a.ranges || [])) {
        for (const event of (range.events || [])) {
          if (event.fixed) return event.fixed;
        }
      }
    }
  }
  return null;
}

export async function scanDependencies(fileList) {
  let allPackages = [];

  for (const file of fileList) {
    const filename = file.path.split('/').pop().toLowerCase();
    if (filename === 'package.json') {
      const pkgs = parsePackageJson(file.content);
      console.log(`[Dependency Scanner] ${pkgs.length} npm packages in ${file.path}`);
      allPackages = allPackages.concat(pkgs.map(p => ({ ...p, sourceFile: file.path })));
    } else if (filename === 'requirements.txt') {
      const pkgs = parsePythonRequirements(file.content);
      console.log(`[Dependency Scanner] ${pkgs.length} Python packages in ${file.path}`);
      allPackages = allPackages.concat(pkgs.map(p => ({ ...p, sourceFile: file.path })));
    } else if (filename === 'go.mod') {
      const pkgs = parseGoMod(file.content);
      console.log(`[Dependency Scanner] ${pkgs.length} Go modules in ${file.path}`);
      allPackages = allPackages.concat(pkgs.map(p => ({ ...p, sourceFile: file.path })));
    }
  }

  if (allPackages.length === 0) {
    console.log('[Dependency Scanner] No dependency manifests found.');
    return { totalFound: 0, criticalCount: 0, highCount: 0, mediumCount: 0, findings: [] };
  }

  console.log(`[Dependency Scanner] Querying OSV.dev for ${allPackages.length} packages...`);
  const osvResults = await queryOSV(allPackages);
  const findings = [];

  osvResults.forEach((result, idx) => {
    const cveAlias = result.aliases.find(a => a.startsWith('CVE-')) || result.osvId;
    const sourceFile = allPackages.find(p => p.name === result.packageName)?.sourceFile || 'package.json';
    findings.push({
      vulnId: `DEP-${idx + 1}`,
      filePath: sourceFile,
      line: 1,
      codeSnippet: `"${result.packageName}": "${result.packageVersion}"`,
      type: `Vulnerable Dependency: ${result.packageName}`,
      cwe: 'CWE-1035: OWASP Top 10 2021 A06 Vulnerable and Outdated Components',
      severity: result.severity,
      owasp: 'A06:2021-Vulnerable and Outdated Components',
      explanation: `${result.packageName}@${result.packageVersion} has a known vulnerability: ${result.summary}. Reference: ${cveAlias}. Details: ${result.osvLink}`,
      patch: {
        original: `"${result.packageName}": "${result.packageVersion}"`,
        fix: result.fixedVersion
          ? `"${result.packageName}": "${result.fixedVersion}" // upgraded from ${result.packageVersion}`
          : `// Update ${result.packageName} to latest — run: npm audit fix`,
        gitDiff: result.fixedVersion
          ? `--- a/package.json\n+++ b/package.json\n@@ @@\n- "${result.packageName}": "${result.packageVersion}"\n+ "${result.packageName}": "${result.fixedVersion}"`
          : `// Run: npm audit fix --force`
      }
    });
  });

  console.log(`[Dependency Scanner] Found ${findings.length} vulnerable dependencies.`);
  return {
    totalFound: findings.length,
    criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
    highCount: findings.filter(f => f.severity === 'HIGH').length,
    mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
    findings
  };
}
