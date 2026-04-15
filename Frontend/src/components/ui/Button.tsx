import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'ghost'
  | 'icon'
  | 'chip'
  | 'chip-active';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md hover:from-blue-500 hover:to-indigo-500 active:translate-y-[1px]',
  secondary:
    'bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border border-slate-300/70 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700',
  destructive:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-500 active:translate-y-[1px]',
  ghost:
    'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  icon:
    'bg-transparent text-slate-600 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
  chip:
    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700',
  'chip-active':
    'bg-blue-600 text-white border border-blue-600 shadow-sm hover:bg-blue-500'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-11 px-5 text-sm rounded-xl'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', loading = false, disabled, leadingIcon, children, ...props },
  ref
) {
  const isIcon = variant === 'icon';
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        isIcon ? 'h-9 w-9 rounded-lg p-0' : sizeClasses[size],
        className
      ].join(' ')}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && leadingIcon}
      {!isIcon && children}
      {isIcon && children}
    </button>
  );
});
