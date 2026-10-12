import { SlidersHorizontal, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Checkbox, EmptyState, ErrorState, Input, MoneyInput, Pagination, Select } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useCategories, useProfessionalSearch } from '@/features/catalog/api';
import { ProCard, ProCardSkeleton } from '@/features/catalog/ProCard';
import { todayManila } from '@/lib/format';
import { centsToPesoInput, parsePesosToCents } from '@shared/money';

const PAGE_SIZE = 12;

export function ExplorePage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: categories } = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const category = slug ?? params.get('category') ?? '';
  const filters = {
    q: params.get('q') ?? '',
    category,
    city: params.get('city') ?? '',
    date: params.get('date') ?? '',
    minRating: Number(params.get('rating')) || undefined,
    maxPriceCents: Number(params.get('max')) || undefined,
    verified: params.get('verified') === '1',
    sort: params.get('sort') ?? 'relevance',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: PAGE_SIZE,
  };
  const search = useProfessionalSearch(filters);
  const categoryName = categories?.find((c) => c.slug === category)?.name;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const hasFilters = !!(filters.q || filters.city || filters.date || filters.minRating || filters.maxPriceCents || filters.verified || (!slug && category));

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    update({ q: String(form.get('q') ?? '').trim(), city: String(form.get('city') ?? '').trim(), date: String(form.get('date') ?? '') });
  };

  const title = categoryName ? `${categoryName} professionals` : 'Explore professionals';

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Seo title={title} path={slug ? `/category/${slug}` : '/explore'}
        description={categoryName ? `Find ${categoryName.toLowerCase()} professionals near you. Compare profiles, request quotes and book.` : 'Search skilled professionals by service, city and availability.'} />
      <h1 className="text-3xl font-semibold text-ink-950">{title}</h1>

      <form key={`${filters.q}|${filters.city}|${filters.date}`} onSubmit={submitSearch} role="search" className="mt-6 grid gap-2 rounded-xl border border-ink-200/70 bg-white p-2 shadow-card sm:grid-cols-[1.4fr_1fr_0.8fr_auto]">
        <label className="sr-only" htmlFor="q">Service or keyword</label>
        <Input id="q" name="q" defaultValue={filters.q} placeholder="Service, skill or name" className="border-0 shadow-none" />
        <label className="sr-only" htmlFor="city">City or area</label>
        <Input id="city" name="city" defaultValue={filters.city} placeholder="City or service area" className="border-0 shadow-none sm:border-l" />
        <label className="sr-only" htmlFor="date">Preferred date</label>
        <Input id="date" name="date" type="date" min={todayManila()} defaultValue={filters.date} className="border-0 shadow-none" />
        <Button type="submit">Search</Button>
      </form>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} space-y-6 lg:block`} aria-label="Filters">
          <div>
            <label className="label" htmlFor="category">Category</label>
            <Select id="category" value={category} disabled={!!slug} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="max">Maximum starting price</label>
            <MoneyInput id="max" key={filters.maxPriceCents ?? 'none'} defaultValue={centsToPesoInput(filters.maxPriceCents)} placeholder="Any"
              onBlur={(e) => update({ max: e.target.value ? String(parsePesosToCents(e.target.value) ?? '') : null })} />
            <p className="mt-1 text-xs text-ink-500">Quote-only professionals are hidden when set.</p>
          </div>
          <div>
            <label className="label" htmlFor="rating">Minimum rating</label>
            <Select id="rating" value={filters.minRating ?? ''} onChange={(e) => update({ rating: e.target.value })}>
              <option value="">Any rating</option>
              <option value="4.5">4.5 and up</option>
              <option value="4">4.0 and up</option>
              <option value="3">3.0 and up</option>
            </Select>
          </div>
          <Checkbox label="Identity verified only" checked={filters.verified} onChange={(e) => update({ verified: e.target.checked ? '1' : null })} />
          {hasFilters && (
            <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-950">
              <X className="size-4" aria-hidden="true" /> Clear filters
            </button>
          )}
        </aside>

        <section aria-live="polite" aria-busy={search.isFetching}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              {search.isPending ? 'Searching…' : `${search.data?.total ?? 0} professional${search.data?.total === 1 ? '' : 's'} found`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} icon={<SlidersHorizontal className="size-4" />} aria-expanded={filtersOpen}>
                Filters
              </Button>
              <label htmlFor="sort" className="sr-only">Sort by</label>
              <Select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className="h-9 w-auto py-1 text-sm">
                <option value="relevance">Most relevant</option>
                <option value="rating">Highest rated</option>
                <option value="price">Lowest starting price</option>
                <option value="recent">Recently active</option>
              </Select>
            </div>
          </div>

          {search.isError ? (
            <div className="card"><ErrorState error={search.error} onRetry={() => search.refetch()} /></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {search.isPending && Array.from({ length: 6 }, (_, i) => <ProCardSkeleton key={i} />)}
              {search.data?.rows.map((p) => <ProCard key={p.id} pro={p} />)}
            </div>
          )}
          {!search.isPending && !search.isError && search.data?.rows.length === 0 && (
            <div className="card">
              <EmptyState title="No professionals match your search" description="Try a different keyword, a nearby city, or clear some filters."
                action={hasFilters ? <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button> : undefined} />
            </div>
          )}
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={search.data?.total ?? 0} onChange={(p) => update({ page: String(p) })} />
        </section>
      </div>
    </div>
  );
}
