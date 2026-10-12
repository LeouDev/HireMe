// PaymentStore backed by Supabase with the service role. All state changes call SQL functions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.js';
import { supabaseEnv } from './env.js';
import type { PaymentRecordRow, PaymentStore } from './payments.js';

let client: SupabaseClient<Database> | null = null;
export function adminClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, serviceRoleKey } = supabaseEnv();
    client = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// Generated RPC types mark SQL text parameters as non-null strings, but the functions accept NULL.
const sqlNull = <T>(v: T | null | undefined) => (v ?? null) as T;

const RECORD_COLUMNS = 'id, booking_id, amount_cents, status, purpose, provider_checkout_id, provider_payment_intent_id, checkout_url, livemode';

export function supabaseStore(db: SupabaseClient<Database> = adminClient()): PaymentStore {
  return {
    async prepareCheckout(bookingId, userId) {
      return check(await db.rpc('payment_prepare_checkout', { p_booking_id: bookingId, p_user_id: userId })) as PaymentRecordRow;
    },
    async attachCheckout(recordId, checkoutId, intentId, url, livemode) {
      check(await db.rpc('payment_attach_checkout', { p_record_id: recordId, p_checkout_id: checkoutId, p_payment_intent_id: sqlNull<string>(intentId), p_checkout_url: url, p_livemode: livemode }));
    },
    async markPaid(recordId, providerPaymentId, amountCents, paidAt) {
      check(await db.rpc('payment_mark_paid', { p_record_id: recordId, p_provider_payment_id: providerPaymentId, p_amount_cents: amountCents, p_paid_at: paidAt ?? new Date().toISOString() }));
    },
    async markFailed(recordId, status, reason) {
      check(await db.rpc('payment_mark_failed', { p_record_id: recordId, p_status: status, p_reason: reason }));
    },
    async findRecord({ checkoutId, intentId, recordId }) {
      const tries: [string, string | undefined][] = [['provider_checkout_id', checkoutId], ['provider_payment_intent_id', intentId], ['id', recordId]];
      for (const [column, value] of tries) {
        if (!value) continue;
        const row = check(await db.from('payment_records').select(RECORD_COLUMNS).eq(column as 'id', value).maybeSingle());
        if (row) return row as PaymentRecordRow;
      }
      return null;
    },
    async pendingRecords(bookingId) {
      return check(await db.from('payment_records').select(RECORD_COLUMNS).eq('booking_id', bookingId).eq('status', 'pending')) as PaymentRecordRow[];
    },
    async bookingSummary(bookingId) {
      const b = check(await db.from('bookings')
        .select('booking_number, customer_id, status, payment_status, service:services(name), quotation:quotations(title), professional:professional_profiles(user_id)')
        .eq('id', bookingId).maybeSingle());
      if (!b) return null;
      return {
        booking_number: b.booking_number,
        title: b.service?.name ?? b.quotation?.title ?? 'Service booking',
        customer_id: b.customer_id,
        professional_user_id: b.professional?.user_id ?? null,
        status: b.status,
        payment_status: b.payment_status,
      };
    },
    async beginEvent(id, type, livemode, payload) {
      return check(await db.rpc('webhook_event_begin', { p_event_id: id, p_type: type, p_livemode: livemode, p_payload: payload as never })) as 'new' | 'retry' | 'duplicate';
    },
    async finishEvent(id, error) {
      check(await db.rpc('webhook_event_finish', { p_event_id: id, p_error: sqlNull<string>(error) }));
    },
    async isAdmin(userId) {
      const rows = check(await db.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin'));
      return (rows ?? []).length > 0;
    },
    async getRefund(refundId) {
      const r = check(await db.from('refunds').select('id, status, amount_cents, booking_id, payment:payment_records(provider_payment_id, livemode)').eq('id', refundId).maybeSingle());
      return r ?? null;
    },
    async findRefundByProviderId(providerRefundId) {
      return check(await db.from('refunds').select('id').eq('provider_refund_id', providerRefundId).maybeSingle());
    },
    async markRefund(refundId, status, providerRefundId, failure) {
      check(await db.rpc('refund_mark_result', { p_refund_id: refundId, p_status: status, p_provider_refund_id: sqlNull<string>(providerRefundId), p_failure: sqlNull<string>(failure) }));
    },
  };
}
