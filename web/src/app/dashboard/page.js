'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import {
  BedDouble,
  CalendarCheck,
  IndianRupee,
  AlertTriangle,
  LogIn,
  LogOut,
  Users,
  Sparkles,
  Wrench,
  Star,
  ArrowRight,
  Package,
  UtensilsCrossed,
  Bell,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useFetch } from '@/lib/hooks';
import { money, num, pct, fmtDate, relative, statusLabel } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, PageLoader, Badge } from '@/components/ui/kit';
import { TrendArea, Donut, Bars } from '@/components/Chart';

const ALERT_TONES = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-brand-200 bg-brand-50 text-brand-700',
};

const ALERT_ICONS = {
  stock: Package,
  housekeeping: Sparkles,
  maintenance: Wrench,
  payments: IndianRupee,
  restaurant: UtensilsCrossed,
};

function MiniList({ title, icon: Icon, tone, items, empty, href, render }) {
  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink-800">
          <Icon size={16} className={tone} /> {title}
        </h3>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">
            View all <ArrowRight size={13} />
          </Link>
        )}
      </div>
      <div className="flex-1 p-3">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-400">{empty}</p>
        ) : (
          <ul className="space-y-1.5">{items.map(render)}</ul>
        )}
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const { data, loading, error, reload } = useFetch('/dashboard');

  const roomMix = useMemo(() => {
    const k = data?.kpi;
    if (!k) return [];
    return [
      { name: 'Occupied', value: k.occupied, color: '#3b66f6' },
      { name: 'Available', value: k.available, color: '#10b981' },
      { name: 'Cleaning', value: k.cleaning, color: '#f59e0b' },
      { name: 'Out of order', value: k.out_of_order, color: '#f43f5e' },
    ].filter((x) => x.value > 0);
  }, [data]);

  if (loading && !data) return <PageLoader label="Loading dashboard…" />;

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the dashboard"
          message={error.message}
          action={<button className="btn-primary btn-sm" onClick={reload}>Retry</button>}
        />
      </div>
    );
  }

  const k = data?.kpi || {};
  const arrivals = data?.arrivals || [];
  const departures = data?.departures || [];
  const inHouse = data?.in_house || [];
  const alerts = data?.alerts || [];
  const tasks = data?.tasks || [];
  const activity = data?.activity || [];
  const topRooms = data?.top_rooms || [];
  const reviews = data?.recent_reviews || [];
  const revenue = data?.revenue || [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Operational snapshot for ${fmtDate(data?.date, 'long')}`}
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={reload}>Refresh</button>
            <Link className="btn-primary btn-sm" href="/dashboard/bookings">
              <CalendarCheck size={15} /> New booking
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={pct(k.occupancy, 0)}
          sub={`${num(k.occupied)} of ${num(k.total_rooms)} rooms`}
          icon={BedDouble}
          tone="brand"
        />
        <StatCard
          label="Arrivals today"
          value={num(k.arrivals_today)}
          sub={`${num(k.upcoming)} upcoming confirmed`}
          icon={LogIn}
          tone="emerald"
        />
        <StatCard
          label="Departures today"
          value={num(k.departures_today)}
          sub={`${num(k.in_house)} guests in house`}
          icon={LogOut}
          tone="violet"
        />
        <StatCard
          label="Revenue today"
          value={money((Number(k.room_revenue_today) || 0) + (Number(k.fnb_today) || 0) + (Number(k.pos_today) || 0))}
          sub={`Rooms ${money(k.room_revenue_today)}`}
          icon={IndianRupee}
          tone="amber"
        />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Room revenue" value={money(k.room_revenue_today)} sub="check-ins today" icon={BedDouble} tone="brand" />
        <StatCard label="F&B today" value={money(k.fnb_today)} sub="restaurant orders" icon={UtensilsCrossed} tone="emerald" />
        <StatCard label="POS sales" value={money(k.pos_today)} sub="retail / counter" icon={IndianRupee} tone="violet" />
        <StatCard
          label="Outstanding dues"
          value={money(k.dues)}
          sub="across open folios"
          icon={AlertTriangle}
          tone={Number(k.dues) > 0 ? 'rose' : 'ink'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-ink-800">Revenue · last 7 days</h3>
            <div className="flex items-center gap-3 text-[11.5px] font-medium text-ink-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Rooms</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold-400" /> F&B</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> POS</span>
            </div>
          </div>
          <div className="p-4">
            {revenue.length ? (
              <TrendArea
                data={revenue}
                xKey="day"
                money
                series={[
                  { key: 'rooms', label: 'Rooms', color: '#3b66f6' },
                  { key: 'fnb', label: 'F&B', color: '#d0a445' },
                  { key: 'pos', label: 'POS', color: '#10b981' },
                ]}
              />
            ) : (
              <p className="py-10 text-center text-sm text-ink-400">No revenue recorded in the last 7 days.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="border-b border-ink-100 px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-ink-800">Room status</h3>
          </div>
          <div className="p-5">
            {roomMix.length ? <Donut data={roomMix} /> : <p className="py-8 text-center text-sm text-ink-400">No rooms configured.</p>}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-100 pt-4 text-[12.5px]">
              <div className="flex items-center justify-between"><span className="text-ink-500">Avg rating</span><span className="font-semibold text-ink-900">{k.avg_rating || '—'} ★</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-500">Reviews</span><span className="font-semibold text-ink-900">{num(k.review_count)}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-500">Staff</span><span className="font-semibold text-ink-900">{num(k.staff_count)}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-500">In house</span><span className="font-semibold text-ink-900">{num(k.in_house)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {alerts.map((a, i) => {
            const Icon = ALERT_ICONS[a.type] || Bell;
            return (
              <Link
                key={i}
                href={a.link || '#'}
                className={clsx('flex items-start gap-3 rounded-2xl border px-4 py-3 transition hover:shadow-card', ALERT_TONES[a.level] || ALERT_TONES.info)}
              >
                <Icon size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{a.title}</p>
                  {a.detail && <p className="mt-0.5 truncate text-[12.5px] opacity-80">{a.detail}</p>}
                </div>
                <ArrowRight size={15} className="ml-auto mt-0.5 shrink-0 opacity-70" />
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MiniList
          title={`Arrivals today (${arrivals.length})`}
          icon={LogIn}
          tone="text-emerald-600"
          href="/dashboard/frontdesk"
          empty="No arrivals expected today."
          items={arrivals}
          render={(b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">{b.guest_name}</p>
                <p className="truncate text-[12px] text-ink-500">
                  {b.code} · {b.room_type_name || 'Room type'} · {b.room_number ? `Room ${b.room_number}` : 'Unassigned'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12.5px] font-semibold text-ink-900">{money(b.total_amount)}</p>
                <StatusBadge status={b.status} className="mt-0.5" />
              </div>
            </li>
          )}
        />

        <MiniList
          title={`Departures today (${departures.length})`}
          icon={LogOut}
          tone="text-amber-600"
          href="/dashboard/frontdesk"
          empty="No departures scheduled today."
          items={departures}
          render={(b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">{b.guest_name}</p>
                <p className="truncate text-[12px] text-ink-500">
                  {b.code} · {b.room_number || b.room_type_name || '—'}
                </p>
              </div>
              <span className={clsx('chip shrink-0', Number(b.due) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                {Number(b.due) > 0 ? `${money(b.due)} due` : 'Settled'}
              </span>
            </li>
          )}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink-800"><Users size={16} className="text-brand-600" /> In house ({inHouse.length})</h3>
            <Link href="/dashboard/frontdesk" className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">
              Front desk <ArrowRight size={13} />
            </Link>
          </div>
          <div className="table-wrap">
            {inHouse.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-ink-400">No guests currently in house.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Guest</th>
                    <th>Stay</th>
                    <th className="text-right">Folio</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {inHouse.map((b) => (
                    <tr key={b.id}>
                      <td><span className="chip bg-brand-100 text-brand-700">{b.room_number || '—'}</span></td>
                      <td>
                        <p className="font-semibold text-ink-900">{b.guest_name}</p>
                        <p className="text-[11.5px] text-ink-400">{b.code}</p>
                      </td>
                      <td className="text-[12.5px] text-ink-600">
                        {fmtDate(b.check_in, 'short')} → {fmtDate(b.check_out, 'short')}
                      </td>
                      <td className="text-right text-[12.5px] font-medium text-ink-800">{money(b.total_amount)}</td>
                      <td className="text-right">
                        <span className={clsx('chip', Number(b.due) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                          {Number(b.due) > 0 ? money(b.due) : 'Paid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <MiniList
          title={`Housekeeping (${tasks.length})`}
          icon={Sparkles}
          tone="text-violet-600"
          href="/dashboard/housekeeping"
          empty="All rooms are clean. Nice!"
          items={tasks}
          render={(t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">{t.room_number ? `Room ${t.room_number}` : 'Unassigned'}</p>
                <p className="truncate text-[12px] text-ink-500">{statusLabel(t.type)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {t.priority && t.priority !== 'normal' && <Badge tone={t.priority === 'high' || t.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}>{statusLabel(t.priority)}</Badge>}
                <StatusBadge status={t.status} />
              </div>
            </li>
          )}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="border-b border-ink-100 px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-ink-800">Top room types</h3>
            <p className="text-[12px] text-ink-400">Last 3 months by revenue</p>
          </div>
          <div className="p-4">
            {topRooms.length ? (
              <Bars
                horizontal
                height={200}
                money
                data={topRooms.map((t) => ({ name: t.name, revenue: Number(t.revenue) }))}
                xKey="name"
                series={[{ key: 'revenue', label: 'Revenue', color: '#3b66f6' }]}
              />
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">No bookings yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-ink-800">Recent reviews</h3>
            <Link href="/dashboard/reviews" className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">All</Link>
          </div>
          <div className="p-4">
            {reviews.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((rv) => (
                  <li key={rv.id} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink-900">{rv.guest_name || 'Guest'}</p>
                      <span className="flex items-center gap-0.5 text-[12.5px] font-semibold text-amber-500">
                        {rv.rating} <Star size={12} fill="currentColor" />
                      </span>
                    </div>
                    {rv.comment && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-500">{rv.comment}</p>}
                    <p className="mt-1 text-[11px] text-ink-400">{relative(rv.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="border-b border-ink-100 px-5 py-3.5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink-800"><Bell size={15} className="text-brand-600" /> Activity</h3>
          </div>
          <div className="p-4">
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">No recent activity.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((n) => (
                  <li key={n.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink-800">{n.title}</p>
                      {n.message && <p className="truncate text-[12.5px] text-ink-500">{n.message}</p>}
                      <p className="text-[11px] text-ink-400">{relative(n.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
