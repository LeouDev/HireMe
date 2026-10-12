import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Images, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, ConfirmDialog, DateInput, Dialog, EmptyState, ErrorState, Field, FormError, Input, PageHeader, PageSpinner, Skeleton, Textarea, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, todayManila } from '@/lib/format';
import { publicUrl } from '@/lib/storage';
import { supabase, unwrap, type PortfolioItem } from '@/lib/supabase';
import { emptyToNull, intField, optionalText } from './helpers';
import { ImageUploader } from './shared';

const schema = z.object({
  title: z.string().trim().min(2, 'Enter at least 2 characters.').max(120, 'Keep this under 120 characters.'),
  description: optionalText(2000),
  images: z.array(z.string()).min(1, 'Add at least one photo.').max(12, 'Up to 12 photos.'),
  completed_on: z.string().refine((v) => v === '' || v <= todayManila(), 'The completion date cannot be in the future.'),
  sort_order: intField(0, 10000),
});

export function PortfolioPage() {
  const { pro } = useAuth();
  return pro ? <Portfolio proId={pro.id} /> : <PageSpinner />;
}

function Portfolio({ proId }: { proId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PortfolioItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PortfolioItem | null>(null);

  const items = useQuery({
    queryKey: ['pro-portfolio', proId],
    queryFn: async () =>
      unwrap(
        await supabase.from('portfolio_items').select('*').eq('professional_id', proId).order('sort_order').order('created_at', { ascending: false }),
      ) ?? [],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['pro-portfolio', proId] });

  const remove = async (item: PortfolioItem) => {
    unwrap(await supabase.from('portfolio_items').delete().eq('id', item.id));
    await invalidate();
    toast('Project deleted');
  };

  const addButton = <Button variant="inverse" onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden="true" />}>Add project</Button>;

  return (
    <>
      <PageHeader title="Portfolio" description="Photos of finished work. Real projects help customers trust you." actions={addButton} />

      {items.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/3] bg-white/5" />)}</div>
      ) : items.error ? (
        <Card><ErrorState error={items.error} onRetry={() => items.refetch()} /></Card>
      ) : items.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Images}
            title="No projects yet"
            description="Add photos of jobs you've completed, with a short description of the work."
            action={<Button onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden="true" />}>Add project</Button>}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.data.map((item) => (
            <li key={item.id}>
              <Card as="article" className="flex h-full flex-col overflow-hidden">
                <img src={publicUrl(item.images[0]) ?? ''} alt="" loading="lazy" className="aspect-[4/3] w-full bg-ink-100 object-cover" />
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="font-display text-[15px] font-semibold text-ink-900">{item.title}</h2>
                  <p className="mt-0.5 text-[13px] text-ink-500">
                    {[item.completed_on && `Completed ${formatDate(item.completed_on)}`, `${item.images.length} photo${item.images.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </p>
                  {item.description && <p className="mt-2 line-clamp-3 text-sm text-ink-700">{item.description}</p>}
                  <div className="mt-auto flex gap-1.5 pt-4">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => setDeleting(item)}>Delete</Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && <PortfolioEditor proId={proId} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={invalidate} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
        title="Delete this project?"
        description={deleting ? `“${deleting.title}” will be removed from your page.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

function PortfolioEditor({ proId, item, onClose, onSaved }: { proId: string; item: PortfolioItem | null; onClose: () => void; onSaved: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { register, control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: item?.title ?? '',
      description: item?.description ?? '',
      images: item?.images ?? [],
      completed_on: item?.completed_on ?? '',
      sort_order: String(item?.sort_order ?? 100),
    },
  });

  const save = useMutation({
    mutationFn: async (v: z.output<typeof schema>) => {
      const row = { ...v, description: emptyToNull(v.description), completed_on: emptyToNull(v.completed_on) };
      return unwrap(
        item
          ? await supabase.from('portfolio_items').update(row).eq('id', item.id)
          : await supabase.from('portfolio_items').insert({ ...row, professional_id: proId }),
      );
    },
    onSuccess: () => {
      onSaved();
      toast(item ? 'Saved' : 'Project added');
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={item ? 'Edit project' : 'Add project'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form={formId} loading={save.isPending}>{item ? 'Save changes' : 'Add project'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        <Field label="Title" required error={errors.title}>
          {(p) => <Input {...p} maxLength={120} {...register('title')} />}
        </Field>
        <Field label="Description" error={errors.description} hint="What was the job, and what did you do?">
          {(p) => <Textarea {...p} rows={4} maxLength={2000} {...register('description')} />}
        </Field>
        <Controller
          control={control}
          name="images"
          render={({ field }) => (
            <ImageUploader label="Photos" max={12} value={field.value} onChange={field.onChange} error={errors.images?.message} thumbClassName="aspect-[4/3]" hint="The first photo is the cover. JPG, PNG or WebP, up to 5 MB each. 1 to 12 photos." />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Completed on" error={errors.completed_on} hint="Optional">
            {(p) => <DateInput {...p} max={todayManila()} {...register('completed_on')} />}
          </Field>
          <Field label="Display order" error={errors.sort_order} hint="Lower numbers appear first.">
            {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={10000} {...register('sort_order')} />}
          </Field>
        </div>
        <FormError message={save.error ? errorMessage(save.error) : null} />
      </form>
    </Dialog>
  );
}
