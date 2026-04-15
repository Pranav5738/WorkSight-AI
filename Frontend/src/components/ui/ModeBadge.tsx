import { Database, Server } from 'lucide-react';
import { isBackendConfigured } from '../../lib/api/http';

interface ModeBadgeProps {
  mode?: 'backend' | 'supabase';
  className?: string;
}

export function ModeBadge({ mode, className = '' }: ModeBadgeProps) {
  const resolved = mode ?? (isBackendConfigured() ? 'backend' : 'supabase');
  const backend = resolved === 'backend';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] ${
        backend
          ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-400/10 dark:text-emerald-300'
          : 'border-amber-300/70 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-400/10 dark:text-amber-300'
      } ${className}`}
      aria-label={`Data mode ${backend ? 'backend' : 'supabase'}`}
    >
      {backend ? <Server className="h-3 w-3" /> : <Database className="h-3 w-3" />}
      {backend ? 'BACKEND' : 'SUPABASE'}
    </span>
  );
}
