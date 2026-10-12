import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Printer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert, Button, Card, CardHeader, Checkbox, Dialog, ErrorState, Field, FormError, Input, PageHeader, PageSpinner, StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { QuoteDocument, type QuoteDocData, type QuoteItemData } from '@/features/workflow/QuoteDocument';
import { Timeline } from '@/features/workflow/Timeline';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { supabase, unwrap, type ContractSignature } from '@/lib/supabase';

type Role = 'customer' | 'professional';

interface ContractContent {
  contract_number: string;
  version: number;
  generated_at: string;
  customer: { full_name: string | null } | null;
  professional: { display_name: string; business_name: string | null; slug: string } | null;
  quotation: QuoteDocData;
  items: QuoteItemData[];
  schedule: { start: string; end: string; city: string | null; address: string | null; timezone: string };
  terms: Record<string, string>;
}

const TERM_SECTIONS: [key: string, title: string][] = [
  ['cancellation', 'Cancellation'],
  ['rescheduling', 'Rescheduling'],
  ['completion', 'Completion'],
  ['dispute_resolution', 'Dispute resolution'],
  ['general', 'General'],
  ['additional', 'Additional terms'],
];

function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contract', id],
    enabled: !!id,
    queryFn: async () => {
      const contract = unwrap(await supabase.from('contracts').select('*').eq('id', id!).single());
      const versions = unwrap(await supabase.from('contract_versions').select('*').eq('contract_id', contract.id).order('version', { ascending: false }));
      const signatures = versions.length
        ? unwrap(await supabase.from('contract_signatures').select('*').in('contract_version_id', versions.map((v) => v.id)))
        : [];
      return { contract, versions, signatures };
    },
  });
}

