import { CalendarCheck, Check, ChevronLeft, ClipboardCheck, Clock, FileText, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Avatar, ButtonLink, EmptyState, ErrorState, PageSpinner, Rating, VerifiedMark } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { priceLabel } from '@/features/catalog/pricing';
import { useProProfile } from '@/features/catalog/useProProfile';
import { formatDuration } from '@/lib/format';
import { PRICING_LABELS } from '@/lib/status';
import { publicUrl } from '@/lib/storage';

export function ServiceDetailPage() {
  const { slug, serviceSlug } = useParams();
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useProProfile(slug);
  if (isPending) return <PageSpinner />;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div></div>;
  const service = data?.services.find((s) => s.slug === serviceSlug);
  if (!data || !service) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Seo title="Service not found" noindex />
        <div className="card"><EmptyState title="This service isn't available" action={<ButtonLink to={slug ? `/pro/${slug}` : '/explore'}>Back</ButtonLink>} /></div>
      </div>
    );
  }
  const { pro } = data;
  const isOwner = user?.id === pro.user_id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Seo title={`${service.name} by ${pro.display_name}`} description={service.description?.slice(0, 155) ?? `${service.name} — ${priceLabel(service)}`}
        path={`/pro/${pro.slug}/services/${service.slug}`} image={publicUrl(service.images[0])} noindex={pro.status !== 'published'} />
      <Link to={`/pro/${pro.slug}`} className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-white">
        <ChevronLeft className="size-4" aria-hidden="true" /> {pro.display_name}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <p className="text-sm text-ink-400">{service.category?.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{service.name}</h1>
          {service.images.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {service.images.map((p, i) => (
                <img key={p} src={publicUrl(p) ?? ''} alt="" loading={i ? 'lazy' : 'eager'} className={`w-full rounded-xl object-cover ${i === 0 ? 'aspect-[16/9] sm:col-span-2' : 'aspect-[4/3]'}`} />
              ))}
            </div>
          )}
          {service.description && <p className="mt-6 whitespace-pre-line text-ink-200">{service.description}</p>}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {service.materials_included && <InfoBlock icon={Check} title="Materials included">{service.materials_included}</InfoBlock>}
            {service.materials_excluded && <InfoBlock icon={X} title="Not included">{service.materials_excluded}</InfoBlock>}
            {service.preparation_notes && <InfoBlock icon={ClipboardCheck} title="How to prepare">{service.preparation_notes}</InfoBlock>}
            {service.service_area_note && <InfoBlock icon={Clock} title="Service area">{service.service_area_note}</InfoBlock>}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <p className="text-[13px] text-ink-500">{PRICING_LABELS[service.pricing_model]}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-950">{priceLabel(service)}</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-700">
              {service.duration_minutes && <li className="flex items-center gap-2"><Clock className="size-4 text-ink-500" aria-hidden="true" /> About {formatDuration(service.duration_minutes)}</li>}
              {service.requires_inspection && <li className="flex items-center gap-2"><ClipboardCheck className="size-4 text-ink-500" aria-hidden="true" /> Site inspection required before final price</li>}
              {service.pricing_model !== 'fixed' && <li className="flex items-center gap-2"><FileText className="size-4 text-ink-500" aria-hidden="true" /> Final price agreed in a quotation</li>}
            </ul>
            {!isOwner && (
              <div className="mt-5 grid gap-2">
                {service.instant_booking ? (
                  <>
                    <ButtonLink to={`/pro/${pro.slug}/book/${service.slug}`} icon={<CalendarCheck className="size-4" />}>Book a time</ButtonLink>
                    <ButtonLink to={`/pro/${pro.slug}/request?service=${service.id}`} variant="secondary">Ask for a custom quote</ButtonLink>
                  </>
                ) : (
                  <ButtonLink to={`/pro/${pro.slug}/request?service=${service.id}`}>Request a Quote</ButtonLink>
                )}
              </div>
            )}
          </div>
          <Link to={`/pro/${pro.slug}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
            <Avatar name={pro.display_name} path={pro.avatar_path} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink-950">{pro.display_name}</span>
              <Rating value={pro.rating_avg} count={pro.review_count} />
              <span className="block"><VerifiedMark status={pro.verification_status} kinds={pro.verified_kinds} /></span>
            </span>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function InfoBlock({ icon: Icon, title, children }: { icon: typeof Check; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-950"><Icon className="size-4" aria-hidden="true" /> {title}</h2>
      <p className="mt-2 whitespace-pre-line text-sm text-ink-600">{children}</p>
    </div>
  );
}
