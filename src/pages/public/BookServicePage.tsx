import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Avatar, Button, ButtonLink, EmptyState, ErrorState, Field, FormError, Input, PageSpinner, Skeleton, Textarea } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { priceLabel } from '@/features/catalog/pricing';
import { useProProfile } from '@/features/catalog/useProProfile';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration, formatTime, todayManila } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

export function BookServicePage() {
  const { slug, serviceSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useProProfile(slug);
  const service = data?.services.find((s) => s.slug === serviceSlug && s.instant_booking);
  const days = Array.from({ length: 14 }, (_, i) => todayManila(i));
  const [day, setDay] = useState(days[0]!);
  const [slot, setSlot] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const slots = useQuery({
    queryKey: ['slots', data?.pro.id, day, service?.duration_minutes],
    enabled: !!data && !!service,
    queryFn: async () => unwrap(await supabase.rpc('get_available_slots', {
      p_professional_id: data!.pro.id, p_from: day, p_to: day, p_duration_minutes: service!.duration_minutes!,
    })) as unknown as string[],
  });

  if (isPending) return <PageSpinner />;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div></div>;
  if (!data || !service || data.pro.status !== 'published') {
    return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><EmptyState title="This service can't be booked instantly" description="Request a quote instead." action={<ButtonLink to={slug ? `/pro/${slug}/request` : '/explore'}>Request a quote</ButtonLink>} /></div></div>;
  }
  const { pro } = data;
  if (pro.user_id === user?.id) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><EmptyState title="You can't book your own service" action={<ButtonLink to="/pro-dashboard/services">Manage services</ButtonLink>} /></div></div>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!slot) return setSubmitError('Choose a time.');
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: id, error: err } = await supabase.rpc('create_instant_booking', {
        p_service_id: service.id, p_start: slot, p_location_city: city, p_location_address: address, p_notes: notes || undefined,
      });
      if (err) throw err;
      navigate(`/dashboard/bookings/${id}`);
    } catch (err) {
      setSubmitError(errorMessage(err));
      slots.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Seo title={`Book ${service.name}`} noindex />
      <Link to={`/pro/${pro.slug}`} className="flex items-center gap-3">
        <Avatar name={pro.display_name} path={pro.avatar_path} />
        <span>
          <span className="block text-sm text-ink-400">Book with {pro.display_name}</span>
          <span className="block font-display font-semibold text-white">{service.name} · {priceLabel(service)} · {formatDuration(service.duration_minutes)}</span>
        </span>
      </Link>

      <form onSubmit={submit} className="card mt-6 space-y-6 p-5 sm:p-6">
        <fieldset>
          <legend className="label">Choose a day</legend>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const date = new Date(`${d}T00:00:00+08:00`);
              const active = d === day;
              return (
                <button key={d} type="button" onClick={() => { setDay(d); setSlot(null); }} aria-pressed={active}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-lg border py-2 text-sm ${active ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-200 bg-white hover:border-ink-400'}`}>
                  <span className="text-[11px] uppercase">{date.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })}</span>
                  <span className="font-display text-lg font-semibold">{date.toLocaleDateString('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' })}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Available times (Philippine time)</legend>
          {slots.isPending ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : slots.isError ? (
            <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
          ) : slots.data?.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.data.map((s) => (
                <button key={s} type="button" onClick={() => setSlot(s)} aria-pressed={slot === s}
                  className={`h-10 rounded-md border text-sm tabular-nums ${slot === s ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-200 bg-white hover:border-ink-400'}`}>
                  {formatTime(s)}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">No open times on this day. Try another day.</p>
          )}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" required>{(p) => <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} maxLength={80} />}</Field>
          <Field label="Service address" required hint="Only shared with this professional.">
            {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} required minLength={5} maxLength={300} autoComplete="street-address" />}
          </Field>
        </div>
        <Field label="Notes for the professional">{(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />}</Field>

        {slot && (
          <Alert tone="neutral" title={`${service.name} on ${formatDateTime(slot)}`}>
            Total {priceLabel(service)}. If online payment is required, you'll pay through PayMongo on the next screen; the time is held for a limited period while you pay.
          </Alert>
        )}
        <FormError message={submitError} />
        <div className="flex justify-end gap-2">
          <ButtonLink to={`/pro/${pro.slug}`} variant="secondary">Cancel</ButtonLink>
          <Button type="submit" loading={submitting} disabled={!slot}>Reserve this time</Button>
        </div>
      </form>
    </div>
  );
}
