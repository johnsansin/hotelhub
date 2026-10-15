'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Star, Wallet, Building2, Check, Layers } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { StatCard, StatusBadge, Badge, EmptyState, PageLoader, Field } from '@/components/ui/kit';
import { DataTable, Toggle, PaginationBar } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useFetch } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { money, num, fmtDate } from '@/lib/format';

const EMPTY = {
  code: '',
  name: '',
  tagline: '',
  price_monthly: 0,
  price_yearly: 0,
  max_rooms: 0,
  max_staff: 0,
  max_orders_month: 0,
  sort_order: 0,
  features: '',
  highlights: '',
  is_popular: false,
  is_active: true,
};

const lines = (v) =>
  String(v || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export default function SuperadminPlansPage() {
  const toast = useToast();
  const { data: plansData, loading, reload } = useFetch('/superadmin/plans');
  const { data: hotelsData } = useFetch('/superadmin/hotels?limit=200');
  const { data: subsData } = useFetch('/superadmin/subscriptions');
  const { data: statsData } = useFetch('/superadmin/stats');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const plans = plansData?.items || [];
  const hotels = hotelsData?.items || [];
  const subs = subsData?.items || [];
  const activePlans = plans.filter((p) => p.is_active);
  const activeSubs = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
  const subPages = Math.max(1, Math.ceil(subs.length / pageSize));
  const safeSubPage = Math.min(page, subPages);
  const subRows = subs.slice((safeSubPage - 1) * pageSize, safeSubPage * pageSize);

  const hotelsOnPlan = (planId) => hotels.filter((h) => h.plan_id === planId).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      code: plan.code || '',
      name: plan.name || '',
      tagline: plan.tagline || '',
      price_monthly: plan.price_monthly || 0,
      price_yearly: plan.price_yearly || 0,
      max_rooms: plan.max_rooms || 0,
      max_staff: plan.max_staff || 0,
      max_orders_month: plan.max_orders_month || 0,
      sort_order: plan.sort_order || 0,
      features: (plan.features || []).join('\n'),
      highlights: (plan.highlights || []).join('\n'),
      is_popular: Boolean(plan.is_popular),
      is_active: plan.is_active !== false,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        tagline: form.tagline,
        price_monthly: Number(form.price_monthly),
        price_yearly: Number(form.price_yearly),
        max_rooms: Number(form.max_rooms),
        max_staff: Number(form.max_staff),
        max_orders_month: Number(form.max_orders_month),
        sort_order: Number(form.sort_order),
        features: lines(form.features),
        highlights: lines(form.highlights),
        is_popular: form.is_popular,
        is_active: form.is_active,
      };
      if (editing) {
        await api.put(`/superadmin/plans/${editing.id}`, payload);
        toast.success('Plan updated');
      } else {
        await api.post('/superadmin/plans', payload);
        toast.success('Plan created');
      }
      setFormOpen(false);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const patch = async (plan, body, message) => {
    try {
      await api.put(`/superadmin/plans/${plan.id}`, body);
      toast.success(message);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const runDelete = async () => {
    if (!confirm) return;
    const plan = confirm;
    setConfirm(null);
    try {
      const res = await api.del(`/superadmin/plans/${plan.id}`);
      toast.success(res?.in_use ? `Plan deactivated · ${res.in_use} hotel(s) still on it` : 'Plan deactivated');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Plans & billing" subtitle="Subscription tiers and platform revenue" />
        <PageLoader label="Loading plans…" />
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Plans & billing"
        subtitle="Subscription tiers, limits and recurring revenue"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Create plan
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active plans" value={num(activePlans.length)} sub={`${num(plans.length)} plans total`} icon={Layers} tone="brand" />
        <StatCard label="Hotels on plans" value={num(hotels.length)} sub="Across all properties" icon={Building2} tone="violet" />
        <StatCard label="MRR" value={money(statsData?.mrr)} sub="Monthly recurring revenue" icon={Wallet} tone="emerald" />
        <StatCard label="Active subscriptions" value={num(activeSubs.length)} sub={`${num(subs.length)} total records`} icon={Check} tone="amber" />
      </div>

      <h3 className="mb-3 mt-6 text-[15px] font-semibold text-ink-900">Plans</h3>
      {plans.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="bg-ink-100 text-ink-600">{p.code}</Badge>
                    {p.is_popular && (
                      <Badge tone="bg-gold-500/15 text-gold-600">
                        <Star size={11} className="mr-1" /> Popular
                      </Badge>
                    )}
                    {!p.is_active && <Badge tone="bg-rose-100 text-rose-700">Inactive</Badge>}
                  </div>
                  <h4 className="mt-2 text-[16px] font-bold text-ink-900">{p.name}</h4>
                  <p className="line-clamp-2 text-[12.5px] text-ink-500">{p.tagline || '—'}</p>
                </div>
                <Toggle
                  checked={p.is_active !== false}
                  onChange={(v) => patch(p, { is_active: v }, v ? 'Plan activated' : 'Plan deactivated')}
                />
              </div>

              <div className="mt-4 flex items-end gap-3">
                <p className="text-[26px] font-bold leading-none tracking-tight text-ink-900">{money(p.price_monthly)}</p>
                <p className="pb-0.5 text-[12.5px] text-ink-400">/month · {money(p.price_yearly)}/yr</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Rooms', value: p.max_rooms },
                  { label: 'Staff', value: p.max_staff },
                  { label: 'Orders/mo', value: p.max_orders_month },
                ].map((l) => (
                  <div key={l.label} className="rounded-xl bg-ink-50 px-2 py-2">
                    <p className="text-[14px] font-bold text-ink-900">{Number(l.value) > 0 ? num(l.value) : '∞'}</p>
                    <p className="text-[11px] text-ink-500">{l.label}</p>
                  </div>
                ))}
              </div>

              <ul className="mt-4 flex-1 space-y-1.5">
                {(p.features || []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-ink-600">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
                {!p.features?.length && <li className="text-[13px] text-ink-400">No features listed.</li>}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                <span className="text-[12.5px] text-ink-500">{num(hotelsOnPlan(p.id))} hotel(s) · sort {p.sort_order}</span>
                <span className="flex items-center gap-1">
                  <button
                    className="btn-ghost btn-sm"
                    title={p.is_popular ? 'Remove popular badge' : 'Mark as popular'}
                    onClick={() => patch(p, { is_popular: !p.is_popular }, p.is_popular ? 'Popular badge removed' : 'Marked as popular')}
                  >
                    <Star size={15} className={p.is_popular ? 'text-gold-500' : 'text-ink-400'} />
                  </button>
                  <button className="btn-ghost btn-sm" title="Edit plan" onClick={() => openEdit(p)}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn-ghost btn-sm" title="Deactivate plan" onClick={() => setConfirm(p)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={Layers}
            title="No plans yet"
            message="Create your first subscription tier to start onboarding hotels."
            action={
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Create plan
              </button>
            }
          />
        </div>
      )}

      <div className="mt-6 card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Subscriptions</h3>
            <p className="text-[12.5px] text-ink-500">
              {num(subs.length)} records · {money(statsData?.mrr)} MRR
            </p>
          </div>
        </div>
        <div className="mt-3">
          <DataTable
            loading={!subsData}
            rows={subRows}
            columns={[
              { key: 'hotel_name', label: 'Hotel', render: (r) => <span className="font-medium text-ink-900">{r.hotel_name}</span> },
              { key: 'plan_name', label: 'Plan', render: (r) => r.plan_name || '—' },
              { key: 'billing_cycle', label: 'Cycle', render: (r) => <Badge>{r.billing_cycle}</Badge> },
              { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'starts_at', label: 'Started', render: (r) => fmtDate(r.starts_at) },
              { key: 'ends_at', label: 'Renews', render: (r) => fmtDate(r.ends_at) },
            ]}
            empty={<EmptyState icon={Wallet} title="No subscriptions yet" message="Subscriptions appear when hotels are assigned a plan." />}
          />
          <PaginationBar page={safeSubPage} pageSize={pageSize} total={subs.length} onPage={setPage} />
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit plan · ${editing.name}` : 'Create plan'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="starter" />
          </Field>
          <Field label="Name" required>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Starter" />
          </Field>
          <Field label="Tagline" className="sm:col-span-2">
            <input className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="For boutique properties finding their feet" />
          </Field>
          <Field label="Price / month (₹)">
            <input className="input" type="number" min="0" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} />
          </Field>
          <Field label="Price / year (₹)">
            <input className="input" type="number" min="0" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: e.target.value })} />
          </Field>
          <Field label="Max rooms" hint="0 = unlimited">
            <input className="input" type="number" min="0" value={form.max_rooms} onChange={(e) => setForm({ ...form, max_rooms: e.target.value })} />
          </Field>
          <Field label="Max staff" hint="0 = unlimited">
            <input className="input" type="number" min="0" value={form.max_staff} onChange={(e) => setForm({ ...form, max_staff: e.target.value })} />
          </Field>
          <Field label="Max orders / month" hint="0 = unlimited">
            <input className="input" type="number" min="0" value={form.max_orders_month} onChange={(e) => setForm({ ...form, max_orders_month: e.target.value })} />
          </Field>
          <Field label="Sort order">
            <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </Field>
          <Field label="Features" hint="One per line" className="sm:col-span-2">
            <textarea className="input min-h-[110px]" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder={'Up to 20 rooms\nBookings & front desk\nEmail support'} />
          </Field>
          <Field label="Highlights" hint="One per line" className="sm:col-span-2">
            <textarea className="input min-h-[80px]" value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} placeholder={'Core PMS\nBasic reports'} />
          </Field>
          <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
            <Toggle checked={form.is_popular} onChange={(v) => setForm({ ...form, is_popular: v })} label="Mark as popular" />
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Plan is active" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runDelete}
        danger
        title="Deactivate plan?"
        confirmLabel="Deactivate"
        message={
          confirm
            ? `"${confirm.name}" will be hidden from new signups. Hotels already on it keep their subscription until it changes.`
            : ''
        }
      />
    </div>
  );
}
