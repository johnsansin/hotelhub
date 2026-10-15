'use client';

import clsx from 'clsx';
import { Loader2, Inbox, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { initials, statusTone, statusLabel } from '@/lib/format';

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={clsx('animate-spin', className)} />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner size={26} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Badge({ children, tone, className = '' }) {
  return <span className={clsx('chip', tone || 'bg-ink-100 text-ink-700', className)}>{children}</span>;
}

export function StatusBadge({ status, className = '' }) {
  if (!status) return <Badge>—</Badge>;
  return <span className={clsx('chip', statusTone(status), className)}>{statusLabel(status)}</span>;
}

export function Avatar({ name = '', size = 36, className = '' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-semibold text-white',
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name) || '·'}
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, className = '' }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon size={24} />
      </div>
      <h3 className="text-[15px] font-semibold text-ink-800">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, trend, icon: Icon, tone = 'brand', hint }) {
  const tones = {
    brand: 'from-brand-500/12 to-brand-600/4 text-brand-600',
    emerald: 'from-emerald-500/12 to-emerald-600/4 text-emerald-600',
    amber: 'from-amber-500/12 to-amber-600/4 text-amber-600',
    rose: 'from-rose-500/12 to-rose-600/4 text-rose-600',
    violet: 'from-violet-500/12 to-violet-600/4 text-violet-600',
    ink: 'from-ink-500/12 to-ink-600/4 text-ink-600',
  };
  const up = trend > 0;
  const flat = !trend;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink-500">{label}</p>
          <p className="mt-1.5 truncate text-[26px] font-bold leading-none tracking-tight text-ink-900 dark:text-white">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br', tones[tone])}>
            <Icon size={20} />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12.5px]">
        {trend !== undefined && trend !== null && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 font-semibold',
              flat ? 'text-ink-400' : up ? 'text-emerald-600' : 'text-rose-600'
            )}
          >
            {flat ? <Minus size={13} /> : up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(Number(trend))}%
          </span>
        )}
        <span className="text-ink-400">{sub || hint}</span>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-100', className)}>
      {tabs.map((t) => {
        const key = t.id ?? t;
        const label = t.label ?? t;
        const count = t.count;
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              'relative whitespace-nowrap px-4 py-2.5 text-[13.5px] font-medium transition',
              isActive ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'
            )}
          >
            {label}
            {count !== undefined && count !== null && (
              <span className={clsx('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]', isActive ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')}>
                {count}
              </span>
            )}
            {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const buttons = [];
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i += 1) buttons.push(i);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink-500">
      <span>
        {total} total · page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        {buttons.map((b) => (
          <button
            key={b}
            onClick={() => onPage(b)}
            className={clsx(
              'h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold transition',
              b === page ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            )}
          >
            {b}
          </button>
        ))}
        <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-[12px] text-ink-400">{hint}</p>}
    </div>
  );
}
