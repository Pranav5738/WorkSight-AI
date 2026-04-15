import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <Inbox className="mb-3 h-8 w-8 text-slate-400" />
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      {action && (
        <Button className="mt-4" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  subtitle,
  onRetry
}: {
  title: string;
  subtitle?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
      <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" />
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-300/80">{subtitle}</p>}
      {onRetry && (
        <Button className="mt-4" variant="destructive" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
