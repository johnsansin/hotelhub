'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Plus, X, Clock, Trash2, Pencil, CreditCard, ChefHat, Leaf, ArrowRight,
  ClipboardList, LayoutGrid, Users, Receipt, AlertTriangle, CalendarDays,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDateTime, relative, statusLabel } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Tabs, Field, Badge, PageLoader } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, Toggle } from '@/components/ui/table';
import { Modal, ConfirmDialog, Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const FLOW = ['new', 'confirmed', 'preparing', 'ready', 'served', 'bill_generated', 'paid'];
const NEXT = { new: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'served', served: 'bill_generated' };
const NEXT_LABEL = { new: 'Confirm', confirmed: 'Start prep', preparing: 'Ready', ready: 'Serve', served: 'Bill' };
const COLUMNS = [
  { key: 'open', label: 'Open', statuses: ['new', 'confirmed'] },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'served', label: 'Served', statuses: ['served'] },
  { key: 'bill', label: 'Bill', statuses: ['bill_generated'] },
  { key: 'closed', label: 'Closed', statuses: ['paid', 'cancelled'] },
];
const TYPES = [
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'room_service', label: 'Room service' },
];
const PAY_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

function placeLabel(o) {
  if (o.table_name) return `Table ${o.table_name}`;
  const room = o.room_number || o.booking_room;
  if (room) return `Room ${room}`;
  return statusLabel(o.type);
}

function OrderCard({ o, onOpen, onAdvance, onPay, className }) {
  const closed = o.status === 'paid' || o.status === 'cancelled';
  return (
    <div
      className={clsx('card cursor-pointer p-4 transition hover:shadow-card', className)}
      onClick={() => onOpen(o)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-bold text-ink-900">{o.order_no}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
            {placeLabel(o)} · {o.guest_name || 'Walk-in'}
          </p>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        <span className="chip bg-brand-50 text-brand-700">{statusLabel(o.type)}</span>
        <span>{o.item_count} items · {o.total_qty} qty</span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> {relative(o.created_at)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink-900">{money(o.total)}</p>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!closed && NEXT[o.status] && (
            <button className="btn-primary btn-sm" onClick={() => onAdvance(o)}>
              {NEXT_LABEL[o.status]} <ArrowRight size={13} />
            </button>
          )}
          {!closed && (
            <button className="btn-secondary btn-sm" onClick={() => onPay(o)}>
              <CreditCard size={13} /> Pay
            </button>
          )}
        </div>
      </div>
      {Number(o.paid) > 0 && o.status !== 'paid' && (
        <p className="mt-2 text-[11.5px] text-emerald-600">Paid {money(o.paid)} of {money(o.total)}</p>
      )}
    </div>
  );
}

