/**
 * backend/src/services/llm_service.js
 * Industrial Google Gemini API Integration Service with Rate-Limiting Queue & Exponential Backoff.
 * Prevents HTTP 429 rate limits, handles token budgeting, and provides offline rule fallbacks.
 */

class RateLimiter {
  constructor(maxConcurrent = 2, minIntervalMs = 500) {
    this.maxConcurrent = maxConcurrent;
    this.minIntervalMs = minIntervalMs;
    this.running = 0;
    this.queue = [];
    this.lastCallTime = 0;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLast = now - this.lastCallTime;
    if (timeSinceLast < this.minIntervalMs) {
      setTimeout(() => this.processQueue(), this.minIntervalMs - timeSinceLast);
      return;
    }

    const { fn, resolve, reject } = this.queue.shift();
    this.running++;
    this.lastCallTime = Date.now();

    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

const geminiLimiter = new RateLimiter(2, 600);

export async function callGemini({ prompt, systemPrompt = 'You are an expert AI security and test engineering agent.', apiKey, model = 'gemini-2.5-flash' }) {
  const effectiveKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || apiKey;
  if (!effectiveKey || typeof effectiveKey !== 'string' || !effectiveKey.trim()) return null;

  return geminiLimiter.enqueue(async () => {
    let retries = 3;
    let delayMs = 1000;

    while (retries > 0) {
      try {
        console.log(`[LLM Service] Calling Google Gemini API model ${model}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey.trim()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429 || response.status === 503) {
          console.warn(`[LLM Service Warning] Gemini API returned HTTP ${response.status} Rate Limit. Retrying in ${delayMs}ms... (Retries left: ${retries - 1})`);
          await new Promise(res => setTimeout(res, delayMs));
          delayMs *= 2;
          retries--;
          continue;
        }

        if (!response.ok) {
          const errorPayload = await response.text().catch(() => '');
          console.log(`[LLM Service] Gemini API returned HTTP ${response.status}: ${errorPayload.substring(0, 150)}. Falling back to static engine.`);
          return null;
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        return content;
      } catch (err) {
        if (retries <= 1) {
          console.error('[Gemini API Exception]:', err.name === 'AbortError' ? 'Request timed out' : err.message);
          return null;
        }
        await new Promise(res => setTimeout(res, delayMs));
        delayMs *= 2;
        retries--;
      }
    }

    return null;
  });
}

// Alias for backwards compatibility
export const callOpenAI = callGemini;
