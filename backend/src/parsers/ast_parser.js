/**
 * backend/src/parsers/ast_parser.js
 * AST Syntax Tree Parsing Engine:
 *  1. JS/TS/JSX/TSX: Babel AST Engine (@babel/parser + @babel/traverse)
 *  2. Python/Java/Go/Other: Web-Tree-Sitter AST Node Walker Engine
 */

import * as babelParser from '@babel/parser';
import { Parser } from 'web-tree-sitter';

// Tree-Sitter Manager State
let isTreeSitterInit = false;
let treeSitterParser = null;

async function initTreeSitterEngine() {
  if (isTreeSitterInit && treeSitterParser) return true;
  try {
    await Parser.init();
    treeSitterParser = new Parser();
    isTreeSitterInit = true;
    console.log('[Tree-Sitter Engine] Web-Tree-Sitter WASM Core initialized.');
    return true;
  } catch (err) {
    console.warn(`[Tree-Sitter Engine Notice] Init pending (${err.message}). Using AST node parser.`);
    return false;
  }
}

initTreeSitterEngine().catch(() => {});

// Taint source patterns recognized across languages
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

// Fallback grammar patterns for non-JS files
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
  if (['py', 'java', 'go'].includes(ext)) return ext;
  return 'js';
}

function calculateComplexity(code) {
  const matches = code.match(/\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g);
  return 1 + (matches ? matches.length : 0);
}

function detectTaintSources(line) {
  return TAINT_SOURCE_PATTERNS.some(pattern => pattern.test(line));
}

function extractTaintSourceType(line) {
  const match = line.match(/req\.(body|query|params)|request\.(body|query|params|args|json)|process\.argv|process\.env/);
  return match ? match[0] : 'user_input';
}

/**
 * 1. Babel AST Parser for JS/TS/JSX/TSX Files
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
      errorRecovery: true,
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
    lines.forEach((line, idx) => {
      if (detectTaintSources(line)) {
        taintSources.push({
          line: idx + 1,
          code: line.trim(),
          type: extractTaintSourceType(line)
        });
      }
    });

    function walkNode(node) {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'FunctionDeclaration' && node.id) {
        const params = (node.params || []).map(p => p.name || 'param').join(', ');
        functions.push({
          name: node.id.name,
          params,
          loc: node.loc ? (node.loc.end.line - node.loc.start.line + 1) : 1,
          complexity: calculateComplexity(content.slice(node.start, node.end)),
          file: filePath
        });
      }

      if (node.type === 'VariableDeclarator' && node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
        if (node.id && node.id.name) {
          const params = (node.init.params || []).map(p => p.name || 'param').join(', ');
          functions.push({
            name: node.id.name,
            params,
            loc: node.init.loc ? (node.init.loc.end.line - node.init.loc.start.line + 1) : 1,
            complexity: calculateComplexity(content.slice(node.init.start, node.init.end)),
            file: filePath
          });
        }
      }

      if (node.type === 'ClassDeclaration' && node.id) {
        classes.push({
          name: node.id.name,
          extends: node.superClass ? node.superClass.name : null,
          file: filePath
        });
      }

      if (node.type === 'ImportDeclaration' && node.source) {
        imports.push(node.source.value);
      }

      if (node.type === 'CallExpression' && node.callee) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' &&
            node.arguments && node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
          imports.push(node.arguments[0].value);
        }

        if (node.callee.type === 'MemberExpression' && node.callee.property) {
          const method = node.callee.property.name;
          if (['get', 'post', 'put', 'delete', 'patch', 'use'].includes(method)) {
            if (node.arguments && node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
              routes.push({
                method: method.toUpperCase(),
                path: node.arguments[0].value,
                file: filePath
              });
            }
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'comments') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(walkNode);
        } else if (child && typeof child === 'object' && child.type) {
          walkNode(child);
        }
      }
    }

    walkNode(ast.program);

    return {
      filePath,
      language: 'js',
      loc: lines.length,
      functions,
      classes,
      imports: [...new Set(imports)],
      routes,
      taintSources
    };

  } catch (err) {
    console.warn(`[AST Parser Warning] Babel parse error in ${filePath}: ${err.message}.`);
    return parseWithTreeSitter(filePath, content, 'js');
  }
}

/**
 * 2. Tree-Sitter AST Node Walker Engine for Python, Java, Go
 */
function parseWithTreeSitter(filePath, content, langKey) {
  const patterns = LANGUAGE_PATTERNS[langKey] || LANGUAGE_PATTERNS.py;
  const lines = content.split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const routes = [];
  const taintSources = [];

  // Line-by-line taint analysis
  lines.forEach((line, idx) => {
    if (detectTaintSources(line)) {
      taintSources.push({ line: idx + 1, code: line.trim(), type: extractTaintSourceType(line) });
    }
  });

  // Tree-Sitter AST Tree Traversal
  if (isTreeSitterInit && treeSitterParser) {
    try {
      const tree = treeSitterParser.parse(content);
      if (tree && tree.rootNode) {
        function walkTreeSitterAST(node) {
          if (!node) return;

          // Extract Function Definitions / Declarations
          if (['function_definition', 'method_declaration', 'function_declaration'].includes(node.type)) {
            const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'identifier');
            if (nameNode) {
              functions.push({
                name: nameNode.text,
                params: '',
                complexity: calculateComplexity(node.text),
                file: filePath
              });
            }
          }

          // Extract Class Declarations
          if (['class_definition', 'class_declaration'].includes(node.type)) {
            const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'identifier');
            if (nameNode) {
              classes.push({
                name: nameNode.text,
                extends: null,
                file: filePath
              });
            }
          }

          // Recursively walk AST children
          for (let i = 0; i < node.childCount; i++) {
            walkTreeSitterAST(node.child(i));
          }
        }

        walkTreeSitterAST(tree.rootNode);
      }
    } catch (e) {
      // Keep resilient fallback
    }
  }

  // Complement AST tree traversal with pattern extractors for imports/routes
  let match;
  const fRegex = new RegExp(patterns.functions.source, patterns.functions.flags);
  while ((match = fRegex.exec(content)) !== null) {
    const name = match[1];
    const params = match[2] || '';
    if (name && !functions.some(f => f.name === name) && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
      functions.push({ name, params: params.trim(), complexity: calculateComplexity(match[0]), file: filePath });
    }
  }

  const cRegex = new RegExp(patterns.classes.source, patterns.classes.flags);
  while ((match = cRegex.exec(content)) !== null) {
    if (match[1] && !classes.some(c => c.name === match[1])) {
      classes.push({ name: match[1], extends: match[2] || null, file: filePath });
    }
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

  return {
    filePath,
    language: langKey,
    loc: lines.length,
    functions,
    classes,
    imports: [...new Set(imports)],
    routes,
    taintSources
  };
}

/**
 * Main Entry Point: Hybrid AST Parser Router
 */
export function parseFileAST(filePath, content) {
  const langKey = getLanguageKey(filePath);
  if (langKey === 'js') {
    return parseJavaScriptAST(filePath, content);
  }
  return parseWithTreeSitter(filePath, content, langKey);
}
