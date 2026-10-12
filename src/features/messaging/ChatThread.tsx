import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, ErrorState, Spinner, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatTime } from '@/lib/format';
import { acceptFor, signedUrl, uploadFile, validateFile, type UploadedFile } from '@/lib/storage';
import { supabase, unwrap, type Message } from '@/lib/supabase';

type Attachment = Pick<UploadedFile, 'path' | 'name' | 'mime' | 'size'>;

export function useConversations() {
  return useQuery({ queryKey: ['conversations'], queryFn: async () => unwrap(await supabase.rpc('my_conversations')) });
}

export function useMessages(conversationId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async () =>
      unwrap(await supabase.from('messages').select('*').eq('conversation_id', conversationId!).order('created_at').limit(500)),
  });
  useEffect(() => {
    if (!conversationId) return;
    // Realtime respects RLS: only participants receive these events. Unique topic: see useNotifications.
    const channel = supabase
      .channel(`messages:${conversationId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        qc.setQueryData<Message[]>(['messages', conversationId], (old) =>
          old && !old.some((m) => m.id === (payload.new as Message).id) ? [...old, payload.new as Message] : old);
        qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);
  return query;
}

export function ChatThread({ conversationId, className = '' }: { conversationId: string; className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const messages = useMessages(conversationId);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
    if (messages.data?.length) {
      supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }).then(() => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
      });
    }
  }, [messages.data?.length, conversationId, qc]);

  const pick = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    try {
      await Promise.all(picked.map((f) => validateFile('message-files', f)));
      setFiles((prev) => [...prev, ...picked].slice(0, 5));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() && !files.length) return;
    setSending(true);
    try {
      const attachments: Attachment[] = [];
      for (const f of files) {
        const up = await uploadFile('message-files', conversationId, f);
        attachments.push({ path: up.path, name: up.name, mime: up.mime, size: up.size });
      }
      const { data, error } = await supabase.from('messages')
        .insert({ conversation_id: conversationId, sender_id: user!.id, body: body.trim(), attachments: attachments as never })
        .select().single();
      if (error) throw error;
      qc.setQueryData<Message[]>(['messages', conversationId], (old) => (old && !old.some((m) => m.id === data.id) ? [...old, data] : old));
      setBody('');
      setFiles([]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.isPending && <div className="flex justify-center py-10 text-ink-400"><Spinner /></div>}
        {messages.isError && <ErrorState error={messages.error} onRetry={() => messages.refetch()} />}
        {messages.data?.length === 0 && <p className="py-10 text-center text-sm text-ink-500">No messages yet. Say hello and describe what you need.</p>}
        {messages.data?.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const prev = messages.data[i - 1];
          const showDate = !prev || new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString();
          const atts = (Array.isArray(m.attachments) ? m.attachments : []) as unknown as Attachment[];
          return (
            <div key={m.id}>
              {showDate && <p className="my-3 text-center text-[11px] text-ink-400">{formatDateTime(m.created_at).split(',').slice(0, 2).join(',')}</p>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-ink-950 text-white' : 'rounded-bl-md bg-ink-100 text-ink-900'}`}>
                  {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
                  {atts.map((a) => <AttachmentLink key={a.path} attachment={a} mine={mine} />)}
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-ink-400' : 'text-ink-500'}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-ink-100 p-3">
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}${i}`} className="flex items-center gap-1 rounded-full bg-ink-100 py-1 pr-1 pl-3 text-xs">
                <span className="max-w-[160px] truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-ink-200" aria-label={`Remove ${f.name}`}><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md text-ink-500 hover:bg-ink-100" aria-label="Attach files">
            <Paperclip className="size-[18px]" />
            <input type="file" multiple accept={acceptFor('message-files')} className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="sr-only" htmlFor={`msg-${conversationId}`}>Message</label>
          <textarea id={`msg-${conversationId}`} value={body} onChange={(e) => setBody(e.target.value)} rows={1} maxLength={4000} placeholder="Write a message…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            className="input max-h-40 min-h-10 flex-1 resize-none py-2" />
          <Button type="submit" size="icon" className="size-10" loading={sending} disabled={!body.trim() && !files.length} aria-label="Send message">
            {!sending && <Send className="size-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AttachmentLink({ attachment, mine }: { attachment: Attachment; mine: boolean }) {
  const toast = useToast();
  const open = async () => {
    try {
      window.open(await signedUrl('message-files', attachment.path, 120), '_blank', 'noopener');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <button type="button" onClick={open} className={`mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${mine ? 'bg-white/10 hover:bg-white/15' : 'bg-white hover:bg-ink-50'}`}>
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{attachment.name}</span>
    </button>
  );
}
