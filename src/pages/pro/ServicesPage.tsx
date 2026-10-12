import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench, Zap } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, FormError, Input, MoneyInput,
  PageHeader, PageSpinner, Select, Skeleton, StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { PRICING_LABELS } from '@/lib/status';
import { publicUrl } from '@/lib/storage';
import { supabase, unwrap, type Service } from '@/lib/supabase';
import { centsToPesoInput, parsePesosToCents } from '@shared/money';
import { emptyToNull, optionalIntField, optionalText, priceLabel, slugify } from './helpers';
import { ImageUploader, useCategories } from './shared';

const PRICING_MODELS = ['fixed', 'starting', 'hourly', 'quote'] as const;
const STATUSES = ['draft', 'active', 'inactive', 'archived'] as const;
type ServiceStatus = (typeof STATUSES)[number];
type ServiceRow = Service & { category: { name: string } | null };

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter at least 2 characters.').max(120, 'Keep this under 120 characters.'),
    slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/, 'Use 2–80 lowercase letters, numbers and hyphens, starting and ending with a letter or number.'),
    category_id: z.string(),
    description: optionalText(5000),
    pricing_model: z.enum(PRICING_MODELS),
    price: z.string(),
    duration_minutes: optionalIntField(15, 10080),
    service_area_note: optionalText(500),
    materials_included: optionalText(2000),
    materials_excluded: optionalText(2000),
    preparation_notes: optionalText(2000),
    requires_inspection: z.boolean(),
    instant_booking: z.boolean(),
    images: z.array(z.string()).max(8, 'Up to 8 images.'),
    status: z.enum(STATUSES),
  })
  .superRefine((v, ctx) => {
    if (v.pricing_model !== 'quote') {
      const cents = parsePesosToCents(v.price);
      if (cents === null || cents <= 0) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Enter a price greater than ₱0, e.g. 1500 or 1,500.50.' });
    }
    if (v.instant_booking && (v.pricing_model !== 'fixed' || v.duration_minutes === null || v.requires_inspection)) {
      ctx.addIssue({
        code: 'custom',
        path: ['instant_booking'],
        message: 'Instant booking needs a fixed price, a set duration and no inspection, so customers know exactly what they are booking.',
      });
    }
  });
type FormInput = z.input<typeof schema>;

function toForm(s: ServiceRow | null): FormInput {
  return {
    name: s?.name ?? '',
    slug: s?.slug ?? '',
    category_id: s?.category_id ?? '',
    description: s?.description ?? '',
    pricing_model: (s?.pricing_model ?? 'fixed') as FormInput['pricing_model'],
    price: centsToPesoInput(s?.price_cents),
    duration_minutes: s?.duration_minutes?.toString() ?? '',
    service_area_note: s?.service_area_note ?? '',
    materials_included: s?.materials_included ?? '',
    materials_excluded: s?.materials_excluded ?? '',
    preparation_notes: s?.preparation_notes ?? '',
    requires_inspection: s?.requires_inspection ?? false,
    instant_booking: s?.instant_booking ?? false,
    images: s?.images ?? [],
    status: (s?.status ?? 'draft') as ServiceStatus,
  };
}

export function ServicesPage() {
  const { pro } = useAuth();
  return pro ? <Services proId={pro.id} /> : <PageSpinner />;
}

