import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Briefcase, Clock, Heart, Languages, Mail, MapPin, MessageSquare, Phone, Share2, Pencil, CalendarCheck, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Avatar, Button, ButtonLink, Dialog, EmptyState, ErrorState, PageSpinner, Pagination, Rating, Stars, useToast } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { useFavoriteIds } from '@/features/catalog/api';
import { priceLabel } from '@/features/catalog/pricing';
import { useProProfile, useProReviews } from '@/features/catalog/useProProfile';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDuration } from '@/lib/format';
import { VERIFICATION_KIND_LABELS } from '@/lib/status';
import { publicUrl } from '@/lib/storage';
import { supabase, type PortfolioItem } from '@/lib/supabase';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
};

export function ProProfilePage() {
  const { slug } = useParams();
  const { data, isPending, error, refetch } = useProProfile(slug);
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const favorites = useFavoriteIds(user?.id);
  const [reviewPage, setReviewPage] = useState(1);
  const [lightbox, setLightbox] = useState<PortfolioItem | null>(null);
  const [busy, setBusy] = useState(false);
  const reviews = useProReviews(data?.pro.id, reviewPage);

  if (isPending) return <PageSpinner />;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div></div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Seo title="Professional not found" noindex />
        <div className="card"><EmptyState title="This page isn't available" description="The professional may have unpublished their page or the link is incorrect."
          action={<ButtonLink to="/explore">Explore professionals</ButtonLink>} /></div>
      </div>
    );
  }

  const { pro, categories, services, portfolio, areas, rules } = data;
  const isOwner = user?.id === pro.user_id;
  const url = `${env.appUrl}/pro/${pro.slug}`;
  const isFavorite = favorites.data?.has(pro.id) ?? false;
  const cover = publicUrl(pro.cover_path);
  const faqs = (Array.isArray(pro.faqs) ? pro.faqs : []) as { question?: string; answer?: string }[];
  const primaryCategory = categories[0]?.name;
  const requireLogin = () => navigate(`/login?next=${encodeURIComponent(`/pro/${pro.slug}`)}`);

  const share = async () => {
    const shareData = { title: pro.display_name, text: pro.headline ?? `${pro.display_name} on Hire Me!`, url };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* user cancelled */ return; }
    }
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  };
  const message = async () => {
    if (!user) return requireLogin();
    setBusy(true);
    const { data: id, error: err } = await supabase.rpc('start_conversation', { p_professional_id: pro.id });
    setBusy(false);
    if (err) return toast(errorMessage(err), 'error');
    navigate(`/dashboard/messages/${id}`);
  };
  const toggleFavorite = async () => {
    if (!user) return requireLogin();
    const { error: err } = isFavorite
      ? await supabase.from('favorites').delete().eq('professional_id', pro.id).eq('user_id', user.id)
      : await supabase.from('favorites').insert({ professional_id: pro.id, user_id: user.id });
    if (err) return toast(errorMessage(err), 'error');
    qc.invalidateQueries({ queryKey: ['favorites'] });
    toast(isFavorite ? 'Removed from saved' : 'Saved to your list');
  };

  const rulesByDay = DAYS.map((_, d) => rules.filter((r) => r.weekday === d));

  return (
    <article className="pb-8">
      <Seo title={`${pro.display_name}${primaryCategory ? ` — ${primaryCategory}` : ''}${pro.city ? ` in ${pro.city}` : ''}`}
        description={pro.headline ?? pro.bio?.slice(0, 155) ?? undefined} path={`/pro/${pro.slug}`}
        image={publicUrl(pro.cover_path) ?? publicUrl(pro.avatar_path)} noindex={pro.status !== 'published'} />

      {pro.status !== 'published' && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Alert tone="warning" title="Preview — this page is not published">
            Only you can see it. <Link to="/pro-dashboard/profile" className="font-medium underline">Publish it from your dashboard</Link> when you're ready.
          </Alert>
        </div>
      )}

      {/* Header */}
      <header className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="glass relative mx-auto h-40 max-w-[1400px] overflow-hidden rounded-[32px] sm:h-56">
          {cover && <img src={cover} alt="" className="size-full object-cover opacity-80" />}
        </div>
        <div className="mx-auto -mt-12 max-w-6xl px-4 sm:-mt-16 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar name={pro.display_name} path={pro.avatar_path} size="xl" className="ring-4 ring-black sm:size-32" />
            <div className="min-w-0 flex-1 sm:pb-2">
              <h1 className="text-3xl font-semibold text-white">{pro.display_name}</h1>
              {pro.business_name && <p className="text-ink-300">{pro.business_name}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-300 [&_.text-ink-500]:text-ink-400">
                {categories.map((c) => c.name).join(' · ')}
                {pro.city && <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden="true" />{pro.city}{pro.province ? `, ${pro.province}` : ''}</span>}
                <Rating value={pro.rating_avg} count={pro.review_count} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:pb-2">
              {isOwner ? (
                <ButtonLink to="/pro-dashboard/profile" variant="secondary" icon={<Pencil className="size-4" />}>Edit page</ButtonLink>
              ) : (
                <>
                  <Button onClick={message} loading={busy} variant="secondary" icon={<MessageSquare className="size-4" />}>Message</Button>
                  <ButtonLink to={`/pro/${pro.slug}/request`} icon={<FileText className="size-4" />}>Request a Quote</ButtonLink>
                </>
              )}
              <Button variant="secondary" size="icon" onClick={share} aria-label="Share profile"><Share2 className="size-4" /></Button>
              {!isOwner && (
                <Button variant="secondary" size="icon" onClick={toggleFavorite} aria-label={isFavorite ? 'Remove from saved' : 'Save professional'} aria-pressed={isFavorite}>
                  <Heart className={`size-4 ${isFavorite ? 'fill-ink-950' : ''}`} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-10 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          {/* About */}
          <Section title="About">
            <div className="card rounded-2xl p-5 sm:p-6">
            {pro.headline && <p className="text-lg text-ink-800">{pro.headline}</p>}
            {pro.bio ? <p className="mt-3 whitespace-pre-line text-ink-700">{pro.bio}</p> : !pro.headline && <p className="text-ink-500">No introduction yet.</p>}
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              {pro.years_experience != null && <Fact icon={Briefcase} label="Experience" value={`${pro.years_experience} year${pro.years_experience === 1 ? '' : 's'}`} />}
              {pro.languages.length > 0 && <Fact icon={Languages} label="Languages" value={pro.languages.join(', ')} />}
              {pro.certifications && <Fact icon={BadgeCheck} label="Certifications (self-reported)" value={pro.certifications} />}
              {pro.licenses && <Fact icon={BadgeCheck} label="Licenses (self-reported)" value={pro.licenses} />}
            </dl>
            </div>
          </Section>

          {/* Services */}
          <Section title="Services" id="services">
            {services.length === 0 ? (
              <p className="text-ink-400">No services listed yet. You can still request a quote.</p>
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white shadow-card">
                {services.map((s) => (
                  <li key={s.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link to={`/pro/${pro.slug}/services/${s.slug}`} className="font-display font-semibold text-ink-950 hover:underline">{s.name}</Link>
                      {s.description && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{s.description}</p>}
                      <p className="mt-1.5 text-xs text-ink-500">
                        {[s.category?.name, s.duration_minutes ? `About ${formatDuration(s.duration_minutes)}` : null, s.requires_inspection ? 'Inspection required' : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <p className="font-display font-semibold tabular-nums text-ink-950">{priceLabel(s)}</p>
                      {!isOwner && (s.instant_booking ? (
                        <ButtonLink to={`/pro/${pro.slug}/book/${s.slug}`} size="sm" icon={<CalendarCheck className="size-4" />}>Book</ButtonLink>
                      ) : (
                        <ButtonLink to={`/pro/${pro.slug}/request?service=${s.id}`} size="sm" variant="secondary">Request quote</ButtonLink>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Portfolio */}
          {portfolio.length > 0 && (
            <Section title="Portfolio">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {portfolio.map((p) => (
                  <button key={p.id} type="button" onClick={() => setLightbox(p)} className="group overflow-hidden rounded-2xl bg-white text-left shadow-card">
                    <img src={publicUrl(p.images[0]) ?? ''} alt={p.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]" />
                    <span className="block p-3">
                      <span className="block truncate text-sm font-medium text-ink-900">{p.title}</span>
                      {p.completed_on && <span className="text-xs text-ink-500">{formatDate(p.completed_on)}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Reviews */}
          <Section title={`Reviews${pro.review_count ? ` (${pro.review_count})` : ''}`}>
            {reviews.data?.rows.length ? (
              <>
                <ul className="space-y-4">
                  {reviews.data.rows.map((r) => (
                    <li key={r.id} className="rounded-2xl bg-white p-5 shadow-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Stars value={r.rating} />
                        <span className="text-xs text-ink-500">{formatDate(r.created_at)}</span>
                      </div>
                      {r.body && <p className="mt-3 whitespace-pre-line text-sm text-ink-700">{r.body}</p>}
                      <p className="mt-3 text-[13px] text-ink-500">
                        <span className="font-medium text-ink-800">{r.reviewer_name}</span> · Verified booking{r.service_name ? ` · ${r.service_name}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                <Pagination page={reviewPage} pageSize={5} total={reviews.data.total} onChange={setReviewPage} />
              </>
            ) : (
              <p className="text-ink-400">{reviews.isPending ? 'Loading reviews…' : 'No reviews yet. Reviews can only be left after a completed booking.'}</p>
            )}
          </Section>

          {/* FAQs */}
          {faqs.length > 0 && (
            <Section title="Frequently asked questions">
              <div className="divide-y divide-ink-100 rounded-2xl bg-white shadow-card">
                {faqs.map((f, i) => (
                  <details key={i} className="group p-5">
                    <summary className="cursor-pointer list-none font-medium text-ink-900 marker:hidden">{f.question}</summary>
                    <p className="mt-2 whitespace-pre-line text-sm text-ink-600">{f.answer}</p>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="font-display font-semibold text-ink-950">Verification</h2>
            {pro.verified_kinds.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {pro.verified_kinds.map((k) => (
                  <li key={k} className="flex items-center gap-2 text-ink-800"><BadgeCheck className="size-4" aria-hidden="true" /> {VERIFICATION_KIND_LABELS[k] ?? k} verified</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-500">Not yet verified by Hire Me!.</p>
            )}
            <p className="mt-3 text-xs text-ink-500">Identity verification confirms who the professional is. It does not certify their workmanship.</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="flex items-center gap-2 font-display font-semibold text-ink-950"><Clock className="size-4" aria-hidden="true" /> Working hours</h2>
            {rules.length ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                {DAYS.map((d, i) => (
                  <div key={d} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{d.slice(0, 3)}</dt>
                    <dd className="text-right text-ink-800">{rulesByDay[i]?.length ? rulesByDay[i].map((r) => `${hhmm(r.start_time)}–${hhmm(r.end_time)}`).join(', ') : 'Closed'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-500">{pro.working_hours_note ?? 'Contact the professional for availability.'}</p>
            )}
            {rules.length > 0 && pro.working_hours_note && <p className="mt-3 text-xs text-ink-500">{pro.working_hours_note}</p>}
            <p className="mt-3 text-xs text-ink-500">Times in Philippine time (Asia/Manila).</p>
          </div>

          {(areas.length > 0 || pro.city) && (
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-display font-semibold text-ink-950"><MapPin className="size-4" aria-hidden="true" /> Service areas</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pro.city && <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-800">{pro.city}</span>}
                {areas.map((a) => <span key={a.id} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-800">{a.area ? `${a.area}, ${a.city}` : a.city}</span>)}
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-5 text-white">
            <h2 className="font-display font-semibold">Work with {pro.display_name.split(' ')[0]}</h2>
            <p className="mt-1 text-sm text-ink-300">Describe your project and get a quotation. Messages stay on Hire Me!.</p>
            {!isOwner && <ButtonLink to={`/pro/${pro.slug}/request`} variant="inverse" className="mt-4 w-full">Request a Quote</ButtonLink>}
            {(pro.public_phone || pro.public_email) && (
              <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm text-ink-200">
                {pro.public_phone && <li className="flex items-center gap-2"><Phone className="size-4" aria-hidden="true" /><a href={`tel:${pro.public_phone}`} className="hover:underline">{pro.public_phone}</a></li>}
                {pro.public_email && <li className="flex items-center gap-2"><Mail className="size-4" aria-hidden="true" /><a href={`mailto:${pro.public_email}`} className="break-all hover:underline">{pro.public_email}</a></li>}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.title ?? ''} description={lightbox?.completed_on ? formatDate(lightbox.completed_on) : undefined} size="lg">
        {lightbox && (
          <div className="space-y-3">
            {lightbox.description && <p className="text-sm text-ink-600">{lightbox.description}</p>}
            {lightbox.images.map((path) => <img key={path} src={publicUrl(path) ?? ''} alt="" loading="lazy" className="w-full rounded-lg" />)}
          </div>
        )}
      </Dialog>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
      <div>
        <dt className="text-ink-500">{label}</dt>
        <dd className="whitespace-pre-line text-ink-900">{value}</dd>
      </div>
    </div>
  );
}
