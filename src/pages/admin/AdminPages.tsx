// Admin area. Every action is authorized by the database (admin = row in user_roles); these pages only present it.
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import {
  Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, Checkbox, DetailList, Dialog, EmptyState, ErrorState, Field,
  FormError, Input, Money, MoneyInput, PageHeader, Select, Skeleton, StatCard, Stars, StatusBadge, Textarea, useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { BOOKING_SELECT, useTimeline } from '@/features/bookings/api';
import type { Json } from '@/lib/database.types';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { VERIFICATION_KIND_LABELS } from '@/lib/status';
import { signedUrl } from '@/lib/storage';
import { supabase, unwrap, type Category, type Tables } from '@/lib/supabase';
import { centsToPesoInput, parsePesosToCents } from '@shared/money';
import {
  ActionDialog, DataTable, FilterSelect, PAGE_SIZE, SearchBox, TD, TR, humanize, pageRange, paged, shortId, statusOptions,
  useListParams, type PendingAction,
} from './kit';

const linkClass = 'font-medium text-ink-900 underline-offset-4 hover:underline';
const muted = 'mt-0.5 text-[13px] text-ink-500';

/** Booking number that jumps to the bookings oversight list filtered to it. */
function BookingRef({ number }: { number: string | null | undefined }) {
  if (!number) return <span className="text-ink-500">—</span>;
  return <Link to={`/admin/bookings?q=${encodeURIComponent(number)}`} className={`${linkClass} whitespace-nowrap tabular-nums`}>{number}</Link>;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

interface Overview {
  users: number;
  professionals_published: number;
  verifications_pending: number;
  requests_open: number;
  bookings_active: number;
  bookings_completed: number;
  disputes_open: number;
  refunds_pending: number;
  reports_open: number;
  payments_paid_cents: number;
}

export function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => unwrap(await supabase.rpc('admin_overview')) as unknown as Overview,
  });
  const d = overview.data;
  const n = (v: number) => Number(v).toLocaleString('en-PH');
  const stats: { label: string; value: ReactNode; to?: string; hint?: string }[] = d
    ? [
        { label: 'Users', value: n(d.users), to: '/admin/users' },
        { label: 'Published professionals', value: n(d.professionals_published), to: '/admin/professionals?status=published' },
        { label: 'Pending verifications', value: n(d.verifications_pending), to: '/admin/verifications' },
        { label: 'Open requests', value: n(d.requests_open), hint: 'Waiting on a professional' },
        { label: 'Active bookings', value: n(d.bookings_active), to: '/admin/bookings', hint: 'Awaiting payment, confirmed or in progress' },
        { label: 'Completed bookings', value: n(d.bookings_completed), to: '/admin/bookings?status=completed' },
        { label: 'Open disputes', value: n(d.disputes_open), to: '/admin/disputes' },
        { label: 'Refunds to action', value: n(d.refunds_pending), to: '/admin/payments', hint: 'Pending review or approved' },
        { label: 'Open reports', value: n(d.reports_open), to: '/admin/reviews' },
        { label: 'Payments received', value: <Money cents={d.payments_paid_cents} />, to: '/admin/payments', hint: 'Paid or partially refunded' },
      ]
    : [];
  return (
    <>
      <PageHeader title="Admin overview" description="Live counts from the database." />
      {overview.isError ? (
        <Card><ErrorState error={overview.error} onRetry={() => overview.refetch()} /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {d
            ? stats.map((s) => <StatCard key={s.label} {...s} />)
            : Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />)}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

type AdminUser = Awaited<ReturnType<typeof fetchUsers>>['rows'][number];

async function fetchUsers(q: string, page: number) {
  const rows = unwrap(await supabase.rpc('admin_list_users', { p_search: q || undefined, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE })) ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export function AdminUsersPage() {
  const { user } = useAuth();
  const params = useListParams();
  const q = params.get('q');
  const page = params.page();
  const [action, setAction] = useState<PendingAction | null>(null);
  const users = useQuery({ queryKey: ['admin', 'users', q, page], queryFn: () => fetchUsers(q, page) });

  const toggle = (u: AdminUser) => {
    const name = u.full_name || u.email;
    setAction(
      u.is_suspended
        ? {
            title: `Restore ${name}?`,
            description: 'The account is no longer flagged as suspended. A suspended professional page returns to draft; its owner must publish it again.',
            confirmLabel: 'Restore account',
            note: { label: 'Note (optional)' },
            success: 'Account restored',
            run: async (note) => unwrap(await supabase.rpc('admin_set_user_suspended', { p_user_id: u.id, p_suspended: false, p_reason: note })),
          }
        : {
            title: `Suspend ${name}?`,
            description: 'The account is flagged as suspended and any professional page is hidden from the public. The reason is kept in the audit log.',
            confirmLabel: 'Suspend account',
            danger: true,
            note: { label: 'Reason', required: true },
            success: 'Account suspended',
            run: async (note) => unwrap(await supabase.rpc('admin_set_user_suspended', { p_user_id: u.id, p_suspended: true, p_reason: note })),
          },
    );
  };

  return (
    <>
      <PageHeader title="Users" description="Everyone with an account. Suspend accounts that break the rules." />
      <DataTable
        title="Accounts"
        description={users.data ? `${users.data.total.toLocaleString('en-PH')} total` : undefined}
        toolbar={<SearchBox label="Search name, email or business" value={q} onSearch={(v) => params.set({ q: v, page: null })} />}
        columns={['User', 'Joined', 'Roles', 'Status', 'Actions']}
        query={users}
        rowCount={users.data?.rows.length}
        emptyTitle={q ? 'No matching users' : 'No users yet'}
        pagination={users.data && { page, total: users.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {users.data?.rows.map((u) => (
          <tr key={u.id} className={TR}>
            <td className={TD}>
              <p className="font-medium text-ink-900">{u.full_name || 'Unnamed'}</p>
              <p className={muted}>{u.email}</p>
            </td>
            <td className={`${TD} whitespace-nowrap`}>{formatDate(u.created_at)}</td>
            <td className={TD}>
              <div className="flex flex-wrap items-center gap-1.5">
                {u.is_admin && <Badge tone="dark">Admin</Badge>}
                {u.professional_slug ? (
                  <>
                    <Link to={`/pro/${u.professional_slug}`} className={`${linkClass} text-[13px]`}>Professional</Link>
                    <StatusBadge domain="profile" status={u.professional_status} />
                  </>
                ) : (
                  <Badge>Customer</Badge>
                )}
              </div>
            </td>
            <td className={TD}>{u.is_suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}</td>
            <td className={TD}>
              {u.id === user?.id ? (
                <span className="text-[13px] text-ink-500">You</span>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => toggle(u)}>{u.is_suspended ? 'Restore' : 'Suspend'}</Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Professionals
// ---------------------------------------------------------------------------

async function fetchProfessionals(q: string, status: string, page: number) {
  let query = supabase
    .from('professional_profiles')
    .select('id, slug, display_name, business_name, city, province, avatar_path, status, verification_status, rating_avg, review_count, created_at', { count: 'exact' });
  if (status) query = query.eq('status', status);
  // Quoted values keep commas/parentheses from breaking the or() filter; quotes and backslashes are dropped.
  const term = q.replace(/["\\]/g, '');
  if (term) query = query.or(`display_name.ilike."%${term}%",slug.ilike."%${term}%"`);
  return paged(query.order('created_at', { ascending: false }).range(...pageRange(page)));
}

export function AdminProfessionalsPage() {
  const params = useListParams();
  const q = params.get('q');
  const status = params.get('status');
  const page = params.page();
  const [action, setAction] = useState<PendingAction | null>(null);
  const pros = useQuery({ queryKey: ['admin', 'professionals', q, status, page], queryFn: () => fetchProfessionals(q, status, page) });

  return (
    <>
      <PageHeader title="Professionals" description="Professional pages in every state. Suspending hides a page from the public." />
      <DataTable
        title="Professional pages"
        description={pros.data ? `${pros.data.total.toLocaleString('en-PH')} found` : undefined}
        toolbar={
          <>
            <SearchBox label="Search name or page address" value={q} onSearch={(v) => params.set({ q: v, page: null })} />
            <FilterSelect label="Page status" value={status} options={statusOptions('profile', ['draft', 'published', 'suspended'])} onChange={(v) => params.set({ status: v, page: null })} />
          </>
        }
        columns={['Professional', 'Location', 'Page', 'Verification', 'Rating', 'Joined', 'Actions']}
        query={pros}
        rowCount={pros.data?.rows.length}
        emptyTitle="No professionals found"
        pagination={pros.data && { page, total: pros.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {pros.data?.rows.map((p) => (
          <tr key={p.id} className={TR}>
            <td className={TD}>
              <div className="flex items-center gap-3">
                <Avatar name={p.display_name} path={p.avatar_path} size="sm" />
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{p.display_name}</p>
                  <p className={muted}>/pro/{p.slug}</p>
                </div>
              </div>
            </td>
            <td className={`${TD} whitespace-nowrap`}>{[p.city, p.province].filter(Boolean).join(', ') || '—'}</td>
            <td className={TD}><StatusBadge domain="profile" status={p.status} /></td>
            <td className={TD}><StatusBadge domain="verification" status={p.verification_status} /></td>
            <td className={`${TD} whitespace-nowrap`}>{p.review_count ? `${Number(p.rating_avg).toFixed(1)} (${p.review_count})` : '—'}</td>
            <td className={`${TD} whitespace-nowrap`}>{formatDate(p.created_at)}</td>
            <td className={TD}>
              <div className="flex gap-2">
                <ButtonLink to={`/pro/${p.slug}`} target="_blank" rel="noreferrer" size="sm" variant="ghost" aria-label={`View ${p.display_name} page (opens in a new tab)`} icon={<ExternalLink className="size-3.5" aria-hidden="true" />}>
                  View
                </ButtonLink>
                {p.status === 'suspended' ? (
                  <Button size="sm" variant="secondary" onClick={() => setAction({
                    title: `Unsuspend ${p.display_name}?`,
                    description: 'The page returns to draft. The professional must publish it again before customers can see it.',
                    confirmLabel: 'Unsuspend',
                    note: { label: 'Note (optional)' },
                    success: 'Professional unsuspended',
                    run: async (note) => unwrap(await supabase.rpc('admin_moderate', { p_entity_type: 'professional', p_entity_id: p.id, p_action: 'unsuspend', p_note: note })),
                  })}>
                    Unsuspend
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setAction({
                    title: `Suspend ${p.display_name}?`,
                    description: 'The page and its services disappear from search and the public site. The account itself stays active.',
                    confirmLabel: 'Suspend page',
                    danger: true,
                    note: { label: 'Reason', required: true },
                    success: 'Professional suspended',
                    run: async (note) => unwrap(await supabase.rpc('admin_moderate', { p_entity_type: 'professional', p_entity_id: p.id, p_action: 'suspend', p_note: note })),
                  })}>
                    Suspend
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------------------

async function fetchVerifications(status: string, page: number) {
  let query = supabase
    .from('verification_submissions')
    .select('*, professional:professional_profiles(display_name, slug, verification_status, verified_kinds)', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  // The pending queue is oldest first; decided submissions newest first.
  return paged(query.order('submitted_at', { ascending: status === 'pending' }).range(...pageRange(page)));
}

export function AdminVerificationsPage() {
  const params = useListParams();
  const status = params.get('status', 'pending');
  const page = params.page();
  const toast = useToast();
  const [action, setAction] = useState<PendingAction | null>(null);
  const subs = useQuery({ queryKey: ['admin', 'verifications', status, page], queryFn: () => fetchVerifications(status, page) });

  const openDocument = async (path: string) => {
    const tab = window.open('', '_blank'); // opened before the await so popup blockers allow it
    try {
      const url = await signedUrl('verification-docs', path, 120);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      tab?.close();
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader title="Verifications" description="Review identity and business documents submitted by professionals." />
      <div className="mb-4">
        <Alert tone="warning" title="Verification is not proof of qualification">
          Approving confirms that the documents look genuine and match the professional's details. It does not prove skills, licences or the quality of their work.
          Document links expire after 2 minutes.
        </Alert>
      </div>
      <DataTable
        title="Submissions"
        toolbar={
          <FilterSelect
            label="Submission status"
            value={status}
            options={[['pending', 'Pending review'], ['approved', 'Approved'], ['rejected', 'Not approved'], ['all', 'All submissions']]}
            onChange={(v) => params.set({ status: v === 'pending' ? null : v, page: null })}
          />
        }
        columns={['Professional', 'Type', 'Submitted', 'Documents', 'Details', 'Status', 'Actions']}
        query={subs}
        rowCount={subs.data?.rows.length}
        emptyTitle={status === 'pending' ? 'Nothing to review' : 'No submissions'}
        emptyDescription={status === 'pending' ? 'New submissions will appear here.' : undefined}
        pagination={subs.data && { page, total: subs.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {subs.data?.rows.map((s) => {
          const name = s.professional?.display_name ?? 'Professional';
          const kind = VERIFICATION_KIND_LABELS[s.kind] ?? humanize(s.kind);
          return (
            <tr key={s.id} className={TR}>
              <td className={TD}>
                {s.professional ? (
                  <Link to={`/pro/${s.professional.slug}`} target="_blank" rel="noreferrer" className={linkClass}>{name}</Link>
                ) : (
                  name
                )}
                {s.professional && <div className="mt-1"><StatusBadge domain="verification" status={s.professional.verification_status} /></div>}
              </td>
              <td className={`${TD} whitespace-nowrap`}>{kind}</td>
              <td className={`${TD} whitespace-nowrap`}>{formatDateTime(s.submitted_at)}</td>
              <td className={TD}>
                <ul className="space-y-1">
                  {s.document_paths.map((path, i) => (
                    <li key={path}>
                      <button type="button" onClick={() => openDocument(path)} className={`${linkClass} inline-flex items-center gap-1 text-[13px] whitespace-nowrap`} aria-label={`Open document ${i + 1} for ${name} (new tab)`}>
                        <FileText className="size-3.5" aria-hidden="true" /> Document {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </td>
              <td className={`${TD} min-w-56 whitespace-pre-line text-ink-700`}>{s.details || '—'}</td>
              <td className={TD}>
                <StatusBadge domain="verification" status={s.status} />
                {s.decision_reason && <p className={muted}>{s.decision_reason}</p>}
              </td>
              <td className={TD}>
                {s.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setAction({
                      title: `Approve ${kind.toLowerCase()} verification?`,
                      description: `${name}'s page will show this check as verified. It confirms the documents only, not their skills or licences.`,
                      confirmLabel: 'Approve',
                      note: { label: 'Note (optional)' },
                      success: 'Verification approved',
                      run: async (note) => unwrap(await supabase.rpc('admin_review_verification', { p_submission_id: s.id, p_approve: true, p_reason: note })),
                    })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setAction({
                      title: `Reject ${kind.toLowerCase()} verification?`,
                      description: `${name} is notified with your reason and can submit again.`,
                      confirmLabel: 'Reject',
                      danger: true,
                      note: { label: 'Reason (sent to the professional)', required: true },
                      success: 'Verification rejected',
                      run: async (note) => unwrap(await supabase.rpc('admin_review_verification', { p_submission_id: s.id, p_approve: false, p_reason: note })),
                    })}>
                      Reject
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(60, 'Keep it under 60 characters.'),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters and numbers separated by single hyphens, e.g. aircon-repair.'),
  description: z.string().trim().max(300, 'Keep it under 300 characters.'),
  icon: z.string().trim().max(40, 'Keep it under 40 characters.'),
  sort_order: z.number({ error: 'Enter a whole number.' }).int('Enter a whole number.'),
  is_active: z.boolean(),
});

export function AdminCategoriesPage() {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => unwrap(await supabase.from('service_categories').select('*').order('sort_order').order('name')),
  });
  return (
    <>
      <PageHeader
        title="Categories"
        description="Service categories used in search and on professional pages. Deactivate a category instead of deleting it."
        actions={<Button variant="inverse" icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setEditing('new')}>New category</Button>}
      />
      <DataTable
        title="All categories"
        description="Inactive categories are hidden from everyone except administrators."
        columns={['Category', 'Description', 'Icon', 'Order', 'Status', 'Actions']}
        query={categories}
        rowCount={categories.data?.length}
        emptyTitle="No categories yet"
      >
        {categories.data?.map((c) => (
          <tr key={c.id} className={TR}>
            <td className={TD}>
              <p className="font-medium text-ink-900">{c.name}</p>
              <p className={muted}>{c.slug}</p>
            </td>
            <td className={`${TD} min-w-64 text-ink-700`}>{c.description || '—'}</td>
            <td className={`${TD} font-mono text-[13px]`}>{c.icon || '—'}</td>
            <td className={`${TD} tabular-nums`}>{c.sort_order}</td>
            <td className={TD}>{c.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
            <td className={TD}>
              <Button size="sm" variant="secondary" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</Button>
            </td>
          </tr>
        ))}
      </DataTable>
      {editing && <CategoryDialog key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const formId = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      description: category?.description ?? '',
      icon: category?.icon ?? '',
      sort_order: category?.sort_order ?? 100,
      is_active: category?.is_active ?? true,
    },
  });
  const save = useMutation({
    mutationFn: async ({ slug, ...values }: z.output<typeof categorySchema>) => {
      const row = { ...values, description: values.description || null, icon: values.icon || null };
      return category
        ? unwrap(await supabase.from('service_categories').update(row).eq('id', category.id).select('id').single())
        : unwrap(await supabase.from('service_categories').insert({ ...row, slug }).select('id').single());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast(category ? 'Category updated' : 'Category created');
      onClose();
    },
  });
  const saveError = (save.error as { code?: string } | null)?.code === '23505' ? 'A category with this slug already exists.' : save.error && errorMessage(save.error);

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={save.isPending}>{category ? 'Save changes' : 'Create category'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Field label="Name" required error={errors.name}>{(p) => <Input {...p} {...register('name')} />}</Field>
        <Field label="Slug" required error={errors.slug} hint={category ? 'Part of public links; it cannot be changed.' : 'Used in links like /category/aircon-repair. It cannot be changed later.'}>
          {(p) => <Input {...p} {...register('slug')} readOnly={!!category} className={category ? 'bg-ink-50 text-ink-500' : ''} />}
        </Field>
        <Field label="Description" error={errors.description}>{(p) => <Textarea rows={3} {...p} {...register('description')} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Icon" hint="Lucide icon name, e.g. wrench" error={errors.icon}>{(p) => <Input {...p} {...register('icon')} />}</Field>
          <Field label="Sort order" hint="Lower numbers come first" error={errors.sort_order}>
            {(p) => <Input type="number" step={1} {...p} {...register('sort_order', { valueAsNumber: true })} />}
          </Field>
        </div>
        <Checkbox label="Active" description="Inactive categories are hidden from customers and professionals." {...register('is_active')} />
        <FormError message={saveError || null} />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bookings (read-only oversight)
// ---------------------------------------------------------------------------

const BOOKING_STATUSES = [
  'requested', 'awaiting_professional', 'awaiting_quote', 'awaiting_customer_acceptance', 'awaiting_contract', 'awaiting_payment',
  'confirmed', 'in_progress', 'completed', 'cancellation_requested', 'cancelled', 'disputed', 'expired',
];

async function fetchBookings(q: string, status: string, page: number) {
  let query = supabase.from('bookings').select(BOOKING_SELECT, { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('booking_number', `%${q}%`);
  return paged(query.order('created_at', { ascending: false }).range(...pageRange(page)));
}
type AdminBooking = Awaited<ReturnType<typeof fetchBookings>>['rows'][number];

export function AdminBookingsPage() {
  const params = useListParams();
  const q = params.get('q');
  const status = params.get('status');
  const page = params.page();
  const [open, setOpen] = useState<AdminBooking | null>(null);
  const bookings = useQuery({ queryKey: ['admin', 'bookings', q, status, page], queryFn: () => fetchBookings(q, status, page) });

  return (
    <>
      <PageHeader title="Bookings" description="Read-only oversight of every booking. Customers and professionals manage their own bookings." />
      <DataTable
        title="All bookings"
        description={bookings.data ? `${bookings.data.total.toLocaleString('en-PH')} found` : undefined}
        toolbar={
          <>
            <SearchBox label="Search booking number" value={q} onSearch={(v) => params.set({ q: v, page: null })} />
            <FilterSelect label="Booking status" value={status} options={statusOptions('booking', BOOKING_STATUSES)} onChange={(v) => params.set({ status: v, page: null })} />
          </>
        }
        columns={['Booking', 'Customer', 'Professional', 'Scheduled', 'Total', 'Status', 'Payment', 'Actions']}
        query={bookings}
        rowCount={bookings.data?.rows.length}
        emptyTitle="No bookings found"
        pagination={bookings.data && { page, total: bookings.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {bookings.data?.rows.map((b) => (
          <tr key={b.id} className={TR}>
            <td className={TD}>
              <p className="font-medium whitespace-nowrap text-ink-900 tabular-nums">{b.booking_number}</p>
              <p className={`${muted} max-w-48 truncate`}>{b.service?.name ?? b.quotation?.title ?? '—'}</p>
            </td>
            <td className={`${TD} whitespace-nowrap`}>{b.customer?.full_name || '—'}</td>
            <td className={`${TD} whitespace-nowrap`}>{b.professional?.display_name ?? '—'}</td>
            <td className={`${TD} whitespace-nowrap`}>{formatDateTime(b.scheduled_start)}</td>
            <td className={`${TD} whitespace-nowrap`}><Money cents={b.amount_total_cents} /></td>
            <td className={TD}><StatusBadge domain="booking" status={b.status} /></td>
            <td className={TD}><StatusBadge domain="payment" status={b.payment_status} /></td>
            <td className={TD}>
              <Button size="sm" variant="secondary" onClick={() => setOpen(b)} aria-label={`View booking ${b.booking_number}`}>View</Button>
            </td>
          </tr>
        ))}
      </DataTable>
      {open && <BookingDialog key={open.id} booking={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BookingDialog({ booking: b, onClose }: { booking: AdminBooking; onClose: () => void }) {
  const timeline = useTimeline('booking', b.id);
  const actor = (id: string | null) =>
    !id ? 'System' : id === b.customer_id ? 'Customer' : id === b.professional?.user_id ? 'Professional' : `User ${shortId(id)}`;
  return (
    <Dialog open onClose={onClose} size="lg" title={`Booking ${b.booking_number}`} description={b.service?.name ?? b.quotation?.title ?? undefined}>
      <div className="space-y-6">
        <DetailList
          items={[
            ['Status', <StatusBadge domain="booking" status={b.status} />],
            ['Payment', <StatusBadge domain="payment" status={b.payment_status} />],
            ['Type', b.booking_type === 'instant' ? 'Instant booking' : 'From a quotation'],
            ['Quotation', b.quotation ? `${b.quotation.quote_number} (rev. ${b.quotation.revision})` : null],
            ['Customer', b.customer?.full_name || null],
            ['Professional', b.professional ? <Link to={`/pro/${b.professional.slug}`} target="_blank" rel="noreferrer" className={linkClass}>{b.professional.display_name}</Link> : null],
            ['Starts', formatDateTime(b.scheduled_start)],
            ['Ends', formatDateTime(b.scheduled_end)],
            ['Location', [b.location_address, b.location_city].filter(Boolean).join(', ') || null],
            ['Total', <Money cents={b.amount_total_cents} showCents />],
            ['Due now', <Money cents={b.amount_due_now_cents} showCents />],
            ['Paid', <Money cents={b.amount_paid_cents} showCents />],
            ['Payment due by', b.payment_due_by ? formatDateTime(b.payment_due_by) : null],
            ['Created', formatDateTime(b.created_at)],
            ['Customer notes', b.customer_notes],
            ['Cancellation reason', b.cancellation_reason],
          ]}
        />
        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Timeline</h3>
          {timeline.isPending ? (
            <Skeleton className="h-20" />
          ) : timeline.isError ? (
            <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />
          ) : !timeline.data?.length ? (
            <p className="text-sm text-ink-500">No events recorded.</p>
          ) : (
            <ol className="space-y-3 border-l border-ink-200 pl-4">
              {timeline.data.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="font-medium text-ink-900">
                    {humanize(e.action)}
                    {e.to_status && <span className="font-normal text-ink-500"> · {e.from_status ? humanize(e.from_status) : '—'} → {humanize(e.to_status)}</span>}
                  </p>
                  <p className={muted}>{formatDateTime(e.created_at)} · {actor(e.actor_id)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payments and refunds
// ---------------------------------------------------------------------------

const PURPOSE_LABELS: Record<string, string> = { booking_deposit: 'Deposit', booking_full: 'Full payment', booking_balance: 'Balance' };

async function sendRefundToPayMongo(refundId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch('/api/payments/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ refundId }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
  if (!res.ok) throw new Error(body.error || `The refund could not be sent (HTTP ${res.status}).`);
  return body.status;
}

export function AdminPaymentsPage() {
  const params = useListParams();
  const refundStatus = params.get('refund');
  const refundPage = params.page('rpage');
  const paymentStatus = params.get('payment');
  const paymentPage = params.page('ppage');
  const [action, setAction] = useState<PendingAction | null>(null);

  const refunds = useQuery({
    queryKey: ['admin', 'refunds', refundStatus, refundPage],
    queryFn: () => {
      let query = supabase.from('refunds').select('*, booking:bookings(booking_number)', { count: 'exact' });
      if (refundStatus) query = query.eq('status', refundStatus);
      return paged(query.order('created_at', { ascending: false }).range(...pageRange(refundPage)));
    },
  });
  const payments = useQuery({
    queryKey: ['admin', 'payments', paymentStatus, paymentPage],
    queryFn: () => {
      let query = supabase.from('payment_records').select('*, booking:bookings(booking_number)', { count: 'exact' });
      if (paymentStatus) query = query.eq('status', paymentStatus);
      return paged(query.order('created_at', { ascending: false }).range(...pageRange(paymentPage)));
    },
  });

  return (
    <>
      <PageHeader title="Payments" description="Online payments recorded from PayMongo, and refunds waiting for a decision." />
      <div className="space-y-6">
        <Alert tone="info" title="How refunds work">
          Cancelling a booking never refunds anyone automatically. Refunds wait here for review: approving one only records the decision, and
          “Send to PayMongo” asks PayMongo to return the money. Sending works only when PayMongo credentials are configured on the server.
        </Alert>

        <DataTable
          title="Refunds"
          toolbar={
            <FilterSelect
              label="Refund status"
              value={refundStatus}
              options={statusOptions('refund', ['pending_review', 'approved', 'processing', 'succeeded', 'failed', 'rejected'])}
              onChange={(v) => params.set({ refund: v, rpage: null })}
            />
          }
          columns={['Booking', 'Amount', 'Reason', 'Requested', 'Status', 'Actions']}
          query={refunds}
          rowCount={refunds.data?.rows.length}
          emptyTitle="No refunds"
          pagination={refunds.data && { page: refundPage, total: refunds.data.total, onChange: (p) => params.set({ rpage: p }) }}
        >
          {refunds.data?.rows.map((r) => {
            const label = r.booking?.booking_number ?? 'this booking';
            return (
              <tr key={r.id} className={TR}>
                <td className={TD}><BookingRef number={r.booking?.booking_number} /></td>
                <td className={`${TD} whitespace-nowrap`}><Money cents={r.amount_cents} showCents /></td>
                <td className={`${TD} min-w-56 text-ink-700`}>{r.reason || '—'}</td>
                <td className={`${TD} whitespace-nowrap`}>{formatDateTime(r.created_at)}</td>
                <td className={TD}>
                  <StatusBadge domain="refund" status={r.status} />
                  {(r.failure_reason || r.decision_note) && <p className={`${muted} max-w-56`}>{r.failure_reason || r.decision_note}</p>}
                </td>
                <td className={TD}>
                  {r.status === 'pending_review' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setAction({
                        title: 'Approve this refund?',
                        description: <>Approving records the decision for <Money cents={r.amount_cents} showCents /> on {label}. No money moves until you send it to PayMongo.</>,
                        confirmLabel: 'Approve',
                        note: { label: 'Note (optional)' },
                        success: 'Refund approved',
                        run: async (note) => unwrap(await supabase.rpc('admin_decide_refund', { p_refund_id: r.id, p_approve: true, p_note: note })),
                      })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setAction({
                        title: 'Reject this refund?',
                        description: `The refund request for ${label} is closed without paying anything back.`,
                        confirmLabel: 'Reject',
                        danger: true,
                        note: { label: 'Reason', required: true },
                        success: 'Refund rejected',
                        run: async (note) => unwrap(await supabase.rpc('admin_decide_refund', { p_refund_id: r.id, p_approve: false, p_note: note })),
                      })}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <Button size="sm" onClick={() => setAction({
                      title: 'Send refund to PayMongo?',
                      description: <>PayMongo will be asked to refund <Money cents={r.amount_cents} showCents /> for {label}. This cannot be undone.</>,
                      confirmLabel: 'Send refund',
                      danger: true,
                      success: 'Refund sent to PayMongo',
                      run: () => sendRefundToPayMongo(r.id),
                    })}>
                      Send to PayMongo
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>

        <DataTable
          title="Payment records"
          toolbar={
            <FilterSelect
              label="Payment status"
              value={paymentStatus}
              options={statusOptions('payment', ['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded'])}
              onChange={(v) => params.set({ payment: v, ppage: null })}
            />
          }
          columns={['Booking', 'Purpose', 'Amount', 'Status', 'Paid', 'Mode', 'Reference']}
          query={payments}
          rowCount={payments.data?.rows.length}
          emptyTitle="No payments yet"
          pagination={payments.data && { page: paymentPage, total: payments.data.total, onChange: (p) => params.set({ ppage: p }) }}
        >
          {payments.data?.rows.map((p) => (
            <tr key={p.id} className={TR}>
              <td className={TD}><BookingRef number={p.booking?.booking_number} /></td>
              <td className={`${TD} whitespace-nowrap`}>{PURPOSE_LABELS[p.purpose] ?? humanize(p.purpose)}</td>
              <td className={`${TD} whitespace-nowrap`}><Money cents={p.amount_cents} showCents /></td>
              <td className={TD}>
                <StatusBadge domain="payment" status={p.status} />
                {p.failure_reason && <p className={`${muted} max-w-56`}>{p.failure_reason}</p>}
              </td>
              <td className={`${TD} whitespace-nowrap`}>{p.paid_at ? formatDateTime(p.paid_at) : '—'}</td>
              <td className={TD}>{p.livemode === null ? '—' : p.livemode ? <Badge tone="dark">Live</Badge> : <Badge>Test</Badge>}</td>
              <td className={`${TD} font-mono text-xs text-ink-500`}>{p.provider_payment_id ?? p.provider_checkout_id ?? '—'}</td>
            </tr>
          ))}
        </DataTable>
      </div>
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

async function fetchDisputes(filter: string, page: number) {
  let query = supabase
    .from('disputes')
    .select('*, booking:bookings(booking_number, status, customer_id, professional_id, amount_paid_cents)', { count: 'exact' });
  if (filter === 'active') query = query.in('status', ['open', 'under_review']);
  else if (filter !== 'all') query = query.eq('status', filter);
  return paged(query.order('created_at', { ascending: filter === 'active' }).range(...pageRange(page)));
}
type AdminDispute = Awaited<ReturnType<typeof fetchDisputes>>['rows'][number];

export function AdminDisputesPage() {
  const params = useListParams();
  const filter = params.get('status', 'active');
  const page = params.page();
  const [open, setOpen] = useState<AdminDispute | null>(null);
  const disputes = useQuery({ queryKey: ['admin', 'disputes', filter, page], queryFn: () => fetchDisputes(filter, page) });

  return (
    <>
      <PageHeader title="Disputes" description="Booking disputes raised by customers or professionals. Both parties are notified of the outcome." />
      <DataTable
        title="Disputes"
        toolbar={
          <FilterSelect
            label="Dispute status"
            value={filter}
            options={[['active', 'Open and under review'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All disputes']]}
            onChange={(v) => params.set({ status: v === 'active' ? null : v, page: null })}
          />
        }
        columns={['Booking', 'Reason', 'Paid', 'Opened', 'Status', 'Actions']}
        query={disputes}
        rowCount={disputes.data?.rows.length}
        emptyTitle={filter === 'active' ? 'No open disputes' : 'No disputes'}
        pagination={disputes.data && { page, total: disputes.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {disputes.data?.rows.map((d) => (
          <tr key={d.id} className={TR}>
            <td className={TD}>
              <BookingRef number={d.booking?.booking_number} />
              {d.booking && <div className="mt-1"><StatusBadge domain="booking" status={d.booking.status} /></div>}
            </td>
            <td className={`${TD} min-w-64 text-ink-700`}><p className="line-clamp-3 whitespace-pre-line">{d.reason}</p></td>
            <td className={`${TD} whitespace-nowrap`}><Money cents={d.booking?.amount_paid_cents} showCents /></td>
            <td className={`${TD} whitespace-nowrap`}>{formatDateTime(d.created_at)}</td>
            <td className={TD}>
              <StatusBadge domain="dispute" status={d.status} />
              {d.resolution && <p className={`${muted} max-w-56`}>{d.resolution}</p>}
            </td>
            <td className={TD}>
              {(d.status === 'open' || d.status === 'under_review') && (
                <Button size="sm" variant="secondary" onClick={() => setOpen(d)}>Decide</Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {open && <DisputeDialog key={open.id} dispute={open} onClose={() => setOpen(null)} />}
    </>
  );
}

const disputeSchema = z
  .object({
    outcome: z.enum(['under_review', 'resolved', 'dismissed']),
    booking_status: z.enum(['', 'previous', 'completed', 'cancelled']),
    resolution: z.string().trim().max(2000, 'Keep it under 2,000 characters.'),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === 'under_review') return;
    if (!v.booking_status) ctx.addIssue({ code: 'custom', path: ['booking_status'], message: 'Choose what happens to the booking.' });
    if (!v.resolution) ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Explain the decision. Both parties will see it.' });
  });

function DisputeDialog({ dispute, onClose }: { dispute: AdminDispute; onClose: () => void }) {
  const formId = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof disputeSchema>, unknown, z.output<typeof disputeSchema>>({
    resolver: zodResolver(disputeSchema),
    defaultValues: { outcome: dispute.status === 'open' ? 'under_review' : 'resolved', booking_status: '', resolution: dispute.resolution ?? '' },
  });
  const outcome = useWatch({ control, name: 'outcome' });
  const save = useMutation({
    mutationFn: async (v: z.output<typeof disputeSchema>) =>
      unwrap(await supabase.rpc('admin_resolve_dispute', {
        p_dispute_id: dispute.id,
        p_outcome: v.outcome,
        p_resolution: v.resolution,
        p_booking_status: v.booking_status || 'previous', // ignored by the database while under review
      })),
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: ['admin'] });
      toast(v.outcome === 'under_review' ? 'Dispute marked under review' : `Dispute ${v.outcome}`);
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Dispute on ${dispute.booking?.booking_number ?? 'booking'}`}
      description={`Opened ${formatDateTime(dispute.created_at)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={save.isPending}>Save decision</Button>
        </>
      }
    >
      <div className="space-y-4">
        <DetailList
          items={[
            ['Booking status', <StatusBadge domain="booking" status={dispute.booking?.status} />],
            ['Amount paid online', <Money cents={dispute.booking?.amount_paid_cents} showCents />],
          ]}
        />
        <div>
          <p className="text-[13px] text-ink-500">Reason given</p>
          <p className="mt-0.5 text-sm whitespace-pre-line text-ink-900">{dispute.reason}</p>
        </div>
        <form id={formId} onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 border-t border-ink-100 pt-4">
          <Field label="Outcome" required error={errors.outcome}>
            {(p) => (
              <Select {...p} {...register('outcome')}>
                <option value="under_review">Under review (keep open)</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </Select>
            )}
          </Field>
          {outcome !== 'under_review' && (
            <Field label="Booking outcome" required error={errors.booking_status} hint="Cancelling here does not create or send a refund.">
              {(p) => (
                <Select {...p} {...register('booking_status')}>
                  <option value="">Choose…</option>
                  <option value="previous">Return to its status before the dispute</option>
                  <option value="completed">Mark as completed</option>
                  <option value="cancelled">Cancel the booking</option>
                </Select>
              )}
            </Field>
          )}
          <Field
            label={outcome === 'under_review' ? 'Note (optional)' : 'Decision'}
            required={outcome !== 'under_review'}
            hint={outcome === 'under_review' ? 'Saved on the dispute; both parties can see it.' : 'Both parties are notified with this text.'}
            error={errors.resolution}
          >
            {(p) => <Textarea rows={4} {...p} {...register('resolution')} />}
          </Field>
          <FormError message={save.error ? errorMessage(save.error) : null} />
        </form>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reviews and reports
// ---------------------------------------------------------------------------

async function fetchReports(status: string, page: number) {
  let query = supabase.from('reports').select('*', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  const result = await paged(query.order('created_at', { ascending: status === 'open' }).range(...pageRange(page)));
  // Reports point at different tables; load what they refer to so moderators see the subject.
  const idsOf = (type: string) => result.rows.filter((r) => r.entity_type === type).map((r) => r.entity_id);
  const [reviews, pros, services] = await Promise.all([
    supabase.from('reviews').select('id, rating, body, status').in('id', idsOf('review')),
    supabase.from('professional_profiles').select('id, display_name, slug, status').in('id', idsOf('professional')),
    supabase.from('services').select('id, name, status').in('id', idsOf('service')),
  ]);
  const byId = <T extends { id: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.id, r]));
  return { ...result, reviews: byId(unwrap(reviews)), pros: byId(unwrap(pros)), services: byId(unwrap(services)) };
}
type ReportData = Awaited<ReturnType<typeof fetchReports>>;
type AdminReport = ReportData['rows'][number];

function ReportSubject({ report: r, data }: { report: AdminReport; data: ReportData }) {
  const missing = <span className="text-ink-500">Not found (may have been removed)</span>;
  if (r.entity_type === 'review') {
    const review = data.reviews.get(r.entity_id);
    return review ? (
      <div>
        <Stars value={review.rating} />
        <p className="mt-1 line-clamp-2 text-ink-700">{review.body || 'No written comment'}</p>
        <div className="mt-1"><StatusBadge domain="review" status={review.status} /></div>
      </div>
    ) : missing;
  }
  if (r.entity_type === 'professional') {
    const pro = data.pros.get(r.entity_id);
    return pro ? (
      <div>
        <Link to={`/pro/${pro.slug}`} target="_blank" rel="noreferrer" className={linkClass}>{pro.display_name}</Link>
        <div className="mt-1"><StatusBadge domain="profile" status={pro.status} /></div>
      </div>
    ) : missing;
  }
  if (r.entity_type === 'service') {
    const service = data.services.get(r.entity_id);
    return service ? (
      <div>
        <p className="text-ink-900">{service.name}</p>
        <div className="mt-1"><StatusBadge domain="service" status={service.status} /></div>
      </div>
    ) : missing;
  }
  return <span className="font-mono text-xs text-ink-500">{shortId(r.entity_id)}</span>;
}

export function AdminReviewsPage() {
  const params = useListParams();
  const reportStatus = params.get('report', 'open');
  const reportPage = params.page('rpage');
  const reviewStatus = params.get('review');
  const reviewPage = params.page('vpage');
  const [action, setAction] = useState<PendingAction | null>(null);

  const reports = useQuery({ queryKey: ['admin', 'reports', reportStatus, reportPage], queryFn: () => fetchReports(reportStatus, reportPage) });
  const reviews = useQuery({
    queryKey: ['admin', 'reviews', reviewStatus, reviewPage],
    queryFn: () => {
      let query = supabase.from('reviews').select('*, professional:professional_profiles(display_name, slug)', { count: 'exact' });
      if (reviewStatus) query = query.eq('status', reviewStatus);
      return paged(query.order('created_at', { ascending: false }).range(...pageRange(reviewPage)));
    },
  });

  const moderate = async (entityType: string, entityId: string, act: string, note: string) =>
    unwrap(await supabase.rpc('admin_moderate', { p_entity_type: entityType, p_entity_id: entityId, p_action: act, p_note: note }));

  /** Acts on the reported item, then resolves the report with the same note. */
  const actAndResolve = (r: AdminReport, title: string, entityType: string, act: string, success: string): PendingAction => ({
    title,
    description: 'The report is marked resolved with your note afterwards.',
    confirmLabel: title.replace(/\?$/, ''),
    danger: true,
    note: { label: 'Reason', required: true },
    success,
    run: async (note) => {
      await moderate(entityType, r.entity_id, act, note);
      await moderate('report', r.id, 'resolve', note);
    },
  });

  const subjectAction = (r: AdminReport, data: ReportData) => {
    if (r.entity_type === 'review' && data.reviews.get(r.entity_id)?.status === 'published')
      return { label: 'Hide review', action: actAndResolve(r, 'Hide this review?', 'review', 'hide', 'Review hidden and report resolved') };
    const pro = data.pros.get(r.entity_id);
    if (r.entity_type === 'professional' && pro && pro.status !== 'suspended')
      return { label: 'Suspend page', action: actAndResolve(r, `Suspend ${pro.display_name}?`, 'professional', 'suspend', 'Professional suspended and report resolved') };
    const service = data.services.get(r.entity_id);
    if (r.entity_type === 'service' && service?.status === 'active')
      return { label: 'Deactivate service', action: actAndResolve(r, `Deactivate ${service.name}?`, 'service', 'deactivate', 'Service deactivated and report resolved') };
    return null;
  };

  return (
    <>
      <PageHeader title="Reviews & reports" description="Moderate customer reviews and reports about reviews, professionals, services and messages." />
      <div className="space-y-6">
        <DataTable
          title="Reports"
          toolbar={
            <FilterSelect
              label="Report status"
              value={reportStatus}
              options={[['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All reports']]}
              onChange={(v) => params.set({ report: v === 'open' ? null : v, rpage: null })}
            />
          }
          columns={['Reported', 'Subject', 'Reason', 'Date', 'Status', 'Actions']}
          query={reports}
          rowCount={reports.data?.rows.length}
          emptyTitle={reportStatus === 'open' ? 'No open reports' : 'No reports'}
          pagination={reports.data && { page: reportPage, total: reports.data.total, onChange: (p) => params.set({ rpage: p }) }}
        >
          {reports.data?.rows.map((r) => {
            const extra = subjectAction(r, reports.data);
            return (
              <tr key={r.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}><Badge>{humanize(r.entity_type)}</Badge></td>
                <td className={`${TD} min-w-56`}><ReportSubject report={r} data={reports.data} /></td>
                <td className={`${TD} min-w-56 whitespace-pre-line text-ink-700`}>{r.reason}</td>
                <td className={`${TD} whitespace-nowrap`}>{formatDate(r.created_at)}</td>
                <td className={TD}>
                  <StatusBadge domain="report" status={r.status} />
                  {r.resolution_note && <p className={`${muted} max-w-56`}>{r.resolution_note}</p>}
                </td>
                <td className={TD}>
                  {r.status === 'open' && (
                    <div className="flex flex-wrap gap-2">
                      {extra && <Button size="sm" variant="secondary" onClick={() => setAction(extra.action)}>{extra.label}</Button>}
                      <Button size="sm" variant="secondary" onClick={() => setAction({
                        title: 'Resolve this report?',
                        description: 'Use this when the issue has been handled.',
                        confirmLabel: 'Resolve',
                        note: { label: 'Resolution note (optional)' },
                        success: 'Report resolved',
                        run: (note) => moderate('report', r.id, 'resolve', note),
                      })}>
                        Resolve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAction({
                        title: 'Dismiss this report?',
                        description: 'Use this when no action is needed.',
                        confirmLabel: 'Dismiss',
                        note: { label: 'Note (optional)' },
                        success: 'Report dismissed',
                        run: (note) => moderate('report', r.id, 'dismiss', note),
                      })}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>

        <DataTable
          title="Reviews"
          toolbar={
            <FilterSelect label="Review status" value={reviewStatus} options={statusOptions('review', ['published', 'hidden'])} onChange={(v) => params.set({ review: v, vpage: null })} />
          }
          columns={['Review', 'Professional', 'Date', 'Status', 'Actions']}
          query={reviews}
          rowCount={reviews.data?.rows.length}
          emptyTitle="No reviews yet"
          pagination={reviews.data && { page: reviewPage, total: reviews.data.total, onChange: (p) => params.set({ vpage: p }) }}
        >
          {reviews.data?.rows.map((v) => (
            <tr key={v.id} className={TR}>
              <td className={`${TD} min-w-72`}>
                <Stars value={v.rating} />
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-ink-700">{v.body || 'No written comment'}</p>
              </td>
              <td className={`${TD} whitespace-nowrap`}>
                {v.professional ? <Link to={`/pro/${v.professional.slug}`} target="_blank" rel="noreferrer" className={linkClass}>{v.professional.display_name}</Link> : '—'}
              </td>
              <td className={`${TD} whitespace-nowrap`}>{formatDate(v.created_at)}</td>
              <td className={TD}>
                <StatusBadge domain="review" status={v.status} />
                {v.hidden_reason && <p className={`${muted} max-w-56`}>{v.hidden_reason}</p>}
              </td>
              <td className={TD}>
                {v.status === 'published' ? (
                  <Button size="sm" variant="secondary" onClick={() => setAction({
                    title: 'Hide this review?',
                    description: 'It disappears from the professional’s public page and rating.',
                    confirmLabel: 'Hide review',
                    danger: true,
                    note: { label: 'Reason (saved with the review)', required: true },
                    success: 'Review hidden',
                    run: (note) => moderate('review', v.id, 'hide', note),
                  })}>
                    Hide
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setAction({
                    title: 'Publish this review again?',
                    description: 'It becomes visible on the professional’s public page.',
                    confirmLabel: 'Publish',
                    note: { label: 'Note (optional)' },
                    success: 'Review published',
                    run: (note) => moderate('review', v.id, 'publish', note),
                  })}>
                    Publish
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const AUDIT_ENTITIES = [
  'booking', 'contract', 'dispute', 'payment', 'professional', 'quotation', 'refund', 'report', 'review', 'service',
  'service_request', 'setting', 'user', 'verification',
];

export function AdminAuditPage() {
  const params = useListParams();
  const entity = params.get('entity');
  const page = params.page();
  const logs = useQuery({
    queryKey: ['admin', 'audit', entity, page],
    queryFn: () => {
      let query = supabase.from('audit_logs').select('*', { count: 'exact' });
      if (entity) query = query.eq('entity_type', entity);
      return paged(query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(...pageRange(page)));
    },
  });

  return (
    <>
      <PageHeader title="Audit log" description="Every recorded status change and administrator action, newest first." />
      <DataTable
        title="Events"
        description={logs.data ? `${logs.data.total.toLocaleString('en-PH')} events` : undefined}
        toolbar={
          <FilterSelect
            label="Entity type"
            value={entity}
            options={[['', 'All entities'], ...AUDIT_ENTITIES.map((e): [string, string] => [e, humanize(e)])]}
            onChange={(v) => params.set({ entity: v, page: null })}
          />
        }
        columns={['When', 'Entity', 'Action', 'Change', 'Actor', 'Details']}
        query={logs}
        rowCount={logs.data?.rows.length}
        emptyTitle="No events recorded"
        pagination={logs.data && { page, total: logs.data.total, onChange: (p) => params.set({ page: p }) }}
      >
        {logs.data?.rows.map((e) => {
          const meta = JSON.stringify(e.metadata);
          return (
            <tr key={e.id} className={TR}>
              <td className={`${TD} whitespace-nowrap`} title={formatDateTime(e.created_at)}>{formatRelative(e.created_at)}</td>
              <td className={`${TD} whitespace-nowrap`}>
                {humanize(e.entity_type)} <span className="font-mono text-xs text-ink-500">{shortId(e.entity_id)}</span>
              </td>
              <td className={`${TD} whitespace-nowrap font-medium text-ink-900`}>{humanize(e.action)}</td>
              <td className={`${TD} whitespace-nowrap text-ink-700`}>{e.from_status || e.to_status ? `${e.from_status ?? '—'} → ${e.to_status ?? '—'}` : '—'}</td>
              <td className={`${TD} font-mono text-xs whitespace-nowrap text-ink-500`}>{e.actor_id ? shortId(e.actor_id) : 'system'}</td>
              <td className={TD}>
                {meta && meta !== '{}' && meta !== 'null' ? (
                  <details>
                    <summary className="cursor-pointer text-[13px] text-ink-700">Metadata</summary>
                    <pre className="mt-2 max-w-md overflow-x-auto rounded-md bg-ink-50 p-2 text-xs whitespace-pre-wrap break-all text-ink-800">{meta}</pre>
                  </details>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings and plans
// ---------------------------------------------------------------------------

type Plan = Tables<'subscription_plans'>;

export function AdminSettingsPage() {
  const [editing, setEditing] = useState<Plan | null>(null);
  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => unwrap(await supabase.from('platform_settings').select('*').order('key')),
  });
  const plans = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => unwrap(await supabase.from('subscription_plans').select('*').order('sort_order')),
  });

  return (
    <>
      <PageHeader title="Settings" description="Platform-wide configuration. Every change is recorded in the audit log." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Platform settings" description="Values are JSON: text in double quotes, numbers as-is. Changes apply immediately." />
          {settings.isError ? (
            <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
          ) : settings.isPending ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : !settings.data?.length ? (
            <EmptyState title="No settings" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {settings.data.map((s) => <SettingRow key={`${s.key}:${s.updated_at}`} setting={s} />)}
            </ul>
          )}
        </Card>

        <DataTable
          title="Subscription plans"
          toolbar={
            <div className="w-full">
              <Alert tone="warning">Plan prices are illustrative. Paid subscriptions are not enabled yet, so nobody is charged for a plan.</Alert>
            </div>
          }
          columns={['Plan', 'Price', 'Active services', 'Features', 'Status', 'Order', 'Actions']}
          query={plans}
          rowCount={plans.data?.length}
          emptyTitle="No plans"
        >
          {plans.data?.map((p) => (
            <tr key={p.code} className={TR}>
              <td className={TD}>
                <p className="font-medium text-ink-900">{p.name}</p>
                <p className={`${muted} font-mono`}>{p.code}</p>
              </td>
              <td className={`${TD} whitespace-nowrap`}><Money cents={p.price_cents} /> <span className="text-ink-500">/ {p.billing_interval}</span></td>
              <td className={`${TD} tabular-nums`}>{p.max_active_services ?? 'Unlimited'}</td>
              <td className={`${TD} min-w-56 text-ink-700`}>{p.features.length ? p.features.join(' · ') : '—'}</td>
              <td className={TD}>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
              <td className={`${TD} tabular-nums`}>{p.sort_order}</td>
              <td className={TD}><Button size="sm" variant="secondary" onClick={() => setEditing(p)} aria-label={`Edit ${p.name} plan`}>Edit</Button></td>
            </tr>
          ))}
        </DataTable>
      </div>
      {editing && <PlanDialog key={editing.code} plan={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SettingRow({ setting }: { setting: Tables<'platform_settings'> }) {
  const id = useId();
  const initial = JSON.stringify(setting.value, null, 2);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: async (value: Json) => unwrap(await supabase.rpc('admin_update_setting', { p_key: setting.key, p_value: value })),
    onSuccess: async () => {
      toast('Setting saved');
      await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    let value: Json;
    try {
      value = JSON.parse(text) as Json;
    } catch {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate(value);
  };
  return (
    <li className="px-5 py-4">
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={id} className="block font-mono text-[13px] font-medium text-ink-900">{setting.key}</label>
        {setting.description && <p className="text-[13px] text-ink-500">{setting.description}</p>}
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(14, initial.split('\n').length + 1)}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          className="font-mono text-[13px]"
        />
        <FormError message={invalid ? 'This is not valid JSON. Text values need double quotes, e.g. "online".' : save.error ? errorMessage(save.error) : null} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Updated {formatRelative(setting.updated_at)}</p>
          <Button size="sm" type="submit" loading={save.isPending} disabled={text === initial}>Save</Button>
        </div>
      </form>
    </li>
  );
}

const planSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.'),
  description: z.string().trim(),
  price_cents: z.string().transform((v, ctx) => {
    const cents = parsePesosToCents(v);
    if (cents === null) ctx.addIssue({ code: 'custom', message: 'Enter an amount like 499 or 499.50.' });
    return cents ?? 0;
  }),
  max_active_services: z
    .string()
    .trim()
    .regex(/^\d*$/, 'Enter a whole number, or leave blank for unlimited.')
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || v > 0, 'Must be at least 1, or blank for unlimited.'),
  features: z.string().transform((v) => v.split('\n').map((f) => f.trim()).filter(Boolean)),
  is_active: z.boolean(),
  sort_order: z.number({ error: 'Enter a whole number.' }).int('Enter a whole number.'),
});

function PlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const formId = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: plan.name,
      description: plan.description ?? '',
      price_cents: centsToPesoInput(plan.price_cents),
      max_active_services: plan.max_active_services?.toString() ?? '',
      features: plan.features.join('\n'),
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    },
  });
  const save = useMutation({
    mutationFn: async (v: z.output<typeof planSchema>) =>
      unwrap(await supabase.from('subscription_plans').update({ ...v, description: v.description || null }).eq('code', plan.code).select('code').single()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast('Plan updated');
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${plan.name} plan`}
      description="Prices are illustrative until paid subscriptions are enabled."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={save.isPending}>Save changes</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Field label="Name" required error={errors.name}>{(p) => <Input {...p} {...register('name')} />}</Field>
        <Field label="Description" error={errors.description}>{(p) => <Textarea rows={2} {...p} {...register('description')} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Price per ${plan.billing_interval}`} required error={errors.price_cents}>{(p) => <MoneyInput {...p} {...register('price_cents')} />}</Field>
          <Field label="Max active services" hint="Blank means unlimited" error={errors.max_active_services}>
            {(p) => <Input inputMode="numeric" {...p} {...register('max_active_services')} />}
          </Field>
        </div>
        <Field label="Features" hint="One per line" error={errors.features}>{(p) => <Textarea rows={4} {...p} {...register('features')} />}</Field>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Field label="Sort order" hint="Lower numbers come first" error={errors.sort_order}>
            {(p) => <Input type="number" step={1} {...p} {...register('sort_order', { valueAsNumber: true })} />}
          </Field>
          <Checkbox label="Active" description="Inactive plans are hidden outside the admin area." {...register('is_active')} className="pb-2" />
        </div>
        <FormError message={save.error ? errorMessage(save.error) : null} />
      </form>
    </Dialog>
  );
}
