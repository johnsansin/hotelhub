'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  TrendingUp, Building2, Wallet, UtensilsCrossed, Sparkles, Users, Download,
  BarChart3, CalendarDays, RefreshCw, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useFetch } from '@/lib/hooks';
import { money, num, pct, fmtDate, todayISO, addDaysISO, statusLabel } from '@/lib/format';
import { StatCard, EmptyState, Field, PageLoader, Badge } from '@/components/ui/kit';
import { DataTable, DateInput } from '@/components/ui/table';
import { TrendArea, Bars, Lines, Donut } from '@/components/Chart';

const REPORTS = [
  { id: 'revenue', label: 'Revenue', icon: TrendingUp, tone: 'brand', desc: 'Rooms, F&B and POS by room type and source' },
  { id: 'occupancy', label: 'Occupancy', icon: Building2, tone: 'emerald', desc: 'Daily occupancy across the selected range' },
  { id: 'adr', label: 'ADR / RevPAR', icon: Wallet, tone: 'violet', desc: 'Average daily rate and revenue per room' },
  { id: 'fnb', label: 'F&B and POS', icon: UtensilsCrossed, tone: 'amber', desc: 'Restaurant and counter sales by month' },
  { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles, tone: 'rose', desc: 'Tasks, maintenance and lost property' },
  { id: 'staff', label: 'Staff', icon: Users, tone: 'ink', desc: 'Attendance and active headcount' },
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map((h) => `"${csvEscape(h)}"`).join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');
}

