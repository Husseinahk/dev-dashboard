import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'text-white bg-gradient-to-b from-[var(--color-brand-500)] to-[var(--color-brand-600)] ' +
    'hover:from-[var(--color-brand-400)] hover:to-[var(--color-brand-500)] ' +
    'shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_4px_20px_-6px_rgba(109,99,244,0.6)]',
  secondary:
    'text-[var(--color-text-1)] bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] ' +
    'border border-[var(--color-line)]',
  ghost:
    'text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)] ' +
    'border border-transparent',
  danger:
    'text-white bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 ' +
    'shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_4px_18px_-6px_rgba(239,68,68,0.55)]',
  success:
    'text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 ' +
    'shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_4px_18px_-6px_rgba(16,185,129,0.55)]',
};

const SIZE: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-4 text-base gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none',
        'transition-all duration-150 active:scale-[0.97]',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-brand-400)] focus-visible:outline-offset-2',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  );
});
