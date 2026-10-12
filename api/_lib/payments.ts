// Payment business logic. Depends only on two interfaces so it can be tested against the real
// database functions (tests/db) with a fake provider:
//   PaymentStore    — our database (service role); every state change goes through SQL functions.
//   PaymentProvider — PayMongo.
// Rules enforced here: amounts come from the database, never the browser; payment success is only
// recorded after re-reading the checkout session from PayMongo; webhook deliveries are idempotent.
import { verifyWebhookSignature, type PaymentProvider } from './paymongo.js';

export interface PaymentRecordRow {
  id: string;
  booking_id: string;
  amount_cents: number;
  status: string;
  purpose: string;
  provider_checkout_id: string | null;
  provider_payment_intent_id: string | null;
  checkout_url: string | null;
  livemode: boolean | null;
}

export interface RefundRow {
  id: string;
  status: string;
  amount_cents: number;
  booking_id: string;
  payment: { provider_payment_id: string | null; livemode: boolean | null } | null;
}

export interface PaymentStore {
  prepareCheckout(bookingId: string, userId: string): Promise<PaymentRecordRow>;
  attachCheckout(recordId: string, checkoutId: string, intentId: string | null, url: string, livemode: boolean): Promise<void>;
  markPaid(recordId: string, providerPaymentId: string, amountCents: number, paidAt: string | null): Promise<void>;
  markFailed(recordId: string, status: 'failed' | 'expired' | 'cancelled', reason: string): Promise<void>;
  findRecord(by: { checkoutId?: string; intentId?: string; recordId?: string }): Promise<PaymentRecordRow | null>;
  pendingRecords(bookingId: string): Promise<PaymentRecordRow[]>;
  bookingSummary(bookingId: string): Promise<{ booking_number: string; title: string; customer_id: string; professional_user_id: string | null; status: string; payment_status: string } | null>;
  beginEvent(id: string, type: string, livemode: boolean, payload: unknown): Promise<'new' | 'retry' | 'duplicate'>;
  finishEvent(id: string, error: string | null): Promise<void>;
  isAdmin(userId: string): Promise<boolean>;
  getRefund(refundId: string): Promise<RefundRow | null>;
  findRefundByProviderId(providerRefundId: string): Promise<{ id: string } | null>;
  markRefund(refundId: string, status: 'processing' | 'succeeded' | 'failed', providerRefundId: string | null, failure: string | null): Promise<void>;
}

export interface PaymentConfig {
  appUrl: string;
  paymentMethodTypes: string[];
  webhookSecret: string;
  /** False when PAYMONGO_SECRET_KEY is missing, or is a live key without merchant approval. */
  enabled: boolean;
  disabledReason?: string;
}