function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [active, setActive] = useState('revenue');
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30));
  const [to, setTo] = useState(todayISO());

  const report = REPORTS.find((r) => r.id === active);
  const usesDates = !['housekeeping', 'staff'].includes(active);

  const overview = useFetch(`/reports/overview?from=${from}&to=${to}`, {
    enabled: ['revenue', 'adr', 'fnb'].includes(active),
  });
  const occupancy = useFetch(`/reports/occupancy?from=${from}&to=${to}`, { enabled: active === 'occupancy' });
  const roomPerf = useFetch(`/reports/room-performance?from=${from}&to=${to}`, {
    enabled: ['revenue', 'adr'].includes(active),
  });
  const sources = useFetch(`/reports/booking-sources?from=${from}&to=${to}`, { enabled: active === 'revenue' });
  const monthly = useFetch('/reports/revenue-monthly?months=24', { enabled: active === 'fnb' });
  const operations = useFetch('/reports/operations', { enabled: ['housekeeping', 'staff'].includes(active) });

  const activeHooks = [
    [overview, ['revenue', 'adr', 'fnb'].includes(active)],
    [occupancy, active === 'occupancy'],
    [roomPerf, ['revenue', 'adr'].includes(active)],
    [sources, active === 'revenue'],
    [monthly, active === 'fnb'],
    [operations, ['housekeeping', 'staff'].includes(active)],
  ];
  const loading = activeHooks.some(([h, on]) => on && h.loading);
  const failedHook = activeHooks.find(([h, on]) => on && h.error);
  const failed = failedHook ? failedHook[0].error : null;
  const reloadActive = () => activeHooks.forEach(([h, on]) => on && h.reload());

  const monthlyRows = useMemo(() => {
    const rows = monthly.data?.items || [];
    return rows.filter((r) => r.month >= from.slice(0, 7) && r.month <= to.slice(0, 7));
  }, [monthly.data, from, to]);

  function panel() {
    if (active === 'revenue') {
      const rows = (roomPerf.data?.items || []).map((r) => ({
        id: r.id,
        room_type: r.name,
        bookings: r.bookings,
        room_nights: r.room_nights,
        revenue: Number(r.revenue),
        adr: Math.round(Number(r.avg_booking)),
      }));
      const src = sources.data?.items || [];
      return {
        kpis: overview.data?.kpi ? [
          { label: 'Total revenue', value: money(overview.data.kpi.total_revenue), icon: TrendingUp, tone: 'brand', sub: 'rooms + F&B + POS' },
          { label: 'Room revenue', value: money(overview.data.kpi.booking_revenue), icon: Wallet, tone: 'emerald', sub: `${overview.data.kpi.bookings} bookings` },
          { label: 'Collected', value: money(overview.data.kpi.collected), icon: BarChart3, tone: 'violet', sub: 'payments received' },
        ] : [],
        charts: (
          <>
            <div className="card p-5">
              <h3 className="mb-3 text-[15px] font-semibold text-ink-900">Revenue by room type</h3>
              {rows.length ? (
                <Bars data={rows} xKey="room_type" series={[{ key: 'revenue', label: 'Revenue', color: '#3b66f6' }]} money />
              ) : (
                <EmptyState icon={TrendingUp} title="No room revenue" message="No bookings in this range." />
              )}
            </div>
            <div className="card p-5">
              <h3 className="mb-3 text-[15px] font-semibold text-ink-900">Revenue by source</h3>
              {src.length ? (
                <Donut
                  data={src.map((s) => ({ name: statusLabel(s.source), value: Number(s.revenue) }))}
                  formatter={(v) => money(v)}
                  height={200}
                />
              ) : (
                <EmptyState icon={BarChart3} title="No source data" message="Bookings appear here once created." />
              )}
            </div>
          </>
        ),
        columns: [
          { key: 'room_type', label: 'Room type', render: (r) => <span className="font-medium text-ink-900">{r.room_type}</span> },
          { key: 'bookings', label: 'Bookings', render: (r) => num(r.bookings) },
          { key: 'room_nights', label: 'Room nights', render: (r) => num(r.room_nights) },
          { key: 'adr', label: 'Avg booking', render: (r) => money(r.adr) },
          { key: 'revenue', label: 'Revenue', render: (r) => <span className="font-semibold text-ink-900">{money(r.revenue)}</span> },
        ],
        rows,
        csvName: 'revenue-by-room-type',
      };
    }

    if (active === 'occupancy') {
      const rows = (occupancy.data?.items || []).map((r) => ({ ...r, id: r.date }));
      return {
        kpis: rows.length ? [
          { label: 'Total rooms', value: num(occupancy.data?.total_rooms), icon: Building2, tone: 'brand', sub: 'inventory' },
          { label: 'Peak occupancy', value: pct(Math.max(...rows.map((r) => r.occupancy)), 0), icon: TrendingUp, tone: 'emerald', sub: 'in range' },
          { label: 'Average occupancy', value: pct(Math.round(rows.reduce((s, r) => s + r.occupancy, 0) / rows.length), 0), icon: BarChart3, tone: 'violet', sub: `${rows.length} days` },
        ] : [],
        charts: (
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-3 text-[15px] font-semibold text-ink-900">Occupancy by day</h3>
            {rows.length ? (
              <TrendArea
                data={rows}
                xKey="date"
                series={[{ key: 'occupancy', label: 'Occupancy %', color: '#10b981' }]}
                yFmt={(v) => pct(v, 0)}
                height={280}
              />
            ) : (
              <EmptyState icon={Building2} title="No occupancy data" message="Pick a wider range." />
            )}
          </div>
        ),
        columns: [
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'occupied', label: 'Occupied', render: (r) => num(r.occupied) },
          { key: 'total', label: 'Total rooms', render: (r) => num(r.total) },
          { key: 'available', label: 'Available', render: (r) => num(r.available) },
          { key: 'occupancy', label: 'Occupancy', render: (r) => <span className="font-semibold text-ink-900">{pct(r.occupancy, 0)}</span> },
        ],
        rows,
        csvName: 'occupancy',
      };
    }

    if (active === 'adr') {
      const rows = (roomPerf.data?.items || []).map((r) => ({
        id: r.id,
        room_type: r.name,
        base_price: Number(r.base_price),
        bookings: r.bookings,
        room_nights: r.room_nights,
        adr: Math.round(Number(r.avg_booking)),
        revenue: Number(r.revenue),
      }));
      const kpi = overview.data?.kpi;
      const revpar = kpi ? Math.round(Number(kpi.adr) * (Number(kpi.occupancy) / 100)) : 0;
      return {
        kpis: kpi ? [
          { label: 'ADR', value: money(kpi.adr), icon: Wallet, tone: 'brand', sub: 'average daily rate' },
          { label: 'RevPAR', value: money(revpar), icon: TrendingUp, tone: 'emerald', sub: `${pct(kpi.occupancy, 0)} occupancy` },
          { label: 'In-house', value: num(kpi.in_house), icon: Users, tone: 'violet', sub: 'checked in now' },
        ] : [],
        charts: (
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-3 text-[15px] font-semibold text-ink-900">Average rate by room type</h3>
            {rows.length ? (
              <Bars data={rows} xKey="room_type" series={[{ key: 'adr', label: 'ADR', color: '#8b5cf6' }]} money horizontal />
            ) : (
              <EmptyState icon={Wallet} title="No rate data" message="No bookings in this range." />
            )}
          </div>
        ),
        columns: [
          { key: 'room_type', label: 'Room type', render: (r) => <span className="font-medium text-ink-900">{r.room_type}</span> },
          { key: 'base_price', label: 'Base rate', render: (r) => money(r.base_price) },
          { key: 'bookings', label: 'Bookings', render: (r) => num(r.bookings) },
          { key: 'room_nights', label: 'Room nights', render: (r) => num(r.room_nights) },
          { key: 'adr', label: 'ADR', render: (r) => <span className="font-semibold text-ink-900">{money(r.adr)}</span> },
          { key: 'revenue', label: 'Revenue', render: (r) => money(r.revenue) },
        ],
        rows,
        csvName: 'adr-revpar',
      };
    }

    if (active === 'fnb') {
      const rows = monthlyRows.map((r) => ({
        id: r.month,
        month: r.label,
        rooms: Number(r.rooms),
        fnb: Number(r.fnb),
        pos: Number(r.pos),
        expense: Number(r.expense),
        revenue: Number(r.revenue),
      }));
      const kpi = overview.data?.kpi;
      return {
        kpis: kpi ? [
          { label: 'F&B revenue', value: money(kpi.fnb_revenue), icon: UtensilsCrossed, tone: 'amber', sub: 'in range' },
          { label: 'POS revenue', value: money(kpi.pos_revenue), icon: BarChart3, tone: 'brand', sub: 'retail sales' },
          { label: 'Expenses', value: money(kpi.expenses), icon: TrendingUp, tone: 'rose', sub: 'in range' },
        ] : [],
        charts: (
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-3 text-[15px] font-semibold text-ink-900">F&B, POS and expenses by month</h3>
            {rows.length ? (
              <Lines
                data={rows}
                xKey="month"
                series={[
                  { key: 'fnb', label: 'F&B', color: '#d0a445' },
                  { key: 'pos', label: 'POS', color: '#3b66f6' },
                  { key: 'expense', label: 'Expense', color: '#f43f5e' },
                ]}
                money
                height={280}
              />
            ) : (
              <EmptyState icon={UtensilsCrossed} title="No monthly data" message="No sales recorded in this range." />
            )}
          </div>
        ),
        columns: [
          { key: 'month', label: 'Month', render: (r) => <span className="font-medium text-ink-900">{r.month}</span> },
          { key: 'rooms', label: 'Rooms', render: (r) => money(r.rooms) },
          { key: 'fnb', label: 'F&B', render: (r) => money(r.fnb) },
          { key: 'pos', label: 'POS', render: (r) => money(r.pos) },
          { key: 'expense', label: 'Expense', render: (r) => money(r.expense) },
          { key: 'revenue', label: 'Total revenue', render: (r) => <span className="font-semibold text-ink-900">{money(r.revenue)}</span> },
        ],
        rows,
        csvName: 'fnb-pos',
      };
    }

    const ops = operations.data;
    const metrics =
      active === 'housekeeping'
        ? [
            { key: 'hk_done', label: 'Tasks completed (MTD)' },
            { key: 'hk_pending', label: 'Tasks pending' },
            { key: 'maint_open', label: 'Open maintenance' },
            { key: 'maint_cost', label: 'Maintenance cost' },
            { key: 'found_open', label: 'Lost items found' },
            { key: 'found_returned', label: 'Lost items returned' },
            { key: 'stock_value', label: 'Stock value' },
            { key: 'low_stock', label: 'Low stock items' },
          ]
        : [
            { key: 'present', label: 'Attendance days present (MTD)' },
            { key: 'absent', label: 'Days absent (MTD)' },
            { key: 'staff_active', label: 'Active staff' },
            { key: 'upcoming_events', label: 'Upcoming events' },
            { key: 'hk_pending', label: 'Housekeeping queue' },
            { key: 'maint_open', label: 'Open maintenance' },
          ];
    const moneyKeys = ['maint_cost', 'stock_value'];
    const rows = metrics.map((m) => ({
      id: m.key,
      metric: m.label,
      value: ops ? (moneyKeys.includes(m.key) ? money(ops[m.key]) : num(ops[m.key])) : '—',
    }));
    const donutRows =
      active === 'housekeeping'
        ? [
            { name: 'Completed', value: Number(ops?.hk_done || 0) },
            { name: 'Pending', value: Number(ops?.hk_pending || 0) },
            { name: 'Open maintenance', value: Number(ops?.maint_open || 0) },
          ]
        : [
            { name: 'Present', value: Number(ops?.present || 0) },
            { name: 'Absent', value: Number(ops?.absent || 0) },
            { name: 'Active staff', value: Number(ops?.staff_active || 0) },
          ];
    return {
      kpis: rows.slice(0, 3).map((r, i) => ({
        label: r.metric,
        value: r.value,
        icon: active === 'housekeeping' ? Sparkles : Users,
        tone: ['brand', 'amber', 'emerald'][i],
        sub: 'current month',
      })),
      charts: (
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-3 text-[15px] font-semibold text-ink-900">
            {active === 'housekeeping' ? 'Housekeeping workload' : 'Attendance snapshot'}
          </h3>
          {donutRows.some((d) => d.value > 0) ? (
            <Donut data={donutRows} height={210} />
          ) : (
            <EmptyState icon={Sparkles} title="Nothing recorded yet" message="Tasks and attendance appear here." />
          )}
        </div>
      ),
      columns: [
        { key: 'metric', label: 'Metric', render: (r) => <span className="font-medium text-ink-900">{r.metric}</span> },
        { key: 'value', label: 'Value', render: (r) => <span className="font-semibold text-ink-900">{r.value}</span> },
      ],
      rows,
      csvName: active,
    };
  }

  const view = panel();
  const hasRows = view.rows.length > 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Revenue, occupancy, operations and people — exportable"
        actions={
          <button className="btn-secondary" onClick={reloadActive}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const isActive = r.id === active;
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={clsx(
                'card card-hover p-5 text-left transition',
                isActive ? 'border-brand-500 ring-2 ring-brand-500/20' : 'hover:border-brand-200'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-2xl',
                    isActive ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'
                  )}
                >
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink-900">{r.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-500">{r.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-ink-900">{report.label}</h3>
            <p className="text-[13px] text-ink-500">{report.desc}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="From" className={usesDates ? '' : 'opacity-50'}>
              <DateInput value={from} onChange={setFrom} disabled={!usesDates} className="w-40" />
            </Field>
            <Field label="To" className={usesDates ? '' : 'opacity-50'}>
              <DateInput value={to} onChange={setTo} disabled={!usesDates} className="w-40" />
            </Field>
            <button
              className="btn-primary"
              disabled={!hasRows}
              onClick={() => downloadCsv(`${view.csvName}-${todayISO()}.csv`, view.rows)}
              title={hasRows ? 'Download the rows below' : 'No rows to export'}
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {!usesDates && (
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[12.5px] text-ink-500">
            <CalendarDays size={14} /> This report is calculated for the current month by the API, so date filters are disabled.
          </p>
        )}

        {loading ? (
          <PageLoader label="Running report…" />
        ) : failed ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <AlertTriangle size={24} className="text-rose-500" />
            <div>
              <p className="text-[15px] font-semibold text-ink-900">Report unavailable</p>
              <p className="mt-1 max-w-md text-[13px] text-ink-500">{failed.error.message}</p>
            </div>
            <button className="btn-secondary btn-sm" onClick={reloadActive}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <>
            {view.kpis.length > 0 && (
              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                {view.kpis.map((k) => (
                  <StatCard key={k.label} label={k.label} value={k.value} sub={k.sub} icon={k.icon} tone={k.tone} />
                ))}
              </div>
            )}

            <div className="mb-4 grid gap-4 lg:grid-cols-2">{view.charts}</div>

            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink-700">Underlying rows</p>
              <Badge>{view.rows.length} rows</Badge>
            </div>
            <DataTable
              rows={view.rows}
              columns={view.columns}
              empty={
                <EmptyState
                  icon={BarChart3}
                  title="No data for this range"
                  message="Widen the date range or pick another report."
                />
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
