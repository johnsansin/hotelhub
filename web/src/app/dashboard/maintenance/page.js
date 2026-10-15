'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Pencil, Trash2, Wrench, Search as SearchIcon, AlertTriangle, CheckCircle2, Inbox } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, statusLabel, todayISO } from '@/lib/format';
import { EmptyState, Avatar, Field } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, DateInput, PaginationBar } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 8;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
const CATEGORIES = ['general', 'Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Painting', 'Appliance', 'Pest control'];

function priorityTone(p) {
  if (p === 'urgent') return 'bg-rose-100 text-rose-700';
  if (p === 'high') return 'bg-amber-100 text-amber-700';
  if (p === 'normal') return 'bg-blue-100 text-blue-700';
  return 'bg-ink-100 text-ink-600';
}

function statusTone(s) {
  if (s === 'open') return 'bg-blue-100 text-blue-700';
  if (s === 'in_progress') return 'bg-amber-100 text-amber-700';
  if (s === 'resolved') return 'bg-emerald-100 text-emerald-700';
  if (s === 'on_hold') return 'bg-violet-100 text-violet-700';
  return 'bg-ink-100 text-ink-600';
}

function WorkOrderModal({ open, onClose, order, rooms, staff, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(order || { priority: 'normal', status: 'open', category: 'general' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const staffOptions = staff.filter((s) => s.user_id);

  async function submit() {
    if (!form.title) return toast.error('Title is required');
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        category: form.category || 'general',
        priority: form.priority || 'normal',
        status: form.status || 'open',
        room_id: form.room_id || null,
        assigned_to: form.assigned_to || null,
        cost: Number(form.cost || 0),
        vendor: form.vendor || null,
        due_date: form.due_date || null,
      };
      if (order?.id) {
        await api.put(`/frontdesk/maintenance/${order.id}`, payload);
        if (payload.status !== order.status) await api.post(`/frontdesk/maintenance/${order.id}/status`, { status: payload.status });
      } else {
        await api.post('/frontdesk/maintenance', payload);
      }
      toast.success(order?.id ? 'Work order updated' : 'Work order created');
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
      title={order?.id ? 'Edit work order' : 'New work order'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save work order'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <input className="input" value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="AC not cooling in 402" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea
            className="input min-h-[80px]"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What is broken, when it started…"
          />
        </Field>
        <Field label="Room / asset">
          <Select value={form.room_id || ''} onChange={(v) => set('room_id', v)}>
            <option value="">General / public area</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}{r.room_type_name ? ` · ${r.room_type_name}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={form.category || 'general'} onChange={(v) => set('category', v)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{statusLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority || 'normal'} onChange={(v) => set('priority', v)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{statusLabel(p)}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status || 'open'} onChange={(v) => set('status', v)}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={form.assigned_to || ''} onChange={(v) => set('assigned_to', v)}>
            <option value="">Unassigned</option>
            {staffOptions.map((s) => <option key={s.id} value={s.user_id}>{s.name} · {s.designation || s.department}</option>)}
          </Select>
        </Field>
        <Field label="Vendor">
          <input className="input" value={form.vendor || ''} onChange={(e) => set('vendor', e.target.value)} placeholder="In-house team" />
        </Field>
        <Field label="Due date">
          <DateInput value={form.due_date || ''} onChange={(v) => set('due_date', v)} />
        </Field>
        <Field label="Cost">
          <input className="input" type="number" min="0" value={form.cost ?? 0} onChange={(e) => set('cost', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function MaintenancePage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [remove, setRemove] = useState(null);
  const [busy, setBusy] = useState(null);

  const debounced = useDebounced(q);
  const orders = useList('/frontdesk/maintenance', {
    limit: PAGE_SIZE,
    page,
    q: debounced || undefined,
    status: status || undefined,
    priority: priority || undefined,
  });
  const { items: rooms } = useList('/rooms', { limit: 200 });
  const { items: staff } = useList('/staff', { limit: 100 });

  async function changeStatus(order, next) {
    setBusy(order.id);
    try {
      await api.post(`/frontdesk/maintenance/${order.id}/status`, { status: next });
      toast.success(`Marked ${statusLabel(next)}`);
      orders.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrder() {
    try {
      await api.del(`/frontdesk/maintenance/${remove.id}`);
      toast.success('Work order deleted');
      setRemove(null);
      orders.reload();
    } catch (e) {
      toast.error(e.message);
      setRemove(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Work orders for rooms, plant and public areas"
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> New work order
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search title, category…" className="w-full sm:w-72" />
        <Select value={priority} onChange={(v) => { setPriority(v); setPage(1); }} className="w-full sm:w-40">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{statusLabel(p)}</option>)}
        </Select>
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="w-full sm:w-44">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
        {(q || status || priority) && (
          <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setStatus(''); setPriority(''); setPage(1); }}>Clear</button>
        )}
      </div>

      <DataTable
        loading={orders.loading}
        rows={orders.items}
        onRowClick={(r) => setModal(r)}
        empty={
          <EmptyState
            icon={Wrench}
            title={q || status || priority ? 'No work orders match' : 'No work orders yet'}
            message={
              q || status || priority
                ? 'Try clearing the filters.'
                : 'Log your first work order to track repairs, vendors and costs before they become guest complaints.'
            }
            action={
              <button className="btn-primary btn-sm" onClick={() => setModal({})}>
                <Plus size={14} /> Create work order
              </button>
            }
          />
        }
        columns={[
          {
            key: 'title',
            label: 'Work order',
            render: (r) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{r.title}</p>
                <p className="truncate text-[12px] text-ink-400">{r.description || 'No description'}</p>
              </div>
            ),
          },
          {
            key: 'room_number',
            label: 'Asset',
            render: (r) => (
              <div>
                <p className="text-[13px] font-medium text-ink-800">{r.room_number ? `Room ${r.room_number}` : 'General'}</p>
                <p className="text-[11.5px] text-ink-400">{statusLabel(r.category || 'general')}</p>
              </div>
            ),
          },
          {
            key: 'priority',
            label: 'Priority',
            render: (r) => <span className={clsx('chip', priorityTone(r.priority))}>{statusLabel(r.priority)}</span>,
          },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <span className={clsx('chip', statusTone(r.status))}>{statusLabel(r.status)}</span>
            ),
          },
          {
            key: 'assigned_name',
            label: 'Assignee',
            render: (r) =>
              r.assigned_name ? (
                <span className="flex items-center gap-2">
                  <Avatar name={r.assigned_name} size={24} />
                  <span className="text-[13px]">{r.assigned_name}</span>
                </span>
              ) : (
                <span className="text-ink-400">Unassigned</span>
              ),
          },
          {
            key: 'due_date',
            label: 'Due',
            render: (r) => {
              const overdue = r.due_date && r.due_date < todayISO() && !['resolved', 'closed'].includes(r.status);
              return (
                <span className={clsx('text-[13px]', overdue ? 'font-semibold text-rose-600' : 'text-ink-600')}>
                  {r.due_date ? fmtDate(r.due_date, 'short') : '—'}
                </span>
              );
            },
          },
          { key: 'cost', label: 'Cost', render: (r) => money(r.cost) },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={r.status}
                  onChange={(v) => changeStatus(r, v)}
                  className="w-32 py-1.5 text-[12px]"
                  disabled={busy === r.id}
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
                <button
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Delete"
                  onClick={() => setRemove(r)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
          },
        ]}
      />

      {orders.total > PAGE_SIZE && (
        <div className="mt-1">
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={orders.total} onPage={setPage} />
        </div>
      )}

      {!orders.loading && !orders.error && orders.items.length === 0 && (q || status || priority) && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-400">
          <SearchIcon size={14} /> Nothing found for the current filters
        </div>
      )}

      {!orders.loading && !orders.error && orders.total === 0 && !q && !status && !priority && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-dashed border-ink-200 px-6 py-6 text-center text-[13px] text-ink-500">
          <span className="flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-500" /> 0 open</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> 0 resolved</span>
          <span className="flex items-center gap-1.5"><Inbox size={14} className="text-ink-400" /> Nothing in the queue</span>
        </div>
      )}

      <WorkOrderModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        order={modal?.id ? modal : null}
        rooms={rooms}
        staff={staff}
        onDone={orders.reload}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={deleteOrder}
        title="Delete this work order?"
        message={`${remove?.title || 'This work order'} and its history will be removed.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
