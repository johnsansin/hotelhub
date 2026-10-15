'use client';

export function money(v, currency = 'INR') {
  const n = Number(v || 0);
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

export function compactMoney(v, currency = 'INR') {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function num(v) {
  return new Intl.NumberFormat('en-IN').format(Number(v || 0));
}

export function pct(v, digits = 1) {
  return `${Number(v || 0).toFixed(digits)}%`;
}

export function fmtDate(v, style = 'medium') {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return '—';
  const opts =
    style === 'short'
      ? { day: '2-digit', month: 'short' }
      : style === 'long'
        ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-GB', opts);
}

export function fmtDateTime(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function timeOnly(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function relative(v) {
  if (!v) return '';
  const then = new Date(v).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return fmtDate(v);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function nights(from, to) {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const STATUS_COLORS = {
  confirmed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  checked_in: 'bg-emerald-100 text-emerald-700',
  'checked-in': 'bg-emerald-100 text-emerald-700',
  checked_out: 'bg-ink-200 text-ink-700',
  'checked-out': 'bg-ink-200 text-ink-700',
  cancelled: 'bg-rose-100 text-rose-700',
  no_show: 'bg-rose-100 text-rose-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-ink-100 text-ink-600',
  paid: 'bg-emerald-100 text-emerald-700',
  unpaid: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  draft: 'bg-ink-100 text-ink-600',
  open: 'bg-blue-100 text-blue-700',
  preparing: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700',
  served: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-ink-200 text-ink-700',
  void: 'bg-rose-100 text-rose-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  ordered: 'bg-blue-100 text-blue-700',
  available: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-brand-100 text-brand-700',
  maintenance: 'bg-rose-100 text-rose-700',
  cleaning: 'bg-amber-100 text-amber-700',
  blocked: 'bg-ink-200 text-ink-700',
  trial: 'bg-blue-100 text-blue-700',
  suspended: 'bg-rose-100 text-rose-700',
  pending_sub: 'bg-amber-100 text-amber-700',
  full_time: 'bg-brand-100 text-brand-700',
  contract: 'bg-amber-100 text-amber-700',
  probation: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-emerald-100 text-emerald-700',
  low: 'bg-amber-100 text-amber-700',
  critical: 'bg-rose-100 text-rose-700',
  ok: 'bg-emerald-100 text-emerald-700',
};

export function statusLabel(s = '') {
  return String(s).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusTone(s = '') {
  return STATUS_COLORS[s] || STATUS_COLORS[s?.toLowerCase?.()] || 'bg-ink-100 text-ink-700';
}
