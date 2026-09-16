// Single source of truth for which Gemini model the server-side API routes call.
//
// RULE: always use one of Google's `-latest` aliases here, never a dated /
// versioned snapshot (e.g. `gemini-1.5-flash`, `gemini-2.0-flash-001`).
// Google periodically sunsets dated snapshots -- that exact mistake took down
// /api/transcribe, /api/extract, and /api/generate-digest in production on
// 2026-08-12 when `gemini-1.5-flash` started returning 404s. `-latest`
// aliases are maintained by Google to keep resolving to their current stable
// model, so this file should not need to change just because Google ships a
// new version.
//
// NOTE: importing this from an api/*.ts route requires the explicit `.js`
// extension -- `from '../src/lib/geminiConfig.js'`, not `'...geminiConfig'`.
// package.json has "type": "module", so Vercel's Node runtime resolves
// api/*.ts relative imports with Node's native ESM loader, not a bundler.
// Native ESM requires explicit file extensions on relative imports; without
// one, Node throws ERR_MODULE_NOT_FOUND at module-load time (before the
// handler runs), which surfaces as a bare FUNCTION_INVOCATION_FAILED with no
// useful stack trace. This built and typechecked fine locally both times
// (`tsc`/`vite build` don't enforce Node's ESM extension rules) and only
// failed at actual runtime -- confirmed via a real preview deployment, not
// local build success. If you add another relative import to an api/*.ts
// file, give it a `.js` extension and verify on a preview deployment (push
// to a non-main branch) before merging to main.
//
// If this ever needs to change, change it here only -- do not hardcode a
// model string inline in an api/*.ts route again.
export const GEMINI_MODEL = 'gemini-flash-latest';

// ---------------------------------------------------------------------------
// Cost and latency bounds.
//
// These live here for the same reason GEMINI_MODEL does: all three routes need
// them, and the last time a per-route value was inlined in three places, two of
// them got missed when the third was changed.
//
// Context (measured against production on 2026-09-16): the free tier returns
// `503 high demand` under load, and a single /api/extract call was observed
// running 181 seconds before failing. @google/generative-ai applies NO default
// timeout and has NO retry logic -- it only wires up an AbortController when
// `timeout` is passed in RequestOptions -- so nothing was bounding that call.
// ---------------------------------------------------------------------------

/**
 * Hard per-request timeout handed to the SDK's RequestOptions.
 *
 * Sized against the function budget, not picked freely: vercel.json caps these
 * functions at 60s, and the worst case here is two attempts plus the backoff
 * (25 + 1.5 + 25 = 51.5s), which has to fit inside that. Raising this means
 * raising maxDuration too, and Vercel's own ceiling depends on the plan.
 *
 * On the free Gemini tier -- where calls were measured at 45-98s -- this will
 * often time out. That is the intended behaviour: a bounded, visible failure
 * with a retry beats a spinner that hangs for three minutes. Expect calls to
 * land well inside 25s once API billing is enabled.
 */
export const GEMINI_TIMEOUT_MS = 25_000;

/** Attempts per call, total (not additional retries). Only retried on a
 *  retryable status -- see isRetryableGeminiError. Keep this small: each
 *  attempt is a billable call and the caller is a person on a phone. */
export const GEMINI_MAX_ATTEMPTS = 2;

/** Backoff before the second attempt. */
export const GEMINI_RETRY_DELAY_MS = 1_500;

/**
 * Output token ceilings. Output is priced ~8x input on the Flash tier, so this
 * is the cost lever that matters. Sized from observed real responses with
 * headroom: extraction JSON ran ~500 tokens, a transcript ~400, a digest ~600.
 */
export const MAX_OUTPUT_TOKENS = {
  transcribe: 2_048,
  extract: 2_048,
  digest: 2_048
} as const;

/**
 * Upper bound on transcript text accepted by /api/extract. Nothing previously
 * bounded this, so a pathological client could send an arbitrarily large body
 * and bill it to the project. ~12k characters is far longer than any real
 * spoken site log (the live ones run 200-400 characters).
 */
export const MAX_TRANSCRIPT_CHARS = 12_000;

/** Ceiling on inline audio accepted by /api/transcribe, in base64 characters.
 *  ~8MB of base64 is roughly 6MB of audio -- far more than a site memo. */
export const MAX_AUDIO_BASE64_CHARS = 8_000_000;

/** Per-user, per-route, per-day call ceiling. Enforced in the database so it
 *  survives across serverless invocations. At ~$0.003 a log this caps a single
 *  runaway client at cents rather than an open-ended bill. */
export const AI_DAILY_CALL_LIMIT = Number(process.env.AI_DAILY_CALL_LIMIT) || 200;

/** Retry only on transport/capacity failures, never on a 4xx we caused. */
export function isRetryableGeminiError(err: unknown): boolean {
  const message = String((err as any)?.message || err || '');
  return /\b(429|500|502|503|504)\b/.test(message) || /timeout|aborted|ECONNRESET|fetch failed/i.test(message);
}
