import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatTime, todayManila } from '@/lib/format';
import { useBookings } from './api';

const ACTIVE = ['awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress', 'cancellation_requested'];

/** Right-hand rail: account card, month calendar with booked days, and upcoming jobs. */
export function ScheduleAside({ scope }: { scope: 'customer' | 'professional' }) {
  const { profile, pro } = useAuth();
  const today = todayManila();
  const [cursor, setCursor] = useState(today.slice(0, 7)); // YYYY-MM
  const [year, month] = cursor.split('-').map(Number) as [number, number];
  const monthStart = `${cursor}-01T00:00:00+08:00`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;

  const monthBookings = useBookings(scope, { from: new Date(monthStart).toISOString(), to: new Date(`${next}-01T00:00:00+08:00`).toISOString(), status: ACTIVE.concat('completed') });
  const upcoming = useBookings(scope, { from: new Date().toISOString(), status: ACTIVE, limit: 4 });

  const busyDays = useMemo(() => {
    const set = new Set<string>();
    for (const b of monthBookings.data ?? []) {
      set.add(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(b.scheduled_start)));
    }
    return set;
  }, [monthBookings.data]);

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const base = scope === 'professional' ? '/pro-dashboard' : '/dashboard';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center gap-3">
          <Avatar name={scope === 'professional' ? pro?.display_name : profile?.full_name} path={scope === 'professional' ? pro?.avatar_path : profile?.avatar_path} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{scope === 'professional' ? pro?.display_name : profile?.full_name || 'Your account'}</p>
            <p className="truncate text-xs text-ink-400">{scope === 'professional' ? `/pro/${pro?.slug}` : 'Customer account'}</p>
          </div>
          <Link to={`${base}/settings`} className="grid size-8 place-items-center rounded-full bg-white/5 text-ink-300 hover:text-white" aria-label="Settings">
            <MoreHorizontal className="size-4" />
          </Link>
        </div>
        {scope === 'professional' && pro && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniStat value={pro.review_count ? Number(pro.rating_avg).toFixed(1) : '—'} label="Rating" />
            <MiniStat value={String(pro.review_count)} label="Reviews" />
            <MiniStat value={pro.status === 'published' ? 'Live' : 'Draft'} label="Page" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-white">{monthLabel}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setCursor(prev)} className="grid size-7 place-items-center rounded-full bg-white/5 text-ink-300 hover:text-white" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <button type="button" onClick={() => setCursor(next)} className="grid size-7 place-items-center rounded-full bg-white/5 text-ink-300 hover:text-white" aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d} className="pb-1 text-ink-500">{d}</span>)}
          {cells.map((day, i) => {
            if (!day) return <span key={`e${i}`} />;
            const iso = `${cursor}-${String(day).padStart(2, '0')}`;
            const isToday = iso === today;
            const busy = busyDays.has(iso);
            return (
              <span key={iso} className={`relative mx-auto grid size-8 place-items-center rounded-full text-xs ${isToday ? 'bg-[#fff] text-[#0e1218] font-semibold' : busy ? 'bg-white/10 text-white' : 'text-ink-300'}`}>
                {day}
                {busy && !isToday && <span className="absolute bottom-1 size-1 rounded-full bg-white" aria-hidden="true" />}
                {busy && <span className="sr-only">(booked)</span>}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="border-l-2 border-white pl-2 text-sm font-medium text-white">Upcoming</p>
          <Link to={`${base}/bookings`} className="text-xs text-ink-400 hover:text-white">View all</Link>
        </div>
        <ul className="space-y-2">
          {upcoming.isPending && [0, 1].map((i) => <li key={i}><Skeleton className="h-16 bg-white/5" /></li>)}
          {upcoming.data?.length === 0 && <li className="rounded-2xl bg-white/[0.06] px-4 py-6 text-center text-xs text-ink-400">No upcoming bookings.</li>}
          {upcoming.data?.map((b) => {
            const date = new Date(b.scheduled_start);
            return (
              <li key={b.id}>
                <Link to={`${base}/bookings/${b.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 hover:bg-white/[0.1]">
                  <span className="grid w-11 shrink-0 rounded-lg bg-[#fff] text-[#0e1218] py-1 text-center">
                    <span className="text-[10px] font-medium uppercase">{date.toLocaleString('en-PH', { month: 'short', timeZone: 'Asia/Manila' })}</span>
                    <span className="font-display text-base leading-tight font-semibold">{date.toLocaleString('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' })}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{b.service?.name ?? b.quotation?.title ?? b.booking_number}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {formatTime(b.scheduled_start)} · {scope === 'professional' ? b.customer?.full_name : b.professional?.display_name}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <p className="text-sm font-semibold text-white">{value}</p>
      <p className="text-[10px] text-ink-400">{label}</p>
    </div>
  );
}
