/**
 * backend/src/testing/unit_test_generator.js
 * High-Level Test Suite Synthesizer Orchestrator.
 *
 * Delegates test generation to specialized, modular generator agents:
 *  - Unit Testing:        src/testing/generators/unit_generator.js
 *  - Functional Testing:  src/testing/generators/functional_generator.js
 *  - Integration Testing: src/testing/generators/integration_generator.js
 *  - Regression Testing:  src/testing/generators/regression_generator.js
 *  - Performance Testing: src/testing/generators/performance_generator.js
 *  - Intelligent Fuzzing: src/testing/generators/intelligent_generator.js
 *  - Security Testing:    src/testing/generators/security_generator.js
 */

import { generateUnitTests } from './generators/unit_generator.js';
import { generateFunctionalTests } from './generators/functional_generator.js';
import { generateIntegrationTests } from './generators/integration_generator.js';
import { generateRegressionTests } from './generators/regression_generator.js';
import { generatePerformanceTests } from './generators/performance_generator.js';
import { generateIntelligentTests } from './generators/intelligent_generator.js';
import { generateSecurityTests } from './generators/security_generator.js';

/**
 * Main Orchestrator: Invokes all specialized test case generators.
 */
export async function generateTestSuites(
  astSummaries,
  loadedFiles = [],
  knowledgeGraph = null,
  apiKey = null,
  repoKey = 'default',
  securityAudit = null
) {
  // 1. Synthesize Unit Tests
  const unitTests = await generateUnitTests(astSummaries, loadedFiles, knowledgeGraph, apiKey);

  // 2. Synthesize Functional, Integration, Regression, Performance, Intelligent & Security Suites
  const functionalTests = generateFunctionalTests(astSummaries);
  const integrationTests = generateIntegrationTests(astSummaries);
  const regressionTests = generateRegressionTests(astSummaries);
  const performanceTests = generatePerformanceTests(astSummaries);
  const intelligentTests = generateIntelligentTests(astSummaries);
  const securityTests = generateSecurityTests(securityAudit?.vulnerabilities || []);

  console.log(`[Test Synthesizer] Generated 7 testing categories: ${unitTests.length} Unit, ${functionalTests.length} Functional, ${integrationTests.length} Integration, ${regressionTests.length} Regression, ${performanceTests.length} Performance, ${intelligentTests.length} Intelligent, ${securityTests.length} Security.`);

  return {
    unitTests,
    functionalTests,
    integrationTests,
    regressionTests,
    performanceTests,
    intelligentTests,
    securityTests
  };
}

// Re-export individual generators for direct modular usage
export {
  generateUnitTests,
  generateFunctionalTests,
  generateIntegrationTests,
  generateRegressionTests,
  generatePerformanceTests,
  generateIntelligentTests,
  generateSecurityTests
};