function OrderDrawer({ id, onClose, onAdvance, onPay, onCancel }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch(id ? `/restaurant/orders/${id}` : null, { enabled: !!id });
  const [confirm, setConfirm] = useState(false);
  const order = data?.order;
  const items = data?.items || [];
  const payments = data?.payments || [];
  const stepIndex = order ? FLOW.indexOf(order.status) : -1;

  async function cancelOrder() {
    try {
      await api.post(`/restaurant/orders/${id}/cancel`);
      toast.success('Order cancelled');
      setConfirm(false);
      reload();
      onCancel();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <Drawer open={!!id} onClose={onClose} className="w-[min(520px,100vw)]">
      {loading && <PageLoader label="Loading order…" />}
      {!loading && !order && (
        <EmptyState title="Order not found" message="This order may have been removed." />
      )}
      {order && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-ink-900">{order.order_no}</h3>
              <p className="text-[12.5px] text-ink-500">
                {placeLabel(order)} · {order.guest_name || 'Walk-in'} · {fmtDateTime(order.created_at)}
              </p>
            </div>
            <button className="rounded-xl p-1.5 text-ink-400 hover:bg-ink-100" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              <Badge>{statusLabel(order.type)}</Badge>
              {order.served_by_name && <Badge>{order.served_by_name}</Badge>}
              <Badge>{order.persons} pax</Badge>
            </div>

            <div className="flex items-center gap-1">
              {FLOW.map((s, i) => (
                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={clsx(
                      'h-1.5 w-full rounded-full',
                      stepIndex >= i && s !== 'cancelled' ? 'bg-brand-600' : 'bg-ink-100'
                    )}
                  />
                  <span className={clsx('text-[10px] font-semibold', stepIndex >= i ? 'text-brand-600' : 'text-ink-400')}>
                    {statusLabel(s)}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-4">
              <p className="text-center text-[13px] font-bold uppercase tracking-widest text-ink-700">Bill</p>
              <div className="mt-3 space-y-1.5">
                {items.map((it) => (
                  <div key={it.id} className="flex items-start justify-between gap-3 text-[13px] text-ink-700">
                    <span className="min-w-0">
                      <span className="truncate">{it.name}</span>
                      <span className="ml-1 text-ink-400">× {it.qty}</span>
                    </span>
                    <span className="shrink-0 font-medium">{money(it.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-dashed border-ink-200 pt-3 text-[13px]">
                <div className="flex justify-between text-ink-500"><span>Sub total</span><span>{money(order.sub_total)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Tax</span><span>{money(order.tax)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Discount</span><span>-{money(order.discount)}</span></div>
                <div className="flex justify-between text-[15px] font-bold text-ink-900"><span>Total</span><span>{money(order.total)}</span></div>
                <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{money(order.paid)}</span></div>
              </div>
            </div>

            {payments.length > 0 && (
              <div>
                <p className="label">Payments</p>
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-[13px]">
                      <span className="capitalize text-ink-600">{statusLabel(p.method)} · {fmtDateTime(p.paid_at)}</span>
                      <span className="font-semibold text-ink-900">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.notes && <p className="text-[13px] text-ink-500">Note: {order.notes}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-4">
            {NEXT[order.status] && (
              <button className="btn-primary btn-sm" onClick={() => { onAdvance(order); reload(); }}>
                {NEXT_LABEL[order.status]}
              </button>
            )}
            {order.status !== 'paid' && order.status !== 'cancelled' && (
              <button className="btn-success btn-sm" onClick={() => onPay(order)}>
                <CreditCard size={14} /> Take payment
              </button>
            )}
            {order.status !== 'paid' && order.status !== 'cancelled' && (
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => setConfirm(true)}>
                <Trash2 size={14} /> Cancel
              </button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={cancelOrder}
        title="Cancel this order?"
        message="The order will be marked cancelled and the table released."
        confirmLabel="Cancel order"
        danger
      />
    </Drawer>
  );
}

function NewOrderModal({ open, onClose, items, categories, tables, onDone }) {
  const toast = useToast();
  const [type, setType] = useState('dine_in');
  const [tableId, setTableId] = useState('');
  const [room, setRoom] = useState('');
  const [guest, setGuest] = useState('');
  const [persons, setPersons] = useState(1);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [cart, setCart] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [saving, setSaving] = useState(false);

  const shown = useMemo(
    () =>
      items.filter(
        (i) => (!cat || i.category_id === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()))
      ),
    [items, cat, q]
  );
  const sub = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const tax = cart.reduce((s, x) => s + (x.price * x.qty * x.taxes) / 100, 0);
  const total = sub + tax - Number(discount || 0);

  function reset() {
    setCart([]);
    setGuest('');
    setRoom('');
    setNotes('');
    setDiscount('');
    setPersons(1);
    setTableId('');
    setQ('');
    setCat('');
  }

  function add(mi) {
    setCart((c) => {
      const i = c.findIndex((x) => x.menu_item_id === mi.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...c, { menu_item_id: mi.id, name: mi.name, price: Number(mi.price), taxes: Number(mi.taxes || 0), qty: 1 }];
    });
  }

  function setQty(id, qty) {
    setCart((c) => c.map((x) => (x.menu_item_id === id ? { ...x, qty: Math.max(1, Number(qty) || 1) } : x)));
  }

  async function submit() {
    if (!cart.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await api.post('/restaurant/orders', {
        type,
        table_id: type === 'dine_in' && tableId ? tableId : null,
        room_number: type === 'room_service' ? room : null,
        guest_name: guest || null,
        persons: Number(persons || 1),
        notes: notes || null,
        discount: Number(discount || 0),
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty })),
      });
      toast.success('Order created');
      reset();
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
      title="New order"
      size="xl"
      footer={
        <>
          <div className="mr-auto text-[13px] text-ink-500">
            {cart.length} item(s) · Sub {money(sub)} · Tax {money(tax)} ·{' '}
            <span className="font-bold text-ink-900">{money(total)}</span>
          </div>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !cart.length}>
            {saving ? 'Saving…' : 'Create order'}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order type" required>
              <Select value={type} onChange={setType}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Guest name">
              <input className="input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Optional" />
            </Field>
            {type === 'dine_in' && (
              <Field label="Table">
                <Select value={tableId} onChange={setTableId}>
                  <option value="">Select table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.area} ({t.status})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {type === 'room_service' && (
              <Field label="Room number">
                <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 402" />
              </Field>
            )}
            <Field label="Persons">
              <input className="input" type="number" min="1" value={persons} onChange={(e) => setPersons(e.target.value)} />
            </Field>
            <Field label="Discount">
              <input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field label="Notes">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, spice level…" />
          </Field>

          <div className="rounded-2xl border border-ink-100">
            <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-ink-800">Cart</p>
              <p className="text-[13px] font-bold text-ink-900">{money(total)}</p>
            </div>
            {cart.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-400">Pick items from the menu</p>
            ) : (
              <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto">
                {cart.map((c) => (
                  <li key={c.menu_item_id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700">{c.name}</span>
                    <input
                      className="input w-16 px-2 py-1 text-center"
                      type="number"
                      min="1"
                      value={c.qty}
                      onChange={(e) => setQty(c.menu_item_id, e.target.value)}
                    />
                    <span className="w-20 text-right text-[13px] font-semibold text-ink-900">{money(c.price * c.qty)}</span>
                    <button
                      className="rounded-lg p-1 text-ink-400 hover:text-rose-600"
                      onClick={() => setCart((x) => x.filter((y) => y.menu_item_id !== c.menu_item_id))}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search menu…" />
          <div className="flex flex-wrap gap-1.5">
            <button className={clsx('chip', !cat ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600')} onClick={() => setCat('')}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={clsx('chip', cat === c.id ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600')}
                onClick={() => setCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {shown.map((mi) => (
              <button
                key={mi.id}
                onClick={() => add(mi)}
                className="rounded-xl border border-ink-100 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-semibold text-ink-800">{mi.name}</p>
                  {mi.is_veg ? <Leaf size={13} className="mt-0.5 shrink-0 text-emerald-600" /> : null}
                </div>
                <p className="mt-1 text-[12px] text-ink-400">{mi.category_name || 'Uncategorised'}</p>
                <p className="mt-1 text-[13px] font-bold text-ink-900">{money(mi.price)}</p>
              </button>
            ))}
            {shown.length === 0 && <p className="col-span-2 py-6 text-center text-[13px] text-ink-400">No menu items found</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ItemModal({ open, onClose, categories, item, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(item || {});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      const payload = {
        category_id: form.category_id || null,
        name: form.name,
        description: form.description || null,
        price: Number(form.price || 0),
        cost: Number(form.cost || 0),
        code: form.code || null,
        image: form.image || null,
        is_veg: !!form.is_veg,
        is_available: form.is_available === undefined ? true : !!form.is_available,
        prep_time: Number(form.prep_time || 15),
        taxes: Number(form.taxes || 0),
      };
      if (item?.id) await api.put(`/restaurant/items/${item.id}`, payload);
      else await api.post('/restaurant/items', payload);
      toast.success(item?.id ? 'Item updated' : 'Item created');
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
      title={item?.id ? 'Edit menu item' : 'New menu item'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Category">
          <Select value={form.category_id || ''} onChange={(v) => set('category_id', v)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Code">
          <input className="input" value={form.code || ''} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="Price" required>
          <input className="input" type="number" min="0" value={form.price ?? ''} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="Cost">
          <input className="input" type="number" min="0" value={form.cost ?? ''} onChange={(e) => set('cost', e.target.value)} />
        </Field>
        <Field label="Tax %">
          <input className="input" type="number" min="0" value={form.taxes ?? ''} onChange={(e) => set('taxes', e.target.value)} />
        </Field>
        <Field label="Prep time (min)">
          <input className="input" type="number" min="0" value={form.prep_time ?? ''} onChange={(e) => set('prep_time', e.target.value)} />
        </Field>
        <Field label="Image URL" className="sm:col-span-2">
          <input className="input" value={form.image || ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input className="input" value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="flex items-center gap-6 sm:col-span-2">
          <Toggle checked={!!form.is_veg} onChange={(v) => set('is_veg', v)} label="Vegetarian" />
          <Toggle
            checked={form.is_available === undefined ? true : !!form.is_available}
            onChange={(v) => set('is_available', v)}
            label="Available"
          />
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ open, onClose, categories, reload }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/restaurant/categories', { name: name.trim(), sort_order: categories.length + 1, is_active: true });
      toast.success('Category added');
      setName('');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    try {
      await api.del(`/restaurant/categories/${c.id}`);
      toast.success('Category deleted');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggle(c) {
    try {
      await api.put(`/restaurant/categories/${c.id}`, { is_active: !c.is_active });
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Menu categories">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn-primary" onClick={create} disabled={busy}><Plus size={15} /> Add</button>
        </div>
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink-800">{c.name}</p>
                <p className="text-[12px] text-ink-400">Sort {c.sort_order}</p>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={c.is_active} onChange={() => toggle(c)} />
                <button className="rounded-lg p-1.5 text-ink-400 hover:text-rose-600" onClick={() => remove(c)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
          {categories.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-400">No categories yet</li>}
        </ul>
      </div>
    </Modal>
  );
}

function TableModal({ open, onClose, table, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(table || { status: 'free', seats: 4, area: 'Indoor', is_active: true });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name) return toast.error('Table name is required');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        area: form.area || 'Indoor',
        seats: Number(form.seats || 4),
        status: form.status || 'free',
        is_active: form.is_active !== false,
      };
      if (table?.id) await api.put(`/restaurant/tables/${table.id}`, payload);
      else await api.post('/restaurant/tables', payload);
      toast.success(table?.id ? 'Table updated' : 'Table added');
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
      title={table?.id ? 'Edit table' : 'Add table'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required>
          <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Area">
            <input className="input" value={form.area || ''} onChange={(e) => set('area', e.target.value)} />
          </Field>
          <Field label="Seats">
            <input className="input" type="number" min="1" value={form.seats ?? 4} onChange={(e) => set('seats', e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={form.status || 'free'} onChange={(v) => set('status', v)}>
            <option value="free">Free</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="blocked">Blocked</option>
          </Select>
        </Field>
        <Toggle checked={form.is_active !== false} onChange={(v) => set('is_active', v)} label="Active" />
      </div>
    </Modal>
  );
}

export default function RestaurantPage() {
  const toast = useToast();
  const [tab, setTab] = useState('orders');
  const [q, setQ] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);
  const debounced = useDebounced(q);
  const [detailId, setDetailId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [payOrder, setPayOrder] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [searchMenu, setSearchMenu] = useState('');

  const { items: orders, loading: ordersLoading, reload: reloadOrders } = useList('/restaurant/orders', {
    limit: 100,
    q: debounced,
    today: todayOnly ? '1' : undefined,
  });
  const { data: stats, reload: reloadStats } = useFetch('/restaurant/orders/stats');
  const { items: menuItems, loading: menuLoading, reload: reloadMenu } = useList('/restaurant/items', { limit: 200 });
  const { items: categories, reload: reloadCats } = useList('/restaurant/categories', { limit: 100 });
  const { items: tables, reload: reloadTables } = useList('/restaurant/tables', { limit: 100 });

  const grouped = useMemo(() => {
    const g = {};
    COLUMNS.forEach((c) => { g[c.key] = []; });
    orders.forEach((o) => {
      const col = COLUMNS.find((c) => c.statuses.includes(o.status));
      if (col) g[col.key].push(o);
    });
    return g;
  }, [orders]);

  const visibleMenu = useMemo(
    () => menuItems.filter((i) => !searchMenu || i.name.toLowerCase().includes(searchMenu.toLowerCase())),
    [menuItems, searchMenu]
  );

  async function advance(o) {
    try {
      await api.post(`/restaurant/orders/${o.id}/status`, { status: NEXT[o.status] });
      toast.success(`Moved to ${statusLabel(NEXT[o.status])}`);
      reloadOrders();
      reloadStats();
      reloadTables();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openPay(o) {
    setPayOrder(o);
    setPayMethod('cash');
    setPayAmount(String(Number(o.total) - Number(o.paid || 0)));
  }

  async function submitPay() {
    try {
      const roomCharge = payMethod === 'room_charge';
      await api.post(`/restaurant/orders/${payOrder.id}/pay`, {
        amount: Number(payAmount || payOrder.total),
        method: roomCharge ? 'other' : payMethod,
        reference: null,
        notes: null,
        charge_to_room: roomCharge,
        booking_id: payOrder.booking_id || undefined,
      });
      toast.success('Payment recorded');
      setPayOrder(null);
      reloadOrders();
      reloadStats();
      reloadTables();
      if (detailId) setDetailId(null);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removeItem(row) {
    try {
      await api.del(`/restaurant/items/${row.id}`);
      toast.success('Item deleted');
      reloadMenu();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleAvailable(row) {
    try {
      await api.put(`/restaurant/items/${row.id}`, { is_available: !row.is_available });
      reloadMenu();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removeTable(row) {
    try {
      await api.del(`/restaurant/tables/${row.id}`);
      toast.success('Table removed');
      reloadTables();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Restaurant & POS"
        subtitle="Live order board, menu and floor plan"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setCatsOpen(true)}>
              <ClipboardList size={16} /> Categories
            </button>
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              <Plus size={16} /> New order
            </button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open orders" value={stats?.open_orders ?? '—'} sub="awaiting settlement" icon={ClipboardList} tone="brand" />
        <StatCard label="In kitchen" value={stats?.in_kitchen ?? '—'} sub="being prepared" icon={ChefHat} tone="amber" />
        <StatCard label="Today's sales" value={money(stats?.today_sales)} sub={`${stats?.today_orders ?? 0} orders today`} icon={Receipt} tone="emerald" />
        <StatCard label="Pending bills" value={money(stats?.pending_bills)} sub="unpaid balance" icon={AlertTriangle} tone="rose" />
      </div>

      <Tabs
        tabs={[
          { id: 'orders', label: 'Orders', count: orders.length },
          { id: 'menu', label: 'Menu', count: menuItems.length },
          { id: 'tables', label: 'Tables', count: tables.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'orders' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={setQ} placeholder="Search order no, guest, room…" className="w-full sm:w-72" />
            <button
              className={clsx('btn-sm rounded-xl border px-3 py-2 text-[13px] font-semibold', todayOnly ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-600')}
              onClick={() => setTodayOnly((v) => !v)}
            >
              <CalendarDays size={14} className="mr-1 inline" /> Today
            </button>
          </div>

          {ordersLoading && orders.length === 0 ? (
            <PageLoader label="Loading orders…" />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders found"
              message="Create a new order to start the live board."
              action={<button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New order</button>}
            />
          ) : (
            <>
              <div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">
                {COLUMNS.map((col) => (
                  <div key={col.key} className="w-[276px] shrink-0 rounded-2xl bg-ink-100/60 p-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-600">{col.label}</p>
                      <span className="chip bg-white text-ink-600">{grouped[col.key].length}</span>
                    </div>
                    <div className="space-y-2.5">
                      {grouped[col.key].map((o) => (
                        <OrderCard key={o.id} o={o} onOpen={(x) => setDetailId(x.id)} onAdvance={advance} onPay={openPay} />
                      ))}
                      {grouped[col.key].length === 0 && (
                        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-[12px] text-ink-400">
                          Empty
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 lg:hidden">
                {COLUMNS.map((col) =>
                  grouped[col.key].length ? (
                    <div key={col.key}>
                      <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
                        {col.label} · {grouped[col.key].length}
                      </p>
                      <div className="space-y-2.5">
                        {grouped[col.key].map((o) => (
                          <OrderCard key={o.id} o={o} onOpen={(x) => setDetailId(x.id)} onAdvance={advance} onPay={openPay} />
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'menu' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={searchMenu} onChange={setSearchMenu} placeholder="Search dishes…" className="w-full sm:w-72" />
            <button className="btn-primary ml-auto" onClick={() => { setEditItem(null); setItemOpen(true); }}>
              <Plus size={16} /> Add item
            </button>
          </div>
          <DataTable
            loading={menuLoading}
            rows={visibleMenu}
            empty={<EmptyState icon={LayoutGrid} title="No menu items" message="Add your first dish to build the menu." />}
            onRowClick={(row) => { setEditItem(row); setItemOpen(true); }}
            columns={[
              {
                key: 'name',
                label: 'Item',
                render: (r) => (
                  <div className="flex items-center gap-2">
                    {r.is_veg ? <Leaf size={14} className="shrink-0 text-emerald-600" /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-rose-400" />}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{r.name}</p>
                      <p className="text-[12px] text-ink-400">{r.code || '—'} · ordered {r.times_ordered ?? 0}×</p>
                    </div>
                  </div>
                ),
              },
              { key: 'category_name', label: 'Category', render: (r) => r.category_name || '—' },
              { key: 'price', label: 'Price', render: (r) => <span className="font-semibold text-ink-900">{money(r.price)}</span> },
              { key: 'cost', label: 'Cost', render: (r) => <span className="text-ink-500">{money(r.cost)}</span> },
              { key: 'prep_time', label: 'Prep', render: (r) => `${r.prep_time} min` },
              {
                key: 'is_available',
                label: 'Available',
                render: (r) => (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={r.is_available} onChange={() => toggleAvailable(r)} />
                  </span>
                ),
              },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" onClick={() => { setEditItem(r); setItemOpen(true); }}>
                      <Pencil size={15} />
                    </button>
                    <button className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeItem(r)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {tab === 'tables' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-2.5">
            <p className="text-[13px] text-ink-500">
              {tables.filter((t) => t.status === 'occupied').length} occupied · {tables.filter((t) => t.status !== 'occupied').length} free
            </p>
            <button className="btn-primary" onClick={() => { setEditTable(null); setTableOpen(true); }}>
              <Plus size={16} /> Add table
            </button>
          </div>
          {tables.length === 0 ? (
            <EmptyState icon={Users} title="No tables yet" message="Add tables to map your floor plan." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {tables.map((t) => (
                <div key={t.id} className={clsx('card p-4', t.status === 'occupied' && 'border-brand-300 bg-brand-50/40')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-bold text-ink-900">{t.name}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-500">{t.area} · {t.seats} seats</p>
                  <div className="mt-3 flex items-center justify-between">
                    {t.active_order_id ? (
                      <button className="btn-secondary btn-sm" onClick={() => setDetailId(t.active_order_id)}>
                        View order <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span className="text-[12px] text-ink-400">{t.is_active ? 'Available' : 'Inactive'}</span>
                    )}
                    <div className="flex items-center gap-1">
                      <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" onClick={() => { setEditTable(t); setTableOpen(true); }}>
                        <Pencil size={14} />
                      </button>
                      <button className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeTable(t)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <NewOrderModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        items={menuItems}
        categories={categories}
        tables={tables}
        onDone={() => { reloadOrders(); reloadStats(); reloadTables(); }}
      />
      <ItemModal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        categories={categories}
        item={editItem}
        onDone={reloadMenu}
      />
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories} reload={reloadCats} />
      <TableModal open={tableOpen} onClose={() => setTableOpen(false)} table={editTable} onDone={reloadTables} />

      <OrderDrawer
        id={detailId}
        onClose={() => setDetailId(null)}
        onAdvance={advance}
        onPay={openPay}
        onCancel={() => { reloadOrders(); reloadStats(); reloadTables(); }}
      />

      <Modal
        open={!!payOrder}
        onClose={() => setPayOrder(null)}
        title={`Collect payment · ${payOrder?.order_no || ''}`}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayOrder(null)}>Cancel</button>
            <button className="btn-success" onClick={submitPay}>
              <CreditCard size={15} /> Charge {money(payAmount || payOrder?.total || 0)}
            </button>
          </>
        }
      >
        {payOrder && (
          <div className="space-y-4">
            <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-[13px] text-ink-600">
              <div className="flex justify-between"><span>Order total</span><span className="font-semibold">{money(payOrder.total)}</span></div>
              <div className="flex justify-between"><span>Already paid</span><span className="font-semibold">{money(payOrder.paid)}</span></div>
            </div>
            <Field label="Amount" required>
              <input className="input" type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
            <Field label="Method" required>
              <Select value={payMethod} onChange={setPayMethod}>
                {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                {payOrder.booking_id && <option value="room_charge">Charge to room</option>}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
