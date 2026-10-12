import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert, Avatar, Button, ButtonLink, DateInput, EmptyState, ErrorState, Field, FormError, Input, PageSpinner, Select, Textarea } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { priceLabel } from '@/features/catalog/pricing';
import { useProProfile } from '@/features/catalog/useProProfile';
import { errorMessage } from '@/lib/errors';
import { todayManila } from '@/lib/format';
import { acceptFor, uploadFile, validateFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  serviceId: z.string(),
  title: z.string().trim().min(3, 'Give your request a short title').max(140),
  description: z.string().trim().min(10, 'Describe the job in at least 10 characters').max(5000),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  address: z.string().trim().max(300).optional(),
  preferredDate: z.string().optional().refine((d) => !d || d >= todayManila(), 'Choose today or a later date'),
  preferredTime: z.enum(['', 'morning', 'afternoon', 'evening', 'flexible']),
  altDate1: z.string().optional(),
  altDate2: z.string().optional(),
  requirements: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

export function RequestQuotePage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useProProfile(slug);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { serviceId: params.get('service') ?? '', title: '', description: '', city: data?.pro.city ?? '', address: '', preferredDate: '', preferredTime: '', altDate1: '', altDate2: '', requirements: '' },
    resetOptions: { keepDirtyValues: true },
  });

  if (isPending) return <PageSpinner />;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div></div>;
  if (!data || data.pro.status !== 'published') {
    return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><EmptyState title="This professional isn't accepting requests" action={<ButtonLink to="/explore">Explore professionals</ButtonLink>} /></div></div>;
  }
  const { pro, services } = data;
  if (pro.user_id === user?.id) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><div className="card"><EmptyState title="This is your own page" description="Customers use this form to send you requests." action={<ButtonLink to="/pro-dashboard/requests">View your requests</ButtonLink>} /></div></div>;
  }

  const addFiles = async (list: FileList | null) => {
    setFileError(null);
    const picked = Array.from(list ?? []);
    try {
      await Promise.all(picked.map((f) => validateFile('request-files', f)));
      setFiles((prev) => [...prev, ...picked].slice(0, 6));
    } catch (e) {
      setFileError(errorMessage(e));
    }
  };

  const onSubmit = async (v: FormValues) => {
    setSubmitError(null);
    try {
      // Create as a draft, attach files, then submit, so the professional is notified once everything is in place.
      const { data: id, error: err } = await supabase.rpc('create_service_request', {
        p_professional_id: pro.id,
        p_service_id: v.serviceId || undefined,
        p_title: v.title,
        p_description: v.description,
        p_location_city: v.city,
        p_location_address: v.address || undefined,
        p_preferred_date: v.preferredDate || undefined,
        p_preferred_time: v.preferredTime || undefined,
        p_alternative_dates: [v.altDate1, v.altDate2].filter((d): d is string => !!d),
        p_requirements: v.requirements || undefined,
        p_submit: files.length === 0,
      });
      if (err) throw err;
      if (files.length) {
        for (const file of files) {
          const up = await uploadFile('request-files', id, file);
          const { error: attErr } = await supabase.from('request_attachments').insert({
            request_id: id, uploaded_by: user!.id, storage_path: up.path, file_name: up.name, mime_type: up.mime, size_bytes: up.size,
          });
          if (attErr) throw attErr;
        }
        const { error: subErr } = await supabase.rpc('transition_service_request', { p_request_id: id, p_to: 'submitted' });
        if (subErr) throw subErr;
      }
      navigate(`/dashboard/requests/${id}?sent=1`);
    } catch (e) {
      setSubmitError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Seo title={`Request a quote from ${pro.display_name}`} noindex />
      <Link to={`/pro/${pro.slug}`} className="flex items-center gap-3">
        <Avatar name={pro.display_name} path={pro.avatar_path} />
        <span>
          <span className="block text-sm text-ink-400">Request a quote from</span>
          <span className="block font-display font-semibold text-white">{pro.display_name}</span>
        </span>
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-5 p-5 sm:p-6" noValidate>
        <Field label="Service" hint="Optional — choose a listed service or leave as a custom request.">
          {(p) => (
            <Select {...p} {...register('serviceId')}>
              <option value="">Custom request</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {priceLabel(s)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Request title" required error={errors.title}>
          {(p) => <Input {...p} {...register('title')} placeholder="e.g. Kitchen sink is leaking" maxLength={140} />}
        </Field>
        <Field label="Describe the job" required error={errors.description} hint="What needs to be done, what you've noticed, measurements, brands, access details.">
          {(p) => <Textarea {...p} {...register('description')} rows={6} maxLength={5000} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" required error={errors.city}>{(p) => <Input {...p} {...register('city')} autoComplete="address-level2" />}</Field>
          <Field label="Address or landmark" error={errors.address} hint="Only shared with this professional.">
            {(p) => <Input {...p} {...register('address')} autoComplete="street-address" maxLength={300} />}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred date" error={errors.preferredDate}>{(p) => <DateInput {...p} min={todayManila()} {...register('preferredDate')} />}</Field>
          <Field label="Preferred time">
            {(p) => (
              <Select {...p} {...register('preferredTime')}>
                <option value="">No preference</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="flexible">Flexible</option>
              </Select>
            )}
          </Field>
          <Field label="Alternative date (optional)">{(p) => <DateInput {...p} min={todayManila()} {...register('altDate1')} />}</Field>
          <Field label="Another alternative (optional)">{(p) => <DateInput {...p} min={todayManila()} {...register('altDate2')} />}</Field>
        </div>
        <Field label="Additional requirements" error={errors.requirements}>
          {(p) => <Textarea {...p} {...register('requirements')} rows={3} maxLength={2000} placeholder="Parking, building permits, materials you already have…" />}
        </Field>

        <div>
          <p className="label">Photos, videos or documents</p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 px-4 py-6 text-sm text-ink-600 hover:border-ink-900">
            <Paperclip className="size-4" aria-hidden="true" /> Add files (JPG, PNG, WebP, MP4, MOV, PDF · up to 15 MB each)
            <input type="file" multiple accept={acceptFor('request-files')} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          {fileError && <p className="mt-2 text-[13px] text-danger-600">{fileError}</p>}
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-2 rounded p-1 text-ink-500 hover:bg-ink-200" aria-label={`Remove ${f.name}`}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-500">Files are private: only you and this professional can open them.</p>
        </div>

        <Alert tone="neutral">Sending a request is free and doesn't commit you to anything. The professional will reply with questions or a quotation.</Alert>
        <FormError message={submitError} />
        <div className="flex justify-end gap-2">
          <ButtonLink to={`/pro/${pro.slug}`} variant="secondary">Cancel</ButtonLink>
          <Button type="submit" loading={isSubmitting}>Send request</Button>
        </div>
      </form>
    </div>
  );
}
