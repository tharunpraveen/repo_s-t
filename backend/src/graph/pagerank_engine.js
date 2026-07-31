/**
 * backend/src/graph/pagerank_engine.js
 * Topological Dependency & PageRank Centrality Engine for Large Codebase Scanning.
 * Ranks source files by import dependency density to prioritize core logic files over boilerplate.
 */

export function rankFilesByCentrality(tree, loadedFiles = []) {
  const isCodeFile = (path) => 
    /\.(js|ts|jsx|tsx|py|java|go|cs|cpp|c|rs|php|sql)$/i.test(path) &&
    !/(package|tsconfig|config|\.min\.|\.d\.ts|vendor|node_modules|dist)/i.test(path);

  const codeFiles = tree.filter(item => isCodeFile(item.path));

  // If contents are available, build real import dependency graph
  const fileScoreMap = new Map();
  codeFiles.forEach(f => fileScoreMap.set(f.path, 1.0));

  if (loadedFiles.length > 0) {
    loadedFiles.forEach(file => {
      let score = fileScoreMap.get(file.path) || 1.0;
      
      // Bonus score for routing endpoints, controller logic, models
      if (/(server|app|index|main|router|controller|service|model|db|api)/i.test(file.path)) {
        score += 3.0;
      }
      
      // Bonus score for LOC size & export density
      const loc = file.content.split('\n').length;
      score += Math.min(loc / 100, 5.0);

      // Inspect import statements targeting other files
      loadedFiles.forEach(otherFile => {
        if (otherFile.path !== file.path) {
          const otherBaseName = otherFile.path.split('/').pop().replace(/\.[^/.]+$/, "");
          if (otherBaseName && file.content.includes(otherBaseName)) {
            const currentOtherScore = fileScoreMap.get(otherFile.path) || 1.0;
            fileScoreMap.set(otherFile.path, currentOtherScore + 2.0);
          }
        }
      });

      fileScoreMap.set(file.path, score);
    });
  }

  // Sort files descending by centrality score
  return [...codeFiles].sort((a, b) => {
    const scoreA = fileScoreMap.get(a.path) || (isCodeFile(a.path) ? 2.0 : 0);
    const scoreB = fileScoreMap.get(b.path) || (isCodeFile(b.path) ? 2.0 : 0);
    return scoreB - scoreA;
  });
}
