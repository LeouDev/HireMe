import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Rating, Skeleton, VerifiedMark } from '@/components/ui';
import { formatPHP } from '@/lib/format';
import type { SearchResult } from '@/lib/supabase';

export function ProCard({ pro }: { pro: SearchResult }) {
  return (
    <Link to={`/pro/${pro.slug}`} className="group flex flex-col rounded-xl border border-ink-200/70 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-pop">
      <div className="flex items-start gap-3">
        <Avatar name={pro.display_name} path={pro.avatar_path} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold text-ink-950">{pro.display_name}</h3>
          {pro.business_name && <p className="truncate text-[13px] text-ink-500">{pro.business_name}</p>}
          <div className="mt-1"><VerifiedMark status={pro.verification_status} kinds={pro.verified_kinds} /></div>
        </div>
      </div>
      {pro.headline && <p className="mt-3 line-clamp-2 text-sm text-ink-600">{pro.headline}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(pro.categories ?? []).slice(0, 3).map((c) => (
          <span key={c} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700">{c}</span>
        ))}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="space-y-1">
          <Rating value={pro.rating_avg} count={pro.review_count} />
          {pro.city && (
            <p className="flex items-center gap-1 text-[13px] text-ink-500"><MapPin className="size-3.5" aria-hidden="true" /> {pro.city}</p>
          )}
        </div>
        <div className="text-right">
          {pro.starting_price_cents != null ? (
            <>
              <p className="text-[11px] text-ink-500">From</p>
              <p className="font-display font-semibold tabular-nums text-ink-950">{formatPHP(pro.starting_price_cents)}</p>
            </>
          ) : (
            <p className="text-[13px] text-ink-500">Quote-based</p>
          )}
        </div>
      </div>
      <span className="mt-4 rounded-md border border-ink-200 py-2 text-center text-sm font-medium text-ink-900 transition-colors group-hover:bg-ink-950 group-hover:text-white">
        View profile
      </span>
    </Link>
  );
}

export function ProCardSkeleton() {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white p-5">
      <div className="flex gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-6 h-9 w-full" />
    </div>
  );
}
