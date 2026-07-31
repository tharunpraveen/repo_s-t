/**
 * backend/src/testing/generators/functional_generator.js
 * Functional Test Generator Module.
 * Synthesizes End-to-End API Route & Business Workflow Test Suites.
 */

export function generateFunctionalTests(astSummaries = []) {
  const functionalTests = [];

  astSummaries.forEach((summary) => {
    const hasRoutes = summary.routes && summary.routes.length > 0;
    const hasFunctions = summary.functions && summary.functions.length > 0;
    if (!hasRoutes && !hasFunctions) return;

    const fileName = summary.filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.functional.test.$1');

    let code = `/**\n * Functional Test Suite for: ${summary.filePath}\n * Run with: npx jest ${testFileName}\n */\n\n`;

    if (hasRoutes) {
      code += `const request = require('supertest');\nconst app = require('../server');\n\n`;
      code += `describe('Functional E2E API Tests for ${fileName}', () => {\n`;
      summary.routes.forEach((route) => {
        code += `  describe('${route.method} ${route.path}', () => {\n`;
        code += `    it('should process valid functional user request successfully', async () => {\n`;
        if (route.method === 'GET') {
          code += `      const res = await request(app).get('${route.path}');\n`;
        } else {
          code += `      const res = await request(app).${route.method.toLowerCase()}('${route.path}').send({ sample: 'valid_functional_payload' });\n`;
        }
        code += `      expect([200, 201, 204]).toContain(res.status);\n`;
        code += `    });\n  });\n`;
      });
      code += `});\n`;
    } else {
      const funcNames = summary.functions.map(f => f.name);
      code += `const { ${funcNames.join(', ')} } = require('../${fileName}');\n\n`;
      code += `describe('Functional Business Logic Tests for ${fileName}', () => {\n`;
      summary.functions.forEach((func) => {
        code += `  describe('${func.name}() functional workflow', () => {\n`;
        code += `    it('should produce valid functional outcome under expected execution workflow', async () => {\n`;
        code += `      if (typeof ${func.name} === 'function') {\n`;
        code += `        const result = await ${func.name}();\n`;
        code += `        expect(result).toBeDefined();\n`;
        code += `      }\n`;
        code += `    });\n  });\n`;
      });
      code += `});\n`;
    }

    functionalTests.push({
      id: `FUNC-TEST-${functionalTests.length + 1}`,
      category: 'Functional Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner: `npx jest ${testFileName}`,
      testCount: hasRoutes ? summary.routes.length : summary.functions.length,
      code
    });
  });

  return functionalTests;
}
