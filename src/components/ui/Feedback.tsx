import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';
import { statusInfo, type StatusDomain, type Tone } from '@/lib/status';

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-ink-400" role="status">
      <Spinner className="size-6" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-100 ${className}`} aria-hidden="true" />;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  info: 'bg-info-50 text-info-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  dark: 'bg-ink-900 text-white',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`on-glass inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ domain, status }: { domain: StatusDomain; status: string | null | undefined }) {
  const [label, tone] = statusInfo(domain, status);
  return <Badge tone={tone}>{label}</Badge>;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`on-glass flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = '' }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`on-glass flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-medium text-ink-900">We couldn't load this.</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 text-sm font-medium text-ink-900 underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: 'border-ink-200 bg-ink-50 text-ink-800',
    info: 'border-info-600/20 bg-info-50 text-ink-800',
    success: 'border-success-600/20 bg-success-50 text-ink-800',
    warning: 'border-warning-600/25 bg-warning-50 text-ink-800',
    danger: 'border-danger-600/20 bg-danger-50 text-ink-800',
    dark: 'border-ink-200 bg-ink-100 text-ink-900',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`on-glass rounded-xl border px-4 py-3 text-sm backdrop-blur-xl ${styles[tone]}`}>
      {title && <p className="font-medium text-ink-900">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}
