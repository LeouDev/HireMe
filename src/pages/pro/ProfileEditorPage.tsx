import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, MapPin, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert, Button, ButtonLink, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, FormError, Input, PageHeader,
  PageSpinner, Skeleton, StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { supabase, unwrap, type ProfessionalProfile } from '@/lib/supabase';
import { emptyToNull, optionalIntField, optionalText } from './helpers';
import { ImageUploader, proPageUrl, useCategories, useCopyLink } from './shared';

const faqSchema = z.object({
  question: z.string().trim().min(3, 'Enter a question.').max(200, 'Keep questions under 200 characters.'),
  answer: z.string().trim().min(1, 'Enter an answer.').max(1000, 'Keep answers under 1,000 characters.'),
});

const schema = z.object({
  display_name: z.string().trim().min(2, 'Enter at least 2 characters.').max(80, 'Keep this under 80 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, 'Use 3–60 lowercase letters, numbers and hyphens, starting and ending with a letter or number.')
    .refine((s) => !s.includes('--'), 'Avoid double hyphens.'),
  business_name: optionalText(120),
  headline: optionalText(160),
  bio: optionalText(5000),
  years_experience: optionalIntField(0, 80),
  city: optionalText(80),
  province: optionalText(80),
  languages: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(z.string()).max(10, 'List up to 10 languages.')),
  certifications: optionalText(2000),
  licenses: optionalText(2000),
  avatar_path: z.string().nullable(),
  cover_path: z.string().nullable(),
  public_phone: optionalText(30).regex(/^[0-9+()\-.\s]*$/, 'Use digits, spaces and + ( ) - only.'),
  public_email: optionalText(254).refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.'),
  working_hours_note: optionalText(500),
  faqs: z.array(faqSchema).max(20, 'Up to 20 questions.'),
});
type FormInput = z.input<typeof schema>;

function readFaqs(value: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((f) =>
    f && typeof f === 'object' && typeof f.question === 'string' && typeof f.answer === 'string' ? [{ question: f.question, answer: f.answer }] : [],
  );
}

function toForm(p: ProfessionalProfile): FormInput {
  return {
    display_name: p.display_name,
    slug: p.slug,
    business_name: p.business_name ?? '',
    headline: p.headline ?? '',
    bio: p.bio ?? '',
    years_experience: p.years_experience?.toString() ?? '',
    city: p.city ?? '',
    province: p.province ?? '',
    languages: p.languages.join(', '),
    certifications: p.certifications ?? '',
    licenses: p.licenses ?? '',
    avatar_path: p.avatar_path,
    cover_path: p.cover_path,
    public_phone: p.public_phone ?? '',
    public_email: p.public_email ?? '',
    working_hours_note: p.working_hours_note ?? '',
    faqs: readFaqs(p.faqs),
  };
}

export function ProfileEditorPage() {
  const { pro } = useAuth();
  return pro ? <ProfileEditor pro={pro} /> : <PageSpinner />;
}

