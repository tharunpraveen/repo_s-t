import AdmZip from 'adm-zip';

// In-memory cache for downloaded repository zip files
const inMemoryZipCache = new Map();

/**
 * Downloads & extracts full GitHub repository via Zipball Stream (10x faster, zero API rate limits)
 */
export async function downloadRepoZipball(owner, repo, branch = 'main') {
  const cacheKey = `${owner}/${repo}/${branch}`;
  if (inMemoryZipCache.has(cacheKey)) {
    return inMemoryZipCache.get(cacheKey);
  }

  const codeloadUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
  console.log(`[Zipball Engine] Streaming repository archive from ${codeloadUrl}...`);

  try {
    const t0 = Date.now();
    let res = await fetch(codeloadUrl);
    
    // Auto-fallback for main vs master branch mismatch
    if (!res.ok && (branch === 'main' || branch === 'master')) {
      const altBranch = branch === 'main' ? 'master' : 'main';
      const altUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${altBranch}`;
      console.log(`[Zipball Engine] Branch '${branch}' not found (HTTP ${res.status}), retrying with '${altBranch}'...`);
      res = await fetch(altUrl);
    }

    if (!res.ok) {
      console.log(`[Zipball Engine Warning] Zipball download returned HTTP ${res.status}. Falling back to REST API / Web Scraper.`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    const validExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.cs', '.cpp', '.c', '.rs', '.php', '.sql', '.cjs', '.mjs', '.json'];

    const fileMap = new Map();
    const fileList = [];

    zipEntries.forEach(entry => {
      if (entry.isDirectory) return;

      // Zip entries start with top-level folder (e.g., 'express-master/lib/application.js')
      const pathParts = entry.entryName.split('/');
      pathParts.shift();
      const relativePath = pathParts.join('/');

      if (!relativePath) return;

      const isCodeFile = validExtensions.some(ext => relativePath.toLowerCase().endsWith(ext)) &&
        !relativePath.includes('node_modules/') &&
        !relativePath.includes('vendor/') &&
        !relativePath.includes('dist/') &&
        !relativePath.includes('.next/') &&
        !relativePath.includes('package-lock.json');

      if (isCodeFile) {
        const content = entry.getData().toString('utf8');
        fileMap.set(relativePath, content);
        fileList.push({ path: relativePath, type: 'blob' });
      }
    });

    const elapsedMs = Date.now() - t0;
    console.log(`[Zipball Engine Success] Downloaded and extracted ${fileList.length} code files in ${elapsedMs}ms.`);

    const zipData = { fileList, fileMap };
    inMemoryZipCache.set(cacheKey, zipData);
    return zipData;
  } catch (err) {
    console.error('[Zipball Engine Error]:', err.message);
    return null;
  }
}

/**
 * Parses GitHub URL into owner and repository name
 */
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    return { owner: 'expressjs', repo: 'express' };
  }

  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  
  const fullMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (fullMatch) {
    return { owner: fullMatch[1], repo: fullMatch[2] };
  }

  const shortMatch = cleaned.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  const safeRepoName = cleaned.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30) || 'repository';
  return {
    owner: 'github_user',
    repo: safeRepoName
  };
}

/**
 * Scrapes repository tree directly from GitHub HTML UI (bypassing REST API rate limits)
 */
async function scrapeGitHubRepoTreeHTML(owner, repo, branch = 'main') {
  console.log(`[Ingestion Agent] Scraper Fallback: Extracting real repository tree for ${owner}/${repo} from GitHub Web UI...`);
  const validExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.cs', '.cpp', '.c', '.rs', '.php', '.sql', '.cjs', '.mjs'];
  const blobRegex = new RegExp(`href=["']/${owner}/${repo}/blob/${branch}/([^"']+)`, 'g');
  const treeRegex = new RegExp(`href=["']/${owner}/${repo}/tree/${branch}/([^"']+)`, 'g');

  const files = new Set();
  const dirsToVisit = [];

  try {
    const rootUrl = `https://github.com/${owner}/${repo}/tree/${branch}`;
    const res = await fetch(rootUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok && (branch === 'main' || branch === 'master')) {
      const altBranch = branch === 'main' ? 'master' : 'main';
      return scrapeGitHubRepoTreeHTML(owner, repo, altBranch);
    }

    const html = await res.text();
    for (const match of html.matchAll(blobRegex)) {
      files.add(match[1]);
    }
    for (const match of html.matchAll(treeRegex)) {
      dirsToVisit.push(match[1]);
    }

    // Crawl subdirectories to discover deeper source files
    const uniqueDirs = [...new Set(dirsToVisit)].slice(0, 8);
    await Promise.all(uniqueDirs.map(async (dir) => {
      try {
        const dRes = await fetch(`https://github.com/${owner}/${repo}/tree/${branch}/${dir}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (dRes.ok) {
          const dHtml = await dRes.text();
          for (const match of dHtml.matchAll(blobRegex)) {
            files.add(match[1]);
          }
        }
      } catch (err) {
        // ignore single dir error
      }
    }));

    const fileList = Array.from(files).filter(filePath => 
      validExtensions.some(ext => filePath.toLowerCase().endsWith(ext)) &&
      !filePath.includes('node_modules/') &&
      !filePath.includes('vendor/') &&
      !filePath.includes('.next/') &&
      !filePath.includes('package-lock.json')
    ).map(filePath => ({ path: filePath, type: 'blob' }));

    console.log(`[Ingestion Agent] Scraper discovered ${fileList.length} real source code files for ${owner}/${repo}.`);
    return fileList;
  } catch (err) {
    console.error('[Ingestion Scraper Error]:', err.message);
    return [];
  }
}

/**
 * Fetches repository structure (Tier 1: Zipball Stream, Tier 2: REST API, Tier 3: Scraper)
 */
export async function fetchGitHubRepoTree(owner, repo, branch = 'main') {
  console.log(`[Ingestion Agent] Ingesting repository tree for ${owner}/${repo} (branch: ${branch})...`);
  
  // Tier 1: High-Speed Zipball Stream (Primary Strategy)
  const zipData = await downloadRepoZipball(owner, repo, branch);
  if (zipData && zipData.fileList.length > 0) {
    return zipData.fileList;
  }

  // Tier 2: GitHub REST API Fallback
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  
  try {
    const headers = {
      'User-Agent': 'GitHub-AI-Code-Agent-Platform'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN.trim()}`;
    }

    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        console.log(`[Ingestion Agent] GitHub REST API rate limit reached (status ${response.status}). Switching to Web Scraper engine for ${owner}/${repo}...`);
        const scraped = await scrapeGitHubRepoTreeHTML(owner, repo, branch);
        if (scraped && scraped.length > 0) return scraped;
      }
      if (response.status === 404 && branch === 'main') {
        console.log(`[Ingestion Agent] Branch 'main' not found via API, retrying with 'master'...`);
        return fetchGitHubRepoTree(owner, repo, 'master');
      }
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Filter source code files only
    const validExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.cs', '.cpp', '.c', '.rs', '.php', '.sql', '.cjs', '.mjs'];
    const codeFiles = data.tree.filter(item => 
      item.type === 'blob' && 
      validExtensions.some(ext => item.path.toLowerCase().endsWith(ext)) &&
      !item.path.includes('node_modules/') &&
      !item.path.includes('vendor/') &&
      !item.path.includes('dist/') &&
      !item.path.includes('.next/')
    );

    console.log(`[Ingestion Agent] Discovered ${codeFiles.length} source code files in repository.`);
    
    if (codeFiles.length === 0) {
      console.log(`[Ingestion Agent] No matching source files in API response. Trying Web Scraper engine for ${owner}/${repo}...`);
      const scraped = await scrapeGitHubRepoTreeHTML(owner, repo, branch);
      if (scraped && scraped.length > 0) return scraped;
    }

    return codeFiles;
  } catch (error) {
    console.error('[Ingestion Agent Error]:', error.message);
    console.log(`[Ingestion Agent] Attempting Web Scraper recovery for ${owner}/${repo}...`);
    const scraped = await scrapeGitHubRepoTreeHTML(owner, repo, branch);
    if (scraped && scraped.length > 0) return scraped;

    return [];
  }
}

/**
 * Fetches individual file content (checks Zipball in-memory cache first, then raw URL)
 */
export async function fetchFileContent(owner, repo, filePath, branch = 'main') {
  // Check Zipball in-memory cache first (0ms latency!)
  const cacheKey = `${owner}/${repo}/${branch}`;
  if (inMemoryZipCache.has(cacheKey)) {
    const { fileMap } = inMemoryZipCache.get(cacheKey);
    if (fileMap.has(filePath)) {
      return fileMap.get(filePath);
    }
  }

  const primaryUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  
  try {
    let response = await fetch(primaryUrl);
    if (!response.ok && (branch === 'main' || branch === 'master')) {
      const altBranch = branch === 'main' ? 'master' : 'main';
      const altUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${altBranch}/${filePath}`;
      response = await fetch(altUrl);
    }

    if (response.ok) {
      return await response.text();
    }
    console.error(`[Ingestion Content Warning] HTTP ${response.status} fetching raw file: ${filePath}`);
    return '';
  } catch (error) {
    console.error(`[Ingestion Agent Content Error] ${filePath}:`, error.message);
    return '';
  }
}
