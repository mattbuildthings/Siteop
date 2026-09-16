import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client factory for the `api/*.ts` serverless routes.
 *
 * RLS is no longer `USING (true)` (see the 20260909 migration), so a route that
 * builds a plain anon client can no longer write to diary_entries, entry_flags
 * or the digests -- the write is rejected and the user sees a silent no-op.
 *
 * The client forwards the signed-in user's access token; this builds a client
 * that carries it, so every server-side write runs AS that user and is subject
 * to exactly the same policies as a write from the browser. No service-role key
 * is involved, so a bug here cannot escalate past what the user could already do.
 *
 * NOTE: importing this from an api/*.ts route requires the explicit `.js`
 * extension -- `from '../src/lib/serverSupabase.js'`. package.json has
 * "type": "module", so Vercel's Node runtime resolves api/*.ts relative imports
 * with Node's native ESM loader, which requires file extensions. See AGENTS.md #3.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** Pulls the caller's token from the JSON body or the Authorization header. */
export function readAccessToken(req: { body?: any; headers?: Record<string, any> }): string | null {
  const fromBody = req.body && typeof req.body === 'object' ? req.body.accessToken : null;
  if (fromBody && typeof fromBody === 'string') return fromBody;

  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.substring(7).trim();
  }

  return null;
}

/**
 * Resolves the caller to a real Supabase user, or null.
 *
 * The three AI routes previously accepted an unauthenticated POST: a plain
 * `curl` to /api/extract with no token returned a full Gemini extraction, which
 * means anyone holding the public URL could spend the project's Gemini quota.
 * Requiring a user is also what makes a per-user call ceiling meaningful --
 * there is nothing to count against otherwise.
 */
export async function requireUser(
  accessToken: string | null
): Promise<{ client: SupabaseClient; userId: string } | null> {
  if (!accessToken) return null;

  const client = createUserClient(accessToken);
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;

  return { client, userId: data.user.id };
}

/**
 * Increments this user's daily counter for `route` and reports whether they are
 * still under the ceiling.
 *
 * The counting lives in a SECURITY DEFINER function (see the 20260916
 * migration) rather than a plain table write, so a user cannot reset or
 * decrement their own counter from the browser with the same anon key.
 *
 * Fails OPEN on an unexpected error: an AI feature that stops working because
 * the counter is unavailable is a worse outcome than one extra call. A missing
 * function (migration not yet applied) therefore logs and allows.
 */
export async function bumpAiUsage(
  client: SupabaseClient,
  route: string,
  dailyLimit: number
): Promise<{ allowed: boolean; calls: number | null }> {
  try {
    const { data, error } = await client.rpc('siteop_bump_ai_usage', {
      p_route: route,
      p_limit: dailyLimit
    });

    if (error) {
      console.warn(`[ai-usage] counter unavailable for ${route}, allowing call:`, error.message);
      return { allowed: true, calls: null };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: row?.allowed !== false, calls: row?.calls ?? null };
  } catch (err: any) {
    console.warn(`[ai-usage] counter threw for ${route}, allowing call:`, err?.message);
    return { allowed: true, calls: null };
  }
}

export function createUserClient(accessToken: string | null): SupabaseClient | null {
  if (!hasSupabaseConfig()) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}
  });
}
