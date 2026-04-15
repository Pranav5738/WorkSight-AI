import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-page-title text-slate-900 dark:text-slate-100">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-body-muted max-w-3xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.div>
  );
}
