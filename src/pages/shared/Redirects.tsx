import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { ErrorState, PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase, unwrap } from '@/lib/supabase';

type Table = 'conversations' | 'bookings' | 'contracts';

/** Notification links are role-neutral; send the person to the dashboard where they play the matching role. */
function RoleRedirect({ table, section }: { table: Table; section: string }) {
  const { id } = useParams();
  const { user } = useAuth();
  const record = useQuery({
    queryKey: ['redirect', table, id],
    queryFn: async () => unwrap(await supabase.from(table).select('customer_id').eq('id', id!).single()),
  });
  if (record.isPending) return <PageSpinner />;
  if (record.isError) return <div className="p-8"><div className="card"><ErrorState error={record.error} /></div></div>;
  const base = record.data.customer_id === user?.id ? '/dashboard' : '/pro-dashboard';
  return <Navigate to={`${base}/${section}/${id}`} replace />;
}

export const MessageRedirect = () => <RoleRedirect table="conversations" section="messages" />;
export const BookingRedirect = () => <RoleRedirect table="bookings" section="bookings" />;
export const ContractRedirect = () => <RoleRedirect table="contracts" section="contracts" />;
