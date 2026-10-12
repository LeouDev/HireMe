// POST /api/payments/webhook — PayMongo webhook endpoint.
// Register it in the PayMongo dashboard (or POST /v1/webhooks) for:
//   checkout_session.payment.paid, payment.paid, payment.failed, payment.refunded, payment.refund.updated
import { paymentDeps } from '../_lib/deps.js';
import { json } from '../_lib/http.js';
import { handleWebhook } from '../_lib/payments.js';

export async function POST(request: Request): Promise<Response> {
  // The signature covers the exact bytes received, so read the raw body before any parsing.
  const raw = await request.text();
  try {
    const result = await handleWebhook(paymentDeps(), raw, request.headers.get('paymongo-signature'));
    return json(result.status, result.body);
  } catch (error) {
    console.error('[webhook]', error instanceof Error ? error.message : error);
    return json(500, { error: 'Processing failed' });
  }
}
