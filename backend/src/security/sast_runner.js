/**
 * backend/src/security/sast_runner.js
 * Industrial Security Auditor Agent Module.
 * Multi-Rule SAST + AI Audit with Unified Git Diff Patch Auto-Fix Generation.
 */

import { runLLMSecurityAudit } from './llm_auditor.js';
import { runTaintAnalysis } from './taint_analyzer.js';


const COMPREHENSIVE_SAST_RULES = [
  // ── Original 8 Rules ────────────────────────────────────────────────────
  {
    id: 'SEC-01',
    name: 'Hardcoded Secret / API Credentials',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    regex: /(?:jwt_secret|api_key|auth_token|aws_secret|private_key|secret_key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{8,}['"]/i,
    severity: 'HIGH',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'A secret key or token is hardcoded directly in source code. Anyone with repository access can extract this key to impersonate users or gain unauthorized API access.',
    generateFix: (line) => line.replace(/['"][a-zA-Z0-9_\-]{8,}['"]/, 'process.env.SECRET_TOKEN || ""')
  },
  {
    id: 'SEC-02',
    name: 'Hardcoded Fallback Database Password',
    cwe: 'CWE-259: Use of Hard-coded Password',
    regex: /password\s*:\s*.*?:?\s*['"](?:password|admin|root|123456|secret)['"]/i,
    severity: 'HIGH',
    owasp: 'A07:2021-Identification and Authentication Failures',
    explanation: 'A default plain-text password fallback (e.g. "password", "admin") is specified in the database configuration code.',
    generateFix: (line) => line.replace(/['"](?:password|admin|root|123456|secret)['"]/, 'process.env.DB_PASSWORD')
  },
  {
    id: 'SEC-03',
    name: 'SQL String Concatenation Injection',
    cwe: 'CWE-89: SQL Injection',
    regex: /(?:db\.query|cursor\.execute|createQuery|\.raw|\.whereRaw)\(['"`].*?\$\{.*?\}|SELECT\s+.*?\+\s*[a-zA-Z0-9_]+/i,
    severity: 'CRITICAL',
    owasp: 'A03:2021-Injection',
    explanation: 'User input is directly concatenated into a raw SQL string without parameterization. Attackers can inject malicious SQL commands to bypass authentication or dump database tables.',
    generateFix: (line) => `// Parameterized query prevents SQL injection\n` + line.replace(/\+.*$/, ', [param])')
  },
  {
    id: 'SEC-04',
    name: 'Command Injection / Unsanitized Execution',
    cwe: 'CWE-78: OS Command Injection',
    regex: /\b(exec|spawn|os\.system|subprocess\.call|Runtime\.getRuntime\(\)\.exec)\s*\(/i,
    severity: 'CRITICAL',
    owasp: 'A03:2021-Injection',
    explanation: 'Executing system OS shell commands with raw string inputs allows remote code execution (RCE) on the server.',
    generateFix: (line) => `// Validate and sanitize arguments before calling system process\n` + line
  },
  {
    id: 'SEC-05',
    name: 'Insecure Code Evaluation (eval / pickle)',
    cwe: 'CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code',
    regex: /\beval\(|new Function\(|pickle\.loads\(|yaml\.load\([^,)]+\)/i,
    severity: 'CRITICAL',
    owasp: 'A08:2021-Software and Data Integrity Failures',
    explanation: 'Evaluating dynamic strings or deserializing untrusted data objects allows remote code execution.',
    generateFix: (line) => line.replace(/eval\(|pickle\.loads\(/, 'JSON.parse(')
  },
  {
    id: 'SEC-06',
    name: 'Cross-Site Scripting (XSS) / Direct HTML Injection',
    cwe: 'CWE-79: Cross-site Scripting',
    regex: /dangerouslySetInnerHTML|innerHTML\s*=|document\.write\(/i,
    severity: 'HIGH',
    owasp: 'A03:2021-Injection',
    explanation: 'Rendering unescaped HTML content directly to the browser DOM exposes users to Cross-Site Scripting (XSS) attacks.',
    generateFix: (line) => line.replace(/dangerouslySetInnerHTML|innerHTML/g, 'textContent')
  },
  {
    id: 'SEC-07',
    name: 'Weak Hashing Algorithm (MD5 / SHA1)',
    cwe: 'CWE-328: Use of Weak Hash',
    regex: /createHash\(['"](md5|sha1)['"]\)|MessageDigest\.getInstance\(['"](MD5|SHA1)['"]\)|hashlib\.(md5|sha1)\(/i,
    severity: 'MEDIUM',
    owasp: 'A02:2021-Cryptographic Failures',
    explanation: 'MD5 and SHA1 cryptographic hashes are broken and vulnerable to collision attacks. Use SHA256 or bcrypt instead.',
    generateFix: (line) => line.replace(/md5|sha1/gi, 'sha256')
  },
  {
    id: 'SEC-08',
    name: 'Insecure Wildcard CORS Configuration',
    cwe: 'CWE-942: Permissive CORS Policy',
    regex: /origin:\s*['"]\*['"]|Access-Control-Allow-Origin:\s*\*/i,
    severity: 'MEDIUM',
    owasp: 'A05:2021-Security Misconfiguration',
    explanation: 'Allowing wildcard CORS (Access-Control-Allow-Origin: *) permits any external website to read private API responses.',
    generateFix: (line) => line.replace(/\*/g, 'process.env.ALLOWED_ORIGIN || "https://yourdomain.com"')
  },

  // ── New Rules: Extended OWASP Top 10 Coverage ────────────────────────────
  {
    id: 'SEC-09',
    name: 'Server-Side Request Forgery (SSRF)',
    cwe: 'CWE-918: Server-Side Request Forgery (SSRF)',
    regex: /(?:fetch|axios\.get|axios\.post|http\.get|request)\s*\(\s*(?:req\.(?:body|query|params)|userInput|url|target)/i,
    severity: 'CRITICAL',
    owasp: 'A10:2021-Server-Side Request Forgery',
    explanation: 'A user-controlled URL is passed directly to a server-side HTTP request. Attackers can use this to probe internal services, cloud metadata endpoints (e.g. 169.254.169.254), or exfiltrate data.',
    generateFix: (line) => `// Validate URL against an allowlist before making request\n// const ALLOWED_HOSTS = ['api.trusted.com'];\n` + line
  },
  {
    id: 'SEC-10',
    name: 'Path Traversal / Directory Traversal',
    cwe: 'CWE-22: Improper Limitation of a Pathname',
    regex: /(?:fs\.readFile|fs\.readFileSync|fs\.writeFile|path\.join|path\.resolve)\s*\(.*?(?:req\.(?:body|query|params)|\.\.[\/\\])/i,
    severity: 'HIGH',
    owasp: 'A01:2021-Broken Access Control',
    explanation: 'User-controlled input is used in a filesystem path. An attacker can use "../" sequences to traverse outside the intended directory and read sensitive files (e.g. /etc/passwd, .env).',
    generateFix: (line) => `// Sanitize path: use path.basename() and validate against a safe root\n// const safePath = path.join(SAFE_ROOT, path.basename(userInput));\n` + line
  },
  {
    id: 'SEC-11',
    name: 'JWT Algorithm Confusion / alg:none Attack',
    cwe: 'CWE-327: Use of a Broken or Risky Cryptographic Algorithm',
    regex: /(?:jwt\.sign|jwt\.verify|sign|verify)\s*\(.*?(?:algorithm:\s*['"]none['"]|algorithms:\s*\[['"]none['"]\])/i,
    severity: 'CRITICAL',
    owasp: 'A02:2021-Cryptographic Failures',
    explanation: 'Using "none" as the JWT algorithm disables signature verification entirely. Any attacker can forge arbitrary JWT tokens and gain unauthorized access.',
    generateFix: (line) => line.replace(/['"]none['"]/, '"HS256"')
  },
  {
    id: 'SEC-12',
    name: 'Prototype Pollution',
    cwe: 'CWE-1321: Improperly Controlled Modification of Object Prototype',
    regex: /(?:Object\.assign|merge|extend|deepmerge|lodash\.merge)\s*\(\s*(?:\{\}|target|obj),?\s*(?:req\.body|req\.query|userInput)/i,
    severity: 'HIGH',
    owasp: 'A08:2021-Software and Data Integrity Failures',
    explanation: 'Merging user-controlled objects into application objects without sanitization can pollute Object.prototype, potentially altering behavior for all objects and enabling privilege escalation.',
    generateFix: (line) => `// Sanitize input: use JSON.parse(JSON.stringify(input)) or a schema validator\n` + line
  },
  {
    id: 'SEC-13',
    name: 'Insecure Randomness for Security Tokens',
    cwe: 'CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator',
    regex: /Math\.random\s*\(\s*\).*?(?:token|secret|key|password|nonce|salt|session)/i,
    severity: 'MEDIUM',
    owasp: 'A02:2021-Cryptographic Failures',
    explanation: 'Math.random() is not cryptographically secure. Tokens or secrets generated with it are predictable and can be brute-forced. Use crypto.randomBytes() instead.',
    generateFix: (line) => line.replace(/Math\.random\(\)/, 'crypto.randomBytes(32).toString(\'hex\')')
  },
  {
    id: 'SEC-14',
    name: 'NoSQL Injection',
    cwe: 'CWE-943: Improper Neutralization of Special Elements in Data Query Logic',
    regex: /(?:find|findOne|update|delete|aggregate)\s*\(\s*(?:req\.body|req\.query|req\.params)|\$where\s*:|\$regex\s*:/i,
    severity: 'CRITICAL',
    owasp: 'A03:2021-Injection',
    explanation: 'User input is passed directly as a MongoDB/NoSQL query operator. Attackers can inject query operators (e.g. {$gt: ""}) to bypass authentication or dump collections.',
    generateFix: (line) => `// Sanitize input: use a schema validator (e.g. Joi/Zod) and reject objects from user input\n` + line
  },
  {
    id: 'SEC-15',
    name: 'Open Redirect',
    cwe: 'CWE-601: URL Redirection to Untrusted Site',
    regex: /res\.redirect\s*\(\s*(?:req\.(?:body|query|params)|userInput|url|target)/i,
    severity: 'MEDIUM',
    owasp: 'A01:2021-Broken Access Control',
    explanation: 'The redirect destination is controlled by user input. Attackers can craft phishing URLs that redirect victims from a trusted domain to a malicious site.',
    generateFix: (line) => `// Validate redirect URL against an allowlist of safe paths\n// if (!ALLOWED_REDIRECTS.includes(target)) return res.status(400).send('Invalid redirect');\n` + line
  },
  {
    id: 'SEC-16',
    name: 'Sensitive Data Exposure in Logs',
    cwe: 'CWE-532: Insertion of Sensitive Information into Log File',
    regex: /console\.(?:log|info|warn|error)\s*\(.*?(?:password|token|secret|apiKey|api_key|jwt|ssn|creditCard)/i,
    severity: 'MEDIUM',
    owasp: 'A09:2021-Security Logging and Monitoring Failures',
    explanation: 'Sensitive data such as passwords, tokens, or API keys is being written to application logs. Log files are often stored insecurely and may be accessible to unauthorized parties.',
    generateFix: (line) => line.replace(/console\.(log|info|warn|error)/, '// [REDACTED] console.$1 // Removed: contains sensitive data')
  },
  {
    id: 'SEC-17',
    name: 'Environment Variable / Config Exposure in API Response',
    cwe: 'CWE-200: Exposure of Sensitive Information to an Unauthorized Actor',
    regex: /res\.(?:json|send)\s*\(.*?process\.env/i,
    severity: 'HIGH',
    owasp: 'A02:2021-Cryptographic Failures',
    explanation: 'Environment variables containing secrets, API keys, or configuration are being sent directly in HTTP responses. This exposes sensitive server configuration to any client.',
    generateFix: (line) => `// Never expose process.env in API responses — return only safe, whitelisted fields\n` + line
  },
  {
    id: 'SEC-18',
    name: 'Insecure Cookie Configuration (Missing httpOnly / Secure)',
    cwe: 'CWE-614: Sensitive Cookie Without Secure Attribute',
    regex: /res\.cookie\s*\([^)]*\)(?!.*httpOnly)(?!.*secure)|cookie:\s*\{(?!.*httpOnly)(?!.*secure)/i,
    severity: 'MEDIUM',
    owasp: 'A05:2021-Security Misconfiguration',
    explanation: 'Session or authentication cookies are set without the httpOnly and Secure flags. Without httpOnly, JavaScript can steal the cookie (XSS). Without Secure, the cookie is sent over plain HTTP.',
    generateFix: (line) => line.replace(/res\.cookie\(([^,]+),\s*([^,]+)/, 'res.cookie($1, $2, { httpOnly: true, secure: true, sameSite: \'Strict\' }')
  }
];

function generateUnifiedGitDiff(filePath, lineNo, originalLine, fixLine) {
  return `--- a/${filePath}\n+++ b/${filePath}\n@@ -${lineNo},1 +${lineNo},1 @@\n- ${originalLine}\n+ ${fixLine}`;
}

export async function scanSecurityVulnerabilities(fileList, knowledgeGraph, apiKey = null, astSummaries = []) {
  const vulnerabilities = [];

  fileList.forEach(file => {
    const lines = file.content.split('\n');
    // Find AST summary for this file (for vuln→function linking)
    const fileSummary = astSummaries.find(s => s.filePath === file.path);

    lines.forEach((line, idx) => {
      COMPREHENSIVE_SAST_RULES.forEach(rule => {
        if (rule.regex.test(line)) {
          const suggestedFix = rule.generateFix(line.trim());
          const gitDiff = generateUnifiedGitDiff(file.path, idx + 1, line.trim(), suggestedFix);

          const vulnObj = {
            vulnId: `${rule.id}-${vulnerabilities.length + 1}`,
            filePath: file.path,
            line: idx + 1,
            codeSnippet: line.trim(),
            type: rule.name,
            cwe: rule.cwe,
            severity: rule.severity,
            owasp: rule.owasp,
            explanation: rule.explanation,
            patch: {
              original: line.trim(),
              fix: suggestedFix,
              gitDiff
            }
          };

          // ── Link vuln → function → file in knowledge graph ────────────────
          if (fileSummary?.functions?.length > 0) {
            // Find the function whose line range contains this vulnerability
            const containingFn = fileSummary.functions.find(fn => {
              const fnLine = fn.line || fn.charIndex || 0;
              return fnLine > 0 && fnLine <= idx + 1;
            });
            if (containingFn) {
              vulnObj.containingFunction = containingFn.name;
            }
          }

          vulnerabilities.push(vulnObj);

          if (knowledgeGraph) {
            knowledgeGraph.addVulnerabilityNode(
              vulnObj.vulnId,
              file.path,
              idx + 1,
              rule.name,
              rule.severity,
              rule.owasp,
              suggestedFix
            );
            // Create FOUND_IN_FUNCTION edge if we identified the containing function
            if (vulnObj.containingFunction) {
              knowledgeGraph.linkVulnToFunction(vulnObj.vulnId, vulnObj.containingFunction, file.path);
            }
          }
        }
      });
    });
  });


  // Run Gemini AI Security Auditor Agent if API key is present
  const llmFindings = await runLLMSecurityAudit(fileList, apiKey);
  if (llmFindings && llmFindings.length > 0) {
    llmFindings.forEach((finding, idx) => {
      const gitDiff = generateUnifiedGitDiff(finding.filePath || 'file.js', finding.line || 1, finding.codeSnippet || '', finding.suggestedFix || '');
      const vulnObj = {
        vulnId: `AI-SEC-${idx + 1}`,
        filePath: finding.filePath || fileList[0]?.path || 'source_file',
        line: finding.line || 1,
        codeSnippet: finding.codeSnippet || '// AI Detected Risk',
        type: finding.type || 'Business Logic Vulnerability',
        cwe: 'CWE-840: Business Logic Errors',
        severity: finding.severity || 'HIGH',
        owasp: finding.owasp || 'A04:2021-Insecure Design',
        explanation: finding.description || 'AI detected a potential business logic risk or missing check.',
        patch: {
          original: finding.codeSnippet || '',
          fix: finding.suggestedFix || '// AI Suggested Fix',
          gitDiff
        }
      };

      vulnerabilities.push(vulnObj);

      if (knowledgeGraph) {
        knowledgeGraph.addVulnerabilityNode(
          vulnObj.vulnId,
          vulnObj.filePath,
          vulnObj.line,
          vulnObj.type,
          vulnObj.severity,
          vulnObj.owasp,
          vulnObj.patch.fix
        );
      }
    });
  }

  // ── Layer 3: Taint Flow Analysis ──────────────────────────────────────────
  const taintFindings = runTaintAnalysis(fileList, astSummaries);
  if (taintFindings && taintFindings.length > 0) {
    taintFindings.forEach((finding, idx) => {
      const gitDiff = generateUnifiedGitDiff(
        finding.filePath, finding.line,
        finding.codeSnippet,
        `// TAINT FIX: Sanitize input before passing to this sink\n// Use parameterized queries, allowlists, or input validation\n${finding.codeSnippet}`
      );
      const vulnObj = {
        vulnId: `TAINT-${idx + 1}`,
        filePath: finding.filePath,
        line: finding.line,
        codeSnippet: finding.codeSnippet,
        type: finding.type,
        cwe: finding.cwe,
        severity: finding.severity,
        owasp: finding.owasp,
        explanation: finding.explanation,
        isTaintFlow: true,
        taintedVariables: finding.taintedVariables || [],
        patch: {
          original: finding.codeSnippet,
          fix: `// Sanitize tainted input before use in this context`,
          gitDiff
        }
      };
      vulnerabilities.push(vulnObj);

      if (knowledgeGraph) {
        knowledgeGraph.addVulnerabilityNode(
          vulnObj.vulnId, vulnObj.filePath, vulnObj.line,
          vulnObj.type, vulnObj.severity, vulnObj.owasp, vulnObj.patch.fix
        );
      }
    });
  }

  return {
    totalFound: vulnerabilities.length,
    criticalCount: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
    highCount: vulnerabilities.filter(v => v.severity === 'HIGH').length,
    mediumCount: vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
    taintFlowCount: vulnerabilities.filter(v => v.isTaintFlow).length,
    vulnerabilities
  };
}
