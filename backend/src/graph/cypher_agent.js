/**
 * backend/src/graph/cypher_agent.js
 * AI Text-to-Cypher Agent:
 * Uses Google Gemini 2.5 to dynamically write and execute Cypher queries against Neo4j Graph DB.
 */

import { callGemini } from '../services/llm_service.js';
import { globalKnowledgeGraph } from './db.js';

const NEO4J_SCHEMA_PROMPT = `
Neo4j Graph Database Schema:
Nodes:
- (:File {id, path, language, loc, repo})
- (:Function {id, name, params, returnType, comments, isAsync, complexity, file, repo})
- (:Class {id, name, extends, file, repo})
- (:Endpoint {id, method, path, file, repo})
- (:Vulnerability {id, type, severity, cwe, line, file, repo})
- (:TestCase {id, category, testFile, targetFile, repo})

Relationships:
- (:File)-[:CONTAINS]->(:Function)
- (:File)-[:CONTAINS]->(:Class)
- (:File)-[:EXPOSES_ROUTE]->(:Endpoint)
- (:File)-[:IMPORTS]->(:File)
- (:Class)-[:HAS_METHOD]->(:Function)
- (:Class)-[:EXTENDS]->(:Class)
- (:Function)-[:CALLS]->(:Function)
- (:Vulnerability)-[:FOUND_IN_FUNCTION]->(:Function)
- (:TestCase)-[:TESTS]->(:Function)
`;

/**
 * Translates natural language user/agent intent into executable Cypher code.
 */
export async function generateCypherQuery(userQuery, repoKey = 'default', apiKey = null) {
  const activeKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || apiKey;
  if (!activeKey) return null;

  const prompt = `You are an expert Neo4j Cypher Database Engineer AI Agent.
Given the schema below, write a read-only Cypher query to answer the user request.

${NEO4J_SCHEMA_PROMPT}

Target Repository Key: "${repoKey}"
User Query: "${userQuery}"

Rules:
1. Write ONLY a read-only Cypher query starting with MATCH or OPTIONAL MATCH.
2. Do NOT use SET, MERGE, DELETE, or CREATE.
3. Always filter by repo property if applicable: \`WHERE n.repo = "${repoKey}"\` or \`{repo: "${repoKey}"}\`.
4. Output ONLY raw executable Cypher code (no markdown formatting, no explanations).`;

  try {
    const rawCypher = await callGemini({
      prompt,
      systemPrompt: 'You are a Cypher query generator AI. Output raw Cypher code only.',
      apiKey: activeKey,
      model: 'gemini-2.5-flash'
    });

    if (!rawCypher) return null;
    return rawCypher.replace(/```[a-z]*/gi, '').trim();
  } catch (err) {
    console.error('[Cypher Agent Generation Error]:', err.message);
    return null;
  }
}

/**
 * Generates and executes a Cypher query dynamically, returning graph records.
 */
export async function queryGraphWithAI(userQuery, repoKey = 'default', apiKey = null) {
  const cypherQuery = await generateCypherQuery(userQuery, repoKey, apiKey);
  if (!cypherQuery) return { success: false, message: 'Could not generate Cypher query', data: [] };

  console.log(`[AI Cypher Agent] Generated Cypher Query:\n${cypherQuery}`);

  if (globalKnowledgeGraph.isConnected && globalKnowledgeGraph.driver) {
    const session = globalKnowledgeGraph.driver.session();
    try {
      const result = await session.run(cypherQuery);
      const records = result.records.map(record => {
        const obj = {};
        record.keys.forEach(key => {
          const val = record.get(key);
          obj[key] = val && typeof val === 'object' && val.properties ? val.properties : val;
        });
        return obj;
      });
      return { success: true, cypherQuery, records };
    } catch (err) {
      console.error('[AI Cypher Agent Execution Error]:', err.message);
      return { success: false, cypherQuery, error: err.message, records: [] };
    } finally {
      await session.close();
    }
  }

  return { success: false, cypherQuery, message: 'Neo4j driver offline', records: [] };
}
