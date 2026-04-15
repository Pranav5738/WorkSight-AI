import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Card({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={[
        'rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_10px_35px_-20px_rgba(2,6,23,0.35)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/70',
        className
      ].join(' ')}
    >
      {children}
    </motion.section>
  );
}

export function CardTitle({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
