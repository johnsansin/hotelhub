'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Building2, ShieldCheck, Palette, LayoutGrid, Users, RefreshCw, Upload, Trash2,
  AlertTriangle, Save,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useFetch, useList } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDate, num, money } from '@/lib/format';
import { Badge, EmptyState, Field, PageLoader } from '@/components/ui/kit';
import { DataTable, Select, Toggle } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const TABS = [
  { id: 'property', label: 'Property', icon: Building2 },
  { id: 'policies', label: 'Policies', icon: ShieldCheck },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'modules', label: 'Modules', icon: LayoutGrid },
  { id: 'team', label: 'Team', icon: Users },
];

const ROLES = ['admin', 'manager', 'receptionist', 'housekeeper', 'accountant', 'storekeeper', 'restaurant', 'staff'];

const MODULE_LABELS = {
  accounts: 'Accounts', ai: 'AI Concierge', bookings: 'Bookings', events: 'Events & Banquets',
  found_lost: 'Found & Lost', frontdesk: 'Front Desk', guests: 'Guests', housekeeping: 'Housekeeping',
  inventory: 'Inventory', maintenance: 'Maintenance', notifications: 'Notifications', pos: 'POS Sales',
  purchases: 'Purchases', reports: 'Reports', restaurant: 'Restaurant', reviews: 'Reviews',
  rooms: 'Rooms', sales: 'Retail Sales', staff: 'Staff',
};

function mediaSrc(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `http://localhost:5000${url}`;
}

const PROPERTY_KEYS = [
  'name', 'legal_name', 'tagline', 'description', 'email', 'phone', 'website',
  'address', 'city', 'state', 'country', 'zip', 'timezone', 'currency',
  'check_in_time', 'check_out_time', 'tax_rate', 'service_charge',
];

const POLICY_KEYS = ['check_in', 'check_out', 'cancellation', 'children', 'pets'];

const POLICY_LABELS = {
  check_in: 'Check-in time',
  check_out: 'Check-out time',
  cancellation: 'Cancellation policy',
  children: 'Children & extra beds',
  pets: 'Pet policy',
};

