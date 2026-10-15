'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Play, CheckCircle2, Sparkles, ListChecks, ClipboardCheck, Users, CalendarCheck, Inbox } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDateTime, relative, statusLabel, todayISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Avatar, Spinner } from '@/components/ui/kit';
import { Select } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const TYPES = ['clean', 'deep_clean', 'inspect', 'towel_change', 'turndown', 'maintenance'];
const TABS = [
  { id: 'pending', label: 'To clean' },
  { id: 'in_progress', label: 'Cleaning' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'done', label: 'Done' },
];

function priorityTone(p) {
  if (p === 'urgent') return 'bg-rose-100 text-rose-700';
  if (p === 'high') return 'bg-amber-100 text-amber-700';
  if (p === 'normal') return 'bg-blue-100 text-blue-700';
  return 'bg-ink-100 text-ink-600';
}

export default function HousekeepingPage() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(null);

  const tasks = useList('/frontdesk/housekeeping', { limit: 200 });
  const { items: staff } = useList('/staff', { limit: 100 });
  const { items: rooms } = useList('/rooms', { limit: 200 });

  const staffOptions = useMemo(() => staff.filter((s) => s.user_id), [staff]);
  const roomTypeById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r.room_type_name])), [rooms]);
  const today = todayISO();

  const counts = useMemo(() => {
    const c = { pending: 0, in_progress: 0, done: 0, inspect: 0, unassigned: 0, cleanedToday: 0 };
    tasks.items.forEach((t) => {
      if (c[t.status] !== undefined) c[t.status] += 1;
      if (t.type === 'inspect') c.inspect += 1;
      if (t.status === 'pending' && !t.assigned_to) c.unassigned += 1;
      if (t.status === 'done' && String(t.completed_at || '').slice(0, 10) === today) c.cleanedToday += 1;
    });
    return c;
  }, [tasks.items, today]);

  const visible = useMemo(() => {
    if (tab === 'inspect') return tasks.items.filter((t) => t.type === 'inspect');
    return tasks.items.filter((t) => t.status === tab);
  }, [tasks.items, tab]);

  const openSelected = selected.filter((id) => {
    const t = tasks.items.find((x) => x.id === id);
    return t && t.status !== 'done';
  });

  async function advance(task) {
    setBusy(task.id);
    try {
      if (task.status === 'pending') {
        await api.post(`/frontdesk/housekeeping/${task.id}/start`);
        toast.success(`Room ${task.room_number || ''} cleaning started`);
      } else {
        await api.post(`/frontdesk/housekeeping/${task.id}/complete`);
        toast.success(`Room ${task.room_number || ''} marked clean`);
      }
      tasks.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function assign(task, userId) {
    try {
      await api.put(`/frontdesk/housekeeping/${task.id}`, { assigned_to: userId || null });
      toast.success(userId ? 'Task assigned' : 'Assignment cleared');
      tasks.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function bulkClean() {
    setBusy('bulk');
    try {
      const list = tasks.items.filter((t) => openSelected.includes(t.id));
      for (const t of list) {
        if (t.room_id) await api.post('/frontdesk/mark-clean', { room_id: t.room_id });
        else await api.post(`/frontdesk/housekeeping/${t.id}/complete`);
      }
      toast.success(`${list.length} task(s) marked clean`);
      setSelected([]);
      setConfirm(false);
      tasks.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div>
      <PageHeader
        title="Housekeeping"
        subtitle="Turnover board — assign, start and sign off room cleaning"
        actions={
          openSelected.length > 0 ? (
            <button className="btn-success" onClick={() => setConfirm(true)} disabled={busy === 'bulk'}>
              <CheckCircle2 size={16} /> Mark {openSelected.length} clean
            </button>
          ) : (
            <button className="btn-secondary" onClick={tasks.reload}><Spinner size={15} /> Refresh</button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="To clean" value={counts.pending} sub="open tasks" icon={Sparkles} tone="amber" />
        <StatCard label="In progress" value={counts.in_progress} sub="being cleaned now" icon={ListChecks} tone="brand" />
        <StatCard label="Cleaned today" value={counts.cleanedToday} sub="signed off today" icon={CalendarCheck} tone="emerald" />
        <StatCard label="Unassigned" value={counts.unassigned} sub="needs a housekeeper" icon={Users} tone={counts.unassigned ? 'rose' : 'ink'} />
      </div>

      <div className="mb-4 border-b border-ink-100">
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSelected([]); }}
                className={clsx(
                  'relative whitespace-nowrap px-4 py-2.5 text-[13.5px] font-medium transition',
                  active ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'
                )}
              >
                {t.label}
                <span className={clsx('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]', active ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')}>
                  {counts[t.id] ?? 0}
                </span>
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {tasks.loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}
        </div>
      )}

      {!tasks.loading && tasks.error && (
        <EmptyState
          icon={Inbox}
          title="Could not load housekeeping tasks"
          message={tasks.error.message}
          action={<button className="btn-secondary btn-sm" onClick={tasks.reload}>Retry</button>}
        />
      )}

      {!tasks.loading && !tasks.error && visible.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title={tab === 'done' ? 'Nothing signed off yet' : tab === 'inspect' ? 'No inspection tasks' : 'All clear'}
          message={tab === 'pending' || tab === 'in_progress' ? 'Every room is turned down — enjoy the calm.' : 'Tasks appear here as they move through the board.'}
          action={<button className="btn-secondary btn-sm" onClick={tasks.reload}>Refresh</button>}
        />
      )}

      {!tasks.loading && !tasks.error && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const isOpen = t.status !== 'done';
            return (
              <div key={t.id} className={clsx('card p-4', isOpen && 'card-hover')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[18px] font-bold leading-none text-ink-900">{t.room_number || '—'}</p>
                    <p className="mt-1 truncate text-[12.5px] text-ink-500">
                      {roomTypeById[t.room_id] || 'Room'} · {statusLabel(t.type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={clsx('chip', priorityTone(t.priority))}>{statusLabel(t.priority)}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>

                {t.notes && <p className="mt-2.5 line-clamp-2 text-[12.5px] text-ink-500">{t.notes}</p>}

                <div className="mt-3 flex items-center gap-2">
                  <Avatar name={t.assigned_name || '?'} size={28} />
                  <Select
                    value={t.assigned_to || ''}
                    onChange={(v) => assign(t, v)}
                    className="py-1.5 text-[12.5px]"
                    disabled={!isOpen}
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
                  </Select>
                </div>

                <dl className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[11.5px] text-ink-500">
                  <div className="flex justify-between gap-2"><dt>Created</dt><dd>{relative(t.created_at)}</dd></div>
                  {t.started_at && <div className="flex justify-between gap-2"><dt>Started</dt><dd>{fmtDateTime(t.started_at)}</dd></div>}
                  {t.completed_at && <div className="flex justify-between gap-2"><dt>Completed</dt><dd>{fmtDateTime(t.completed_at)}</dd></div>}
                  {t.due_at && !t.completed_at && <div className="flex justify-between gap-2"><dt>Due</dt><dd className="font-medium text-amber-600">{fmtDateTime(t.due_at)}</dd></div>}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      checked={openSelected.includes(t.id)}
                      onChange={() => toggle(t.id)}
                    />
                    Select
                  </label>
                  {t.status === 'pending' && (
                    <button className="btn-primary btn-sm" onClick={() => advance(t)} disabled={busy === t.id}>
                      <Play size={14} /> {busy === t.id ? 'Starting…' : 'Start'}
                    </button>
                  )}
                  {t.status === 'in_progress' && (
                    <button className="btn-success btn-sm" onClick={() => advance(t)} disabled={busy === t.id}>
                      <CheckCircle2 size={14} /> {busy === t.id ? 'Saving…' : 'Mark done'}
                    </button>
                  )}
                  {t.status === 'done' && (
                    <span className="chip bg-emerald-100 text-emerald-700"><CheckCircle2 size={12} /> Signed off</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={bulkClean}
        title={`Mark ${openSelected.length} room(s) clean?`}
        message="Selected rooms will be flagged clean in inventory and their open housekeeping tasks signed off."
        confirmLabel="Mark clean"
      />
    </div>
  );
}
