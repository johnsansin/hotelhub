'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Plus, Pencil, Trash2, Package, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
  Layers, AlertTriangle, Warehouse,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDateTime, statusLabel, todayISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Tabs, Field } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar, Toggle } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 15;
const MOVEMENT_TYPES = ['in', 'out', 'adjustment', 'return', 'transfer'];

function stockStatus(r) {
  const qty = Number(r.stock_qty);
  const rl = Number(r.reorder_level);
  if (qty <= 0) return 'critical';
  if (rl > 0 && qty <= rl * 0.5) return 'critical';
  if (rl > 0 && qty <= rl) return 'low';
  return 'ok';
}

function ItemModal({ open, onClose, item, categories, suppliers, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(
    item || { unit: 'pcs', stock_qty: 0, reorder_level: 10, cost_price: 0, sell_price: 0, is_active: true }
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name) return toast.error('Item name is required');
    if (!form.sku) return toast.error('SKU is required');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        category_id: form.category_id || null,
        unit: form.unit || 'pcs',
        stock_qty: Number(form.stock_qty || 0),
        reorder_level: Number(form.reorder_level || 0),
        cost_price: Number(form.cost_price || 0),
        sell_price: Number(form.sell_price || 0),
        supplier_id: form.supplier_id || null,
        location: form.location || null,
        is_active: form.is_active !== false,
      };
      if (item?.id) {
        delete payload.stock_qty;
        await api.put(`/inventory/items/${item.id}`, payload);
      } else {
        await api.post('/inventory/items', payload);
      }
      toast.success(item?.id ? 'Item updated' : 'Item added');
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
      title={item?.id ? 'Edit item' : 'New inventory item'}
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
        <Field label="SKU" required>
          <input className="input" value={form.sku || ''} onChange={(e) => set('sku', e.target.value)} placeholder="LIN-001" />
        </Field>
        <Field label="Unit">
          <input className="input" value={form.unit || ''} onChange={(e) => set('unit', e.target.value)} placeholder="pcs / kg / ltr" />
        </Field>
        <Field label="Category">
          <Select value={form.category_id || ''} onChange={(v) => set('category_id', v)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Supplier">
          <Select value={form.supplier_id || ''} onChange={(v) => set('supplier_id', v)}>
            <option value="">None</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {!item?.id && (
          <Field label="Opening stock">
            <input className="input" type="number" min="0" value={form.stock_qty ?? 0} onChange={(e) => set('stock_qty', e.target.value)} />
          </Field>
        )}
        <Field label="Reorder level">
          <input className="input" type="number" min="0" value={form.reorder_level ?? 0} onChange={(e) => set('reorder_level', e.target.value)} />
        </Field>
        <Field label="Cost price">
          <input className="input" type="number" min="0" value={form.cost_price ?? 0} onChange={(e) => set('cost_price', e.target.value)} />
        </Field>
        <Field label="Sell price">
          <input className="input" type="number" min="0" value={form.sell_price ?? 0} onChange={(e) => set('sell_price', e.target.value)} />
        </Field>
        <Field label="Location" className="sm:col-span-2">
          <input className="input" value={form.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="Store A, Linen room…" />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={form.is_active !== false} onChange={(v) => set('is_active', v)} label="Active item" />
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({ open, onClose, item, onDone }) {
  const toast = useToast();
  const [type, setType] = useState('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const q = Number(qty);
    if (!q && type !== 'adjustment') return toast.error('Enter a quantity');
    if (type === 'adjustment' && !qty) return toast.error('Enter a signed quantity');
    setSaving(true);
    try {
      await api.post(`/inventory/items/${item.id}/stock`, {
        type,
        qty: q,
        note: note || null,
        unit_cost: cost === '' ? null : Number(cost),
      });
      toast.success('Stock adjusted');
      setQty('');
      setNote('');
      setCost('');
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
      title={`Adjust stock · ${item?.name || ''}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Apply'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
          Current stock: <span className="font-semibold text-ink-900">{item?.stock_qty} {item?.unit}</span>
        </div>
        <Field label="Movement" required>
          <Select value={type} onChange={setType}>
            <option value="in">Stock in</option>
            <option value="out">Stock out</option>
            <option value="adjustment">Adjustment (signed)</option>
            <option value="return">Return</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>
        <Field label={type === 'adjustment' ? 'Quantity (+/-)' : 'Quantity'} required>
          <input
            className="input"
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={type === 'adjustment' ? '-5 or 5' : '0'}
          />
        </Field>
        <Field label="Unit cost">
          <input className="input" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Reason / note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damaged, counted, purchase…" />
        </Field>
      </div>
    </Modal>
  );
}

export default function InventoryPage() {
  const toast = useToast();
  const [tab, setTab] = useState('stock');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [mvPage, setMvPage] = useState(1);
  const [mvType, setMvType] = useState('');
  const [mvItem, setMvItem] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [catName, setCatName] = useState('');
  const [editCat, setEditCat] = useState(null);

  const debounced = useDebounced(q);
  const { data: summary, reload: reloadSummary } = useFetch('/inventory/summary');
  const { data: recentMoves } = useFetch('/inventory/stock?limit=100');
  const { items: categories, reload: reloadCats } = useList('/inventory/categories', { limit: 100 });
  const { items: suppliers } = useList('/inventory/suppliers', { limit: 100 });
  const { items: allItems, reload: reloadItems } = useList('/inventory/items', { limit: 200 });

  const listParams = { limit: PAGE_SIZE, page, q: debounced, category_id: cat || undefined };
  const stock = useList('/inventory/items', listParams, { enabled: !lowOnly && tab === 'stock' });
  const low = useList('/inventory/low-stock', {}, { enabled: lowOnly && tab === 'stock' });

  const movements = useList(
    '/inventory/stock',
    { limit: PAGE_SIZE, page: mvPage, type: mvType || undefined, item_id: mvItem || undefined },
    { enabled: tab === 'movements' }
  );

  const stockRows = lowOnly ? low.items.slice(0, PAGE_SIZE * 5) : stock.items;
  const stockLoading = lowOnly ? low.loading : stock.loading;
  const stockTotal = lowOnly ? low.items.length : stock.total;

  const movementsToday = useMemo(() => {
    const day = todayISO();
    return (recentMoves?.items || []).filter((m) => String(m.created_at || '').slice(0, 10) === day).length;
  }, [recentMoves]);

  async function saveCategory() {
    if (!catName.trim()) return;
    try {
      if (editCat) await api.put(`/inventory/categories/${editCat.id}`, { name: catName.trim() });
      else await api.post('/inventory/categories', { name: catName.trim() });
      toast.success(editCat ? 'Category updated' : 'Category added');
      setCatName('');
      setEditCat(null);
      reloadCats();
      reloadItems();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removeCategory(c) {
    try {
      await api.del(`/inventory/categories/${c.id}`);
      toast.success('Category deleted');
      reloadCats();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removeItem() {
    try {
      await api.del(`/inventory/items/${deleteItem.id}`);
      toast.success('Item deleted');
      setDeleteItem(null);
      reloadItems();
      stock.reload();
      reloadSummary();
    } catch (e) {
      toast.error(e.message);
      setDeleteItem(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, movements and categories"
        actions={
          <button className="btn-primary" onClick={() => { setEditItem(null); setItemOpen(true); }}>
            <Plus size={16} /> Add item
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock value" value={money(summary?.stock_value)} sub="at cost price" icon={Warehouse} tone="brand" />
        <StatCard label="Low stock" value={summary?.low_stock ?? '—'} sub="at or below reorder" icon={AlertTriangle} tone="amber" />
        <StatCard label="Active items" value={summary?.items ?? '—'} sub={`${summary?.suppliers ?? 0} suppliers`} icon={Package} tone="emerald" />
        <StatCard label="Movements today" value={movementsToday} sub="last 100 recorded" icon={ArrowDownToLine} tone="violet" />
      </div>

      <Tabs
        tabs={[
          { id: 'stock', label: 'Stock' },
          { id: 'movements', label: 'Movements' },
          { id: 'categories', label: 'Categories', count: categories.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'stock' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search item or SKU…" className="w-full sm:w-64" />
            <Select value={cat} onChange={(v) => { setCat(v); setPage(1); }} className="w-full sm:w-44">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button
              className={clsx(
                'btn-sm rounded-xl border px-3 py-2 text-[13px] font-semibold',
                lowOnly ? 'border-amber-500 bg-amber-500 text-white' : 'border-ink-200 bg-white text-ink-600'
              )}
              onClick={() => { setLowOnly((v) => !v); setPage(1); }}
            >
              <AlertTriangle size={14} className="mr-1 inline" /> Low stock only
            </button>
          </div>

          <DataTable
            loading={stockLoading}
            rows={stockRows}
            empty={<EmptyState icon={Package} title={lowOnly ? 'No low stock items' : 'No inventory items'} message={lowOnly ? 'Everything is above its reorder level.' : 'Add items to start tracking stock.'} />}
            columns={[
              {
                key: 'name',
                label: 'Item',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{r.name}</p>
                    <p className="text-[12px] text-ink-400">{r.sku} · {r.location || '—'}</p>
                  </div>
                ),
              },
              { key: 'category_name', label: 'Category', render: (r) => r.category_name || '—' },
              { key: 'unit', label: 'Unit', render: (r) => r.unit },
              {
                key: 'stock_qty',
                label: 'Qty',
                render: (r) => (
                  <span className="font-semibold text-ink-900">
                    {r.stock_qty} <span className="text-[12px] font-normal text-ink-400">/ {r.reorder_level}</span>
                  </span>
                ),
              },
              { key: 'cost_price', label: 'Cost', render: (r) => money(r.cost_price) },
              {
                key: 'value',
                label: 'Value',
                render: (r) => <span className="font-semibold text-ink-900">{money(Number(r.stock_qty) * Number(r.cost_price))}</span>,
              },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={stockStatus(r)} /> },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1">
                    <button className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="Adjust stock" onClick={() => setAdjustItem(r)}>
                      <SlidersHorizontal size={15} />
                    </button>
                    <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" onClick={() => { setEditItem(r); setItemOpen(true); }}>
                      <Pencil size={15} />
                    </button>
                    <button className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleteItem(r)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
          {!lowOnly && stockTotal > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={stockTotal} onPage={setPage} /></div>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <Select value={mvType} onChange={(v) => { setMvType(v); setMvPage(1); }} className="w-full sm:w-44">
              <option value="">All movements</option>
              {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}
            </Select>
            <Select value={mvItem} onChange={(v) => { setMvItem(v); setMvPage(1); }} className="w-full sm:w-56">
              <option value="">All items</option>
              {allItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </div>
          <DataTable
            loading={movements.loading}
            rows={movements.items}
            empty={<EmptyState icon={ArrowDownToLine} title="No movements found" message="Stock in, out and adjustments appear here." />}
            columns={[
              { key: 'created_at', label: 'Date', render: (r) => fmtDateTime(r.created_at) },
              { key: 'item_name', label: 'Item', render: (r) => <span className="font-medium text-ink-900">{r.item_name}</span> },
              {
                key: 'type',
                label: 'Type',
                render: (r) => (
                  <span
                    className={clsx(
                      'chip',
                      r.type === 'in' || r.type === 'return' ? 'bg-emerald-100 text-emerald-700'
                        : r.type === 'out' ? 'bg-rose-100 text-rose-700' : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    {r.type === 'in' ? <ArrowDownToLine size={11} /> : r.type === 'out' ? <ArrowUpFromLine size={11} /> : null}
                    {statusLabel(r.type)}
                  </span>
                ),
              },
              { key: 'qty', label: 'Qty', render: (r) => <span className="font-semibold text-ink-900">{r.qty} {r.unit}</span> },
              { key: 'note', label: 'Reference', render: (r) => r.note || statusLabel(r.ref_type || '—') },
              { key: 'created_by_name', label: 'User', render: (r) => r.created_by_name || '—' },
            ]}
          />
          {movements.total > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={mvPage} pageSize={PAGE_SIZE} total={movements.total} onPage={setMvPage} /></div>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-1">
            <h3 className="text-[15px] font-semibold text-ink-900">{editCat ? 'Rename category' : 'New category'}</h3>
            <div className="mt-3 space-y-3">
              <input
                className="input"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Housekeeping"
                onKeyDown={(e) => e.key === 'Enter' && saveCategory()}
              />
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" onClick={saveCategory}>
                  <Plus size={14} /> {editCat ? 'Update' : 'Add'}
                </button>
                {editCat && (
                  <button className="btn-ghost btn-sm" onClick={() => { setEditCat(null); setCatName(''); }}>Cancel</button>
                )}
              </div>
            </div>
          </div>
          <div className="card lg:col-span-2">
            {categories.length === 0 ? (
              <EmptyState icon={Layers} title="No categories" message="Create categories to organise your stock." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[14px] font-medium text-ink-900">{c.name}</p>
                      <p className="text-[12px] text-ink-400">
                        {allItems.filter((i) => i.category_id === c.id).length} item(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        onClick={() => { setEditCat(c); setCatName(c.name); }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeCategory(c)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <ItemModal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        item={editItem}
        categories={categories}
        suppliers={suppliers}
        onDone={() => { reloadItems(); stock.reload(); low.reload(); reloadSummary(); }}
      />
      <AdjustModal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        item={adjustItem}
        onDone={() => { stock.reload(); low.reload(); reloadSummary(); reloadItems(); }}
      />
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={removeItem}
        title="Delete this item?"
        message={`${deleteItem?.name} and its stock history will be removed. Purchase order lines keep the item name.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
