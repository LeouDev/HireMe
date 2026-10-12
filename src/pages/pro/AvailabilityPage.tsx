import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, Copy, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardHeader, Checkbox, ConfirmDialog, DateInput, EmptyState, ErrorState, Field, FormError, Input, PageHeader, PageSpinner, Skeleton, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatTime, formatWeekday, TIME_ZONE, todayManila } from '@/lib/format';
import { supabase, unwrap, type ProfessionalProfile, type Tables } from '@/lib/supabase';
import { formatClock, intField, optionalText, windowsOverlap } from './helpers';

type Rule = Pick<Tables<'availability_rules'>, 'id' | 'weekday' | 'start_time' | 'end_time'>;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const hhmm = (t: string) => t.slice(0, 5);
const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

export function AvailabilityPage() {
  const { pro } = useAuth();
  return pro ? <Availability pro={pro} /> : <PageSpinner />;
}

function Availability({ pro }: { pro: ProfessionalProfile }) {
  return (
    <>
      <PageHeader title="Availability" description="Set when customers can book you. All times are in Philippine time (Asia/Manila)." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
          <WeeklyHoursCard proId={pro.id} />
          <TimeOffCard proId={pro.id} />
        </div>
        <div className="min-w-0 space-y-4">
          <BookingSettingsCard pro={pro} />
          <SlotPreviewCard pro={pro} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Weekly hours (availability_rules is insert/delete only: editing = insert new, then delete old)
// ---------------------------------------------------------------------------

function useInvalidateAvailability(proId: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['pro-rules', proId] }),
    qc.invalidateQueries({ queryKey: ['pro-slots', proId] }),
  ]);
}

