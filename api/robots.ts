// GET /robots.txt (rewritten here) so the sitemap line carries the absolute site URL.
import { appUrl } from './_lib/env.js';

export function GET(): Response {
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /dashboard', 'Disallow: /pro-dashboard', 'Disallow: /admin', 'Disallow: /api/', `Sitemap: ${appUrl()}/sitemap.xml`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, s-maxage=86400' } });
}
