/**
 * backend/src/security/secret_scanner.js
 * High-Performance Secret & Credential Leak Scanner Module.
 *
 * Scans repository files and commit artifacts for leaked private keys,
 * cloud credentials, tokens, webhooks, and database connection strings.
 */

const SECRET_PATTERNS = [
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
    severity: 'CRITICAL',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Exposed AWS Access Key ID detected. Attackers can use this key to gain access to cloud infrastructure.'
  },
  {
    name: 'AWS Secret Access Key',
    regex: /(?:aws_secret_access_key|aws_secret|secret_key)\s*[:=]\s*['"]([0-9a-zA-Z\/+]{40})['"]/i,
    severity: 'CRITICAL',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Exposed AWS Secret Access Key. Provides full access to AWS cloud resources when combined with Key ID.'
  },
  {
    name: 'Private RSA / SSH / PGP Key Block',
    regex: /-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----/,
    severity: 'CRITICAL',
    cwe: 'CWE-321: Use of Hard-coded Cryptographic Key',
    owasp: 'A02:2021-Cryptographic Failures',
    explanation: 'A private cryptographic key block is committed directly in source code. Anyone with access can decrypt traffic or impersonate servers.'
  },
  {
    name: 'GitHub Personal Access Token (PAT)',
    regex: /\b(ghp_[a-zA-Z0-9]{36})\b/,
    severity: 'CRITICAL',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Exposed GitHub Personal Access Token. Can be used to access private repositories, push code, or delete branches.'
  },
  {
    name: 'Stripe API Secret Key',
    regex: /\b(sk_live_[0-9a-zA-Z]{24,})\b/,
    severity: 'CRITICAL',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Live Stripe Secret API key exposed. Attackers can make unauthorized charges or access customer billing data.'
  },
  {
    name: 'Slack Incoming Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/,
    severity: 'HIGH',
    cwe: 'CWE-200: Exposure of Sensitive Information',
    owasp: 'A01:2021-Broken Access Control',
    explanation: 'Exposed Slack incoming webhook URL. Attackers can post spam or malicious links directly to internal Slack channels.'
  },
  {
    name: 'Database Connection String with Credentials',
    regex: /(?:postgres|mysql|mongodb|mongodb\+srv|redis):\/\/[^:]+:[^@]+@[a-zA-Z0-9\.-]+/,
    severity: 'CRITICAL',
    cwe: 'CWE-259: Use of Hard-coded Password',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Plain-text database connection string with password exposed in source code.'
  },
  {
    name: 'Generic Hardcoded API / Secret Token',
    regex: /(?:api_key|apikey|secret_key|client_secret|auth_token)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"]/i,
    severity: 'HIGH',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'Generic API key or secret token hardcoded in source file.'
  }
];

export async function scanSecrets(fileList, knowledgeGraph = null, repoKey = 'default') {
  const findings = [];

  fileList.forEach(file => {
    const lines = file.content.split('\n');

    lines.forEach((line, idx) => {
      SECRET_PATTERNS.forEach(pattern => {
        if (pattern.regex.test(line)) {
          const lineNo = idx + 1;
          const vulnObj = {
            vulnId: `SECRET-${findings.length + 1}`,
            filePath: file.path,
            line: lineNo,
            codeSnippet: line.trim(),
            type: `Leaked Secret: ${pattern.name}`,
            cwe: pattern.cwe || 'CWE-798: Hard-coded Credentials',
            severity: pattern.severity,
            owasp: pattern.owasp,
            explanation: pattern.explanation,
            isSecretLeak: true,
            patch: {
              original: line.trim(),
              fix: `// [REDACTED SECRET] Move secret token to environment variable (process.env)`,
              gitDiff: `--- a/${file.path}\n+++ b/${file.path}\n@@ -${lineNo},1 +${lineNo},1 @@\n- ${line.trim()}\n+ // [REDACTED SECRET] Use process.env`
            }
          };

          findings.push(vulnObj);

          if (knowledgeGraph) {
            knowledgeGraph.addVulnerabilityNode(
              vulnObj.vulnId,
              file.path,
              lineNo,
              vulnObj.type,
              vulnObj.severity,
              vulnObj.owasp,
              vulnObj.patch.fix,
              repoKey
            );
          }
        }
      });
    });
  });

  console.log(`[Secret Scanner] Scan complete. Found ${findings.length} leaked secret credentials.`);

  return {
    totalFound: findings.length,
    criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
    highCount: findings.filter(f => f.severity === 'HIGH').length,
    findings
  };
}
