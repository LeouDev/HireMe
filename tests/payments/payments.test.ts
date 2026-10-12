// Payment layer tests: api/_lib/payments.ts running against the real SQL functions (PGlite)
// with a fake PayMongo provider. No network calls; no real money.
import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCheckout, executeRefund, handleWebhook, syncBooking, type Deps, type PaymentRecordRow, type PaymentStore } from '../../api/_lib/payments.js';
import { verifyWebhookSignature, type CheckoutInput, type CheckoutSession, type PaymentProvider } from '../../api/_lib/paymongo.js';
import { createTestDb, type TestDb } from '../db/harness.js';

const SECRET = 'whsk_test_secret';
let t: TestDb;
let customer: string;
let stranger: string;
let admin: string;
let bookingId: string;

function pgliteStore(db: TestDb): PaymentStore {
  const one = async <T>(sql: string, params: unknown[]) => (await db.q<T>('service', sql, params))[0] ?? null;
  const cols = 'id, booking_id, amount_cents::int as amount_cents, status, purpose, provider_checkout_id, provider_payment_intent_id, checkout_url, livemode';
  return {
    prepareCheckout: async (b, u) => (await one<PaymentRecordRow>(`select ${cols} from public.payment_prepare_checkout($1, $2)`, [b, u]))!,
    attachCheckout: async (r, c, i, url, live) => { await db.q('service', `select public.payment_attach_checkout($1, $2, $3, $4, $5)`, [r, c, i, url, live]); },
    markPaid: async (r, p, amt, at) => { await db.q('service', `select public.payment_mark_paid($1, $2, $3, $4)`, [r, p, amt, at]); },
    markFailed: async (r, s, reason) => { await db.q('service', `select public.payment_mark_failed($1, $2, $3)`, [r, s, reason]); },
    findRecord: async ({ checkoutId, intentId, recordId }) =>
      (checkoutId && (await one<PaymentRecordRow>(`select ${cols} from public.payment_records where provider_checkout_id = $1`, [checkoutId])))
      || (intentId && (await one<PaymentRecordRow>(`select ${cols} from public.payment_records where provider_payment_intent_id = $1`, [intentId])))
      || (recordId && (await one<PaymentRecordRow>(`select ${cols} from public.payment_records where id = $1`, [recordId])))
      || null,
    pendingRecords: async (b) => db.q<PaymentRecordRow>('service', `select ${cols} from public.payment_records where booking_id = $1 and status = 'pending'`, [b]),
    bookingSummary: async (b) => one(`select b.booking_number, coalesce(s.name, 'Booking') as title, b.customer_id, p.user_id as professional_user_id, b.status, b.payment_status
      from public.bookings b join public.professional_profiles p on p.id = b.professional_id left join public.services s on s.id = b.service_id where b.id = $1`, [b]),
    beginEvent: async (id, type, live, payload) => (await one<{ r: 'new' | 'retry' | 'duplicate' }>(`select public.webhook_event_begin($1, $2, $3, $4) as r`, [id, type, live, JSON.stringify(payload)]))!.r,
    finishEvent: async (id, err) => { await db.q('service', `select public.webhook_event_finish($1, $2)`, [id, err]); },
    isAdmin: async (u) => !!(await one(`select 1 from public.user_roles where user_id = $1 and role = 'admin'`, [u])),
    getRefund: async (id) => {
      const r = await one<{ id: string; status: string; amount_cents: number; booking_id: string; provider_payment_id: string | null; livemode: boolean | null }>(
        `select r.id, r.status, r.amount_cents::int as amount_cents, r.booking_id, p.provider_payment_id, p.livemode from public.refunds r join public.payment_records p on p.id = r.payment_record_id where r.id = $1`, [id]);
      return r && { ...r, payment: { provider_payment_id: r.provider_payment_id, livemode: r.livemode } };
    },
    findRefundByProviderId: async (id) => one(`select id from public.refunds where provider_refund_id = $1`, [id]),
    markRefund: async (id, s, pid, f) => { await db.q('service', `select public.refund_mark_result($1, $2, $3, $4)`, [id, s, pid, f]); },
  };
}

class FakePayMongo implements PaymentProvider {
  sessions = new Map<string, CheckoutSession>();
  created: CheckoutInput[] = [];
  refunds: { idempotencyKey: string; paymentId: string; amountCents: number }[] = [];
  async createCheckout(input: CheckoutInput) {
    this.created.push(input);
    const id = `cs_test${this.created.length}`;
    const s: CheckoutSession = { id, checkoutUrl: `https://checkout.paymongo.test/${id}`, status: 'active', livemode: false, paymentIntentId: `pi_test${this.created.length}`, payments: [] };
    this.sessions.set(id, s);
    return s;
  }
  async retrieveCheckout(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error('not found');
    return s;
  }
  async createRefund(input: { idempotencyKey: string; paymentId: string; amountCents: number }) {
    this.refunds.push(input);
    return { id: `ref_test${this.refunds.length}`, status: 'pending' };
  }
}

