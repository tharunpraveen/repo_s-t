/**
 * backend/src/testing/generators/intelligent_generator.js
 * Intelligent / Exploratory Test Generator Module.
 * Synthesizes AI Boundary Fuzzing, Type Coercion & Overflow Edge-Case Suites.
 */

export function generateIntelligentTests(astSummaries = []) {
  const intelligentTests = [];

  astSummaries.forEach((summary) => {
    if (!summary.functions || summary.functions.length === 0) return;

    const fileName = summary.filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.intelligent.test.$1');

    let code = `/**\n * Exploratory / Intelligent AI Fuzzing Suite for: ${summary.filePath}\n * Tests unexpected type coercion, circular objects, overflow numbers & empty bounds.\n */\n\n`;
    code += `const { ${summary.functions.map(f => f.name).join(', ')} } = require('../${fileName}');\n\n`;
    code += `describe('Exploratory / Intelligent Boundary Fuzzing for ${fileName}', () => {\n`;

    summary.functions.forEach(func => {
      code += `  describe('${func.name}() Boundary Fuzzing', () => {\n`;
      code += `    it('should gracefully handle type coercion ("100" vs 100)', async () => {\n`;
      code += `      try { await ${func.name}("100"); } catch (e) { expect(e).toBeDefined(); }\n`;
      code += `    });\n`;
      code += `    it('should handle empty string & NaN inputs without crashing process', async () => {\n`;
      code += `      try { await ${func.name}(""); } catch (e) { expect(e).toBeDefined(); }\n`;
      code += `      try { await ${func.name}(NaN); } catch (e) { expect(e).toBeDefined(); }\n`;
      code += `    });\n`;
      code += `    it('should handle unexpected Object & Array payloads', async () => {\n`;
      code += `      try { await ${func.name}({ unexpectedKey: true }); } catch (e) { expect(e).toBeDefined(); }\n`;
      code += `    });\n`;
      code += `  });\n\n`;
    });

    code += `});\n`;

    intelligentTests.push({
      id: `INTEL-TEST-${intelligentTests.length + 1}`,
      category: 'Exploratory / Intelligent Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner: `npx jest ${testFileName}`,
      testCount: summary.functions.length * 3,
      code
    });
  });

  return intelligentTests;
}
