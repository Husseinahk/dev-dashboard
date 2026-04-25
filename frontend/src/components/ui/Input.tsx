import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, iconRight, className, ...rest },
  ref,
) {
  return (
    <div className="relative w-full">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full h-9 rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-line)]',
          'text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)]',
          'transition-all duration-150',
          'focus:outline-none focus:border-[var(--color-brand-400)] focus:ring-2 focus:ring-[var(--color-brand-400)]/20',
          icon ? 'pl-9' : 'pl-3',
          iconRight ? 'pr-9' : 'pr-3',
          className,
        )}
        {...rest}
      />
      {iconRight && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]">
          {iconRight}
        </span>
      )}
    </div>
  );
});