let provider: FakePayMongo;
let deps: Deps;
const config = { appUrl: 'https://hireme.test', paymentMethodTypes: ['card', 'gcash'], webhookSecret: SECRET, enabled: true };

function signed(body: object, mode: 'te' | 'li' = 'te', secret = SECRET) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return { raw, header: `t=${ts},te=${mode === 'te' ? sig : ''},li=${mode === 'li' ? sig : ''}` };
}
const event = (id: string, type: string, data: object, livemode = false) => ({ data: { id, type: 'event', attributes: { type, livemode, data } } });
const booking = async () => (await t.q<{ status: string; payment_status: string; amount_paid_cents: string }>('service', `select status, payment_status, amount_paid_cents from public.bookings where id = $1`, [bookingId]))[0]!;

beforeAll(async () => {
  t = await createTestDb();
  const proUser = await t.createUser('pro@example.test', 'Ana Electric');
  customer = await t.createUser('cust@example.test', 'Ben Cruz');
  stranger = await t.createUser('x@example.test', 'Xavier');
  admin = await t.createUser('admin@example.test', 'Admin');
  await t.makeAdmin(admin);
  const pro = (await t.q<{ id: string }>(proUser, `select id from public.become_professional('Ana Electric', 'Cebu City')`))[0]!;
  await t.q(proUser, `update public.professional_profiles set headline = 'Electrician' where id = $1`, [pro.id]);
  await t.q(proUser, `insert into public.professional_categories (professional_id, category_id) select $1, id from public.service_categories where slug = 'electrical'`, [pro.id]);
  const svc = (await t.q<{ id: string }>(proUser, `insert into public.services (professional_id, name, slug, pricing_model, price_cents, duration_minutes, instant_booking, status)
    values ($1, 'Outlet installation', 'outlet', 'fixed', 120000, 60, true, 'active') returning id`, [pro.id]))[0]!;
  await t.q(proUser, `insert into public.availability_rules (professional_id, weekday, start_time, end_time) select $1, d, '08:00', '18:00' from generate_series(0, 6) d`, [pro.id]);
  await t.q(proUser, `select public.set_profile_published(true)`);
  const slot = (await t.q<{ s: string }>(customer, `select s from public.get_available_slots($1, public.today_manila() + 3, public.today_manila() + 3, 60) s limit 1`, [pro.id]))[0]!;
  bookingId = (await t.q<{ id: string }>(customer, `select public.create_instant_booking($1, $2, 'Cebu City', '12 Acacia St') as id`, [svc.id, slot.s]))[0]!.id;
});

beforeEach(() => {
  provider ??= new FakePayMongo();
  deps = { store: pgliteStore(t), provider, config };
});

describe('webhook signature', () => {
  it('accepts only HMAC-SHA256 of "t.rawBody" with the webhook secret', () => {
    const { raw, header } = signed({ a: 1 });
    expect(verifyWebhookSignature(raw, header, SECRET)).toEqual({ livemode: false });
    expect(verifyWebhookSignature(raw, header, 'wrong')).toBeNull();
    expect(verifyWebhookSignature(`${raw} `, header, SECRET)).toBeNull(); // body altered
    expect(verifyWebhookSignature(raw, null, SECRET)).toBeNull();
    const live = signed({ a: 1 }, 'li');
    expect(verifyWebhookSignature(live.raw, live.header, SECRET)).toEqual({ livemode: true });
  });
});

describe('checkout', () => {
  it('refuses when payments are not configured or live mode is not approved', async () => {
    await expect(createCheckout({ ...deps, config: { ...config, enabled: false, disabledReason: 'Live payments are disabled' } }, customer, bookingId))
      .rejects.toMatchObject({ status: 503 });
  });

  it('only lets the booking customer start checkout, with the database amount', async () => {
    await expect(createCheckout(deps, stranger, bookingId)).rejects.toThrow(/not found/);
    const first = await createCheckout(deps, customer, bookingId);
    expect(first.checkoutUrl).toBe('https://checkout.paymongo.test/cs_test1');
    expect(provider.created[0]!.amountCents).toBe(120000);
    expect(provider.created[0]!.successUrl).toBe(`https://hireme.test/payments/return?booking=${bookingId}`);
    // Clicking "Pay" again reuses the open session instead of creating another.
    const again = await createCheckout(deps, customer, bookingId);
    expect(again.checkoutUrl).toBe(first.checkoutUrl);
    expect(provider.created).toHaveLength(1);
    expect((await booking()).payment_status).toBe('pending');
  });
});

