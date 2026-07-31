'use client';

import React, { useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export default function PlatformDashboard() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/expressjs/express');
  const [branch, setBranch] = useState('main');
  const [maxFilesLimit, setMaxFilesLimit] = useState(0); // 0 = Unlimited / Full Repository
  const [maxTokenBudget, setMaxTokenBudget] = useState(0); // 0 = Unlimited Tokens / Full Subgraph Context


  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('tests');
  const [copiedId, setCopiedId] = useState(null);

  const handleIngest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setProgressPercent(5);
    setProgressStep('Submitting repository scan job to LangGraph...');

    try {
      // Try direct API backend call first, fallback to relative path
      let ingestEndpoint = `${API_BASE_URL}/api/agent/ingest-github`;

      let response;
      try {
        response = await fetch(ingestEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoUrl,
            branch,
            maxFilesLimit: parseInt(maxFilesLimit, 10),
            maxTokenBudget: parseInt(maxTokenBudget, 10),
            asyncMode: true
          })
        });
      } catch (directErr) {
        // Fallback to relative rewrite path if direct fetch fails
        ingestEndpoint = '/api/agent/ingest-github';
        response = await fetch(ingestEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoUrl,
            branch,
            maxFilesLimit: parseInt(maxFilesLimit, 10),
            maxTokenBudget: parseInt(maxTokenBudget, 10),
            asyncMode: true
          })
        });
      }


      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server Response Error (${response.status}): ${responseText ? responseText.substring(0, 150) : 'Invalid JSON response'}`);
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Scan request failed with HTTP ${response.status}`);
      }

      // Async Job Created — start polling status
      const jobId = data.jobId;
      if (!jobId) {
        // Synchronous result fallback
        setResult(data);
        setLoading(false);
        return;
      }

      setProgressStep('Job created. Polling Multi-Agent pipeline execution...');
      await pollJobStatus(jobId);

    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const pollJobStatus = async (jobId) => {
    const jobEndpoint = `${API_BASE_URL}/api/agent/job/${jobId}`;
    const maxPollAttempts = 120; // 4 minutes max
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        let pollRes;
        try {
          pollRes = await fetch(jobEndpoint);
        } catch (err) {
          pollRes = await fetch(`/api/agent/job/${jobId}`);
        }

        const pollData = await pollRes.json();
        if (pollData.success && pollData.job) {
          const job = pollData.job;
          setProgressStep(job.step || 'Processing...');
          setProgressPercent(job.progress || 50);

          if (job.status === 'completed') {
            clearInterval(interval);
            setResult(job.result);
            setLoading(false);
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setError(job.error || 'Repository scan failed.');
            setLoading(false);
          }
        }
      } catch (pollErr) {
        console.warn('Poll error:', pollErr.message);
      }

      if (attempts >= maxPollAttempts) {
        clearInterval(interval);
        setError('Scan timed out after 4 minutes. Please try again with a smaller repository or limit.');
        setLoading(false);
      }
    }, 2000);
  };

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600 }}>
            🚀 GitHub Multi-Agent Platform (Enterprise Edition)
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            GitHub AI Code Scanning & Test Suite Synthesizer
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', maxWidth: '750px', margin: '0 auto' }}>
            Ingests any public GitHub repository, parses Babel AST symbols, tracks Taint Data Flow, audits OWASP Top 10 vulnerabilities, scans dependency CVEs via OSV.dev, and generates unit + security test suites.
          </p>
        </div>

        {/* Input Form */}
        <div style={{ background: '#1e293b', padding: '1.75rem', borderRadius: '12px', border: '1px solid #334155', marginBottom: '2rem' }}>
          <form onSubmit={handleIngest} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1.3fr 1.3fr 1.2fr', gap: '1rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                GitHub Repository URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                required
                style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Target Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Scan File Limit
              </label>
              <select
                value={maxFilesLimit}
                onChange={(e) => setMaxFilesLimit(e.target.value)}
                style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
              >
                <option value={0}>♾️ Full Repository (Unlimited)</option>
                <option value={10}>⚡ 10 Files (Fast Demo)</option>
                <option value={50}>📊 50 Files (Standard)</option>
                <option value={100}>🔍 100 Files (Extended)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Graph-RAG Token Limit
              </label>
              <select
                value={maxTokenBudget}
                onChange={(e) => setMaxTokenBudget(e.target.value)}
                style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
              >
                <option value={0}>♾️ Full Context (Unlimited Tokens)</option>
                <option value={4000}>⚡ 4,000 Tokens (Strict)</option>
                <option value={6000}>📊 6,000 Tokens (Standard)</option>
                <option value={12000}>🔍 12,000 Tokens (Extended)</option>
              </select>
            </div>


            <button
              type="submit"
              disabled={loading}
              style={{ padding: '0.75rem', borderRadius: '6px', background: loading ? '#64748b' : '#2563eb', color: '#fff', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? '⏳ Processing...' : '⚡ Run Agent Pipeline'}
            </button>

          </form>

          {/* Live Progress Bar when loading */}
          {loading && (
            <div style={{ marginTop: '1.25rem', background: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>{progressStep}</span>
                <span style={{ color: '#93c5fd', fontWeight: 700 }}>{progressPercent}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '1rem 1.25rem', borderRadius: '8px', marginBottom: '2rem' }}>
            ⚠️ <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results Overview */}
        {result && (
          <div>
            {/* Metric Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total LOC</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>{result.summary?.totalLOC || 0}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>AST Functions</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8', marginTop: '0.25rem' }}>{result.summary?.totalFunctions || 0}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>SAST Flaws</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: result.summary?.securityVulnerabilities > 0 ? '#f87171' : '#4ade80', marginTop: '0.25rem' }}>{result.summary?.securityVulnerabilities || 0}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Vuln Dependencies</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: result.summary?.vulnerableDependencies > 0 ? '#fb923c' : '#4ade80', marginTop: '0.25rem' }}>{result.summary?.vulnerableDependencies || 0}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Unit & Sec Tests</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4ade80', marginTop: '0.25rem' }}>{(result.testSuites?.unitTests?.length || 0) + (result.testSuites?.securityTests?.length || 0)}</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #334155', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('tests')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'tests' ? '#1e293b' : 'transparent', color: activeTab === 'tests' ? '#60a5fa' : '#94a3b8', border: 'none', borderBottom: activeTab === 'tests' ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🧪 Unit Tests ({result.testSuites?.unitTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('sectests')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'sectests' ? '#1e293b' : 'transparent', color: activeTab === 'sectests' ? '#34d399' : '#94a3b8', border: 'none', borderBottom: activeTab === 'sectests' ? '2px solid #10b981' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🔐 Security Tests ({result.testSuites?.securityTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('security')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'security' ? '#1e293b' : 'transparent', color: activeTab === 'security' ? '#f87171' : '#94a3b8', border: 'none', borderBottom: activeTab === 'security' ? '2px solid #ef4444' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🛡️ SAST & Taint Audit ({result.securityAudit?.totalFound || 0})
              </button>
              <button
                onClick={() => setActiveTab('deps')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'deps' ? '#1e293b' : 'transparent', color: activeTab === 'deps' ? '#fb923c' : '#94a3b8', border: 'none', borderBottom: activeTab === 'deps' ? '2px solid #f97316' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                📦 Dependency CVEs ({result.depScan?.totalFound || 0})
              </button>
              <button
                onClick={() => setActiveTab('functional')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'functional' ? '#1e293b' : 'transparent', color: activeTab === 'functional' ? '#38bdf8' : '#94a3b8', border: 'none', borderBottom: activeTab === 'functional' ? '2px solid #38bdf8' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                ⚡ Functional ({result.testSuites?.functionalTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('integration')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'integration' ? '#1e293b' : 'transparent', color: activeTab === 'integration' ? '#818cf8' : '#94a3b8', border: 'none', borderBottom: activeTab === 'integration' ? '2px solid #818cf8' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🔗 Integration ({result.testSuites?.integrationTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('regression')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'regression' ? '#1e293b' : 'transparent', color: activeTab === 'regression' ? '#f472b6' : '#94a3b8', border: 'none', borderBottom: activeTab === 'regression' ? '2px solid #f472b6' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                📸 Regression ({result.testSuites?.regressionTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'performance' ? '#1e293b' : 'transparent', color: activeTab === 'performance' ? '#facc15' : '#94a3b8', border: 'none', borderBottom: activeTab === 'performance' ? '2px solid #facc15' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🚀 Performance ({result.testSuites?.performanceTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('intelligent')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'intelligent' ? '#1e293b' : 'transparent', color: activeTab === 'intelligent' ? '#c084fc' : '#94a3b8', border: 'none', borderBottom: activeTab === 'intelligent' ? '2px solid #c084fc' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🧠 Intelligent Fuzzing ({result.testSuites?.intelligentTests?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('dast')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'dast' ? '#1e293b' : 'transparent', color: activeTab === 'dast' ? '#ec4899' : '#94a3b8', border: 'none', borderBottom: activeTab === 'dast' ? '2px solid #ec4899' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                ⚡ DAST API Probes ({result.dastScan?.totalFound || 0})
              </button>

              <button
                onClick={() => setActiveTab('graph')}
                style={{ padding: '0.75rem 1.25rem', background: activeTab === 'graph' ? '#1e293b' : 'transparent', color: activeTab === 'graph' ? '#a78bfa' : '#94a3b8', border: 'none', borderBottom: activeTab === 'graph' ? '2px solid #8b5cf6' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}
              >
                🌐 Code Knowledge Graph ({result.graphData?.nodes?.length || 0})
              </button>
            </div>


            {/* Tab 1: Unit Test Suites */}
            {activeTab === 'tests' && (
              <div>
                {!result.testSuites?.unitTests || result.testSuites.unitTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No target code functions discovered for unit test synthesis.
                  </div>
                ) : (
                  result.testSuites.unitTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem' }}>{suite.testFile}</span>
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '0.75rem' }}>Targets: {suite.targetFile}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span style={{ background: '#334155', color: '#cbd5e1', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>
                            {suite.frameworkRunner}
                          </span>
                          <button
                            onClick={() => handleCopyCode(suite.code, suite.id)}
                            style={{ background: copiedId === suite.id ? '#16a34a' : '#2563eb', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            {copiedId === suite.id ? '✓ Copied' : '📋 Copy Test Suite'}
                          </button>
                        </div>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#090d16', color: '#e2e8f0', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 2: Security Test Suites */}
            {activeTab === 'sectests' && (
              <div>
                {!result.testSuites?.securityTests || result.testSuites.securityTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#4ade80', fontWeight: 600 }}>
                    ✅ Clean! No security test suites required as no security vulnerabilities were detected.
                  </div>
                ) : (
                  result.testSuites.securityTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #065f46', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#064e3b', borderBottom: '1px solid #065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#a7f3d0', fontSize: '1rem' }}>{suite.testFile}</span>
                          <span style={{ fontSize: '0.8rem', color: '#6ee7b7', marginLeft: '0.75rem' }}>Covers: {suite.vulnerabilitiesCovered?.join(', ')}</span>
                        </div>
                        <button
                          onClick={() => handleCopyCode(suite.code, suite.id)}
                          style={{ background: copiedId === suite.id ? '#16a34a' : '#059669', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Security Test'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#042f2e', color: '#99f6e4', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: OWASP SAST & Taint Flow Audit Findings */}
            {activeTab === 'security' && (
              <div>
                {!result.securityAudit?.vulnerabilities || result.securityAudit.vulnerabilities.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#4ade80', fontWeight: 600 }}>
                    ✅ Clean Security Audit! No OWASP SAST vulnerabilities or hardcoded credentials detected in indexed files.
                  </div>
                ) : (
                  result.securityAudit.vulnerabilities.map((vuln) => (
                    <div key={vuln.vulnId} style={{ background: '#1e293b', border: vuln.isTaintFlow ? '1px solid #d97706' : '1px solid #7f1d1d', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: vuln.isTaintFlow ? '#451a03' : '#450a0a', borderBottom: vuln.isTaintFlow ? '1px solid #d97706' : '1px solid #7f1d1d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ background: vuln.severity === 'CRITICAL' ? '#dc2626' : '#ea580c', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '4px', marginRight: '0.75rem' }}>
                            {vuln.severity}
                          </span>
                          <span style={{ fontWeight: 700, color: vuln.isTaintFlow ? '#fcd34d' : '#fca5a5' }}>
                            {vuln.type} {vuln.isTaintFlow && '🌊 [Taint Flow]'}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: '#f87171', marginLeft: '0.75rem' }}>({vuln.filePath}: Line {vuln.line})</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#fca5a5', background: 'rgba(239,68,68,0.2)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                          {vuln.owasp}
                        </span>
                      </div>
                      <div style={{ padding: '1.25rem' }}>
                        <p style={{ color: '#cbd5e1', marginTop: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>{vuln.explanation}</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>Vulnerable Snippet</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#2e1065', color: '#fca5a5', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{vuln.codeSnippet}</code>
                            </pre>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>Auto-Fix Git Patch</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#052e16', color: '#86efac', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{vuln.patch ? vuln.patch.fix : vuln.suggestedFix}</code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 4: Dependency CVE Scan (OSV.dev) */}
            {activeTab === 'deps' && (
              <div>
                {!result.depScan?.findings || result.depScan.findings.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#4ade80', fontWeight: 600 }}>
                    ✅ Clean! No known CVE vulnerabilities found in project dependencies via OSV.dev database.
                  </div>
                ) : (
                  result.depScan.findings.map((dep) => (
                    <div key={dep.vulnId} style={{ background: '#1e293b', border: '1px solid #c2410c', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#431407', borderBottom: '1px solid #c2410c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ background: dep.severity === 'CRITICAL' ? '#dc2626' : '#ea580c', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '4px', marginRight: '0.75rem' }}>
                            {dep.severity}
                          </span>
                          <span style={{ fontWeight: 700, color: '#ffedd5' }}>{dep.type}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#fdba74', background: 'rgba(249,115,22,0.2)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                          OSV.dev CVE
                        </span>
                      </div>
                      <div style={{ padding: '1.25rem' }}>
                        <p style={{ color: '#cbd5e1', marginTop: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>{dep.explanation}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>Installed Version</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#2e1065', color: '#fca5a5', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{dep.codeSnippet}</code>
                            </pre>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>Recommended Fix</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#052e16', color: '#86efac', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{dep.patch?.fix}</code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Functional Testing View */}
            {activeTab === 'functional' && (
              <div>
                {!result.testSuites?.functionalTests || result.testSuites.functionalTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No API routes discovered for Functional End-to-End Test synthesis.
                  </div>
                ) : (
                  result.testSuites.functionalTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #0284c7', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#075985', borderBottom: '1px solid #0284c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#bae6fd' }}>⚡ Functional E2E Suite: {suite.testFile}</span>
                        <button onClick={() => handleCopyCode(suite.code, suite.id)} style={{ background: copiedId === suite.id ? '#16a34a' : '#0284c7', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Functional Suite'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#0c4a6e', color: '#e0f2fe', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Integration Testing View */}
            {activeTab === 'integration' && (
              <div>
                {!result.testSuites?.integrationTests || result.testSuites.integrationTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No cross-module import dependencies discovered for Integration Test synthesis.
                  </div>
                ) : (
                  result.testSuites.integrationTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #4f46e5', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#3730a3', borderBottom: '1px solid #4f46e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#c7d2fe' }}>🔗 Integration Suite: {suite.testFile}</span>
                        <button onClick={() => handleCopyCode(suite.code, suite.id)} style={{ background: copiedId === suite.id ? '#16a34a' : '#4f46e5', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Integration Suite'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#1e1b4b', color: '#e0e7ff', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Regression Testing View */}
            {activeTab === 'regression' && (
              <div>
                {!result.testSuites?.regressionTests || result.testSuites.regressionTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No target functions available for Regression Snapshot baseline generation.
                  </div>
                ) : (
                  result.testSuites.regressionTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #db2777', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#9d174d', borderBottom: '1px solid #db2777', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#fbcfe8' }}>📸 Regression Snapshot Suite: {suite.testFile}</span>
                        <button onClick={() => handleCopyCode(suite.code, suite.id)} style={{ background: copiedId === suite.id ? '#16a34a' : '#db2777', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Regression Suite'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#500724', color: '#fce7f3', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Performance Testing View */}
            {activeTab === 'performance' && (
              <div>
                {!result.testSuites?.performanceTests || result.testSuites.performanceTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No exposed API routes discovered for Performance & Load test synthesis.
                  </div>
                ) : (
                  result.testSuites.performanceTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #ca8a04', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#854d0e', borderBottom: '1px solid #ca8a04', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#fef08a' }}>🚀 Autocannon Load Test: {suite.testFile} ({suite.concurrentUsers} VUs | P95 &lt; {suite.slaP95ThresholdMs}ms)</span>
                        <button onClick={() => handleCopyCode(suite.code, suite.id)} style={{ background: copiedId === suite.id ? '#16a34a' : '#ca8a04', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Load Test'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#422006', color: '#fef9c3', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Intelligent Fuzzing View */}
            {activeTab === 'intelligent' && (
              <div>
                {!result.testSuites?.intelligentTests || result.testSuites.intelligentTests.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#94a3b8' }}>
                    No target functions available for Intelligent AI Fuzzing test generation.
                  </div>
                ) : (
                  result.testSuites.intelligentTests.map((suite) => (
                    <div key={suite.id} style={{ background: '#1e293b', border: '1px solid #9333ea', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#6b21a8', borderBottom: '1px solid #9333ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#e9d5ff' }}>🧠 Intelligent AI Boundary Fuzzing Suite: {suite.testFile}</span>
                        <button onClick={() => handleCopyCode(suite.code, suite.id)} style={{ background: copiedId === suite.id ? '#16a34a' : '#9333ea', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          {copiedId === suite.id ? '✓ Copied' : '📋 Copy Fuzzing Suite'}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', background: '#3b0764', color: '#f3e8ff', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px' }}>
                        <code>{suite.code}</code>
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 5: DAST Dynamic API Probe Findings */}
            {activeTab === 'dast' && (

              <div>
                {!result.dastScan?.findings || result.dastScan.findings.length === 0 ? (
                  <div style={{ background: '#1e293b', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#4ade80', fontWeight: 600 }}>
                    ✅ Clean DAST Scan! All exposed API endpoints passed live dynamic security probes.
                  </div>
                ) : (
                  result.dastScan.findings.map((dast) => (
                    <div key={dast.vulnId} style={{ background: '#1e293b', border: '1px solid #db2777', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#831843', borderBottom: '1px solid #db2777', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ background: dast.severity === 'CRITICAL' ? '#dc2626' : '#db2777', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '4px', marginRight: '0.75rem' }}>
                            {dast.severity}
                          </span>
                          <span style={{ fontWeight: 700, color: '#fbcfe8' }}>{dast.type}</span>
                          <span style={{ fontSize: '0.85rem', color: '#f472b6', marginLeft: '0.75rem' }}>({dast.endpoint})</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#fbcfe8', background: 'rgba(219,39,119,0.3)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                          Live DAST Verified
                        </span>
                      </div>
                      <div style={{ padding: '1.25rem' }}>
                        <p style={{ color: '#cbd5e1', marginTop: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>{dast.explanation}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#f472b6', fontWeight: 700, textTransform: 'uppercase' }}>Live Probe Payload</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#500724', color: '#fbcfe8', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{dast.codeSnippet}</code>
                            </pre>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>Fix Recommendation</span>
                            <pre style={{ margin: '0.4rem 0 0 0', padding: '0.75rem', background: '#052e16', color: '#86efac', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <code>{dast.patch?.fix}</code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 6: Knowledge Graph Schema */}
            {activeTab === 'graph' && (

              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '1.5rem' }}>
                <h3 style={{ marginTop: 0, color: '#a78bfa' }}>Code Knowledge Graph Topological Schema</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                  Extracted {result.graphData?.nodes?.length || 0} Nodes and {result.graphData?.edges?.length || 0} Directed Relationships for Cytoscape.js rendering.
                </p>
                <pre style={{ margin: 0, padding: '1.25rem', background: '#090d16', color: '#a78bfa', fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '400px', borderRadius: '8px' }}>
                  <code>{JSON.stringify(result.graphData, null, 2)}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
