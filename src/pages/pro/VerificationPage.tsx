import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Lock, Paperclip, ShieldCheck, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, FormError, PageHeader, PageSpinner, Select, Skeleton,
  StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { VERIFICATION_KIND_LABELS } from '@/lib/status';
import { acceptFor, uploadFile, type UploadedFile } from '@/lib/storage';
import { supabase, unwrap, type ProfessionalProfile } from '@/lib/supabase';
import { optionalText } from './helpers';

const KINDS: { kind: string; description: string }[] = [
  { kind: 'identity', description: 'A valid government-issued ID, such as a PhilSys National ID, passport, driver’s license or UMID. Confirms who you are — it does not prove you are qualified for the work.' },
  { kind: 'business', description: 'Proof that your business is registered, such as DTI or SEC registration, a Mayor’s or business permit, or a BIR Certificate of Registration.' },
  { kind: 'qualification', description: 'Proof of training or assessment, such as a TESDA National Certificate, diploma or training certificates.' },
  { kind: 'license', description: 'A PRC license or other government license required for regulated work, such as electrical or plumbing work.' },
];

const schema = z.object({
  kind: z.string().refine((k) => k in VERIFICATION_KIND_LABELS, 'Choose what you want to verify.'),
  documents: z.array(z.object({ path: z.string(), name: z.string() })).min(1, 'Upload at least one document.').max(5, 'Upload up to 5 documents.'),
  details: optionalText(2000),
});

export function VerificationPage() {
  const { pro } = useAuth();
  return pro ? <Verification pro={pro} /> : <PageSpinner />;
}