describe('webhooks', () => {
  it('rejects unsigned, mis-signed and mode-mismatched deliveries', async () => {
    const body = event('evt_bad', 'checkout_session.payment.paid', { id: 'cs_test1', type: 'checkout_session', attributes: {} });
    expect((await handleWebhook(deps, JSON.stringify(body), null)).status).toBe(401);
    const forged = signed(body, 'te', 'not-the-secret');
    expect((await handleWebhook(deps, forged.raw, forged.header)).status).toBe(401);
    const mismatch = signed(event('evt_mode', 'checkout_session.payment.paid', { id: 'cs_test1' }, true), 'te');
    expect((await handleWebhook(deps, mismatch.raw, mismatch.header)).status).toBe(400);
    expect((await booking()).status).toBe('awaiting_payment');
  });

  it('does not mark paid until PayMongo itself reports a paid payment', async () => {
    const { raw, header } = signed(event('evt_early', 'checkout_session.payment.paid', { id: 'cs_test1', type: 'checkout_session', attributes: {} }));
    expect((await handleWebhook(deps, raw, header)).status).toBe(200);
    expect((await booking()).status).toBe('awaiting_payment');
  });

  it('flags an amount that differs from what was charged and does not confirm', async () => {
    provider.sessions.get('cs_test1')!.payments = [{ id: 'pay_wrong', status: 'paid', amountCents: 100, paidAt: new Date().toISOString() }];
    const { raw, header } = signed(event('evt_wrong', 'checkout_session.payment.paid', { id: 'cs_test1', type: 'checkout_session', attributes: {} }));
    const res = await handleWebhook(deps, raw, header);
    expect(res).toMatchObject({ status: 200, body: { flagged: true } });
    expect((await booking()).status).toBe('awaiting_payment');
  });

  it('confirms the booking once, even when PayMongo retries the delivery', async () => {
    provider.sessions.get('cs_test1')!.payments = [{ id: 'pay_ok', status: 'paid', amountCents: 120000, paidAt: new Date().toISOString() }];
    const { raw, header } = signed(event('evt_paid', 'checkout_session.payment.paid', { id: 'cs_test1', type: 'checkout_session', attributes: {} }));
    expect((await handleWebhook(deps, raw, header)).status).toBe(200);
    expect((await handleWebhook(deps, raw, header)).body).toMatchObject({ duplicate: true });
    const b = await booking();
    expect(b).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    expect(Number(b.amount_paid_cents)).toBe(120000);
    const notes = await t.q('service', `select id from public.notifications where user_id = $1 and type = 'payment_paid'`, [customer]);
    expect(notes).toHaveLength(1);
    await expect(createCheckout(deps, customer, bookingId)).rejects.toThrow(/not awaiting payment/);
  });

  it('lets parties re-sync status but not strangers', async () => {
    await expect(syncBooking(deps, stranger, bookingId)).rejects.toMatchObject({ status: 404 });
    expect(await syncBooking(deps, customer, bookingId)).toEqual({ bookingStatus: 'confirmed', paymentStatus: 'paid' });
  });
});

describe('refunds', () => {
  it('executes only admin-approved refunds, idempotently, and applies the provider result', async () => {
    // Cancel by agreement → refund queued for review (no money moves yet).
    const proUserId = (await t.q<{ user_id: string }>('service', `select p.user_id from public.bookings b join public.professional_profiles p on p.id = b.professional_id where b.id = $1`, [bookingId]))[0]!.user_id;
    await t.q(customer, `select public.booking_action($1, 'cancel', 'Moving house')`, [bookingId]);
    await t.q(proUserId, `select public.booking_action($1, 'approve_cancellation')`, [bookingId]);
    const refund = (await t.q<{ id: string; status: string }>('service', `select id, status from public.refunds where booking_id = $1`, [bookingId]))[0]!;
    expect(refund.status).toBe('pending_review');
    await expect(executeRefund(deps, admin, refund.id)).rejects.toMatchObject({ status: 409 }); // not approved yet
    await t.q(admin, `select public.admin_decide_refund($1, true, 'Approved per policy')`, [refund.id]);
    await expect(executeRefund(deps, customer, refund.id)).rejects.toMatchObject({ status: 403 });
    expect(await executeRefund(deps, admin, refund.id)).toEqual({ status: 'processing' });
    expect(provider.refunds[0]).toMatchObject({ idempotencyKey: refund.id, paymentId: 'pay_ok', amountCents: 120000 });

    const { raw, header } = signed(event('evt_ref', 'payment.refund.updated', { id: 'ref_test1', type: 'refund', attributes: { status: 'succeeded' } }));
    expect((await handleWebhook(deps, raw, header)).status).toBe(200);
    const after = (await t.q<{ status: string }>('service', `select status from public.refunds where id = $1`, [refund.id]))[0]!;
    expect(after.status).toBe('succeeded');
    expect((await booking()).payment_status).toBe('refunded');
  });
});
