// GET /sitemap.xml (rewritten here) — public pages only: home, categories and published professionals.
// Uses the public key: RLS returns only published, active records, so no admin access is needed.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.js';
import { appUrl, publicSupabaseEnv } from './_lib/env.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(): Promise<Response> {
  const { url, anonKey } = publicSupabaseEnv();
  const db = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const base = appUrl();
  const [cats, pros, services] = await Promise.all([
    db.from('service_categories').select('slug').eq('is_active', true),
    db.from('professional_profiles').select('id, slug, updated_at').eq('status', 'published').limit(45000),
    db.from('services').select('slug, professional_id').eq('status', 'active').limit(45000),
  ]);
  const proSlugs = new Map((pros.data ?? []).map((p) => [p.id, p.slug]));
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${base}/` }, { loc: `${base}/explore` }, { loc: `${base}/categories` }, { loc: `${base}/become-a-pro` },
    ...(cats.data ?? []).map((c) => ({ loc: `${base}/category/${c.slug}` })),
    ...(pros.data ?? []).map((p) => ({ loc: `${base}/pro/${p.slug}`, lastmod: p.updated_at })),
    ...(services.data ?? []).filter((s) => proSlugs.has(s.professional_id)).map((s) => ({ loc: `${base}/pro/${proSlugs.get(s.professional_id)}/services/${s.slug}` })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