export interface Deps {
  store: PaymentStore;
  provider: PaymentProvider | null;
  config: PaymentConfig;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function requireProvider(deps: Deps): PaymentProvider {
  if (!deps.config.enabled || !deps.provider) throw new HttpError(503, deps.config.disabledReason ?? 'Online payments are not configured yet.');
  return deps.provider;
}

/** Applies the provider's view of a checkout session to our record. Returns true if paid. */
async function reconcile(deps: Deps, record: PaymentRecordRow): Promise<boolean> {
  if (!record.provider_checkout_id) return false;
  const provider = requireProvider(deps);
  const session = await provider.retrieveCheckout(record.provider_checkout_id);
  const paid = session.payments.find((p) => p.status === 'paid');
  if (paid) {
    // The SQL function rejects (and logs) an amount that differs from what we asked for.
    await deps.store.markPaid(record.id, paid.id, paid.amountCents, paid.paidAt);
    return true;
  }
  if (session.status === 'expired') await deps.store.markFailed(record.id, 'expired', 'Checkout session expired');
  return false;
}

export async function createCheckout(deps: Deps, userId: string, bookingId: string): Promise<{ checkoutUrl: string }> {
  const provider = requireProvider(deps);
  for (let attempt = 0; attempt < 2; attempt++) {
    const record = await deps.store.prepareCheckout(bookingId, userId);
    if (record.provider_checkout_id) {
      // Reuse an existing session unless it already completed or expired.
      const session = await provider.retrieveCheckout(record.provider_checkout_id);
      if (session.payments.some((p) => p.status === 'paid')) {
        await reconcile(deps, record);
        throw new HttpError(409, 'This booking has already been paid.');
      }
      if (session.status === 'active' && session.checkoutUrl) return { checkoutUrl: session.checkoutUrl };
      await deps.store.markFailed(record.id, 'expired', 'Checkout session expired');
      continue; // prepareCheckout creates a fresh record
    }
    const booking = await deps.store.bookingSummary(bookingId);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    const label = record.purpose === 'booking_deposit' ? 'Deposit' : 'Payment';
    const session = await provider.createCheckout({
      idempotencyKey: record.id,
      referenceNumber: record.id,
      amountCents: record.amount_cents,
      name: `${label} — ${booking.title}`.slice(0, 120),
      description: `${label} for booking ${booking.booking_number} on Hire Me!`,
      successUrl: `${deps.config.appUrl}/payments/return?booking=${bookingId}`,
      cancelUrl: `${deps.config.appUrl}/payments/return?booking=${bookingId}&result=cancelled`,
      paymentMethodTypes: deps.config.paymentMethodTypes,
      metadata: { payment_record_id: record.id, booking_id: bookingId },
    });
    await deps.store.attachCheckout(record.id, session.id, session.paymentIntentId, session.checkoutUrl, session.livemode);
    return { checkoutUrl: session.checkoutUrl };
  }
  throw new HttpError(409, 'Could not start checkout. Please try again.');
}

export async function syncBooking(deps: Deps, userId: string, bookingId: string) {
  const booking = await deps.store.bookingSummary(bookingId);
  if (!booking || (booking.customer_id !== userId && booking.professional_user_id !== userId)) throw new HttpError(404, 'Booking not found.');
  if (deps.config.enabled && deps.provider) {
    for (const record of await deps.store.pendingRecords(bookingId)) await reconcile(deps, record);
  }
  const fresh = await deps.store.bookingSummary(bookingId);
  return { bookingStatus: fresh!.status, paymentStatus: fresh!.payment_status };
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/** Handles a PayMongo webhook delivery. Returns the HTTP status to respond with. */
export async function handleWebhook(deps: Deps, rawBody: string, signature: string | null): Promise<{ status: number; body: Json }> {
  const verified = verifyWebhookSignature(rawBody, signature, deps.config.webhookSecret);
  if (!verified) return { status: 401, body: { error: 'Invalid signature' } };

  let event: Json;
  try {
    event = obj(obj(JSON.parse(rawBody)).data);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  const attrs = obj(event.attributes);
  const eventId = String(event.id ?? '');
  const type = String(attrs.type ?? '');
  if (!eventId || !type) return { status: 400, body: { error: 'Malformed event' } };
  // The signature proves which mode signed it; the payload must agree.
  if (attrs.livemode !== verified.livemode) return { status: 400, body: { error: 'Mode mismatch' } };

  const state = await deps.store.beginEvent(eventId, type, verified.livemode, JSON.parse(rawBody));
  if (state === 'duplicate') return { status: 200, body: { received: true, duplicate: true } };

  try {
    const resource = obj(attrs.data);
    const resAttrs = obj(resource.attributes);
    switch (type) {
      case 'checkout_session.payment.paid': {
        const record = await deps.store.findRecord({ checkoutId: String(resource.id), recordId: obj(resAttrs.metadata).payment_record_id as string | undefined });
        if (record) await reconcile(deps, record);
        break;
      }
      case 'payment.paid': {
        const intentId = resAttrs.payment_intent_id as string | undefined;
        const record = intentId ? await deps.store.findRecord({ intentId }) : null;
        if (record) await reconcile(deps, record);
        break;
      }
      case 'payment.failed': {
        const intentId = resAttrs.payment_intent_id as string | undefined;
        const record = intentId ? await deps.store.findRecord({ intentId }) : null;
        const reason = String(obj(resAttrs.last_payment_error).failed_message ?? obj(resAttrs.last_payment_error).message ?? 'Payment failed');
        if (record && record.status === 'pending') await deps.store.markFailed(record.id, 'failed', reason);
        break;
      }
      case 'payment.refunded':
      case 'payment.refund.updated': {
        const refunds = resource.type === 'refund' ? [resource] : Array.isArray(resAttrs.refunds) ? resAttrs.refunds : [];
        for (const r of refunds) {
          const refund = await deps.store.findRefundByProviderId(String(obj(r).id));
          const status = String(obj(obj(r).attributes).status ?? '');
          if (refund && (status === 'succeeded' || status === 'failed')) await deps.store.markRefund(refund.id, status, String(obj(r).id), status === 'failed' ? 'Refund failed at PayMongo' : null);
        }
        break;
      }
      default:
        break; // acknowledged, not used
    }
    await deps.store.finishEvent(eventId, null);
    return { status: 200, body: { received: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.store.finishEvent(eventId, message.slice(0, 500));
    // A mismatched amount will never succeed on retry; it is flagged for review instead.
    if (/does not match/.test(message)) return { status: 200, body: { received: true, flagged: true } };
    return { status: 500, body: { error: 'Processing failed' } };
  }
}

export async function executeRefund(deps: Deps, userId: string, refundId: string): Promise<{ status: string }> {
  if (!(await deps.store.isAdmin(userId))) throw new HttpError(403, 'Administrator access required.');
  const provider = requireProvider(deps);
  const refund = await deps.store.getRefund(refundId);
  if (!refund) throw new HttpError(404, 'Refund not found.');
  // 'failed' may be retried; the same idempotency key stops PayMongo from refunding twice.
  if (refund.status !== 'approved' && refund.status !== 'failed') throw new HttpError(409, 'Only approved refunds can be sent.');
  if (!refund.payment?.provider_payment_id) throw new HttpError(409, 'The original PayMongo payment could not be found.');
  await deps.store.markRefund(refund.id, 'processing', null, null);
  try {
    const result = await provider.createRefund({ idempotencyKey: refund.id, paymentId: refund.payment.provider_payment_id, amountCents: refund.amount_cents, notes: `Hire Me! refund ${refund.id}` });
    const status = result.status === 'succeeded' ? 'succeeded' : result.status === 'failed' ? 'failed' : 'processing';
    await deps.store.markRefund(refund.id, status, result.id, status === 'failed' ? 'Refund failed at PayMongo' : null);
    return { status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Refund failed';
    await deps.store.markRefund(refund.id, 'failed', null, message.slice(0, 500));
    throw new HttpError(502, `PayMongo rejected the refund: ${message}`);
  }
}
