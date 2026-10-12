// POST /api/payments/sync { bookingId } → { bookingStatus, paymentStatus }
// Re-verifies pending payments with PayMongo; used on the checkout return page in case a webhook is delayed.
import { paymentDeps } from '../_lib/deps.js';
import { fail, json, readId, requireUser } from '../_lib/http.js';
import { syncBooking } from '../_lib/payments.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await requireUser(request);
    const bookingId = await readId(request, 'bookingId');
    return json(200, await syncBooking(paymentDeps(), userId, bookingId));
  } catch (error) {
    return fail(error);
  }
}
