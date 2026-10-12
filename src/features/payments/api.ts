import { supabase } from '@/lib/supabase';

/** Calls a server function with the signed-in user's access token. The server re-checks everything. */
async function callServer<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You need to sign in to do that.');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? 'The payment service is unavailable. Try again later.');
  return json;
}

/** Creates (or reuses) a PayMongo checkout session for the amount the database says is due. */
export const startCheckout = (bookingId: string) => callServer<{ checkoutUrl: string }>('/api/payments/checkout', { bookingId });

/** Asks the server to re-verify pending payments with PayMongo (in case a webhook is delayed). */
export const syncPayment = (bookingId: string) =>
  callServer<{ bookingStatus: string; paymentStatus: string }>('/api/payments/sync', { bookingId });

/** Admin: send an approved refund to PayMongo. */
export const executeRefund = (refundId: string) => callServer<{ status: string }>('/api/payments/refund', { refundId });
