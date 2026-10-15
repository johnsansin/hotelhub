'use client';

import clsx from 'clsx';

export default function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={clsx('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[19px] font-bold tracking-tight text-ink-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
