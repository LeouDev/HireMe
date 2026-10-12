import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Check, FileSignature, Link2, MessageSquare, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Alert, Button, ButtonLink, Field, FormError, Input } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatPHP } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

const schema = z.object({
  displayName: z.string().trim().min(2, 'Enter the name customers will see').max(80),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens').max(50).optional(),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

export function BecomeProPage() {
  const { user, pro, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { displayName: '', city: '', slug: '' } });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => unwrap(await supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order')),
  });
  const preview = watch('slug') || slugify(watch('displayName')) || 'your-business';

  const onSubmit = async (v: z.infer<typeof schema>) => {
    setError(null);
    const { error: err } = await supabase.rpc('become_professional', { p_display_name: v.displayName, p_city: v.city, p_slug: v.slug || undefined });
    if (err) return setError(errorMessage(err));
    await refresh();
    navigate('/pro-dashboard/profile?welcome=1');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Seo title="Become a professional" path="/become-a-pro"
        description="Create your free professional page, list your services and prices, and manage inquiries, quotations, contracts and bookings in one place." />
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[13px] font-medium tracking-wide text-ink-400 uppercase">For skilled professionals</p>
          <h1 className="mt-2 text-4xl font-semibold text-white">Your skills deserve more than a Facebook post.</h1>
          <p className="mt-4 text-lg text-ink-300">Build your professional page, get customers, send quotations and manage your business online.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Link2, t: 'Shareable page', b: `${env.appUrl.replace(/^https?:\/\//, '')}/pro/your-name` },
              { icon: MessageSquare, t: 'Customer inquiries', b: 'Requests with photos, in one inbox.' },
              { icon: FileSignature, t: 'Quotes & contracts', b: 'Itemized quotations and e-signing.' },
              { icon: CalendarDays, t: 'Bookings', b: 'Availability, schedule and job status.' },
            ].map((x) => (
              <li key={x.t} className="rounded-2xl bg-white p-4 shadow-card">
                <x.icon className="size-5" aria-hidden="true" />
                <p className="mt-2 font-medium text-ink-950">{x.t}</p>
                <p className="text-sm break-all text-ink-600">{x.b}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="card self-start rounded-2xl p-6">
          {pro ? (
            <div>
              <h2 className="text-xl font-semibold">You already have a professional page</h2>
              <p className="mt-2 text-sm text-ink-600">Manage your services, requests and bookings from your dashboard.</p>
              <ButtonLink to="/pro-dashboard" className="mt-5 w-full">Go to professional dashboard</ButtonLink>
            </div>
          ) : user ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <h2 className="text-xl font-semibold">Create your professional page</h2>
              <p className="text-sm text-ink-600">You can change everything later. Your page stays private until you publish it.</p>
              <Field label="Name customers will see" error={errors.displayName} hint="Your name or business name.">
                {(p) => <Input {...p} {...register('displayName')} placeholder="e.g. Juan Plumbing Services" />}
              </Field>
              <Field label="City" error={errors.city}>{(p) => <Input {...p} {...register('city')} placeholder="e.g. Cebu City" />}</Field>
              <Field label="Page address (optional)" error={errors.slug} hint={<>Your link: <span className="font-medium text-ink-800">/pro/{preview}</span>. If taken, we'll add a number.</>}>
                {(p) => <Input {...p} {...register('slug')} placeholder={slugify(watch('displayName')) || 'juan-plumbing'} />}
              </Field>
              <FormError message={error} />
              <Button type="submit" loading={isSubmitting} className="w-full">Create my page</Button>
            </form>
          ) : (
            <div>
              <h2 className="text-xl font-semibold">Start free</h2>
              <p className="mt-2 text-sm text-ink-600">Create an account, then set up your page in a few minutes. Already hiring on Hire Me!? Use the same account.</p>
              <div className="mt-5 grid gap-2">
                <ButtonLink to="/register?intent=pro">Create an account</ButtonLink>
                <ButtonLink to="/login?next=%2Fbecome-a-pro" variant="secondary">I already have an account</ButtonLink>
              </div>
            </div>
          )}
        </div>
      </div>

      <section id="plans" className="mt-20 scroll-mt-24 pt-1">
        <h2 className="text-2xl font-semibold text-white">Plans</h2>
        <p className="mt-2 text-ink-300">Start on Free. Paid plans are planned; prices below are illustrative and not yet available for purchase.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.data?.map((p) => (
            <div key={p.code} className={`rounded-[24px] p-6 ${p.code === 'professional' ? 'glass text-white' : 'bg-white text-ink-950 shadow-card'}`}>
              <h3 className="font-display text-lg font-semibold">{p.name}</h3>
              <p className={`mt-1 text-sm ${p.code === 'professional' ? 'text-ink-300' : 'text-ink-600'}`}>{p.description}</p>
              <p className="mt-4 font-display text-3xl font-semibold">{p.price_cents ? formatPHP(p.price_cents) : 'Free'}{p.price_cents > 0 && <span className="text-sm font-normal opacity-70">/{p.billing_interval}</span>}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4"><Alert tone="neutral">Marketplace transaction fees are not charged at launch. Customers pay the price agreed with you in your quotation.</Alert></div>
      </section>
    </div>
  );
}
