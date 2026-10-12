import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, EmptyState, ErrorState, Money, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useBookings } from '@/features/bookings/api';
import { formatTime, formatWeekday } from '@/lib/format';

type Role = 'customer' | 'professional';
const TABS: Record<string, string[] | undefined> = {
  Upcoming: ['awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress', 'cancellation_requested'],
  Completed: ['completed'],
  Other: ['cancelled', 'expired', 'disputed'],
  All: undefined,
};

function BookingsPage({ role }: { role: Role }) {
  const [tab, setTab] = useState('Upcoming');
  const bookings = useBookings(role, { status: TABS[tab] });
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  const rows = tab === 'Upcoming' ? bookings.data : [...(bookings.data ?? [])].reverse();

  // Group by Manila calendar day for an agenda view.
  const groups = new Map<string, NonNullable<typeof rows>>();
  for (const b of rows ?? []) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(b.scheduled_start));
    groups.set(day, [...(groups.get(day) ?? []), b]);
  }

  return (
    <div>
      <PageHeader title="Bookings" description={role === 'professional' ? 'Your schedule of jobs.' : 'Services you have booked.'} />
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter bookings">
        {Object.keys(TABS).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-sm ${tab === t ? 'bg-[#fff] text-[#0e1218]' : 'text-ink-300 hover:bg-white/5'}`}>{t}</button>
        ))}
      </div>
      {bookings.isPending && <div className="card space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {bookings.isError && <div className="card"><ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /></div>}
      {rows?.length === 0 && (
        <div className="card"><EmptyState icon={CalendarCheck} title="No bookings here"
          description={role === 'customer' ? 'Book a fixed-price service or accept a quotation to create a booking.' : 'Bookings appear when customers book you or accept your quotations.'} /></div>
      )}
      <div className="space-y-4">
        {[...groups.entries()].map(([day, list]) => (
          <section key={day} className="card overflow-hidden">
            <h2 className="border-b border-ink-100 bg-ink-50 px-5 py-2 text-[13px] font-medium text-ink-600">{formatWeekday(day)}</h2>
            <ul className="divide-y divide-ink-100">
              {list.map((b) => {
                const who = role === 'professional' ? { name: b.customer?.full_name || 'Customer', avatar: b.customer?.avatar_path } : { name: b.professional?.display_name, avatar: b.professional?.avatar_path };
                return (
                  <li key={b.id}>
                    <Link to={`${base}/bookings/${b.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-50">
                      <span className="w-16 shrink-0 text-sm font-medium tabular-nums text-ink-950">{formatTime(b.scheduled_start)}</span>
                      <Avatar name={who.name} path={who.avatar} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-950">{b.service?.name ?? b.quotation?.title ?? 'Booking'}</span>
                        <span className="block truncate text-xs text-ink-500">{who.name} · {b.booking_number} · {b.location_city}</span>
                      </span>
                      <span className="hidden flex-col items-end gap-1 sm:flex">
                        <StatusBadge domain="booking" status={b.status} />
                        <StatusBadge domain="payment" status={b.payment_status} />
                      </span>
                      <Money cents={b.amount_total_cents} className="hidden w-24 text-right text-sm font-medium md:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export const CustomerBookingsPage = () => <BookingsPage role="customer" />;
export const ProBookingsPage = () => <BookingsPage role="professional" />;
