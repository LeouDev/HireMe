import { Compass } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink, EmptyState } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <Seo title="Page not found" noindex />
      <div className="card">
        <EmptyState icon={Compass} title="Page not found" description="The page you're looking for doesn't exist or has moved."
          action={<ButtonLink to="/">Go home</ButtonLink>} />
      </div>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();
  const { user } = useAuth();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  // Lazy chunks can go missing after a new deployment; a reload fetches the current build.
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <EmptyState title={chunkFailed ? 'A new version is available' : 'Something went wrong'}
          description={chunkFailed ? 'Reload the page to continue.' : 'An unexpected error occurred. Try again, and contact support if it keeps happening.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="btn-primary rounded-full px-4 py-2 text-sm font-medium">Reload</button>
              {/* Never leave a signed-in user stuck on a broken page. */}
              {user && (
                <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.assign('/'); }}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-900">Sign out</button>
              )}
            </div>
          } />
      </div>
    </div>
  );
}
