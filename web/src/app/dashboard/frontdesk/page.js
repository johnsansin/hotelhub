'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogIn,
  LogOut,
  BedDouble,
  Sparkles,
  AlertTriangle,
  Users,
  Phone,
  DoorOpen,
  Plus,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useFetch } from '@/lib/hooks';
import { api, qs } from '@/lib/api';
import { money, num, fmtDate, statusLabel } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, PageLoader, Badge, Spinner, Tabs } from '@/components/ui/kit';
import { Modal, Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const ROOM_TONES = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  occupied: 'border-brand-300 bg-brand-50 text-brand-700',
  cleaning: 'border-amber-300 bg-amber-50 text-amber-700',
  maintenance: 'border-rose-300 bg-rose-50 text-rose-700',
  out_of_order: 'border-rose-400 bg-rose-100 text-rose-800',
  blocked: 'border-ink-300 bg-ink-100 text-ink-600',
};

const ROOM_OPTIONS = ['available', 'occupied', 'cleaning', 'maintenance', 'blocked', 'out_of_order'];

function roomTone(status) {
  return ROOM_TONES[status] || 'border-ink-200 bg-white text-ink-600';
}

function CheckInModal({ booking, onClose, onDone }) {
  const toast = useToast();
  const [roomId, setRoomId] = useState('');
  const [saving, setSaving] = useState(false);
  const free = useFetch(
    booking
      ? `/rooms/free-rooms${qs({ room_type_id: booking.room_type_id, from: booking.check_in, to: booking.check_out, booking_id: booking.id })}`
      : '/rooms/free-rooms',
    { enabled: !!booking }
  );
  const rooms = free.data?.items || [];

  async function submit(auto) {
    setSaving(true);
    try {
      await api.post(`/bookings/${booking.id}/check-in`, auto ? {} : { room_id: roomId || undefined });
      toast.success('Guest checked in');
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      title="Check in guest"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => submit(true)} disabled={saving || rooms.length === 0}>
            {saving ? 'Checking in…' : 'Auto-assign & check in'}
          </button>
        </>
      }
    >
      {booking && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 px-4 py-3">
            <p className="text-[14px] font-semibold text-ink-900">{booking.guest_name}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              {booking.code} · {booking.room_type_name || 'Room type'} · {fmtDate(booking.check_in, 'short')} → {fmtDate(booking.check_out, 'short')} · {money(booking.total_amount)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-ink-600">Assign a specific room (optional)</p>
            {free.loading && <div className="flex items-center gap-2 text-sm text-ink-400"><Spinner size={16} /> Finding free rooms…</div>}
            {!free.loading && rooms.length === 0 && (
              <p className="text-[13px] text-rose-600">No free rooms of this type are available for the selected dates.</p>
            )}
            {!free.loading && rooms.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {rooms.map((rm) => (
                  <button
                    key={rm.id}
                    onClick={() => setRoomId(String(rm.id))}
                    className={clsx(
                      'rounded-xl border px-3 py-2.5 text-center transition',
                      String(roomId) === String(rm.id)
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30'
                        : 'border-ink-200 hover:border-brand-300 hover:bg-brand-50/40'
                    )}
                  >
                    <p className="text-[14px] font-bold text-ink-900">{rm.number}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">{statusLabel(rm.status || 'available')}</p>
                  </button>
                ))}
              </div>
            )}
            {roomId && (
              <button className="btn-secondary btn-sm mt-3" onClick={() => submit(false)} disabled={saving}>
                Check in to room {rooms.find((x) => String(x.id) === String(roomId))?.number}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function RoomDrawer({ room, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!room) return null;

  async function setStatus(status) {
    setBusy(true);
    try {
      await api.post('/frontdesk/room-status', { room_id: room.id, status });
      toast.success(`Room ${room.number} set to ${statusLabel(status)}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function markClean() {
    setBusy(true);
    try {
      await api.post('/frontdesk/mark-clean', { room_id: room.id, status: 'clean' });
      toast.success(`Room ${room.number} marked clean`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={!!room} onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Room detail</p>
            <h3 className="text-lg font-bold text-ink-900">{room.number}</h3>
            <p className="text-[12.5px] text-ink-500">{room.room_type_name || 'Unassigned type'} · Floor {room.floor || '—'}</p>
          </div>
          <button className="text-[13px] font-semibold text-ink-500 hover:text-ink-800" onClick={onClose}>Close</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={roomTone(room.status)}>{statusLabel(room.status)}</Badge>
            <Badge tone="bg-ink-100 text-ink-600">Housekeeping: {statusLabel(room.housekeeping || '—')}</Badge>
            {room.view && <Badge tone="bg-ink-100 text-ink-600">{room.view} view</Badge>}
          </div>

          {room.booking_id && (
            <section className="rounded-xl border border-ink-100 p-4">
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Current guest</h4>
              <p className="text-[14px] font-semibold text-ink-900">{room.guest_name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-500">{room.code} · {fmtDate(room.check_in, 'short')} → {fmtDate(room.check_out, 'short')}</p>
              <div className="mt-2 flex items-center justify-between text-[12.5px]">
                <span className="text-ink-500">Folio {money(room.total_amount)}</span>
                <span className="font-semibold text-ink-800">Paid {money(room.paid_amount)}</span>
              </div>
            </section>
          )}

          {room.hk_status && (
            <section className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <h4 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-amber-600">
                <Sparkles size={13} /> Housekeeping
              </h4>
              <p className="text-[13px] text-ink-700">{statusLabel(room.hk_task || 'task')} · {statusLabel(room.hk_status)}</p>
              <button className="btn-secondary btn-sm mt-2.5" onClick={markClean} disabled={busy}>
                Mark room clean
              </button>
            </section>
          )}

          {room.note && <p className="rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] text-ink-600">{room.note}</p>}

          <section>
            <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Set status</h4>
            <div className="grid grid-cols-2 gap-2">
              {ROOM_OPTIONS.map((s) => (
                <button
                  key={s}
                  disabled={busy || s === room.status}
                  onClick={() => setStatus(s)}
                  className={clsx(
                    'rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition disabled:opacity-50',
                    s === room.status ? roomTone(s) : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                  )}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Drawer>
  );
}

export default function FrontDeskPage() {
  const toast = useToast();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [tab, setTab] = useState('arrivals');
  const [checkIn, setCheckIn] = useState(null);
  const [room, setRoom] = useState(null);
  const [confirmOut, setConfirmOut] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const today = useFetch(`/frontdesk/today${qs({ date })}`);
  const board = useFetch(`/frontdesk/room-board${qs({ date })}`);

  const summary = today.data?.summary || {};
  const arrivals = today.data?.arrivals || [];
  const departures = today.data?.departures || [];
  const inHouse = today.data?.in_house || [];
  const rooms = board.data?.items || [];

  const floors = useMemo(() => {
    const map = new Map();
    rooms.forEach((rm) => {
      const f = rm.floor || '—';
      if (!map.has(f)) map.set(f, []);
      map.get(f).push(rm);
    });
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
  }, [rooms]);

  function reloadAll() {
    today.reload();
    board.reload();
  }

  async function doCheckOut(b) {
    setBusyId(b.id);
    try {
      await api.post(`/bookings/${b.id}/check-out`, { settle: true });
      toast.success(`${b.guest_name} checked out`);
      reloadAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
      setConfirmOut(null);
    }
  }

  if (today.loading && !today.data && board.loading && !board.data) {
    return <PageLoader label="Loading front desk…" />;
  }

  return (
    <div>
      <PageHeader
        title="Front Desk"
        subtitle={fmtDate(date, 'long')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-soft">
              <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))} aria-label="Previous day">
                <ChevronLeft size={16} />
              </button>
              <button className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-100" onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}>
                Today
              </button>
              <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))} aria-label="Next day">
                <ChevronRight size={16} />
              </button>
            </div>
            <button className="btn-secondary btn-sm" onClick={reloadAll}><RefreshCw size={14} /> Refresh</button>
            <Link className="btn-primary btn-sm" href="/dashboard/bookings"><Plus size={15} /> New booking</Link>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Occupied" value={`${num(summary.occupied)}/${num(summary.total_rooms)}`} sub={`${summary.total_rooms ? Math.round((summary.occupied / summary.total_rooms) * 100) : 0}% occupancy`} icon={BedDouble} tone="brand" />
        <StatCard label="Arrivals" value={num(arrivals.length)} sub="expected today" icon={LogIn} tone="emerald" />
        <StatCard label="Departures" value={num(departures.length)} sub="expected today" icon={LogOut} tone="violet" />
        <StatCard label="Needs attention" value={num((summary.cleaning || 0) + (summary.ooo || 0))} sub={`${num(summary.cleaning)} cleaning · ${num(summary.ooo)} out of order`} icon={AlertTriangle} tone={(summary.ooo || 0) > 0 ? 'rose' : 'amber'} />
      </div>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'arrivals', label: 'Arrivals', count: arrivals.length },
          { id: 'departures', label: 'Departures', count: departures.length },
          { id: 'inhouse', label: 'In house', count: inHouse.length },
          { id: 'board', label: 'Room board', count: rooms.length },
        ]}
      />

      {tab === 'arrivals' && (
        <div className="card overflow-hidden">
          {today.error && <EmptyState icon={AlertTriangle} title="Could not load arrivals" message={today.error.message} action={<button className="btn-secondary btn-sm" onClick={today.reload}>Retry</button>} />}
          {!today.error && arrivals.length === 0 && <EmptyState icon={LogIn} title="No arrivals" message="There are no expected arrivals for this date." />}
          {!today.error && arrivals.length > 0 && (
            <ul className="divide-y divide-ink-100">
              {arrivals.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><LogIn size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink-900">{b.guest_name}</p>
                    <p className="truncate text-[12.5px] text-ink-500">
                      {b.code} · {b.room_type_name || 'Room type'} · {b.room_number ? `Room ${b.room_number}` : 'Unassigned'} · {num(b.adults)}A{Number(b.children) ? ` ${num(b.children)}C` : ''}
                    </p>
                  </div>
                  {b.guest_phone && <span className="hidden items-center gap-1.5 text-[12.5px] text-ink-500 sm:flex"><Phone size={13} /> {b.guest_phone}</span>}
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-ink-900">{money(b.total_amount)}</p>
                    <p className="text-[11.5px] text-ink-400">Paid {money(b.paid_amount)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                  <button className="btn-primary btn-sm" onClick={() => setCheckIn(b)}><LogIn size={14} /> Check in</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'departures' && (
        <div className="card overflow-hidden">
          {!today.error && departures.length === 0 && <EmptyState icon={LogOut} title="No departures" message="No departures are expected for this date." />}
          {!today.error && departures.length > 0 && (
            <ul className="divide-y divide-ink-100">
              {departures.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><LogOut size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink-900">{b.guest_name}</p>
                    <p className="truncate text-[12.5px] text-ink-500">{b.code} · {b.room_number || b.room_type_name || '—'}</p>
                  </div>
                  <span className={clsx('chip', Number(b.due) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                    {Number(b.due) > 0 ? `${money(b.due)} due` : 'Settled'}
                  </span>
                  <StatusBadge status={b.status} />
                  {b.status === 'checked_in' ? (
                    <button className="btn-primary btn-sm" onClick={() => setConfirmOut(b)} disabled={busyId === b.id}>
                      {busyId === b.id ? <Spinner size={14} /> : <LogOut size={14} />} Check out
                    </button>
                  ) : (
                    <button className="btn-secondary btn-sm" onClick={() => setCheckIn(b)}><LogIn size={14} /> Check in</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'inhouse' && (
        <div className="card overflow-hidden">
          {inHouse.length === 0 ? (
            <EmptyState icon={Users} title="Nobody in house" message="No guests are currently checked in." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Guest</th>
                    <th>Dates</th>
                    <th className="text-right">Folio</th>
                    <th className="text-right">Balance</th>
                    <th></th>
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
                      <td className="text-[12.5px] text-ink-600">{fmtDate(b.check_in, 'short')} → {fmtDate(b.check_out, 'short')}</td>
                      <td className="text-right text-[12.5px] font-medium text-ink-800">{money(b.total_amount)}</td>
                      <td className="text-right"><span className={clsx('chip', Number(b.due) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>{Number(b.due) > 0 ? money(b.due) : 'Paid'}</span></td>
                      <td className="text-right"><button className="btn-secondary btn-sm" onClick={() => setConfirmOut(b)}><LogOut size={14} /> Check out</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'board' && (
        <div className="space-y-5">
          {board.error && <EmptyState icon={AlertTriangle} title="Could not load the room board" message={board.error.message} action={<button className="btn-secondary btn-sm" onClick={board.reload}>Retry</button>} />}
          {!board.error && rooms.length === 0 && <EmptyState icon={DoorOpen} title="No rooms" message="Add rooms to see the live board." />}
          {floors.map(([floor, list]) => (
            <div key={floor}>
              <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-400">
                <DoorOpen size={14} /> Floor {floor}
                <span className="text-ink-300">· {list.length} rooms</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {list.map((rm) => (
                  <button
                    key={rm.id}
                    onClick={() => setRoom(rm)}
                    className={clsx('rounded-2xl border p-3 text-left transition hover:shadow-card', roomTone(rm.status))}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[16px] font-bold">{rm.number}</span>
                      <span className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />
                    </div>
                    <p className="mt-1 truncate text-[11px] font-medium opacity-80">{rm.room_type_name || '—'}</p>
                    <p className="mt-1.5 truncate text-[11px] font-semibold">
                      {rm.guest_name || statusLabel(rm.status)}
                    </p>
                    {rm.hk_status && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium opacity-75">
                        <Sparkles size={10} /> {statusLabel(rm.hk_status)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-medium text-ink-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-brand-300 bg-brand-50" /> Occupied</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Cleaning</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-rose-300 bg-rose-50" /> Maintenance</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-ink-300 bg-ink-100" /> Blocked</span>
          </div>
        </div>
      )}

      <CheckInModal
        key={checkIn?.id || 'none'}
        booking={checkIn}
        onClose={() => setCheckIn(null)}
        onDone={reloadAll}
      />
      <RoomDrawer key={room?.id || 'none'} room={room} onClose={() => setRoom(null)} onDone={reloadAll} />
      <ConfirmDialog
        open={!!confirmOut}
        onClose={() => setConfirmOut(null)}
        onConfirm={() => doCheckOut(confirmOut)}
        title="Check out guest"
        message={confirmOut ? `Check out ${confirmOut.guest_name}? The folio will be settled and the room sent to housekeeping.` : ''}
        confirmLabel="Check out"
      />
    </div>
  );
}
