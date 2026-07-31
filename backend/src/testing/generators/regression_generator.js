/**
 * backend/src/testing/generators/regression_generator.js
 * Regression Test Generator Module.
 * Synthesizes Snapshot & Baseline Assertions to prevent Breaking Changes.
 */

export function generateRegressionTests(astSummaries = []) {
  const regressionTests = [];

  astSummaries.forEach((summary) => {
    if (!summary.functions || summary.functions.length === 0) return;

    const fileName = summary.filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.regression.test.$1');

    let code = `/**\n * Regression Test Suite & Snapshot Baseline for: ${summary.filePath}\n * Prevents unexpected output changes across future commits.\n */\n\n`;
    code += `const { ${summary.functions.map(f => f.name).join(', ')} } = require('../${fileName}');\n\n`;
    code += `describe('Regression Snapshot Baseline for ${fileName}', () => {\n`;

    summary.functions.forEach(func => {
      code += `  it('should match regression baseline output for ${func.name}()', async () => {\n`;
      code += `    if (typeof ${func.name} === 'function') {\n`;
      code += `      const output = await ${func.name}();\n`;
      code += `      expect(output).toMatchSnapshot();\n`;
      code += `    }\n`;
      code += `  });\n`;
    });

    code += `});\n`;

    regressionTests.push({
      id: `REG-TEST-${regressionTests.length + 1}`,
      category: 'Regression Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner: `npx jest ${testFileName} -u`,
      testCount: summary.functions.length,
      code
    });
  });

  return regressionTests;
}
