import { describe, expect, it } from 'vitest';
import { centsToPesoInput, formatPHP, parsePesosToCents, previewLineTotal, previewQuoteTotals } from './money';

describe('money', () => {
  it('formats centavos as pesos', () => {
    expect(formatPHP(150050)).toBe('₱1,500.50');
    expect(formatPHP(29900)).toBe('₱299');
    expect(formatPHP(29900, { showCents: true })).toBe('₱299.00');
    expect(formatPHP(0)).toBe('₱0');
    expect(formatPHP('12345678901')).toBe('₱123,456,789.01');
    expect(formatPHP(null)).toBe('—');
  });

  it('parses typed peso amounts without floats', () => {
    expect(parsePesosToCents('1,500.5')).toBe(150050);
    expect(parsePesosToCents('₱ 299')).toBe(29900);
    expect(parsePesosToCents('0.07')).toBe(7);
    expect(parsePesosToCents('-5')).toBeNull();
    expect(parsePesosToCents('1.234')).toBeNull();
    expect(parsePesosToCents('abc')).toBeNull();
    expect(centsToPesoInput(150050)).toBe('1500.50');
    expect(centsToPesoInput(29900)).toBe('299');
  });

  it('previews totals exactly like the database', () => {
    // Same figures as tests/db/workflow.test.ts
    const lines = [previewLineTotal('2.5', 33333), previewLineTotal('1', 45000), previewLineTotal('1', 10000)];
    expect(lines).toEqual([83333, 45000, 10000]);
    expect(previewQuoteTotals(lines, 5000, 1200)).toEqual({ subtotal: 138333, taxable: 133333, tax: 16000, total: 149333 });
  });
});
