// Pure helpers for the professional pages (no Supabase/env imports, so they are unit-testable).
import { z } from 'zod';
import { formatPHP, formatTime } from '@/lib/format';

export const emptyToNull = (v: string) => (v === '' ? null : v);

/** "Limpieza Básica (2BR)" -> "limpieza-basica-2br" */
export function slugify(text: string, maxLength = 80): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/** Trimmed optional text; empty string means "not set". */
export const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);

const isIntIn = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

/** Whole number typed into an input (form values stay strings; parsed on submit). */
export const intField = (min: number, max: number) =>
  z.string().trim().refine((v) => isIntIn(v, min, max), `Enter a whole number from ${min} to ${max}.`).transform(Number);

/** Like intField, but an empty input means "not set" (null). */
export const optionalIntField = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || isIntIn(v, min, max), `Enter a whole number from ${min} to ${max}.`)
    .transform((v) => (v === '' ? null : Number(v)));

/** Postgres `time` ("08:30:00") -> "8:30 AM" (wall-clock time, Manila). */
export const formatClock = (t: string) => formatTime(`1970-01-01T${t.slice(0, 5)}:00+08:00`);

/** True when two same-day time windows ("HH:MM" or "HH:MM:SS") overlap; touching edges do not. */
export const windowsOverlap = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  a.start.slice(0, 5) < b.end.slice(0, 5) && b.start.slice(0, 5) < a.end.slice(0, 5);

export function priceLabel(s: { pricing_model: string; price_cents: number | null }): string {
  switch (s.pricing_model) {
    case 'quote': return 'Quote required';
    case 'starting': return `From ${formatPHP(s.price_cents)}`;
    case 'hourly': return `${formatPHP(s.price_cents)}/hr`;
    default: return `Fixed ${formatPHP(s.price_cents)}`;
  }
}
