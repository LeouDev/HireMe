import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useNotifications } from '@/features/notifications/NotificationBell';
import { formatDateTime } from '@/lib/format';

export function NotificationsPage() {
  const { data, isPending, isError, error, refetch, unread, markAllRead, markRead } = useNotifications(100);
  return (
    <div>
      <PageHeader title="Notifications" description="Updates about your requests, quotes, contracts, bookings and payments."
        actions={unread > 0 && <Button variant="inverse" onClick={markAllRead}>Mark all read</Button>} />
      <div className="card overflow-hidden">
        {isPending && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {data?.length === 0 && <EmptyState icon={Bell} title="No notifications yet" />}
        <ul className="divide-y divide-ink-100">
          {data?.map((n) => (
            <li key={n.id}>
              <Link to={n.link ?? '#'} onClick={() => !n.read_at && markRead(n.id)} className={`flex gap-3 px-5 py-4 hover:bg-ink-50 ${n.read_at ? '' : 'bg-ink-50/70'}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-ink-900'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-950">{n.title}</span>
                  {n.body && <span className="block text-sm text-ink-600">{n.body}</span>}
                  <span className="mt-1 block text-xs text-ink-400">{formatDateTime(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-ink-400">Email notifications are not enabled yet; updates appear here in real time.</p>
    </div>
  );
}
