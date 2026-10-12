import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useCategories } from '@/features/catalog/api';
import { CategoryIcon } from '@/features/catalog/CategoryIcon';

export function CategoriesPage() {
  const { data, isPending, error, refetch } = useCategories();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Seo title="Service categories" path="/categories" description="Browse skilled-service categories: plumbing, electrical, carpentry, air conditioning, painting and more." />
      <h1 className="text-3xl font-semibold text-white">Service categories</h1>
      <p className="mt-2 text-ink-300">Choose a category to see professionals who offer it.</p>
      {error && <div className="card mt-8"><ErrorState error={error} onRetry={() => refetch()} /></div>}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isPending && Array.from({ length: 9 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/10" />)}
        {data?.map((c) => (
          <Link key={c.id} to={`/category/${c.slug}`} className="group flex items-start gap-4 rounded-2xl bg-white p-5 shadow-card transition-transform hover:-translate-y-0.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-900 group-hover:bg-[#fff] group-hover:text-[#0e1218]">
              <CategoryIcon name={c.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between font-display font-semibold text-ink-950">
                {c.name} <ArrowRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              {c.description && <span className="mt-1 block text-sm text-ink-600">{c.description}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
