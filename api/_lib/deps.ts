import { paymentConfig } from './env.js';
import { createPayMongo } from './paymongo.js';
import type { Deps } from './payments.js';
import { supabaseStore } from './supabaseStore.js';

export function paymentDeps(): Deps {
  const { secretKey, ...config } = paymentConfig();
  return { store: supabaseStore(), provider: config.enabled && secretKey ? createPayMongo(secretKey) : null, config };
}
