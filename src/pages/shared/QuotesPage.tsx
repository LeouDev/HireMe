import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Money, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

type Role = 'customer' | 'professional';
const FILTERS: Record<string, string[] | null> = {
  All: null,
  Active: ['draft', 'sent', 'viewed', 'revision_requested'],
  Accepted: ['accepted'],
  Closed: ['rejected', 'expired', 'withdrawn', 'superseded'],
};

function QuotesPage({ role }: { role: Role }) {
  const { user, pro } = useAuth();
  const [filter, setFilter] = useState('All');
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  const quotes = useQuery({
    queryKey: ['quotes', role, filter],
    queryFn: async () => {
      let q = supabase.from('quotations')
        .select('id, quote_number, revision, title, status, total_cents, valid_until, created_at, professional:professional_profiles(display_name), customer:profiles!quotations_customer_id_fkey(full_name)')
        .order('created_at', { ascending: false }).limit(100);
      q = role === 'customer' ? q.eq('customer_id', user!.id) : q.eq('professional_id', pro!.id);
      if (FILTERS[filter]) q = q.in('status', FILTERS[filter]!);
      return unwrap(await q);
    },
  });

  return (
    <div>
      <PageHeader title="Quotations" description={role === 'professional' ? 'Quotes you have prepared and sent.' : 'Quotes professionals have sent you.'} />
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter quotations">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm ${filter === f ? 'bg-[#fff] text-[#0e1218]' : 'text-ink-300 hover:bg-white/5'}`}>{f}</button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {quotes.isPending && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {quotes.isError && <ErrorState error={quotes.error} onRetry={() => quotes.refetch()} />}
        {quotes.data?.length === 0 && (
          <EmptyState icon={FileText} title="No quotations"
            description={role === 'professional' ? 'Open a request and choose "Create quotation".' : 'Quotations from professionals will appear here.'} />
        )}
        {!!quotes.data?.length && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[13px] text-ink-500">
                <th className="px-5 py-3 font-medium">Quotation</th>
                <th className="px-5 py-3 font-medium">{role === 'professional' ? 'Customer' : 'Professional'}</th>
                <th className="px-5 py-3 font-medium">Valid until</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {quotes.data.map((q) => (
                <tr key={q.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="px-5 py-3">
                    <Link to={`${base}/quotes/${q.id}`} className="font-medium text-ink-950 hover:underline">{q.title}</Link>
                    <p className="text-xs text-ink-500">{q.quote_number} · rev {q.revision}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-700">{role === 'professional' ? q.customer?.full_name || 'Customer' : q.professional?.display_name}</td>
                  <td className="px-5 py-3 text-ink-700">{formatDate(q.valid_until)}</td>
                  <td className="px-5 py-3 text-right font-medium"><Money cents={q.total_cents} /></td>
                  <td className="px-5 py-3"><StatusBadge domain="quote" status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export const CustomerQuotesPage = () => <QuotesPage role="customer" />;
export const ProQuotesPage = () => <QuotesPage role="professional" />;
