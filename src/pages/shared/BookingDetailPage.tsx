import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert, Avatar, Button, Card, CardHeader, ConfirmDialog, DetailList, Dialog, ErrorState, Field, FormError, Input, Money,
  PageHeader, PageSpinner, StatusBadge, Stars, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBooking, useBookingAction, type BookingAction } from '@/features/bookings/api';
import { startCheckout } from '@/features/payments/api';
import { Timeline } from '@/features/workflow/Timeline';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration, formatRelative, isoToManilaInput, manilaInputToIso } from '@/lib/format';
import { supabase, unwrap, unwrapMaybe } from '@/lib/supabase';

type Role = 'customer' | 'professional';

function BookingDetailPage({ role }: { role: Role }) {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const booking = useBooking(id);
  const action = useBookingAction(id!);
  const [dialog, setDialog] = useState<BookingAction | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';

  const extras = useQuery({
    queryKey: ['booking-extras', id],
    enabled: booking.isSuccess,
    queryFn: async () => {
      const [payments, refunds, review, disputes] = await Promise.all([
        supabase.from('payment_records').select('*').eq('booking_id', id!).order('created_at', { ascending: false }),
        supabase.from('refunds').select('*').eq('booking_id', id!).order('created_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('booking_id', id!).maybeSingle(),
        supabase.from('disputes').select('*').eq('booking_id', id!).order('created_at', { ascending: false }),
      ]);
      return { payments: unwrap(payments), refunds: unwrap(refunds), review: unwrapMaybe(review), disputes: unwrap(disputes) };
    },
  });

  if (booking.isPending) return <PageSpinner />;
  if (booking.isError) return <div className="card"><ErrorState error={booking.error} onRetry={() => booking.refetch()} /></div>;
  const b = booking.data;
  const isRequester = (who: string | null) => who === user?.id;
  const title = b.service?.name ?? b.quotation?.title ?? 'Booking';
  const counterpart = role === 'professional'
    ? { label: 'Customer', name: b.customer?.full_name || 'Customer', avatar: b.customer?.avatar_path, link: null as string | null }
    : { label: 'Professional', name: b.professional?.display_name, avatar: b.professional?.avatar_path, link: `/pro/${b.professional?.slug}` };
  const durationMin = Math.round((new Date(b.scheduled_end).getTime() - new Date(b.scheduled_start).getTime()) / 60000);
  const dueNow = b.amount_due_now_cents - b.amount_paid_cents;
  const canCancel = ['awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress'].includes(b.status);
  const canReschedule = ['awaiting_contract', 'awaiting_payment', 'confirmed'].includes(b.status);
  const canDispute = ['confirmed', 'in_progress', 'completed', 'cancellation_requested', 'cancelled'].includes(b.status);

  const run = async (act: BookingAction, reason?: string, newStart?: string | null, message?: string) => {
    await action.mutateAsync({ action: act, reason, newStart });
    if (message) toast(message);
  };

  return (
    <div>
      <PageHeader title={title} back={{ to: `${base}/bookings`, label: 'All bookings' }}
        description={<span className="flex flex-wrap items-center gap-2">{b.booking_number} <StatusBadge domain="booking" status={b.status} /> <StatusBadge domain="payment" status={b.payment_status} /></span>}
        actions={
          <>
            {role === 'professional' && b.status === 'confirmed' && <Button variant="inverse" loading={action.isPending} onClick={() => run('start', undefined, undefined, 'Job started')}>Start job</Button>}
            {role === 'professional' && b.status === 'in_progress' && <Button variant="inverse" loading={action.isPending} onClick={() => setDialog('complete')}>Mark completed</Button>}
            {canReschedule && !b.reschedule_proposed_start && <Button variant="outline-inverse" icon={<CalendarClock className="size-4" />} onClick={() => setRescheduleOpen(true)}>Reschedule</Button>}
            {canCancel && <Button variant="outline-inverse" onClick={() => setDialog('cancel')}>Cancel booking</Button>}
            {canDispute && <Button variant="outline-inverse" onClick={() => setDialog('dispute')}>Report a problem</Button>}
          </>
        } />

      <div className="mb-4 space-y-3">
        {b.status === 'cancellation_requested' && (
          isRequester(b.cancellation_requested_by) ? (
            <Alert tone="warning" title="Cancellation requested">You asked to cancel: “{b.cancellation_reason}”. Waiting for the other party to respond.</Alert>
          ) : (
            <Alert tone="warning" title="The other party asked to cancel">
              <p>“{b.cancellation_reason}”</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" loading={action.isPending} onClick={() => run('approve_cancellation', undefined, undefined, 'Cancellation approved')}>Approve cancellation</Button>
                <Button size="sm" variant="secondary" loading={action.isPending} onClick={() => run('reject_cancellation', undefined, undefined, 'Cancellation declined')}>Decline</Button>
              </div>
              {b.amount_paid_cents > 0 && <p className="mt-2 text-xs">Approving does not automatically refund money. Our team reviews any refund.</p>}
            </Alert>
          )
        )}
        {b.reschedule_proposed_start && (
          isRequester(b.reschedule_requested_by) ? (
            <Alert tone="info" title="New time proposed">You proposed {formatDateTime(b.reschedule_proposed_start)}. Waiting for a response.</Alert>
          ) : (
            <Alert tone="info" title={`New time proposed: ${formatDateTime(b.reschedule_proposed_start)}`}>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" loading={action.isPending} onClick={() => run('accept_reschedule', undefined, undefined, 'Booking rescheduled')}>Accept new time</Button>
                <Button size="sm" variant="secondary" loading={action.isPending} onClick={() => run('reject_reschedule', undefined, undefined, 'Proposal declined')}>Decline</Button>
              </div>
            </Alert>
          )
        )}
        {b.status === 'awaiting_contract' && b.contract_id && (
          <Alert tone="warning" title="Waiting for contract signatures"><Link to={`${base}/contracts/${b.contract_id}`} className="font-medium underline">Review and sign the contract</Link> to continue.</Alert>
        )}
        {b.status === 'disputed' && <Alert tone="danger" title="This booking is under dispute">Our administrators are reviewing it. Both parties will be notified of the outcome.</Alert>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-5 px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={counterpart.name} path={counterpart.avatar} />
                <div className="text-sm">
                  <p className="text-ink-500">{counterpart.label}</p>
                  {counterpart.link ? <Link to={counterpart.link} className="font-medium text-ink-950 hover:underline">{counterpart.name}</Link> : <p className="font-medium text-ink-950">{counterpart.name}</p>}
                </div>
              </div>
              <DetailList items={[
                ['When', `${formatDateTime(b.scheduled_start)} (Philippine time)`],
                ['Duration', formatDuration(durationMin)],
                ['Where', [b.location_address, b.location_city].filter(Boolean).join(', ')],
                ['Type', b.booking_type === 'instant' ? 'Instant booking' : 'From quotation'],
                ['Notes', b.customer_notes],
                ['Related', (
                  <span className="flex flex-wrap gap-x-3">
                    {b.quotation_id && <Link className="underline" to={`${base}/quotes/${b.quotation_id}`}>Quotation</Link>}
                    {b.contract_id && <Link className="underline" to={`${base}/contracts/${b.contract_id}`}>Contract</Link>}
                    {b.request_id && <Link className="underline" to={`${base}/requests/${b.request_id}`}>Request</Link>}
                    {!b.quotation_id && !b.request_id && '—'}
                  </span>
                )],
              ]} />
            </div>
          </Card>

          {role === 'customer' && b.status === 'completed' && extras.isSuccess && (
            extras.data.review ? (
              <Card>
                <CardHeader title="Your review" />
                <div className="px-5 py-4 text-sm"><Stars value={extras.data.review.rating} />{extras.data.review.body && <p className="mt-2 whitespace-pre-line text-ink-700">{extras.data.review.body}</p>}</div>
              </Card>
            ) : <ReviewForm bookingId={b.id} />
          )}
          {extras.data?.disputes.map((d) => (
            <Card key={d.id}>
              <CardHeader title="Dispute" actions={<StatusBadge domain="dispute" status={d.status} />} />
              <div className="space-y-2 px-5 py-4 text-sm">
                <p className="whitespace-pre-line text-ink-800">{d.reason}</p>
                <p className="text-xs text-ink-500">Opened {formatRelative(d.created_at)}</p>
                {d.resolution && <Alert tone="neutral" title="Decision">{d.resolution}</Alert>}
              </div>
            </Card>
          ))}
          <Timeline entityType="booking" entityId={b.id} />
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader title="Payment" />
            <div className="space-y-3 px-5 py-4 text-sm">
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-ink-500">Agreed total</dt><dd className="font-medium"><Money cents={b.amount_total_cents} showCents /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Due online</dt><dd><Money cents={b.amount_due_now_cents} showCents /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Paid online</dt><dd><Money cents={b.amount_paid_cents} showCents /></dd></div>
              </dl>
              {b.amount_due_now_cents < b.amount_total_cents && (
                <p className="text-xs text-ink-500">The remaining <Money cents={b.amount_total_cents - b.amount_due_now_cents} showCents /> is paid as agreed in the contract.</p>
              )}
              {role === 'customer' && b.status === 'awaiting_payment' && dueNow > 0 && <PayButton bookingId={b.id} amount={dueNow} dueBy={b.payment_due_by} />}
              {extras.data?.payments.length ? (
                <ul className="space-y-2 border-t border-ink-100 pt-3">
                  {extras.data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-ink-600">{formatDateTime(p.paid_at ?? p.created_at)}</span>
                      <span className="flex items-center gap-2"><Money cents={p.amount_cents} /><StatusBadge domain="payment" status={p.status} /></span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {extras.data?.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-t border-ink-100 pt-3 text-[13px]">
                  <span className="text-ink-600">Refund</span>
                  <span className="flex items-center gap-2"><Money cents={r.amount_cents} /><StatusBadge domain="refund" status={r.status} /></span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={dialog === 'complete'} onClose={() => setDialog(null)} title="Mark this job completed?" description="The customer will be asked to leave a review." confirmLabel="Mark completed"
        onConfirm={() => run('complete', undefined, undefined, 'Job marked completed')} />
      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} danger confirmLabel="Cancel booking"
        title={['awaiting_contract', 'awaiting_payment'].includes(b.status) && b.amount_paid_cents === 0 ? 'Cancel this booking?' : 'Request cancellation?'}
        description={['awaiting_contract', 'awaiting_payment'].includes(b.status) && b.amount_paid_cents === 0
          ? 'Nothing has been paid, so the booking is cancelled right away.'
          : 'The other party must approve. If money was paid online, our team reviews any refund; cancelling does not refund automatically.'}
        note={{ label: 'Reason', required: true }} onConfirm={(note) => run('cancel', note, undefined, 'Done')} />
      <ConfirmDialog open={dialog === 'dispute'} onClose={() => setDialog(null)} danger confirmLabel="Open dispute" title="Report a problem"
        description="An administrator will review the booking. Keep messages on the platform so there is a record."
        note={{ label: 'What went wrong?', required: true }} onConfirm={(note) => run('dispute', note, undefined, 'Dispute opened')} />
      {rescheduleOpen && <RescheduleDialog current={b.scheduled_start} onClose={() => setRescheduleOpen(false)}
        onSubmit={async (iso) => { await run('propose_reschedule', undefined, iso, 'New time proposed'); setRescheduleOpen(false); }} />}
    </div>
  );
}

function PayButton({ bookingId, amount, dueBy }: { bookingId: string; amount: number; dueBy: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await startCheckout(bookingId);
      window.location.assign(checkoutUrl);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t border-ink-100 pt-3">
      <Button onClick={pay} loading={busy} className="w-full" icon={<CreditCard className="size-4" />}>Pay <Money cents={amount} showCents /> with PayMongo</Button>
      {dueBy && <p className="text-xs text-ink-500">Pay by {formatDateTime(dueBy)} to keep this time slot.</p>}
      <p className="text-xs text-ink-500">You'll complete payment on PayMongo's secure page. Your booking is confirmed only after PayMongo confirms the payment.</p>
      <FormError message={error} />
    </div>
  );
}

function ReviewForm({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return setError('Choose a rating.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('submit_review', { p_booking_id: bookingId, p_rating: rating, p_body: body });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    toast('Thanks for your review');
    qc.invalidateQueries({ queryKey: ['booking-extras', bookingId] });
  };
  return (
    <Card>
      <CardHeader title="Leave a review" description="Reviews are public and marked as from a verified booking." />
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <fieldset>
          <legend className="label">Rating</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className="rounded p-1 hover:bg-ink-100">
                <Star className={`size-6 ${n <= rating ? 'fill-ink-950 text-ink-950' : 'text-ink-300'}`} />
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Your review (optional)">{(p) => <Textarea {...p} rows={4} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <FormError message={error} />
        <Button type="submit" loading={busy}>Submit review</Button>
      </form>
    </Card>
  );
}

function RescheduleDialog({ current, onClose, onSubmit }: { current: string; onClose: () => void; onSubmit: (iso: string) => Promise<void> }) {
  const [value, setValue] = useState(isoToManilaInput(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const iso = manilaInputToIso(value);
    if (!iso || new Date(iso) <= new Date()) return setError('Choose a future date and time.');
    setBusy(true);
    try { await onSubmit(iso); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title="Propose a new time" description="The other party must accept before the booking changes. The duration stays the same."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Send proposal</Button></>}>
      <Field label="New start (Philippine time)">{(p) => <Input {...p} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
      <div className="mt-3"><FormError message={error} /></div>
    </Dialog>
  );
}

export const CustomerBookingDetailPage = () => <BookingDetailPage role="customer" />;
export const ProBookingDetailPage = () => <BookingDetailPage role="professional" />;
