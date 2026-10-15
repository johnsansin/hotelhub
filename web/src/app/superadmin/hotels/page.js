'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Repeat,
  Mail,
  Phone,
  MapPin,
  Star,
  X,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { StatusBadge, Badge, EmptyState, PageLoader, Field } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar } from '@/components/ui/table';
import { Modal, ConfirmDialog, Drawer } from '@/components/ui/Modal';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { money, compactMoney, num, fmtDate, relative } from '@/lib/format';

const LIMIT = 10;

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  city: '',
  country: 'India',
  star_rating: 3,
  tagline: '',
  admin_name: '',
  admin_email: '',
  admin_password: '',
};

export default function SuperadminHotelsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 350);
  const [status, setStatus] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [page, setPage] = useState(1);

  const allMode = Boolean(planCode);
  const { items, total, loading, reload } = useList(
    '/superadmin/hotels',
    allMode ? { limit: 200, status, q: debounced } : { page, limit: LIMIT, status, q: debounced }
  );
  const { data: plansData } = useFetch('/superadmin/plans');
  const plans = plansData?.items || [];

  const [detailId, setDetailId] = useState(null);
  const [selected, setSelected] = useState(null);
  const { data: detail, reload: reloadDetail } = useFetch(
    detailId ? `/superadmin/hotels/${detailId}` : '',
    { enabled: Boolean(detailId) }
  );
  const detailReady = Boolean(detail?.hotel && detail.hotel.id === detailId);
  const activeHotel = detailReady ? detail.hotel : selected;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [planHotel, setPlanHotel] = useState(null);
  const [planForm, setPlanForm] = useState({ plan_id: '', billing_cycle: 'monthly' });
  const [planSaving, setPlanSaving] = useState(false);

  const refreshAll = () => {
    reload();
    if (detailId) reloadDetail();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (hotel) => {
    setEditing(hotel);
    setForm({
      name: hotel.name || '',
      email: hotel.email || '',
      phone: hotel.phone || '',
      city: hotel.city || '',
      country: hotel.country || 'India',
      star_rating: hotel.star_rating || 3,
      tagline: hotel.tagline || '',
      admin_name: '',
      admin_email: '',
      admin_password: '',
    });
    setFormOpen(true);
  };

  const openPlan = (hotel) => {
    setPlanHotel(hotel);
    setPlanForm({ plan_id: hotel.plan_id || '', billing_cycle: 'monthly' });
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('sa_open_create_hotel')) {
      sessionStorage.removeItem('sa_open_create_hotel');
      openCreate();
    }
  }, []);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/superadmin/hotels/${editing.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone,
          city: form.city,
          country: form.country,
          star_rating: Number(form.star_rating),
          tagline: form.tagline,
        });
        toast.success('Hotel updated');
      } else {
        const payload = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone,
          city: form.city,
          country: form.country,
          star_rating: Number(form.star_rating),
          tagline: form.tagline,
        };
        if (form.admin_name || form.admin_password) {
          payload.admin = {
            name: form.admin_name,
            email: form.admin_email || form.email,
            password: form.admin_password,
          };
        }
        await api.post('/superadmin/hotels', payload);
        toast.success('Hotel created');
      }
      setFormOpen(false);
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, hotel } = confirm;
    setConfirm(null);
    try {
      if (type === 'status') {
        const next = hotel.status === 'suspended' ? 'active' : 'suspended';
        await api.put(`/superadmin/hotels/${hotel.id}`, { status: next });
        toast.success(next === 'suspended' ? 'Hotel suspended' : 'Hotel activated');
      } else {
        await api.del(`/superadmin/hotels/${hotel.id}`);
        toast.success('Hotel deleted');
        if (detailId === hotel.id) setDetailId(null);
      }
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const savePlan = async () => {
    if (!planForm.plan_id) {
      toast.error('Choose a plan');
      return;
    }
    setPlanSaving(true);
    try {
      await api.post('/superadmin/subscriptions', {
        hotel_id: planHotel.id,
        plan_id: planForm.plan_id,
        billing_cycle: planForm.billing_cycle,
      });
      toast.success('Subscription created and plan updated');
      setPlanHotel(null);
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPlanSaving(false);
    }
  };

  const filtered = allMode ? items.filter((h) => h.plan_code === planCode) : items;
  const filteredTotal = allMode ? filtered.length : total;
  const pages = Math.max(1, Math.ceil(filteredTotal / LIMIT));
  const safePage = Math.min(page, pages);
  const rows = allMode ? filtered.slice((safePage - 1) * LIMIT, safePage * LIMIT) : items;
  const totalRows = filteredTotal;

  const setFilter = (fn) => (v) => {
    fn(v);
    setPage(1);
  };

  const columns = [
    {
      key: 'name',
      label: 'Hotel',
      render: (r) => (
        <div className="min-w-[180px]">
          <p className="font-semibold text-ink-900">{r.name}</p>
          <p className="text-[12px] text-ink-400">/{r.slug}</p>
        </div>
      ),
    },
    { key: 'city', label: 'City', render: (r) => r.city || '—' },
    { key: 'plan_name', label: 'Plan', render: (r) => (r.plan_name ? <Badge tone="bg-brand-100 text-brand-700">{r.plan_name}</Badge> : '—') },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'rooms', label: 'Rooms', render: (r) => num(r.rooms) },
    { key: 'bookings', label: 'Bookings', render: (r) => num(r.bookings) },
    { key: 'revenue', label: 'Revenue', render: (r) => money(r.revenue) },
    { key: 'created_at', label: 'Created', render: (r) => fmtDate(r.created_at) },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost btn-sm" title="Edit hotel" onClick={() => openEdit(r)}>
            <Pencil size={15} />
          </button>
          <button className="btn-ghost btn-sm" title="Change plan" onClick={() => openPlan(r)}>
            <Repeat size={15} />
          </button>
          <button
            className="btn-ghost btn-sm"
            title={r.status === 'suspended' ? 'Activate hotel' : 'Suspend hotel'}
            onClick={() => setConfirm({ type: 'status', hotel: r })}
          >
            {r.status === 'suspended' ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button className="btn-ghost btn-sm" title="Delete hotel" onClick={() => setConfirm({ type: 'delete', hotel: r })}>
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Hotels"
        subtitle={`${num(totalRows)} properties on the platform`}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Create hotel
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setFilter(setQ)} placeholder="Search name, city or email…" className="w-full sm:w-72" />
        <Select value={status} onChange={setFilter(setStatus)} className="w-full sm:w-40">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Select value={planCode} onChange={setFilter(setPlanCode)} className="w-full sm:w-44">
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.code}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="card">
        <DataTable
          loading={loading}
          rows={rows}
          onRowClick={(r) => {
            setSelected(r);
            setDetailId(r.id);
          }}
          columns={columns}
          empty={
            <EmptyState
              title="No hotels match these filters"
              message="Try clearing search or filters, or create a new property."
              action={
                <button className="btn-primary" onClick={openCreate}>
                  <Plus size={16} /> Create hotel
                </button>
              }
            />
          }
        />
        <PaginationBar page={safePage} pageSize={LIMIT} total={totalRows} onPage={setPage} />
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit hotel' : 'Create hotel'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create hotel'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hotel name" required className="sm:col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sea View Resort" />
          </Field>
          <Field label="Email" required>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="hello@hotel.com" />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
          </Field>
          <Field label="City">
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Goa" />
          </Field>
          <Field label="Country">
            <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Field>
          <Field label="Star rating">
            <Select value={form.star_rating} onChange={(v) => setForm({ ...form, star_rating: v })}>
              {[1, 2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>
                  {s} star
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tagline">
            <input className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Short marketing line" />
          </Field>
        </div>

        {!editing && (
          <div className="mt-5 rounded-2xl border border-dashed border-ink-200 p-4">
            <p className="mb-3 text-[13px] font-semibold text-ink-700">Initial admin account (optional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Admin name">
                <input className="input" value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder="Owner name" />
              </Field>
              <Field label="Admin email">
                <input className="input" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="Falls back to hotel email" />
              </Field>
              <Field label="Password" hint="Defaults to admin123 when left blank">
                <input className="input" type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="••••••••" />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(planHotel)}
        onClose={() => setPlanHotel(null)}
        title={`Change plan${planHotel ? ` · ${planHotel.name}` : ''}`}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPlanHotel(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={savePlan} disabled={planSaving}>
              {planSaving ? 'Saving…' : 'Apply plan'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Plan" required>
            <Select value={planForm.plan_id} onChange={(v) => setPlanForm({ ...planForm, plan_id: v })}>
              <option value="">Select a plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price_monthly)}/mo
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billing cycle">
            <Select value={planForm.billing_cycle} onChange={(v) => setPlanForm({ ...planForm, billing_cycle: v })}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
          <p className="text-[12.5px] text-ink-400">
            Creates a new subscription starting today and assigns the plan to this hotel.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        danger={confirm?.type === 'delete'}
        title={confirm?.type === 'delete' ? 'Delete hotel?' : confirm?.hotel?.status === 'suspended' ? 'Activate hotel?' : 'Suspend hotel?'}
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Confirm'}
        message={
          confirm?.type === 'delete'
            ? `"${confirm?.hotel?.name}" and all of its data will be permanently removed. This cannot be undone.`
            : confirm?.hotel?.status === 'suspended'
              ? `Users of "${confirm?.hotel?.name}" will be able to sign in again.`
              : `Users of "${confirm?.hotel?.name}" will be blocked from signing in until reactivated.`
        }
      />

      <Drawer open={Boolean(detailId)} onClose={() => setDetailId(null)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div className="min-w-0">
              <h3 className="truncate text-[15.5px] font-semibold text-ink-900">{activeHotel?.name || 'Hotel'}</h3>
              <p className="truncate text-[12.5px] text-ink-400">/{activeHotel?.slug}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={activeHotel?.status} />
                {activeHotel?.plan_name && <Badge tone="bg-brand-100 text-brand-700">{activeHotel.plan_name}</Badge>}
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setDetailId(null)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {!detailReady && <PageLoader label="Loading hotel…" />}

            {detailReady && (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: 'Rooms', value: num(detail.stats?.rooms) },
                    { label: 'Bookings', value: num(detail.stats?.bookings) },
                    { label: 'Revenue', value: compactMoney(detail.stats?.revenue) },
                    { label: 'Staff', value: num(detail.stats?.staff) },
                    { label: 'Users', value: num(detail.users?.length) },
                    { label: 'Invoices', value: num(detail.stats?.invoices) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl bg-ink-50 px-3 py-3 text-center">
                      <p className="text-[15px] font-bold text-ink-900">{s.value}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-500">{s.label}</p>
                    </div>
                  ))}
                </div>

                <section>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">Contact</h4>
                  <ul className="space-y-2 text-[13.5px] text-ink-700">
                    <li className="flex items-center gap-2">
                      <Mail size={15} className="text-ink-400" /> {detail.hotel.email}
                    </li>
                    <li className="flex items-center gap-2">
                      <Phone size={15} className="text-ink-400" /> {detail.hotel.phone || '—'}
                    </li>
                    <li className="flex items-center gap-2">
                      <MapPin size={15} className="text-ink-400" /> {[detail.hotel.city, detail.hotel.state, detail.hotel.country].filter(Boolean).join(', ') || '—'}
                    </li>
                    <li className="flex items-center gap-2">
                      <Star size={15} className="text-gold-500" /> {detail.hotel.star_rating || 3}-star · joined {fmtDate(detail.hotel.created_at)}
                    </li>
                  </ul>
                  {selected?.owner_name && (
                    <p className="mt-2 text-[12.5px] text-ink-500">
                      Created by {selected.owner_name} ({selected.owner_email})
                    </p>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">Subscription history</h4>
                  {detail.subscriptions?.length ? (
                    <ul className="space-y-2">
                      {detail.subscriptions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium text-ink-800">
                              {s.plan_name || 'Plan'} · {s.billing_cycle}
                            </p>
                            <p className="text-[12px] text-ink-400">Renews {fmtDate(s.ends_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13.5px] font-semibold text-ink-900">{money(s.amount)}</p>
                            <StatusBadge status={s.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-ink-400">No subscriptions yet.</p>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">Team ({detail.users?.length || 0})</h4>
                  <ul className="space-y-1.5">
                    {(detail.users || []).slice(0, 6).map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-ink-700">{u.name}</span>
                        <span className="flex items-center gap-2">
                          <Badge>{u.role}</Badge>
                          <span className="text-[11.5px] text-ink-400">{u.last_login_at ? relative(u.last_login_at) : 'never'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(detail.users?.length || 0) > 6 && (
                    <p className="mt-1.5 text-[12px] text-ink-400">+{detail.users.length - 6} more</p>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">Recent bookings</h4>
                  {detail.recent_bookings?.length ? (
                    <ul className="space-y-1.5">
                      {detail.recent_bookings.map((b) => (
                        <li key={b.code} className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[12.5px]">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-800">
                              {b.code} · {b.guest_name}
                            </p>
                            <p className="text-[11.5px] text-ink-400">
                              {fmtDate(b.check_in, 'short')} → {fmtDate(b.check_out, 'short')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-ink-900">{money(b.total_amount)}</p>
                            <StatusBadge status={b.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-ink-400">No bookings yet.</p>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-ink-100 px-5 py-3">
            <button className="btn-secondary btn-sm" onClick={() => openEdit(activeHotel)} disabled={!detailReady}>
              <Pencil size={14} /> Edit
            </button>
            <button className="btn-secondary btn-sm" onClick={() => openPlan(activeHotel)} disabled={!detailReady}>
              <Repeat size={14} /> Plan
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setConfirm({ type: 'status', hotel: activeHotel })}
              disabled={!detailReady}
            >
              {activeHotel?.status === 'suspended' ? (
                <>
                  <Play size={14} /> Activate
                </>
              ) : (
                <>
                  <Pause size={14} /> Suspend
                </>
              )}
            </button>
            <button
              className="btn-danger btn-sm ml-auto"
              onClick={() => setConfirm({ type: 'delete', hotel: activeHotel })}
              disabled={!detailReady}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