export default function SettingsPage() {
  const toast = useToast();
  const settings = useFetch('/settings');
  const users = useList('/users', { limit: 200 });

  const [tab, setTab] = useState('property');
  const [form, setForm] = useState(null);
  const [modules, setModules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'staff', phone: '', designation: '' });
  const [userSaving, setUserSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!settings.data) return;
    const h = settings.data.hotel || {};
    setForm({
      ...h,
      check_in_time: (h.check_in_time || '').slice(0, 5),
      check_out_time: (h.check_out_time || '').slice(0, 5),
      policies: { check_in: '', check_out: '', cancellation: '', children: '', pets: '', ...(h.policies || {}) },
    });
    setModules((settings.data.modules || []).map((m) => ({ ...m })));
  }, [settings.data]);

  const sub = settings.data?.subscription;
  const dirtyModules = useMemo(() => {
    const original = settings.data?.modules || [];
    return modules.some((m) => original.find((o) => o.module === m.module)?.is_enabled !== m.is_enabled);
  }, [modules, settings.data]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setPolicy(key, value) {
    setForm((f) => ({ ...f, policies: { ...f.policies, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    try {
      if (tab === 'modules') {
        await api.put('/settings/modules', {
          modules: modules.map((m) => ({ module: m.module, is_enabled: !!m.is_enabled, config: m.config ?? {} })),
        });
      } else {
        const body = {};
        if (tab === 'property') {
          PROPERTY_KEYS.forEach((k) => {
            if (form[k] === undefined || form[k] === null) return;
            if (k === 'tax_rate' || k === 'service_charge') body[k] = Number(form[k]) || 0;
            else if (k === 'check_in_time' || k === 'check_out_time') body[k] = form[k].length === 5 ? `${form[k]}:00` : form[k];
            else body[k] = form[k];
          });
        } else if (tab === 'policies') {
          body.policies = form.policies;
        } else if (tab === 'branding') {
          body.logo_url = form.logo_url || null;
          body.cover_url = form.cover_url || null;
        } else {
          toast.info('Nothing to save in this tab');
          setSaving(false);
          return;
        }
        await api.put('/settings', body);
      }
      toast.success('Settings saved');
      settings.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadField(field, file) {
    if (!file) return;
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload('/uploads', fd);
      set(field, res.url);
      toast.success('File uploaded — save to apply');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading('');
    }
  }

  async function createUser() {
    setUserSaving(true);
    try {
      await api.post('/users', {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        phone: userForm.phone || undefined,
        designation: userForm.designation || undefined,
      });
      toast.success('Team member added');
      setUserOpen(false);
      setUserForm({ name: '', email: '', password: '', role: 'staff', phone: '', designation: '' });
      users.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUserSaving(false);
    }
  }

  async function toggleUser(u) {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      toast.success(u.is_active ? 'Access revoked' : 'Access restored');
      users.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removeUser() {
    const u = confirm;
    setConfirm(null);
    try {
      await api.del(`/users/${u.id}`);
      toast.success('Team member removed');
      users.reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (settings.loading || !form) return <PageLoader label="Loading settings…" />;
  if (settings.error) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <AlertTriangle size={24} className="text-rose-500" />
        <p className="text-sm text-ink-500">{settings.error.message}</p>
        <button className="btn-secondary btn-sm" onClick={settings.reload}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const canSave = ['property', 'policies', 'branding', 'modules'].includes(tab);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Property profile, guest policies, branding, modules and team"
        actions={
          <button className="btn-primary" onClick={save} disabled={!canSave || saving}>
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <div className="card mb-5 p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition',
                  tab === t.id ? 'bg-brand-600 text-white shadow-soft' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                )}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'property' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="mb-4 text-[15px] font-semibold text-ink-900">Identity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hotel name" required>
                <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Legal name">
                <input className="input" value={form.legal_name || ''} onChange={(e) => set('legal_name', e.target.value)} />
              </Field>
              <Field label="Tagline" className="sm:col-span-2">
                <input className="input" value={form.tagline || ''} onChange={(e) => set('tagline', e.target.value)} />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  className="input min-h-[90px] resize-y"
                  value={form.description || ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Website" className="sm:col-span-2">
                <input className="input" value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-4 text-[15px] font-semibold text-ink-900">Address</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address" className="sm:col-span-2">
                <input className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="City">
                <input className="input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="State / Region">
                <input className="input" value={form.state || ''} onChange={(e) => set('state', e.target.value)} />
              </Field>
              <Field label="Country">
                <input className="input" value={form.country || ''} onChange={(e) => set('country', e.target.value)} />
              </Field>
              <Field label="Postal code">
                <input className="input" value={form.zip || ''} onChange={(e) => set('zip', e.target.value)} />
              </Field>
              <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata">
                <input className="input" value={form.timezone || ''} onChange={(e) => set('timezone', e.target.value)} />
              </Field>
              <Field label="Currency code">
                <input className="input" value={form.currency || ''} onChange={(e) => set('currency', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-4 text-[15px] font-semibold text-ink-900">Operations</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Check-in from">
                <input className="input" type="time" value={form.check_in_time || ''} onChange={(e) => set('check_in_time', e.target.value)} />
              </Field>
              <Field label="Check-out until">
                <input className="input" type="time" value={form.check_out_time || ''} onChange={(e) => set('check_out_time', e.target.value)} />
              </Field>
              <Field label="Tax rate (%)" hint="Applied on folios">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.tax_rate ?? ''}
                  onChange={(e) => set('tax_rate', e.target.value)}
                />
              </Field>
              <Field label="Service charge (%)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.service_charge ?? ''}
                  onChange={(e) => set('service_charge', e.target.value)}
                />
              </Field>
            </div>
          </div>

          {sub && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[12.5px] font-medium text-ink-500">Current plan</p>
                  <p className="mt-1 text-[20px] font-bold text-ink-900">{sub.plan_name || 'Plan'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                    {sub.status}
                  </Badge>
                  <Badge>{sub.billing_cycle}</Badge>
                  <span className="text-[13px] text-ink-500">
                    {money(sub.amount)} · renews {fmtDate(sub.ends_at)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'policies' && (
        <div className="card p-5">
          <p className="mb-4 text-[13px] text-ink-500">
            Shown to guests on the public booking page.
          </p>
          <div className="space-y-4">
            {POLICY_KEYS.map((k) => (
              <Field key={k} label={POLICY_LABELS[k]}>
                {k === 'cancellation' || k === 'children' ? (
                  <textarea
                    className="input min-h-[70px] resize-y"
                    value={form.policies[k] || ''}
                    onChange={(e) => setPolicy(k, e.target.value)}
                  />
                ) : (
                  <input
                    className="input"
                    value={form.policies[k] || ''}
                    onChange={(e) => setPolicy(k, e.target.value)}
                    placeholder={k === 'check_in' ? '2:00 PM' : k === 'check_out' ? '11:00 AM' : ''}
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {[
            { key: 'logo_url', title: 'Logo', hint: 'Square PNG or SVG, shown in the header' },
            { key: 'cover_url', title: 'Cover image', hint: 'Wide photo used on the public site' },
          ].map((b) => (
            <div key={b.key} className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-900">{b.title}</h3>
                  <p className="text-[12.5px] text-ink-400">{b.hint}</p>
                </div>
                <label className="btn-secondary cursor-pointer">
                  {uploading === b.key ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading === b.key ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => uploadField(b.key, e.target.files?.[0])}
                  />
                </label>
              </div>

              <div
                className={clsx(
                  'grid place-items-center overflow-hidden rounded-2xl border border-dashed border-ink-200 bg-ink-50',
                  b.key === 'logo_url' ? 'h-36' : 'h-52'
                )}
              >
                {form[b.key] ? (
                  <img
                    src={mediaSrc(form[b.key])}
                    alt={b.title}
                    className={b.key === 'logo_url' ? 'max-h-24 max-w-[70%] object-contain' : 'h-full w-full object-cover'}
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.retried) {
                        img.dataset.retried = '1';
                        img.src = form[b.key];
                        return;
                      }
                      img.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-[13px] text-ink-400">No {b.title.toLowerCase()} set</span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  className="input"
                  value={form[b.key] || ''}
                  placeholder="/uploads/…"
                  onChange={(e) => set(b.key, e.target.value)}
                />
                <button
                  className="btn-ghost text-rose-500 hover:text-rose-600"
                  onClick={() => set(b.key, '')}
                  title="Clear"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'modules' && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-5">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900">Feature modules</h3>
              <p className="text-[12.5px] text-ink-500">
                {modules.filter((m) => m.is_enabled).length} of {modules.length} enabled
                {dirtyModules ? ' · unsaved changes' : ''}
              </p>
            </div>
            {dirtyModules && <Badge tone="bg-amber-100 text-amber-700">Unsaved</Badge>}
          </div>
          <div className="divide-y divide-ink-100">
            {modules.map((m) => (
              <div key={m.module} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink-800">
                    {MODULE_LABELS[m.module] || m.module}
                  </p>
                  <p className="truncate text-[12px] text-ink-400">{m.module}</p>
                </div>
                <Toggle
                  checked={!!m.is_enabled}
                  onChange={(v) => setModules((ms) => ms.map((x) => (x.module === m.module ? { ...x, is_enabled: v } : x)))}
                />
              </div>
            ))}
            {!modules.length && (
              <EmptyState icon={LayoutGrid} title="No modules" message="Modules are provisioned with your plan." />
            )}
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-5">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900">Team accounts</h3>
              <p className="text-[12.5px] text-ink-500">{num(users.total)} people with dashboard access</p>
            </div>
            <button className="btn-primary" onClick={() => setUserOpen(true)}>
              <Users size={16} /> Add member
            </button>
          </div>

          {users.loading ? (
            <PageLoader label="Loading team…" />
          ) : (
            <DataTable
              rows={users.items}
              keyField="id"
              columns={[
                {
                  key: 'name',
                  label: 'Member',
                  render: (u) => (
                    <div className="min-w-[180px]">
                      <p className="font-medium text-ink-900">{u.name}</p>
                      <p className="text-[12px] text-ink-400">{u.email}</p>
                    </div>
                  ),
                },
                { key: 'role', label: 'Role', render: (u) => <Badge>{u.role}</Badge> },
                { key: 'designation', label: 'Designation', render: (u) => u.designation || '—' },
                { key: 'phone', label: 'Phone', render: (u) => u.phone || '—' },
                {
                  key: 'last_login_at',
                  label: 'Last login',
                  render: (u) => (u.last_login_at ? fmtDate(u.last_login_at) : 'Never'),
                },
                {
                  key: 'is_active',
                  label: 'Access',
                  render: (u) => (
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <Toggle checked={!!u.is_active} onChange={() => toggleUser(u)} />
                      {!u.is_active && <Badge tone="bg-rose-100 text-rose-700">Disabled</Badge>}
                    </div>
                  ),
                },
                {
                  key: 'actions',
                  label: '',
                  render: (u) => (
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-ghost btn-sm text-rose-500 hover:text-rose-600"
                        onClick={() => setConfirm(u)}
                        title="Remove access"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  icon={Users}
                  title="No team members"
                  message="Add accounts so staff can sign in."
                  action={<button className="btn-primary" onClick={() => setUserOpen(true)}>Add member</button>}
                />
              }
            />
          )}
        </div>
      )}

      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title="Add team member"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setUserOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={userSaving || !userForm.name || !userForm.email || userForm.password.length < 6}
              onClick={createUser}
            >
              {userSaving ? 'Creating…' : 'Create account'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input
              className="input"
              value={userForm.name}
              onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Email" required>
            <input
              className="input"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Password" required hint="Minimum 6 characters">
            <input
              className="input"
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            />
          </Field>
          <Field label="Role" required>
            <Select value={userForm.role} onChange={(v) => setUserForm((f) => ({ ...f, role: v }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Phone">
            <input
              className="input"
              value={userForm.phone}
              onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Designation">
            <input
              className="input"
              value={userForm.designation}
              onChange={(e) => setUserForm((f) => ({ ...f, designation: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={removeUser}
        title="Remove team member"
        message={`Remove ${confirm?.name}'s account? Admins cannot be deleted this way.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
