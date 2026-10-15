'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { Plus, Pencil, Users, UserPlus, Crown, Wallet, ArrowRight, Phone, Mail, MapPin, Search as SearchIcon } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, num, statusLabel } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Avatar, Field } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar } from '@/components/ui/table';
import { Modal, Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 10;
const TIERS = ['standard', 'silver', 'gold', 'platinum'];

function tierTone(t) {
  if (t === 'platinum') return 'bg-violet-100 text-violet-700';
  if (t === 'gold') return 'bg-amber-100 text-amber-700';
  if (t === 'silver') return 'bg-ink-100 text-ink-600';
  return 'bg-brand-100 text-brand-700';
}

function GuestModal({ open, onClose, guest, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(guest || { vip_tier: 'standard' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.first_name) return toast.error('First name is required');
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        city: form.city || null,
        country: form.country || null,
        nationality: form.nationality || null,
        address: form.address || null,
        id_type: form.id_type || null,
        id_number: form.id_number || null,
        gender: form.gender || null,
        vip_tier: form.vip_tier || 'standard',
        notes: form.notes || null,
      };
      if (guest?.id) await api.put(`/guests/${guest.id}`, payload);
      else await api.post('/guests', payload);
      toast.success(guest?.id ? 'Guest updated' : 'Guest added');
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
      title={guest?.id ? 'Edit guest' : 'New guest'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save guest'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input className="input" value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className="input" value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+91 90000 00000" />
        </Field>
        <Field label="City">
          <input className="input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Country">
          <input className="input" value={form.country || ''} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label="Nationality">
          <input className="input" value={form.nationality || ''} onChange={(e) => set('nationality', e.target.value)} />
        </Field>
        <Field label="Address">
          <input className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="ID type">
          <Select value={form.id_type || ''} onChange={(v) => set('id_type', v)}>
            <option value="">None</option>
            <option value="Passport">Passport</option>
            <option value="Driving Licence">Driving licence</option>
            <option value="Aadhaar">Aadhaar</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
        <Field label="ID number">
          <input className="input" value={form.id_number || ''} onChange={(e) => set('id_number', e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender || ''} onChange={(v) => set('gender', v)}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
        <Field label="VIP tier">
          <Select value={form.vip_tier || 'standard'} onChange={(v) => set('vip_tier', v)}>
            {TIERS.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input min-h-[70px]"
            value={form.notes || ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Preferences, allergies, feedback…"
          />
        </Field>
      </div>
    </Modal>
  );
}

function GuestDrawer({ guestId, onClose, onEdit, onSaved }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const history = useFetch(`/guests/${guestId}/history`, { enabled: !!guestId });
  const g = history.data?.guest;

  async function saveNote() {
    setSavingNote(true);
    try {
      await api.put(`/guests/${guestId}`, { notes: note });
      toast.success('Note saved');
      history.reload();
      onSaved();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Drawer open={!!guestId} onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={g ? `${g.first_name} ${g.last_name || ''}` : '·'} size={44} />
            <div>
              <p className="text-[15px] font-semibold text-ink-900">
                {g ? `${g.first_name} ${g.last_name || ''}` : 'Loading…'}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {g?.vip_tier && <span className={clsx('chip', tierTone(g.vip_tier))}><Crown size={11} /> {statusLabel(g.vip_tier)}</span>}
                {g?.is_blacklisted && <span className="chip bg-rose-100 text-rose-700">Blacklisted</span>}
              </div>
            </div>
          </div>
          <button className="text-[13px] font-semibold text-ink-500 hover:text-ink-800" onClick={onClose}>Close</button>
        </div>

        {history.loading && <div className="p-5 text-sm text-ink-400">Loading profile…</div>}
        {history.error && <div className="p-5 text-sm text-rose-600">{history.error.message}</div>}

        {!history.loading && !history.error && g && (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <Link className="btn-primary btn-sm" href="/dashboard/bookings">
                <Plus size={14} /> New booking
              </Link>
              <button className="btn-secondary btn-sm" onClick={() => onEdit(g)}>
                <Pencil size={14} /> Edit profile
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-brand-600">Stays</p>
                <p className="text-lg font-bold text-ink-900">{g.total_stays}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-emerald-600">Lifetime</p>
                <p className="text-[15px] font-bold text-ink-900">{money(g.total_spent)}</p>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-ink-500">Bookings</p>
                <p className="text-lg font-bold text-ink-900">{history.data.bookings.length}</p>
              </div>
            </div>

            <section className="rounded-xl border border-ink-100 p-4">
              <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Contact</h4>
              <ul className="space-y-2 text-[13px]">
                <li className="flex items-center gap-2 text-ink-600"><Phone size={14} className="text-ink-400" /> {g.phone || '—'}</li>
                <li className="flex items-center gap-2 text-ink-600"><Mail size={14} className="text-ink-400" /> {g.email || '—'}</li>
                <li className="flex items-center gap-2 text-ink-600"><MapPin size={14} className="text-ink-400" /> {[g.city, g.country].filter(Boolean).join(', ') || '—'}</li>
              </ul>
              <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-[12.5px]">
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Nationality</dt><dd className="font-medium text-ink-800">{g.nationality || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">ID</dt><dd className="font-medium text-ink-800">{[g.id_type, g.id_number].filter(Boolean).join(' · ') || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Guest since</dt><dd className="font-medium text-ink-800">{fmtDate(g.created_at)}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-ink-100 p-4">
              <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Spend summary</h4>
              <dl className="space-y-1.5 text-[12.5px]">
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Total booked</dt><dd className="font-semibold text-ink-900">{money(history.data.spend.total_booked)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Total paid</dt><dd className="font-semibold text-ink-900">{money(history.data.spend.total_paid)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Completed stays</dt><dd className="font-semibold text-ink-900">{history.data.spend.stays}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Outstanding</dt><dd className="font-semibold text-rose-600">{money(Number(history.data.spend.total_booked) - Number(history.data.spend.total_paid))}</dd></div>
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Stay history</h4>
              {history.data.bookings.length === 0 ? (
                <p className="text-[13px] text-ink-400">No stays recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.data.bookings.map((b) => (
                    <li key={b.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink-900">{b.code}</span>
                        <StatusBadge status={b.status} />
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-500">
                        {fmtDate(b.check_in, 'short')} → {fmtDate(b.check_out, 'short')} · {b.room_type_name || 'Room'} · {b.room_number || '—'}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-500">
                        {money(b.total_amount)} · paid {money(b.paid_amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Notes</h4>
              <textarea
                className="input min-h-[80px]"
                value={note || g.notes || ''}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for the front desk…"
              />
              <button className="btn-secondary btn-sm mt-2" onClick={saveNote} disabled={savingNote}>
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default function GuestsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [guestId, setGuestId] = useState(null);

  const debounced = useDebounced(q);
  const guests = useList('/guests', { limit: 200, q: debounced || undefined });

  const filtered = useMemo(() => {
    if (segment === 'returning') return guests.items.filter((g) => Number(g.total_stays) > 1);
    if (segment === 'new') return guests.items.filter((g) => Number(g.total_stays) <= 1);
    return guests.items;
  }, [guests.items, segment]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const returning = guests.items.filter((g) => Number(g.total_stays) > 1).length;
    const spend = guests.items.reduce((s, g) => s + Number(g.total_spent || 0), 0);
    return { total: guests.items.length, returning, fresh: guests.items.length - returning, spend };
  }, [guests.items]);

  return (
    <div>
      <PageHeader
        title="Guests"
        subtitle="Guest profiles, stay history and lifetime value"
        actions={
          <button className="btn-primary" onClick={() => { setModal({}); }}>
            <Plus size={16} /> Add guest
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Guests" value={num(stats.total)} sub="profiles on file" icon={Users} tone="brand" />
        <StatCard label="Returning" value={num(stats.returning)} sub="more than one stay" icon={Crown} tone="emerald" />
        <StatCard label="First timers" value={num(stats.fresh)} sub="one stay or fewer" icon={UserPlus} tone="amber" />
        <StatCard label="Lifetime value" value={money(stats.spend)} sub="recorded guest spend" icon={Wallet} tone="violet" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, email, phone…" className="w-full sm:w-72" />
        <Select value={segment} onChange={(v) => { setSegment(v); setPage(1); }} className="w-full sm:w-48">
          <option value="">All guests</option>
          <option value="returning">Returning (2+ stays)</option>
          <option value="new">New / one-time</option>
        </Select>
        {(q || segment) && (
          <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setSegment(''); setPage(1); }}>Clear</button>
        )}
      </div>

      <DataTable
        loading={guests.loading}
        rows={pageItems}
        onRowClick={(r) => setGuestId(r.id)}
        empty={
          <EmptyState
            icon={Users}
            title={q || segment ? 'No guests found' : 'No guests yet'}
            message={
              q || segment
                ? 'Try a different search or clear the filter.'
                : 'Guests are created from bookings — or add your first profile manually.'
            }
            action={
              <button className="btn-primary btn-sm" onClick={() => setModal({})}>
                <Plus size={14} /> Add guest
              </button>
            }
          />
        }
        columns={[
          {
            key: 'first_name',
            label: 'Guest',
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={`${r.first_name} ${r.last_name || ''}`} size={34} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{r.first_name} {r.last_name}</p>
                  <p className="truncate text-[12px] text-ink-400">{r.email || r.phone || '—'}</p>
                </div>
              </div>
            ),
          },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          {
            key: 'city',
            label: 'Location',
            render: (r) => [r.city, r.country].filter(Boolean).join(', ') || '—',
          },
          { key: 'total_stays', label: 'Stays', render: (r) => <span className="font-semibold text-ink-900">{r.total_stays}</span> },
          {
            key: 'total_spent',
            label: 'Spent',
            render: (r) => <span className="font-semibold text-ink-900">{money(r.total_spent)}</span>,
          },
          { key: 'last_stay', label: 'Last stay', render: (r) => (r.last_stay ? fmtDate(r.last_stay, 'short') : '—') },
          {
            key: 'vip_tier',
            label: 'VIP',
            render: (r) => <span className={clsx('chip', tierTone(r.vip_tier))}><Crown size={11} /> {statusLabel(r.vip_tier)}</span>,
          },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                  title="Open profile"
                  onClick={() => setGuestId(r.id)}
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  title="Edit guest"
                  onClick={() => setModal(r)}
                >
                  <Pencil size={15} />
                </button>
              </div>
            ),
          },
        ]}
      />

      {filtered.length > PAGE_SIZE && (
        <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></div>
      )}

      {!guests.loading && !guests.error && filtered.length === 0 && (q || segment) && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-400">
          <SearchIcon size={14} /> No guests match this filter
        </div>
      )}

      <GuestModal
        key={modal?.id || 'new'}
        open={!!modal}
        onClose={() => setModal(null)}
        guest={modal?.id ? modal : null}
        onDone={() => { guests.reload(); }}
      />
      <GuestDrawer
        key={guestId || 'none'}
        guestId={guestId}
        onClose={() => setGuestId(null)}
        onEdit={(g) => { setGuestId(null); setModal(g); }}
        onSaved={guests.reload}
      />
    </div>
  );
}
