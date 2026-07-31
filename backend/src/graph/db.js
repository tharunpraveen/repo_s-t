/**
 * backend/src/graph/db.js
 * Pluggable Enterprise Knowledge Graph Engine Factory Manager.
 * Supports Multi-Repository Namespacing across Neo4j, PostgreSQL, and SQLite.
 */

import { Neo4jGraphStorage } from './db_neo4j.js';
import { SQLiteGraphStorage } from './db_sqlite.js';

class CodeKnowledgeGraphManager {
  constructor() {
    this.storage = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized && this.storage) return;

    if (process.env.NEO4J_URI || process.env.NEO4J_URL) {
      console.log('[Graph Factory] Initializing Neo4j Native Cypher Graph Storage...');
      this.storage = new Neo4jGraphStorage();
    } else {
      console.log('[Graph Factory] Initializing Industrial Disk-Backed Graph Storage Engine...');
      this.storage = new SQLiteGraphStorage();
    }

    await this.storage.init();
    this.initialized = true;
  }

  async clear(repoKey = null) {
    await this.ensureInitialized();
    return this.storage.clear(repoKey);
  }

  async addFileNode(filePath, language, loc, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addFileNode(filePath, language, loc, repoKey);
  }

  async addFunctionNode(filePath, name, params, complexity, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addFunctionNode(filePath, name, params, complexity, repoKey);
  }

  async addClassNode(filePath, name, extendsClass, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addClassNode(filePath, name, extendsClass, repoKey);
  }

  async addEndpointNode(filePath, method, path, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addEndpointNode(filePath, method, path, repoKey);
  }

  async addVulnerabilityNode(vulnId, filePath, line, type, severity, owasp, patch, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addVulnerabilityNode(vulnId, filePath, line, type, severity, owasp, patch, repoKey);
  }

  async linkVulnToFunction(vulnId, functionName, filePath, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.linkVulnToFunction(vulnId, functionName, filePath, repoKey);
  }

  async addTestCaseNode(testId, testFile, targetFile, testCount, code, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.addTestCaseNode(testId, testFile, targetFile, testCount, code, repoKey);
  }

  async addEdge(sourceId, targetId, relationship, properties = {}) {
    await this.ensureInitialized();
    return this.storage.addEdge(sourceId, targetId, relationship, properties);
  }

  async extractSubgraph(targetFile, maxTokenBudget = 6000, repoKey = 'default') {
    await this.ensureInitialized();
    return this.storage.extractSubgraph(targetFile, maxTokenBudget, repoKey);
  }

  async exportGraphJSON(repoKey = null) {
    await this.ensureInitialized();
    return this.storage.exportGraphJSON(repoKey);
  }
}

export const globalKnowledgeGraph = new CodeKnowledgeGraphManager();
