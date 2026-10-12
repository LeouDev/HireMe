import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '@/lib/supabase';

export const BOOKING_SELECT =
  '*, service:services(name, slug), quotation:quotations(title, quote_number, revision), professional:professional_profiles(id, slug, display_name, business_name, avatar_path, user_id), customer:profiles!bookings_customer_id_fkey(id, full_name, avatar_path)';

export type BookingScope = 'customer' | 'professional' | 'admin';

export function useBookings(scope: BookingScope, opts: { from?: string; to?: string; status?: string[]; limit?: number } = {}) {
  return useQuery({
    queryKey: ['bookings', scope, opts],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      let q = supabase.from('bookings').select(BOOKING_SELECT).order('scheduled_start', { ascending: true });
      if (scope === 'customer') q = q.eq('customer_id', auth.user!.id);
      if (scope === 'professional') {
        const { data: pro } = await supabase.from('professional_profiles').select('id').eq('user_id', auth.user!.id).single();
        q = q.eq('professional_id', pro!.id);
      }
      if (opts.from) q = q.gte('scheduled_start', opts.from);
      if (opts.to) q = q.lt('scheduled_start', opts.to);
      if (opts.status?.length) q = q.in('status', opts.status);
      if (opts.limit) q = q.limit(opts.limit);
      return unwrap(await q);
    },
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['booking', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id!).single()),
  });
}

export type BookingAction =
  | 'start' | 'complete' | 'cancel' | 'approve_cancellation' | 'reject_cancellation'
  | 'propose_reschedule' | 'accept_reschedule' | 'reject_reschedule' | 'dispute';

export function useBookingAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { action: BookingAction; reason?: string; newStart?: string | null }) =>
      unwrap(await supabase.rpc('booking_action', {
        p_booking_id: id, p_action: vars.action, p_reason: vars.reason || undefined, p_new_start: vars.newStart ?? undefined,
      })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['dashboard-counts'] });
    },
  });
}

export function useTimeline(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['timeline', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () =>
      unwrap(await supabase.from('audit_logs').select('*').eq('entity_type', entityType).eq('entity_id', entityId!).order('created_at')),
  });
}

export function useDashboardCounts() {
  return useQuery({
    queryKey: ['dashboard-counts'],
    queryFn: async () => {
      const data = unwrap(await supabase.rpc('dashboard_counts')) as {
        customer: Record<string, number>;
        professional: Record<string, number> | null;
        unread_notifications: number;
      };
      return data;
    },
  });
}
