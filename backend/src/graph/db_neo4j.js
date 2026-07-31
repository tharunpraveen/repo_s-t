/**
 * backend/src/graph/db_neo4j.js
 * Industrial Neo4j & Memgraph Native Cypher Graph Storage Engine.
 * Supports Multi-Repository Namespacing (repo property & namespaced node IDs).
 */

import { GraphStorageInterface } from './graph_storage_interface.js';

export class Neo4jGraphStorage extends GraphStorageInterface {
  constructor(uri, user, password) {
    super();
    this.uri = uri || process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
    this.user = user || process.env.NEO4J_USER || 'neo4j';
    this.password = password || process.env.NEO4J_PASSWORD || 'Tharun@1729';
    this.driver = null;
    this.fallbackNodes = new Map();
    this.fallbackEdges = [];
    this.isConnected = false;
  }

  async init() {
    try {
      const neo4j = await import('neo4j-driver');
      let effectiveUri = this.uri;
      // Convert neo4j:// to bolt:// for standalone local Neo4j instances to avoid routing discovery warnings
      if (effectiveUri.startsWith('neo4j://127.0.0.1') || effectiveUri.startsWith('neo4j://localhost')) {
        effectiveUri = effectiveUri.replace('neo4j://', 'bolt://');
      }
      this.driver = neo4j.default.driver(
        effectiveUri,
        neo4j.default.auth.basic(this.user, this.password),
        { maxConnectionPoolSize: 50 }
      );
      await this.driver.verifyConnectivity();
      this.isConnected = true;
      console.log(`[Neo4j Engine] Connected successfully to Neo4j database at ${effectiveUri}`);
      await this.initIndexes();
    } catch (err) {
      console.warn(`[Neo4j Engine Warning] Could not connect to Neo4j at ${this.uri} (${err.message}). Using in-memory property graph fallback.`);
      this.isConnected = false;
    }
  }

  async initIndexes() {
    if (!this.isConnected || !this.driver) return;
    const session = this.driver.session();
    try {
      await session.run(`CREATE CONSTRAINT file_id_unique IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE`);
      await session.run(`CREATE CONSTRAINT func_id_unique IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE`);
      await session.run(`CREATE CONSTRAINT class_id_unique IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE`);
      await session.run(`CREATE CONSTRAINT route_id_unique IF NOT EXISTS FOR (e:Endpoint) REQUIRE e.id IS UNIQUE`);
      await session.run(`CREATE INDEX func_name_idx IF NOT EXISTS FOR (fn:Function) ON (fn.name)`);
      console.log('[Neo4j Engine] High-performance indexes & unique constraints initialized.');
    } catch (err) {
      // Ignored for compatibility
    } finally {
      await session.close();
    }
  }



  async clear(repoKey = null) {
    if (repoKey) {
      // Clear fallback nodes for specific repo
      for (const [id, node] of this.fallbackNodes.entries()) {
        if (node.repo === repoKey) {
          this.fallbackNodes.delete(id);
        }
      }
      this.fallbackEdges = this.fallbackEdges.filter(e => !e.source.includes(repoKey) && !e.target.includes(repoKey));
    } else {
      this.fallbackNodes.clear();
      this.fallbackEdges = [];
    }

    if (!this.isConnected || !this.driver) return;

    const session = this.driver.session();
    try {
      if (repoKey) {
        await session.run('MATCH (n {repo: $repoKey}) DETACH DELETE n', { repoKey });
      } else {
        await session.run('MATCH (n) DETACH DELETE n');
      }
    } catch (err) {
      console.error('[Neo4j Clear Error]:', err.message);
    } finally {
      await session.close();
    }
  }

