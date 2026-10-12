import { useState, type FormEvent } from 'react';
import { Avatar, Button, Card, CardHeader, Field, FormError, Input, PageHeader, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { acceptFor, uploadFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export function AccountSettingsPage() {
  const { user, profile, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Enter your full name.');
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user!.id);
    setSaving(false);
    if (err) return setError(errorMessage(err));
    await refresh();
    toast('Profile saved');
  };
  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      const up = await uploadFile('public-media', user!.id, file);
      const { error: err } = await supabase.from('profiles').update({ avatar_path: up.path }).eq('id', user!.id);
      if (err) throw err;
      await refresh();
      toast('Photo updated');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setPwError('Use at least 8 characters.');
    setPwSaving(true);
    setPwError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setPwSaving(false);
    if (err) return setPwError(errorMessage(err));
    setPassword('');
    toast('Password changed');
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Account settings" description="Your personal account, used for both hiring and offering services." />
      <div className="space-y-4">
        <Card>
          <CardHeader title="Profile" description="Your name is shown to professionals you contact. Reviews show your first name and last initial." />
          <form onSubmit={saveProfile} className="space-y-4 px-5 py-4">
            <div className="flex items-center gap-4">
              <Avatar name={profile?.full_name} path={profile?.avatar_path} size="lg" />
              <label className="cursor-pointer rounded-md border border-ink-200 px-3 py-2 text-sm font-medium hover:bg-ink-50">
                Change photo
                <input type="file" accept={acceptFor('public-media')} className="sr-only" onChange={(e) => { uploadAvatar(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
            <Field label="Full name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />}</Field>
            <Field label="Email" hint="Contact support to change your email address.">{(p) => <Input {...p} value={user?.email ?? ''} disabled />}</Field>
            <FormError message={error} />
            <Button type="submit" loading={saving}>Save</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Password" />
          <form onSubmit={changePassword} className="space-y-4 px-5 py-4">
            <Field label="New password" hint="At least 8 characters.">{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>
            <FormError message={pwError} />
            <Button type="submit" variant="secondary" loading={pwSaving}>Change password</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Your data" />
          <p className="px-5 py-4 text-sm text-ink-600">To request a copy or deletion of your personal data, contact support. Some records (signed contracts, payments, audit history) must be kept for legal and accounting reasons.</p>
        </Card>
      </div>
    </div>
  );
}
