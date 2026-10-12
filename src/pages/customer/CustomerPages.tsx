import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Heart, Star } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Money, PageHeader, Rating, Skeleton, StatusBadge, Stars, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

export function PaymentsPage() {
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ['my-payments'],
    queryFn: async () => {
      const [payments, refunds] = await Promise.all([
        supabase.from('payment_records').select('*, booking:bookings(booking_number, id)').eq('customer_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('refunds').select('*, booking:bookings(booking_number, id)').order('created_at', { ascending: false }),
      ]);
      return { payments: unwrap(payments), refunds: unwrap(refunds) };
    },
  });
  return (
    <div>
      <PageHeader title="Payments" description="Online payments made through PayMongo and any refunds." />
      {data.isPending && <div className="card space-y-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
      {data.isError && <div className="card"><ErrorState error={data.error} onRetry={() => data.refetch()} /></div>}
      {data.data && (
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <CardHeader title="Payment attempts" />
            {data.data.payments.length === 0 ? (
              <EmptyState icon={CreditCard} title="No payments yet" description="Payments appear here when you pay a booking deposit or price online." />
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-[13px] text-ink-500"><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Booking</th><th className="px-5 py-3 font-medium">Purpose</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 font-medium">Status</th></tr></thead>
                <tbody>
                  {data.data.payments.map((p) => (
                    <tr key={p.id} className="border-t border-ink-100">
                      <td className="px-5 py-3">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                      <td className="px-5 py-3"><Link to={`/dashboard/bookings/${p.booking?.id}`} className="underline">{p.booking?.booking_number}</Link></td>
                      <td className="px-5 py-3 text-ink-600">{p.purpose === 'booking_deposit' ? 'Deposit' : p.purpose === 'booking_full' ? 'Full payment' : 'Balance'}</td>
                      <td className="px-5 py-3 text-right font-medium"><Money cents={p.amount_cents} showCents /></td>
                      <td className="px-5 py-3"><StatusBadge domain="payment" status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {data.data.refunds.length > 0 && (
            <Card>
              <CardHeader title="Refunds" />
              <ul className="divide-y divide-ink-100">
                {data.data.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span><Link to={`/dashboard/bookings/${r.booking?.id}`} className="underline">{r.booking?.booking_number}</Link> <span className="text-ink-500">· {formatDate(r.created_at)}</span></span>
                    <span className="flex items-center gap-2"><Money cents={r.amount_cents} showCents /><StatusBadge domain="refund" status={r.status} /></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function FavoritesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const favorites = useQuery({
    queryKey: ['favorites-list'],
    queryFn: async () => unwrap(await supabase.from('favorites')
      .select('created_at, professional:professional_profiles(id, slug, display_name, business_name, avatar_path, city, rating_avg, review_count, headline)')
      .eq('user_id', user!.id).order('created_at', { ascending: false })),
  });
  const remove = async (id: string) => {
    const { error } = await supabase.from('favorites').delete().eq('user_id', user!.id).eq('professional_id', id);
    if (error) return toast(errorMessage(error), 'error');
    qc.invalidateQueries({ queryKey: ['favorites-list'] });
    qc.invalidateQueries({ queryKey: ['favorites'] });
  };
  // Unpublished professionals disappear from the join (RLS) and are skipped.
  const rows = (favorites.data ?? []).filter((f) => f.professional);
  return (
    <div>
      <PageHeader title="Saved professionals" />
      {favorites.isPending && <div className="card space-y-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {favorites.isError && <div className="card"><ErrorState error={favorites.error} onRetry={() => favorites.refetch()} /></div>}
      {favorites.isSuccess && rows.length === 0 && (
        <div className="card"><EmptyState icon={Heart} title="No saved professionals" description="Tap the heart on a professional's page to save them here." action={<ButtonLink to="/explore">Explore</ButtonLink>} /></div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ professional: p }) => (
          <div key={p!.id} className="card flex items-start gap-3 p-4">
            <Avatar name={p!.display_name} path={p!.avatar_path} />
            <div className="min-w-0 flex-1">
              <Link to={`/pro/${p!.slug}`} className="font-medium text-ink-950 hover:underline">{p!.display_name}</Link>
              {p!.headline && <p className="truncate text-sm text-ink-600">{p!.headline}</p>}
              <div className="mt-1 flex items-center gap-3 text-ink-700"><Rating value={p!.rating_avg} count={p!.review_count} />{p!.city && <span className="text-[13px] text-ink-500">{p!.city}</span>}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(p!.id)} aria-label={`Remove ${p!.display_name}`}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomerReviewsPage() {
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ['my-reviews'],
    queryFn: async () => {
      const [reviews, completed] = await Promise.all([
        supabase.from('reviews').select('*, professional:professional_profiles(display_name, slug)').eq('customer_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('bookings').select('id, booking_number, scheduled_start, service:services(name), quotation:quotations(title), professional:professional_profiles(display_name)')
          .eq('customer_id', user!.id).eq('status', 'completed').order('completed_at', { ascending: false }),
      ]);
      const reviewed = new Set(unwrap(reviews).map((r) => r.booking_id));
      return { reviews: unwrap(reviews), pending: unwrap(completed).filter((b) => !reviewed.has(b.id)) };
    },
  });
  return (
    <div>
      <PageHeader title="Reviews" description="Reviews you've written and completed jobs waiting for one." />
      {data.isPending && <div className="card space-y-3 p-5"><Skeleton className="h-12" /></div>}
      {data.isError && <div className="card"><ErrorState error={data.error} onRetry={() => data.refetch()} /></div>}
      {data.data && (
        <div className="space-y-4">
          {data.data.pending.length > 0 && (
            <Card>
              <CardHeader title="Waiting for your review" />
              <ul className="divide-y divide-ink-100">
                {data.data.pending.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>{b.service?.name ?? b.quotation?.title} · {b.professional?.display_name} <span className="text-ink-500">· {formatDate(b.scheduled_start)}</span></span>
                    <ButtonLink size="sm" to={`/dashboard/bookings/${b.id}`}>Write review</ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Your reviews" />
            {data.data.reviews.length === 0 ? <EmptyState icon={Star} title="No reviews yet" /> : (
              <ul className="divide-y divide-ink-100">
                {data.data.reviews.map((r) => (
                  <li key={r.id} className="px-5 py-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/pro/${r.professional?.slug}`} className="font-medium hover:underline">{r.professional?.display_name}</Link>
                      <span className="flex items-center gap-2"><Stars value={r.rating} />{r.status === 'hidden' && <StatusBadge domain="review" status="hidden" />}</span>
                    </div>
                    {r.body && <p className="mt-2 whitespace-pre-line text-ink-700">{r.body}</p>}
                    <p className="mt-1 text-xs text-ink-500">{formatDate(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
