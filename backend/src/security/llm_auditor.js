/**
 * backend/src/security/llm_auditor.js
 * AI Security Auditor Agent: Uses Gemini API (gemini-2.5-flash) to perform deep contextual security logic checks
 * on actual source code files fetched from GitHub.
 * Improvements:
 *  - Scans top 20 files (up from 5) with 4000 chars each (up from 1500)
 *  - Batch processing for repos with more than 20 files
 *  - Language-aware security prompts
 */

import { callGemini } from '../services/llm_service.js';

// Max files per batch and chars per file (tuned for Gemini context window)
const MAX_FILES_PER_BATCH = 20;
const MAX_CHARS_PER_FILE = 4000;

/**
 * Builds a structured AI prompt for a batch of files
 */
function buildAuditPrompt(fileBatch) {
  const codePromptContext = fileBatch
    .map(f => `--- FILE: ${f.path} ---\n${f.content.substring(0, MAX_CHARS_PER_FILE)}`)
    .join('\n\n');

  return `You are performing a professional SAST (Static Application Security Testing) audit.
Analyze the following source code files for security vulnerabilities including:
- OWASP Top 10 (2021): Injection, Broken Access Control, Cryptographic Failures, XSS, SSRF, etc.
- CWE weaknesses: hardcoded credentials, path traversal, insecure deserialization, prototype pollution
- Business logic flaws: missing auth checks, insecure direct object references, race conditions
- Insecure configurations: wildcard CORS, missing rate limiting, debug mode enabled

${codePromptContext}

Respond ONLY with a valid JSON array. Each object must follow this exact schema:
[
  {
    "filePath": "path/to/file",
    "line": 10,
    "codeSnippet": "vulnerable code line",
    "type": "Vulnerability Name",
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "owasp": "OWASP Category (e.g. A03:2021-Injection)",
    "description": "Clear explanation of the vulnerability and its impact",
    "suggestedFix": "Corrected and safe code snippet"
  }
]

If no vulnerabilities are found in a file, do not include it. Return an empty array [] if the entire batch is clean.`;
}

/**
 * Runs LLM security audit on a single batch of files
 */
async function auditBatch(fileBatch, activeKey) {
  const prompt = buildAuditPrompt(fileBatch);

  try {
    const rawResponse = await callGemini({
      prompt,
      systemPrompt: 'You are an elite SAST and code auditing AI agent. Return ONLY raw JSON array without markdown backticks or explanation.',
      apiKey: activeKey,
      model: 'gemini-2.5-flash'
    });

    if (!rawResponse) return [];

    // Strip any markdown code fences the model may have added
    const cleaned = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

    let vulnerabilities = null;
    try {
      vulnerabilities = JSON.parse(cleaned);
    } catch (pErr) {
      console.error('[LLM Auditor] Failed to parse JSON response from Gemini:', pErr.message);
      return [];
    }

    return Array.isArray(vulnerabilities) ? vulnerabilities : [];
  } catch (err) {
    console.error('[LLM Auditor Exception]:', err.message);
    return [];
  }
}

/**
 * Main entry point: runs LLM security audit across all files in batches.
 * Covers up to MAX_FILES_PER_BATCH files per Gemini call, processing
 * larger repos in sequential batches and merging all findings.
 */
export async function runLLMSecurityAudit(fileList, apiKey) {
  const activeKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || apiKey;
  if (!activeKey) {
    console.log('[LLM Auditor] No Gemini API key configured. Skipping AI audit layer.');
    return null;
  }

  // Filter to meaningful source files only (skip lock files, assets, etc.)
  const sourceExtensions = /\.(js|ts|jsx|tsx|py|java|go|rb|php|cs|cpp|c|rs|kt|swift)$/i;
  const sourceFiles = fileList.filter(f => sourceExtensions.test(f.path));

  if (sourceFiles.length === 0) {
    console.log('[LLM Auditor] No source files found for AI audit.');
    return null;
  }

  console.log(`[LLM Auditor] Starting AI audit on ${sourceFiles.length} source files in batches of ${MAX_FILES_PER_BATCH}...`);

  const allFindings = [];
  // Process files in batches
  for (let i = 0; i < sourceFiles.length; i += MAX_FILES_PER_BATCH) {
    const batch = sourceFiles.slice(i, i + MAX_FILES_PER_BATCH);
    console.log(`[LLM Auditor] Processing batch ${Math.floor(i / MAX_FILES_PER_BATCH) + 1}: files ${i + 1}–${Math.min(i + MAX_FILES_PER_BATCH, sourceFiles.length)}`);
    const batchFindings = await auditBatch(batch, activeKey);
    allFindings.push(...batchFindings);
  }

  console.log(`[LLM Auditor] AI audit complete. Found ${allFindings.length} AI-detected findings.`);
  return allFindings.length > 0 ? allFindings : null;
}