function ProfileEditor({ pro }: { pro: ProfessionalProfile }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const copyLink = useCopyLink();
  const [publishError, setPublishError] = useState<string | null>(null);

  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toForm(pro),
  });
  const faqs = useFieldArray({ control, name: 'faqs' });

  const save = useMutation({
    mutationFn: async (v: z.output<typeof schema>) =>
      unwrap(
        await supabase
          .from('professional_profiles')
          .update({
            display_name: v.display_name,
            slug: v.slug,
            business_name: emptyToNull(v.business_name),
            headline: emptyToNull(v.headline),
            bio: emptyToNull(v.bio),
            years_experience: v.years_experience,
            city: emptyToNull(v.city),
            province: emptyToNull(v.province),
            languages: v.languages,
            certifications: emptyToNull(v.certifications),
            licenses: emptyToNull(v.licenses),
            avatar_path: v.avatar_path,
            cover_path: v.cover_path,
            public_phone: emptyToNull(v.public_phone),
            public_email: emptyToNull(v.public_email),
            working_hours_note: emptyToNull(v.working_hours_note),
            faqs: v.faqs,
          })
          .eq('id', pro.id)
          .select()
          .single(),
      ),
    onSuccess: async (row) => {
      if (row) reset(toForm(row));
      await refresh();
      toast('Saved');
    },
  });

  const publish = useMutation({
    mutationFn: async (p_publish: boolean) => unwrap(await supabase.rpc('set_profile_published', { p_publish })),
    onMutate: () => setPublishError(null),
    onSuccess: async (row) => {
      await refresh();
      toast(row?.status === 'published' ? 'Your page is live' : 'Your page is now hidden');
    },
    onError: (e) => setPublishError(errorMessage(e)),
  });

  const isPublished = pro.status === 'published';
  const url = proPageUrl(pro.slug);

  return (
    <>
      <PageHeader
        title="Public page"
        description="This is the page customers see when they find you or open your link."
        actions={
          <>
            <StatusBadge domain="profile" status={pro.status} />
            <ButtonLink to={`/pro/${pro.slug}`} target="_blank" rel="noreferrer" variant="outline-inverse" size="sm" icon={<ExternalLink className="size-4" aria-hidden="true" />}>
              Preview page
            </ButtonLink>
            <Button variant="outline-inverse" size="sm" onClick={() => copyLink(url)} icon={<Copy className="size-4" aria-hidden="true" />}>
              Copy link
            </Button>
            {pro.status !== 'suspended' && (
              <Button
                variant="inverse"
                size="sm"
                loading={publish.isPending}
                disabled={isDirty}
                title={isDirty ? 'Save your changes first' : undefined}
                onClick={() => publish.mutate(!isPublished)}
              >
                {isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {pro.status === 'suspended' && (
          <Alert tone="danger" title="Your page is suspended">It is hidden from customers. Contact support for details.</Alert>
        )}
        {publishError && (
          <Alert tone="warning" title="Your page can't be published yet">{publishError}</Alert>
        )}
        {!isPublished && pro.status !== 'suspended' && !publishError && (
          <Alert tone="neutral" title="Your page is a draft">
            Only you can see it. To publish, add your city, a headline or bio, at least one service category and one active service.
          </Alert>
        )}

        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
          <Card as="section">
            <CardHeader title="Basics" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Display name" required error={errors.display_name}>
                {(p) => <Input {...p} autoComplete="name" {...register('display_name')} />}
              </Field>
              <Field label="Business name" error={errors.business_name}>
                {(p) => <Input {...p} autoComplete="organization" {...register('business_name')} />}
              </Field>
              <Field
                label="Page address"
                required
                error={errors.slug}
                hint={<>Your link: {proPageUrl('')}<strong className="font-medium text-ink-700">your-address</strong>. Changing it breaks links you've already shared.</>}
                className="sm:col-span-2"
              >
                {(p) => <Input {...p} autoCapitalize="none" spellCheck={false} {...register('slug')} />}
              </Field>
              <Field label="City" error={errors.city} hint="Required to publish.">
                {(p) => <Input {...p} autoComplete="address-level2" {...register('city')} />}
              </Field>
              <Field label="Province" error={errors.province}>
                {(p) => <Input {...p} autoComplete="address-level1" {...register('province')} />}
              </Field>
              <Field label="Years of experience" error={errors.years_experience}>
                {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={80} {...register('years_experience')} />}
              </Field>
              <Field label="Languages" error={errors.languages} hint="Separate with commas, e.g. Filipino, English, Cebuano.">
                {(p) => <Input {...p} {...register('languages')} />}
              </Field>
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="About" description="A headline or bio is required to publish." />
            <div className="space-y-4 p-5">
              <Field label="Headline" error={errors.headline} hint="One line about what you do, e.g. Licensed electrician serving Quezon City.">
                {(p) => <Input {...p} maxLength={160} {...register('headline')} />}
              </Field>
              <Field label="Bio" error={errors.bio}>
                {(p) => <Textarea {...p} rows={6} maxLength={5000} {...register('bio')} />}
              </Field>
              <Field label="Working hours note" error={errors.working_hours_note} hint="Optional, e.g. Mon–Sat, 8 AM to 5 PM. Bookable times are set on the Availability page.">
                {(p) => <Input {...p} maxLength={500} {...register('working_hours_note')} />}
              </Field>
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Photos" description="A clear photo of you or your logo helps customers recognise you." />
            <div className="grid gap-6 p-5 sm:grid-cols-[180px_1fr]">
              <Controller
                control={control}
                name="avatar_path"
                render={({ field }) => (
                  <ImageUploader
                    label="Profile photo"
                    max={1}
                    value={field.value ? [field.value] : []}
                    onChange={(paths) => field.onChange(paths[0] ?? null)}
                    thumbClassName="aspect-square max-w-40"
                  />
                )}
              />
              <Controller
                control={control}
                name="cover_path"
                render={({ field }) => (
                  <ImageUploader
                    label="Cover image"
                    max={1}
                    value={field.value ? [field.value] : []}
                    onChange={(paths) => field.onChange(paths[0] ?? null)}
                    thumbClassName="aspect-[3/1]"
                    hint="Wide image shown at the top of your page. JPG, PNG or WebP, up to 5 MB."
                  />
                )}
              />
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Contact details" description="Shown publicly on your page — leave blank to keep private. Customers can always message you through Hire Me!" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Public phone" error={errors.public_phone}>
                {(p) => <Input {...p} type="tel" autoComplete="tel" {...register('public_phone')} />}
              </Field>
              <Field label="Public email" error={errors.public_email}>
                {(p) => <Input {...p} type="email" autoComplete="email" {...register('public_email')} />}
              </Field>
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Credentials" description="Self-reported. They are shown as provided until you complete verification." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Certifications" error={errors.certifications} hint="e.g. TESDA NC II Electrical Installation and Maintenance.">
                {(p) => <Textarea {...p} rows={4} maxLength={2000} {...register('certifications')} />}
              </Field>
              <Field label="Licenses" error={errors.licenses} hint="Include the issuing agency and license number if you wish.">
                {(p) => <Textarea {...p} rows={4} maxLength={2000} {...register('licenses')} />}
              </Field>
            </div>
          </Card>

          <Card as="section">
            <CardHeader
              title="Frequently asked questions"
              description="Answer common customer questions. Up to 20."
              actions={
                <Button size="sm" variant="secondary" disabled={faqs.fields.length >= 20} onClick={() => faqs.append({ question: '', answer: '' })} icon={<Plus className="size-4" aria-hidden="true" />}>
                  Add question
                </Button>
              }
            />
            {faqs.fields.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No questions yet.</p>
            ) : (
              <ol className="divide-y divide-ink-100">
                {faqs.fields.map((f, i) => (
                  <li key={f.id} className="flex gap-3 p-5">
                    <div className="grid flex-1 gap-3">
                      <Field label={`Question ${i + 1}`} error={errors.faqs?.[i]?.question}>
                        {(p) => <Input {...p} maxLength={200} {...register(`faqs.${i}.question`)} />}
                      </Field>
                      <Field label="Answer" error={errors.faqs?.[i]?.answer}>
                        {(p) => <Textarea {...p} rows={3} maxLength={1000} {...register(`faqs.${i}.answer`)} />}
                      </Field>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => faqs.remove(i)} aria-label={`Remove question ${i + 1}`} className="mt-6">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <FormError message={save.error ? errorMessage(save.error) : null} />
            {isDirty && (
              <Button variant="outline-inverse" onClick={() => reset(toForm(pro))} disabled={save.isPending}>
                Discard changes
              </Button>
            )}
            <Button type="submit" variant="inverse" loading={save.isPending} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>

        <CategoriesCard proId={pro.id} />
        <ServiceAreasCard proId={pro.id} />
      </div>
    </>
  );
}

function CategoriesCard({ proId }: { proId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const selected = useQuery({
    queryKey: ['pro-categories', proId],
    queryFn: async () =>
      new Set((unwrap(await supabase.from('professional_categories').select('category_id').eq('professional_id', proId)) ?? []).map((r) => r.category_id)),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) =>
      unwrap(
        on
          ? await supabase.from('professional_categories').insert({ professional_id: proId, category_id: id })
          : await supabase.from('professional_categories').delete().eq('professional_id', proId).eq('category_id', id),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['pro-categories', proId] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const error = categories.error ?? selected.error;
  return (
    <Card as="section">
      <CardHeader title="Service categories" description="Customers find you by category. Choose at least one to publish." />
      <div className="p-5">
        {error ? (
          <ErrorState error={error} onRetry={() => { categories.refetch(); selected.refetch(); }} />
        ) : !categories.data || !selected.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5" />)}
          </div>
        ) : categories.data.length === 0 ? (
          <p className="text-sm text-ink-500">No categories are available yet.</p>
        ) : (
          <fieldset>
            <legend className="sr-only">Service categories</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.data.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={selected.data.has(c.id)}
                  disabled={toggle.isPending && toggle.variables?.id === c.id}
                  onChange={(e) => toggle.mutate({ id: c.id, on: e.target.checked })}
                />
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Card>
  );
}

const areaSchema = z.object({
  city: z.string().trim().min(2, 'Enter a city or municipality.').max(80, 'Keep this under 80 characters.'),
  area: optionalText(80),
});

function ServiceAreasCard({ proId }: { proId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const areas = useQuery({
    queryKey: ['pro-areas', proId],
    queryFn: async () =>
      unwrap(await supabase.from('professional_service_areas').select('id, city, area').eq('professional_id', proId).order('city').order('area')) ?? [],
  });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(areaSchema),
    defaultValues: { city: '', area: '' },
  });
  const add = useMutation({
    mutationFn: async (v: z.output<typeof areaSchema>) =>
      unwrap(await supabase.from('professional_service_areas').insert({ professional_id: proId, city: v.city, area: emptyToNull(v.area) })),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: ['pro-areas', proId] });
      toast('Service area added');
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('professional_service_areas').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['pro-areas', proId] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Card as="section">
      <CardHeader title="Service areas" description="Cities or areas where you take jobs." />
      {areas.isPending ? (
        <div className="space-y-2 p-5"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/3" /></div>
      ) : areas.error ? (
        <ErrorState error={areas.error} onRetry={() => areas.refetch()} />
      ) : areas.data.length === 0 ? (
        <EmptyState icon={MapPin} title="No service areas yet" description="Add the cities where you work so customers nearby can find you." className="py-8" />
      ) : (
        <ul className="flex flex-wrap gap-2 p-5">
          {areas.data.map((a) => {
            const name = a.area ? `${a.area}, ${a.city}` : a.city;
            return (
              <li key={a.id} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 py-1 pr-1 pl-3 text-sm text-ink-800">
                {name}
                <button
                  type="button"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending && remove.variables === a.id}
                  className="grid size-6 place-items-center rounded-full text-ink-500 hover:bg-ink-200 hover:text-ink-900"
                  aria-label={`Remove ${name}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={handleSubmit((v) => add.mutate(v))} noValidate className="grid gap-3 border-t border-ink-100 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="City or municipality" required error={errors.city}>
          {(p) => <Input {...p} {...register('city')} />}
        </Field>
        <Field label="Area or barangay" error={errors.area} hint="Optional">
          {(p) => <Input {...p} {...register('area')} />}
        </Field>
        <Button type="submit" variant="secondary" loading={add.isPending} className="sm:mt-6" icon={<Plus className="size-4" aria-hidden="true" />}>
          Add area
        </Button>
        <div className="sm:col-span-3"><FormError message={add.error ? errorMessage(add.error) : null} /></div>
      </form>
    </Card>
  );
}
