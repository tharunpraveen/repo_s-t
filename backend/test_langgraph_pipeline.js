import 'dotenv/config';
import { langGraphPipeline } from './src/agents/langgraph_pipeline.js';

async function testLangGraphPipelineExecution() {
  console.log('==================================================');
  console.log('🦜 Testing LangGraph StateGraph Multi-Agent Pipeline');
  console.log('==================================================');

  const initialState = {
    repoUrl: 'https://github.com/expressjs/express',
    branch: 'master',
    maxFilesLimit: 10,
    maxTokenBudget: 6000,
    currentStep: 'Starting LangGraph Test',
    progressPercent: 0
  };

  console.log('Executing LangGraph StateGraph pipeline invoke()...\n');
  const resultState = await langGraphPipeline.invoke(initialState);

  console.log('\n==================================================');
  console.log('🎉 LANGGRAPH MULTI-AGENT PIPELINE EXECUTION PASSED!');
  console.log(`Repository:            ${resultState.repoKey}`);
  console.log(`Discovered Files:      ${resultState.tree ? resultState.tree.length : 0}`);
  console.log(`Loaded & Indexed:      ${resultState.validLoadedFiles ? resultState.validLoadedFiles.length : 0}`);
  console.log(`AST Summaries:         ${resultState.astSummaries ? resultState.astSummaries.length : 0}`);
  console.log(`Neo4j Nodes:           ${resultState.graphData ? resultState.graphData.nodes.length : 0}`);
  console.log(`SAST Vulnerabilities:  ${resultState.securityAudit ? resultState.securityAudit.totalFound : 0}`);
  console.log(`Unit Test Suites:      ${resultState.testSuites ? resultState.testSuites.unitTests.length : 0}`);
  console.log(`Current Step:          ${resultState.currentStep}`);
  console.log('==================================================');
}

testLangGraphPipelineExecution().catch(console.error);