function Services({ proId }: { proId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | ServiceStatus>('all');
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);

  const services = useQuery({
    queryKey: ['pro-services', proId],
    queryFn: async () =>
      (unwrap(
        await supabase.from('services').select('*, category:service_categories(name)').eq('professional_id', proId).order('created_at', { ascending: false }),
      ) ?? []) as ServiceRow[],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['pro-services', proId] });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ServiceStatus }) =>
      unwrap(await supabase.from('services').update({ status }).eq('id', id)),
    onSuccess: (_d, { status }) => toast({ active: 'Service activated', inactive: 'Service deactivated', archived: 'Service archived', draft: 'Saved' }[status]),
    onError: (e) => toast(errorMessage(e), 'error'),
    onSettled: invalidate,
  });

  const remove = async (s: ServiceRow) => {
    const { error } = await supabase.from('services').delete().eq('id', s.id);
    if (error?.code === '23503') throw new Error('This service is linked to requests or bookings. Archive it instead.');
    if (error) throw error;
    await invalidate();
    toast('Service deleted');
  };

  const all = services.data ?? [];
  const counts = Object.fromEntries(STATUSES.map((st) => [st, all.filter((s) => s.status === st).length])) as Record<ServiceStatus, number>;
  const shown = filter === 'all' ? all : all.filter((s) => s.status === filter);

  return (
    <>
      <PageHeader
        title="Services"
        description="What you offer, how it's priced, and whether customers can book it instantly."
        actions={<Button variant="inverse" onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden="true" />}>New service</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-1.5 border-b border-ink-100 px-4 py-3" role="group" aria-label="Filter by status">
          {(['all', ...STATUSES] as const).map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={filter === st}
              onClick={() => setFilter(st)}
              className={`rounded-full px-3 py-1 text-[13px] font-medium capitalize ${filter === st ? 'bg-ink-950 text-white' : 'text-ink-600 hover:bg-ink-100'}`}
            >
              {st} <span className="tabular-nums opacity-70">{st === 'all' ? all.length : counts[st]}</span>
            </button>
          ))}
        </div>

        {services.isPending ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : services.error ? (
          <ErrorState error={services.error} onRetry={() => services.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={all.length === 0 ? 'No services yet' : `No ${filter} services`}
            description={all.length === 0 ? 'Add the jobs you take on. You need at least one active service to publish your page.' : undefined}
            action={all.length === 0 && <Button onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden="true" />}>New service</Button>}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((s) => {
              const cover = publicUrl(s.images[0]);
              const busy = setStatus.isPending && setStatus.variables?.id === s.id;
              return (
                <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {cover ? (
                      <img src={cover} alt="" className="size-14 shrink-0 rounded-lg bg-ink-100 object-cover" />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500"><Wrench className="size-5" aria-hidden="true" /></span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-ink-900">{s.name}</p>
                        <StatusBadge domain="service" status={s.status} />
                        {s.instant_booking && <Badge tone="dark"><Zap className="size-3" aria-hidden="true" /> Instant booking</Badge>}
                      </div>
                      <p className="mt-0.5 text-[13px] text-ink-500">
                        {[s.category?.name, priceLabel(s), s.duration_minutes ? formatDuration(s.duration_minutes) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Edit</Button>
                    {s.status === 'active' ? (
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => setStatus.mutate({ id: s.id, status: 'inactive' })}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => setStatus.mutate({ id: s.id, status: 'active' })}>Activate</Button>
                    )}
                    {s.status !== 'archived' && s.status !== 'draft' && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus.mutate({ id: s.id, status: 'archived' })}>Archive</Button>
                    )}
                    {s.status === 'draft' && (
                      <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => setDeleting(s)}>Delete</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <ServiceEditor proId={proId} service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={invalidate} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
        title="Delete this draft service?"
        description={deleting ? `“${deleting.name}” will be permanently removed.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

function ServiceEditor({ proId, service, onClose, onSaved }: { proId: string; service: ServiceRow | null; onClose: () => void; onSaved: () => void }) {
  const formId = useId();
  const toast = useToast();
  const categories = useCategories();
  const slugEdited = useRef(!!service); // keep existing URLs stable; only auto-fill for new services
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitted } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toForm(service),
  });
  const pricingModel = useWatch({ control, name: 'pricing_model' });

  const save = useMutation({
    mutationFn: async (v: z.output<typeof schema>) => {
      const row = {
        name: v.name,
        slug: v.slug,
        category_id: emptyToNull(v.category_id),
        description: emptyToNull(v.description),
        pricing_model: v.pricing_model,
        price_cents: v.pricing_model === 'quote' ? null : parsePesosToCents(v.price),
        duration_minutes: v.duration_minutes,
        service_area_note: emptyToNull(v.service_area_note),
        materials_included: emptyToNull(v.materials_included),
        materials_excluded: emptyToNull(v.materials_excluded),
        preparation_notes: emptyToNull(v.preparation_notes),
        requires_inspection: v.requires_inspection,
        instant_booking: v.instant_booking,
        images: v.images,
        status: v.status,
      };
      const { error } = service
        ? await supabase.from('services').update(row).eq('id', service.id)
        : await supabase.from('services').insert({ ...row, professional_id: proId });
      if (error?.code === '23505') throw new Error('You already have a service with this address. Choose another.');
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
      toast(service ? 'Saved' : 'Service created');
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={service ? 'Edit service' : 'New service'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form={formId} loading={save.isPending}>{service ? 'Save changes' : 'Create service'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        <Field label="Service name" required error={errors.name}>
          {(p) => (
            <Input
              {...p}
              maxLength={120}
              {...register('name', {
                onChange: (e) => {
                  if (!slugEdited.current) setValue('slug', slugify(e.target.value), { shouldValidate: isSubmitted });
                },
              })}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address (slug)" required error={errors.slug} hint="Used in the service's link. Filled in from the name.">
            {(p) => <Input {...p} autoCapitalize="none" spellCheck={false} {...register('slug', { onChange: () => { slugEdited.current = true; } })} />}
          </Field>
          <Field label="Category" error={errors.category_id}>
            {(p) => (
              <Select {...p} {...register('category_id')}>
                <option value="">No category</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          {(p) => <Textarea {...p} rows={4} maxLength={5000} {...register('description')} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pricing" required error={errors.pricing_model}>
            {(p) => (
              <Select {...p} {...register('pricing_model')}>
                {PRICING_MODELS.map((m) => <option key={m} value={m}>{PRICING_LABELS[m]}</option>)}
              </Select>
            )}
          </Field>
          {pricingModel !== 'quote' ? (
            <Field label={pricingModel === 'hourly' ? 'Rate per hour' : pricingModel === 'starting' ? 'Starting price' : 'Price'} required error={errors.price}>
              {(p) => <MoneyInput {...p} placeholder="0.00" {...register('price')} />}
            </Field>
          ) : (
            <p className="self-end pb-2 text-[13px] text-ink-500 sm:col-span-1">You'll send a quotation after reviewing each request.</p>
          )}
          <Field label="Duration (minutes)" error={errors.duration_minutes} hint="Optional. 15 to 10,080.">
            {(p) => <Input {...p} type="number" inputMode="numeric" min={15} max={10080} step={15} {...register('duration_minutes')} />}
          </Field>
        </div>

        <div className="space-y-3 rounded-lg border border-ink-100 p-4">
          <Checkbox label="Requires inspection" description="You need to see the site before confirming the scope or price." {...register('requires_inspection')} />
          <div>
            <Checkbox
              label="Instant booking"
              description="Customers can book an open time slot directly. Only for fixed-price services with a set duration and no inspection."
              aria-invalid={errors.instant_booking ? true : undefined}
              {...register('instant_booking')}
            />
            {errors.instant_booking && <p role="alert" className="mt-1.5 ml-7 text-[13px] text-danger-600">{errors.instant_booking.message}</p>}
          </div>
        </div>

        <Field label="Service area note" error={errors.service_area_note} hint="e.g. Within Metro Manila; travel fee for Rizal and Cavite.">
          {(p) => <Input {...p} maxLength={500} {...register('service_area_note')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Materials included" error={errors.materials_included}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} {...register('materials_included')} />}
          </Field>
          <Field label="Materials not included" error={errors.materials_excluded}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} {...register('materials_excluded')} />}
          </Field>
        </div>
        <Field label="Preparation notes for customers" error={errors.preparation_notes} hint="e.g. Clear the area around the unit and make sure there's power.">
          {(p) => <Textarea {...p} rows={3} maxLength={2000} {...register('preparation_notes')} />}
        </Field>

        <Controller
          control={control}
          name="images"
          render={({ field }) => <ImageUploader label="Photos" max={8} value={field.value} onChange={field.onChange} error={errors.images?.message} />}
        />

        <Field label="Status" error={errors.status} hint="Only active services appear on your page. Your plan limits how many can be active at once.">
          {(p) => (
            <Select {...p} {...register('status')}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              {service?.status === 'archived' && <option value="archived">Archived</option>}
            </Select>
          )}
        </Field>

        <FormError message={save.error ? errorMessage(save.error) : null} />
      </form>
    </Dialog>
  );
}
