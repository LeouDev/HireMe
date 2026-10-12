// GET /api/cron/expire — daily housekeeping (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
// Expires stale quotations, unpaid booking holds and unanswered requests.
import { json } from '../_lib/http.js';
import { adminClient } from '../_lib/supabaseStore.js';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { error: 'Unauthorized' });
  const { data, error } = await adminClient().rpc('expire_stale_records');
  if (error) {
    console.error('[cron]', error.message);
    return json(500, { error: 'Failed' });
  }
  return json(200, data);
}
