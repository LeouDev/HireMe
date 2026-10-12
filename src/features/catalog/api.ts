import { useQuery } from '@tanstack/react-query';
import { supabase, unwrap } from '@/lib/supabase';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(await supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order')),
  });
}

export interface SearchParams {
  q?: string;
  category?: string;
  city?: string;
  date?: string;
  minRating?: number;
  maxPriceCents?: number;
  verified?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useProfessionalSearch(p: SearchParams) {
  const pageSize = p.pageSize ?? 12;
  return useQuery({
    queryKey: ['search', p],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('search_professionals', {
        p_query: p.q || undefined,
        p_category: p.category || undefined,
        p_city: p.city || undefined,
        p_date: p.date || undefined,
        p_min_rating: p.minRating || undefined,
        p_max_price_cents: p.maxPriceCents || undefined,
        p_verified_only: p.verified || false,
        p_sort: p.sort || 'relevance',
        p_limit: pageSize,
        p_offset: ((p.page ?? 1) - 1) * pageSize,
      }));
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
  });
}

export function useFavoriteIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async () => new Set(unwrap(await supabase.from('favorites').select('professional_id')).map((f) => f.professional_id)),
  });
}
