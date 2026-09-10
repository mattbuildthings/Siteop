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

export function createUserClient(accessToken: string | null): SupabaseClient | null {
  if (!hasSupabaseConfig()) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}
  });
}
