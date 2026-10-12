import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type ProfessionalProfile, type Profile } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  pro: ProfessionalProfile | null;
  /** Read from user_roles for UI only; every admin action is re-authorized in the database. */
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id;
  const account = useQuery({
    queryKey: ['account', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [profile, pro, roles] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId!).maybeSingle(),
        supabase.from('professional_profiles').select('*').eq('user_id', userId!).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId!),
      ]);
      if (profile.error) throw profile.error;
      if (pro.error) throw pro.error;
      return { profile: profile.data, pro: pro.data, isAdmin: (roles.data ?? []).some((r) => r.role === 'admin') };
    },
  });

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile: account.data?.profile ?? null,
    pro: account.data?.pro ?? null,
    isAdmin: account.data?.isAdmin ?? false,
    loading: !ready || (!!userId && account.isPending),
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['account', userId] });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
