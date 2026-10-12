import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Copy, ExternalLink, Share2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button, ButtonLink, Card, CardHeader, PageHeader, Skeleton, StatCard, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDashboardCounts } from '@/features/bookings/api';
import { AttentionList, RecentActivity, RecentMessages, UpcomingCompact } from '@/features/workflow/OverviewParts';
import { supabase } from '@/lib/supabase';
import { proPageUrl, useCopyLink } from './shared';

export function ProOverviewPage() {
  const { pro } = useAuth();
  const counts = useDashboardCounts();
  const copy = useCopyLink();
  const setup = useQuery({
    queryKey: ['pro-setup', pro?.id],
    enabled: !!pro,
    queryFn: async () => {
      const [cats, services, rules, verifications] = await Promise.all([
        supabase.from('professional_categories').select('category_id', { count: 'exact', head: true }).eq('professional_id', pro!.id),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('professional_id', pro!.id).eq('status', 'active'),
        supabase.from('availability_rules').select('id', { count: 'exact', head: true }).eq('professional_id', pro!.id),
        supabase.from('verification_submissions').select('id', { count: 'exact', head: true }).eq('professional_id', pro!.id),
      ]);
      for (const r of [cats, services, rules, verifications]) if (r.error) throw r.error;
      return { categories: cats.count ?? 0, services: services.count ?? 0, rules: rules.count ?? 0, verifications: verifications.count ?? 0 };
    },
  });
  if (!pro) return null;
  const p = counts.data?.professional ?? {};
  const n = (k: string) => Number(p[k] ?? 0);
  const url = proPageUrl(pro.slug);
  const steps = [
    { done: !!pro.avatar_path, label: 'Add a profile photo', to: '/pro-dashboard/profile' },
    { done: !!(pro.headline || pro.bio), label: 'Write a short introduction', to: '/pro-dashboard/profile' },
    { done: (setup.data?.categories ?? 0) > 0, label: 'Choose your service categories', to: '/pro-dashboard/profile' },
    { done: (setup.data?.services ?? 0) > 0, label: 'Add an active service with pricing', to: '/pro-dashboard/services' },
    { done: (setup.data?.rules ?? 0) > 0, label: 'Set your working hours', to: '/pro-dashboard/availability' },
    { done: pro.status === 'published', label: 'Publish your page', to: '/pro-dashboard/profile' },
    { done: (setup.data?.verifications ?? 0) > 0 || pro.verification_status === 'verified', label: 'Submit verification documents', to: '/pro-dashboard/verification' },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: pro.display_name, url }); } catch { /* cancelled */ }
    } else copy(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Your business at a glance."
        actions={<ButtonLink to={`/pro/${pro.slug}`} variant="inverse" icon={<ExternalLink className="size-4" />}>View public page</ButtonLink>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.isPending ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 bg-white/10" />) : (
          <>
            <StatCard label="New requests" value={n('requests_new')} hint={`${n('requests_pending')} in progress`} to="/pro-dashboard/requests" />
            <StatCard label="Quotes awaiting customer" value={n('quotes_awaiting_customer')} hint={n('quotes_revision_requested') ? `${n('quotes_revision_requested')} revision requested` : 'Sent and viewed'} to="/pro-dashboard/quotes" />
            <StatCard label="Upcoming jobs" value={n('bookings_upcoming')} hint={n('contracts_to_sign') ? `${n('contracts_to_sign')} contract(s) to sign` : 'Confirmed bookings'} to="/pro-dashboard/bookings" />
            <StatCard label="Completed jobs" value={n('jobs_completed')} hint={pro.review_count ? `${Number(pro.rating_avg).toFixed(1)} average from ${pro.review_count} reviews` : 'No reviews yet'} to="/pro-dashboard/reviews" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your shareable page" actions={<StatusBadge domain="profile" status={pro.status} />} />
          <div className="space-y-4 px-5 py-4">
            <p className="rounded-lg bg-ink-50 px-3 py-2.5 font-mono text-[13px] break-all text-ink-800">{url}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Copy className="size-4" />} onClick={() => copy(url)}>Copy link</Button>
              <Button variant="secondary" size="sm" icon={<Share2 className="size-4" />} onClick={share}>Share</Button>
              <ButtonLink to="/pro-dashboard/profile" size="sm">Edit page</ButtonLink>
            </div>
            {pro.status !== 'published' && <p className="text-[13px] text-ink-500">Your page is private until you publish it.</p>}
          </div>
        </Card>

        {remaining > 0 ? (
          <Card>
            <CardHeader title="Get set up" description={`${steps.length - remaining} of ${steps.length} done`} />
            <ul className="divide-y divide-ink-100">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link to={s.to} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-ink-50">
                    {s.done ? <CheckCircle2 className="size-4 text-success-600" aria-hidden="true" /> : <Circle className="size-4 text-ink-300" aria-hidden="true" />}
                    <span className={s.done ? 'text-ink-500 line-through' : 'font-medium text-ink-900'}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <AttentionList items={[
            { show: n('requests_new') > 0, label: `Respond to ${n('requests_new')} new request(s)`, to: '/pro-dashboard/requests' },
            { show: n('quotes_revision_requested') > 0, label: `Revise ${n('quotes_revision_requested')} quotation(s)`, to: '/pro-dashboard/quotes' },
            { show: n('contracts_to_sign') > 0, label: `Sign ${n('contracts_to_sign')} contract(s)`, to: '/pro-dashboard/contracts' },
          ]} />
        )}
        <UpcomingCompact role="professional" />
        <RecentMessages role="professional" />
        <RecentActivity />
      </div>
    </div>
  );
}
