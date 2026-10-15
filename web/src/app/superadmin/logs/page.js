'use client';

import { useState } from 'react';
import { Activity, ScrollText, RefreshCw, Building2, Layers } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { StatCard, StatusBadge, Badge, EmptyState, PageLoader } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar } from '@/components/ui/table';
import { Bars, Donut } from '@/components/Chart';
import { useFetch, useList, useDebounced } from '@/lib/hooks';
import { money, num, fmtDate, fmtDateTime, relative } from '@/lib/format';

const PAGE_SIZE = 12;

function detailText(detail) {
  if (!detail || typeof detail !== 'object') return detail ? String(detail) : '—';
  const entries = Object.entries(detail);
  if (!entries.length) return '—';
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

export default function SuperadminLogsPage() {
  const [hotelId, setHotelId] = useState('');
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const [page, setPage] = useState(1);

  const { items, total, loading, error, reload } = useList('/superadmin/audit', {
    limit: 200,
    hotel_id: hotelId,
  });
  const { data: hotelsData, loading: hotelsLoading } = useFetch('/superadmin/hotels?limit=200');
  const { data: stats, loading: statsLoading } = useFetch('/superadmin/stats');
  const { data: subsData } = useFetch('/superadmin/subscriptions');

  const hotels = hotelsData?.items || [];
  const subs = subsData?.items || [];

  const search = debounced.trim().toLowerCase();
  const filtered = items.filter((a) => {
    if (!search) return true;
    const haystack = `${a.action || ''} ${a.entity || ''} ${a.entity_id || ''} ${a.user_name || ''} ${a.hotel_name || ''} ${detailText(a.detail)}`.toLowerCase();
    return haystack.includes(search);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const planMix = Object.entries(
    hotels.reduce((acc, h) => {
      const key = h.plan_name || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const setFilter = (fn) => (v) => {
    fn(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Platform logs"
        subtitle="Audit trail of platform actions plus live platform insights"
        actions={
          <button className="btn-secondary" onClick={reload}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Audit events" value={num(total)} sub="Recorded on the platform" icon={ScrollText} tone="brand" />
        <StatCard label="Hotels" value={num(hotels.length)} sub="Properties tracked" icon={Building2} tone="violet" />
        <StatCard label="Subscriptions" value={num(subs.length)} sub="Billing records" icon={Layers} tone="emerald" />
        <StatCard label="MRR" value={money(stats?.mrr)} sub="Monthly recurring revenue" icon={Activity} tone="amber" />
      </div>

      <div className="mt-5 card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Audit trail</h3>
            <p className="text-[12.5px] text-ink-500">Time, actor, action, hotel and payload for every recorded event</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={setFilter(setQ)} placeholder="Search actor, action, hotel…" className="w-full sm:w-64" />
            <Select value={hotelId} onChange={setFilter(setHotelId)} className="w-full sm:w-48">
              <option value="">All hotels</option>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <DataTable
            loading={loading}
            rows={rows}
            columns={[
              { key: 'created_at', label: 'Time', render: (a) => <span className="whitespace-nowrap text-[12.5px] text-ink-600">{fmtDateTime(a.created_at)}</span> },
              { key: 'user_name', label: 'Actor', render: (a) => <span className="font-medium text-ink-800">{a.user_name || 'System'}</span> },
              {
                key: 'action',
                label: 'Action',
                render: (a) => (
                  <div className="min-w-[150px]">
                    <p className="font-semibold text-ink-900">{a.action}</p>
                    {a.entity && <p className="text-[11.5px] text-ink-400">{a.entity}</p>}
                  </div>
                ),
              },
              { key: 'hotel_name', label: 'Hotel', render: (a) => a.hotel_name || <span className="text-ink-400">Platform</span> },
              {
                key: 'detail',
                label: 'Details',
                render: (a) => <span className="line-clamp-2 text-[12.5px] text-ink-500">{detailText(a.detail)}</span>,
              },
            ]}
            empty={
              error ? (
                <EmptyState
                  icon={Activity}
                  title="Could not load audit events"
                  message={error.message}
                  action={
                    <button className="btn-secondary" onClick={reload}>
                      Try again
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ScrollText}
                  title={search || hotelId ? 'No audit events match these filters' : 'No audit events recorded yet'}
                  message={
                    search || hotelId
                      ? 'Clear the search or hotel filter to see all recorded events.'
                      : 'Platform actions are written here as they happen. Live platform insights are shown below.'
                  }
                />
              )
            }
          />
          <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      </div>

      <div className="mt-6 mb-3 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink-900">Platform insights</h3>
        <Badge tone="bg-brand-100 text-brand-700">Live data</Badge>
      </div>

      {statsLoading && hotelsLoading ? (
        <div className="card">
          <PageLoader label="Loading insights…" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h4 className="text-[14.5px] font-semibold text-ink-900">Hotel signups by month</h4>
            <p className="mb-4 text-[12.5px] text-ink-500">New properties onboarded across the platform</p>
            {stats?.trend?.length ? (
              <Bars data={stats.trend} xKey="month" series={[{ key: 'hotels', label: 'Hotels', color: '#3b66f6' }]} height={230} />
            ) : (
              <EmptyState icon={Building2} title="No signups recorded" />
            )}
          </div>

          <div className="card p-5">
            <h4 className="text-[14.5px] font-semibold text-ink-900">Plan distribution</h4>
            <p className="mb-4 text-[12.5px] text-ink-500">Hotels per plan today</p>
            {planMix.length ? (
              <Donut data={planMix} height={190} />
            ) : (
              <EmptyState icon={Layers} title="No hotels yet" />
            )}
          </div>

          <div className="card p-5 lg:col-span-2">
            <h4 className="text-[14.5px] font-semibold text-ink-900">Recent subscription changes</h4>
            <p className="mb-3 text-[12.5px] text-ink-500">Latest billing records created on the platform</p>
            {subs.length ? (
              <ul className="space-y-2">
                {subs.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-ink-800">
                        {s.hotel_name} · {s.plan_name || 'Plan'}
                      </p>
                      <p className="text-[11.5px] text-ink-400">
                        {s.billing_cycle} · {relative(s.created_at)} · renews {fmtDate(s.ends_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13.5px] font-semibold text-ink-900">{money(s.amount)}</p>
                      <StatusBadge status={s.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Layers} title="No subscriptions yet" />
            )}
          </div>

          <div className="card p-5">
            <h4 className="text-[14.5px] font-semibold text-ink-900">Recent signups</h4>
            <p className="mb-3 text-[12.5px] text-ink-500">Newest properties on HotelHub</p>
            {hotels.length ? (
              <ul className="space-y-2">
                {hotels.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-ink-800">{h.name}</p>
                      <p className="text-[11.5px] text-ink-400">
                        {h.city || '—'} · {fmtDate(h.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={h.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Building2} title="No hotels yet" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
