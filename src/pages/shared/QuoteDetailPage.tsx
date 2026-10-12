import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { Alert, Button, Card, CardHeader, ConfirmDialog, DateInput, ErrorState, Field, FormError, Input, Money, MoneyInput, PageHeader, PageSpinner, Select, StatusBadge, Textarea, useToast } from '@/components/ui';
import { QuoteDocument } from '@/features/workflow/QuoteDocument';
import { Timeline } from '@/features/workflow/Timeline';
import { errorMessage } from '@/lib/errors';
import { formatDate, isoToManilaInput, manilaInputToIso, todayManila } from '@/lib/format';
import { supabase, unwrap, unwrapMaybe } from '@/lib/supabase';
import { centsToPesoInput, parsePesosToCents, previewLineTotal, previewQuoteTotals } from '@shared/money';

type Role = 'customer' | 'professional';

const QUOTE_SELECT =
  '*, items:quotation_items(*), request:service_requests(id, title, request_number, location_city), professional:professional_profiles(display_name, business_name, slug), customer:profiles!quotations_customer_id_fkey(full_name)';

function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quote', id],
    enabled: !!id,
    queryFn: async () => {
      const quote = unwrap(await supabase.from('quotations').select(QUOTE_SELECT).eq('id', id!)
        .order('sort_order', { referencedTable: 'quotation_items' }).order('created_at', { referencedTable: 'quotation_items' }).single());
      const [revisions, contract] = await Promise.all([
        supabase.from('quotations').select('id, revision, status, total_cents, created_at').eq('quote_number', quote.quote_number).order('revision', { ascending: false }),
        supabase.from('contracts').select('id, booking_id, status').eq('quotation_id', quote.id).maybeSingle(),
      ]);
      return { quote, revisions: unwrap(revisions), contract: unwrapMaybe(contract) };
    },
  });
}

