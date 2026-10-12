import { CheckCircle2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';
import { FormError, Textarea } from './Form';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/** Accessible modal built on the native <dialog> element (focus trap, Escape and backdrop handled by the browser). */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-xl bg-white p-0 text-ink-900 shadow-pop backdrop:bg-ink-950/50 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<unknown> | void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a note/reason; `required` blocks confirming until one is entered. */
  note?: { label: string; required?: boolean; placeholder?: string };
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, note }: ConfirmProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setText('');
    setError(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={note?.required && !text.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(note || error) && (
        <div className="space-y-3">
          {note && (
            <label className="block">
              <span className="label">{note.label}</span>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={note.placeholder} rows={3} maxLength={1000} />
            </label>
          )}
          <FormError message={error} />
        </div>
      )}
    </Dialog>
  );
}

type ToastKind = 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string }
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-ink-950 px-4 py-3 text-sm text-white shadow-pop">
            {t.kind === 'success' ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <XCircle className="size-4 shrink-0 text-danger-50" aria-hidden="true" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
