import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type Ref } from 'react';
import type { FieldError } from 'react-hook-form';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: FieldError | string;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  const message = typeof error === 'string' ? error : error?.message;
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-ink-400"> *</span>}
      </label>
      {children({ id, 'aria-invalid': message ? true : undefined, 'aria-describedby': describedBy })}
      {message ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-danger-600">{message}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', ref, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} rows={rows} className={`input resize-y ${className}`} {...props} />;
}

export function Select({ className = '', ref, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select ref={ref} className={`input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%23697383%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%23697383%22 stroke-width=%221.5%22 fill=%22none%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, description, ref, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode; ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input ref={ref} id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-ink-300 accent-ink-900" {...props} />
      <label htmlFor={id} className="text-sm text-ink-800">
        <span className="font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-500">{description}</span>}
      </label>
    </div>
  );
}

/** Peso amount input. Values are strings in the form and parsed to centavos on submit. */
export function MoneyInput({ className = '', ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-500">₱</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className={`pl-7 tabular-nums ${className}`} {...props} />
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger-600/20 bg-danger-50 px-3 py-2 text-sm text-danger-600">
      {message}
    </p>
  );
}
