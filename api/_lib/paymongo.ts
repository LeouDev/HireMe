// PayMongo adapter. Only documented endpoints are used:
//   POST /v1/checkout_sessions, GET /v1/checkout_sessions/{id}, POST /v1/refunds
// Webhook signatures: header `Paymongo-Signature: t=<ts>,te=<test sig>,li=<live sig>`,
// signature = HMAC-SHA256(webhook secret, `${t}.${rawBody}`) as hex.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.paymongo.com/v1';

export interface CheckoutInput {
  idempotencyKey: string;
  referenceNumber: string;
  amountCents: number;
  name: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes: string[];
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
  status: string; // 'active' | 'expired'
  livemode: boolean;
  paymentIntentId: string | null;
  payments: { id: string; status: string; amountCents: number; paidAt: string | null }[];
}

export interface RefundResult {
  id: string;
  status: string; // 'pending' | 'succeeded' | 'failed' (as returned by PayMongo)
}

export interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  retrieveCheckout(id: string): Promise<CheckoutSession>;
  createRefund(input: { idempotencyKey: string; paymentId: string; amountCents: number; notes: string }): Promise<RefundResult>;
}

export class PayMongoError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
  }
}

/** PayMongo timestamps are Unix seconds. */
const toIso = (unix: unknown) => (typeof unix === 'number' ? new Date(unix * 1000).toISOString() : null);

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

export function parseCheckoutSession(resource: unknown): CheckoutSession {
  const data = obj(resource);
  const a = obj(data.attributes);
  const payments = Array.isArray(a.payments) ? a.payments : [];
  return {
    id: String(data.id),
    checkoutUrl: String(a.checkout_url ?? ''),
    status: String(a.status ?? ''),
    livemode: a.livemode === true,
    paymentIntentId: (obj(a.payment_intent).id as string | undefined) ?? null,
    payments: payments.map((p) => {
      const pa = obj(obj(p).attributes);
      return { id: String(obj(p).id), status: String(pa.status ?? ''), amountCents: Number(pa.amount ?? 0), paidAt: toIso(pa.paid_at) };
    }),
  };
}

export function createPayMongo(secretKey: string): PaymentProvider {
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  async function call(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<Json> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok) {
      const first = Array.isArray(json.errors) ? obj(json.errors[0]) : {};
      throw new PayMongoError(String(first.detail ?? `PayMongo request failed (${res.status})`), res.status, json.errors);
    }
    return json;
  }

  return {
    async createCheckout(input) {
      const json = await call('/checkout_sessions', {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: [{ name: input.name, description: input.description.slice(0, 255), amount: input.amountCents, currency: 'PHP', quantity: 1 }],
              payment_method_types: input.paymentMethodTypes,
              success_url: input.successUrl,
              cancel_url: input.cancelUrl,
              reference_number: input.referenceNumber,
              description: input.description,
              send_email_receipt: true,
              show_line_items: true,
              show_description: true,
              metadata: input.metadata,
            },
          },
        }),
      });
      return parseCheckoutSession(json.data);
    },
    async retrieveCheckout(id) {
      if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new PayMongoError('Invalid checkout session id', 400);
      return parseCheckoutSession((await call(`/checkout_sessions/${id}`)).data);
    },
    async createRefund(input) {
      const json = await call('/refunds', {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: JSON.stringify({
          data: { attributes: { amount: input.amountCents, payment_id: input.paymentId, reason: 'requested_by_customer', notes: input.notes.slice(0, 255) } },
        }),
      });
      const data = obj(json.data);
      return { id: String(data.id), status: String(obj(data.attributes).status ?? 'pending') };
    },
  };
}

/**
 * Verifies a webhook delivery. Returns the mode the signature proves (test or live), or null if invalid.
 * Must run on the raw, unparsed body.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string): { livemode: boolean } | null {
  if (!header || !secret) return null;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  if (!t || !/^\d+$/.test(t)) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  const matches = (sig: string | undefined) => {
    if (!sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  if (matches(parts.li)) return { livemode: true };
  if (matches(parts.te)) return { livemode: false };
  return null;
}
