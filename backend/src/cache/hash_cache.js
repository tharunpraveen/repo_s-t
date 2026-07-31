/**
 * backend/src/cache/hash_cache.js
 * SHA-256 Incremental Content Hashing & AST Cache Engine.
 * Prevents redundant AST parsing and graph indexing for unchanged source files.
 */

import crypto from 'crypto';

class FileHashCache {
  constructor() {
    this.cache = new Map(); // SHA-256 -> AST object
  }

  computeHash(content) {
    return crypto.createHash('sha256').update(content || '').digest('hex');
  }

  getCachedAST(filePath, content) {
    const hash = this.computeHash(content);
    const key = `${filePath}:${hash}`;
    return this.cache.get(key) || null;
  }

  setCachedAST(filePath, content, astData) {
    const hash = this.computeHash(content);
    const key = `${filePath}:${hash}`;
    this.cache.set(key, astData);
  }

  clear() {
    this.cache.clear();
  }
}

export const hashCache = new FileHashCache();
