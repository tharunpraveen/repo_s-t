/**
 * backend/src/parsers/ast_parser.js
 * Multi-Language AST Parsing Engine.
 *
 * Week 3 Upgrade:
 *  - JavaScript/TypeScript: uses @babel/parser for real AST traversal (replaces regex)
 *  - Python/Java/Go: uses improved regex fallback patterns
 *  - NEW: extracts taint sources (req.body, req.query, req.params, process.argv, etc.)
 *    so the taint analyzer can track data flow from user-controlled inputs.
 */

import * as babelParser from '@babel/parser';

// -- Taint source patterns recognized across languages -------------------------
const TAINT_SOURCE_PATTERNS = [
  /req\.(body|query|params|headers|cookies)\b/,
  /request\.(body|query|params|args|form|json|data)\b/,
  /process\.argv\b/,
  /process\.env\.\w+/,
  /getenv\(/,
  /os\.environ\b/,
  /System\.getProperty\(/,
  /\$_GET\[|_POST\[|_REQUEST\[/
];

// -- Regex fallback patterns for non-JS languages ------------------------------
const LANGUAGE_PATTERNS = {
  py: {
    functions: /def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/g,
    classes: /class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/g,
    imports: /(?:from\s+([a-zA-Z0-9._]+)\s+import|import\s+([a-zA-Z0-9._]+))/g,
    routes: /@(?:app|router)\.(get|post|put|delete|patch)\(['\"](.*?)['\"]|@(?:app|bp)\.route\(['\"](.*?)['"]/gi
  },
  java: {
    functions: /(?:public|protected|private|static|\s)+[\w<>\[\]]+\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/g,
    classes: /(?:public\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/g,
    imports: /import\s+([a-zA-Z0-9._*]+);/g,
    routes: /@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\(['\"](.*?)['\"]|@(GetMapping|PostMapping|PutMapping|DeleteMapping)\b/gi
  },
  go: {
    functions: /func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g,
    classes: /type\s+([a-zA-Z0-9_]+)\s+struct/g,
    imports: /import\s+\(\s*([\s\S]*?)\s*\)|import\s+["'](.*?)["']/g,
    routes: /r\.(GET|POST|PUT|DELETE|PATCH)\(['\"](.*?)['\"]|http\.Handle\(['\"](.*?)['"]/gi
  }
};

function getLanguageKey(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'py') return 'py';
  if (ext === 'java') return 'java';
  if (ext === 'go') return 'go';
  if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) return 'js';
  return 'js';
}

function calculateComplexity(code) {
  const matches = code.match(/\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g);
  return 1 + (matches ? matches.length : 0);
}

/**
 * Detect taint sources in a line of code
 */
function detectTaintSources(line) {
  return TAINT_SOURCE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Real Babel AST parser for JavaScript/TypeScript files.
 * Extracts functions, classes, imports, routes, and taint sources.
 */
function parseJavaScriptAST(filePath, content) {
  const functions = [];
  const classes = [];
  const imports = [];
  const routes = [];
  const taintSources = [];

  try {
    const ast = babelParser.parse(content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,   // don't throw on syntax errors, keep parsing
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'classStaticBlock',
        'dynamicImport',
        'exportDefaultFrom',
        'optionalChaining',
        'nullishCoalescingOperator'
      ]
    });

    const lines = content.split('\n');

    // Walk AST nodes
    walkAST(ast, (node) => {
      // -- Function declarations ----------------------------------------------
      if (node.type === 'FunctionDeclaration' && node.id?.name) {
        const params = (node.params || []).map(extractParamName).filter(Boolean).join(', ');
        const bodyText = content.slice(node.start, node.end);
        functions.push({
          name: node.id.name,
          params,
          complexity: calculateComplexity(bodyText),
          file: filePath,
          line: node.loc?.start?.line || 0,
          isAsync: node.async || false
        });
      }

      // -- Arrow functions & function expressions assigned to variables -------
      if (
        (node.type === 'VariableDeclarator' || node.type === 'AssignmentExpression') &&
        (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression') &&
        (node.id?.name || node.left?.name)
      ) {
        const fnNode = node.init;
        const name = node.id?.name || node.left?.name;
        const params = (fnNode.params || []).map(extractParamName).filter(Boolean).join(', ');
        const bodyText = content.slice(fnNode.start, fnNode.end);
        functions.push({
          name,
          params,
          complexity: calculateComplexity(bodyText),
          file: filePath,
          line: fnNode.loc?.start?.line || 0,
          isAsync: fnNode.async || false
        });
      }

      // -- Class methods ------------------------------------------------------
      if (node.type === 'ClassMethod' && node.key?.name) {
        const params = (node.params || []).map(extractParamName).filter(Boolean).join(', ');
        const bodyText = content.slice(node.start, node.end);
        functions.push({
          name: node.key.name,
          params,
          complexity: calculateComplexity(bodyText),
          file: filePath,
          line: node.loc?.start?.line || 0,
          isAsync: node.async || false,
          isMethod: true
        });
      }

      // -- Class declarations -------------------------------------------------
      if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id?.name) {
        classes.push({
          name: node.id.name,
          extends: node.superClass?.name || null,
          file: filePath,
          line: node.loc?.start?.line || 0
        });
      }

      // -- Import declarations ------------------------------------------------
      if (node.type === 'ImportDeclaration' && node.source?.value) {
        imports.push(node.source.value);
      }

      // -- CommonJS require() -------------------------------------------------
      if (
        node.type === 'CallExpression' &&
        node.callee?.name === 'require' &&
        node.arguments?.[0]?.value
      ) {
        imports.push(node.arguments[0].value);
      }

      // -- Express route declarations -----------------------------------------
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        ['get', 'post', 'put', 'delete', 'patch', 'use', 'all'].includes(node.callee.property?.name) &&
        ['app', 'router', 'api', 'server', 'express'].includes(node.callee.object?.name) &&
        node.arguments?.[0]?.value
      ) {
        routes.push({
          method: node.callee.property.name.toUpperCase(),
          path: node.arguments[0].value,
          file: filePath,
          line: node.loc?.start?.line || 0
        });
      }

      // -- Taint source detection ---------------------------------------------
      if (node.loc?.start?.line) {
        const lineNo = node.loc.start.line - 1;
        const lineText = lines[lineNo] || '';
        if (detectTaintSources(lineText) && !taintSources.find(t => t.line === lineNo + 1)) {
          taintSources.push({
            line: lineNo + 1,
            code: lineText.trim(),
            type: extractTaintSourceType(lineText)
          });
        }
      }
    });

  } catch (err) {
    console.warn(`[AST Parser] Babel parse error in ${filePath}: ${err.message}. Falling back to regex.`);
    return parseWithRegex(filePath, content, 'js');
  }

  return {
    filePath,
    language: filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'ts' : 'js',
    loc: content.split('\n').length,
    functions,
    classes,
    imports,
    routes,
    taintSources
  };
}

/**
 * Simple recursive AST walker (avoids needing @babel/traverse in ESM)
 */
function walkAST(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach(c => walkAST(c, visitor));
    } else if (child && typeof child === 'object' && child.type) {
      walkAST(child, visitor);
    }
  }
}

/**
 * Extracts a readable name from a Babel param node
 */
function extractParamName(param) {
  if (!param) return null;
  if (param.type === 'Identifier') return param.name;
  if (param.type === 'AssignmentPattern') return extractParamName(param.left);
  if (param.type === 'RestElement') return `...${extractParamName(param.argument)}`;
  if (param.type === 'ObjectPattern') return '{...}';
  if (param.type === 'ArrayPattern') return '[...]';
  if (param.type === 'TSParameterProperty') return extractParamName(param.parameter);
  return null;
}

/**
 * Identifies the taint source type from a line
 */
function extractTaintSourceType(line) {
  if (/req\.body/.test(line)) return 'HTTP_BODY';
  if (/req\.query/.test(line)) return 'HTTP_QUERY';
  if (/req\.params/.test(line)) return 'HTTP_PARAMS';
  if (/req\.headers/.test(line)) return 'HTTP_HEADERS';
  if (/req\.cookies/.test(line)) return 'HTTP_COOKIES';
  if (/process\.argv/.test(line)) return 'CLI_ARG';
  if (/process\.env/.test(line)) return 'ENV_VAR';
  if (/os\.environ|getenv/.test(line)) return 'ENV_VAR';
  return 'USER_INPUT';
}

/**
 * Regex-based fallback parser for Python, Java, Go
 */
function parseWithRegex(filePath, content, langKey) {
  const patterns = LANGUAGE_PATTERNS[langKey] || LANGUAGE_PATTERNS.py;
  const lines = content.split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const routes = [];
  const taintSources = [];

  let match;

  const fRegex = new RegExp(patterns.functions.source, patterns.functions.flags);
  while ((match = fRegex.exec(content)) !== null) {
    const name = match[1];
    const params = match[2] || '';
    if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
      functions.push({ name, params: params.trim(), complexity: calculateComplexity(match[0]), file: filePath });
    }
  }

  const cRegex = new RegExp(patterns.classes.source, patterns.classes.flags);
  while ((match = cRegex.exec(content)) !== null) {
    if (match[1]) classes.push({ name: match[1], extends: match[2] || null, file: filePath });
  }

  const iRegex = new RegExp(patterns.imports.source, patterns.imports.flags);
  while ((match = iRegex.exec(content)) !== null) {
    const imp = match[1] || match[2];
    if (imp) imports.push(imp.trim());
  }

  const rRegex = new RegExp(patterns.routes.source, patterns.routes.flags);
  while ((match = rRegex.exec(content)) !== null) {
    routes.push({ method: (match[1] || 'GET').toUpperCase(), path: match[2] || '/', file: filePath });
  }

  // Taint source scan (line-by-line for all languages)
  lines.forEach((line, idx) => {
    if (detectTaintSources(line)) {
      taintSources.push({ line: idx + 1, code: line.trim(), type: extractTaintSourceType(line) });
    }
  });

  return {
    filePath,
    language: langKey,
    loc: lines.length,
    functions,
    classes,
    imports,
    routes,
    taintSources
  };
}

/**
 * Main entry point: parse a file into AST symbols.
 * Uses Babel for JS/TS, regex fallback for Python/Java/Go.
 */
export function parseFileAST(filePath, content) {
  const langKey = getLanguageKey(filePath);
  if (langKey === 'js') {
    return parseJavaScriptAST(filePath, content);
  }
  return parseWithRegex(filePath, content, langKey);
}
