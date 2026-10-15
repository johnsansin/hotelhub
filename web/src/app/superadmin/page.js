'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Wallet,
  CalendarCheck,
  BedDouble,
  Users,
  Star,
  IndianRupee,
  Plus,
  ArrowRight,
  Activity,
  LifeBuoy,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { StatCard, PageLoader, EmptyState, StatusBadge, Badge } from '@/components/ui/kit';
import { DataTable } from '@/components/ui/table';
import { Bars, Donut } from '@/components/Chart';
import { useFetch, useList } from '@/lib/hooks';
import { money, compactMoney, num, fmtDate, relative } from '@/lib/format';

export default function SuperadminOverviewPage() {
  const router = useRouter();
  const { data: stats, loading, error, reload } = useFetch('/superadmin/stats');
  const { items: hotels, loading: hotelsLoading } = useList('/superadmin/hotels', { limit: 200 });
  const { data: ticketsData } = useFetch('/superadmin/tickets');

  const tickets = ticketsData?.items || [];
  const ticketCounts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const planMix = Object.entries(
    hotels.reduce((acc, h) => {
      const key = h.plan_name || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const openCreate = () => {
    sessionStorage.setItem('sa_open_create_hotel', '1');
    router.push('/superadmin/hotels');
  };

  const header = (
    <PageHeader
      title="Platform overview"
      subtitle="Health of the HotelHub multi-tenant platform"
      actions={
        <>
          <Link className="btn-secondary" href="/superadmin/plans">
            View plans
          </Link>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Create hotel
          </button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <PageLoader label="Loading platform stats…" />
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <EmptyState
          icon={Activity}
          title="Could not load platform stats"
          message={error.message}
          action={
            <button className="btn-secondary" onClick={reload}>
              Try again
            </button>
          }
        />
      </>
    );
  }

  if (!stats) {
    return (
      <>
        {header}
        <PageLoader label="Loading platform stats…" />
      </>
    );
  }

  const recent = hotels.slice(0, 6);
  return (
    <div>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Hotels" value={num(stats.hotels)} sub={`${num(stats.new_hotels)} new in 30 days`} icon={Building2} tone="brand" />
        <StatCard label="Active hotels" value={num(stats.active_hotels)} sub={`${num(stats.suspended)} suspended`} icon={Star} tone="emerald" />
        <StatCard label="MRR" value={money(stats.mrr)} sub="Monthly recurring revenue" icon={Wallet} tone="violet" />
        <StatCard label="Booking value" value={compactMoney(stats.booking_value)} sub={`${num(stats.bookings)} lifetime bookings`} icon={IndianRupee} tone="amber" />
        <StatCard label="Bookings" value={num(stats.bookings)} sub="Across all properties" icon={CalendarCheck} tone="brand" />
        <StatCard label="Rooms live" value={num(stats.rooms)} sub="Active rooms on platform" icon={BedDouble} tone="ink" />
        <StatCard label="Hotel users" value={num(stats.hotel_users)} sub="Staff & admin accounts" icon={Users} tone="ink" />
        <StatCard
          label="Avg guest rating"
          value={Number(stats.avg_rating || 0).toFixed(2)}
          sub="Out of 5 from all reviews"
          icon={Star}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900">Hotel signups</h3>
              <p className="text-[12.5px] text-ink-500">New properties onboarded per month</p>
            </div>
            <Badge tone="bg-brand-100 text-brand-700">{num(stats.hotels)} total</Badge>
          </div>
          {stats.trend?.length ? (
            <Bars
              data={stats.trend}
              xKey="month"
              series={[{ key: 'hotels', label: 'Hotels', color: '#3b66f6' }]}
              height={250}
            />
          ) : (
            <EmptyState icon={Activity} title="No signup trend yet" message="New hotels will show up here as they join." />
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink-900">Plan distribution</h3>
          <p className="mb-4 text-[12.5px] text-ink-500">Hotels per subscription plan</p>
          {hotelsLoading ? (
            <div className="skeleton h-[190px] w-full" />
          ) : planMix.length ? (
            <Donut data={planMix} height={190} />
          ) : (
            <EmptyState icon={Wallet} title="No hotels yet" />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900">Recent hotels</h3>
              <p className="text-[12.5px] text-ink-500">Latest properties added to the platform</p>
            </div>
            <Link className="btn-ghost btn-sm" href="/superadmin/hotels">
              Manage <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-3">
            <DataTable
              loading={hotelsLoading}
              rows={recent}
              columns={[
                {
                  key: 'name',
                  label: 'Hotel',
                  render: (r) => (
                    <div>
                      <p className="font-semibold text-ink-900">{r.name}</p>
                      <p className="text-[12px] text-ink-400">{r.slug}</p>
                    </div>
                  ),
                },
                { key: 'city', label: 'City', render: (r) => r.city || '—' },
                { key: 'plan_name', label: 'Plan', render: (r) => r.plan_name || '—' },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'created_at', label: 'Created', render: (r) => fmtDate(r.created_at) },
              ]}
            />
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900">Support queue</h3>
              <p className="text-[12.5px] text-ink-500">{num(tickets.length)} tickets in inbox</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500/12 text-brand-600">
              <LifeBuoy size={18} />
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {[
              { label: 'Open', value: ticketCounts.open || 0, tone: 'bg-blue-100 text-blue-700' },
              { label: 'In progress', value: ticketCounts.in_progress || 0, tone: 'bg-amber-100 text-amber-700' },
              { label: 'Resolved', value: ticketCounts.resolved || 0, tone: 'bg-emerald-100 text-emerald-700' },
              { label: 'Closed', value: ticketCounts.closed || 0, tone: 'bg-ink-100 text-ink-600' },
            ].map((row) => (
              <li key={row.label} className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
                <span className="text-[13px] text-ink-600">{row.label}</span>
                <Badge tone={row.tone}>{num(row.value)}</Badge>
              </li>
            ))}
          </ul>

          {tickets[0] && (
            <div className="mt-4 rounded-xl border border-ink-100 p-3.5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Latest ticket</p>
              <p className="mt-1 line-clamp-2 text-[13.5px] font-medium text-ink-800">{tickets[0].subject}</p>
              <p className="mt-1 text-[12px] text-ink-400">
                {tickets[0].hotel_name || 'Platform'} · {relative(tickets[0].updated_at)}
              </p>
            </div>
          )}

          <Link className="btn-secondary mt-4 w-full" href="/superadmin/support">
            Open support inbox <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
