// Shared PostgREST select strings (embedded relations are resolved by foreign key name where ambiguous).
export const REQUEST_SELECT =
  '*, service:services(name), professional:professional_profiles(id, display_name, slug, avatar_path, user_id), customer:profiles!service_requests_customer_id_fkey(id, full_name, avatar_path)';
