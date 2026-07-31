/**
 * backend/src/testing/generators/security_generator.js
 * Security Test Generator Module.
 * Synthesizes Exploit Probes & Security Guard Assertions for SAST/DAST Vulnerabilities.
 */

export function generateSecurityTests(vulnerabilities = []) {
  if (!vulnerabilities || vulnerabilities.length === 0) return [];

  const securityTests = [];
  const vulnsByFile = {};
  vulnerabilities.forEach(v => {
    if (!vulnsByFile[v.filePath]) vulnsByFile[v.filePath] = [];
    vulnsByFile[v.filePath].push(v);
  });

  Object.entries(vulnsByFile).forEach(([filePath, vulns]) => {
    const fileName = filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = filePath.replace(/\.(js|ts|jsx|tsx)$/, '.security.test.$1');

    let code = `/**\n * Security Test Suite for: ${filePath}\n * AUTO-GENERATED — Run with: npx jest ${testFileName}\n */\n\n`;
    code += `const request = require('supertest');\nconst app = require('../server');\n\n`;
    code += `describe('Security Tests for ${fileName}', () => {\n`;

    vulns.forEach((vuln) => {
      const { probePayload, guardAssertion } = getSecurityTestPayload(vuln);
      code += `  describe('${vuln.vulnId}: ${vuln.type}', () => {\n`;
      code += `    it('[EXPLOIT PROBE] should be blocked by security guard', async () => {\n`;
      code += `      ${probePayload.code}\n      ${guardAssertion}\n`;
      code += `    });\n\n`;
      code += `    it('[GUARD CHECK] should reject malicious input with 400/403/422', async () => {\n`;
      code += `      ${probePayload.code}\n      expect([400, 403, 422]).toContain(res.status);\n`;
      code += `    });\n  });\n`;
    });

    code += `});\n`;

    securityTests.push({
      id: `SEC-TEST-${securityTests.length + 1}`,
      category: 'Security Testing',
      targetFile: filePath,
      testFile: testFileName,
      frameworkRunner: `npx jest ${testFileName}`,
      vulnerabilitiesCovered: vulns.map(v => v.vulnId),
      testCount: vulns.length * 2,
      code
    });
  });

  return securityTests;
}

function getSecurityTestPayload(vuln) {
  const type = (vuln.type || '').toLowerCase();
  if (type.includes('sql')) {
    return {
      probePayload: { code: `const res = await request(app).post('/api/login').send({ username: "' OR 1=1--", password: "x" });` },
      guardAssertion: `expect(res.status).not.toBe(200);`
    };
  }
  if (type.includes('command') || type.includes('rce')) {
    return {
      probePayload: { code: `const res = await request(app).post('/api/run').send({ input: "; cat /etc/passwd" });` },
      guardAssertion: `expect(res.body).not.toMatch(/root:x:/);`
    };
  }
  return {
    probePayload: { code: `const res = await request(app).post('/api/scan').send({ payload: "<malicious_input>" });` },
    guardAssertion: `expect(res.status).toBeLessThan(500);`
  };
}
