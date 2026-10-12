import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import {
  Alert, Avatar, Button, Card, CardHeader, ConfirmDialog, DetailList, Dialog, EmptyState, ErrorState, Field, FormError, Input,
  Money, PageHeader, PageSpinner, StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { ChatThread } from '@/features/messaging/ChatThread';
import { REQUEST_SELECT } from '@/features/workflow/selects';
import { Timeline } from '@/features/workflow/Timeline';
import { errorMessage } from '@/lib/errors';
import { formatDate, todayManila } from '@/lib/format';
import { acceptFor, signedUrl, uploadFile } from '@/lib/storage';
import { supabase, unwrap, unwrapMaybe } from '@/lib/supabase';

type Role = 'customer' | 'professional';
type Dialogs = 'info' | 'decline' | 'cancel' | 'edit' | null;

function RequestDetailPage({ role }: { role: Role }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';

  const request = useQuery({
    queryKey: ['request', id],
    queryFn: async () => unwrap(await supabase.from('service_requests').select(REQUEST_SELECT).eq('id', id!).single()),
  });
  const related = useQuery({
    queryKey: ['request-related', id],
    enabled: request.isSuccess,
    queryFn: async () => {
      const [attachments, conversation, quotes] = await Promise.all([
        supabase.from('request_attachments').select('*').eq('request_id', id!).order('created_at'),
        supabase.from('conversations').select('id').eq('request_id', id!).maybeSingle(),
        supabase.from('quotations').select('id, quote_number, revision, status, total_cents, valid_until, created_at').eq('request_id', id!).order('created_at', { ascending: false }),
      ]);
      return { attachments: unwrap(attachments), conversation: unwrapMaybe(conversation), quotes: unwrap(quotes) };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['request', id] });
    qc.invalidateQueries({ queryKey: ['request-related', id] });
    qc.invalidateQueries({ queryKey: ['requests'] });
    qc.invalidateQueries({ queryKey: ['timeline', 'service_request', id] });
    qc.invalidateQueries({ queryKey: ['dashboard-counts'] });
  };
  const transition = useMutation({
    mutationFn: async ({ to, note }: { to: string; note?: string }) =>
      unwrap(await supabase.rpc('transition_service_request', { p_request_id: id!, p_to: to, p_note: note || undefined })),
    onSuccess: refresh,
  });

  // Opening a new request marks it viewed for the customer to see.
  const markedViewed = useRef(false);
  useEffect(() => {
    if (role === 'professional' && request.data?.status === 'submitted' && !markedViewed.current) {
      markedViewed.current = true;
      transition.mutate({ to: 'viewed' });
    }
  }, [role, request.data?.status, transition]);

  const createQuote = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('create_quotation', { p_request_id: id! })),
    onSuccess: (quoteId) => navigate(`/pro-dashboard/quotes/${quoteId}`),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (request.isPending) return <PageSpinner />;
  if (request.isError) return <div className="card"><ErrorState error={request.error} onRetry={() => request.refetch()} /></div>;
  const r = request.data;
  const counterpart = role === 'customer'
    ? { name: r.professional?.display_name, avatar: r.professional?.avatar_path, link: `/pro/${r.professional?.slug}` }
    : { name: r.customer?.full_name || 'Customer', avatar: r.customer?.avatar_path, link: null };
  const canEdit = role === 'customer' && ['draft', 'submitted', 'awaiting_info'].includes(r.status);
  const canCancel = role === 'customer' && ['draft', 'submitted', 'viewed', 'awaiting_info', 'accepted', 'quoted'].includes(r.status);
  const proOpen = role === 'professional' && ['submitted', 'viewed', 'awaiting_info'].includes(r.status);
  const canQuote = role === 'professional' && ['submitted', 'viewed', 'awaiting_info', 'accepted', 'quoted'].includes(r.status);
  const run = async (to: string, note?: string, message?: string) => {
    await transition.mutateAsync({ to, note });
    if (message) toast(message);
  };

  return (
    <div>
      <PageHeader title={r.title} back={{ to: `${base}/requests`, label: 'All requests' }}
        description={<span className="flex flex-wrap items-center gap-2">{r.request_number} <StatusBadge domain="request" status={r.status} /></span>}
        actions={
          <>
            {canEdit && <Button variant="outline-inverse" onClick={() => setDialog('edit')}>Edit details</Button>}
            {role === 'customer' && r.status === 'draft' && <Button variant="inverse" loading={transition.isPending} onClick={() => run('submitted', undefined, 'Request sent')}>Send request</Button>}
            {role === 'customer' && r.status === 'awaiting_info' && <Button variant="inverse" loading={transition.isPending} onClick={() => run('submitted', undefined, 'Sent back to the professional')}>I've added the information</Button>}
            {canCancel && <Button variant="outline-inverse" onClick={() => setDialog('cancel')}>Cancel request</Button>}
            {proOpen && <Button variant="outline-inverse" onClick={() => setDialog('info')}>Ask for info</Button>}
            {proOpen && <Button variant="outline-inverse" onClick={() => setDialog('decline')}>Decline</Button>}
            {proOpen && r.status !== 'awaiting_info' && <Button variant="outline-inverse" loading={transition.isPending} onClick={() => run('accepted', undefined, 'Request accepted')}>Accept</Button>}
            {canQuote && <Button variant="inverse" loading={createQuote.isPending} onClick={() => createQuote.mutate()} icon={<Plus className="size-4" />}>Create quotation</Button>}
          </>
        } />

      {params.get('sent') && <div className="mb-4"><Alert tone="success" title="Request sent">The professional has been notified. You'll get a notification when they reply.</Alert></div>}
      {r.status === 'awaiting_info' && r.status_note && (
        <div className="mb-4"><Alert tone="warning" title={role === 'customer' ? 'The professional needs more information' : 'You asked for more information'}>{r.status_note}</Alert></div>
      )}
      {r.status === 'declined' && <div className="mb-4"><Alert tone="neutral" title="This request was declined">{r.status_note}</Alert></div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Job details" />
            <div className="space-y-5 px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={counterpart.name} path={counterpart.avatar} size="sm" />
                <div className="text-sm">
                  <p className="text-ink-500">{role === 'customer' ? 'Professional' : 'Customer'}</p>
                  {counterpart.link ? <Link to={counterpart.link} className="font-medium text-ink-950 hover:underline">{counterpart.name}</Link> : <p className="font-medium text-ink-950">{counterpart.name}</p>}
                </div>
              </div>
              <p className="text-sm whitespace-pre-line text-ink-800">{r.description}</p>
              <DetailList items={[
                ['Service', r.service?.name ?? 'Custom request'],
                ['Location', [r.location_address, r.location_city].filter(Boolean).join(', ')],
                ['Preferred date', r.preferred_date ? `${formatDate(r.preferred_date)}${r.preferred_time ? ` · ${r.preferred_time}` : ''}` : 'Flexible'],
                ['Alternative dates', r.alternative_dates.length ? r.alternative_dates.map(formatDate).join(', ') : '—'],
                ['Additional requirements', r.requirements],
                ['Submitted', formatDate(r.submitted_at ?? r.created_at)],
              ]} />
            </div>
          </Card>

          <Attachments requestId={r.id} userId={user!.id} attachments={related.data?.attachments ?? []} canUpload={!['cancelled', 'declined', 'expired'].includes(r.status)} onUploaded={refresh} />

          <Card>
            <CardHeader title="Quotations" />
            {related.data?.quotes.length ? (
              <ul className="divide-y divide-ink-100">
                {related.data.quotes.map((q) => (
                  <li key={q.id}>
                    <Link to={`${base}/quotes/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                      <span className="flex items-center gap-2 text-sm"><FileText className="size-4 text-ink-500" aria-hidden="true" />{q.quote_number} · rev {q.revision}</span>
                      <span className="flex items-center gap-3"><Money cents={q.total_cents} className="text-sm font-medium" /><StatusBadge domain="quote" status={q.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={FileText} title="No quotations yet" description={role === 'professional' ? 'Create a quotation when you have enough details.' : 'The professional will send a quotation here.'} />
            )}
          </Card>

          <Timeline entityType="service_request" entityId={r.id} />
        </div>

        <Card className="flex h-[640px] flex-col overflow-hidden xl:sticky xl:top-4">
          <CardHeader title="Conversation" description="Messages stay private between you two." />
          {related.data?.conversation ? <ChatThread conversationId={related.data.conversation.id} className="flex-1" /> : <div className="p-5"><PageSpinner /></div>}
        </Card>
      </div>

      <ConfirmDialog open={dialog === 'info'} onClose={() => setDialog(null)} title="Ask for more information" confirmLabel="Send"
        note={{ label: 'What do you need to know?', required: true, placeholder: 'e.g. Please send a photo of the pipe under the sink.' }}
        onConfirm={(note) => run('awaiting_info', note, 'Question sent')} />
      <ConfirmDialog open={dialog === 'decline'} onClose={() => setDialog(null)} title="Decline this request?" confirmLabel="Decline" danger
        note={{ label: 'Message to the customer (optional)' }} onConfirm={(note) => run('declined', note, 'Request declined')} />
      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel this request?" description="The professional will be notified." confirmLabel="Cancel request" danger
        note={{ label: 'Reason (optional)' }} onConfirm={(note) => run('cancelled', note, 'Request cancelled')} />
      {dialog === 'edit' && <EditRequestDialog request={r} onClose={() => setDialog(null)} onSaved={() => { refresh(); toast('Request updated'); }} />}
    </div>
  );
}

function Attachments({ requestId, userId, attachments, canUpload, onUploaded }: {
  requestId: string; userId: string; canUpload: boolean; onUploaded: () => void;
  attachments: { id: string; storage_path: string; file_name: string; mime_type: string; uploaded_by: string }[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = async (path: string) => {
    try { window.open(await signedUrl('request-files', path, 120), '_blank', 'noopener'); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const upload = async (list: FileList | null) => {
    setBusy(true);
    try {
      for (const file of Array.from(list ?? [])) {
        const up = await uploadFile('request-files', requestId, file);
        unwrap(await supabase.from('request_attachments').insert({ request_id: requestId, uploaded_by: userId, storage_path: up.path, file_name: up.name, mime_type: up.mime, size_bytes: up.size }));
      }
      onUploaded();
      toast('Files added');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Photos and files" description="Private to you and the other party."
        actions={canUpload && (
          <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 px-3 text-[13px] font-medium hover:bg-ink-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            <Paperclip className="size-4" aria-hidden="true" /> {busy ? 'Uploading…' : 'Add files'}
            <input type="file" multiple accept={acceptFor('request-files')} className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        )} />
      {attachments.length ? (
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {attachments.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => open(a.storage_path)} className="flex w-full items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-left text-sm hover:bg-ink-50">
                <FileText className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
                <span className="truncate">{a.file_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-500">No files attached.</p>
      )}
    </Card>
  );
}

const editSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(5000),
  location_city: z.string().trim().min(2).max(80),
  location_address: z.string().trim().max(300),
  preferred_date: z.string().refine((d) => !d || d >= todayManila(), 'Choose today or later'),
  requirements: z.string().trim().max(2000),
});

function EditRequestDialog({ request, onClose, onSaved }: {
  request: { id: string; title: string; description: string; location_city: string; location_address: string | null; preferred_date: string | null; requirements: string | null };
  onClose: () => void; onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: request.title, description: request.description, location_city: request.location_city,
      location_address: request.location_address ?? '', preferred_date: request.preferred_date ?? '', requirements: request.requirements ?? '',
    },
  });
  const save = async (v: z.infer<typeof editSchema>) => {
    setError(null);
    const { error: err } = await supabase.from('service_requests').update({
      ...v, location_address: v.location_address || null, preferred_date: v.preferred_date || null, requirements: v.requirements || null,
    }).eq('id', request.id);
    if (err) return setError(errorMessage(err));
    onSaved();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Edit request" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(save)} loading={isSubmitting}>Save</Button></>}>
      <form className="space-y-4" onSubmit={handleSubmit(save)} noValidate>
        <Field label="Title" error={errors.title}>{(p) => <Input {...p} {...register('title')} />}</Field>
        <Field label="Description" error={errors.description}>{(p) => <Textarea {...p} rows={5} {...register('description')} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" error={errors.location_city}>{(p) => <Input {...p} {...register('location_city')} />}</Field>
          <Field label="Address" error={errors.location_address}>{(p) => <Input {...p} {...register('location_address')} />}</Field>
        </div>
        <Field label="Preferred date" error={errors.preferred_date}>{(p) => <Input {...p} type="date" min={todayManila()} {...register('preferred_date')} />}</Field>
        <Field label="Additional requirements" error={errors.requirements}>{(p) => <Textarea {...p} rows={3} {...register('requirements')} />}</Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export const CustomerRequestDetailPage = () => <RequestDetailPage role="customer" />;
export const ProRequestDetailPage = () => <RequestDetailPage role="professional" />;
