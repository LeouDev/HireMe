// Browser-safe configuration only. Server secrets live in Vercel Functions (see api/_lib/env.ts).
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  appUrl: (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin,
};
