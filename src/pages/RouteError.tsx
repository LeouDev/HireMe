import { Compass } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink, EmptyState } from '@/components/ui';
import { Seo } from '@/components/Seo';

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
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  // Lazy chunks can go missing after a new deployment; a reload fetches the current build.
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <EmptyState title={chunkFailed ? 'A new version is available' : 'Something went wrong'}
          description={chunkFailed ? 'Reload the page to continue.' : 'An unexpected error occurred. Try again, and contact support if it keeps happening.'}
          action={<button type="button" onClick={() => window.location.reload()} className="rounded-md bg-ink-950 px-4 py-2 text-sm font-medium text-white">Reload</button>} />
      </div>
    </div>
  );
}