  async addFileNode(filePath, language, loc, repoKey = 'default') {
    const id = `file:${repoKey}:${filePath}`;
    const node = { id, label: 'FileNode', path: filePath, language, loc, repo: repoKey };
    this.fallbackNodes.set(id, node);

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MERGE (f:File {id: $id})
           SET f.path = $filePath, f.language = $language, f.loc = $loc, f.repo = $repoKey`,
          { id, filePath, language, loc, repoKey }
        );
      } catch (err) {
        console.error('[Neo4j addFileNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }

  async addFunctionNode(filePath, name, params, complexity, meta = {}, repoKey = 'default') {
    const id = `func:${repoKey}:${filePath}:${name}`;
    const returnType = meta.returnType || 'any';
    const comments = meta.comments || '';
    const isAsync = meta.async || false;
    const node = { id, label: 'FunctionNode', file: filePath, name, params, complexity, returnType, comments, isAsync, repo: repoKey };
    this.fallbackNodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'CONTAINS');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (fn:Function {id: $id})
           SET fn.name = $name, fn.params = $params, fn.complexity = $complexity, 
               fn.returnType = $returnType, fn.comments = $comments, fn.isAsync = $isAsync,
               fn.file = $filePath, fn.repo = $repoKey
           MERGE (f)-[:CONTAINS]->(fn)`,
          { fileId: `file:${repoKey}:${filePath}`, id, name, params: params || '', complexity: complexity || 1, returnType, comments, isAsync, filePath, repoKey }
        );
      } catch (err) {
        console.error('[Neo4j addFunctionNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }

  async addClassNode(filePath, name, extendsClass, methods = [], repoKey = 'default') {
    const id = `class:${repoKey}:${filePath}:${name}`;
    const node = { id, label: 'ClassNode', file: filePath, name, extends: extendsClass, methods, repo: repoKey };
    this.fallbackNodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'CONTAINS');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (c:Class {id: $id})
           SET c.name = $name, c.extends = $extendsClass, c.file = $filePath, c.repo = $repoKey
           MERGE (f)-[:CONTAINS]->(c)`,
          { fileId: `file:${repoKey}:${filePath}`, id, name, extendsClass: extendsClass || '', filePath, repoKey }
        );

        if (extendsClass) {
          await session.run(
            `MATCH (c1:Class {id: $id}), (c2:Class {name: $extendsClass})
             MERGE (c1)-[:EXTENDS]->(c2)`,
            { id, extendsClass }
          );
        }

        for (const mName of methods) {
          const fnId = `func:${repoKey}:${filePath}:${mName}`;
          await session.run(
            `MATCH (c:Class {id: $id}), (fn:Function {id: $fnId})
             MERGE (c)-[:HAS_METHOD]->(fn)`,
            { id, fnId }
          );
        }
      } catch (err) {
        console.error('[Neo4j addClassNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }


  async addEndpointNode(filePath, method, path, repoKey = 'default') {
    const id = `route:${repoKey}:${filePath}:${method}:${path}`;
    const node = { id, label: 'EndpointNode', file: filePath, method, path, repo: repoKey };
    this.fallbackNodes.set(id, node);
    this.addEdge(`file:${repoKey}:${filePath}`, id, 'EXPOSES_ROUTE');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (r:Endpoint {id: $id})
           SET r.method = $method, r.path = $path, r.file = $filePath, r.repo = $repoKey
           MERGE (f)-[:EXPOSES_ROUTE]->(r)`,
          { fileId: `file:${repoKey}:${filePath}`, id, method, path, filePath, repoKey }
        );
      } catch (err) {
        console.error('[Neo4j addEndpointNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }

  async addCallEdge(callerFile, callerName, calleeName, repoKey = 'default') {
    const callerId = `func:${repoKey}:${callerFile}:${callerName}`;
    this.addEdge(callerId, `func:${repoKey}:${calleeName}`, 'CALLS');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (caller:Function {id: $callerId})
           MATCH (callee:Function {name: $calleeName})
           MERGE (caller)-[:CALLS]->(callee)`,
          { callerId, calleeName }
        );
      } catch (err) {
      } finally {
        await session.close();
      }
    }
  }


  async addVulnerabilityNode(vulnId, filePath, line, type, severity, owasp, patch, repoKey = 'default') {
    const id = `vuln:${repoKey}:${vulnId}`;
    const node = { id, label: 'VulnerabilityNode', filePath, line, type, severity, owasp, patch, repo: repoKey };
    this.fallbackNodes.set(id, node);
    this.addEdge(id, `file:${repoKey}:${filePath}`, 'AFFECTS');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (v:Vulnerability {id: $id})
           SET v.vulnId = $vulnId, v.line = $line, v.type = $type, v.severity = $severity, v.owasp = $owasp, v.patch = $patch, v.repo = $repoKey
           MERGE (v)-[:AFFECTS]->(f)`,
          { fileId: `file:${repoKey}:${filePath}`, id, vulnId, line, type, severity, owasp, patch: typeof patch === 'string' ? patch : JSON.stringify(patch), repoKey }
        );
      } catch (err) {
        console.error('[Neo4j addVulnerabilityNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }

  /**
   * NEW: Links a Vulnerability node to the Function it was found in.
   * Creates the graph pattern:
   *   (Vulnerability)-[:FOUND_IN_FUNCTION]->(Function)-[:BELONGS_TO]->(File)
   *
   * @param {string} vulnId - Vulnerability ID (e.g. SEC-01-1)
   * @param {string} functionName - Name of the containing function
   * @param {string} filePath - File where both reside
   * @param {string} repoKey - Repository namespace
   */
  async linkVulnToFunction(vulnId, functionName, filePath, repoKey = 'default') {
    const vulnNodeId = `vuln:${repoKey}:${vulnId}`;
    const funcNodeId = `func:${repoKey}:${filePath}:${functionName}`;

    // Fallback in-memory edge
    this.fallbackEdges.push({
      source: vulnNodeId,
      target: funcNodeId,
      relationship: 'FOUND_IN_FUNCTION'
    });

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (v:Vulnerability {id: $vulnId})
           MATCH (fn:Function {id: $funcId})
           MERGE (v)-[:FOUND_IN_FUNCTION]->(fn)`,
          { vulnId: vulnNodeId, funcId: funcNodeId }
        );
      } catch (err) {
        // Soft fail - function node may not exist if file had no parsed functions
      } finally {
        await session.close();
      }
    }
  }

  async addTestCaseNode(testId, testFile, targetFile, testCount, code, repoKey = 'default') {
    const id = `test:${repoKey}:${testId}`;
    const node = { id, label: 'TestCaseNode', testFile, targetFile, testCount, code, repo: repoKey };
    this.fallbackNodes.set(id, node);
    this.addEdge(id, `file:${repoKey}:${targetFile}`, 'TESTS');

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (f:File {id: $targetFileId})
           MERGE (t:TestCase {id: $id})
           SET t.testFile = $testFile, t.targetFile = $targetFile, t.testCount = $testCount, t.code = $code, t.repo = $repoKey
           MERGE (t)-[:TESTS]->(f)`,
          { targetFileId: `file:${repoKey}:${targetFile}`, id, testFile, targetFile, testCount, code, repoKey }
        );
      } catch (err) {
        console.error('[Neo4j addTestCaseNode Error]:', err.message);
      } finally {
        await session.close();
      }
    }
    return node;
  }

  async addEdge(sourceId, targetId, relationship, properties = {}) {
    this.fallbackEdges.push({ source: sourceId, target: targetId, relationship, ...properties });

    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `MATCH (a {id: $sourceId}), (b {id: $targetId})
           MERGE (a)-[r:${relationship}]->(b)`,
          { sourceId, targetId }
        );
      } catch (err) {
        // Soft fail
      } finally {
        await session.close();
      }
    }
  }

  async extractSubgraph(targetFile, maxTokenBudget = 6000, repoKey = 'default') {
    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        const targetId = `file:${repoKey}:${targetFile}`;
        const result = await session.run(
          `MATCH (f:File {id: $targetId})
           OPTIONAL MATCH (f)-[r]-(connected)
           RETURN f, collect(distinct connected) as connectedNodes, collect(distinct r) as connectedRels`,
          { targetId }
        );

        if (result.records.length > 0) {
          const rec = result.records[0];
          const fileProps = rec.get('f')?.properties || {};
          const estTokensPerLOC = 3.5;
          const fileLOC = fileProps.loc || 100;
          const baseTokens = Math.round(fileLOC * estTokensPerLOC);

          const rawNodes = rec.get('connectedNodes') || [];
          const rawRels = rec.get('connectedRels') || [];

          const subgraphNodes = rawNodes.map(n => n.properties);
          const subgraphEdges = rawRels.map(r => ({
            source: r.properties.source || targetId,
            target: r.properties.target || targetId,
            relationship: r.type
          }));

          return {
            targetFile,
            repoKey,
            baseTokens,
            maxTokenBudget,
            withinBudget: baseTokens <= maxTokenBudget,
            connectedEdgesCount: subgraphEdges.length,
            subgraphNodes,
            subgraphEdges
          };
        }
      } catch (err) {
        console.error('[Neo4j extractSubgraph Error]:', err.message);
      } finally {
        await session.close();
      }
    }

    // In-memory fallback
    const estTokensPerLOC = 3.5;
    const targetId = `file:${repoKey}:${targetFile}`;
    const fileNode = this.fallbackNodes.get(targetId);
    const fileLOC = fileNode ? fileNode.loc : 100;
    const baseTokens = Math.round(fileLOC * estTokensPerLOC);

    const connectedEdges = this.fallbackEdges.filter(e => 
      e.source.includes(targetFile) || e.target.includes(targetFile)
    );

    const connectedNodeIds = new Set();
    connectedEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    const connectedNodes = Array.from(connectedNodeIds)
      .map(id => this.fallbackNodes.get(id))
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

  async exportGraphJSON(repoKey = null) {
    if (this.isConnected && this.driver) {
      const session = this.driver.session();
      try {
        const nodeQuery = repoKey
          ? 'MATCH (n {repo: $repoKey}) RETURN n, labels(n) as labels'
          : 'MATCH (n) RETURN n, labels(n) as labels';

        const edgeQuery = repoKey
          ? 'MATCH (a {repo: $repoKey})-[r]->(b) RETURN a.id as source, b.id as target, type(r) as label'
          : 'MATCH (a)-[r]->(b) RETURN a.id as source, b.id as target, type(r) as label';

        const nodeRes = await session.run(nodeQuery, { repoKey });
        const edgeRes = await session.run(edgeQuery, { repoKey });

        const nodes = nodeRes.records.map(rec => {
          const props = rec.get('n').properties;
          const labels = rec.get('labels');
          return {
            data: {
              id: props.id,
              label: props.name || props.path || props.vulnId || props.id,
              type: labels[0] ? `${labels[0]}Node` : 'Node',
              ...props
            }
          };
        });

        const edges = edgeRes.records.map((rec, idx) => ({
          data: {
            id: `e${idx}`,
            source: rec.get('source'),
            target: rec.get('target'),
            label: rec.get('label')
          }
        }));

        return { nodes, edges };
      } catch (err) {
        console.error('[Neo4j exportGraphJSON Error]:', err.message);
      } finally {
        await session.close();
      }
    }

    // In-memory fallback
    let filteredNodes = Array.from(this.fallbackNodes.values());
    let filteredEdges = [...this.fallbackEdges];

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

