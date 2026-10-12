// Money is integer centavos everywhere. These helpers never use floating-point arithmetic.

/** Formats integer centavos as "₱1,500.50". */
export function formatPHP(cents: number | bigint | string | null | undefined, opts: { showCents?: boolean } = {}): string {
  if (cents === null || cents === undefined || cents === '') return '—';
  const value = BigInt(cents);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const pesos = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centavos = (abs % 100n).toString().padStart(2, '0');
  const showCents = opts.showCents ?? centavos !== '00';
  return `${negative ? '-' : ''}₱${pesos}${showCents ? `.${centavos}` : ''}`;
}

/** Parses a peso amount typed by a person ("1,500.5", "₱ 1500") into integer centavos. Returns null if invalid. */
export function parsePesosToCents(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '').replace(/^PHP/i, '');
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Converts centavos to an editable peso string ("1500.50") without float math. */
export function centsToPesoInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Mirrors the database rule (round half away from zero) for previews only.
 * The database computes the authoritative totals; the UI never sends totals.
 */
export function previewLineTotal(quantity: string, unitPriceCents: number): number {
  const q = /^\d+(\.\d{1,2})?$/.test(quantity) ? quantity : '0';
  const [w = '0', f = ''] = q.split('.');
  const hundredths = BigInt(w) * 100n + BigInt(f.padEnd(2, '0'));
  const product = hundredths * BigInt(unitPriceCents); // centavos * 100
  return Number((product + 50n) / 100n);
}

export function previewQuoteTotals(lineTotals: number[], discountCents: number, taxRateBp: number) {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const taxable = Math.max(subtotal - discountCents, 0);
  const tax = Number((BigInt(taxable) * BigInt(taxRateBp) + 5000n) / 10000n);
  return { subtotal, taxable, tax, total: taxable + tax };
}
