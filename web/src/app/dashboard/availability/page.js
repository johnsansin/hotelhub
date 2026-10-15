'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, CalendarRange, BedDouble, LogIn, LogOut, Users, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useFetch, useList } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { money, fmtDate, num, pct } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Badge, Spinner } from '@/components/ui/kit';
import { Select } from '@/components/ui/table';
import { Drawer } from '@/components/ui/Modal';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function cellTone(occ) {
  if (occ > 90) return 'border-rose-300 bg-rose-500/18 text-rose-700';
  if (occ >= 70) return 'border-amber-300 bg-amber-500/18 text-amber-700';
  return 'border-emerald-300 bg-emerald-500/14 text-emerald-700';
}

function barTone(occ) {
  if (occ > 90) return 'bg-rose-500';
  if (occ >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function dayMetrics(rec) {
  let booked = 0;
  let total = 0;
  let blocked = 0;
  Object.values(rec?.byType || {}).forEach((v) => {
    booked += Number(v.booked || 0);
    total += Number(v.total || 0);
    blocked += Number(v.blocked || 0);
  });
  const occ = total ? (booked / total) * 100 : 0;
  return { booked, total, blocked, occ };
}

export default function AvailabilityPage() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [typeId, setTypeId] = useState('');
  const [day, setDay] = useState(null);

  const from = month.format('YYYY-MM-01');
  const to = month.add(1, 'month').format('YYYY-MM-01');
  const bookingTo = month.endOf('month').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');

  const avail = useFetch('/rooms/availability' + qs({ from, to, room_type_id: typeId || undefined }));
  const bookings = useFetch('/bookings' + qs({ from, to: bookingTo, limit: 200 }));
  const { items: types } = useList('/rooms/types', { limit: 100 });
  const dayView = useFetch('/frontdesk/today' + qs({ date: day }), { enabled: !!day });

  const codeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t.code || t.name])), [types]);
  const nameById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t.name])), [types]);
  const byDate = useMemo(
    () => Object.fromEntries((avail.data?.items || []).map((d) => [d.date, d])),
    [avail.data]
  );

  const cells = useMemo(() => {
    const lead = (month.day() + 6) % 7;
    const out = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= month.daysInMonth(); d += 1) out.push(month.date(d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const kpis = useMemo(() => {
    const days = avail.data?.items || [];
    if (!days.length) return null;
    let sold = 0;
    let capacity = 0;
    let peak = null;
    days.forEach((d) => {
      const m = dayMetrics(d);
      sold += m.booked;
      capacity += m.total;
      if (!peak || m.occ > peak.occ) peak = { date: d.date, occ: m.occ, ...m };
    });
    let revenue = 0;
    (bookings.data?.items || []).forEach((b) => {
      if (['cancelled', 'no_show'].includes(b.status)) return;
      const ci = dayjs(b.check_in);
      const co = dayjs(b.check_out);
      const start = ci.isBefore(month) ? month : ci;
      const end = co.isAfter(month.add(1, 'month')) ? month.add(1, 'month') : co;
      const n = end.diff(start, 'day');
      if (n <= 0) return;
      const rate = Number(b.rate) || Number(b.total_amount || 0) / Math.max(1, Number(b.nights) || 1);
      revenue += rate * n;
    });
    const inventory = (() => {
      const first = days[0];
      return Object.values(first.byType || {}).reduce((s, v) => s + Number(v.total || 0), 0);
    })();
    return {
      occupancy: capacity ? (sold / capacity) * 100 : 0,
      adr: sold ? revenue / sold : 0,
      revpar: capacity ? revenue / capacity : 0,
      sold,
      capacity,
      revenue,
      peak,
      inventory,
    };
  }, [avail.data, bookings.data, month]);

  const dayRec = day ? byDate[day] : null;
  const dayMix = useMemo(() => {
    if (!dayRec) return [];
    return Object.entries(dayRec.byType || {}).map(([id, v]) => ({
      id,
      name: nameById[id] || codeById[id] || 'Room type',
      ...v,
    }));
  }, [dayRec, nameById, codeById]);

  function shift(n) {
    setMonth((m) => m.add(n, 'month'));
    setDay(null);
  }

  return (
    <div>
      <PageHeader
        title="Availability"
        subtitle="Nightly occupancy calendar across the whole inventory"
        actions={
          <>
            <Select value={typeId} onChange={setTypeId} className="w-full sm:w-52">
              <option value="">All room types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-soft">
              <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" onClick={() => shift(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <button
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-100"
                onClick={() => { setMonth(dayjs().startOf('month')); setDay(null); }}
              >
                Today
              </button>
              <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" onClick={() => shift(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={kpis ? pct(kpis.occupancy) : '—'}
          sub={kpis ? `${num(kpis.sold)} of ${num(kpis.capacity)} room-nights` : 'loading range'}
          icon={CalendarRange}
          tone="brand"
        />
        <StatCard label="ADR" value={kpis ? money(kpis.adr) : '—'} sub="average daily rate" icon={BedDouble} tone="emerald" />
        <StatCard label="RevPAR" value={kpis ? money(kpis.revpar) : '—'} sub={kpis ? `${money(kpis.revenue)} room revenue` : 'per available room'} icon={CalendarRange} tone="violet" />
        <StatCard
          label="Busiest night"
          value={kpis?.peak ? fmtDate(kpis.peak.date, 'short') : '—'}
          sub={kpis?.peak ? `${pct(kpis.peak.occ)} · ${kpis.peak.booked}/${kpis.peak.total} sold` : '—'}
          icon={AlertTriangle}
          tone={kpis?.peak && kpis.peak.occ > 90 ? 'rose' : 'amber'}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">{month.format('MMMM YYYY')}</h3>
            <p className="text-[12.5px] text-ink-500">
              {typeId ? nameById[typeId] || 'Selected type' : 'All room types'} · {kpis ? num(kpis.inventory) : '—'} rooms in inventory
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-medium text-ink-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-500/30" /> Under 70%</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-500/30" /> 70–90%</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-rose-300 bg-rose-500/30" /> Over 90%</span>
            <span className="hidden text-ink-400 sm:inline">· cell shows rooms sold / inventory</span>
          </div>
        </div>

        {avail.error && (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load availability"
            message={avail.error.message}
            action={<button className="btn-secondary btn-sm" onClick={avail.reload}>Retry</button>}
          />
        )}

        {!avail.error && (
          <div className="p-3 sm:p-5">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {avail.loading &&
                Array.from({ length: 35 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
              {!avail.loading &&
                cells.map((d, i) => {
                  if (!d) return <div key={`x${i}`} className="min-h-24 rounded-xl border border-dashed border-ink-100 bg-ink-50/50" />;
                  const dateStr = d.format('YYYY-MM-DD');
                  const rec = byDate[dateStr];
                  const m = dayMetrics(rec);
                  const isToday = dateStr === today;
                  const chips = Object.entries(rec?.byType || {})
                    .map(([id, v]) => ({ id, label: codeById[id] || '—', booked: v.booked, total: v.total, occ: v.total ? (v.booked / v.total) * 100 : 0 }))
                    .sort((a, b) => b.occ - a.occ);
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setDay(dateStr)}
                      className={clsx(
                        'group min-h-24 rounded-xl border p-2 text-left transition',
                        rec ? cellTone(m.occ) : 'border-ink-100 bg-white',
                        day === dateStr ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:shadow-card'
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={clsx(
                            'grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold',
                            isToday ? 'bg-brand-600 text-white' : 'text-ink-700'
                          )}
                        >
                          {d.date()}
                        </span>
                        {m.blocked > 0 && (
                          <span className="chip bg-ink-800/10 text-ink-700">{m.blocked} OOO</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-bold leading-tight">
                        {rec ? `${m.booked}/${m.total}` : '—'}
                        <span className="ml-1 text-[10.5px] font-semibold opacity-70">{rec ? pct(m.occ, 0) : ''}</span>
                      </p>
                      <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
                        {chips.slice(0, 2).map((c) => (
                          <span key={c.id} className="rounded bg-white/70 px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide">
                            {c.label} {c.booked}/{c.total}
                          </span>
                        ))}
                        {chips.length > 2 && (
                          <span className="rounded bg-white/70 px-1 py-0.5 text-[9.5px] font-semibold">+{chips.length - 2}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      <Drawer open={!!day} onClose={() => setDay(null)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Day detail</p>
              <h3 className="text-base font-semibold text-ink-900">{fmtDate(day, 'long')}</h3>
            </div>
            <button className="text-[13px] font-semibold text-ink-500 hover:text-ink-800" onClick={() => setDay(null)}>Close</button>
          </div>

          {dayView.loading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-400"><Spinner size={18} /> Loading day…</div>
          )}

          {dayView.error && (
            <div className="p-5 text-sm text-rose-600">{dayView.error.message}</div>
          )}

          {!dayView.loading && !dayView.error && dayView.data && (
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase text-brand-600">Arrivals</p>
                  <p className="text-lg font-bold text-ink-900">{dayView.data.arrivals.length}</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase text-amber-600">Departures</p>
                  <p className="text-lg font-bold text-ink-900">{dayView.data.departures.length}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase text-emerald-600">In house</p>
                  <p className="text-lg font-bold text-ink-900">{dayView.data.in_house.length}</p>
                </div>
              </div>

              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-800"><LogIn size={14} className="text-emerald-600" /> Arrivals</h4>
                {dayView.data.arrivals.length === 0 ? (
                  <p className="text-[13px] text-ink-400">No arrivals expected.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayView.data.arrivals.map((b) => (
                      <li key={b.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13.5px] font-semibold text-ink-900">{b.guest_name}</p>
                          <StatusBadge status={b.status} />
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {b.code} · {b.room_type_name || 'Room type'} · {b.room_number ? `Room ${b.room_number}` : 'Unassigned'} · {money(b.total_amount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-800"><LogOut size={14} className="text-amber-600" /> Departures</h4>
                {dayView.data.departures.length === 0 ? (
                  <p className="text-[13px] text-ink-400">No departures today.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayView.data.departures.map((b) => (
                      <li key={b.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13.5px] font-semibold text-ink-900">{b.guest_name}</p>
                          <span className={clsx('chip', Number(b.due) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                            {Number(b.due) > 0 ? `${money(b.due)} due` : 'Settled'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-500">{b.code} · {b.room_number || b.room_type_name} · out {b.check_out}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-800"><BedDouble size={14} className="text-brand-600" /> Room type mix</h4>
                <ul className="space-y-2">
                  {dayMix.map((t) => (
                    <li key={t.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-semibold text-ink-900">{t.name}</span>
                        <span className="text-ink-500">{t.booked}/{t.total} sold · {t.available} free</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className={clsx('h-full rounded-full', barTone(t.total ? (t.booked / t.total) * 100 : 0))}
                          style={{ width: `${t.total ? Math.min(100, (t.booked / t.total) * 100) : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                  {dayMix.length === 0 && <li className="text-[13px] text-ink-400">No inventory data for this day.</li>}
                </ul>
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-800"><Users size={14} className="text-violet-600" /> In house ({dayView.data.in_house.length})</h4>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {dayView.data.in_house.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px]">
                      <span className="truncate font-medium text-ink-800">{b.room_number} · {b.guest_name}</span>
                      <span className="shrink-0 text-ink-400">out {b.check_out}</span>
                    </li>
                  ))}
                  {dayView.data.in_house.length === 0 && <li className="text-[13px] text-ink-400">Nobody in house.</li>}
                </ul>
              </section>

              {dayRec && (
                <section>
                  <h4 className="mb-2 text-[13px] font-semibold text-ink-800">Inventory snapshot</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="bg-brand-100 text-brand-700">{dayMetrics(dayRec).booked} sold</Badge>
                    <Badge tone="bg-emerald-100 text-emerald-700">{dayMetrics(dayRec).total - dayMetrics(dayRec).booked - dayMetrics(dayRec).blocked} free</Badge>
                    {dayMetrics(dayRec).blocked > 0 && <Badge tone="bg-ink-200 text-ink-700">{dayMetrics(dayRec).blocked} blocked</Badge>}
                    <Badge>{pct(dayMetrics(dayRec).occ)} occupancy</Badge>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
