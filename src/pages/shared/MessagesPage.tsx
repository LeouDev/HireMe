import { ChevronLeft, MessageSquare } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Avatar, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { ChatThread, useConversations } from '@/features/messaging/ChatThread';
import { formatRelative } from '@/lib/format';

type Role = 'customer' | 'professional';


function MessagesPage({ role }: { role: Role }) {
  const { id } = useParams();
  const base = role === 'professional' ? '/pro-dashboard/messages' : '/dashboard/messages';
  const conversations = useConversations();
  // Each dashboard lists the conversations where the caller plays that role.
  const list = (conversations.data ?? []).filter((c) => (role === 'customer' ? c.counterpart_is_professional : !c.counterpart_is_professional));
  const active = conversations.data?.find((c) => c.id === id);

  return (
    <div>
      <PageHeader title="Messages" description={role === 'professional' ? 'Conversations with your customers.' : 'Conversations with professionals.'} />
      <div className="card grid h-[calc(100dvh-15rem)] min-h-[480px] overflow-hidden md:grid-cols-[300px_1fr]">
        <aside className={`${id ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-ink-100`}>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conversations.isPending && Array.from({ length: 4 }, (_, i) => <li key={i} className="p-4"><Skeleton className="h-10" /></li>)}
            {conversations.isError && <li><ErrorState error={conversations.error} onRetry={() => conversations.refetch()} /></li>}
            {!conversations.isPending && list.length === 0 && (
              <li><EmptyState icon={MessageSquare} title="No conversations yet"
                description={role === 'customer' ? 'Message a professional from their page or send a request.' : 'Customers who contact you will appear here.'} /></li>
            )}
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`${base}/${c.id}`} className={`flex gap-3 border-b border-ink-100 px-4 py-3 hover:bg-ink-50 ${c.id === id ? 'bg-ink-50' : ''}`}>
                  <Avatar name={c.counterpart_name} path={c.counterpart_avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${Number(c.unread_count) ? 'font-semibold text-ink-950' : 'font-medium text-ink-900'}`}>{c.counterpart_name || 'Customer'}</span>
                      <span className="shrink-0 text-[11px] text-ink-400">{c.last_message_at ? formatRelative(c.last_message_at) : ''}</span>
                    </span>
                    {c.request_title && <span className="block truncate text-xs text-ink-500">Re: {c.request_title}</span>}
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-500">{c.last_message ?? 'No messages yet'}</span>
                      {Number(c.unread_count) > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-ink-950 px-1.5 text-[10px] font-semibold text-white">{c.unread_count}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className={`${id ? 'flex' : 'hidden md:flex'} min-h-0 flex-col`}>
          {id ? (
            <>
              <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
                <Link to={base} className="rounded p-1 text-ink-500 hover:bg-ink-100 md:hidden" aria-label="Back to conversations"><ChevronLeft className="size-5" /></Link>
                <Avatar name={active?.counterpart_name} path={active?.counterpart_avatar} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-950">{active?.counterpart_name || 'Conversation'}</p>
                  {active?.request_id && (
                    <Link to={`${role === 'professional' ? '/pro-dashboard' : '/dashboard'}/requests/${active.request_id}`} className="block truncate text-xs text-ink-500 hover:underline">
                      Request: {active.request_title}
                    </Link>
                  )}
                </div>
              </header>
              <ChatThread key={id} conversationId={id} className="flex-1" />
            </>
          ) : (
            <div className="m-auto"><EmptyState icon={MessageSquare} title="Select a conversation" /></div>
          )}
        </section>
      </div>
    </div>
  );
}

export const CustomerMessagesPage = () => <MessagesPage role="customer" />;
export const ProMessagesPage = () => <MessagesPage role="professional" />;
