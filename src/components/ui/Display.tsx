import { BadgeCheck, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatPHP, initials } from '@/lib/format';
import { publicUrl } from '@/lib/storage';

export function Logo({ className = '', inverse = false, showWordmark = true }: { className?: string; inverse?: boolean; showWordmark?: boolean }) {
  const maskId = useId();
  return (
    <span className={`inline-flex items-center gap-[0.35em] font-display text-xl font-semibold tracking-[-0.03em] ${inverse ? 'text-white' : 'text-ink-850'} ${className}`}>
      <svg viewBox="0 0 100 100" className="size-[1.25em] shrink-0" aria-hidden="true">
        <mask id={maskId}>
          <rect width="100" height="100" fill="#fff" />
          <path d="M33 22V70M33 46H63M63 22V52" stroke="#000" strokeWidth="11" fill="none" />
          <rect x="57.5" y="58" width="11" height="12" rx="5.5" fill="#000" />
        </mask>
        <g mask={`url(#${maskId})`} fill="currentColor">
          <circle cx="52" cy="46" r="42" />
          <path d="M24 76L10 97L44 85Z" />
        </g>
        <rect x="57.5" y="58" width="11" height="12" rx="5.5" fill="#F2643C" />
      </svg>
      {showWordmark && (
        <span>
          Hire Me<span className="text-brand">!</span>
        </span>
      )}
    </span>
  );
}

export function Card({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-400 hover:text-white">
          <ChevronLeft className="size-4" aria-hidden="true" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const avatarSizes = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-base', xl: 'size-24 text-2xl' };

export function Avatar({ name, path, size = 'md', className = '' }: { name?: string | null; path?: string | null; size?: keyof typeof avatarSizes; className?: string }) {
  const src = publicUrl(path);
  return src ? (
    <img src={src} alt="" loading="lazy" className={`${avatarSizes[size]} shrink-0 rounded-full bg-ink-100 object-cover ${className}`} />
  ) : (
    <span aria-hidden="true" className={`${avatarSizes[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-ink-800 font-medium text-white ${className}`}>
      {initials(name)}
    </span>
  );
}

export function Money({ cents, className = '', showCents }: { cents: number | null | undefined; className?: string; showCents?: boolean }) {
  return <span className={`tabular-nums ${className}`}>{formatPHP(cents, { showCents })}</span>;
}

export function Rating({ value, count, className = '' }: { value: number | null | undefined; count: number; className?: string }) {
  if (!count) return <span className={`text-[13px] text-ink-500 ${className}`}>No reviews yet</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] ${className}`} aria-label={`Rated ${Number(value).toFixed(1)} out of 5 from ${count} reviews`}>
      <Star className="size-3.5 fill-current" aria-hidden="true" />
      <span className="font-medium">{Number(value).toFixed(1)}</span>
      <span className="text-ink-500">({count})</span>
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-4 ${n <= value ? 'fill-ink-900 text-ink-900' : 'text-ink-300'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

export function VerifiedMark({ kinds, status }: { kinds?: string[] | null; status: string }) {
  if (status !== 'verified') return null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-900" title={`Verified: ${(kinds ?? []).join(', ')}`}>
      <BadgeCheck className="size-4" aria-hidden="true" /> ID verified
    </span>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-4 pt-4 text-sm" aria-label="Pagination">
      <p className="text-ink-500">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 bg-white px-3 disabled:opacity-40">
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 bg-white px-3 disabled:opacity-40">
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/** Two-column label/value list used on detail pages. */
export function DetailList({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[13px] text-ink-500">{label}</dt>
          <dd className="mt-0.5 break-words text-ink-900">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatCard({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </>
  );
  const cls = 'rounded-xl bg-white p-4 shadow-card transition-colors';
  return to ? (
    <Link to={to} className={`${cls} hover:bg-ink-50`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
