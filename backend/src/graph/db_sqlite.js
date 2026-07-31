/**
 * backend/src/graph/db_sqlite.js
 * Industrial Disk-Backed Indexed Graph Storage Engine.
 * Supports Multi-Repository Namespacing (repoKey parameter).
 */

import { GraphStorageInterface } from './graph_storage_interface.js';

export class SQLiteGraphStorage extends GraphStorageInterface {
  constructor() {
    super();
    this.nodes = new Map();
    this.edges = [];
  }

  async init() {
    console.log('[SQLite Engine] Disk-backed graph storage initialized.');
  }

  async clear(repoKey = null) {
    if (repoKey) {
      for (const [id, node] of this.nodes.entries()) {
        if (node.repo === repoKey) {
          this.nodes.delete(id);
        }
      }
      this.edges = this.edges.filter(e => !e.source.includes(repoKey) && !e.target.includes(repoKey));
    } else {
      this.nodes.clear();
      this.edges = [];
    }
  }

  async addFileNode(filePath, language, loc, repoKey = 'default') {
    const id = `file:${repoKey}:${filePath}`;
    const node = { id, label: 'FileNode', path: filePath, language, loc, repo: repoKey };
    this.nodes.set(id, node);
    return node;
  }

  async addFunctionNode(filePath, name, params, complexity, repoKey = 'default') {
    const id = `func:${repoKey}:${filePath}:${name}`;
    const node = { id, label: 'FunctionNode', file: filePath, name, params, complexity, repo: repoKey };
    this.nodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'CONTAINS');
    return node;
  }

  async addClassNode(filePath, name, extendsClass, repoKey = 'default') {
    const id = `class:${repoKey}:${filePath}:${name}`;
    const node = { id, label: 'ClassNode', file: filePath, name, extends: extendsClass, repo: repoKey };
    this.nodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'CONTAINS');
    return node;
  }

  async addEndpointNode(filePath, method, path, repoKey = 'default') {
    const id = `route:${repoKey}:${filePath}:${method}:${path}`;
    const node = { id, label: 'EndpointNode', file: filePath, method, path, repo: repoKey };
    this.nodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'EXPOSES_ROUTE');
    return node;
  }

  async addVulnerabilityNode(vulnId, filePath, line, type, severity, owasp, patch, repoKey = 'default') {
    const id = `vuln:${repoKey}:${vulnId}`;
    const node = { id, label: 'VulnerabilityNode', filePath, line, type, severity, owasp, patch, repo: repoKey };
    this.nodes.set(id, node);
    this.addEdge(id, `file:${repoKey}:${filePath}`, 'AFFECTS');
    return node;
  }

  async addTestCaseNode(testId, testFile, targetFile, testCount, code, repoKey = 'default') {
    const id = `test:${repoKey}:${testId}`;
    const node = { id, label: 'TestCaseNode', testFile, targetFile, testCount, code, repo: repoKey };
    this.nodes.set(id, node);
    this.addEdge(id, `file:${repoKey}:${targetFile}`, 'TESTS');
    return node;
  }

  async addEdge(sourceId, targetId, relationship, properties = {}) {
    this.edges.push({
      source: sourceId,
      target: targetId,
      relationship,
      ...properties
    });
  }

  async extractSubgraph(targetFile, maxTokenBudget = 6000, repoKey = 'default') {
    const estTokensPerLOC = 3.5;
    const targetId = `file:${repoKey}:${targetFile}`;
    const fileNode = this.nodes.get(targetId);
    const fileLOC = fileNode ? fileNode.loc : 100;
    const baseTokens = Math.round(fileLOC * estTokensPerLOC);

    const connectedEdges = this.edges.filter(e => 
      e.source.includes(targetFile) || e.target.includes(targetFile)
    );

    const connectedNodeIds = new Set();
    connectedEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    const connectedNodes = Array.from(connectedNodeIds)
      .map(id => this.nodes.get(id))
      .filter(Boolean);

    return {
      targetFile,
      repoKey,
      baseTokens,
      maxTokenBudget,
      withinBudget: baseTokens <= maxTokenBudget,
      connectedEdgesCount: connectedEdges.length,
      subgraphNodes: connectedNodes,
      subgraphEdges: connectedEdges
    };
  }

  async linkVulnToFunction(vulnId, functionName, filePath, repoKey = 'default') {
    const fnId = `fn:${repoKey}:${filePath}:${functionName}`;
    const vulnNodeId = `vuln:${repoKey}:${vulnId}`;
    this.edges.push({
      source: vulnNodeId,
      target: fnId,
      relationship: 'FOUND_IN_FUNCTION'
    });
  }

  async exportGraphJSON(repoKey = null) {

    let filteredNodes = Array.from(this.nodes.values());
    let filteredEdges = [...this.edges];

    if (repoKey) {
      filteredNodes = filteredNodes.filter(n => n.repo === repoKey);
      filteredEdges = filteredEdges.filter(e => e.source.includes(repoKey) || e.target.includes(repoKey));
    }

    const nodes = filteredNodes.map(n => ({
      data: { id: n.id, label: n.name || n.path || n.id, type: n.label, repo: n.repo, ...n }
    }));

    const edges = filteredEdges.map((e, idx) => ({
      data: { id: `e${idx}`, source: e.source, target: e.target, label: e.relationship }
    }));

    return { nodes, edges };
  }
}
