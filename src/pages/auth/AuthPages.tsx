import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, MailCheck, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert, Button, Field, FormError, Input, Logo, PageSpinner } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** Only allow same-site relative redirects after sign-in. */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-semibold text-ink-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-600">{subtitle}</p>}
        </div>
        <div className="card p-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-ink-600">{footer}</p>}
      </div>
    </div>
  );
}

const loginSchema = z.object({ email: z.email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, pro, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  const next = safeNext(params.get('next'));

  if (loading) return <PageSpinner />;
  if (user) return <Navigate to={next ?? (pro ? '/pro-dashboard' : '/dashboard')} replace />;

  const onSubmit = async (v: z.infer<typeof loginSchema>) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword(v);
    if (err) return setError(errorMessage(err));
    navigate(next ?? '/dashboard', { replace: true });
  };

  return (
    <AuthCard title="Welcome back" subtitle="Log in to manage your requests, quotes and bookings."
      footer={<>New to Hire Me!? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-ink-950 underline">Create an account</Link></>}>
      <Seo title="Log in" path="/login" />
      {params.get('verified') && <div className="mb-4"><Alert tone="success" title="Email confirmed">You can now log in.</Alert></div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</Field>
        <Field label="Password" error={errors.password}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}</Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-ink-600 hover:text-ink-950">Forgot password?</Link>
        </div>
        <FormError message={error} />
        <Button type="submit" loading={isSubmitting} className="w-full">Log in</Button>
      </form>
    </AuthCard>
  );
}

const registerSchema = z.object({
  intent: z.enum(['hire', 'offer']),
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});

export function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { intent: (params.get('intent') === 'pro' ? 'offer' : 'hire') as 'hire' | 'offer', fullName: '', email: '', password: '' },
  });
  const intent = watch('intent');
  const next = safeNext(params.get('next'));

  if (loading) return <PageSpinner />;
  if (user && !sentTo) return <Navigate to={intent === 'offer' ? '/become-a-pro' : next ?? '/dashboard'} replace />;

  const onSubmit = async (v: z.infer<typeof registerSchema>) => {
    setError(null);
    const after = v.intent === 'offer' ? '/become-a-pro' : next ?? '/dashboard';
    // The role intent only routes the person after sign-up; capabilities are never granted from client data.
    const { data, error: err } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.fullName }, emailRedirectTo: `${env.appUrl}/login?verified=1&next=${encodeURIComponent(after)}` },
    });
    if (err) return setError(errorMessage(err));
    if (data.session) navigate(after, { replace: true });
    else setSentTo(v.email);
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <div className="text-center">
          <MailCheck className="mx-auto size-10 text-ink-900" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink-700">We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account, then log in.</p>
          <p className="mt-3 text-xs text-ink-500">Didn't get it? Check spam, or wait a minute and try registering again.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="One account lets you hire professionals and offer your own services."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-ink-950 underline">Log in</Link></>}>
      <Seo title="Create an account" path="/register" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <fieldset>
          <legend className="label">What brings you here?</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: 'hire', label: 'I want to hire a professional.', icon: Search },
              { value: 'offer', label: 'I want to offer my services.', icon: Briefcase },
            ].map((o) => (
              <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${intent === o.value ? 'border-ink-950 bg-ink-50' : 'border-ink-200 hover:border-ink-300'}`}>
                <input type="radio" value={o.value} {...register('intent')} className="sr-only" />
                <o.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="font-medium text-ink-900">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" error={errors.fullName}>{(p) => <Input {...p} autoComplete="name" {...register('fullName')} />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">{(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}</Field>
        <FormError message={error} />
        <Button type="submit" loading={isSubmitting} className="w-full">Create account</Button>
        <p className="text-center text-xs text-ink-500">
          By creating an account you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.email('Enter a valid email') })) });
  const onSubmit = async ({ email }: { email: string }) => {
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/reset-password` });
    if (err) return setError(errorMessage(err));
    setSent(true);
  };
  return (
    <AuthCard title="Reset your password" footer={<Link to="/login" className="font-medium text-ink-950 underline">Back to log in</Link>}>
      <Seo title="Reset password" noindex />
      {sent ? (
        <Alert tone="success" title="Check your email">If an account exists for that address, we sent a link to reset your password.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</Field>
          <FormError message={error} />
          <Button type="submit" loading={isSubmitting} className="w-full">Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}

const resetSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters').max(72), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema) });
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500); // give the recovery link time to exchange for a session
    return () => clearTimeout(t);
  }, []);
  const onSubmit = async (v: z.infer<typeof resetSchema>) => {
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: v.password });
    if (err) return setError(errorMessage(err));
    navigate('/dashboard', { replace: true });
  };
  if (loading || (!session && !waited)) return <PageSpinner />;
  return (
    <AuthCard title="Choose a new password">
      <Seo title="New password" noindex />
      {!session ? (
        <Alert tone="warning" title="This link is invalid or has expired">
          <Link to="/forgot-password" className="underline">Request a new reset link.</Link>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="New password" error={errors.password}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}</Field>
          <Field label="Confirm password" error={errors.confirm}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}</Field>
          <FormError message={error} />
          <Button type="submit" loading={isSubmitting} className="w-full">Update password</Button>
        </form>
      )}
    </AuthCard>
  );
}