function QuoteDetailPage({ role }: { role: Role }) {
  const { id } = useParams();
  const { data, isPending, error, refetch } = useQuote(id);
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';
  const qc = useQueryClient();

  // Opening a sent quotation records that the customer has seen it.
  const marked = useRef(false);
  useEffect(() => {
    if (role === 'customer' && data?.quote.status === 'sent' && !marked.current) {
      marked.current = true;
      supabase.rpc('mark_quotation_viewed', { p_quotation_id: data.quote.id }).then(() => qc.invalidateQueries({ queryKey: ['quote', id] }));
    }
  }, [role, data?.quote.status, data?.quote.id, id, qc]);

  if (isPending) return <PageSpinner />;
  if (error) return <div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  const { quote, revisions, contract } = data;

  // Remount after each save so the form picks up server-assigned item ids and totals.
  if (role === 'professional' && quote.status === 'draft') return <QuoteBuilder key={quote.updated_at} data={data} />;

  return (
    <div>
      <PageHeader title={quote.title} back={{ to: `${base}/quotes`, label: 'All quotations' }}
        description={<span className="flex flex-wrap items-center gap-2">{quote.quote_number} · revision {quote.revision} <StatusBadge domain="quote" status={quote.status} /></span>}
        actions={<QuoteActions role={role} quote={quote} hasNewer={revisions[0]!.revision > quote.revision} />} />

      {quote.status === 'revision_requested' && quote.customer_note && (
        <div className="mb-4"><Alert tone="warning" title="Revision requested">{quote.customer_note}</Alert></div>
      )}
      {quote.status === 'rejected' && <div className="mb-4"><Alert tone="neutral" title="Quotation rejected">{quote.customer_note ?? 'No reason given.'}</Alert></div>}
      {quote.status === 'superseded' && revisions[0] && (
        <div className="mb-4"><Alert tone="info" title="A newer revision exists"><Link className="underline" to={`${base}/quotes/${revisions[0].id}`}>View revision {revisions[0].revision}</Link></Alert></div>
      )}
      {contract && (
        <div className="mb-4">
          <Alert tone="success" title="Accepted">
            This quotation is frozen. <Link to={`${base}/contracts/${contract.id}`} className="font-medium underline">Review the contract</Link>
            {contract.booking_id && <> · <Link to={`${base}/bookings/${contract.booking_id}`} className="font-medium underline">View booking</Link></>}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card className="p-5 sm:p-6">
          <QuoteDocument quote={quote} items={quote.items} professional={quote.professional?.business_name || quote.professional?.display_name} customer={quote.customer?.full_name} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Request" />
            <div className="px-5 py-4 text-sm">
              <Link to={`${base}/requests/${quote.request?.id}`} className="font-medium text-ink-950 hover:underline">{quote.request?.title}</Link>
              <p className="text-ink-500">{quote.request?.request_number}</p>
            </div>
          </Card>
          {revisions.length > 1 && (
            <Card>
              <CardHeader title="Revisions" />
              <ul className="divide-y divide-ink-100">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <Link to={`${base}/quotes/${r.id}`} className={`flex items-center justify-between px-5 py-2.5 text-sm hover:bg-ink-50 ${r.id === quote.id ? 'bg-ink-50 font-medium' : ''}`}>
                      <span>Revision {r.revision}</span>
                      <span className="flex items-center gap-2"><Money cents={r.total_cents} /><StatusBadge domain="quote" status={r.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Timeline entityType="quotation" entityId={quote.id} />
        </div>
      </div>
    </div>
  );
}

type QuoteRow = NonNullable<ReturnType<typeof useQuote>['data']>['quote'];

function QuoteActions({ role, quote, hasNewer }: { role: Role; quote: QuoteRow; hasNewer: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<'accept' | 'revision' | 'reject' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['quote', quote.id] });
    qc.invalidateQueries({ queryKey: ['quotes'] });
    qc.invalidateQueries({ queryKey: ['dashboard-counts'] });
    qc.invalidateQueries({ queryKey: ['timeline', 'quotation', quote.id] });
  };
  const open = ['sent', 'viewed'].includes(quote.status);
  const expired = quote.valid_until < todayManila();
  const deposit = Math.round((quote.total_cents * quote.deposit_percent) / 100);

  const revise = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('revise_quotation', { p_quotation_id: quote.id });
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    navigate(`/pro-dashboard/quotes/${data}`);
  };

  return (
    <>
      <Button variant="outline-inverse" onClick={() => window.print()}>Print</Button>
      {role === 'customer' && open && !expired && (
        <>
          <Button variant="outline-inverse" onClick={() => setDialog('revision')}>Request changes</Button>
          <Button variant="outline-inverse" onClick={() => setDialog('reject')}>Reject</Button>
          <Button variant="inverse" onClick={() => setDialog('accept')} icon={<FileSignature className="size-4" />}>Accept quotation</Button>
        </>
      )}
      {role === 'customer' && quote.status === 'revision_requested' && <Button variant="outline-inverse" onClick={() => setDialog('reject')}>Reject</Button>}
      {role === 'customer' && open && expired && <span className="text-sm text-ink-300">Expired on {formatDate(quote.valid_until)}</span>}
      {role === 'professional' && ['sent', 'viewed', 'revision_requested'].includes(quote.status) && <Button variant="outline-inverse" onClick={() => setDialog('withdraw')}>Withdraw</Button>}
      {role === 'professional' && !hasNewer && ['sent', 'viewed', 'revision_requested', 'rejected', 'expired', 'withdrawn'].includes(quote.status) && (
        <Button variant="inverse" loading={busy} onClick={revise}>Create revision</Button>
      )}

      <ConfirmDialog open={dialog === 'accept'} onClose={() => setDialog(null)} title="Accept this quotation?" confirmLabel="Accept and create contract"
        description={<>Accepting freezes the price and scope (<Money cents={quote.total_cents} showCents />) and creates a contract for both of you to sign.{deposit > 0 && <> After signing, a deposit of <Money cents={deposit} showCents /> is due online.</>}</>}
        onConfirm={async () => {
          const res = unwrap(await supabase.rpc('accept_quotation', { p_quotation_id: quote.id })) as { contract_id: string };
          invalidate();
          toast('Quotation accepted');
          navigate(`/dashboard/contracts/${res.contract_id}`);
        }} />
      <ConfirmDialog open={dialog === 'revision'} onClose={() => setDialog(null)} title="Request changes" confirmLabel="Send request"
        note={{ label: 'What should change?', required: true, placeholder: 'e.g. Can you use a different brand of fittings?' }}
        onConfirm={async (note) => { unwrap(await supabase.rpc('customer_quotation_decision', { p_quotation_id: quote.id, p_decision: 'revision_requested', p_note: note })); invalidate(); toast('Revision requested'); }} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject this quotation?" confirmLabel="Reject" danger
        note={{ label: 'Reason (optional)' }}
        onConfirm={async (note) => { unwrap(await supabase.rpc('customer_quotation_decision', { p_quotation_id: quote.id, p_decision: 'rejected', p_note: note })); invalidate(); toast('Quotation rejected'); }} />
      <ConfirmDialog open={dialog === 'withdraw'} onClose={() => setDialog(null)} title="Withdraw this quotation?" description="The customer will no longer be able to accept it." confirmLabel="Withdraw" danger
        onConfirm={async () => { unwrap(await supabase.rpc('withdraw_quotation', { p_quotation_id: quote.id })); invalidate(); toast('Quotation withdrawn'); }} />
    </>
  );
}

// ----------------------------------------------------------------------------- Builder (professional, draft only)

const pesos = z.string().trim().refine((v) => parsePesosToCents(v) !== null, 'Enter a valid amount');
const builderSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(140),
  scope_of_work: z.string().trim().max(10000),
  notes: z.string().trim().max(4000),
  duration_hours: z.string().regex(/^\d{0,4}$/, 'Hours'),
  duration_minutes: z.string().regex(/^([0-5]?\d)?$/, '0–59'),
  proposed_start: z.string(),
  valid_until: z.string().min(1, 'Set an expiry date'),
  payment_terms: z.string().trim().max(4000),
  exclusions: z.string().trim().max(4000),
  warranty_terms: z.string().trim().max(4000),
  discount: z.string().trim().refine((v) => !v || parsePesosToCents(v) !== null, 'Enter a valid amount'),
  tax_rate: z.string().trim().regex(/^(\d{1,2}(\.\d{1,2})?)?$/, 'Enter a percentage like 12'),
  deposit_percent: z.string().regex(/^(100|[1-9]?\d)$/, 'Enter 0 to 100'),
  items: z.array(z.object({
    id: z.string().optional(),
    kind: z.enum(['labor', 'material', 'other']),
    description: z.string().trim().min(1, 'Describe the item').max(300),
    quantity: z.string().trim().regex(/^\d{1,6}(\.\d{1,2})?$/, 'Quantity').refine((v) => Number(v) > 0, 'Must be more than 0'),
    unit_price: pesos,
  })).min(1, 'Add at least one line item'),
});
type BuilderValues = z.infer<typeof builderSchema>;

