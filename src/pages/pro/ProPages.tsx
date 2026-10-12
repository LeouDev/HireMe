import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, ChevronRight, Copy, ExternalLink, Flag, Star, UserRound, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader,
  PageSpinner, Pagination, Skeleton, StatusBadge, Stars, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBookings } from '@/features/bookings/api';
import { formatDate, formatDateTime, formatPHP, formatRelative } from '@/lib/format';
import { supabase, unwrap, type ProfessionalProfile } from '@/lib/supabase';
import { proPageUrl, useCopyLink } from './shared';

// ---------------------------------------------------------------------------
// Customers: people who sent me a request or booked me (no other customer data is exposed).
// ---------------------------------------------------------------------------

interface Person { full_name: string | null; avatar_path: string | null }
interface CustomerSummary {
  id: string;
  name: string | null;
  avatar: string | null;
  requests: { id: string; title: string; status: string; created_at: string }[];
  bookings: { id: string; label: string; status: string; scheduled_start: string }[];
  completed: number;
  last: string;
}

export function CustomersPage() {
  const { pro } = useAuth();
  return pro ? <Customers proId={pro.id} /> : <PageSpinner />;
}

function Customers({ proId }: { proId: string }) {
  const requests = useQuery({
    queryKey: ['pro-customer-requests', proId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('service_requests')
          .select('id, status, title, created_at, updated_at, customer_id, customer:profiles!service_requests_customer_id_fkey(id, full_name, avatar_path)')
          .eq('professional_id', proId)
          .neq('status', 'draft')
          .order('created_at', { ascending: false }),
      ) ?? [],
  });
  const bookings = useBookings('professional');

  const map = new Map<string, CustomerSummary>();
  const entry = (id: string, person: Person | null) => {
    let c = map.get(id);
    if (!c) {
      c = { id, name: null, avatar: null, requests: [], bookings: [], completed: 0, last: '' };
      map.set(id, c);
    }
    c.name ??= person?.full_name ?? null;
    c.avatar ??= person?.avatar_path ?? null;
    return c;
  };
  for (const r of requests.data ?? []) {
    const c = entry(r.customer_id, r.customer);
    c.requests.push(r);
    if (r.updated_at > c.last) c.last = r.updated_at;
  }
  for (const b of bookings.data ?? []) {
    const c = entry(b.customer_id, b.customer);
    c.bookings.push({ id: b.id, label: b.service?.name ?? b.quotation?.title ?? b.booking_number, status: b.status, scheduled_start: b.scheduled_start });
    if (b.status === 'completed') c.completed += 1;
    if (b.updated_at > c.last) c.last = b.updated_at;
  }
  const customers = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  const error = requests.error ?? bookings.error;

  return (
    <>
      <PageHeader title="Customers" description="People who have sent you a request or booked a job with you." />
      <Card>
        {requests.isPending || bookings.isPending ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => { requests.refetch(); bookings.refetch(); }} />
        ) : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet" description="Customers appear here after they send you a request or book one of your services." />
        ) : (
          <>
            <CardHeader title={`${customers.length} customer${customers.length === 1 ? '' : 's'}`} description="Most recent activity first." />
            <ul className="divide-y divide-ink-100">
              {customers.map((c) => (
                <li key={c.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
                      <Avatar name={c.name ?? 'Customer'} path={c.avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{c.name || 'Customer'}</p>
                        <p className="text-[13px] text-ink-500">
                          {c.requests.length} request{c.requests.length === 1 ? '' : 's'} · {c.bookings.length} booking{c.bookings.length === 1 ? '' : 's'} · {c.completed} completed
                        </p>
                      </div>
                      <p className="hidden text-[13px] text-ink-500 sm:block">Active {formatRelative(c.last)}</p>
                      <ChevronRight className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <div className="grid gap-4 bg-ink-50/60 px-5 pt-1 pb-4 sm:grid-cols-2 sm:pl-16">
                      <ActivityList
                        title="Requests"
                        items={c.requests.map((r) => ({ id: r.id, to: `/pro-dashboard/requests/${r.id}`, label: r.title, meta: formatDate(r.created_at), badge: <StatusBadge domain="request" status={r.status} /> }))}
                      />
                      <ActivityList
                        title="Bookings"
                        items={c.bookings.map((b) => ({ id: b.id, to: `/pro-dashboard/bookings/${b.id}`, label: b.label, meta: formatDateTime(b.scheduled_start), badge: <StatusBadge domain="booking" status={b.status} /> }))}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}

function ActivityList({ title, items }: { title: string; items: { id: string; to: string; label: string; meta: string; badge: ReactNode }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-500 uppercase">{title}</p>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-500">None</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <Link to={it.to} className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-white">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{it.label}</span>
                  <span className="block text-xs text-ink-500">{it.meta}</span>
                </span>
                {it.badge}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

const REVIEWS_PAGE_SIZE = 20;

export function ProReviewsPage() {
  const { pro } = useAuth();
  return pro ? <Reviews pro={pro} /> : <PageSpinner />;
}

function Reviews({ pro }: { pro: ProfessionalProfile }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<string | null>(null);
  const reviews = useQuery({
    queryKey: ['pro-reviews', pro.id, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * REVIEWS_PAGE_SIZE;
      const res = await supabase
        .from('reviews')
        .select('id, rating, body, status, hidden_reason, created_at, booking_id, customer:profiles!reviews_customer_id_fkey(full_name), booking:bookings(booking_number, service:services(name))', { count: 'exact' })
        .eq('professional_id', pro.id)
        .order('created_at', { ascending: false })
        .range(from, from + REVIEWS_PAGE_SIZE - 1);
      if (res.error) throw res.error;
      return { rows: res.data ?? [], total: res.count ?? 0 };
    },
  });

  const report = async (reason: string) => {
    if (!reporting) return;
    if (reason.length < 5) throw new Error('Describe the problem in at least 5 characters.');
    const { error } = await supabase.from('reports').insert({ entity_type: 'review', entity_id: reporting, reason });
    if (error?.code === '23505') throw new Error('You have already reported this review.');
    if (error) throw error;
    toast('Report sent. Our team will review it.');
  };

  return (
    <>
      <PageHeader title="Reviews" description="Customers can review you after a completed booking." />
      <div className="space-y-4">
        <Card as="section">
          <div className="flex flex-wrap items-center gap-5 p-5">
            <p className="font-display text-4xl font-semibold tabular-nums text-ink-950">{pro.review_count ? Number(pro.rating_avg).toFixed(1) : '—'}</p>
            <div>
              <Stars value={Math.round(Number(pro.rating_avg ?? 0))} />
              <p className="mt-1 text-[13px] text-ink-500">
                {pro.review_count ? `Based on ${pro.review_count} published review${pro.review_count === 1 ? '' : 's'}` : 'No published reviews yet'}
              </p>
            </div>
          </div>
        </Card>

        <Card as="section">
          {reviews.isPending ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : reviews.error ? (
            <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />
          ) : reviews.data.rows.length === 0 ? (
            <EmptyState icon={Star} title="No reviews yet" description="After you complete a booking, the customer is invited to leave a review." />
          ) : (
            <>
              <ul className="divide-y divide-ink-100">
                {reviews.data.rows.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.rating} />
                      <span className="text-[13px] text-ink-500">{formatDate(r.created_at)}</span>
                      <Badge><BadgeCheck className="size-3" aria-hidden="true" /> Verified booking</Badge>
                      {r.status === 'hidden' && <StatusBadge domain="review" status="hidden" />}
                    </div>
                    {r.status === 'hidden' && r.hidden_reason && <p className="mt-1 text-[13px] text-ink-500">Hidden by moderators: {r.hidden_reason}</p>}
                    {r.body ? <p className="mt-2 text-sm whitespace-pre-line text-ink-800">{r.body}</p> : <p className="mt-2 text-sm text-ink-500 italic">No written comment.</p>}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] text-ink-500">
                        {r.customer?.full_name || 'Customer'}
                        {r.booking && <> · <Link to={`/pro-dashboard/bookings/${r.booking_id}`} className="underline underline-offset-2 hover:text-ink-900">{r.booking.service?.name ?? r.booking.booking_number}</Link></>}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => setReporting(r.id)} icon={<Flag className="size-3.5" aria-hidden="true" />}>Report</Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-5 pb-4">
                <Pagination page={page} pageSize={REVIEWS_PAGE_SIZE} total={reviews.data.total} onChange={setPage} />
              </div>
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!reporting}
        onClose={() => setReporting(null)}
        onConfirm={report}
        title="Report this review"
        description="Tell us what's wrong, for example false claims, personal information or abusive language. Administrators review every report."
        confirmLabel="Send report"
        note={{ label: 'Reason', required: true, placeholder: 'At least 5 characters' }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings: plan (read-only for now), public link, related settings
// ---------------------------------------------------------------------------

export function ProSettingsPage() {
  const { pro } = useAuth();
  return pro ? <ProSettings pro={pro} /> : <PageSpinner />;
}

function ProSettings({ pro }: { pro: ProfessionalProfile }) {
  const copyLink = useCopyLink();
  const url = proPageUrl(pro.slug);
  const current = useQuery({
    queryKey: ['pro-effective-plan', pro.id],
    queryFn: async () => unwrap(await supabase.rpc('effective_plan', { p_professional_id: pro.id })),
  });
  const plans = useQuery({
    queryKey: ['pro-pages', 'plans'],
    queryFn: async () => unwrap(await supabase.from('subscription_plans').select('*').order('sort_order')) ?? [],
  });
  const error = current.error ?? plans.error;

  return (
    <>
      <PageHeader title="Settings" description="Your plan, your public link and related settings." />
      <div className="space-y-4">
        <Card as="section">
          <CardHeader title="Public page link" actions={<StatusBadge domain="profile" status={pro.status} />} />
          <div className="flex flex-col gap-2 p-5 sm:flex-row">
            <label htmlFor="pro-public-url" className="sr-only">Public page address</label>
            <Input id="pro-public-url" readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-sm" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => copyLink(url)} icon={<Copy className="size-4" aria-hidden="true" />}>Copy</Button>
              <ButtonLink to={`/pro/${pro.slug}`} target="_blank" rel="noreferrer" variant="secondary" icon={<ExternalLink className="size-4" aria-hidden="true" />}>Open</ButtonLink>
            </div>
          </div>
          {pro.status !== 'published' && <p className="px-5 pb-4 -mt-2 text-[13px] text-ink-500">Your page is not published yet, so only you can open this link.</p>}
        </Card>

        <Card as="section">
          <CardHeader title="Plan" description="What your account includes." />
          <div className="space-y-4 p-5">
            <Alert tone="neutral" title="Upgrades coming soon">
              Paid plans are not available yet, and you will not be charged. Prices shown are illustrative and may change before launch.
            </Alert>
            {error ? (
              <ErrorState error={error} onRetry={() => { current.refetch(); plans.refetch(); }} />
            ) : current.isPending || !plans.data ? (
              <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
            ) : plans.data.length === 0 ? (
              <p className="text-sm text-ink-500">No plans are available.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-3">
                {plans.data.map((p) => {
                  const isCurrent = p.code === current.data?.code;
                  return (
                    <li key={p.code} className={`flex flex-col rounded-xl border p-4 ${isCurrent ? 'border-ink-900' : 'border-ink-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-[15px] font-semibold text-ink-900">{p.name}</h3>
                        {isCurrent && <Badge tone="dark">Current plan</Badge>}
                      </div>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink-950">
                        {p.price_cents === 0 ? 'Free' : <>{formatPHP(p.price_cents)}<span className="text-sm font-normal text-ink-500"> / {p.billing_interval}</span></>}
                      </p>
                      {p.description && <p className="mt-1 text-[13px] text-ink-600">{p.description}</p>}
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {p.features.map((f) => (
                          <li key={f} className="flex gap-2 text-[13px] text-ink-700">
                            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {f}
                          </li>
                        ))}
                      </ul>
                      {!isCurrent && <Button variant="secondary" size="sm" disabled className="mt-4 w-full">Upgrades coming soon</Button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card as="section">
          <CardHeader title="More settings" />
          <ul className="divide-y divide-ink-100">
            <SettingsLink to="/dashboard/settings" icon={<UserRound className="size-4" aria-hidden="true" />} title="Account settings" description="Your name, photo, password and notifications." />
            <SettingsLink to="/pro-dashboard/verification" icon={<BadgeCheck className="size-4" aria-hidden="true" />} title="Verification" description="Submit documents to verify your identity, business or credentials." />
          </ul>
        </Card>
      </div>
    </>
  );
}

function SettingsLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-900">{title}</span>
          <span className="block text-[13px] text-ink-500">{description}</span>
        </span>
        <ChevronRight className="size-4 text-ink-400" aria-hidden="true" />
      </Link>
    </li>
  );
}
