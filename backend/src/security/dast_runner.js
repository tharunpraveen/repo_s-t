/**
 * backend/src/security/dast_runner.js
 * Dynamic Application Security Testing (DAST) API Prober Agent Module.
 *
 * Takes all exposed API routes discovered by AST parsing & Neo4j (`:Endpoint` nodes)
 * and fires targeted live HTTP security probe payloads to test for runtime vulnerabilities.
 */

// -- Standard DAST Security Payloads & Rules ----------------------------------
const DAST_SECURITY_PROBES = [
  {
    id: 'DAST-SQLI',
    name: 'Dynamic SQL Injection Probe',
    payload: "' OR '1'='1 --",
    cwe: 'CWE-89: SQL Injection',
    owasp: 'A03:2021-Injection',
    severity: 'CRITICAL',
    checkFn: (status, bodyText) => {
      const sqlErrorPatterns = /syntax error|unclosed quotation|mysql_fetch|pg_query|sqlite3::|ORA-00933|SQLSTATE/i;
      return status === 500 || sqlErrorPatterns.test(bodyText);
    },
    explanation: 'Target endpoint crashed or returned unhandled database error when tested with SQL injection payload.'
  },
  {
    id: 'DAST-XSS',
    name: 'Dynamic Reflected XSS Probe',
    payload: '<script>alert("DAST_XSS")</script>',
    cwe: 'CWE-79: Cross-site Scripting',
    owasp: 'A03:2021-Injection',
    severity: 'HIGH',
    checkFn: (status, bodyText) => {
      return bodyText.includes('<script>alert("DAST_XSS")</script>');
    },
    explanation: 'Target endpoint reflected raw unescaped HTML/JavaScript script tag in HTTP response body.'
  },
  {
    id: 'DAST-TRAVERSAL',
    name: 'Dynamic Path Traversal Probe',
    payload: '../../../../etc/passwd',
    cwe: 'CWE-22: Path Traversal',
    owasp: 'A01:2021-Broken Access Control',
    severity: 'HIGH',
    checkFn: (status, bodyText) => {
      return /root:x:0:0:|\[boot loader\]/i.test(bodyText);
    },
    explanation: 'Target endpoint returned contents of sensitive system file when probed with path traversal payload.'
  },
  {
    id: 'DAST-CORS',
    name: 'Dynamic Insecure CORS Origin Probe',
    testType: 'CORS',
    cwe: 'CWE-942: Permissive CORS Policy',
    owasp: 'A05:2021-Security Misconfiguration',
    severity: 'MEDIUM',
    checkFn: (status, bodyText, headers) => {
      const allowOrigin = headers?.get('access-control-allow-origin');
      return allowOrigin === '*' || allowOrigin === 'https://evil-attacker.com';
    },
    explanation: 'Endpoint returned wildcard (*) or reflected arbitrary origin in Access-Control-Allow-Origin header.'
  }
];

/**
 * Runs DAST probes against all exposed API endpoints.
 *
 * @param {Array} astSummaries - Parsed AST summaries containing route declarations
 * @param {string} baseUrl - Base URL of the live server being tested (defaults to local express app)
 * @returns {Object} DAST scan report
 */
export async function runDASTScan(astSummaries = [], baseUrl = null) {
  const targetBaseUrl = baseUrl || process.env.DAST_TARGET_URL || 'http://localhost:3002';
  const findings = [];

  // Extract all routes from AST summaries
  const routes = [];
  astSummaries.forEach(ast => {
    (ast.routes || []).forEach(r => {
      routes.push({
        method: (r.method || 'GET').toUpperCase(),
        path: r.path || '/',
        filePath: r.file || ast.filePath
      });
    });
  });

  if (routes.length === 0) {
    console.log('[DAST Runner] No exposed API route endpoints discovered for dynamic scanning.');
    return { totalFound: 0, criticalCount: 0, highCount: 0, mediumCount: 0, findings: [] };
  }

  console.log(`[DAST Runner] Starting dynamic security probing on ${routes.length} API endpoints against ${targetBaseUrl}...`);

  for (const route of routes) {
    // Probe 1: Test CORS Origin
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const corsRes = await fetch(`${targetBaseUrl}${route.path}`, {
        method: route.method === 'GET' ? 'GET' : 'OPTIONS',
        headers: { 'Origin': 'https://evil-attacker.com' },
        signal: controller.signal
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (corsRes && DAST_SECURITY_PROBES.find(p => p.id === 'DAST-CORS').checkFn(corsRes.status, '', corsRes.headers)) {
        findings.push({
          vulnId: `DAST-${findings.length + 1}`,
          filePath: route.filePath,
          endpoint: `${route.method} ${route.path}`,
          line: 1,
          codeSnippet: `${route.method} ${route.path}`,
          type: 'DAST: Insecure CORS Wildcard Policy',
          cwe: 'CWE-942: Permissive CORS Policy',
          severity: 'MEDIUM',
          owasp: 'A05:2021-Security Misconfiguration',
          explanation: `Live DAST probe verified that ${route.method} ${route.path} accepts arbitrary origin 'https://evil-attacker.com' via CORS response headers.`,
          isDASTFinding: true,
          patch: {
            original: `Access-Control-Allow-Origin: *`,
            fix: `// Restrict Access-Control-Allow-Origin to trusted domain allowlist`,
            gitDiff: `--- a/${route.filePath}\n+++ b/${route.filePath}\n@@ @@\n- app.use(cors({ origin: '*' }))\n+ app.use(cors({ origin: process.env.ALLOWED_ORIGIN }))`
          }
        });
      }
    } catch (e) {
      // Ignore network connection errors
    }

    // Probe 2: Test Payloads on POST/GET endpoints
    for (const probe of DAST_SECURITY_PROBES.filter(p => p.testType !== 'CORS')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        let res;
        if (route.method === 'GET') {
          const testUrl = `${targetBaseUrl}${route.path}?q=${encodeURIComponent(probe.payload)}&id=${encodeURIComponent(probe.payload)}`;
          res = await fetch(testUrl, { method: 'GET', signal: controller.signal }).catch(() => null);
        } else {
          res = await fetch(`${targetBaseUrl}${route.path}`, {
            method: route.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: probe.payload, username: probe.payload, query: probe.payload }),
            signal: controller.signal
          }).catch(() => null);
        }

        clearTimeout(timeoutId);

        if (res) {
          const bodyText = await res.text().catch(() => '');
          if (probe.checkFn(res.status, bodyText)) {
            findings.push({
              vulnId: `DAST-${findings.length + 1}`,
              filePath: route.filePath,
              endpoint: `${route.method} ${route.path}`,
              line: 1,
              codeSnippet: `Payload: ${probe.payload} ? HTTP ${res.status}`,
              type: `DAST: ${probe.name}`,
              cwe: probe.cwe,
              severity: probe.severity,
              owasp: probe.owasp,
              explanation: `Live DAST probe triggered vulnerability on ${route.method} ${route.path}. ${probe.explanation}`,
              isDASTFinding: true,
              patch: {
                original: `HTTP ${res.status} Response to Payload: ${probe.payload}`,
                fix: `// Sanitize parameters and add schema input validation on ${route.path}`,
                gitDiff: `// DAST Verified vulnerability on live route: ${route.method} ${route.path}`
              }
            });
          }
        }
      } catch (err) {
        // Ignore single probe failures
      }
    }
  }

  console.log(`[DAST Runner] Scanning complete. Found ${findings.length} dynamic runtime API vulnerabilities.`);

  return {
    totalFound: findings.length,
    criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
    highCount: findings.filter(f => f.severity === 'HIGH').length,
    mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
    findings
  };
}