function QuoteBuilder({ data }: { data: NonNullable<ReturnType<typeof useQuote>['data']> }) {
  const { quote } = data;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'save' | 'send' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dur = quote.estimated_duration_minutes ?? 0;

  const { register, control, handleSubmit, watch, formState: { errors, isDirty } } = useForm<BuilderValues>({
    resolver: zodResolver(builderSchema),
    defaultValues: {
      title: quote.title, scope_of_work: quote.scope_of_work, notes: quote.notes ?? '',
      duration_hours: String(Math.floor(dur / 60)), duration_minutes: String(dur % 60),
      proposed_start: isoToManilaInput(quote.proposed_start), valid_until: quote.valid_until,
      payment_terms: quote.payment_terms ?? '', exclusions: quote.exclusions ?? '', warranty_terms: quote.warranty_terms ?? '',
      discount: centsToPesoInput(quote.discount_cents || null), tax_rate: quote.tax_rate_bp ? String(quote.tax_rate_bp / 100) : '',
      deposit_percent: String(quote.deposit_percent),
      items: quote.items.length
        ? quote.items.map((i) => ({ id: i.id, kind: i.kind as 'labor' | 'material' | 'other', description: i.description, quantity: String(i.quantity), unit_price: centsToPesoInput(i.unit_price_cents) }))
        : [{ kind: 'labor', description: '', quantity: '1', unit_price: '' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const preview = previewQuoteTotals(
    items.map((i) => previewLineTotal(i.quantity, parsePesosToCents(i.unit_price ?? '') ?? 0)),
    parsePesosToCents(watch('discount') || '0') ?? 0,
    Math.round(Number(watch('tax_rate') || 0) * 100),
  );

  const persist = async (raw: BuilderValues) => {
    const v = builderSchema.parse(raw);
    const minutes = Number(v.duration_hours || 0) * 60 + Number(v.duration_minutes || 0);
    unwrap(await supabase.from('quotations').update({
      title: v.title, scope_of_work: v.scope_of_work, notes: v.notes || null,
      estimated_duration_minutes: minutes || null, proposed_start: manilaInputToIso(v.proposed_start),
      valid_until: v.valid_until, payment_terms: v.payment_terms || null, exclusions: v.exclusions || null, warranty_terms: v.warranty_terms || null,
      discount_cents: parsePesosToCents(v.discount || '0') ?? 0, tax_rate_bp: Math.round(Number(v.tax_rate || 0) * 100), deposit_percent: Number(v.deposit_percent),
    }).eq('id', quote.id));
    // Sync line items: remove deleted rows, update existing, insert new. Totals are recomputed in the database.
    const keep = new Set(v.items.map((i) => i.id).filter(Boolean));
    const removed = quote.items.filter((i) => !keep.has(i.id)).map((i) => i.id);
    if (removed.length) unwrap(await supabase.from('quotation_items').delete().in('id', removed));
    for (const [index, item] of v.items.entries()) {
      const row = { kind: item.kind, description: item.description, quantity: Number(item.quantity), unit_price_cents: parsePesosToCents(item.unit_price)!, sort_order: index };
      if (item.id) unwrap(await supabase.from('quotation_items').update(row).eq('id', item.id));
      else unwrap(await supabase.from('quotation_items').insert({ ...row, quotation_id: quote.id }));
    }
  };

  const submit = (mode: 'save' | 'send') => handleSubmit(async (raw) => {
    setError(null);
    setSaving(mode);
    try {
      await persist(raw);
      if (mode === 'send') {
        unwrap(await supabase.rpc('send_quotation', { p_quotation_id: quote.id }));
        toast('Quotation sent to the customer');
      } else {
        toast('Draft saved');
      }
      await qc.invalidateQueries({ queryKey: ['quote', quote.id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    } catch (e) {
      setError(errorMessage(e));
      qc.invalidateQueries({ queryKey: ['quote', quote.id] });
    } finally {
      setSaving(null);
    }
  });

  return (
    <div>
      <PageHeader title={quote.previous_quote_id ? `Revise quotation (revision ${quote.revision})` : 'New quotation'} back={{ to: '/pro-dashboard/quotes', label: 'All quotations' }}
        description={<>For <Link to={`/pro-dashboard/requests/${quote.request?.id}`} className="underline">{quote.request?.title}</Link> · {quote.customer?.full_name || 'Customer'} · {quote.quote_number}</>}
        actions={
          <>
            <Button variant="outline-inverse" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" />}>Delete draft</Button>
            <Button variant="outline-inverse" loading={saving === 'save'} disabled={!!saving} onClick={submit('save')}>Save draft</Button>
            <Button variant="inverse" loading={saving === 'send'} disabled={!!saving} onClick={submit('send')}>Send to customer</Button>
          </>
        } />

      <form className="grid gap-4 xl:grid-cols-[1fr_320px]" onSubmit={submit('save')} noValidate>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Line items" description="Labor, materials and other charges. Amounts in pesos." />
            <div className="space-y-3 p-4">
              <div className="hidden grid-cols-[120px_1fr_90px_130px_110px_36px] gap-2 px-1 text-xs font-medium text-ink-500 md:grid">
                <span>Type</span><span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Amount</span><span />
              </div>
              {fields.map((f, i) => {
                const line = previewLineTotal(items[i]?.quantity ?? '0', parsePesosToCents(items[i]?.unit_price ?? '') ?? 0);
                const e = errors.items?.[i];
                return (
                  <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg border border-ink-100 p-2 md:grid-cols-[120px_1fr_90px_130px_110px_36px] md:items-start md:border-0 md:p-0">
                    <label className="sr-only" htmlFor={`kind-${i}`}>Type</label>
                    <Select id={`kind-${i}`} {...register(`items.${i}.kind`)} className="h-10 py-1">
                      <option value="labor">Labor</option><option value="material">Material</option><option value="other">Other</option>
                    </Select>
                    <div className="col-span-2 md:col-span-1 md:row-start-1 md:col-start-2">
                      <label className="sr-only" htmlFor={`desc-${i}`}>Description</label>
                      <Input id={`desc-${i}`} {...register(`items.${i}.description`)} placeholder="e.g. Replace P-trap" aria-invalid={!!e?.description} />
                      {e?.description && <p className="mt-1 text-xs text-danger-600">{e.description.message}</p>}
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`qty-${i}`}>Quantity</label>
                      <Input id={`qty-${i}`} {...register(`items.${i}.quantity`)} inputMode="decimal" className="tabular-nums" aria-invalid={!!e?.quantity} />
                      {e?.quantity && <p className="mt-1 text-xs text-danger-600">{e.quantity.message}</p>}
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`price-${i}`}>Unit price</label>
                      <MoneyInput id={`price-${i}`} {...register(`items.${i}.unit_price`)} aria-invalid={!!e?.unit_price} />
                      {e?.unit_price && <p className="mt-1 text-xs text-danger-600">{e.unit_price.message}</p>}
                    </div>
                    <p className="self-center text-right text-sm font-medium tabular-nums"><Money cents={line} showCents /></p>
                    <button type="button" onClick={() => remove(i)} disabled={fields.length === 1} className="grid size-9 place-items-center justify-self-end rounded-md text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Remove item ${i + 1}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
              {errors.items?.root && <p className="text-sm text-danger-600">{errors.items.root.message}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {(['labor', 'material', 'other'] as const).map((k) => (
                  <Button key={k} size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => append({ kind: k, description: '', quantity: '1', unit_price: '' })}>
                    {k === 'labor' ? 'Labor' : k === 'material' ? 'Material' : 'Other charge'}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Title" error={errors.title} className="sm:col-span-2">{(p) => <Input {...p} {...register('title')} />}</Field>
              <Field label="Scope of work" className="sm:col-span-2" hint="What exactly will be done.">{(p) => <Textarea {...p} rows={5} {...register('scope_of_work')} />}</Field>
              <Field label="Proposed start (Philippine time)" hint="Required to send.">{(p) => <Input {...p} type="datetime-local" {...register('proposed_start')} />}</Field>
              <div>
                <span className="label">Estimated duration</span>
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center gap-2"><Input type="number" min={0} {...register('duration_hours')} aria-label="Hours" /><span className="text-sm text-ink-500">h</span></label>
                  <label className="flex flex-1 items-center gap-2"><Input type="number" min={0} max={59} {...register('duration_minutes')} aria-label="Minutes" /><span className="text-sm text-ink-500">min</span></label>
                </div>
              </div>
              <Field label="Valid until" error={errors.valid_until}>{(p) => <DateInput {...p} min={todayManila()} {...register('valid_until')} />}</Field>
              <Field label="Deposit paid online (%)" error={errors.deposit_percent} hint="0 = no online deposit.">{(p) => <Input {...p} type="number" min={0} max={100} {...register('deposit_percent')} />}</Field>
              <Field label="Payment terms" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} {...register('payment_terms')} placeholder="e.g. Balance payable in cash upon completion." />}</Field>
              <Field label="Exclusions">{(p) => <Textarea {...p} rows={3} {...register('exclusions')} />}</Field>
              <Field label="Warranty">{(p) => <Textarea {...p} rows={3} {...register('warranty_terms')} placeholder="e.g. 30 days on workmanship." />}</Field>
              <Field label="Notes to the customer" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} {...register('notes')} />}</Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader title="Summary" description={isDirty ? 'Preview — saved totals are calculated by the server.' : 'Saved totals.'} />
            <div className="space-y-3 p-5 text-sm">
              <Field label="Discount" error={errors.discount}>{(p) => <MoneyInput {...p} {...register('discount')} placeholder="0" />}</Field>
              <Field label="Tax rate (%)" error={errors.tax_rate} hint="Leave blank if you don't charge VAT.">{(p) => <Input {...p} inputMode="decimal" {...register('tax_rate')} placeholder="0" />}</Field>
              <dl className="space-y-1.5 border-t border-ink-100 pt-3">
                <Row label="Subtotal" cents={isDirty ? preview.subtotal : quote.subtotal_cents} />
                <Row label="Tax" cents={isDirty ? preview.tax : quote.tax_cents} />
                <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                  <dt>Total</dt><dd><Money cents={isDirty ? preview.total : quote.total_cents} showCents /></dd>
                </div>
              </dl>
              <FormError message={error} />
            </div>
          </Card>
          <Alert tone="neutral">Once sent, a quotation can't be edited. To change it, create a revision; the customer then sees the new version.</Alert>
        </div>
      </form>

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this draft?" confirmLabel="Delete" danger
        onConfirm={async () => { unwrap(await supabase.from('quotations').delete().eq('id', quote.id)); qc.invalidateQueries({ queryKey: ['quotes'] }); navigate(`/pro-dashboard/requests/${quote.request?.id}`); }} />
    </div>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return <div className="flex justify-between text-ink-700"><dt>{label}</dt><dd><Money cents={cents} showCents /></dd></div>;
}

export const CustomerQuoteDetailPage = () => <QuoteDetailPage role="customer" />;
export const ProQuoteDetailPage = () => <QuoteDetailPage role="professional" />;
