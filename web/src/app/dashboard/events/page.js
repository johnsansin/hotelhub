'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Pencil, CalendarDays, PartyPopper, Clock, Users, IndianRupee, CalendarClock, Inbox } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDateTime, num, statusLabel } from '@/lib/format';
import { StatCard, EmptyState, Field } from '@/components/ui/kit';
import { DataTable, Select } from '@/components/ui/table';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const STATUSES = ['enquiry', 'confirmed', 'completed', 'cancelled'];
const TYPES = ['banquet', 'conference', 'wedding', 'birthday', 'corporate', 'other'];

function statusTone(s) {
  if (s === 'confirmed') return 'bg-emerald-100 text-emerald-700';
  if (s === 'enquiry') return 'bg-amber-100 text-amber-700';
  if (s === 'completed') return 'bg-blue-100 text-blue-700';
  return 'bg-ink-100 text-ink-600';
}

function toLocalInput(iso) {
  return iso ? iso.slice(0, 16) : '';
}

function EventModal({ open, onClose, event, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(event || { status: 'enquiry', event_type: 'banquet', pax: 50 });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title) return toast.error('Event title is required');
    if (form.start_at && form.end_at && form.end_at <= form.start_at) {
      return toast.error('End time must be after start time');
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        venue: form.venue || null,
        client_name: form.client_name || null,
        client_email: form.client_email || null,
        client_phone: form.client_phone || null,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        pax: Number(form.pax || 0),
        event_type: form.event_type || 'banquet',
        status: form.status || 'enquiry',
        rate: Number(form.rate || 0),
        advance: Number(form.advance || 0),
        notes: form.notes || null,
      };
      if (event?.id) await api.put(`/events/${event.id}`, payload);
      else await api.post('/events', payload);
      toast.success(event?.id ? 'Event updated' : 'Event created');
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
      title={event?.id ? 'Edit event' : 'New event'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save event'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <input className="input" value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Mehta wedding reception" />
        </Field>
        <Field label="Client name">
          <input className="input" value={form.client_name || ''} onChange={(e) => set('client_name', e.target.value)} />
        </Field>
        <Field label="Venue">
          <input className="input" value={form.venue || ''} onChange={(e) => set('venue', e.target.value)} placeholder="Grand Ballroom" />
        </Field>
        <Field label="Client email">
          <input className="input" type="email" value={form.client_email || ''} onChange={(e) => set('client_email', e.target.value)} />
        </Field>
        <Field label="Client phone">
          <input className="input" value={form.client_phone || ''} onChange={(e) => set('client_phone', e.target.value)} />
        </Field>
        <Field label="Starts">
          <input
            className="input"
            type="datetime-local"
            value={toLocalInput(form.start_at)}
            onChange={(e) => set('start_at', e.target.value)}
          />
        </Field>
        <Field label="Ends">
          <input
            className="input"
            type="datetime-local"
            value={toLocalInput(form.end_at)}
            onChange={(e) => set('end_at', e.target.value)}
          />
        </Field>
        <Field label="Type">
          <Select value={form.event_type || 'banquet'} onChange={(v) => set('event_type', v)}>
            {TYPES.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status || 'enquiry'} onChange={(v) => set('status', v)}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Guests (pax)">
          <input className="input" type="number" min="0" value={form.pax ?? 0} onChange={(e) => set('pax', e.target.value)} />
        </Field>
        <Field label="Rate">
          <input className="input" type="number" min="0" value={form.rate ?? 0} onChange={(e) => set('rate', e.target.value)} />
        </Field>
        <Field label="Advance received">
          <input className="input" type="number" min="0" value={form.advance ?? 0} onChange={(e) => set('advance', e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input min-h-[70px]"
            value={form.notes || ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Catering, decorations, special requests…"
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function EventsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);

  const events = useList('/events', { limit: 200 });

  const nowIso = new Date().toISOString();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.items
      .filter((e) => (status ? e.status === status : true))
      .filter((e) => {
        if (period === 'upcoming') return e.start_at && e.start_at >= nowIso && e.status !== 'cancelled';
        if (period === 'past') return !e.start_at || e.start_at < nowIso;
        return true;
      })
      .filter((e) =>
        q
          ? [e.title, e.client_name, e.venue, e.event_type].filter(Boolean).join(' ').toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));
  }, [events.items, status, period, query]);

  const stats = useMemo(() => {
    const confirmedUpcoming = events.items.filter(
      (e) => e.status === 'confirmed' && e.start_at && e.start_at >= nowIso
    );
    const enquiries = events.items.filter((e) => e.status === 'enquiry').length;
    const revenue = confirmedUpcoming.reduce((s, e) => s + Number(e.rate || 0), 0);
    const pax = confirmedUpcoming.reduce((s, e) => s + Number(e.pax || 0), 0);
    return { total: events.items.length, confirmed: confirmedUpcoming.length, enquiries, revenue, pax };
  }, [events.items]);

  async function setStatus_(event, next) {
    try {
      await api.put(`/events/${event.id}`, { status: next });
      toast.success(`Event marked ${statusLabel(next)}`);
      events.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Banquets, conferences and social bookings"
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> New event
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming confirmed" value={num(stats.confirmed)} sub={`${num(stats.pax)} pax on the books`} icon={PartyPopper} tone="emerald" />
        <StatCard label="Confirmed revenue" value={money(stats.revenue)} sub="rate of upcoming events" icon={IndianRupee} tone="brand" />
        <StatCard label="Open enquiries" value={num(stats.enquiries)} sub="awaiting a decision" icon={Inbox} tone="amber" />
        <StatCard label="Events on file" value={num(stats.total)} sub="all time" icon={CalendarDays} tone="violet" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          className="input w-full sm:w-72"
          placeholder="Search title, client, venue…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={period} onChange={setPeriod} className="w-full sm:w-44">
          <option value="upcoming">Upcoming</option>
          <option value="past">Past & ongoing</option>
          <option value="all">All periods</option>
        </Select>
        <Select value={status} onChange={(v) => setStatus(v)} className="w-full sm:w-44">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
        {(status || period !== 'upcoming' || query) && (
          <button className="btn-ghost btn-sm" onClick={() => { setStatus(''); setPeriod('upcoming'); setQuery(''); }}>Clear</button>
        )}
      </div>

      <DataTable
        loading={events.loading}
        rows={filtered}
        onRowClick={(r) => setModal(r)}
        empty={
          <EmptyState
            icon={CalendarClock}
            title="No events here"
            message="Track banquets and conference enquiries so banquet ops can plan staffing and F&B."
            action={
              <button className="btn-primary btn-sm" onClick={() => setModal({})}>
                <Plus size={14} /> New event
              </button>
            }
          />
        }
        columns={[
          {
            key: 'title',
            label: 'Event',
            render: (r) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{r.title}</p>
                <p className="truncate text-[12px] text-ink-400">{statusLabel(r.event_type)} · {r.venue || 'Venue TBC'}</p>
              </div>
            ),
          },
          {
            key: 'client_name',
            label: 'Client',
            render: (r) => (
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink-800">{r.client_name || '—'}</p>
                <p className="truncate text-[11.5px] text-ink-400">{r.client_phone || r.client_email || ''}</p>
              </div>
            ),
          },
          {
            key: 'start_at',
            label: 'When',
            render: (r) => {
              if (!r.start_at) return '—';
              const hours =
                r.start_at && r.end_at
                  ? ((new Date(r.end_at) - new Date(r.start_at)) / 36e5).toFixed(1)
                  : null;
              return (
                <div>
                  <p className="text-[13px] text-ink-800">{fmtDateTime(r.start_at)}</p>
                  {hours && <p className="text-[11.5px] text-ink-400">{hours}h · until {fmtDateTime(r.end_at)}</p>}
                </div>
              );
            },
          },
          {
            key: 'pax',
            label: 'Pax',
            render: (r) => (
              <span className="flex items-center gap-1 text-[13px] font-semibold text-ink-900">
                <Users size={13} className="text-ink-400" /> {r.pax}
              </span>
            ),
          },
          {
            key: 'rate',
            label: 'Rate / advance',
            render: (r) => (
              <div>
                <p className="text-[13px] font-semibold text-ink-900">{money(r.rate)}</p>
                <p className="text-[11.5px] text-ink-400">adv. {money(r.advance)}</p>
              </div>
            ),
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
                  onChange={(v) => setStatus_(r, v)}
                  className="w-32 py-1.5 text-[12px]"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </Select>
                <button
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  title="Edit event"
                  onClick={() => setModal(r)}
                >
                  <Pencil size={15} />
                </button>
              </div>
            ),
          },
        ]}
      />

      {!events.loading && !events.error && filtered.length === 0 && (
        <p className="mt-3 text-center text-[13px] text-ink-400">
          <Clock size={13} className="mr-1 inline" /> Nothing matches the current filters.
        </p>
      )}

      <EventModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        event={modal?.id ? modal : null}
        onDone={events.reload}
      />
    </div>
  );
}
