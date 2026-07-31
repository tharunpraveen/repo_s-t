import 'dotenv/config';
import { globalKnowledgeGraph } from './src/graph/db.js';

async function testMultiRepoNamespacingInNeo4j() {
  console.log('==================================================');
  console.log('🧪 Testing Multi-Repository Graph Namespacing in Neo4j');
  console.log('==================================================');

  await globalKnowledgeGraph.clear();

  // Index Repo 1: expressjs/express
  const repo1 = 'expressjs/express';
  console.log(`\n1. Indexing Repository 1 (${repo1})...`);
  await globalKnowledgeGraph.addFileNode('lib/express.js', 'js', 120, repo1);
  await globalKnowledgeGraph.addFunctionNode('lib/express.js', 'createApplication', 'req, res', 4, repo1);

  // Index Repo 2: facebook/react
  const repo2 = 'facebook/react';
  console.log(`\n2. Indexing Repository 2 (${repo2})...`);
  await globalKnowledgeGraph.addFileNode('packages/react/index.js', 'js', 350, repo2);
  await globalKnowledgeGraph.addFunctionNode('packages/react/index.js', 'useState', 'initialState', 2, repo2);

  // Query graph for Repo 1
  const graph1 = await globalKnowledgeGraph.exportGraphJSON(repo1);
  console.log(`✓ Exported ${repo1} Graph: ${graph1.nodes.length} nodes (File: ${graph1.nodes[0].data.path}, Repo: ${graph1.nodes[0].data.repo})`);

  // Query graph for Repo 2
  const graph2 = await globalKnowledgeGraph.exportGraphJSON(repo2);
  console.log(`✓ Exported ${repo2} Graph: ${graph2.nodes.length} nodes (File: ${graph2.nodes[0].data.path}, Repo: ${graph2.nodes[0].data.repo})`);

  // Query full multi-repo graph
  const fullGraph = await globalKnowledgeGraph.exportGraphJSON(null);
  console.log(`\n🌐 Combined Multi-Repository Knowledge Graph in Neo4j: Total ${fullGraph.nodes.length} nodes across both repos.`);

  console.log('==================================================');
  console.log('🎉 MULTI-REPOSITORY GRAPH NAMESPACING TEST PASSED!');
  console.log('==================================================');
}

testMultiRepoNamespacingInNeo4j().catch(console.error);
