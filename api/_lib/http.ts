import { HttpError } from './payments.js';
import { adminClient } from './supabaseStore.js';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Resolves the caller from their Supabase access token (verified by Supabase Auth, never trusted from the body). */
export async function requireUser(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required.');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  return data.user.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readId(request: Request, field: string): Promise<string> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const value = body[field];
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `Invalid ${field}.`);
  return value;
}

/** Maps known errors to safe responses; logs the rest without leaking details. */
export function fail(error: unknown): Response {
  if (error instanceof HttpError) return json(error.status, { error: error.message });
  const message = error instanceof Error ? error.message : String(error);
  // Database functions raise user-facing messages for validation failures.
  if (/not found|not awaiting payment|payment window|Nothing is due|at least PHP|suspended/i.test(message)) return json(409, { error: message });
  console.error('[api]', message);
  return json(500, { error: 'Something went wrong. Please try again.' });
}