function Verification({ pro }: { pro: ProfessionalProfile }) {
  const submissions = useQuery({
    queryKey: ['pro-verifications', pro.id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('verification_submissions')
          .select('id, kind, status, submitted_at, reviewed_at, decision_reason, document_paths')
          .eq('professional_id', pro.id)
          .order('submitted_at', { ascending: false }),
      ) ?? [],
  });
  const pendingKinds = new Set((submissions.data ?? []).filter((s) => s.status === 'pending').map((s) => s.kind));

  return (
    <>
      <PageHeader title="Verification" description="Submit documents so customers can see what Hire Me! has checked." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
          <Card as="section">
            <CardHeader title="Your status" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
              <div>
                <p className="text-[13px] text-ink-500">Overall</p>
                <div className="mt-1"><StatusBadge domain="verification" status={pro.verification_status} /></div>
              </div>
              <div>
                <p className="text-[13px] text-ink-500">Verified</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {pro.verified_kinds.length ? (
                    pro.verified_kinds.map((k) => <Badge key={k} tone="success"><ShieldCheck className="size-3" aria-hidden="true" /> {VERIFICATION_KIND_LABELS[k] ?? k}</Badge>)
                  ) : (
                    <span className="text-sm text-ink-700">Nothing yet</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Kinds of verification" description="Each kind is reviewed separately. Your page shows only the kinds that were approved." />
            <dl className="divide-y divide-ink-100">
              {KINDS.map((k) => (
                <div key={k.kind} className="px-5 py-3">
                  <dt className="text-sm font-medium text-ink-900">{VERIFICATION_KIND_LABELS[k.kind]}</dt>
                  <dd className="mt-0.5 text-[13px] text-ink-600">{k.description}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card as="section">
            <CardHeader title="Your submissions" />
            {submissions.isPending ? (
              <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : submissions.error ? (
              <ErrorState error={submissions.error} onRetry={() => submissions.refetch()} />
            ) : submissions.data.length === 0 ? (
              <EmptyState icon={FileText} title="No submissions yet" description="Use the form to submit your first documents." className="py-8" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {submissions.data.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink-900">{VERIFICATION_KIND_LABELS[s.kind] ?? s.kind}</p>
                      <StatusBadge domain="verification" status={s.status} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      Submitted {formatDateTime(s.submitted_at)} · {s.document_paths.length} document{s.document_paths.length === 1 ? '' : 's'}
                      {s.reviewed_at && ` · Reviewed ${formatDate(s.reviewed_at)}`}
                    </p>
                    {s.decision_reason && <p className="mt-1.5 rounded-md bg-ink-50 px-3 py-2 text-[13px] text-ink-700">{s.decision_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <SubmissionForm proId={pro.id} pendingKinds={pendingKinds} />
          <Card as="section">
            <CardHeader title="Privacy" actions={<Lock className="size-4 text-ink-500" aria-hidden="true" />} />
            <div className="space-y-3 p-5 text-[13px] text-ink-700">
              <p>Your documents are stored privately. Only you and Hire Me! administrators can open them, through links that expire after a few minutes. They are never shown on your public page.</p>
              <p>
                <Badge className="mr-1.5">Policy draft</Badge>
                Documents are kept while your account is active or as required by law. Contact support to request deletion.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function SubmissionForm({ proId, pendingKinds }: { proId: string; pendingKinds: Set<string> }) {
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { kind: '', documents: [] as Pick<UploadedFile, 'path' | 'name'>[], details: '' },
  });
  const submit = useMutation({
    mutationFn: async (v: z.output<typeof schema>) => {
      const { error } = await supabase.rpc('submit_verification', {
        p_kind: v.kind, p_document_paths: v.documents.map((d) => d.path), p_details: v.details,
      });
      if (error?.code === '23505') throw new Error('You already have a pending submission of this kind. Please wait for the review.');
      if (error) throw error;
    },
    onSuccess: async () => {
      reset();
      await Promise.all([qc.invalidateQueries({ queryKey: ['pro-verifications', proId] }), refresh()]);
      toast('Submitted for review');
    },
  });

  return (
    <Card as="section">
      <CardHeader title="New submission" description="One pending submission per kind at a time." />
      <form onSubmit={handleSubmit((v) => submit.mutate(v))} noValidate className="space-y-4 p-5">
        <Field label="What do you want to verify?" required error={errors.kind}>
          {(p) => (
            <Select {...p} {...register('kind')}>
              <option value="">Choose…</option>
              {KINDS.map(({ kind }) => (
                <option key={kind} value={kind} disabled={pendingKinds.has(kind)}>
                  {VERIFICATION_KIND_LABELS[kind]}{pendingKinds.has(kind) ? ' (pending review)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Controller
          control={control}
          name="documents"
          render={({ field }) => <DocumentUploader value={field.value} onChange={field.onChange} error={errors.documents?.message} />}
        />
        <Field label="Details" error={errors.details} hint="Optional. e.g. license number, issuing office, or anything that helps the review.">
          {(p) => <Textarea {...p} rows={3} maxLength={2000} {...register('details')} />}
        </Field>
        <FormError message={submit.error ? errorMessage(submit.error) : null} />
        <Button type="submit" loading={submit.isPending} className="w-full">Submit for review</Button>
      </form>
    </Card>
  );
}

type Doc = Pick<UploadedFile, 'path' | 'name'>;

/** Uploads to the private verification-docs bucket under the caller's folder. */
function DocumentUploader({ value, onChange, error }: { value: Doc[]; onChange: (docs: Doc[]) => void; error?: string }) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const room = 5 - value.length;

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length || !user) return;
    setUploadError(null);
    if (files.length > room) {
      setUploadError(`You can add ${room} more document${room === 1 ? '' : 's'}.`);
      return;
    }
    setBusy(true);
    const results = await Promise.allSettled(files.map((f) => uploadFile('verification-docs', user.id, f)));
    setBusy(false);
    const done = results.flatMap((r) => (r.status === 'fulfilled' ? [{ path: r.value.path, name: r.value.name }] : []));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) setUploadError(errorMessage(failed.reason, 'Upload failed. Try again.'));
    if (done.length) onChange([...value, ...done]);
  };

  const message = uploadError ?? error;
  return (
    <div>
      <p className="label">Documents <span className="text-ink-400">*</span></p>
      {value.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {value.map((d) => (
            <li key={d.path} className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-800">
              <FileText className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.path !== d.path))} disabled={busy} className="grid size-6 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Remove ${d.name}`}>
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && (
        <Button variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()} icon={<Paperclip className="size-4" aria-hidden="true" />}>
          {busy ? 'Uploading…' : 'Add documents'}
        </Button>
      )}
      <input ref={inputRef} type="file" accept={acceptFor('verification-docs')} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />
      {message ? (
        <p role="alert" className="mt-1.5 text-[13px] text-danger-600">{message}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink-500">JPG, PNG or PDF, up to 10 MB each. 1 to 5 files. Make sure all details are readable.</p>
      )}
    </div>
  );
}
