'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Plus,
  Eye,
  LogIn,
  LogOut,
  XCircle,
  Ban,
  CreditCard,
  PlusCircle,
  CalendarPlus,
  BedDouble,
  Users,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api, qs } from '@/lib/api';
import { money, fmtDate, fmtDateTime, num, statusLabel, todayISO, addDaysISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Avatar, Field, Spinner } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar, DateInput } from '@/components/ui/table';
import { Tabs } from '@/components/ui/kit';
import { Modal, Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 20;
const SOURCES = ['reception', 'walk_in', 'phone', 'website', 'ota', 'agent', 'corporate'];
const METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'wallet'];

function payTone(b) {
  const due = Number(b.total_amount) - Number(b.paid_amount);
  if (b.status === 'cancelled' || b.status === 'no_show') return 'bg-ink-100 text-ink-600';
  if (due <= 0 && Number(b.total_amount) > 0) return 'bg-emerald-100 text-emerald-700';
  if (Number(b.paid_amount) > 0) return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
}

function BalanceChip({ b }) {
  const due = Number(b.total_amount) - Number(b.paid_amount);
  return (
    <span className={clsx('chip', payTone(b))}>
      {due <= 0 && Number(b.total_amount) > 0 ? 'Paid' : `${money(due)} due`}
    </span>
  );
}

