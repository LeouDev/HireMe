// POST /api/payments/refund { refundId } → { status }   (administrators only)
import { paymentDeps } from '../_lib/deps.js';
import { fail, json, readId, requireUser } from '../_lib/http.js';
import { executeRefund } from '../_lib/payments.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await requireUser(request);
    const refundId = await readId(request, 'refundId');
    return json(200, await executeRefund(paymentDeps(), userId, refundId));
  } catch (error) {
    return fail(error);
  }
}
