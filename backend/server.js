/**
 * backend/server.js
 * Industrial LangGraph Multi-Agent GitHub AI Platform Orchestrator Server.
 * Connects LangGraph StateGraph Architecture, Pluggable Neo4j Cypher Graph Engine,
 * Non-Blocking Async Job Queue, SAST Auditor, and Test Synthesizer.
 *
 * Security Improvements:
 *  - CORS restricted to ALLOWED_ORIGIN env var (no more wildcard)
 *  - GitHub URL input validation on /api/agent/ingest-github
 *  - In-memory rate limiting (10 req/min per IP)
 *  - Request body size limit (1mb)
 *  - Sanitized error responses (no stack trace leakage)
 */


import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { langGraphPipeline } from './src/agents/langgraph_pipeline.js';
import { jobOrchestrator } from './src/services/job_orchestrator.js';

const app = express();
const PORT = process.env.PORT || 3002;

// ── Security: Restrict CORS to configured origin (fix for SEC-08 wildcard) ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3003';
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (origin === ALLOWED_ORIGIN) return callback(null, true);
    callback(new Error(`CORS: Origin '${origin}' not allowed.`));
  },
  credentials: true
}));

// ── Security: Limit request body size to prevent large payload DoS ──
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Security: In-memory rate limiter (10 scan requests per IP per minute) ──
const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const requests = (rateLimitStore.get(ip) || []).filter(t => t > windowStart);
  requests.push(now);
  rateLimitStore.set(ip, requests);

  if (requests.length > RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} scan requests per minute.`
    });
  }
  next();
}

// ── Validation: GitHub URL pattern ──
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+(\/.*)?$/;


// GET /api/health - Health check & DB engine status
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'online',
    framework: 'LangGraph StateGraph Multi-Agent Architecture',
    service: 'GitHub AI Agent Platform (Industrial Enterprise Edition)',
    dbEngine: process.env.NEO4J_URI ? 'Neo4j Native Cypher Graph' : (process.env.DATABASE_URL ? 'PostgreSQL pgvector' : 'Industrial SQLite Engine'),
    time: new Date().toISOString()
  });
});

// GET /api/agent/job/:jobId - Poll background job status
app.get('/api/agent/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobOrchestrator.getJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: `Job ${jobId} not found.` });
  }
  return res.json({ success: true, job });
});

// Main Background Processing Pipeline powered by LangGraph StateGraph
async function runRepositoryScanPipeline(jobId, repoUrl, branch = 'main', maxFilesLimit = 50, maxTokenBudget = 6000) {
  try {
    const activeApiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || null;

    jobOrchestrator.updateProgress(jobId, 10, `Initializing LangGraph Multi-Agent State Graph for ${repoUrl}...`, 'fetching');

    // Execute LangGraph Pipeline Nodes (ingestRepo -> parseAST -> indexGraph -> runSASTAuditor -> synthesizeTests)
    const initialState = {
      repoUrl,
      branch,
      maxFilesLimit,
      maxTokenBudget,
      activeApiKey,
      currentStep: 'Starting LangGraph execution',
      progressPercent: 10
    };

    const finalState = await langGraphPipeline.invoke(initialState);

    const finalResult = {
      success: true,
      repository: {
        owner: finalState.owner,
        repo: finalState.repo,
        repoKey: finalState.repoKey,
        branch,
        totalDiscoveredFiles: finalState.tree ? finalState.tree.length : 0,
        indexedFilesCount: finalState.validLoadedFiles ? finalState.validLoadedFiles.length : 0
      },
      summary: {
        totalLOC: finalState.astSummaries ? finalState.astSummaries.reduce((acc, a) => acc + a.loc, 0) : 0,
        totalFunctions: finalState.astSummaries ? finalState.astSummaries.reduce((acc, a) => acc + a.functions.length, 0) : 0,
        securityVulnerabilities: finalState.securityAudit ? finalState.securityAudit.totalFound : 0,
        vulnerableDependencies: finalState.depScan ? finalState.depScan.totalFound : 0,
        leakedSecrets: finalState.secretScan ? finalState.secretScan.totalFound : 0,
        dastVulnerabilities: finalState.dastScan ? finalState.dastScan.totalFound : 0,
        unitTestsGenerated: finalState.testSuites ? finalState.testSuites.unitTests.length : 0
      },
      graphData: finalState.graphData,
      subgraphData: finalState.subgraphData,
      securityAudit: finalState.securityAudit,
      depScan: finalState.depScan,
      secretScan: finalState.secretScan,
      dastScan: finalState.dastScan,
      testSuites: finalState.testSuites
    };



    jobOrchestrator.completeJob(jobId, finalResult);
  } catch (err) {
    console.error(`[LangGraph Job ${jobId} Error]:`, err.message);
    jobOrchestrator.failJob(jobId, err.message);
  }
}

// POST /api/agent/ingest-github - Ingestion endpoint (rate limited)
app.post('/api/agent/ingest-github', rateLimiter, async (req, res) => {
  try {
    const {
      repoUrl,
      branch = 'main',
      maxFilesLimit = 50,
      maxTokenBudget = 6000,
      asyncMode = false
    } = req.body;

    // ── Input Validation ──
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'GitHub repository URL (repoUrl) is required and must be a string.' });
    }
    if (!GITHUB_URL_REGEX.test(repoUrl.trim())) {
      return res.status(400).json({ success: false, message: 'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo' });
    }

    const rawFilesLimit = parseInt(maxFilesLimit, 10);
    const safeMaxFiles = (!isNaN(rawFilesLimit) && rawFilesLimit > 0) ? rawFilesLimit : 999999;
    const rawTokens = parseInt(maxTokenBudget, 10);
    const safeMaxTokens = (!isNaN(rawTokens) && rawTokens > 0) ? rawTokens : 9999999;





    const job = jobOrchestrator.createJob(repoUrl.trim(), { branch, maxFilesLimit: safeMaxFiles, maxTokenBudget: safeMaxTokens });


    // Async processing
    if (asyncMode) {
      runRepositoryScanPipeline(job.jobId, repoUrl.trim(), branch, safeMaxFiles, safeMaxTokens);
      return res.json({
        success: true,
        jobId: job.jobId,
        message: 'Scan job submitted asynchronously via LangGraph. Poll GET /api/agent/job/' + job.jobId + ' for status updates.'
      });
    }

    // Synchronous execution
    await runRepositoryScanPipeline(job.jobId, repoUrl.trim(), branch, safeMaxFiles, safeMaxTokens);

    const completedJob = jobOrchestrator.getJob(job.jobId);

    if (completedJob.status === 'failed') {
      return res.json({
        success: false,
        message: completedJob.error || 'Scan failed.',
        repository: { owner: 'repository', repo: 'scanned', branch: 'main', totalDiscoveredFiles: 0, indexedFilesCount: 0 },
        summary: { totalLOC: 0, totalFunctions: 0, securityVulnerabilities: 0, unitTestsGenerated: 0 },
        graphData: { nodes: [], edges: [] },
        subgraphData: null,
        securityAudit: { totalFound: 0, criticalCount: 0, highCount: 0, mediumCount: 0, vulnerabilities: [] },
        testSuites: { unitTests: [], integrationTests: [] }
      });
    }

    return res.json(completedJob.result);
  } catch (error) {
    // Sanitize error: log full details server-side, return generic message to client
    console.error('[LangGraph Agent Pipeline Error]:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while scanning the repository. Please check the URL and try again.',
      repository: { owner: 'repository', repo: 'scanned', branch: 'main', totalDiscoveredFiles: 0, indexedFilesCount: 0 },
      summary: { totalLOC: 0, totalFunctions: 0, securityVulnerabilities: 0, unitTestsGenerated: 0 },
      graphData: { nodes: [], edges: [] },
      subgraphData: null,
      securityAudit: { totalFound: 0, criticalCount: 0, highCount: 0, mediumCount: 0, vulnerabilities: [] },
      testSuites: { unitTests: [], integrationTests: [] }
    });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 LangGraph Multi-Agent GitHub Platform Server running on port ${PORT}`);
});

export default app;
