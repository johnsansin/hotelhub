'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Truck, FileText, Users, CheckCircle2, Banknote, X,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, fmtDateTime, statusLabel, todayISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Tabs, Field, PageLoader, Badge } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, DateInput, PaginationBar } from '@/components/ui/table';
import { Modal, ConfirmDialog, Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'];
const PAGE_SIZE = 10;
const EMPTY_LINE = { item_id: '', name: '', qty: 1, rate: 0 };

function NewPOModal({ open, onClose, suppliers, items, onDone }) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tax, setTax] = useState('');
  const [discount, setDiscount] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  const sub = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const total = sub + Number(tax || 0) - Number(discount || 0);

  function setLine(i, key, value) {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l;
        if (key === 'item_id') {
          const it = items.find((x) => x.id === value);
          return it ? { ...l, item_id: it.id, name: it.name, rate: Number(it.cost_price) } : { ...l, item_id: '', name: '' };
        }
        if (key === 'name') return { ...l, name: value };
        return { ...l, [key]: Number(value) || 0 };
      })
    );
  }

  async function submit() {
    if (!supplierId) return toast.error('Select a supplier');
    if (!lines.filter((l) => l.name || l.item_id).length) return toast.error('Add at least one line item');
    setSaving(true);
    try {
      await api.post('/purchases', {
        supplier_id: supplierId,
        order_date: orderDate,
        expected_date: expectedDate || null,
        notes: notes || null,
        tax: Number(tax || 0),
        discount: Number(discount || 0),
        items: lines
          .filter((l) => l.name || l.item_id)
          .map((l) => ({ item_id: l.item_id || null, name: l.name || 'Item', qty: Number(l.qty || 1), rate: Number(l.rate || 0) })),
      });
      toast.success('Purchase order created');
      setLines([{ ...EMPTY_LINE }]);
      setNotes('');
      setTax('');
      setDiscount('');
      setExpectedDate('');
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
      title="New purchase order"
      size="xl"
      footer={
        <>
          <div className="mr-auto text-[13px] text-ink-500">
            Subtotal {money(sub)} · <span className="font-bold text-ink-900">Total {money(total)}</span>
          </div>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create PO'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={setSupplierId}>
              <option value="">Select vendor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Order date" required>
            <DateInput value={orderDate} onChange={setOrderDate} />
          </Field>
          <Field label="Expected date">
            <DateInput value={expectedDate} onChange={setExpectedDate} />
          </Field>
          <Field label="Notes">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-2xl border border-ink-100">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-800">Line items</p>
            <button className="btn-secondary btn-sm" onClick={() => setLines((l) => [...l, { ...EMPTY_LINE }])}>
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="space-y-2 p-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Select value={l.item_id} onChange={(v) => setLine(i, 'item_id', v)}>
                  <option value="">Custom item</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </Select>
                <input
                  className="input"
                  placeholder="Item name"
                  value={l.name}
                  onChange={(e) => setLine(i, 'name', e.target.value)}
                />
                <div className="col-span-2 flex gap-2 sm:col-span-1">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={l.qty}
                    onChange={(e) => setLine(i, 'qty', e.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="Rate"
                    value={l.rate}
                    onChange={(e) => setLine(i, 'rate', e.target.value)}
                  />
                </div>
                <button
                  className="justify-self-end rounded-lg p-2 text-ink-400 hover:text-rose-600"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-ink-100 px-4 py-3 sm:grid-cols-4">
            <div className="sm:col-span-2" />
            <Field label="Tax">
              <input className="input" type="number" min="0" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Discount">
              <input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function VendorModal({ open, onClose, vendor, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(vendor || { is_active: true, categories: [] });
  const [cats, setCats] = useState((vendor?.categories || []).join(', '));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name) return toast.error('Vendor name is required');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        gst_no: form.gst_no || null,
        payment_terms: form.payment_terms || null,
        categories: cats.split(',').map((c) => c.trim()).filter(Boolean),
        notes: form.notes || null,
        is_active: form.is_active !== false,
      };
      if (vendor?.id) await api.put(`/inventory/suppliers/${vendor.id}`, payload);
      else await api.post('/inventory/suppliers', payload);
      toast.success(vendor?.id ? 'Vendor updated' : 'Vendor added');
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
      title={vendor?.id ? 'Edit vendor' : 'New vendor'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save vendor'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Contact person">
          <input className="input" value={form.contact_name || ''} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="City">
          <input className="input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="GSTIN">
          <input className="input" value={form.gst_no || ''} onChange={(e) => set('gst_no', e.target.value)} />
        </Field>
        <Field label="Payment terms">
          <input className="input" value={form.payment_terms || ''} onChange={(e) => set('payment_terms', e.target.value)} placeholder="Net 15" />
        </Field>
        <Field label="Categories" className="sm:col-span-2" hint="Comma separated, e.g. Linen, Kitchen">
          <input className="input" value={cats} onChange={(e) => setCats(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={form.is_active !== false} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-brand-600" />
            <span className="text-sm text-ink-700">Active vendor</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

function PayModal({ po, onClose, onDone }) {
  const toast = useToast();
  const due = po ? Math.max(0, Number(po.total) - Number(po.paid)) : 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/purchases/${po.id}/pay`, {
        amount: Number(amount || due),
        method,
        reference: reference || null,
        notes: null,
      });
      toast.success('Payment recorded');
      setAmount('');
      setReference('');
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
      open={!!po}
      onClose={onClose}
      title={`Pay bill · ${po?.po_no || ''}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-success" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</button>
        </>
      }
    >
      {po && (
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-[13px] text-ink-600">
            <div className="flex justify-between"><span>Invoice total</span><span className="font-semibold">{money(po.total)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span className="font-semibold">{money(po.paid)}</span></div>
            <div className="flex justify-between font-bold text-ink-900"><span>Outstanding</span><span>{money(due)}</span></div>
          </div>
          <Field label="Amount" required>
            <input className="input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(due)} />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={setMethod}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
            </Select>
          </Field>
          <Field label="Reference / cheque no">
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export default function PurchasesPage() {
  const toast = useToast();
  const [tab, setTab] = useState('orders');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [vendorQ, setVendorQ] = useState('');
  const [vendorPage, setVendorPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const [poOpen, setPoOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [payPo, setPayPo] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const debounced = useDebounced(q);
  const vendorDebounced = useDebounced(vendorQ);
  const pos = useList('/purchases', { limit: PAGE_SIZE, page, q: debounced, status: status || undefined });
  const vendors = useList('/inventory/suppliers', { limit: PAGE_SIZE, page: vendorPage, q: vendorDebounced });
  const { items: supplierList } = useList('/inventory/suppliers', { limit: 200 });
  const { items: inventoryItems } = useList('/inventory/items', { limit: 200 });
  const { data: overview, loading: overviewLoading, reload: reloadOverview } = useFetch('/purchases?limit=200');
  const detail = useFetch(detailId ? `/purchases/${detailId}` : null, { enabled: !!detailId });

  const allPos = overview?.items || [];
  const bills = useMemo(
    () => allPos.filter((p) => p.status === 'received' || p.status === 'partial'),
    [allPos]
  );
  const stats = useMemo(() => {
    const month = todayISO().slice(0, 7);
    const open = allPos
      .filter((p) => ['draft', 'sent', 'partial'].includes(p.status))
      .reduce((s, p) => s + Number(p.total), 0);
    const unpaid = bills.reduce((s, p) => s + Math.max(0, Number(p.total) - Number(p.paid)), 0);
    const spend = allPos
      .filter((p) => String(p.order_date).slice(0, 7) === month && p.status !== 'cancelled')
      .reduce((s, p) => s + Number(p.total), 0);
    return { open, unpaid, spend };
  }, [allPos, bills]);

  async function call(fn, okMessage) {
    try {
      await fn();
      toast.success(okMessage);
      pos.reload();
      reloadOverview();
      if (detailId) detail.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const billRows = useMemo(() => bills.slice(0, PAGE_SIZE * 3), [bills]);

  async function cancelPo() {
    const po = confirmCancel;
    setConfirmCancel(null);
    await call(() => api.post(`/purchases/${po.id}/cancel`), 'Purchase order cancelled');
  }

  async function deletePo() {
    const po = confirmDelete;
    setConfirmDelete(null);
    await call(() => api.del(`/purchases/${po.id}`), 'Purchase order deleted');
  }

  const po = detail?.data?.po;

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Vendors, purchase orders, goods receipt and bills"
        actions={
          <button className="btn-primary" onClick={() => setPoOpen(true)}>
            <Plus size={16} /> New purchase order
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open PO value" value={money(stats.open)} sub="draft, sent & partial" icon={FileText} tone="brand" />
        <StatCard label="Unpaid bills" value={money(stats.unpaid)} sub={`${bills.length} bills`} icon={Banknote} tone="rose" />
        <StatCard label="Spend this month" value={money(stats.spend)} sub="purchase orders raised" icon={Truck} tone="emerald" />
      </div>

      <Tabs
        tabs={[
          { id: 'orders', label: 'Purchase orders', count: overview?.total ?? allPos.length },
          { id: 'vendors', label: 'Vendors', count: vendors.total },
          { id: 'bills', label: 'Bills', count: bills.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'orders' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="PO number or vendor…" className="w-full sm:w-64" />
            <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="w-full sm:w-44">
              <option value="">All statuses</option>
              {PO_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </div>
          <DataTable
            loading={pos.loading}
            rows={pos.items}
            onRowClick={(r) => setDetailId(r.id)}
            empty={<EmptyState icon={Truck} title="No purchase orders" message="Raise a PO against a vendor to receive stock." action={<button className="btn-primary" onClick={() => setPoOpen(true)}><Plus size={16} /> New PO</button>} />}
            columns={[
              { key: 'po_no', label: 'PO', render: (r) => <span className="font-semibold text-ink-900">{r.po_no}</span> },
              { key: 'supplier_name', label: 'Vendor', render: (r) => r.supplier_name || '—' },
              { key: 'order_date', label: 'Date', render: (r) => fmtDate(r.order_date) },
              { key: 'line_items', label: 'Lines', render: (r) => `${r.line_items} (${r.received} recd)` },
              { key: 'total', label: 'Amount', render: (r) => <span className="font-semibold text-ink-900">{money(r.total)}</span> },
              { key: 'paid', label: 'Paid', render: (r) => money(r.paid) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
          {pos.total > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={pos.total} onPage={setPage} /></div>
          )}
        </div>
      )}

      {tab === 'vendors' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={vendorQ} onChange={(v) => { setVendorQ(v); setVendorPage(1); }} placeholder="Search vendors…" className="w-full sm:w-64" />
            <button
              className="btn-primary ml-auto"
              onClick={() => { setEditVendor(null); setVendorOpen(true); }}
            >
              <Plus size={16} /> Add vendor
            </button>
          </div>
          <DataTable
            loading={vendors.loading}
            rows={vendors.items}
            onRowClick={(r) => { setEditVendor(r); setVendorOpen(true); }}
            empty={<EmptyState icon={Users} title="No vendors" message="Add the suppliers you purchase from." />}
            columns={[
              {
                key: 'name',
                label: 'Vendor',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{r.name}</p>
                    <p className="text-[12px] text-ink-400">{r.contact_name || '—'}</p>
                  </div>
                ),
              },
              { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
              { key: 'email', label: 'Email', render: (r) => r.email || '—' },
              { key: 'city', label: 'City', render: (r) => r.city || '—' },
              { key: 'gst_no', label: 'GSTIN', render: (r) => r.gst_no || '—' },
              { key: 'payment_terms', label: 'Terms', render: (r) => r.payment_terms || '—' },
              { key: 'total_dues', label: 'Dues', render: (r) => <span className={Number(r.total_dues) > 0 ? 'font-semibold text-rose-600' : ''}>{money(r.total_dues)}</span> },
              { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
            ]}
          />
          {vendors.total > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={vendorPage} pageSize={PAGE_SIZE} total={vendors.total} onPage={setVendorPage} /></div>
          )}
        </div>
      )}

      {tab === 'bills' && (
        <div>
          {overviewLoading ? (
            <PageLoader label="Loading bills…" />
          ) : billRows.length === 0 ? (
            <EmptyState icon={Banknote} title="No bills" message="Bills appear once a purchase order is received." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {billRows.map((b) => {
                const due = Math.max(0, Number(b.total) - Number(b.paid));
                const paidState = due <= 0 ? 'paid' : Number(b.paid) > 0 ? 'partial' : 'unpaid';
                return (
                  <div key={b.id} className="card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-ink-900">{b.po_no}</p>
                        <p className="truncate text-[13px] text-ink-500">{b.supplier_name || '—'} · {fmtDate(b.order_date)}</p>
                      </div>
                      <StatusBadge status={paidState} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                      <div className="rounded-xl bg-ink-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-ink-400">Total</p>
                        <p className="font-semibold text-ink-900">{money(b.total)}</p>
                      </div>
                      <div className="rounded-xl bg-ink-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-ink-400">Paid</p>
                        <p className="font-semibold text-ink-900">{money(b.paid)}</p>
                      </div>
                      <div className="rounded-xl bg-rose-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-rose-400">Due</p>
                        <p className="font-semibold text-rose-700">{money(due)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={b.status} />
                      <button className="btn-secondary btn-sm" onClick={() => setDetailId(b.id)}>View PO</button>
                      {due > 0 && (
                        <button className="btn-success btn-sm ml-auto" onClick={() => setPayPo(b)}>
                          <Banknote size={14} /> Mark paid
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <NewPOModal
        open={poOpen}
        onClose={() => setPoOpen(false)}
        suppliers={supplierList}
        items={inventoryItems}
        onDone={() => { pos.reload(); reloadOverview(); }}
      />
      <VendorModal
        open={vendorOpen}
        onClose={() => setVendorOpen(false)}
        vendor={editVendor}
        onDone={() => vendors.reload()}
      />
      <PayModal po={payPo} onClose={() => setPayPo(null)} onDone={() => { pos.reload(); reloadOverview(); vendors.reload(); }} />

      <Drawer open={!!detailId} onClose={() => setDetailId(null)} className="w-[min(520px,100vw)]">
        {detail.loading && <PageLoader label="Loading purchase order…" />}
        {!detail.loading && !po && <EmptyState title="Purchase order not found" />}
        {po && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-ink-900">{po.po_no}</h3>
                <p className="text-[12.5px] text-ink-500">{po.supplier_name || '—'} · {fmtDate(po.order_date)}</p>
              </div>
              <button className="rounded-xl p-1.5 text-ink-400 hover:bg-ink-100" onClick={() => setDetailId(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={po.status} />
                <Badge>Expected {po.expected_date ? fmtDate(po.expected_date) : '—'}</Badge>
                <Badge>{po.line_items} lines</Badge>
              </div>

              <div className="rounded-2xl border border-ink-100">
                <table className="data-table">
                  <thead>
                    <tr><th>Item</th><th>Qty</th><th>Rate</th><th className="text-right">Amount</th></tr>
                  </thead>
                  <tbody>
                    {(detail.data?.items || []).map((it) => (
                      <tr key={it.id}>
                        <td>
                          <p className="font-medium text-ink-900">{it.name}</p>
                          <p className="text-[11.5px] text-ink-400">{it.sku || '—'}</p>
                        </td>
                        <td>{it.qty} {it.unit || ''}</td>
                        <td>{money(it.rate)}</td>
                        <td className="text-right font-semibold text-ink-900">{money(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5 rounded-2xl bg-ink-50 px-4 py-3 text-[13px]">
                <div className="flex justify-between text-ink-500"><span>Sub total</span><span>{money(po.sub_total)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Tax</span><span>{money(po.tax)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Discount</span><span>-{money(po.discount)}</span></div>
                <div className="flex justify-between text-[15px] font-bold text-ink-900"><span>Total</span><span>{money(po.total)}</span></div>
                <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{money(po.paid)}</span></div>
              </div>

              {po.notes && <p className="text-[13px] text-ink-500">Notes: {po.notes}</p>}

              {!['received', 'cancelled'].includes(po.status) && (
                <Field label="Change status">
                  <Select
                    value={po.status}
                    onChange={(v) => call(() => api.put(`/purchases/${po.id}`, { status: v }), 'Status updated')}
                  >
                    {PO_STATUSES.filter((s) => s !== 'received').map((s) => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </Select>
                </Field>
              )}

              {(detail.data?.payments || []).length > 0 && (
                <div>
                  <p className="label">Payments</p>
                  {detail.data.payments.map((p) => (
                    <div key={p.id} className="mb-2 flex justify-between rounded-xl bg-ink-50 px-3 py-2 text-[13px]">
                      <span className="capitalize text-ink-600">{p.method} · {fmtDateTime(p.paid_at)}</span>
                      <span className="font-semibold text-ink-900">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-4">
              {['draft', 'sent', 'partial'].includes(po.status) && (
                <button
                  className="btn-primary btn-sm"
                  onClick={() => call(() => api.post(`/purchases/${po.id}/receive`, { full: true }), 'Goods received')}
                >
                  <CheckCircle2 size={14} /> Mark received
                </button>
              )}
              {Number(po.total) > Number(po.paid) && po.status !== 'cancelled' && (
                <button className="btn-success btn-sm" onClick={() => setPayPo(po)}>
                  <Banknote size={14} /> Pay
                </button>
              )}
              {['draft', 'sent'].includes(po.status) && (
                <button className="btn-ghost btn-sm text-rose-600" onClick={() => setConfirmCancel(po)}>Cancel PO</button>
              )}
              {['draft', 'cancelled'].includes(po.status) && (
                <button className="btn-ghost btn-sm text-rose-600" onClick={() => setConfirmDelete(po)}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={cancelPo}
        title="Cancel purchase order?"
        message={`${confirmCancel?.po_no} will be marked cancelled.`}
        confirmLabel="Cancel PO"
        danger
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deletePo}
        title="Delete purchase order?"
        message={`${confirmDelete?.po_no} will be permanently removed. Only draft or cancelled POs can be deleted.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
