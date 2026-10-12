import type { ReactNode } from 'react';
import { Money } from '@/components/ui';
import { formatDate, formatDateTime, formatDuration, formatPHP } from '@/lib/format';

export interface QuoteDocData {
  quote_number: string;
  revision: number;
  title: string;
  scope_of_work: string;
  notes: string | null;
  estimated_duration_minutes: number | null;
  proposed_start: string | null;
  payment_terms: string | null;
  exclusions: string | null;
  warranty_terms: string | null;
  valid_until: string;
  discount_cents: number;
  tax_rate_bp: number;
  deposit_percent: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at?: string;
  sent_at?: string | null;
}

export interface QuoteItemData {
  kind: string;
  description: string;
  quantity: number | string;
  unit_price_cents: number;
  line_total_cents: number;
}

const KIND_LABEL: Record<string, string> = { labor: 'Labor', material: 'Materials', other: 'Other charges' };

/** Read-only, print-friendly rendering of a quotation (live record or accepted snapshot). */
export function QuoteDocument({ quote, items, professional, customer }: {
  quote: QuoteDocData; items: QuoteItemData[]; professional?: string | null; customer?: string | null;
}) {
  const deposit = Math.round((quote.total_cents * quote.deposit_percent) / 100);
  const groups = ['labor', 'material', 'other'].map((k) => [k, items.filter((i) => i.kind === k)] as const).filter(([, list]) => list.length);
  return (
    <div className="space-y-6 text-sm text-ink-800">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-ink-500 uppercase">Quotation</p>
          <p className="font-display text-lg font-semibold text-ink-950">{quote.quote_number} · Revision {quote.revision}</p>
          <p className="text-ink-600">{quote.title}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <dt className="text-ink-500">From</dt><dd className="text-ink-900">{professional ?? '—'}</dd>
          <dt className="text-ink-500">For</dt><dd className="text-ink-900">{customer ?? '—'}</dd>
          {quote.sent_at && <><dt className="text-ink-500">Sent</dt><dd>{formatDate(quote.sent_at)}</dd></>}
          <dt className="text-ink-500">Valid until</dt><dd>{formatDate(quote.valid_until)}</dd>
        </dl>
      </div>

      {quote.scope_of_work && <Block title="Scope of work">{quote.scope_of_work}</Block>}

      <div className="overflow-x-auto rounded-lg border border-ink-200">
        <table className="w-full min-w-[520px]">
          <thead className="bg-ink-50 text-left text-[13px] text-ink-500">
            <tr><th className="px-4 py-2 font-medium">Item</th><th className="px-4 py-2 text-right font-medium">Qty</th><th className="px-4 py-2 text-right font-medium">Unit price</th><th className="px-4 py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {groups.map(([kind, list]) => (
              <GroupRows key={kind} label={KIND_LABEL[kind] ?? kind} items={list} />
            ))}
          </tbody>
          <tfoot className="border-t border-ink-200 text-[13px]">
            <TotalRow label="Subtotal" cents={quote.subtotal_cents} />
            {quote.discount_cents > 0 && <TotalRow label="Discount" cents={-quote.discount_cents} />}
            {quote.tax_rate_bp > 0 && <TotalRow label={`Tax (${(quote.tax_rate_bp / 100).toFixed(2).replace(/\.00$/, '')}%)`} cents={quote.tax_cents} />}
            <tr className="text-base">
              <td colSpan={3} className="px-4 py-3 text-right font-semibold text-ink-950">Total (PHP)</td>
              <td className="px-4 py-3 text-right font-display font-semibold text-ink-950"><Money cents={quote.total_cents} showCents /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Schedule">
          {quote.proposed_start ? `Proposed start: ${formatDateTime(quote.proposed_start)}` : 'To be agreed'}
          {quote.estimated_duration_minutes ? `\nEstimated duration: ${formatDuration(quote.estimated_duration_minutes)}` : ''}
        </Block>
        <Block title="Payment terms">
          {quote.deposit_percent > 0
            ? `Deposit of ${quote.deposit_percent}% (${formatAmount(deposit)}) paid online after the contract is signed. Balance of ${formatAmount(quote.total_cents - deposit)} as agreed below.`
            : 'No online deposit. Payment is made to the professional as agreed below.'}
          {quote.payment_terms ? `\n\n${quote.payment_terms}` : ''}
        </Block>
        {quote.exclusions && <Block title="Exclusions">{quote.exclusions}</Block>}
        {quote.warranty_terms && <Block title="Warranty">{quote.warranty_terms}</Block>}
      </div>
      {quote.notes && <Block title="Notes">{quote.notes}</Block>}
    </div>
  );
}

const formatAmount = (cents: number) => formatPHP(cents, { showCents: true });

function GroupRows({ label, items }: { label: string; items: QuoteItemData[] }) {
  return (
    <>
      <tr><td colSpan={4} className="border-t border-ink-100 px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</td></tr>
      {items.map((i, idx) => (
        <tr key={idx}>
          <td className="px-4 py-1.5">{i.description}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{Number(i.quantity)}</td>
          <td className="px-4 py-1.5 text-right"><Money cents={i.unit_price_cents} showCents /></td>
          <td className="px-4 py-1.5 text-right"><Money cents={i.line_total_cents} showCents /></td>
        </tr>
      ))}
    </>
  );
}

function TotalRow({ label, cents }: { label: string; cents: number }) {
  return (
    <tr>
      <td colSpan={3} className="px-4 py-1.5 text-right text-ink-600">{label}</td>
      <td className="px-4 py-1.5 text-right"><Money cents={cents} showCents /></td>
    </tr>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium tracking-wide text-ink-500 uppercase">{title}</h3>
      <p className="whitespace-pre-line text-ink-800">{children}</p>
    </section>
  );
}
