/**
 * backend/src/security/taint_analyzer.js
 * Taint Flow Analysis Engine (Week 3 Upgrade).
 *
 * Tracks the flow of user-controlled data (taint sources) through
 * the code to dangerous sinks (functions that cause SQL injection,
 * command injection, path traversal, XSS, SSRF, etc.)
 *
 * Architecture:
 *   1. SOURCE: Where tainted data enters  (req.body, req.query, req.params...)
 *   2. PROPAGATION: Variable assignments that carry taint forward
 *   3. SINK: Dangerous calls that consume tainted data
 *
 * Returns confirmed taint flows with file/line/source/sink/type.
 */

// -- Taint SOURCES -------------------------------------------------------------
// Variables or expressions that introduce user-controlled data
const TAINT_SOURCE_REGEX = /\b(?:req|request)\.(body|query|params|headers|cookies)\b|\bprocess\.argv\b|\bos\.environ\b|\bgetenv\s*\(/i;

// -- Taint SINKS ---------------------------------------------------------------
// Dangerous function calls that should never receive tainted data
const TAINT_SINKS = [
  {
    regex: /(?:db|connection|pool|client|cursor|sequelize|knex)\.(?:query|execute|raw)\s*\([^)]*\$\{|(?:db|connection|pool|client)\.(?:query|execute)\s*\([`'"][^`'"]*\+/i,
    type: 'SQL Injection via Taint Flow',
    severity: 'CRITICAL',
    cwe: 'CWE-89: SQL Injection',
    owasp: 'A03:2021-Injection',
    explanation: 'Tainted user input flows directly into a raw SQL query without parameterization.'
  },
  {
    regex: /(?:exec|execSync|spawn|spawnSync|execFile)\s*\([^)]*(?:\$\{|\+\s*(?:req|request|user|input|param))/i,
    type: 'Command Injection via Taint Flow',
    severity: 'CRITICAL',
    cwe: 'CWE-78: OS Command Injection',
    owasp: 'A03:2021-Injection',
    explanation: 'Tainted user input flows into an OS command execution function, enabling Remote Code Execution.'
  },
  {
    regex: /(?:fs\.readFile|fs\.readFileSync|fs\.writeFile|path\.join|path\.resolve)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$\{[^}]*(?:req|request|param|query|body))/i,
    type: 'Path Traversal via Taint Flow',
    severity: 'HIGH',
    cwe: 'CWE-22: Path Traversal',
    owasp: 'A01:2021-Broken Access Control',
    explanation: 'Tainted user input flows into a filesystem path, allowing directory traversal attacks.'
  },
  {
    regex: /(?:fetch|axios\.get|axios\.post|http\.get|http\.request|https\.get|https\.request|request\.get)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$\{[^}]*(?:req|request|param|query|url))/i,
    type: 'SSRF via Taint Flow',
    severity: 'CRITICAL',
    cwe: 'CWE-918: Server-Side Request Forgery',
    owasp: 'A10:2021-Server-Side Request Forgery',
    explanation: 'Tainted user input flows into a server-side HTTP request URL, enabling SSRF attacks.'
  },
  {
    regex: /(?:res\.send|res\.json|res\.write|response\.send|innerHTML\s*=|document\.write)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$\{[^}]*(?:req|request|param|query|body))/i,
    type: 'XSS via Taint Flow',
    severity: 'HIGH',
    cwe: 'CWE-79: Cross-site Scripting',
    owasp: 'A03:2021-Injection',
    explanation: 'Tainted user input flows directly into an HTTP response or DOM without sanitization.'
  },
  {
    regex: /(?:eval|new Function|setTimeout|setInterval)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$\{[^}]*(?:req|request|param|query|body))/i,
    type: 'Code Injection via Taint Flow',
    severity: 'CRITICAL',
    cwe: 'CWE-95: Code Injection',
    owasp: 'A03:2021-Injection',
    explanation: 'Tainted user input flows into an eval() or dynamic code execution function.'
  },
  {
    regex: /(?:db|collection|Model|mongoose)\s*\.(?:find|findOne|findById|update|delete|aggregate)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/i,
    type: 'NoSQL Injection via Taint Flow',
    severity: 'CRITICAL',
    cwe: 'CWE-943: NoSQL Injection',
    owasp: 'A03:2021-Injection',
    explanation: 'Tainted user input flows directly into a MongoDB/NoSQL query without sanitization.'
  },
  {
    regex: /res\.redirect\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/i,
    type: 'Open Redirect via Taint Flow',
    severity: 'MEDIUM',
    cwe: 'CWE-601: Open Redirect',
    owasp: 'A01:2021-Broken Access Control',
    explanation: 'Tainted user input controls a redirect destination, enabling phishing attacks.'
  }
];

/**
 * Extracts variable names that are assigned from taint sources.
 * Example: const userId = req.body.id  ? userId is tainted
 */
function extractTaintedVariables(lines) {
  const taintedVars = new Set();

  lines.forEach(line => {
    // Direct assignment from taint source: const x = req.body.x
    const directMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:req|request)\.(body|query|params|headers|cookies)/);
    if (directMatch) taintedVars.add(directMatch[1]);

    // Destructured from taint source: const { id, name } = req.body
    const destructMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:req|request)\.(body|query|params)/);
    if (destructMatch) {
      destructMatch[1].split(',').forEach(v => {
        const varName = v.trim().split(':')[0].trim().split('=')[0].trim();
        if (varName) taintedVars.add(varName);
      });
    }

    // Parameter spreading: const data = { ...req.body }
    const spreadMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*\{[^}]*\.\.\.(?:req|request)\.(body|query|params)/);
    if (spreadMatch) taintedVars.add(spreadMatch[1]);
  });

  return taintedVars;
}

