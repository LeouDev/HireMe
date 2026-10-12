import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ButtonLink, EmptyState, PageSpinner } from '@/components/ui';
import { useAuth } from './AuthProvider';

/** Client-side routing guard for UX only. Data access is enforced by RLS and database functions. */
export function RequireAuth({ children, role }: { children: ReactNode; role?: 'professional' | 'admin' }) {
  const { user, pro, isAdmin, loading, profile } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (profile?.is_suspended) {
    return (
      <EmptyState icon={ShieldAlert} title="Your account is suspended" description={profile.suspended_reason ?? 'Contact support for help.'}
        action={<ButtonLink to="/help" variant="secondary">Help center</ButtonLink>} className="min-h-[60vh]" />
    );
  }
  if (role === 'professional' && !pro) return <Navigate to="/become-a-pro" replace />;
  if (role === 'admin' && !isAdmin) {
    return (
      <EmptyState icon={ShieldAlert} title="Administrator access required" description="Your account does not have access to this area."
        action={<ButtonLink to="/" variant="secondary">Go home</ButtonLink>} className="min-h-[60vh]" />
    );
  }
  return <>{children}</>;
}
