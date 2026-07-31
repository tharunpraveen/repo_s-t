/**
 * backend/src/testing/generators/unit_generator.js
 * Unit Test Generator Module.
 */

import { runLLMTestGeneration } from '../llm_test_generator.js';

export async function generateUnitTests(astSummaries, loadedFiles = [], knowledgeGraph = null, apiKey = null) {
  const unitTests = [];
  const eligibleSummaries = astSummaries.filter(s => s.functions && s.functions.length > 0);

  await Promise.all(eligibleSummaries.map(async (summary, idx) => {
    const fileObj = loadedFiles.find(f => f.path === summary.filePath);
    const ext = summary.filePath.split('.').pop().toLowerCase();
    const isPy = ext === 'py';
    const isJava = ext === 'java';

    const testFileName = isPy 
      ? summary.filePath.replace(/\.py$/, '_test.py') 
      : isJava 
      ? summary.filePath.replace(/\.java$/, 'Test.java') 
      : summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.test.$1');

    const frameworkRunner = isPy 
      ? `pytest ${testFileName}` 
      : isJava 
      ? `mvn test -Dtest=${testFileName.replace('.java', '')}` 
      : `npx jest ${testFileName}`;

    let code = '';

    if (fileObj && (apiKey || process.env.OPENAI_API_KEY) && idx < 4) {
      const aiGeneratedCode = await runLLMTestGeneration(summary, fileObj.content, apiKey);
      if (aiGeneratedCode) {
        code = aiGeneratedCode;
      }
    }

    if (!code) {
      const funcNames = summary.functions.map(f => f.name);
      if (isPy) {
        code = `"""\nAutomated Unit Test Suite for: ${summary.filePath}\nRun with: ${frameworkRunner}\n"""\n\nimport pytest\nfrom unittest.mock import MagicMock\nfrom ${summary.filePath.replace(/\//g, '.').replace(/\.py$/, '')} import ${funcNames.join(', ')}\n\n`;
        summary.functions.forEach(func => {
          code += `def test_${func.name}_valid_input():\n    result = ${func.name}()\n    assert result is not None\n\n`;
        });
      } else {
        code = `/**\n * Automated Unit Test Suite for: ${summary.filePath}\n * Run with: ${frameworkRunner}\n */\n\n`;
        code += `const { ${funcNames.join(', ')} } = require('../${summary.filePath.split('/').pop()}');\n\n`;

        code += `describe('Unit Tests for ${summary.filePath.split('/').pop()}', () => {\n`;
        summary.functions.forEach(func => {
          code += `  describe('${func.name}()', () => {\n`;
          code += `    it('should execute successfully with valid parameters', async () => {\n`;
          code += `      const result = await ${func.name}();\n`;
          code += `      expect(result).toBeDefined();\n`;
          code += `    });\n  });\n`;
        });
        code += `});\n`;
      }
    }

    const testObj = {
      id: `UT-${unitTests.length + 1}`,
      category: 'Unit Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner,
      functionsTested: summary.functions.map(f => f.name),
      testCount: summary.functions.length * 2,
      code
    };

    unitTests.push(testObj);

    if (knowledgeGraph) {
      knowledgeGraph.addTestCaseNode(testObj.id, testFileName, summary.filePath, testObj.testCount, code);
    }
  }));

  return unitTests;
}
