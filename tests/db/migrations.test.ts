import { describe, expect, it } from 'vitest';
import { createTestDb } from './harness.js';

describe('migrations', () => {
  it('apply cleanly on a fresh database', async () => {
    const t = await createTestDb();
    const rows = await t.q('service', `select count(*)::int as n from public.service_categories`);
    expect((rows[0] as { n: number }).n).toBeGreaterThan(5);
  });
});
