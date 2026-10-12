// POST /api/payments/checkout { bookingId } → { checkoutUrl }
import { paymentDeps } from '../_lib/deps.js';
import { fail, json, readId, requireUser } from '../_lib/http.js';
import { createCheckout } from '../_lib/payments.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await requireUser(request);
    const bookingId = await readId(request, 'bookingId');
    return json(200, await createCheckout(paymentDeps(), userId, bookingId));
  } catch (error) {
    return fail(error);
  }
}
