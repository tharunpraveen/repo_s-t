/**
 * generate_pdf_documentation.js
 * Generates an Enterprise Architecture & Framework Documentation PDF.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const pdfPath = 'GitHub_AI_Platform_Architecture_Documentation.pdf';
const doc = new PDFDocument({ margin: 50, size: 'A4' });
const writeStream = fs.createWriteStream(pdfPath);

doc.pipe(writeStream);

// Colors
const primaryColor = '#1e293b'; // Slate 800
const accentColor = '#2563eb';  // Blue 600
const secondaryColor = '#0f172a';// Slate 900
const textColor = '#334155';     // Slate 700

// Helper functions
function addHeader(title, subtitle = '') {
  doc.fillColor(accentColor).fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' });
  if (subtitle) {
    doc.fillColor('#64748b').fontSize(12).font('Helvetica').text(subtitle, { align: 'center' });
  }
  doc.moveDown(1.5);
}

function addSectionTitle(title) {
  doc.moveDown(1);
  doc.fillColor(secondaryColor).fontSize(15).font('Helvetica-Bold').text(title);
  doc.rect(50, doc.y + 2, 495, 2).fill('#3b82f6');
  doc.moveDown(0.8);
}

function addParagraph(text) {
  doc.fillColor(textColor).fontSize(10).font('Helvetica').text(text, { align: 'justify', lineGap: 3 });
  doc.moveDown(0.5);
}

function addBullet(title, text) {
  doc.fillColor(secondaryColor).fontSize(10).font('Helvetica-Bold').text(`• ${title}: `, { continued: true });
  doc.fillColor(textColor).font('Helvetica').text(text);
  doc.moveDown(0.3);
}

// Page 1: Title & Executive Overview
addHeader('GitHub AI Code Scanning & Test Synthesizer', 'Enterprise Multi-Agent System Architecture & Technical Documentation');

addSectionTitle('1. Executive System Overview');
addParagraph('The GitHub AI Code Scanning & Test Suite Synthesizer Platform is an autonomous multi-agent AI system designed to ingest, parse, analyze, index, audit, and synthesize comprehensive industrial test suites for any public GitHub repository.');
addParagraph('Operating on a 7-Node StateGraph Workflow (powered by LangGraph) and a Graph-RAG Knowledge Base (stored natively in Neo4j), the platform parses Babel AST dependencies, tracks Taint Data Flow, audits OWASP Top 10 vulnerabilities, scans dependency CVEs, detects secret leaks, probes dynamic runtime API routes (DAST), and synthesizes 7 distinct testing categories.');

addSectionTitle('2. Technology Stack & Frameworks Used');
addBullet('LangGraph (@langchain/langgraph)', 'Orchestrates the 7-Node StateGraph Multi-Agent execution pipeline with parallel security branching and state convergence.');
addBullet('Babel AST Parser (@babel/parser)', 'Parses JavaScript and TypeScript source files into Abstract Syntax Trees, walking nodes for functions, imports, routes, and taint sources.');
addBullet('Neo4j Cypher Engine (neo4j-driver)', 'Stores code topological relationships (:File, :Function, :Class, :Endpoint, :Vulnerability) using native Cypher graph queries (bolt://127.0.0.1:7687).');
addBullet('SQLite Graph Fallback', 'Disk-backed in-memory property graph engine providing zero-crash resilience if Neo4j is offline.');
addBullet('Google Gemini 2.5 API', 'Generates AI security code audits and context-aware unit test suites under Graph-RAG token budget constraints.');
addBullet('Backend Web Server (Express.js)', 'Node.js REST API server managing asynchronous job submission, status polling, and CORS security.');
addBullet('Frontend Web App (Next.js 14)', 'React-based enterprise dark-mode interactive dashboard with live percentage progress polling.');

// Page 2: Multi-Agent Pipeline Architecture
doc.addPage();
addSectionTitle('3. LangGraph Multi-Agent Pipeline Architecture (7 Nodes)');
addParagraph('The platform organizes execution into 7 decoupled agent nodes with parallel security branching:');

addBullet('Node 1 (ingestRepo)', 'Streams repository zipball archives from GitHub API and ranks files by topological PageRank centrality.');
addBullet('Node 2 (parseAST)', 'Extracts AST symbols, function signatures, cyclomatic complexity, API routes, and user input taint sources (req.body, req.query, req.params).');
addBullet('Node 3 (indexGraph)', 'Populates Neo4j graph storage with node labels and relationships (:CONTAINS, :EXPOSES_ROUTE, :IMPORTS).');
addBullet('Node 4 (runSASTAuditor - Parallel)', 'Executes 18 OWASP Top 10 SAST rules and tracks Taint Data Flow to dangerous sinks (SQLi, Exec, Path Traversal, SSRF, XSS, NoSQLi).');
addBullet('Node 4.5 (runDependencyScan - Parallel)', 'Queries OSV.dev API (v1/querybatch) to detect known package CVE vulnerabilities.');
addBullet('Node 4.6 (runSecretScan - Parallel)', 'Scans codebase patterns for leaked AWS secret keys, RSA blocks, PATs, Stripe keys, and DB strings.');
addBullet('Node 4.7 (runDASTScan - Parallel)', 'Fires live dynamic HTTP security probes against exposed API routes.');
addBullet('Convergence Node (mergeSecurityResults)', 'Combines parallel findings from SAST, Taint, CVEs, Secrets, and DAST into a single unified security audit.');
addBullet('Node 5 (synthesizeTests)', 'Invokes modular generator modules to synthesize 7 industrial testing categories.');

// Page 3: 7 Testing Categories & Graph Schema
doc.addPage();
addSectionTitle('4. 7 Industrial Testing Categories Synthesized');
addBullet('1. Unit Testing', 'Function parameter boundaries and logic assertions (Jest / PyTest).');
addBullet('2. Functional Testing', 'End-to-End user workflows and supertest API endpoint suites.');
addBullet('3. Integration Testing', 'Cross-module interaction test suites derived from Neo4j import graph.');
addBullet('4. Regression Testing', 'Snapshot baseline assertions (toMatchSnapshot()) to prevent breaking changes.');
addBullet('5. Performance Testing', 'Autocannon 100-virtual user load tests and execution latency SLAs.');
addBullet('6. Intelligent Fuzzing', 'Exploratory AI boundary fuzzers testing type coercion ("100" vs 100), NaN, and empty bounds.');
addBullet('7. Security Testing', '[EXPLOIT PROBE] malicious payloads and [GUARD CHECK] validation assertions.');

addSectionTitle('5. Code Knowledge Graph Schema (Neo4j Graph-RAG)');
addParagraph('Nodes & Edge Relationships stored in graph storage:');
addBullet('Node Labels', ':File, :Function, :Class, :Endpoint, :Vulnerability, :TestCase');
addBullet('Edge Relationships', '(:File)-[:CONTAINS]->(:Function), (:File)-[:IMPORTS]->(:File), (:File)-[:EXPOSES_ROUTE]->(:Endpoint), (:Vulnerability)-[:FOUND_IN_FUNCTION]->(:Function)');

addSectionTitle('6. GitHub Repository & Deployment');
addBullet('GitHub Repository', 'https://github.com/tharunpraveen/repo_s-t');
addBullet('Target Branch', 'main');
addBullet('Backend API', 'http://localhost:3002 (Express API Server)');
addBullet('Frontend UI', 'http://localhost:3003 (Next.js Interactive Dashboard)');

// Finalize PDF
doc.end();

writeStream.on('finish', () => {
  console.log(`✅ Documentation PDF successfully generated: ${pdfPath}`);
});