function WeeklyHoursCard({ proId }: { proId: string }) {
  const toast = useToast();
  const invalidate = useInvalidateAvailability(proId);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const rules = useQuery({
    queryKey: ['pro-rules', proId],
    queryFn: async () =>
      unwrap(await supabase.from('availability_rules').select('id, weekday, start_time, end_time').eq('professional_id', proId).order('weekday').order('start_time')) ?? [],
  });
  const all = rules.data ?? [];
  const monday = all.filter((r) => r.weekday === 1);

  const copyMonday = async () => {
    const old = all.filter((r) => r.weekday >= 2 && r.weekday <= 5).map((r) => r.id);
    const rows = [2, 3, 4, 5].flatMap((weekday) => monday.map((m) => ({ professional_id: proId, weekday, start_time: m.start_time, end_time: m.end_time })));
    try {
      // Insert first, then delete: a failure never leaves the weekdays empty.
      unwrap(await supabase.from('availability_rules').insert(rows));
      if (old.length) unwrap(await supabase.from('availability_rules').delete().in('id', old));
    } finally {
      await invalidate();
    }
    toast('Monday hours copied to Tuesday–Friday');
  };

  return (
    <Card as="section">
      <CardHeader
        title="Weekly hours"
        description="Add one or more time windows per day. Gaps between windows act as breaks."
        actions={
          <Button size="sm" variant="secondary" disabled={monday.length === 0} onClick={() => setConfirmCopy(true)} icon={<Copy className="size-4" aria-hidden="true" />}>
            Copy Monday to weekdays
          </Button>
        }
      />
      {rules.isPending ? (
        <div className="space-y-3 p-5">{DAY_ORDER.map((d) => <Skeleton key={d} className="h-8" />)}</div>
      ) : rules.error ? (
        <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
      ) : (
        <>
          {all.length === 0 && (
            <p className="border-b border-ink-100 bg-ink-50 px-5 py-3 text-[13px] text-ink-600">
              You have no weekly hours yet, so customers can't pick a time. Add hours for the days you work.
            </p>
          )}
          <ul className="divide-y divide-ink-100">
            {DAY_ORDER.map((d) => (
              <DayRow key={d} proId={proId} weekday={d} windows={all.filter((r) => r.weekday === d)} onChanged={invalidate} />
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        onConfirm={copyMonday}
        title="Copy Monday's hours?"
        description="Tuesday to Friday will be replaced with Monday's hours. Weekend hours stay as they are."
        confirmLabel="Copy hours"
      />
    </Card>
  );
}

function DayRow({ proId, weekday, windows, onChanged }: { proId: string; weekday: number; windows: Rule[]; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [form, setForm] = useState<{ replacing: Rule | null } | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('availability_rules').delete().eq('id', id)),
    onSettled: onChanged,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start">
      <p className="w-28 shrink-0 pt-1.5 text-sm font-medium text-ink-900">{DAY_NAMES[weekday]}</p>
      <div className="min-w-0 flex-1 space-y-3">
        {windows.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {windows.map((w) => {
              const label = `${formatClock(w.start_time)} – ${formatClock(w.end_time)}`;
              return (
                <li key={w.id} className={`inline-flex items-center rounded-full border text-sm ${form?.replacing?.id === w.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-ink-50 text-ink-800'}`}>
                  <button type="button" onClick={() => setForm({ replacing: w })} className="py-1 pl-3 pr-1 tabular-nums" aria-label={`Edit ${DAY_NAMES[weekday]} ${label}`}>
                    {label}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(w.id)}
                    disabled={remove.isPending && remove.variables === w.id}
                    className="mr-1 grid size-6 place-items-center rounded-full opacity-70 hover:bg-ink-200 hover:opacity-100"
                    aria-label={`Remove ${DAY_NAMES[weekday]} ${label}`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          !form && <p className="pt-1.5 text-sm text-ink-500">Unavailable</p>
        )}
        {form ? (
          <WindowForm
            key={form.replacing?.id ?? 'new'}
            proId={proId}
            weekday={weekday}
            replacing={form.replacing}
            others={windows.filter((w) => w.id !== form.replacing?.id)}
            onDone={async () => {
              setForm(null);
              await onChanged();
            }}
            onCancel={() => setForm(null)}
          />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setForm({ replacing: null })} icon={<Plus className="size-4" aria-hidden="true" />} className="-ml-3">
            Add hours
          </Button>
        )}
      </div>
    </li>
  );
}

const timeRe = /^\d{2}:\d{2}/;

function windowSchema(others: Rule[]) {
  return z
    .object({
      start: z.string().regex(timeRe, 'Enter a start time.'),
      end: z.string().regex(timeRe, 'Enter an end time.'),
    })
    .refine((v) => hhmm(v.end) > hhmm(v.start), { message: 'The end time must be after the start time.', path: ['end'] })
    .refine((v) => !others.some((o) => windowsOverlap(v, { start: o.start_time, end: o.end_time })), {
      message: 'This overlaps another window on this day.',
      path: ['end'],
    });
}

function WindowForm({ proId, weekday, replacing, others, onDone, onCancel }: {
  proId: string; weekday: number; replacing: Rule | null; others: Rule[]; onDone: () => Promise<void>; onCancel: () => void;
}) {
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(windowSchema(others)),
    defaultValues: { start: replacing ? hhmm(replacing.start_time) : '08:00', end: replacing ? hhmm(replacing.end_time) : '17:00' },
  });
  const save = useMutation({
    mutationFn: async (v: { start: string; end: string }) => {
      unwrap(await supabase.from('availability_rules').insert({ professional_id: proId, weekday, start_time: v.start, end_time: v.end }));
      if (replacing) unwrap(await supabase.from('availability_rules').delete().eq('id', replacing.id));
    },
    onSuccess: async () => {
      await onDone();
      toast('Saved');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="rounded-lg border border-ink-200 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,160px))_auto] sm:items-start">
        <Field label="From" error={errors.start}>
          {(p) => <Input {...p} type="time" step={300} {...register('start')} />}
        </Field>
        <Field label="To" error={errors.end}>
          {(p) => <Input {...p} type="time" step={300} {...register('end')} />}
        </Field>
        <div className="col-span-2 flex gap-2 sm:col-span-1 sm:mt-6">
          <Button type="submit" size="sm" loading={save.isPending} className="h-10">{replacing ? 'Update' : 'Add'}</Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={save.isPending} className="h-10">Cancel</Button>
        </div>
      </div>
      <div className="mt-2 empty:hidden"><FormError message={save.error ? errorMessage(save.error) : null} /></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Booking settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  slot_minutes: intField(15, 480),
  min_notice_hours: intField(0, 720),
  booking_window_days: intField(1, 365),
});

function BookingSettingsCard({ pro }: { pro: ProfessionalProfile }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateAvailability(pro.id);
  const toForm = (p: ProfessionalProfile) => ({
    slot_minutes: String(p.slot_minutes),
    min_notice_hours: String(p.min_notice_hours),
    booking_window_days: String(p.booking_window_days),
  });
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: toForm(pro),
  });
  const save = useMutation({
    mutationFn: async (v: z.output<typeof settingsSchema>) =>
      unwrap(await supabase.from('professional_profiles').update(v).eq('id', pro.id).select().single()),
    onSuccess: async (row) => {
      if (row) reset(toForm(row));
      await Promise.all([refresh(), invalidate()]);
      toast('Saved');
    },
  });

  return (
    <Card as="section">
      <CardHeader title="Booking settings" />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4 p-5">
        <Field label="Slot length (minutes)" error={errors.slot_minutes} hint="Customers see start times at this interval. 15 to 480.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={15} max={480} step={15} {...register('slot_minutes')} />}
        </Field>
        <Field label="Minimum notice (hours)" error={errors.min_notice_hours} hint="How far ahead a booking must be made. 0 to 720.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={720} {...register('min_notice_hours')} />}
        </Field>
        <Field label="Booking window (days)" error={errors.booking_window_days} hint="How far into the future customers can book. 1 to 365.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={365} {...register('booking_window_days')} />}
        </Field>
        <div>
          <p className="label">Time zone</p>
          <p className="text-sm text-ink-900">{pro.timezone} (Philippine Time, UTC+8)</p>
        </div>
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>Save settings</Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time off (availability_exceptions)
// ---------------------------------------------------------------------------

const timeOffSchema = z
  .object({
    on_date: z.string().min(1, 'Choose a date.').refine((v) => v >= todayManila(), 'Choose today or a later date.'),
    whole_day: z.boolean(),
    start: z.string(),
    end: z.string(),
    reason: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.whole_day) return;
    if (!timeRe.test(v.start)) ctx.addIssue({ code: 'custom', path: ['start'], message: 'Enter a start time.' });
    if (!timeRe.test(v.end)) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Enter an end time.' });
    else if (timeRe.test(v.start) && hhmm(v.end) <= hhmm(v.start)) ctx.addIssue({ code: 'custom', path: ['end'], message: 'The end time must be after the start time.' });
  });

function TimeOffCard({ proId }: { proId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayManila();
  const exceptions = useQuery({
    queryKey: ['pro-exceptions', proId, today],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('availability_exceptions')
          .select('id, on_date, start_time, end_time, reason')
          .eq('professional_id', proId)
          .gte('on_date', today)
          .order('on_date')
          .order('start_time', { nullsFirst: true }),
      ) ?? [],
  });
  const invalidate = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['pro-exceptions', proId] }),
    qc.invalidateQueries({ queryKey: ['pro-slots', proId] }),
  ]);

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(timeOffSchema),
    defaultValues: { on_date: '', whole_day: true, start: '', end: '', reason: '' },
  });
  const wholeDay = useWatch({ control, name: 'whole_day' });

  const add = useMutation({
    mutationFn: async (v: z.output<typeof timeOffSchema>) =>
      unwrap(await supabase.from('availability_exceptions').insert({
        professional_id: proId,
        on_date: v.on_date,
        start_time: v.whole_day ? null : v.start,
        end_time: v.whole_day ? null : v.end,
        reason: v.reason || null,
      })),
    onSuccess: async () => {
      reset();
      await invalidate();
      toast('Time off added');
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('availability_exceptions').delete().eq('id', id)),
    onSettled: invalidate,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Card as="section">
      <CardHeader title="Time off" description="Block whole days or part of a day, such as holidays or appointments." />
      {exceptions.isPending ? (
        <div className="space-y-2 p-5"><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
      ) : exceptions.error ? (
        <ErrorState error={exceptions.error} onRetry={() => exceptions.refetch()} />
      ) : exceptions.data.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No upcoming time off" className="py-8" />
      ) : (
        <ul className="divide-y divide-ink-100">
          {exceptions.data.map((x) => {
            const when = x.start_time && x.end_time ? `${formatClock(x.start_time)} – ${formatClock(x.end_time)}` : 'Whole day';
            return (
              <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{formatWeekday(x.on_date)}, {x.on_date.slice(0, 4)} · <span className="font-normal">{when}</span></p>
                  {x.reason && <p className="truncate text-[13px] text-ink-500">{x.reason}</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove.mutate(x.id)}
                  loading={remove.isPending && remove.variables === x.id}
                  aria-label={`Remove time off on ${formatWeekday(x.on_date)}`}
                >
                  {!(remove.isPending && remove.variables === x.id) && <X className="size-4" aria-hidden="true" />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={handleSubmit((v) => add.mutate(v))} noValidate className="space-y-4 border-t border-ink-100 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required error={errors.on_date}>
            {(p) => <DateInput {...p} min={today} {...register('on_date')} />}
          </Field>
          <Field label="Reason" error={errors.reason} hint="Optional. Only you can see this.">
            {(p) => <Input {...p} maxLength={200} {...register('reason')} />}
          </Field>
        </div>
        <Checkbox label="Whole day" {...register('whole_day')} />
        {!wholeDay && (
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Field label="From" required error={errors.start}>
              {(p) => <Input {...p} type="time" step={300} {...register('start')} />}
            </Field>
            <Field label="To" required error={errors.end}>
              {(p) => <Input {...p} type="time" step={300} {...register('end')} />}
            </Field>
          </div>
        )}
        <FormError message={add.error ? errorMessage(add.error) : null} />
        <Button type="submit" variant="secondary" loading={add.isPending} icon={<Plus className="size-4" aria-hidden="true" />}>Add time off</Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preview of bookable start times (what customers see)
// ---------------------------------------------------------------------------

function SlotPreviewCard({ pro }: { pro: ProfessionalProfile }) {
  const from = todayManila();
  const days = Array.from({ length: 7 }, (_, i) => todayManila(i));
  const slots = useQuery({
    queryKey: ['pro-slots', pro.id, pro.slot_minutes, from],
    queryFn: async () =>
      unwrap(await supabase.rpc('get_available_slots', {
        p_professional_id: pro.id, p_from: from, p_to: todayManila(6), p_duration_minutes: pro.slot_minutes,
      })) ?? [],
  });

  return (
    <Card as="section">
      <CardHeader
        title="Next 7 days"
        description={`Start times customers can book for a ${pro.slot_minutes}-minute slot, after notice, time off and existing bookings.`}
      />
      {slots.isPending ? (
        <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : slots.error ? (
        <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
      ) : slots.data.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No bookable times" description="Add weekly hours, or check your minimum notice and time off." className="py-8" />
      ) : (
        <ul className="divide-y divide-ink-100">
          {days.map((day) => {
            const times = slots.data.filter((iso) => manilaDate.format(new Date(iso)) === day);
            return (
              <li key={day} className="px-5 py-3">
                <p className="text-[13px] font-medium text-ink-900">{formatWeekday(day)}</p>
                {times.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {times.map((iso) => (
                      <li key={iso} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs tabular-nums text-ink-800">{formatTime(iso)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-[13px] text-ink-500">No open times</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
