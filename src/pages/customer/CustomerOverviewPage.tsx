import { ButtonLink, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { useDashboardCounts } from '@/features/bookings/api';
import { AttentionList, RecentActivity, RecentMessages, UpcomingCompact } from '@/features/workflow/OverviewParts';

export function CustomerOverviewPage() {
  const { data, isPending } = useDashboardCounts();
  const c = data?.customer ?? {};
  const n = (k: string) => Number(c[k] ?? 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Your requests, quotations and bookings at a glance."
        actions={<ButtonLink to="/explore" variant="inverse">Find a professional</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isPending ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 bg-white/10" />) : (
          <>
            <StatCard label="Open requests" value={n('requests_open')} hint={n('requests_need_info') ? `${n('requests_need_info')} need your reply` : 'Waiting on professionals'} to="/dashboard/requests" />
            <StatCard label="New quotations" value={n('quotes_new')} hint="Ready to review" to="/dashboard/quotes" />
            <StatCard label="Contracts to sign" value={n('contracts_to_sign')} hint="Awaiting your signature" to="/dashboard/contracts" />
            <StatCard label="Upcoming bookings" value={n('bookings_upcoming')} hint={n('payments_due') ? `${n('payments_due')} awaiting payment` : 'Scheduled'} to="/dashboard/bookings" />
          </>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionList items={[
          { show: n('requests_need_info') > 0, label: `${n('requests_need_info')} request(s) need more information`, to: '/dashboard/requests' },
          { show: n('quotes_new') > 0, label: `Review ${n('quotes_new')} quotation(s)`, to: '/dashboard/quotes' },
          { show: n('contracts_to_sign') > 0, label: `Sign ${n('contracts_to_sign')} contract(s)`, to: '/dashboard/contracts' },
          { show: n('payments_due') > 0, label: `Pay for ${n('payments_due')} booking(s)`, to: '/dashboard/bookings' },
        ]} />
        <UpcomingCompact role="customer" />
        <RecentMessages role="customer" />
        <RecentActivity />
      </div>
    </div>
  );
}
