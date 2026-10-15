'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Plus, Pencil, Trash2, Users, UserCheck, CalendarOff, ClipboardList,
  Search as SearchIcon, CheckCircle2, XCircle,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, num, statusLabel, todayISO } from '@/lib/format';
import { StatCard, EmptyState, Avatar, Field, Tabs } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, DateInput, PaginationBar } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 10;
const ROLES = ['admin', 'manager', 'receptionist', 'front_desk', 'housekeeping', 'chef', 'waiter', 'storekeeper', 'maintenance', 'security', 'staff'];
const STAFF_STATUS = ['active', 'on_leave', 'probation', 'terminated'];
const ATT_STATUS = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday', 'on_duty'];
const LEAVE_TYPES = ['casual', 'sick', 'paid', 'unpaid', 'other'];
const LEAVE_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];
const DEPARTMENTS = ['Front Office', 'Housekeeping', 'F&B', 'Kitchen', 'Maintenance', 'Accounts', 'Security', 'Stores'];

function staffTone(s) {
  if (s === 'active') return 'bg-emerald-100 text-emerald-700';
  if (s === 'on_leave') return 'bg-amber-100 text-amber-700';
  if (s === 'probation') return 'bg-blue-100 text-blue-700';
  return 'bg-ink-100 text-ink-600';
}

function attTone(s) {
  if (s === 'present') return 'bg-emerald-100 text-emerald-700';
  if (s === 'absent') return 'bg-rose-100 text-rose-700';
  if (s === 'late') return 'bg-amber-100 text-amber-700';
  if (s === 'half_day') return 'bg-blue-100 text-blue-700';
  if (s === 'leave') return 'bg-violet-100 text-violet-700';
  return 'bg-ink-100 text-ink-600';
}

