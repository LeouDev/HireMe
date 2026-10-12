import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from './Feedback';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'outline-inverse';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink-950 text-white hover:bg-ink-800 active:bg-ink-700',
  secondary: 'border border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger-600 text-white hover:bg-danger-600/90',
  inverse: 'bg-white text-ink-950 hover:bg-ink-100',
  'outline-inverse': 'border border-white/20 text-white hover:bg-white/10',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-md px-4 text-sm',
  lg: 'h-12 gap-2 rounded-lg px-6 text-[15px]',
  icon: 'size-9 rounded-md',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = '') {
  return `inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, loading, icon, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function ButtonLink({ variant, size, icon, className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
