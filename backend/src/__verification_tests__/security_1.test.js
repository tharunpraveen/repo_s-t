/**
 * Security Test Suite for: src/auth_service.js
 * AUTO-GENERATED — Run with: npx jest src/auth_service.security.test.js
 */

const request = require('supertest');
const app = require('../server');

describe('Security Tests for auth_service', () => {
  describe('SEC-03-1: SQL String Concatenation Injection', () => {
    it('[EXPLOIT PROBE] should be blocked by security guard', async () => {
      const res = await request(app).post('/api/login').send({ username: "' OR 1=1--", password: "x" });
      expect(res.status).not.toBe(200);
    });

    it('[GUARD CHECK] should reject malicious input with 400/403/422', async () => {
      const res = await request(app).post('/api/login').send({ username: "' OR 1=1--", password: "x" });
      expect([400, 403, 422]).toContain(res.status);
    });
  });
});
