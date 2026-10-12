import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Money, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

type Role = 'customer' | 'professional';

function ContractsPage({ role }: { role: Role }) {
  const { user, pro } = useAuth();
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  const contracts = useQuery({
    queryKey: ['contracts', role],
    queryFn: async () => {
      let q = supabase.from('contracts')
        .select('*, quotation:quotations(title, total_cents), professional:professional_profiles(display_name), customer:profiles!contracts_customer_id_fkey(full_name)')
        .order('created_at', { ascending: false });
      q = role === 'customer' ? q.eq('customer_id', user!.id) : q.eq('professional_id', pro!.id);
      return unwrap(await q);
    },
  });
  return (
    <div>
      <PageHeader title="Contracts" description="Agreements generated from accepted quotations." />
      <div className="card overflow-hidden">
        {contracts.isPending && <div className="space-y-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {contracts.isError && <ErrorState error={contracts.error} onRetry={() => contracts.refetch()} />}
        {contracts.data?.length === 0 && <EmptyState icon={FileSignature} title="No contracts yet" description="A contract is created when a quotation is accepted." />}
        <ul className="divide-y divide-ink-100">
          {contracts.data?.map((c) => (
            <li key={c.id}>
              <Link to={`${base}/contracts/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50">
                <FileSignature className="size-5 shrink-0 text-ink-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-950">{c.quotation?.title}</p>
                  <p className="truncate text-[13px] text-ink-500">
                    {c.contract_number} · v{c.current_version} · {role === 'professional' ? c.customer?.full_name || 'Customer' : c.professional?.display_name} · {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge domain="contract" status={c.status} />
                  <Money cents={c.quotation?.total_cents} className="text-xs text-ink-500" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const CustomerContractsPage = () => <ContractsPage role="customer" />;
export const ProContractsPage = () => <ContractsPage role="professional" />;
