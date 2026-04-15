import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="rounded-2xl bg-rose-500/10 p-3 text-rose-600 dark:text-rose-300">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary focus-ring mt-1">
          Retry
        </button>
      ) : null}
    </div>
  );
}
