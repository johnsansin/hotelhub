'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Pencil, PackageOpen, Tag, MapPin, Archive, Undo2 } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, num, statusLabel, todayISO } from '@/lib/format';
import { StatCard, EmptyState, Field, Tabs } from '@/components/ui/kit';
import { DataTable, Select, DateInput } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const STATUSES = ['found', 'stored', 'claimed', 'returned', 'disposed', 'donated'];
const CATEGORIES = ['electronics', 'keys', 'documents', 'clothing', 'bags', 'wallet', 'jewelry', 'phone', 'other'];

function statusTone(s) {
  if (s === 'found') return 'bg-amber-100 text-amber-700';
  if (s === 'stored') return 'bg-blue-100 text-blue-700';
  if (s === 'claimed') return 'bg-violet-100 text-violet-700';
  if (s === 'returned') return 'bg-emerald-100 text-emerald-700';
  if (s === 'disposed') return 'bg-ink-100 text-ink-600';
  return 'bg-ink-100 text-ink-500';
}

function ItemModal({ open, onClose, item, bookings, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(item || { status: 'found', found_date: todayISO() });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.item_name) return toast.error('Item name is required');
    setSaving(true);
    try {
      const payload = {
        item_name: form.item_name,
        description: form.description || null,
        category: form.category || 'other',
        location: form.location || null,
        found_date: form.found_date || todayISO(),
        found_by: form.found_by || null,
        value: Number(form.value || 0),
        status: form.status || 'found',
        guest_name: form.guest_name || null,
        booking_id: form.booking_id || null,
      };
      if (item?.id) await api.put(`/frontdesk/found-lost/${item.id}`, payload);
      else await api.post('/frontdesk/found-lost', payload);
      toast.success(item?.id ? 'Item updated' : 'Item logged');
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
      title={item?.id ? 'Edit item' : 'Log found item'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item" required>
          <input className="input" value={form.item_name || ''} onChange={(e) => set('item_name', e.target.value)} placeholder="Black iPhone 14" />
        </Field>
        <Field label="Category">
          <Select value={form.category || 'other'} onChange={(v) => set('category', v)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{statusLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label="Found where">
          <input className="input" value={form.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="Room 214 / lobby sofa" />
        </Field>
        <Field label="Found on">
          <DateInput value={form.found_date || ''} onChange={(v) => set('found_date', v)} />
        </Field>
        <Field label="Found by">
          <input className="input" value={form.found_by || ''} onChange={(e) => set('found_by', e.target.value)} placeholder="Staff name" />
        </Field>
        <Field label="Estimated value">
          <input className="input" type="number" min="0" value={form.value ?? 0} onChange={(e) => set('value', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={form.status || 'found'} onChange={(v) => set('status', v)}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Claimant name">
          <input className="input" value={form.guest_name || ''} onChange={(e) => set('guest_name', e.target.value)} />
        </Field>
        <Field label="Booking" hint="Optional — links the item to a stay">
          <Select value={form.booking_id || ''} onChange={(v) => set('booking_id', v)}>
            <option value="">None</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>{b.code} · {b.guest_name || 'Guest'}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea
            className="input min-h-[70px]"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Colour, brand, contents…"
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function FoundLostPage() {
  const toast = useToast();
  const [tab, setTab] = useState('active');
  const [modal, setModal] = useState(null);
  const [archive, setArchive] = useState(null);

  const found = useList('/frontdesk/found-lost', { limit: 200 });
  const { items: bookings } = useList('/bookings', { limit: 200 });

  const bookingMap = useMemo(() => {
    const m = new Map();
    bookings.forEach((b) => m.set(b.id, b));
    return m;
  }, [bookings]);

  const byStatus = useMemo(() => {
    const groups = { active: [], claimed: [], archive: [] };
    found.items.forEach((it) => {
      if (['found', 'stored'].includes(it.status)) groups.active.push(it);
      else if (['claimed', 'returned'].includes(it.status)) groups.claimed.push(it);
      else groups.archive.push(it);
    });
    return groups;
  }, [found.items]);

  const stats = useMemo(() => {
    const count = (s) => found.items.filter((i) => i.status === s).length;
    const value = (s) => found.items.filter((i) => i.status === s).reduce((sum, i) => sum + Number(i.value || 0), 0);
    return {
      found: count('found'),
      stored: count('stored'),
      claimed: count('claimed'),
      returned: count('returned'),
      outstandingValue: value('found') + value('stored'),
    };
  }, [found.items]);

  async function setStatus(item, next) {
    try {
      await api.put(`/frontdesk/found-lost/${item.id}`, { status: next });
      toast.success(`Marked ${statusLabel(next)}`);
      found.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function archiveItem() {
    try {
      await api.put(`/frontdesk/found-lost/${archive.id}`, { status: 'disposed' });
      toast.success('Item moved to disposed');
      setArchive(null);
      found.reload();
    } catch (e) {
      toast.error(e.message);
      setArchive(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Found & Lost"
        subtitle="Track items guests leave behind and their hand-back"
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> Log found item
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unclaimed found" value={num(stats.found)} sub="waiting to be claimed" icon={PackageOpen} tone="amber" />
        <StatCard label="In storage" value={num(stats.stored)} sub="safe-kept items" icon={MapPin} tone="brand" />
        <StatCard label="Claimed" value={num(stats.claimed)} sub="picked up by guests" icon={Undo2} tone="violet" />
        <StatCard label="Outstanding value" value={money(stats.outstandingValue)} sub="on found + stored items" icon={Tag} tone="emerald" />
      </div>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'active', label: 'Active', count: byStatus.active.length },
          { id: 'claimed', label: 'Claimed & returned', count: byStatus.claimed.length },
          { id: 'archive', label: 'Disposed & donated', count: byStatus.archive.length },
        ]}
      />

      <DataTable
        loading={found.loading}
        rows={byStatus[tab]}
        empty={
          <EmptyState
            icon={PackageOpen}
            title="Nothing here yet"
            message="When housekeeping or front desk finds an item, log it here so it can be tracked until it goes home with its owner."
            action={
              <button className="btn-primary btn-sm" onClick={() => setModal({})}>
                <Plus size={14} /> Log found item
              </button>
            }
          />
        }
        columns={[
          {
            key: 'item_name',
            label: 'Item',
            render: (r) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{r.item_name}</p>
                <p className="truncate text-[12px] text-ink-400">{r.description || statusLabel(r.category)}</p>
              </div>
            ),
          },
          {
            key: 'location',
            label: 'Found where',
            render: (r) => (
              <div>
                <p className="text-[13px] text-ink-800">{r.location || '—'}</p>
                <p className="text-[11.5px] text-ink-400">{r.found_date ? fmtDate(r.found_date, 'short') : ''}{r.found_by ? ` · by ${r.found_by}` : ''}</p>
              </div>
            ),
          },
          { key: 'value', label: 'Value', render: (r) => money(r.value) },
          {
            key: 'guest_name',
            label: 'Claimant',
            render: (r) => {
              const b = r.booking_id ? bookingMap.get(r.booking_id) : null;
              return (
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink-800">{r.guest_name || b?.guest_name || '—'}</p>
                  <p className="text-[11.5px] text-ink-400">{b ? b.code : (r.booking_id ? r.booking_id.slice(0, 8) : '')}</p>
                </div>
              );
            },
          },
          {
            key: 'status',
            label: 'Status',
            render: (r) => <span className={clsx('chip', statusTone(r.status))}>{statusLabel(r.status)}</span>,
          },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={r.status}
                  onChange={(v) => setStatus(r, v)}
                  className="w-32 py-1.5 text-[12px]"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </Select>
                <button
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  title="Edit"
                  onClick={() => setModal(r)}
                >
                  <Pencil size={15} />
                </button>
                {!['disposed', 'donated'].includes(r.status) && (
                  <button
                    className="rounded-lg p-1.5 text-ink-400 hover:bg-amber-50 hover:text-amber-700"
                    title="Dispose (archive)"
                    onClick={() => setArchive(r)}
                  >
                    <Archive size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      <ItemModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        item={modal?.id ? modal : null}
        bookings={bookings}
        onDone={found.reload}
      />
      <ConfirmDialog
        open={!!archive}
        onClose={() => setArchive(null)}
        onConfirm={archiveItem}
        title="Dispose this item?"
        message={`${archive?.item_name || 'This item'} will be marked disposed and moved to the archive tab.`}
        confirmLabel="Dispose"
        danger
      />
    </div>
  );
}
