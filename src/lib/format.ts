// Dates are stored as UTC timestamps and always displayed in Asia/Manila.
export const TIME_ZONE = 'Asia/Manila';
export { formatPHP } from '@shared/money';

const dateFmt = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' });

const toDate = (v: string | Date) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+08:00`) : new Date(v));

export const formatDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(toDate(v)) : '—');
export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(toDate(v)) : '—');
export const formatTime = (v: string | Date | null | undefined) => (v ? timeFmt.format(toDate(v)) : '—');
export const formatWeekday = (v: string | Date | null | undefined) => (v ? weekdayFmt.format(toDate(v)) : '—');

export function formatRelative(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(v);
}

/** Today's date in Manila as YYYY-MM-DD. */
export function todayManila(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);
}

// shortcut: Asia/Manila has a fixed +08:00 offset (no DST), so local input values convert by appending it.
export const manilaInputToIso = (value: string) => (value ? new Date(`${value}:00+08:00`).toISOString() : null);
export function isoToManilaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const local = new Date(new Date(iso).getTime() + 8 * 3600000);
  return local.toISOString().slice(0, 16);
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, mins && `${mins}m`].filter(Boolean).join(' ');
}

export const initials = (name: string | null | undefined) =>
  (name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
