import { formatPHP } from '@shared/money';

export function priceLabel(s: { pricing_model: string; price_cents: number | null }): string {
  switch (s.pricing_model) {
    case 'fixed': return formatPHP(s.price_cents);
    case 'starting': return `From ${formatPHP(s.price_cents)}`;
    case 'hourly': return `${formatPHP(s.price_cents)}/hr`;
    default: return 'Quote required';
  }
}
