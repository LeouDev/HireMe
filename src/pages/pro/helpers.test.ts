import { describe, expect, it } from 'vitest';
import { intField, optionalIntField, priceLabel, slugify, windowsOverlap } from './helpers';

describe('pro page helpers', () => {
  it('slugifies names into valid service/page slugs', () => {
    expect(slugify('Deep Cleaning (2BR)')).toBe('deep-cleaning-2br');
    expect(slugify('  Aircon — Paglilinis ñ  ')).toBe('aircon-paglilinis-n');
    expect(slugify('a'.repeat(79) + ' b')).toBe('a'.repeat(79));
  });

  it('parses whole numbers within range', () => {
    expect(intField(15, 480).parse('60')).toBe(60);
    expect(intField(15, 480).safeParse('10').success).toBe(false);
    expect(intField(15, 480).safeParse('1.5').success).toBe(false);
    expect(optionalIntField(0, 80).parse('')).toBeNull();
    expect(optionalIntField(0, 80).safeParse('81').success).toBe(false);
  });

  it('detects overlapping availability windows', () => {
    expect(windowsOverlap({ start: '08:00', end: '12:00' }, { start: '11:00:00', end: '13:00:00' })).toBe(true);
    expect(windowsOverlap({ start: '08:00', end: '12:00' }, { start: '12:00:00', end: '17:00:00' })).toBe(false);
    expect(windowsOverlap({ start: '09:00', end: '10:00' }, { start: '08:00', end: '17:00' })).toBe(true);
  });

  it('labels prices by pricing model', () => {
    expect(priceLabel({ pricing_model: 'starting', price_cents: 150000 })).toBe('From ₱1,500');
    expect(priceLabel({ pricing_model: 'hourly', price_cents: 50000 })).toBe('₱500/hr');
    expect(priceLabel({ pricing_model: 'fixed', price_cents: 150050 })).toBe('Fixed ₱1,500.50');
    expect(priceLabel({ pricing_model: 'quote', price_cents: null })).toBe('Quote required');
  });
});
