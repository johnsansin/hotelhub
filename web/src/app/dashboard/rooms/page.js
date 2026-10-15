'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Plus, Pencil, Eye, Power, BedDouble, Users, Sparkles, Search as SearchIcon, LayoutGrid, Layers,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, statusLabel } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Badge, Avatar, Field } from '@/components/ui/kit';
import { SearchInput, Select, PaginationBar, Toggle } from '@/components/ui/table';
import { Modal, Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 24;
const ROOM_STATUS = ['available', 'occupied', 'cleaning', 'maintenance', 'blocked', 'out_of_order'];
const HK_STATUS = ['clean', 'dirty', 'inspected', 'in_progress'];

function RoomModal({ open, onClose, room, types, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(room || { status: 'available', housekeeping: 'clean', is_active: true });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const type = types.find((t) => t.id === form.room_type_id);

  async function submit() {
    if (!form.number) return toast.error('Room number is required');
    setSaving(true);
    try {
      const payload = {
        number: form.number,
        room_type_id: form.room_type_id || null,
        floor: form.floor || null,
        view: form.view || 'City',
        status: form.status || 'available',
        housekeeping: form.housekeeping || 'clean',
        is_active: form.is_active !== false,
        note: form.note || null,
      };
      if (room?.id) await api.put(`/rooms/${room.id}`, payload);
      else await api.post('/rooms', payload);
      toast.success(room?.id ? 'Room updated' : 'Room added');
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
      open={open}
      onClose={onClose}
      title={room?.id ? `Edit room ${room.number}` : 'Add room'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save room'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room number" required>
          <input className="input" value={form.number || ''} onChange={(e) => set('number', e.target.value)} placeholder="305" />
        </Field>
        <Field label="Floor">
          <input className="input" value={form.floor || ''} onChange={(e) => set('floor', e.target.value)} placeholder="3" />
        </Field>
        <Field label="Room type">
          <Select value={form.room_type_id || ''} onChange={(v) => set('room_type_id', v)}>
            <option value="">Unassigned</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Rate" hint="Room rate is set on the room type">
          <input className="input" value={type ? money(type.base_price) : '—'} readOnly disabled />
        </Field>
        <Field label="Status">
          <Select value={form.status || 'available'} onChange={(v) => set('status', v)}>
            {ROOM_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Housekeeping">
          <Select value={form.housekeeping || 'clean'} onChange={(v) => set('housekeeping', v)}>
            {HK_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="View">
          <input className="input" value={form.view || ''} onChange={(e) => set('view', e.target.value)} placeholder="Sea / Courtyard" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input className="input" value={form.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Extra pillow, creaky door…" />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={form.is_active !== false} onChange={(v) => set('is_active', v)} label="Active room (counted in inventory)" />
        </div>
      </div>
    </Modal>
  );
}

function TypeModal({ open, onClose, type, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(type || {});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name || !form.code) return toast.error('Name and code are required');
    setSaving(true);
    try {
      await api.put(`/rooms/types/${type.id}`, {
        name: form.name,
        code: form.code,
        base_price: Number(form.base_price || 0),
        weekend_price: Number(form.weekend_price || 0),
        peak_price: Number(form.peak_price || 0),
        max_adults: Number(form.max_adults || 2),
        max_children: Number(form.max_children || 0),
        bed_type: form.bed_type || 'King',
        size_sqft: Number(form.size_sqft || 0),
      });
      toast.success('Room type updated');
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
      open={open}
      onClose={onClose}
      title={`Edit ${type?.name || 'room type'}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save type'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Code" required>
          <input className="input" value={form.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="DLX" />
        </Field>
        <Field label="Base price">
          <input className="input" type="number" min="0" value={form.base_price ?? 0} onChange={(e) => set('base_price', e.target.value)} />
        </Field>
        <Field label="Weekend price">
          <input className="input" type="number" min="0" value={form.weekend_price ?? 0} onChange={(e) => set('weekend_price', e.target.value)} />
        </Field>
        <Field label="Peak price">
          <input className="input" type="number" min="0" value={form.peak_price ?? 0} onChange={(e) => set('peak_price', e.target.value)} />
        </Field>
        <Field label="Bed type">
          <input className="input" value={form.bed_type || ''} onChange={(e) => set('bed_type', e.target.value)} />
        </Field>
        <Field label="Max adults">
          <input className="input" type="number" min="1" value={form.max_adults ?? 2} onChange={(e) => set('max_adults', e.target.value)} />
        </Field>
        <Field label="Max children">
          <input className="input" type="number" min="0" value={form.max_children ?? 0} onChange={(e) => set('max_children', e.target.value)} />
        </Field>
        <Field label="Size (sq.ft)">
          <input className="input" type="number" min="0" value={form.size_sqft ?? 0} onChange={(e) => set('size_sqft', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function RoomsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('rooms');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [typeId, setTypeId] = useState('');
  const [floor, setFloor] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [typeModal, setTypeModal] = useState(null);
  const [detail, setDetail] = useState(null);

  const debounced = useDebounced(q);
  const rooms = useList('/rooms', { limit: 200 });
  const { items: types, reload: reloadTypes } = useList('/rooms/types', { limit: 100 });

  const floors = useMemo(
    () => [...new Set(rooms.items.map((r) => r.floor).filter(Boolean))].sort(),
    [rooms.items]
  );

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    return rooms.items.filter((r) => {
      if (status && r.status !== status) return false;
      if (typeId && r.room_type_id !== typeId) return false;
      if (floor && String(r.floor) !== floor) return false;
      if (term && !`${r.number} ${r.floor || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rooms.items, status, typeId, floor, debounced]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = useMemo(() => {
    const c = { available: 0, occupied: 0, cleaning: 0, ooo: 0, dirty: 0 };
    rooms.items.forEach((r) => {
      if (r.status === 'available') c.available += 1;
      if (r.status === 'occupied') c.occupied += 1;
      if (r.status === 'cleaning') c.cleaning += 1;
      if (['maintenance', 'blocked', 'out_of_order'].includes(r.status)) c.ooo += 1;
      if (r.housekeeping !== 'clean') c.dirty += 1;
    });
    return c;
  }, [rooms.items]);

  async function patch(id, payload, message) {
    try {
      await api.put(`/rooms/${id}`, payload);
      toast.success(message);
      rooms.reload();
      setDetail((d) => (d && d.id === id ? { ...d, ...payload } : d));
    } catch (e) {
      toast.error(e.message);
    }
  }

  function resetFilters() {
    setQ('');
    setStatus('');
    setTypeId('');
    setFloor('');
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle={`${rooms.items.length} rooms in inventory · edit, activate and set housekeeping`}
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> Add room
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available" value={counts.available} sub="ready to sell" icon={BedDouble} tone="emerald" />
        <StatCard label="Occupied" value={counts.occupied} sub="guests in house" icon={Users} tone="brand" />
        <StatCard label="Needs cleaning" value={counts.dirty} sub="housekeeping flag" icon={Sparkles} tone="amber" />
        <StatCard label="Out of order" value={counts.ooo} sub="blocked or maintenance" icon={LayoutGrid} tone="rose" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-100">
        <div className="flex gap-1">
          {[{ id: 'rooms', label: 'Rooms', count: rooms.items.length }, { id: 'types', label: 'Room types', count: types.length }].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'relative whitespace-nowrap px-4 py-2.5 text-[13.5px] font-medium transition',
                tab === t.id ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'
              )}
            >
              {t.label}
              <span className={clsx('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]', tab === t.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')}>
                {t.count}
              </span>
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rooms' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search number or floor…" className="w-full sm:w-64" />
            <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="w-full sm:w-44">
              <option value="">All statuses</option>
              {ROOM_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
            <Select value={typeId} onChange={(v) => { setTypeId(v); setPage(1); }} className="w-full sm:w-48">
              <option value="">All room types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={floor} onChange={(v) => { setFloor(v); setPage(1); }} className="w-full sm:w-36">
              <option value="">All floors</option>
              {floors.map((f) => <option key={f} value={f}>Floor {f}</option>)}
            </Select>
            {(q || status || typeId || floor) && (
              <button className="btn-ghost btn-sm" onClick={resetFilters}>Clear</button>
            )}
          </div>

          {rooms.loading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
            </div>
          )}

          {!rooms.loading && rooms.error && (
            <EmptyState
              icon={SearchIcon}
              title="Could not load rooms"
              message={rooms.error.message}
              action={<button className="btn-secondary btn-sm" onClick={rooms.reload}>Retry</button>}
            />
          )}

          {!rooms.loading && !rooms.error && pageItems.length === 0 && (
            <EmptyState
              icon={BedDouble}
              title="No rooms match these filters"
              message="Adjust the filters or add your first room."
              action={<button className="btn-primary btn-sm" onClick={() => setModal({})}><Plus size={14} /> Add room</button>}
            />
          )}

          {!rooms.loading && !rooms.error && pageItems.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageItems.map((r) => (
                  <div key={r.id} className="card card-hover p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[19px] font-bold leading-none text-ink-900">{r.number}</p>
                        <p className="mt-1 truncate text-[12.5px] text-ink-500">
                          {r.room_type_name || 'Unassigned type'} · Floor {r.floor || '—'} · {r.view || 'City'} view
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>

                    <div className="mt-3 min-h-[42px] rounded-xl bg-ink-50 px-3 py-2">
                      {r.status === 'occupied' && r.guest_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={r.guest_name} size={26} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-ink-900">{r.guest_name}</p>
                            <p className="text-[11.5px] text-ink-500">{r.active_booking_code} in house</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-ink-400">
                          {r.is_active === false ? 'Inactive room' : r.status === 'cleaning' ? 'Being turned over' : 'No guest in house'}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2">
                        <span className="text-[11.5px] font-medium text-ink-400">HK</span>
                        <Select
                          value={r.housekeeping || 'clean'}
                          onChange={(v) => patch(r.id, { housekeeping: v }, `Room ${r.number} marked ${statusLabel(v)}`)}
                          className="w-32 py-1.5 text-[12.5px]"
                        >
                          {HK_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                        </Select>
                      </label>
                      <span className="text-[13px] font-semibold text-ink-700">{money(r.base_price)}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                      <span className={clsx('chip', r.is_active === false ? 'bg-ink-100 text-ink-500' : 'bg-emerald-100 text-emerald-700')}>
                        {r.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="Room detail" onClick={() => setDetail(r)}>
                          <Eye size={15} />
                        </button>
                        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Edit room" onClick={() => setModal(r)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                          title={r.is_active === false ? 'Activate' : 'Deactivate'}
                          onClick={() => patch(r.id, { is_active: r.is_active === false }, r.is_active === false ? `Room ${r.number} activated` : `Room ${r.number} deactivated`)}
                        >
                          <Power size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length > PAGE_SIZE && (
                <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'types' && (
        <div>
          {types.length === 0 && !rooms.loading ? (
            <EmptyState icon={Layers} title="No room types" message="Room types define pricing and capacity for your inventory." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Code</th>
                    <th>Base price</th>
                    <th>Weekend</th>
                    <th>Capacity</th>
                    <th>Bed</th>
                    <th>Inventory</th>
                    <th>Occupied</th>
                    <th>Staying</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <p className="font-medium text-ink-900">{t.name}</p>
                        <p className="text-[12px] text-ink-400">{t.size_sqft ? `${t.size_sqft} sq.ft` : '—'}</p>
                      </td>
                      <td><Badge>{t.code}</Badge></td>
                      <td className="font-semibold text-ink-900">{money(t.base_price)}</td>
                      <td>{money(t.weekend_price)}</td>
                      <td>{t.max_adults}A + {t.max_children}C</td>
                      <td>{t.bed_type || '—'}</td>
                      <td>{t.actual_rooms}</td>
                      <td>{t.occupied}</td>
                      <td>{t.staying}</td>
                      <td className="text-right">
                        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" onClick={() => setTypeModal(t)}>
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <RoomModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        room={modal?.id ? modal : null}
        types={types}
        onDone={() => { rooms.reload(); reloadTypes(); }}
      />
      <TypeModal
        key={typeModal?.id || 'none'}
        open={!!typeModal}
        onClose={() => setTypeModal(null)}
        type={typeModal}
        onDone={() => { reloadTypes(); rooms.reload(); }}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Room detail</p>
                <h3 className="text-lg font-bold text-ink-900">{detail.number}</h3>
                <p className="text-[12.5px] text-ink-500">{detail.room_type_name || 'Unassigned'} · Floor {detail.floor || '—'}</p>
              </div>
              <button className="text-[13px] font-semibold text-ink-500 hover:text-ink-800" onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={detail.status} />
                <Badge tone={detail.housekeeping === 'clean' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                  {statusLabel(detail.housekeeping)}
                </Badge>
                <Badge tone={detail.is_active === false ? 'bg-ink-100 text-ink-600' : 'bg-brand-100 text-brand-700'}>
                  {detail.is_active === false ? 'Inactive' : 'Active'}
                </Badge>
              </div>

              <div className="rounded-xl border border-ink-100 p-4 text-[13px]">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Status</p>
                <Select value={detail.status} onChange={(v) => patch(detail.id, { status: v }, `Room ${detail.number} set to ${statusLabel(v)}`)}>
                  {ROOM_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </Select>
                <p className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Housekeeping</p>
                <Select value={detail.housekeeping || 'clean'} onChange={(v) => patch(detail.id, { housekeeping: v }, `Room ${detail.number} marked ${statusLabel(v)}`)}>
                  {HK_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </Select>
              </div>

              {detail.guest_name && (
                <div className="rounded-xl border border-ink-100 p-4">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Current guest</p>
                  <div className="flex items-center gap-3">
                    <Avatar name={detail.guest_name} size={38} />
                    <div>
                      <p className="text-[14px] font-semibold text-ink-900">{detail.guest_name}</p>
                      <p className="text-[12.5px] text-ink-500">{detail.active_booking_code}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-ink-100 p-4 text-[13px]">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Details</p>
                <dl className="space-y-2">
                  <div className="flex justify-between gap-3"><dt className="text-ink-500">View</dt><dd className="font-medium text-ink-800">{detail.view || '—'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-500">Nightly rate</dt><dd className="font-medium text-ink-800">{money(detail.base_price)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-500">Features</dt><dd className="font-medium text-ink-800">{(detail.features || []).length ? detail.features.join(', ') : '—'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-500">Note</dt><dd className="max-w-[60%] text-right font-medium text-ink-800">{detail.note || '—'}</dd></div>
                </dl>
              </div>

              <button className="btn-secondary w-full" onClick={() => { setModal(detail); setDetail(null); }}>
                <Pencil size={15} /> Edit room
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
