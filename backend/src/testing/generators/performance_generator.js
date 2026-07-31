/**
 * backend/src/testing/generators/performance_generator.js
 * Performance Test Generator Module.
 * Synthesizes Autocannon Load Tests & Execution Latency Benchmark SLAs.
 */

export function generatePerformanceTests(astSummaries = []) {
  const performanceTests = [];

  astSummaries.forEach((summary) => {
    if ((!summary.routes || summary.routes.length === 0) && (!summary.functions || summary.functions.length === 0)) return;

    const fileName = summary.filePath.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFileName = summary.filePath.replace(/\.(js|ts|jsx|tsx)$/, '.perf.loadTest.js');
    const hasRoutes = summary.routes && summary.routes.length > 0;

    let code = `/**\n * Performance & Execution Benchmark Test for: ${summary.filePath}\n */\n\n`;

    if (hasRoutes) {
      code += `const autocannon = require('autocannon');\n\n`;
      code += `async function runPerformanceTest() {\n`;
      code += `  const result = await autocannon({\n`;
      code += `    url: 'http://localhost:3002${summary.routes[0]?.path || '/'}',\n`;
      code += `    connections: 100, // 100 concurrent virtual users\n`;
      code += `    duration: 10      // 10s load duration\n`;
      code += `  });\n\n`;
      code += `  console.log('Avg Latency (ms):', result.latency.average);\n`;
      code += `  console.log('P95 Latency (ms):', result.latency.p95);\n`;
      code += `  if (result.latency.p95 > 500) console.warn('⚠️ P95 Latency exceeded SLA threshold!');\n`;
      code += `}\nrunPerformanceTest();\n`;
    } else {
      const funcNames = summary.functions.map(f => f.name);
      code += `const { performance } = require('perf_hooks');\n`;
      code += `const { ${funcNames.join(', ')} } = require('../${fileName}');\n\n`;
      code += `async function benchmarkFunctions() {\n`;
      summary.functions.forEach(func => {
        code += `  const start = performance.now();\n`;
        code += `  if (typeof ${func.name} === 'function') await ${func.name}();\n`;
        code += `  const duration = performance.now() - start;\n`;
        code += `  console.log('${func.name}() execution time:', duration.toFixed(2), 'ms');\n`;
        code += `  if (duration > 100) console.warn('⚠️ Benchmark SLA Warning: ${func.name}() took over 100ms!');\n`;
      });
      code += `}\nbenchmarkFunctions();\n`;
    }

    performanceTests.push({
      id: `PERF-TEST-${performanceTests.length + 1}`,
      category: 'Performance Testing',
      targetFile: summary.filePath,
      testFile: testFileName,
      frameworkRunner: `node ${testFileName}`,
      concurrentUsers: 100,
      slaP95ThresholdMs: 500,
      testCount: hasRoutes ? summary.routes.length : summary.functions.length,
      code
    });
  });

  return performanceTests;
}
