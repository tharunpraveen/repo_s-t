/**
 * backend/src/graph/graph_storage_interface.js
 * Industrial Pluggable Graph Storage Interface.
 * Standardizes multi-repository graph operations across Neo4j, PostgreSQL, SQLite, and In-Memory storage engines.
 */

export class GraphStorageInterface {
  async init() {
    throw new Error('Method init() must be implemented by Graph Storage Adapter.');
  }

  async clear(repoKey = null) {
    throw new Error('Method clear() must be implemented by Graph Storage Adapter.');
  }

  async addFileNode(filePath, language, loc, repoKey = 'default') {
    throw new Error('Method addFileNode() must be implemented by Graph Storage Adapter.');
  }

  async addFunctionNode(filePath, name, params, complexity, repoKey = 'default') {
    throw new Error('Method addFunctionNode() must be implemented by Graph Storage Adapter.');
  }

  async addClassNode(filePath, name, extendsClass, repoKey = 'default') {
    throw new Error('Method addClassNode() must be implemented by Graph Storage Adapter.');
  }

  async addEndpointNode(filePath, method, path, repoKey = 'default') {
    throw new Error('Method addEndpointNode() must be implemented by Graph Storage Adapter.');
  }

  async addVulnerabilityNode(vulnId, filePath, line, type, severity, owasp, patch, repoKey = 'default') {
    throw new Error('Method addVulnerabilityNode() must be implemented by Graph Storage Adapter.');
  }

  async addTestCaseNode(testId, testFile, targetFile, testCount, code, repoKey = 'default') {
    throw new Error('Method addTestCaseNode() must be implemented by Graph Storage Adapter.');
  }

  async addEdge(sourceId, targetId, relationship, properties = {}) {
    throw new Error('Method addEdge() must be implemented by Graph Storage Adapter.');
  }

  async extractSubgraph(targetFile, maxTokenBudget = 6000, repoKey = 'default') {
    throw new Error('Method extractSubgraph() must be implemented by Graph Storage Adapter.');
  }

  async exportGraphJSON(repoKey = null) {
    throw new Error('Method exportGraphJSON() must be implemented by Graph Storage Adapter.');
  }
}