function leaveTone(s) {
  if (s === 'pending') return 'bg-amber-100 text-amber-700';
  if (s === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (s === 'rejected') return 'bg-rose-100 text-rose-600';
  return 'bg-ink-100 text-ink-600';
}

function toTimeInput(iso) {
  return iso ? iso.slice(11, 16) : '';
}

function combine(date, time) {
  if (!time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
}

function StaffModal({ open, onClose, staff, shifts, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(staff || { role: 'staff', status: 'active' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        role: form.role || 'staff',
        designation: form.designation || null,
        department: form.department || null,
        shift_id: form.shift_id || null,
        join_date: form.join_date || null,
        salary: Number(form.salary || 0),
        gender: form.gender || null,
        address: form.address || null,
        emergency_name: form.emergency_name || null,
        emergency_phone: form.emergency_phone || null,
        status: form.status || 'active',
      };
      if (staff?.id) {
        await api.put(`/staff/${staff.id}`, payload);
      } else {
        await api.post('/staff', {
          ...payload,
          create_login: !!form.create_login,
          password: form.password || undefined,
        });
      }
      toast.success(staff?.id ? 'Staff updated' : 'Staff added');
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
      title={staff?.id ? 'Edit staff' : 'New staff member'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save staff'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Employee code" hint={staff?.id ? 'Assigned by the system' : 'Generated automatically'}>
          <input className="input opacity-60" value={staff?.employee_code || 'Auto'} disabled />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={form.role || 'staff'} onChange={(v) => set('role', v)}>
            {ROLES.map((r) => <option key={r} value={r}>{statusLabel(r)}</option>)}
          </Select>
        </Field>
        <Field label="Designation">
          <input className="input" value={form.designation || ''} onChange={(e) => set('designation', e.target.value)} placeholder="Night auditor" />
        </Field>
        <Field label="Department">
          <input className="input" list="staff-departments" value={form.department || ''} onChange={(e) => set('department', e.target.value)} />
          <datalist id="staff-departments">
            {DEPARTMENTS.map((d) => <option key={d} value={d} />)}
          </datalist>
        </Field>
        <Field label="Shift">
          <Select value={form.shift_id || ''} onChange={(v) => set('shift_id', v)}>
            <option value="">No shift</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Join date">
          <DateInput value={form.join_date || ''} onChange={(v) => set('join_date', v)} />
        </Field>
        <Field label="Salary">
          <input className="input" type="number" min="0" value={form.salary ?? 0} onChange={(e) => set('salary', e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender || ''} onChange={(v) => set('gender', v)}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status || 'active'} onChange={(v) => set('status', v)}>
            {STAFF_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <input className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Emergency contact">
          <input className="input" value={form.emergency_name || ''} onChange={(e) => set('emergency_name', e.target.value)} />
        </Field>
        <Field label="Emergency phone">
          <input className="input" value={form.emergency_phone || ''} onChange={(e) => set('emergency_phone', e.target.value)} />
        </Field>
        {!staff?.id && (
          <>
            <label className="flex items-center gap-2 text-[13px] text-ink-600 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 text-brand-600"
                checked={!!form.create_login}
                onChange={(e) => set('create_login', e.target.checked)}
              />
              Create a login account for this staff member
            </label>
            {form.create_login && (
              <Field label="Password" required className="sm:col-span-2">
                <input className="input" type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function LeaveModal({ open, onClose, staff, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ type: 'casual', from_date: todayISO(), to_date: todayISO() });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.staff_id) return toast.error('Select a staff member');
    if (!form.from_date || !form.to_date) return toast.error('Both dates are required');
    setSaving(true);
    try {
      await api.post('/staff/leaves', {
        staff_id: form.staff_id,
        type: form.type || 'casual',
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason || null,
      });
      toast.success('Leave request filed');
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
      title="File leave request"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'File request'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Staff member" required className="sm:col-span-2">
          <Select value={form.staff_id || ''} onChange={(v) => set('staff_id', v)}>
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.department || '—'}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={form.type || 'casual'} onChange={(v) => set('type', v)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}
          </Select>
        </Field>
        <Field label="Reason">
          <input className="input" value={form.reason || ''} onChange={(e) => set('reason', e.target.value)} />
        </Field>
        <Field label="From" required>
          <DateInput value={form.from_date || ''} onChange={(v) => set('from_date', v)} />
        </Field>
        <Field label="To" required>
          <DateInput value={form.to_date || ''} onChange={(v) => set('to_date', v)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  const toast = useToast();
  const [tab, setTab] = useState('directory');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [staffStatus, setStaffStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [remove, setRemove] = useState(null);
  const [attDate, setAttDate] = useState(todayISO());
  const [leaveFilter, setLeaveFilter] = useState('');
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const debounced = useDebounced(q);
  const staff = useList('/staff', { limit: 200, q: debounced || undefined });
  const attendance = useFetch(`/staff/attendance/list?date=${attDate}`);
  const attItems = attendance.data?.items || [];
  const attRows = useMemo(
    () => attItems.map((a) => ({ ...a, id: a.id || `att-${a.staff_id}` })),
    [attItems]
  );

  const shifts = useMemo(() => {
    const m = new Map();
    staff.items.forEach((s) => {
      if (s.shift_id && !m.has(s.shift_id)) m.set(s.shift_id, { id: s.shift_id, name: s.shift_name });
    });
    return [...m.values()];
  }, [staff.items]);

  const departments = useMemo(
    () => [...new Set(staff.items.map((s) => s.department).filter(Boolean))].sort(),
    [staff.items]
  );

  const directory = useMemo(() => {
    return staff.items
      .filter((s) => (dept ? s.department === dept : true))
      .filter((s) => (staffStatus ? s.status === staffStatus : true));
  }, [staff.items, dept, staffStatus]);

  const pageItems = directory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const present = attItems.filter((a) => ['present', 'late', 'on_duty'].includes(a.status)).length;
    const onLeave = attItems.filter((a) => a.status === 'leave').length;
    const pending = staff.items.reduce((sum, s) => sum + Number(s.pending_leaves || 0), 0);
    return { headcount: staff.items.length, present, onLeave, pending };
  }, [staff.items, attItems]);

  useEffect(() => {
    if (tab !== 'leave' || staff.items.length === 0) return;
    let cancelled = false;
    setLeavesLoading(true);
    Promise.all(
      staff.items.map((s) =>
        api.get(`/staff/${s.id}`).then((d) =>
          (d.leaves || []).map((l) => ({ ...l, staff_name: s.name, department: s.department }))
        ).catch(() => [])
      )
    ).then((chunks) => {
      if (cancelled) return;
      const all = chunks.flat().sort((a, b) => (b.from_date || '').localeCompare(a.from_date || ''));
      setLeaves(all);
      setLeavesLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, staff.items]);

  const shownLeaves = useMemo(
    () => (leaveFilter ? leaves.filter((l) => l.status === leaveFilter) : leaves),
    [leaves, leaveFilter]
  );

  async function mark(row, status) {
    setBusy(row.staff_id);
    try {
      await api.post('/staff/attendance/mark', {
        staff_id: row.staff_id,
        date: attDate,
        status,
        check_in: row.check_in || null,
        check_out: row.check_out || null,
        note: row.note || null,
      });
      toast.success(`${row.name} marked ${statusLabel(status)}`);
      attendance.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function markTime(row, field, value) {
    const next = { ...row, [field]: value ? combine(attDate, value) : null };
    setBusy(row.staff_id);
    try {
      await api.post('/staff/attendance/mark', {
        staff_id: row.staff_id,
        date: attDate,
        status: row.status || 'present',
        check_in: next.check_in,
        check_out: next.check_out,
        note: row.note || null,
      });
      attendance.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function markAllPresent() {
    setBusy('bulk');
    try {
      const entries = attItems.map((a) => ({
        staff_id: a.staff_id,
        status: 'present',
        check_in: a.check_in || null,
        check_out: a.check_out || null,
        note: a.note || null,
      }));
      await api.post('/staff/attendance/bulk', { date: attDate, entries });
      toast.success('All staff marked present');
      attendance.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reviewLeave(leave, status) {
    try {
      await api.put(`/staff/leaves/${leave.id}`, { status });
      toast.success(`Leave ${status}`);
      setLeaves((ls) => ls.map((l) => (l.id === leave.id ? { ...l, status } : l)));
      staff.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function deleteStaff() {
    try {
      await api.del(`/staff/${remove.id}`);
      toast.success('Staff removed');
      setRemove(null);
      staff.reload();
    } catch (e) {
      toast.error(e.message);
      setRemove(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Roster, attendance and leave requests"
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> Add staff
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Headcount" value={num(stats.headcount)} sub="active roster" icon={Users} tone="brand" />
        <StatCard label="Present" value={num(stats.present)} sub={attDate === todayISO() ? 'today' : fmtDate(attDate, 'short')} icon={UserCheck} tone="emerald" />
        <StatCard label="On leave" value={num(stats.onLeave)} sub="recorded for the day" icon={CalendarOff} tone="amber" />
        <StatCard label="Pending leave" value={num(stats.pending)} sub="awaiting review" icon={ClipboardList} tone="violet" />
      </div>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'directory', label: 'Directory', count: staff.items.length },
          { id: 'attendance', label: 'Attendance', count: attItems.length },
          { id: 'leave', label: 'Leave', count: leaves.length },
        ]}
      />

      {tab === 'directory' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, role, code…" className="w-full sm:w-72" />
            <Select value={dept} onChange={(v) => { setDept(v); setPage(1); }} className="w-full sm:w-48">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={staffStatus} onChange={(v) => { setStaffStatus(v); setPage(1); }} className="w-full sm:w-40">
              <option value="">All statuses</option>
              {STAFF_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
            {(q || dept || staffStatus) && (
              <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setDept(''); setStaffStatus(''); setPage(1); }}>Clear</button>
            )}
          </div>

          <DataTable
            loading={staff.loading}
            rows={pageItems}
            onRowClick={(r) => setModal(r)}
            empty={
              <EmptyState
                icon={Users}
                title={q || dept || staffStatus ? 'No staff match' : 'No staff yet'}
                message={
                  q || dept || staffStatus
                    ? 'Try clearing the filters.'
                    : 'Add your first team member to start tracking attendance and leave.'
                }
                action={
                  <button className="btn-primary btn-sm" onClick={() => setModal({})}>
                    <Plus size={14} /> Add staff
                  </button>
                }
              />
            }
            columns={[
              {
                key: 'name',
                label: 'Staff',
                render: (r) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size={34} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{r.name}</p>
                      <p className="truncate text-[12px] text-ink-400">{r.employee_code}{r.designation ? ` · ${r.designation}` : ''}</p>
                    </div>
                  </div>
                ),
              },
              { key: 'role', label: 'Role', render: (r) => statusLabel(r.role) },
              { key: 'department', label: 'Department', render: (r) => r.department || '—' },
              { key: 'shift_name', label: 'Shift', render: (r) => r.shift_name || '—' },
              { key: 'salary', label: 'Salary', render: (r) => money(r.salary) },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <span className={clsx('chip', staffTone(r.status))}>{statusLabel(r.status)}</span>,
              },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      title="Edit"
                      onClick={() => setModal(r)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove"
                      onClick={() => setRemove(r)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />

          {directory.length > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={directory.length} onPage={setPage} /></div>
          )}

          {!staff.loading && !staff.error && directory.length === 0 && (q || dept || staffStatus) && (
            <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-400">
              <SearchIcon size={14} /> No staff match this filter
            </div>
          )}
        </>
      )}

      {tab === 'attendance' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <DateInput value={attDate} onChange={setAttDate} className="w-full sm:w-44" />
            <button className="btn-secondary btn-sm" onClick={markAllPresent} disabled={busy === 'bulk' || attendance.loading}>
              <CheckCircle2 size={14} /> Mark all present
            </button>
            {attDate !== todayISO() && (
              <button className="btn-ghost btn-sm" onClick={() => setAttDate(todayISO())}>Back to today</button>
            )}
          </div>

          <DataTable
            loading={attendance.loading}
            rows={attRows}
            empty={
              <EmptyState
                icon={ClipboardList}
                title="No staff to mark"
                message="Add staff members first — attendance is tracked for everyone on the roster."
              />
            }
            columns={[
              {
                key: 'name',
                label: 'Staff',
                render: (r) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size={32} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{r.name}</p>
                      <p className="truncate text-[12px] text-ink-400">{r.employee_code} · {r.department || '—'}</p>
                    </div>
                  </div>
                ),
              },
              { key: 'shift_name', label: 'Shift', render: (r) => r.shift_name || '—' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className={clsx('chip', attTone(r.status || 'absent'))}>{r.status ? statusLabel(r.status) : 'Not marked'}</span>
                    <Select
                      value={r.status || ''}
                      onChange={(v) => mark(r, v)}
                      className="w-28 py-1.5 text-[12px]"
                      disabled={busy === r.staff_id}
                    >
                      <option value="">Mark…</option>
                      {ATT_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </Select>
                  </div>
                ),
              },
              {
                key: 'check_in',
                label: 'In',
                render: (r) => (
                  <input
                    type="time"
                    className="input w-28 py-1.5 text-[12.5px]"
                    value={toTimeInput(r.check_in)}
                    disabled={busy === r.staff_id}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => markTime(r, 'check_in', e.target.value)}
                  />
                ),
              },
              {
                key: 'check_out',
                label: 'Out',
                render: (r) => (
                  <input
                    type="time"
                    className="input w-28 py-1.5 text-[12.5px]"
                    value={toTimeInput(r.check_out)}
                    disabled={busy === r.staff_id}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => markTime(r, 'check_out', e.target.value)}
                  />
                ),
              },
              {
                key: 'hours',
                label: 'Hours',
                render: (r) => <span className="font-semibold text-ink-900">{r.hours ?? '—'}</span>,
              },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-emerald-50 hover:text-emerald-600"
                      title="Present"
                      disabled={busy === r.staff_id}
                      onClick={() => mark(r, 'present')}
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Absent"
                      disabled={busy === r.staff_id}
                      onClick={() => mark(r, 'absent')}
                    >
                      <XCircle size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {tab === 'leave' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <Select value={leaveFilter} onChange={setLeaveFilter} className="w-full sm:w-44">
              <option value="">All requests</option>
              {LEAVE_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
            <button className="btn-secondary btn-sm" onClick={() => setLeaveModal(true)}>
              <Plus size={14} /> File leave request
            </button>
            {leavesLoading && <span className="text-[13px] text-ink-400">Loading leave history…</span>}
          </div>

          <DataTable
            loading={leavesLoading}
            rows={shownLeaves}
            empty={
              <EmptyState
                icon={CalendarOff}
                title={leaveFilter ? 'No requests with this status' : 'No leave requests'}
                message="Leave requests filed here can be approved or rejected without leaving the dashboard."
                action={
                  <button className="btn-primary btn-sm" onClick={() => setLeaveModal(true)}>
                    <Plus size={14} /> File leave request
                  </button>
                }
              />
            }
            columns={[
              {
                key: 'staff_name',
                label: 'Staff',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{r.staff_name}</p>
                    <p className="truncate text-[12px] text-ink-400">{r.department || '—'}</p>
                  </div>
                ),
              },
              { key: 'type', label: 'Type', render: (r) => statusLabel(r.type) },
              {
                key: 'from_date',
                label: 'Dates',
                render: (r) => (
                  <div>
                    <p className="text-[13px] text-ink-800">{fmtDate(r.from_date, 'short')} → {fmtDate(r.to_date, 'short')}</p>
                    <p className="text-[11.5px] text-ink-400">
                      {Math.max(1, Math.round((new Date(r.to_date) - new Date(r.from_date)) / 864e5) + 1)} day(s)
                    </p>
                  </div>
                ),
              },
              { key: 'reason', label: 'Reason', render: (r) => <span className="text-[13px] text-ink-600">{r.reason || '—'}</span> },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <span className={clsx('chip', leaveTone(r.status))}>{statusLabel(r.status)}</span>,
              },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'pending' ? (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => reviewLeave(r, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
                          onClick={() => reviewLeave(r, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-400">—</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      <StaffModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        staff={modal?.id ? modal : null}
        shifts={shifts}
        onDone={staff.reload}
      />
      <LeaveModal
        key={leaveModal ? 'open' : 'closed'}
        open={leaveModal}
        onClose={() => setLeaveModal(false)}
        staff={staff.items}
        onDone={staff.reload}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={deleteStaff}
        title="Remove this staff member?"
        message={`${remove?.name || 'This staff member'} will be removed from the roster. Attendance history is kept.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
