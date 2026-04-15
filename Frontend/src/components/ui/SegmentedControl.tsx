import type { ReactNode } from 'react';
import { Button } from './Button';

export interface SegmentItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className = ''
}: {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={[
      'inline-flex rounded-xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/70',
      className
    ].join(' ')}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Button
            key={item.value}
            variant={active ? 'chip-active' : 'chip'}
            size="sm"
            onClick={() => onChange(item.value)}
            leadingIcon={item.icon}
            aria-pressed={active}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
