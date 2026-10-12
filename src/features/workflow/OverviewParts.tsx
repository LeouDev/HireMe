import { ArrowRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Card, CardHeader, EmptyState, Skeleton, StatusBadge } from '@/components/ui';
import { useBookings } from '@/features/bookings/api';
import { useConversations } from '@/features/messaging/ChatThread';
import { useNotifications } from '@/features/notifications/NotificationBell';
import { formatDateTime, formatRelative } from '@/lib/format';

export function RecentMessages({ role }: { role: 'customer' | 'professional' }) {
  const { data, isPending } = useConversations();
  const base = role === 'professional' ? '/pro-dashboard/messages' : '/dashboard/messages';
  const rows = (data ?? []).filter((c) => (role === 'customer' ? c.counterpart_is_professional : !c.counterpart_is_professional)).slice(0, 4);
  return (
    <Card>
      <CardHeader title="Recent messages" actions={<Link to={base} className="text-[13px] font-medium text-ink-600 hover:text-ink-950">View all</Link>} />
      {isPending ? <div className="p-5"><Skeleton className="h-12" /></div> : rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No messages yet" />
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={`${base}/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                <Avatar name={c.counterpart_name} path={c.counterpart_avatar} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-950">{c.counterpart_name || 'Customer'}</span>
                  <span className="block truncate text-xs text-ink-500">{c.last_message ?? 'No messages yet'}</span>
                </span>
                {Number(c.unread_count) > 0 ? <span className="rounded-full bg-ink-950 px-2 py-0.5 text-[10px] font-semibold text-white">{c.unread_count}</span>
                  : <span className="text-[11px] text-ink-400">{c.last_message_at ? formatRelative(c.last_message_at) : ''}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecentActivity() {
  const { data, isPending } = useNotifications(6);
  return (
    <Card>
      <CardHeader title="Recent activity" actions={<Link to="/notifications" className="text-[13px] font-medium text-ink-600 hover:text-ink-950">View all</Link>} />
      {isPending ? <div className="p-5"><Skeleton className="h-12" /></div> : !data?.length ? (
        <p className="px-5 py-6 text-sm text-ink-500">Nothing yet. Activity on your requests, quotes and bookings will appear here.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.map((n) => (
            <li key={n.id}>
              <Link to={n.link ?? '#'} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-ink-500">{n.body}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-ink-400">{formatRelative(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Upcoming bookings, shown in the main column on screens where the right rail is hidden. */
export function UpcomingCompact({ role }: { role: 'customer' | 'professional' }) {
  const { data } = useBookings(role, { from: new Date().toISOString(), status: ['awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress'], limit: 3 });
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  if (!data?.length) return null;
  return (
    <Card className="xl:hidden">
      <CardHeader title="Upcoming" actions={<Link to={`${base}/bookings`} className="text-[13px] font-medium text-ink-600">View all</Link>} />
      <ul className="divide-y divide-ink-100">
        {data.map((b) => (
          <li key={b.id}>
            <Link to={`${base}/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-ink-50">
              <span className="min-w-0"><span className="block truncate font-medium">{b.service?.name ?? b.quotation?.title}</span><span className="text-xs text-ink-500">{formatDateTime(b.scheduled_start)}</span></span>
              <StatusBadge domain="booking" status={b.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AttentionList({ items }: { items: { show: boolean; label: string; to: string }[] }) {
  const visible = items.filter((i) => i.show);
  return (
    <Card>
      <CardHeader title="Needs your attention" />
      {visible.length === 0 ? <p className="px-5 py-6 text-sm text-ink-500">You're all caught up.</p> : (
        <ul className="divide-y divide-ink-100">
          {visible.map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-ink-900 hover:bg-ink-50">
                {i.label} <ArrowRight className="size-4 text-ink-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
