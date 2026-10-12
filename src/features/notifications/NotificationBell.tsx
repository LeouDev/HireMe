import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatRelative } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';

export function useNotifications(limit = 20) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', user?.id, limit],
    enabled: !!user,
    queryFn: async () =>
      unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)),
  });

  // Live updates: RLS limits the stream to the signed-in user's rows.
  // Several components use this hook at once; realtime-js reuses a channel by topic and throws if
  // callbacks are added after subscribe(), so every subscription gets its own topic.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['notifications', user.id] });
        qc.invalidateQueries({ queryKey: ['dashboard-counts'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const markAllRead = async () => {
    await supabase.rpc('mark_all_notifications_read');
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };
  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };
  const unread = (query.data ?? []).filter((n) => !n.read_at).length;
  return { ...query, unread, markAllRead, markRead };
}

export function NotificationBell() {
  const { data, unread, markAllRead, markRead, isPending } = useNotifications(15);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-10 place-items-center rounded-full bg-white/5 text-ink-200 transition-colors hover:bg-white/10 hover:text-white">
        <Bell className="size-[18px]" aria-hidden="true" />
        {unread > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-white ring-2 ring-ink-900" />}
      </button>
      {open && (
        <div className="glass-dense absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl bg-white text-ink-900 shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="font-display text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-ink-600 hover:text-ink-900">Mark all read</button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {isPending && <li className="px-4 py-6 text-center text-sm text-ink-500">Loading…</li>}
            {!isPending && !data?.length && <li className="px-4 py-8 text-center text-sm text-ink-500">You're all caught up.</li>}
            {data?.map((n) => (
              <li key={n.id} className="border-b border-ink-100 last:border-0">
                <Link to={n.link ?? '#'} onClick={() => { setOpen(false); if (!n.read_at) markRead(n.id); }}
                  className={`flex gap-3 px-4 py-3 hover:bg-ink-50 ${n.read_at ? '' : 'bg-ink-50/60'}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-ink-900'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[13px] text-ink-500">{n.body}</span>}
                    <span className="mt-1 block text-xs text-ink-400">{formatRelative(n.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-100 px-4 py-3 text-center text-[13px] font-medium hover:bg-ink-50">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
