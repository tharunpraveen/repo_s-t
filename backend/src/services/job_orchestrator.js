/**
 * backend/src/services/job_orchestrator.js
 * Industrial Non-Blocking Async Job Queue & Task Manager.
 * Orchestrates background repo scanning tasks with non-blocking status tracking.
 */

import crypto from 'crypto';

class JobOrchestrator {
  constructor() {
    this.jobs = new Map();
  }

  createJob(repoUrl, options = {}) {
    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const jobState = {
      jobId,
      repoUrl,
      status: 'queued', // queued | fetching | indexing | auditing | completed | failed
      progressPercent: 0,
      currentStep: 'Job queued in background pipeline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      options,
      result: null,
      error: null
    };

    this.jobs.set(jobId, jobState);
    return jobState;
  }

  updateProgress(jobId, progressPercent, currentStep, status = null) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progressPercent = progressPercent;
    job.currentStep = currentStep;
    if (status) job.status = status;
    job.updatedAt = new Date().toISOString();
  }

  completeJob(jobId, result) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.progressPercent = 100;
    job.currentStep = 'Repository scan completed successfully.';
    job.result = result;
    job.updatedAt = new Date().toISOString();
  }

  failJob(jobId, errorMsg) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = errorMsg;
    job.currentStep = `Job failed: ${errorMsg}`;
    job.updatedAt = new Date().toISOString();
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }
}

export const jobOrchestrator = new JobOrchestrator();
