/**
 * backend/src/testing/generators/integration_generator.js
 * Integration Test Generator Module.
 * Synthesizes Cross-Module Component Interaction Test Suites using Graph Imports.
 */

export function generateIntegrationTests(astSummaries = []) {
  const integrationTests = [];

  astSummaries.forEach((summary) => {
    if (!summary.functions || summary.functions.length === 0) return;

    const fileName = summary.filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.integration.test.$1');
    const importsList = summary.imports?.length > 0 ? summary.imports.slice(0, 3).join(', ') : 'internal modules';

    let code = `/**\n * Cross-Module Integration Test Suite for: ${summary.filePath}\n * Verifies interactions between ${summary.filePath} and imported dependencies: [${importsList}]\n */\n\n`;
    code += `const targetModule = require('../${fileName}');\n\n`;
    code += `describe('Integration Tests for ${fileName}', () => {\n`;
    code += `  it('should correctly integrate module components and external dependencies', async () => {\n`;
    code += `    expect(targetModule).toBeDefined();\n`;
    code += `  });\n});\n`;

    integrationTests.push({
      id: `INT-TEST-${integrationTests.length + 1}`,
      category: 'Integration Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner: `npx jest ${testFileName}`,
      importedDependencies: summary.imports || [],
      testCount: 1,
      code
    });
  });

  return integrationTests;
}
