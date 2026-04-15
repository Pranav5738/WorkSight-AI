import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-300">
        <Inbox className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
