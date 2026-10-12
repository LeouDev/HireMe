// Server-only configuration. These values must never be exposed with a VITE_ prefix.
import type { PaymentConfig } from './payments.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Server misconfigured: ${name} is not set.`);
  return value;
}

export function supabaseEnv() {
  return { url: required('SUPABASE_URL'), serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY') };
}

/** Public (anon/publishable) credentials: enough for data RLS exposes to everyone. */
export function publicSupabaseEnv() {
  return {
    url: process.env.SUPABASE_URL ?? required('VITE_SUPABASE_URL'),
    anonKey: process.env.SUPABASE_ANON_KEY ?? required('VITE_SUPABASE_ANON_KEY'),
  };
}

export const appUrl = () => (process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, '') || 'http://localhost:5173';

export function paymentConfig(): PaymentConfig & { secretKey: string | null } {
  const secretKey = process.env.PAYMONGO_SECRET_KEY ?? null;
  const live = !!secretKey?.startsWith('sk_live_');
  const approved = process.env.PAYMONGO_LIVE_APPROVED === 'true';
  const methods = (process.env.PAYMONGO_PAYMENT_METHODS ?? 'card,gcash,paymaya').split(',').map((m) => m.trim()).filter(Boolean);
  let disabledReason: string | undefined;
  if (!secretKey) disabledReason = 'Online payments are not configured yet.';
  else if (live && !approved) disabledReason = 'Live payments are disabled until the PayMongo merchant arrangement for the marketplace is approved.';
  return {
    secretKey,
    appUrl: appUrl(),
    paymentMethodTypes: methods,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET ?? '',
    enabled: !disabledReason,
    disabledReason,
  };
}
