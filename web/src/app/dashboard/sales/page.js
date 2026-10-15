'use client';

import { useMemo, useState } from 'react';
import { Plus, X, ShoppingCart, Receipt, TrendingUp, CalendarDays } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, fmtDateTime, statusLabel, todayISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Field, PageLoader, Badge } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, DateInput, PaginationBar } from '@/components/ui/table';
import { Modal, Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const OUTLETS = ['reception', 'shop', 'spa', 'laundry', 'transport', 'minibar'];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit', label: 'Credit (pay later)' },
];
const PAGE_SIZE = 10;

function NewSaleModal({ open, onClose, items, onDone }) {
  const toast = useToast();
  const [cart, setCart] = useState([]);
  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [outlet, setOutlet] = useState('reception');
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => i.is_active !== false && (!term || i.name.toLowerCase().includes(term) || (i.sku || '').toLowerCase().includes(term)))
      .slice(0, 40);
  }, [items, q]);

  const sub = cart.reduce((s, x) => s + x.qty * x.rate, 0);
  const total = Math.max(0, sub - Number(discount || 0));

  function add(it) {
    setCart((c) => {
      const i = c.findIndex((x) => x.item_id === it.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...c,
        {
          item_id: it.id,
          name: it.name,
          qty: 1,
          rate: Number(it.sell_price) > 0 ? Number(it.sell_price) : Number(it.cost_price),
          cost: Number(it.cost_price),
          stock: Number(it.stock_qty),
        },
      ];
    });
  }

  function setLine(id, key, value) {
    setCart((c) =>
      c.map((x) =>
        x.item_id === id ? { ...x, [key]: key === 'name' ? value : Math.max(0, Number(value) || 0) } : x
      )
    );
  }

  function reset() {
    setCart([]);
    setCustomer('');
    setPhone('');
    setDiscount('');
    setNotes('');
    setQ('');
  }

  async function submit() {
    if (!cart.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await api.post('/restaurant/sales', {
        outlet,
        customer_name: customer || null,
        customer_phone: phone || null,
        discount: Number(discount || 0),
        payment_method: method,
        notes: notes || null,
        items: cart.map((c) => ({ item_id: c.item_id, name: c.name, qty: c.qty, rate: c.rate, cost: c.cost })),
      });
      toast.success('Sale recorded');
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
      title="New sale"
      size="xl"
      footer={
        <>
          <div className="mr-auto text-[13px] text-ink-500">
            {cart.length} line(s) · Subtotal {money(sub)} ·{' '}
            <span className="font-bold text-ink-900">Total {money(total)}</span>
          </div>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !cart.length}>
            {saving ? 'Saving…' : 'Complete sale'}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search inventory item or SKU…" />
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {matches.map((it) => (
              <button
                key={it.id}
                onClick={() => add(it)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-800">{it.name}</span>
                  <span className="text-[11.5px] text-ink-400">{it.sku} · {it.stock_qty} {it.unit} in stock</span>
                </span>
                <span className="shrink-0 text-[13px] font-bold text-ink-900">{money(it.sell_price || it.cost_price)}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="py-6 text-center text-[13px] text-ink-400">No items match your search</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" />
            </Field>
            <Field label="Phone">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Outlet">
              <Select value={outlet} onChange={setOutlet}>
                {OUTLETS.map((o) => <option key={o} value={o}>{statusLabel(o)}</option>)}
              </Select>
            </Field>
            <Field label="Payment method">
              <Select value={method} onChange={setMethod}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Discount">
              <input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-800">Cart</p>
            <p className="text-sm font-bold text-ink-900">{money(total)}</p>
          </div>
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-400">Pick items to start the sale</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="w-20">Qty</th>
                    <th className="w-24">Rate</th>
                    <th className="w-24 text-right">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((c) => (
                    <tr key={c.item_id}>
                      <td>
                        <p className="truncate font-medium text-ink-900">{c.name}</p>
                        <p className="text-[11.5px] text-ink-400">stock {c.stock}</p>
                      </td>
                      <td>
                        <input
                          className="input px-2 py-1 text-center"
                          type="number"
                          min="1"
                          value={c.qty}
                          onChange={(e) => setLine(c.item_id, 'qty', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input px-2 py-1 text-center"
                          type="number"
                          min="0"
                          value={c.rate}
                          onChange={(e) => setLine(c.item_id, 'rate', e.target.value)}
                        />
                      </td>
                      <td className="text-right font-semibold text-ink-900">{money(c.qty * c.rate)}</td>
                      <td>
                        <button
                          className="rounded-lg p-1 text-ink-400 hover:text-rose-600"
                          onClick={() => setCart((x) => x.filter((y) => y.item_id !== c.item_id))}
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-1 border-t border-ink-100 px-4 py-3 text-[13px]">
                <div className="flex justify-between text-ink-500"><span>Subtotal</span><span>{money(sub)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Discount</span><span>-{money(discount || 0)}</span></div>
                <div className="flex justify-between text-[15px] font-bold text-ink-900"><span>Total</span><span>{money(total)}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SaleDrawer({ id, onClose }) {
  const { data, loading } = useFetch(id ? `/restaurant/sales/${id}` : null, { enabled: !!id });
  const sale = data?.sale;
  const items = data?.items || [];
  const payments = data?.payments || [];

  return (
    <Drawer open={!!id} onClose={onClose} className="w-[min(460px,100vw)]">
      {loading && <PageLoader label="Loading invoice…" />}
      {!loading && !sale && <EmptyState title="Sale not found" />}
      {sale && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-ink-900">{sale.invoice_no}</h3>
              <p className="text-[12.5px] text-ink-500">{fmtDateTime(sale.sold_at)} · {statusLabel(sale.outlet)}</p>
            </div>
            <button className="rounded-xl p-1.5 text-ink-400 hover:bg-ink-100" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={sale.status} />
              <Badge>{statusLabel(sale.payment_method)}</Badge>
              <Badge>{sale.customer_name || 'Walk-in'}</Badge>
            </div>
            <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-4">
              <p className="text-center text-[13px] font-bold uppercase tracking-widest text-ink-700">Invoice</p>
              <div className="mt-3 space-y-1.5">
                {items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-3 text-[13px] text-ink-700">
                    <span className="min-w-0 truncate">{it.name} <span className="text-ink-400">× {it.qty}</span></span>
                    <span className="shrink-0 font-medium">{money(it.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-dashed border-ink-200 pt-3 text-[13px]">
                <div className="flex justify-between text-ink-500"><span>Sub total</span><span>{money(sale.sub_total)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Discount</span><span>-{money(sale.discount)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Tax</span><span>{money(sale.tax)}</span></div>
                <div className="flex justify-between text-[15px] font-bold text-ink-900"><span>Total</span><span>{money(sale.total)}</span></div>
              </div>
            </div>
            {payments.length > 0 && (
              <div>
                <p className="label">Payments</p>
                {payments.map((p) => (
                  <div key={p.id} className="mb-2 flex justify-between rounded-xl bg-ink-50 px-3 py-2 text-[13px]">
                    <span className="capitalize text-ink-600">{p.method}</span>
                    <span className="font-semibold text-ink-900">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12.5px] text-ink-400">
              Paid {money(sale.paid)} of {money(sale.total)}
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default function SalesPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [outlet, setOutlet] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const debounced = useDebounced(q);
  const { items, total, loading, reload } = useList('/restaurant/sales', { limit: 200 });
  const { items: invItems } = useList('/inventory/items', { limit: 200 });

  const stats = useMemo(() => {
    const day = todayISO();
    const month = day.slice(0, 7);
    let todayTotal = 0;
    let monthTotal = 0;
    let sum = 0;
    items.forEach((s) => {
      const d = String(s.sold_at || '').slice(0, 10);
      sum += Number(s.total || 0);
      if (d === day) todayTotal += Number(s.total || 0);
      if (d.slice(0, 7) === month) monthTotal += Number(s.total || 0);
    });
    return {
      todayTotal,
      monthTotal,
      avg: items.length ? sum / items.length : 0,
      count: items.length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const term = (debounced || '').toLowerCase();
    return items.filter((s) => {
      if (term && !(s.invoice_no || '').toLowerCase().includes(term) && !(s.customer_name || '').toLowerCase().includes(term)) return false;
      if (outlet && s.outlet !== outlet) return false;
      if (status && s.status !== status) return false;
      const d = String(s.sold_at || '').slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [items, debounced, outlet, status, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Counter POS, retail sales and invoices"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> New sale
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={money(stats.todayTotal)} sub={fmtDate(todayISO())} icon={CalendarDays} tone="brand" />
        <StatCard label="This month" value={money(stats.monthTotal)} sub="month to date" icon={TrendingUp} tone="emerald" />
        <StatCard label="Average ticket" value={money(stats.avg)} sub={`${stats.count} sales on record`} icon={Receipt} tone="violet" />
        <StatCard label="Sales recorded" value={stats.count} sub={`${total} total in API`} icon={ShoppingCart} tone="ink" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Invoice no or customer…" className="w-full sm:w-64" />
        <DateInput value={from} onChange={(v) => { setFrom(v); setPage(1); }} className="w-full sm:w-44" />
        <DateInput value={to} onChange={(v) => { setTo(v); setPage(1); }} className="w-full sm:w-44" />
        <Select value={outlet} onChange={(v) => { setOutlet(v); setPage(1); }} className="w-full sm:w-40">
          <option value="">All outlets</option>
          {OUTLETS.map((o) => <option key={o} value={o}>{statusLabel(o)}</option>)}
        </Select>
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="w-full sm:w-36">
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
          <option value="void">Void</option>
        </Select>
        <button className="btn-ghost btn-sm ml-auto" onClick={reload} title="Refresh">
          Refresh
        </button>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={(r) => setDetailId(r.id)}
        empty={
          <EmptyState
            icon={Receipt}
            title="No sales found"
            message={items.length ? 'Try clearing the filters.' : 'Record your first counter sale to see it here.'}
            action={!items.length && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New sale</button>}
          />
        }
        columns={[
          { key: 'invoice_no', label: 'Invoice', render: (r) => <span className="font-semibold text-ink-900">{r.invoice_no}</span> },
          { key: 'sold_at', label: 'Date', render: (r) => fmtDateTime(r.sold_at) },
          { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name || 'Walk-in' },
          { key: 'outlet', label: 'Outlet', render: (r) => <Badge>{statusLabel(r.outlet)}</Badge> },
          { key: 'item_count', label: 'Items', render: (r) => r.item_count },
          { key: 'total', label: 'Total', render: (r) => <span className="font-semibold text-ink-900">{money(r.total)}</span> },
          { key: 'payment_method', label: 'Method', render: (r) => <span className="capitalize">{statusLabel(r.payment_method || '')}</span> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />

      {filtered.length > 0 && (
        <div className="mt-1">
          <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      )}

      <NewSaleModal open={open} onClose={() => setOpen(false)} items={invItems} onDone={reload} />
      <SaleDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
