import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  tone?: StatTone;
  trendLabel?: string;
  onClick?: () => void;
  testId?: string;
}

const toneStyles: Record<StatTone, string> = {
  primary: 'from-indigo-500/20 to-violet-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300/40 dark:border-indigo-500/30',
  success: 'from-emerald-500/20 to-green-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/40 dark:border-emerald-500/30',
  warning: 'from-amber-500/20 to-orange-500/10 text-amber-700 dark:text-amber-300 border-amber-300/40 dark:border-amber-500/30',
  danger: 'from-rose-500/20 to-red-500/10 text-rose-700 dark:text-rose-300 border-rose-300/40 dark:border-rose-500/30',
  info: 'from-sky-500/20 to-blue-500/10 text-sky-700 dark:text-sky-300 border-sky-300/40 dark:border-sky-500/30'
};

export function StatCard({
  title,
  value,
  icon,
  description,
  tone = 'primary',
  trendLabel,
  onClick,
  testId
}: StatCardProps) {
  const clickable = typeof onClick === 'function';

  return (
    <motion.button
      type="button"
      data-testid={testId}
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={clickable ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`surface-card glass-highlight relative w-full overflow-hidden p-5 text-left ${
        clickable ? 'focus-ring cursor-pointer' : 'cursor-default'
      }`}
      disabled={!clickable}
      aria-label={clickable ? `Open ${title}` : title}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${toneStyles[tone]}`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
          {description ? <p className="text-xs text-slate-600 dark:text-slate-300">{description}</p> : null}
        </div>
        <div className="rounded-xl border border-white/40 bg-white/55 p-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/35 dark:text-slate-200">
          {icon}
        </div>
      </div>
      {trendLabel ? (
        <p className="relative z-10 mt-4 inline-flex rounded-full bg-white/75 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
          {trendLabel}
        </p>
      ) : null}
    </motion.button>
  );
}
