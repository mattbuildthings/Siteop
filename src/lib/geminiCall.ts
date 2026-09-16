import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  GEMINI_MAX_ATTEMPTS,
  GEMINI_MODEL,
  GEMINI_RETRY_DELAY_MS,
  GEMINI_TIMEOUT_MS,
  isRetryableGeminiError
} from './geminiConfig.js';

/**
 * The one place an api/*.ts route talks to Gemini.
 *
 * Everything that has to hold for every call -- the model name, a hard request
 * timeout, an output-token ceiling, and a bounded retry -- lives here so it
 * cannot drift between the three routes. AGENTS.md #1 records what happened
 * last time a per-route Gemini detail was inlined in three files: two of them
 * were missed when the third was fixed, and production broke for days.
 *
 * On timeouts specifically: @google/generative-ai applies NO default timeout
 * and performs NO retries. It only wires an AbortController when `timeout` is
 * passed in RequestOptions. Without that, a slow/overloaded endpoint holds the
 * request indefinitely -- an /api/extract call was measured at 181 seconds
 * against production on 2026-09-16 before returning `503 high demand`.
 *
 * NOTE: importing this from an api/*.ts route requires the explicit `.js`
 * extension -- `from '../src/lib/geminiCall.js'`. See AGENTS.md #3.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GeminiCallResult {
  text: string;
  attempts: number;
  durationMs: number;
}

export async function generateWithLimits(
  apiKey: string,
  parts: Array<string | Part>,
  options: { maxOutputTokens: number; label: string }
): Promise<GeminiCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel(
    {
      model: GEMINI_MODEL,
      generationConfig: { maxOutputTokens: options.maxOutputTokens }
    },
    { timeout: GEMINI_TIMEOUT_MS }
  );

  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(parts);
      return {
        text: result.response.text(),
        attempts: attempt,
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      lastError = err;

      // A 4xx we caused (bad request, bad key, unsupported mime type) will fail
      // identically on a second attempt -- retrying it just doubles the bill.
      const retryable = isRetryableGeminiError(err);
      console.warn(
        `[gemini:${options.label}] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} failed` +
          ` after ${Date.now() - startedAt}ms (retryable=${retryable}):`,
        (err as any)?.message || err
      );

      if (!retryable || attempt === GEMINI_MAX_ATTEMPTS) break;
      await sleep(GEMINI_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