/* ---------------------------- New booking ---------------------------- */
function NewBookingModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    from: todayISO(),
    to: addDaysISO(todayISO(), 1),
    adults: 2,
    children: 0,
    source: 'reception',
    advance: 0,
    payment_method: 'cash',
  }));
  const [saving, setSaving] = useState(false);
  const { items: types } = useList('/rooms/types', { limit: 100 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nights = useMemo(() => {
    if (!form.from || !form.to) return 0;
    const a = new Date(`${form.from}T00:00:00`);
    const b = new Date(`${form.to}T00:00:00`);
    return Math.max(0, Math.round((b - a) / 86400000));
  }, [form.from, form.to]);

  async function submit() {
    if (!form.guest_name) return toast.error('Guest name is required');
    if (!form.roomTypeId) return toast.error('Please select a room type');
    if (nights < 1) return toast.error('Check-out must be after check-in');
    setSaving(true);
    try {
      await api.post('/bookings', {
        roomTypeId: form.roomTypeId,
        from: form.from,
        to: form.to,
        adults: Number(form.adults || 1),
        children: Number(form.children || 0),
        guest_name: form.guest_name,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        source: form.source,
        advance: Number(form.advance || 0),
        payment_method: form.payment_method,
        special_requests: form.special_requests || null,
      });
      toast.success('Booking created');
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
      title="New booking"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create booking'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guest name" required className="sm:col-span-2">
          <input className="input" value={form.guest_name || ''} onChange={(e) => set('guest_name', e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.guest_email || ''} onChange={(e) => set('guest_email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.guest_phone || ''} onChange={(e) => set('guest_phone', e.target.value)} placeholder="+91 90000 00000" />
        </Field>
        <Field label="Room type" required>
          <Select value={form.roomTypeId || ''} onChange={(v) => set('roomTypeId', v)}>
            <option value="">Select a room type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {money(t.base_price)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={form.source} onChange={(v) => set('source', v)}>
            {SOURCES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Check-in" required>
          <DateInput value={form.from} onChange={(v) => set('from', v)} />
        </Field>
        <Field label="Check-out" required hint={nights ? `${nights} night(s)` : 'Select valid dates'}>
          <DateInput value={form.to} onChange={(v) => set('to', v)} />
        </Field>
        <Field label="Adults">
          <input className="input" type="number" min={1} value={form.adults} onChange={(e) => set('adults', e.target.value)} />
        </Field>
        <Field label="Children">
          <input className="input" type="number" min={0} value={form.children} onChange={(e) => set('children', e.target.value)} />
        </Field>
        <Field label="Advance payment">
          <input className="input" type="number" min={0} value={form.advance} onChange={(e) => set('advance', e.target.value)} />
        </Field>
        <Field label="Payment method">
          <Select value={form.payment_method} onChange={(v) => set('payment_method', v)}>
            {METHODS.map((m) => <option key={m} value={m}>{statusLabel(m)}</option>)}
          </Select>
        </Field>
        <Field label="Special requests" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={form.special_requests || ''} onChange={(e) => set('special_requests', e.target.value)} placeholder="Late check-in, airport pickup, allergies…" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------------------- Assign room ---------------------------- */
function AssignRoomModal({ booking, onClose, onDone }) {
  const toast = useToast();
  const [roomId, setRoomId] = useState('');
  const [saving, setSaving] = useState(false);
  const free = useFetch(
    booking ? `/rooms/free-rooms${qs({ room_type_id: booking.room_type_id, from: booking.check_in, to: booking.check_out, booking_id: booking.id })}` : '/rooms/free-rooms',
    { enabled: !!booking }
  );
  const rooms = free.data?.items || [];

  async function submit() {
    if (!roomId) return toast.error('Pick a room');
    setSaving(true);
    try {
      await api.post(`/bookings/${booking.id}/assign-room`, { room_id: roomId });
      toast.success('Room assigned');
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
      title="Assign room"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !roomId}>{saving ? 'Assigning…' : 'Assign room'}</button>
        </>
      }
    >
      {free.loading && <div className="flex items-center gap-2 text-sm text-ink-400"><Spinner size={16} /> Finding free rooms…</div>}
      {!free.loading && rooms.length === 0 && <p className="text-[13px] text-rose-600">No free rooms available for these dates.</p>}
      {!free.loading && rooms.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rooms.map((rm) => (
            <button
              key={rm.id}
              onClick={() => setRoomId(String(rm.id))}
              className={clsx(
                'rounded-xl border px-3 py-2.5 text-center transition',
                String(roomId) === String(rm.id) ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30' : 'border-ink-200 hover:border-brand-300'
              )}
            >
              <p className="text-[14px] font-bold text-ink-900">{rm.number}</p>
              <p className="text-[10.5px] uppercase tracking-wide text-ink-400">{statusLabel(rm.status || 'available')}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------- Money / extend modals ---------------------------- */
function AmountModal({ open, title, amountLabel, withReference, withMethod, confirmLabel, onSubmit, onClose }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function go() {
    if (!Number(amount)) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      await onSubmit({ amount: Number(amount), method, reference });
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={go} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={amountLabel} required>
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        {withMethod && (
          <Field label="Method">
            <Select value={method} onChange={setMethod}>
              {METHODS.map((m) => <option key={m} value={m}>{statusLabel(m)}</option>)}
            </Select>
          </Field>
        )}
        {withReference && (
          <Field label="Reference">
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn id, cheque no…" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ChargeModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ category: 'other', qty: 1 });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function go() {
    if (!form.description || !Number(form.amount)) return toast.error('Description and amount are required');
    setBusy(true);
    try {
      await onSubmit({ description: form.description, amount: Number(form.amount), category: form.category, qty: Number(form.qty || 1) });
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add folio charge"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={go} disabled={busy}>{busy ? 'Adding…' : 'Add charge'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Description" required>
          <input className="input" value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="Laundry, minibar, spa…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={form.category} onChange={(v) => set('category', v)}>
              {['room', 'food', 'beverage', 'laundry', 'spa', 'transport', 'other'].map((c) => <option key={c} value={c}>{statusLabel(c)}</option>)}
            </Select>
          </Field>
          <Field label="Qty">
            <input className="input" type="number" min={1} value={form.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
        </div>
        <Field label="Amount" required>
          <input className="input" type="number" min={0} value={form.amount || ''} onChange={(e) => set('amount', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExtendModal({ open, onClose, onSubmit }) {
  const [nights, setNights] = useState(1);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function go() {
    if (Number(nights) < 1) return toast.error('Nights must be at least 1');
    setBusy(true);
    try {
      await onSubmit({ nights: Number(nights), amount: Number(amount || 0) });
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Extend stay"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={go} disabled={busy}>{busy ? 'Extending…' : 'Extend stay'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Extra nights" required>
          <input className="input" type="number" min={1} value={nights} onChange={(e) => setNights(e.target.value)} autoFocus />
        </Field>
        <Field label="Additional amount (optional)">
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------------------- Detail drawer ---------------------------- */
function BookingDetail({ bookingId, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/bookings/${bookingId}`, { enabled: !!bookingId });
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const b = data?.booking;

  function refresh() {
    reload();
    onChanged();
  }

  async function action(fn, successMsg) {
    try {
      await fn();
      toast.success(successMsg);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
    setConfirm(null);
  }

  const due = b ? Number(b.total_amount) - Number(b.paid_amount) : 0;

  return (
    <Drawer open={!!bookingId} onClose={onClose} className="w-[min(560px,100vw)]">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={b?.guest_name || '·'} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink-900">{b?.guest_name || 'Loading…'}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {b && <StatusBadge status={b.status} />}
                {b && <span className="chip bg-ink-100 text-ink-600">{b.code}</span>}
              </div>
            </div>
          </div>
          <button className="text-[13px] font-semibold text-ink-500 hover:text-ink-800" onClick={onClose}>Close</button>
        </div>

        {loading && <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-400"><Spinner size={18} /> Loading booking…</div>}
        {error && <div className="p-5 text-sm text-rose-600">{error.message}</div>}

        {!loading && !error && b && (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {['pending', 'confirmed'].includes(b.status) && (
                <>
                  <button className="btn-primary btn-sm" onClick={() => setCheckInOpen(true)}><LogIn size={14} /> Check in</button>
                  <button className="btn-secondary btn-sm" onClick={() => setAssignOpen(true)}><BedDouble size={14} /> Assign room</button>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirm('cancel')}><XCircle size={14} /> Cancel</button>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirm('no_show')}><Ban size={14} /> No-show</button>
                </>
              )}
              {b.status === 'checked_in' && (
                <>
                  <button className="btn-primary btn-sm" onClick={() => setConfirm('checkout')}><LogOut size={14} /> Check out</button>
                  <button className="btn-secondary btn-sm" onClick={() => setExtendOpen(true)}><CalendarPlus size={14} /> Extend</button>
                  <button className="btn-secondary btn-sm" onClick={() => setAssignOpen(true)}><BedDouble size={14} /> Change room</button>
                </>
              )}
              {!['cancelled', 'no_show'].includes(b.status) && (
                <>
                  <button className="btn-secondary btn-sm" onClick={() => setPayOpen(true)}><CreditCard size={14} /> Payment</button>
                  <button className="btn-secondary btn-sm" onClick={() => setChargeOpen(true)}><PlusCircle size={14} /> Charge</button>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-brand-600">Total</p>
                <p className="text-[15px] font-bold text-ink-900">{money(b.total_amount)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-emerald-600">Paid</p>
                <p className="text-[15px] font-bold text-ink-900">{money(b.paid_amount)}</p>
              </div>
              <div className={clsx('rounded-xl px-3 py-2.5 text-center', due > 0 ? 'bg-rose-50' : 'bg-ink-50')}>
                <p className={clsx('text-[11px] font-semibold uppercase', due > 0 ? 'text-rose-600' : 'text-ink-500')}>Balance</p>
                <p className="text-[15px] font-bold text-ink-900">{money(Math.max(0, due))}</p>
              </div>
            </div>

            <section className="rounded-xl border border-ink-100 p-4">
              <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Stay</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <div><dt className="text-ink-500">Room type</dt><dd className="font-medium text-ink-800">{b.room_type_name || '—'}</dd></div>
                <div><dt className="text-ink-500">Room</dt><dd className="font-medium text-ink-800">{b.room_number || b.room_no || 'Unassigned'}</dd></div>
                <div><dt className="text-ink-500">Check-in</dt><dd className="font-medium text-ink-800">{fmtDate(b.check_in)}</dd></div>
                <div><dt className="text-ink-500">Check-out</dt><dd className="font-medium text-ink-800">{fmtDate(b.check_out)}</dd></div>
                <div><dt className="text-ink-500">Nights</dt><dd className="font-medium text-ink-800">{b.nights}</dd></div>
                <div><dt className="text-ink-500">Guests</dt><dd className="font-medium text-ink-800">{num(b.adults)}A {Number(b.children) ? `· ${num(b.children)}C` : ''}</dd></div>
                <div><dt className="text-ink-500">Source</dt><dd className="font-medium text-ink-800">{statusLabel(b.source)}</dd></div>
                <div><dt className="text-ink-500">Rate</dt><dd className="font-medium text-ink-800">{money(b.rate)}/night</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                {b.guest_phone && <span className="flex items-center gap-1.5 text-[12.5px] text-ink-500"><Phone size={13} /> {b.guest_phone}</span>}
              </div>
              {b.special_requests && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">{b.special_requests}</p>}
            </section>

            {(data.occupants || []).length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400"><Users size={13} /> Occupants</h4>
                <ul className="space-y-1.5">
                  {data.occupants.map((o) => (
                    <li key={o.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[12.5px]">
                      <span className="font-medium text-ink-800">{o.name}</span>
                      <span className="text-ink-400">{o.relation}{o.age ? ` · ${o.age}y` : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Folio</h4>
              {(data.invoices || []).length === 0 ? (
                <p className="text-[13px] text-ink-400">No folio yet — a folio is generated on check-in.</p>
              ) : (
                data.invoices.map((inv) => (
                  <div key={inv.id} className="mb-3 rounded-xl border border-ink-100">
                    <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
                      <span className="text-[12.5px] font-semibold text-ink-800">{inv.invoice_no}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-ink-500">{money(inv.total)}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                    <ul className="divide-y divide-ink-50">
                      {(inv.items || []).map((it) => (
                        <li key={it.id} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
                          <span className="text-ink-700">{it.qty}× {it.description}</span>
                          <span className="font-medium text-ink-800">{money(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>

            {(data.payments || []).length > 0 && (
              <section>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Payments</h4>
                <ul className="space-y-1.5">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-2 text-[12.5px]">
                      <span className="text-ink-700">{statusLabel(p.method)}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="font-semibold text-emerald-700">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(data.charges || []).length > 0 && (
              <section>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Extra charges</h4>
                <ul className="space-y-1.5">
                  {data.charges.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[12.5px]">
                      <span className="text-ink-700">{c.description}</span>
                      <span className="font-medium text-ink-800">{money(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(data.logs || []).length > 0 && (
              <section>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Activity log</h4>
                <ul className="space-y-2.5">
                  {data.logs.map((log) => (
                    <li key={log.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-ink-800">{statusLabel(log.action)}</p>
                        {log.detail && <p className="text-[12px] text-ink-500">{log.detail}</p>}
                        <p className="text-[11px] text-ink-400">{fmtDateTime(log.created_at)}{log.actor_name ? ` · ${log.actor_name}` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <BookingCheckInModal
        key={checkInOpen ? 'ci' : 'ci0'}
        booking={checkInOpen ? b : null}
        onClose={() => setCheckInOpen(false)}
        onDone={refresh}
      />
      <AssignRoomModal key={assignOpen ? 'ar' : 'ar0'} booking={assignOpen ? b : null} onClose={() => setAssignOpen(false)} onDone={refresh} />
      <AmountModal
        key={payOpen ? 'pay' : 'pay0'}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
        amountLabel="Amount received"
        withMethod
        withReference
        confirmLabel="Record payment"
        onSubmit={(v) => api.post(`/bookings/${bookingId}/payments`, v).then(() => refresh())}
      />
      <ChargeModal key={chargeOpen ? 'ch' : 'ch0'} open={chargeOpen} onClose={() => setChargeOpen(false)} onSubmit={(v) => api.post(`/bookings/${bookingId}/charges`, v).then(() => refresh())} />
      <ExtendModal
        key={extendOpen ? 'ex' : 'ex0'}
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        onSubmit={(v) => api.post(`/bookings/${bookingId}/extend`, v).then(() => refresh())}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'checkout' ? 'Check out guest' : confirm === 'cancel' ? 'Cancel booking' : 'Mark no-show'}
        message={
          confirm === 'checkout'
            ? 'Settle the folio and check the guest out? The room will be queued for housekeeping.'
            : confirm === 'cancel'
              ? 'This will cancel the booking. Continue?'
              : 'Mark this booking as a no-show?'
        }
        confirmLabel={confirm === 'checkout' ? 'Check out' : confirm === 'cancel' ? 'Cancel booking' : 'Mark no-show'}
        danger={confirm !== 'checkout'}
        onConfirm={() =>
          confirm === 'checkout'
            ? action(() => api.post(`/bookings/${bookingId}/check-out`, { settle: true }), 'Guest checked out')
            : confirm === 'cancel'
              ? action(() => api.post(`/bookings/${bookingId}/cancel`, { reason: 'Cancelled by staff' }), 'Booking cancelled')
              : action(() => api.post(`/bookings/${bookingId}/no-show`, {}), 'Marked as no-show')
        }
      />
    </Drawer>
  );
}

function BookingCheckInModal({ booking, onClose, onDone }) {
  const toast = useToast();
  const [roomId, setRoomId] = useState('');
  const [saving, setSaving] = useState(false);
  const free = useFetch(
    booking ? `/rooms/free-rooms${qs({ room_type_id: booking.room_type_id, from: booking.check_in, to: booking.check_out, booking_id: booking.id })}` : '/rooms/free-rooms',
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
              {booking.code} · {booking.room_type_name || 'Room type'} · {fmtDate(booking.check_in, 'short')} → {fmtDate(booking.check_out, 'short')}
            </p>
          </div>
          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-ink-600">Assign a specific room (optional)</p>
            {free.loading && <div className="flex items-center gap-2 text-sm text-ink-400"><Spinner size={16} /> Finding free rooms…</div>}
            {!free.loading && rooms.length === 0 && <p className="text-[13px] text-rose-600">No free rooms of this type are available for the selected dates.</p>}
            {!free.loading && rooms.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {rooms.map((rm) => (
                  <button
                    key={rm.id}
                    onClick={() => setRoomId(String(rm.id))}
                    className={clsx(
                      'rounded-xl border px-3 py-2.5 text-center transition',
                      String(roomId) === String(rm.id) ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30' : 'border-ink-200 hover:border-brand-300'
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

/* ---------------------------- Page ---------------------------- */
export default function BookingsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const dq = useDebounced(q);

  const stats = useFetch('/bookings/stats');
  const list = useList('/bookings', {
    page,
    limit: PAGE_SIZE,
    status: status || undefined,
    q: dq || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const s = stats.data || {};
  const rows = list.items || [];

  function changeStatus(v) {
    setStatus(v);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Reservations, check-ins and folios"
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={() => { stats.reload(); list.reload(); }}>Refresh</button>
            <button className="btn-primary btn-sm" onClick={() => setOpenNew(true)}><Plus size={15} /> New booking</button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total bookings" value={num(s.total)} sub="all time" icon={CalendarPlus} tone="brand" />
        <StatCard label="In house" value={num(s.checked_in)} sub={`${num(s.confirmed)} confirmed upcoming`} icon={BedDouble} tone="emerald" />
        <StatCard label="Pending" value={num(s.pending)} sub="awaiting confirmation" icon={AlertTriangle} tone="amber" />
        <StatCard label="Cancelled / no-show" value={num((s.cancelled || 0) + (s.no_show || 0))} sub={`${num(s.checked_out)} completed stays`} icon={XCircle} tone="rose" />
      </div>

      <div className="mb-4">
        <Tabs
          active={status}
          onChange={changeStatus}
          tabs={[
            { id: '', label: 'All', count: s.total },
            { id: 'pending', label: 'Pending', count: s.pending },
            { id: 'confirmed', label: 'Confirmed', count: s.confirmed },
            { id: 'checked_in', label: 'In house', count: s.checked_in },
            { id: 'checked_out', label: 'Completed', count: s.checked_out },
            { id: 'cancelled', label: 'Cancelled', count: s.cancelled },
            { id: 'no_show', label: 'No-show', count: s.no_show },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search code, guest, phone…" className="w-full sm:w-72" />
        <DateInput value={from} onChange={(v) => { setFrom(v); setPage(1); }} className="w-full sm:w-44" />
        <DateInput value={to} onChange={(v) => { setTo(v); setPage(1); }} className="w-full sm:w-44" />
        {(q || from || to || status) && (
          <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setFrom(''); setTo(''); setStatus(''); setPage(1); }}>Clear</button>
        )}
      </div>

      <DataTable
        loading={list.loading}
        rows={rows}
        onRowClick={(r) => setDetailId(r.id)}
        empty={
          <EmptyState
            icon={CalendarPlus}
            title={q || status || from || to ? 'No bookings found' : 'No bookings yet'}
            message={q || status || from || to ? 'Try adjusting your filters.' : 'Create your first reservation to get started.'}
            action={<button className="btn-primary btn-sm" onClick={() => setOpenNew(true)}><Plus size={14} /> New booking</button>}
          />
        }
        columns={[
          {
            key: 'code',
            label: 'Booking',
            render: (r) => (
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{r.code}</p>
                <p className="text-[11.5px] text-ink-400">{fmtDate(r.created_at, 'short')}</p>
              </div>
            ),
          },
          {
            key: 'guest_name',
            label: 'Guest',
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r.guest_name || '·'} size={32} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{r.guest_name}</p>
                  <p className="truncate text-[11.5px] text-ink-400">{r.guest_phone || r.guest_phone2 || '—'}</p>
                </div>
              </div>
            ),
          },
          { key: 'room_type_name', label: 'Room', render: (r) => <span>{r.room_type_name || '—'}{r.room_number ? ` · ${r.room_number}` : ''}</span> },
          {
            key: 'stay',
            label: 'Stay',
            render: (r) => (
              <div className="text-[12.5px] text-ink-600">
                <p>{fmtDate(r.check_in, 'short')} → {fmtDate(r.check_out, 'short')}</p>
                <p className="text-[11.5px] text-ink-400">{num(r.nights)} night(s) · {num(r.adults)}A{Number(r.children) ? ` ${num(r.children)}C` : ''}</p>
              </div>
            ),
          },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'total_amount', label: 'Total', render: (r) => <span className="font-semibold text-ink-900">{money(r.total_amount)}</span> },
          { key: 'balance', label: 'Balance', render: (r) => <BalanceChip b={r} /> },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {['pending', 'confirmed'].includes(r.status) && (
                  <button className="rounded-lg p-1.5 text-ink-400 hover:bg-emerald-50 hover:text-emerald-600" title="Open to check in" onClick={() => setDetailId(r.id)}><LogIn size={15} /></button>
                )}
                {r.status === 'checked_in' && (
                  <button className="rounded-lg p-1.5 text-ink-400 hover:bg-amber-50 hover:text-amber-600" title="Open to check out" onClick={() => setDetailId(r.id)}><LogOut size={15} /></button>
                )}
                <button className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="View booking" onClick={() => setDetailId(r.id)}><Eye size={15} /></button>
              </div>
            ),
          },
        ]}
      />

      <div className="mt-1">
        <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
      </div>

      <NewBookingModal key={openNew ? 'open' : 'closed'} open={openNew} onClose={() => setOpenNew(false)} onDone={() => { list.reload(); stats.reload(); }} />
      <BookingDetail key={detailId || 'none'} bookingId={detailId} onClose={() => setDetailId(null)} onChanged={() => { list.reload(); stats.reload(); }} />
    </div>
  );
}