function ContractDetailPage({ role }: { role: Role }) {
  const { id } = useParams();
  const { data, isPending, error, refetch } = useContract(id);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const base = role === 'professional' ? '/pro-dashboard' : '/dashboard';

  if (isPending) return <PageSpinner />;
  if (error) return <div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  const { contract, versions, signatures } = data;
  const current = versions.find((v) => v.version === contract.current_version)!;
  const shown = versions.find((v) => v.version === (viewVersion ?? contract.current_version)) ?? current;
  const content = shown.content as unknown as ContractContent;
  const sigsFor = (versionId: string) => signatures.filter((s) => s.contract_version_id === versionId);
  const currentSigs = sigsFor(current.id);
  const mySig = currentSigs.find((s) => s.signer_role === role);
  const signable = ['pending_signatures', 'partially_signed'].includes(contract.status);

  return (
    <div>
      <PageHeader title={`Contract ${contract.contract_number}`} back={{ to: `${base}/contracts`, label: 'All contracts' }}
        description={<span className="flex flex-wrap items-center gap-2">Version {contract.current_version} <StatusBadge domain="contract" status={contract.status} /></span>}
        actions={
          <>
            <Button variant="outline-inverse" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print / save PDF</Button>
            {signable && <Button variant="outline-inverse" onClick={() => setAmendOpen(true)}>Propose changes</Button>}
            {contract.booking_id && <Link to={`${base}/bookings/${contract.booking_id}`} className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-ink-950 hover:bg-ink-100">View booking</Link>}
          </>
        } />

      {contract.status === 'signed' && <div className="mb-4"><Alert tone="success" title="Fully signed">Both parties signed version {contract.current_version} on {formatDateTime(contract.signed_at)}. This version can no longer be changed.</Alert></div>}
      {contract.status === 'void' && <div className="mb-4"><Alert tone="neutral" title="This contract is void">The booking was cancelled before signing completed.</Alert></div>}
      {shown.version !== contract.current_version && (
        <div className="mb-4"><Alert tone="info" title={`You are viewing version ${shown.version}`}>
          This is a previous version. <button type="button" className="underline" onClick={() => setViewVersion(null)}>View the current version</button>
        </Alert></div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="print-area p-5 sm:p-8">
          <ContractDocument content={content} hash={shown.content_hash} signatures={sigsFor(shown.id)} />
        </Card>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader title="Signatures" description={`Version ${contract.current_version}`} />
            <ul className="space-y-3 px-5 py-4 text-sm">
              {(['customer', 'professional'] as const).map((r) => {
                const s = currentSigs.find((x) => x.signer_role === r);
                return (
                  <li key={r} className="flex items-start gap-2">
                    {s ? <CheckCircle2 className="mt-0.5 size-4 text-success-600" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 text-ink-300" aria-hidden="true" />}
                    <span>
                      <span className="font-medium capitalize text-ink-900">{r}</span>
                      <span className="block text-ink-500">{s ? `${s.signer_name} · ${formatDateTime(s.signed_at)}` : 'Not signed yet'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {signable && !mySig && <SignForm contractId={contract.id} version={contract.current_version} contractNumber={contract.contract_number} />}
            {signable && mySig && <p className="border-t border-ink-100 px-5 py-3 text-[13px] text-ink-500">You signed this version. Waiting for the other party.</p>}
          </Card>

          {versions.length > 1 && (
            <Card>
              <CardHeader title="Version history" />
              <ul className="divide-y divide-ink-100">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setViewVersion(v.version)} className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-ink-50 ${v.id === shown.id ? 'bg-ink-50 font-medium' : ''}`}>
                      <span>Version {v.version}{v.version === contract.current_version ? ' (current)' : ''}</span>
                      <span className="text-xs text-ink-500">{sigsFor(v.id).length}/2 signed</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Timeline entityType="contract" entityId={contract.id} />
        </div>
      </div>

      {amendOpen && <AmendDialog contractId={contract.id} terms={(current.content as unknown as ContractContent).terms} onClose={() => setAmendOpen(false)} />}
    </div>
  );
}

function ContractDocument({ content, hash, signatures }: { content: ContractContent; hash: string; signatures: ContractSignature[] }) {
  const pro = content.professional;
  return (
    <div className="space-y-8 text-sm text-ink-800">
      <header className="border-b border-ink-200 pb-6">
        <p className="text-xs tracking-wide text-ink-500 uppercase">Service agreement</p>
        <h2 className="font-display text-2xl font-semibold text-ink-950">{content.contract_number} · Version {content.version}</h2>
        <p className="mt-1 text-ink-500">Generated {formatDateTime(content.generated_at)} from quotation {content.quotation.quote_number} (revision {content.quotation.revision}).</p>
      </header>

      {content.terms.notice && <Alert tone="warning">{content.terms.notice}</Alert>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium tracking-wide text-ink-500 uppercase">Customer</h3>
          <p className="mt-1 font-medium text-ink-950">{content.customer?.full_name || 'Customer'}</p>
        </div>
        <div>
          <h3 className="text-xs font-medium tracking-wide text-ink-500 uppercase">Professional</h3>
          <p className="mt-1 font-medium text-ink-950">{pro?.display_name}</p>
          {pro?.business_name && <p className="text-ink-600">{pro.business_name}</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-ink-500 uppercase">Service location and schedule</h3>
        <p>{[content.schedule.address, content.schedule.city].filter(Boolean).join(', ') || '—'}</p>
        <p>{formatDateTime(content.schedule.start)} to {formatDateTime(content.schedule.end)} (Philippine time)</p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-medium tracking-wide text-ink-500 uppercase">Agreed scope and price</h3>
        <QuoteDocument quote={content.quotation} items={content.items} professional={pro?.business_name || pro?.display_name} customer={content.customer?.full_name} />
      </section>

      {TERM_SECTIONS.filter(([k]) => content.terms[k]).map(([k, title]) => (
        <section key={k}>
          <h3 className="mb-1 font-display font-semibold text-ink-950">{title}</h3>
          <p className="whitespace-pre-line">{content.terms[k]}</p>
        </section>
      ))}

      <section className="border-t border-ink-200 pt-6">
        <h3 className="mb-3 font-display font-semibold text-ink-950">Signatures</h3>
        {signatures.length === 0 && <p className="text-ink-500">Not yet signed.</p>}
        <ul className="space-y-3">
          {signatures.map((s) => (
            <li key={s.id} className="rounded-lg bg-ink-50 p-3">
              <p className="font-medium text-ink-950">{s.signer_name} <span className="font-normal capitalize text-ink-500">({s.signer_role})</span></p>
              <p className="text-[13px] text-ink-600">Accepted electronically on {formatDateTime(s.signed_at)}</p>
              <p className="mt-1 text-xs text-ink-500">{s.consent_statement}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs break-all text-ink-500">Document fingerprint (SHA-256): {hash}</p>
      </section>
    </div>
  );
}

function SignForm({ contractId, version, contractNumber }: { contractId: string; version: number; contractNumber: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('sign_contract', { p_contract_id: contractId, p_version: version, p_signer_name: name, p_consent: agree });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    toast('Contract signed');
    qc.invalidateQueries({ queryKey: ['contract', contractId] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['booking'] });
    qc.invalidateQueries({ queryKey: ['dashboard-counts'] });
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-ink-100 px-5 py-4">
      <Field label="Type your full name to sign">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />}</Field>
      <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)}
        label={`I have read ${contractNumber} version ${version} and agree to its terms.`}
        description="Your typed name, the time and a fingerprint of this exact version are recorded." />
      <FormError message={error} />
      <Button type="submit" loading={busy} disabled={!agree || name.trim().length < 2} className="w-full">Sign version {version}</Button>
    </form>
  );
}

function AmendDialog({ contractId, terms, onClose }: { contractId: string; terms: Record<string, string>; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(TERM_SECTIONS.map(([k]) => [k, terms[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (terms[k] ?? '')));
    if (!Object.keys(changed).length) return onClose();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('amend_contract', { p_contract_id: contractId, p_terms: changed });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    toast('New version created — both parties need to sign it');
    qc.invalidateQueries({ queryKey: ['contract', contractId] });
    onClose();
  };
  return (
    <Dialog open onClose={onClose} size="lg" title="Propose changes to the terms"
      description="This creates a new contract version. Earlier signatures don't carry over: both of you sign the new version. Price or scope changes need a revised quotation instead."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Create new version</Button></>}>
      <div className="space-y-4">
        {TERM_SECTIONS.map(([k, title]) => (
          <Field key={k} label={title}>{(p) => <Textarea {...p} rows={3} maxLength={5000} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />}</Field>
        ))}
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

export const CustomerContractDetailPage = () => <ContractDetailPage role="customer" />;
export const ProContractDetailPage = () => <ContractDetailPage role="professional" />;
