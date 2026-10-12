import { useQuery } from '@tanstack/react-query';
import { supabase, unwrap, unwrapMaybe } from '@/lib/supabase';

/** Loads a professional's public page. RLS returns drafts only to their owner (and admins). */
export function useProProfile(slug: string | undefined) {
  return useQuery({
    queryKey: ['pro-profile', slug],
    enabled: !!slug,
    queryFn: async () => {
      const pro = unwrapMaybe(await supabase.from('professional_profiles').select('*').eq('slug', slug!).maybeSingle());
      if (!pro) return null;
      const [categories, services, portfolio, areas, rules] = await Promise.all([
        supabase.from('professional_categories').select('category:service_categories(id, slug, name, icon)').eq('professional_id', pro.id),
        supabase.from('services').select('*, category:service_categories(name)').eq('professional_id', pro.id).eq('status', 'active').order('created_at'),
        supabase.from('portfolio_items').select('*').eq('professional_id', pro.id).order('sort_order').order('created_at', { ascending: false }),
        supabase.from('professional_service_areas').select('*').eq('professional_id', pro.id).order('city'),
        supabase.from('availability_rules').select('*').eq('professional_id', pro.id).order('weekday').order('start_time'),
      ]);
      return {
        pro,
        categories: unwrap(categories).map((c) => c.category).filter((c): c is NonNullable<typeof c> => !!c),
        services: unwrap(services),
        portfolio: unwrap(portfolio),
        areas: unwrap(areas),
        rules: unwrap(rules),
      };
    },
  });
}

export function useProReviews(professionalId: string | undefined, page: number, pageSize = 5) {
  return useQuery({
    queryKey: ['pro-reviews', professionalId, page],
    enabled: !!professionalId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('get_professional_reviews', { p_professional_id: professionalId!, p_limit: pageSize, p_offset: (page - 1) * pageSize }));
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
  });
}
