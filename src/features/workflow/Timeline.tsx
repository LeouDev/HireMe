import { Card, CardHeader, Skeleton } from '@/components/ui';
import { useTimeline } from '@/features/bookings/api';
import { formatDateTime } from '@/lib/format';

const pretty = (s: string | null) => (s ? s.replace(/_/g, ' ') : '');

/** Status history from audit_logs (RLS shows it only to the parties of the record). */
export function Timeline({ entityType, entityId, title = 'History' }: { entityType: string; entityId: string; title?: string }) {
  const { data, isPending } = useTimeline(entityType, entityId);
  return (
    <Card>
      <CardHeader title={title} />
      <ol className="space-y-4 px-5 py-4">
        {isPending && <li><Skeleton className="h-10" /></li>}
        {data?.length === 0 && <li className="text-sm text-ink-500">No history yet.</li>}
        {data?.map((e) => (
          <li key={e.id} className="relative flex gap-3 pl-1">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink-900" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-ink-900 first-letter:uppercase">
                {pretty(e.action)}
                {e.to_status && e.action !== e.to_status && <span className="font-normal text-ink-500"> → {pretty(e.to_status)}</span>}
              </p>
              {typeof (e.metadata as { reason?: string; note?: string })?.reason === 'string' && (
                <p className="text-ink-600">“{(e.metadata as { reason: string }).reason}”</p>
              )}
              {typeof (e.metadata as { note?: string })?.note === 'string' && (e.metadata as { note: string }).note && (
                <p className="text-ink-600">“{(e.metadata as { note: string }).note}”</p>
              )}
              <p className="text-xs text-ink-500">{formatDateTime(e.created_at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
