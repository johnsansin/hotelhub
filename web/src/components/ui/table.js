'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Search, Calendar as CalIcon } from 'lucide-react';

export function DataTable({ columns, rows, keyField = 'id', loading, empty, onRowClick, className = '' }) {
  if (loading) {
    return (
      <div className="table-wrap animate-fade-in">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key || c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key || c.label}>
                    <div className="skeleton h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="table-wrap">{empty || <div className="px-6 py-10 text-center text-sm text-ink-400">No records found.</div>}</div>
    );
  }

  return (
    <div className={clsx('table-wrap', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key || c.label} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[keyField] ?? row.code ?? row.id}
              className={onRowClick ? 'cursor-pointer' : ''}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((c) => (
                <td key={c.key || c.label} className={c.className}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={clsx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        className="input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function DateInput({ value, onChange, className = '', ...rest }) {
  return (
    <div className={clsx('relative', className)}>
      <CalIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input type="date" className="input pl-9" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export function Select({ value, onChange, children, className = '', ...rest }) {
  return (
    <select className={clsx('input appearance-none bg-no-repeat', className)} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5"
    >
      <span
        className={clsx(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-200'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </span>
      {label && <span className="text-sm text-ink-700">{label}</span>}
    </button>
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={clsx('inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-soft', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition',
            value === o.value ? 'bg-ink-900 text-white shadow' : 'text-ink-500 hover:text-ink-800'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PaginationBar(props) {
  const { page = 1, pageSize = 20, total = 0, onPage } = props;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  const nums = [];
  for (let i = from; i <= to; i += 1) nums.push(i);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink-500">
      <span>
        {total.toLocaleString()} results · page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} /> Prev
        </button>
        {nums.map((n) => (
          <button
            key={n}
            onClick={() => onPage(n)}
            className={clsx(
              'h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold transition',
              n === page ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            )}
          >
            {n}
          </button>
        ))}
        <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