/**
 * Main taint analysis function.
 * Scans file content for taint flows from source to sink.
 *
 * @param {string} filePath - File being analyzed
 * @param {string} content - File content
 * @param {Array} astTaintSources - Pre-detected taint source lines from AST parser
 * @returns {Array} - Array of confirmed taint flow vulnerability objects
 */
export function analyzeTaintFlow(filePath, content, astTaintSources = []) {
  const lines = content.split('\n');
  const findings = [];
  const seenLines = new Set(); // dedup

  // Extract tainted variable names from the whole file
  const taintedVars = extractTaintedVariables(lines);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (seenLines.has(lineNo)) return;

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

    // Check each sink pattern
    TAINT_SINKS.forEach(sink => {
      if (sink.regex.test(line)) {
        seenLines.add(lineNo);
        findings.push({
          filePath,
          line: lineNo,
          codeSnippet: trimmed,
          type: sink.type,
          cwe: sink.cwe,
          severity: sink.severity,
          owasp: sink.owasp,
          explanation: sink.explanation,
          taintedVariables: Array.from(taintedVars),
          isTaintFlow: true
        });
      }
    });

    // Also check if a tainted variable name appears in a dangerous context
    if (taintedVars.size > 0) {
      const taintedVarPattern = new RegExp(
        `\\b(${Array.from(taintedVars).join('|')})\\b`
      );

      TAINT_SINKS.forEach(sink => {
        if (
          taintedVarPattern.test(line) &&
          /(?:query|execute|exec|spawn|readFile|readFileSync|fetch|axios|redirect|innerHTML|eval)\s*\(/.test(line) &&
          !seenLines.has(lineNo)
        ) {
          seenLines.add(lineNo);
          findings.push({
            filePath,
            line: lineNo,
            codeSnippet: trimmed,
            type: `${sink.type} (propagated variable)`,
            cwe: sink.cwe,
            severity: sink.severity,
            owasp: sink.owasp,
            explanation: `${sink.explanation} The tainted variable(s) [${Array.from(taintedVars).join(', ')}] flow into this sink.`,
            taintedVariables: Array.from(taintedVars),
            isTaintFlow: true
          });
        }
      });
    }
  });

  return findings;
}

/**
 * Runs taint analysis across all files in a repo.
 * Returns all confirmed taint flow findings.
 */
export function runTaintAnalysis(fileList, astSummaries = []) {
  const allFindings = [];

  fileList.forEach(file => {
    const ast = astSummaries.find(a => a.filePath === file.path);
    const astTaintSources = ast?.taintSources || [];

    const findings = analyzeTaintFlow(file.path, file.content, astTaintSources);
    allFindings.push(...findings);
  });

  console.log(`[Taint Analyzer] Completed. Found ${allFindings.length} taint flow vulnerabilities.`);
  return allFindings;
}
