import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDate, formatRelative } from '@/lib/format';
import { REQUEST_SELECT } from '@/features/workflow/selects';
import { supabase, unwrap } from '@/lib/supabase';

type Role = 'customer' | 'professional';
const FILTERS: Record<string, string[] | null> = {
  All: null,
  Open: ['draft', 'submitted', 'viewed', 'awaiting_info', 'accepted'],
  Quoted: ['quoted'],
  Closed: ['declined', 'cancelled', 'expired'],
};


function RequestsPage({ role }: { role: Role }) {
  const { user, pro } = useAuth();
  const [filter, setFilter] = useState('All');
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  const requests = useQuery({
    queryKey: ['requests', role, filter],
    queryFn: async () => {
      let q = supabase.from('service_requests').select(REQUEST_SELECT).order('created_at', { ascending: false }).limit(100);
      q = role === 'customer' ? q.eq('customer_id', user!.id) : q.eq('professional_id', pro!.id);
      if (FILTERS[filter]) q = q.in('status', FILTERS[filter]!);
      return unwrap(await q);
    },
  });

  return (
    <div>
      <PageHeader title="Service requests"
        description={role === 'professional' ? 'Jobs customers have asked you about.' : 'Requests you have sent to professionals.'}
        actions={role === 'customer' && <ButtonLink to="/explore" variant="inverse">Find a professional</ButtonLink>} />
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter requests">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap ${filter === f ? 'bg-[#fff] text-[#0e1218]' : 'text-ink-300 hover:bg-white/5'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        {requests.isPending && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {requests.isError && <ErrorState error={requests.error} onRetry={() => requests.refetch()} />}
        {requests.data?.length === 0 && (
          <EmptyState icon={ClipboardList} title="No requests here"
            description={role === 'customer' ? 'Find a professional and request a quote to get started.' : 'When customers send you requests, they appear here. Share your page to get more.'}
            action={role === 'customer' ? <ButtonLink to="/explore">Explore professionals</ButtonLink> : <ButtonLink to="/pro-dashboard/profile">Share your page</ButtonLink>} />
        )}
        <ul className="divide-y divide-ink-100">
          {requests.data?.map((r) => {
            const other = role === 'customer'
              ? { name: r.professional?.display_name, avatar: r.professional?.avatar_path }
              : { name: r.customer?.full_name || 'Customer', avatar: r.customer?.avatar_path };
            return (
              <li key={r.id}>
                <Link to={`${base}/requests/${r.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50">
                  <Avatar name={other.name} path={other.avatar} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-950">{r.title}</p>
                    <p className="truncate text-[13px] text-ink-500">
                      {other.name} · {r.request_number} · {r.location_city}{r.preferred_date ? ` · Preferred ${formatDate(r.preferred_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge domain="request" status={r.status} />
                    <span className="text-xs text-ink-400">{formatRelative(r.created_at)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export const CustomerRequestsPage = () => <RequestsPage role="customer" />;
export const ProRequestsPage = () => <RequestsPage role="professional" />;
