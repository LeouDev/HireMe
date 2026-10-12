import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ButtonLink, EmptyState, PageSpinner } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { syncPayment } from '@/features/payments/api';

/**
 * Landing page after PayMongo checkout. The URL never decides the outcome:
 * we ask the server, which verifies with PayMongo and reads the database.
 */
export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking') ?? '';
  const cancelled = params.get('result') === 'cancelled';
  const status = useQuery({
    queryKey: ['payment-return', bookingId],
    enabled: !!bookingId,
    queryFn: () => syncPayment(bookingId),
    // Poll briefly while the webhook or verification catches up.
    refetchInterval: (q) => (q.state.data && ['paid', 'deposit_paid', 'failed'].includes(q.state.data.paymentStatus) ? false : 3000),
    retry: 1,
  });
  const link = `/dashboard/bookings/${bookingId}`;
  const paid = status.data && ['paid', 'deposit_paid'].includes(status.data.paymentStatus);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Seo title="Payment status" noindex />
      <div className="card">
        {!bookingId ? (
          <EmptyState title="Missing booking reference" action={<ButtonLink to="/dashboard/bookings">Your bookings</ButtonLink>} />
        ) : status.isPending ? (
          <PageSpinner label="Checking payment" />
        ) : paid ? (
          <EmptyState icon={CheckCircle2} title="Payment confirmed" description="PayMongo confirmed your payment and your booking is updated." action={<ButtonLink to={link}>View booking</ButtonLink>} />
        ) : status.data?.paymentStatus === 'failed' ? (
          <EmptyState icon={XCircle} title="Payment didn't go through" description="No money was taken for this attempt. You can try again from your booking." action={<ButtonLink to={link}>Back to booking</ButtonLink>} />
        ) : (
          <EmptyState icon={Clock} title={cancelled ? 'Checkout was closed' : 'Waiting for confirmation'}
            description={cancelled ? 'You left the payment page before finishing. Your booking is still awaiting payment.' : status.isError ? 'We could not reach the payment service. Your booking page will update once PayMongo confirms the payment.' : 'This can take a few moments. You can leave this page; your booking updates automatically when PayMongo confirms.'}
            action={<ButtonLink to={link}>Back to booking</ButtonLink>} />
        )}
      </div>
    </div>
  );
}
