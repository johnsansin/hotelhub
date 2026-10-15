'use client';

import { useState } from 'react';
import { LifeBuoy, MessageSquare, Send, X, Clock, Building2, Inbox } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { StatCard, StatusBadge, Badge, EmptyState, PageLoader, Field, Tabs } from '@/components/ui/kit';
import { DataTable, SearchInput, Select } from '@/components/ui/table';
import { Drawer } from '@/components/ui/Modal';
import { useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { num, fmtDateTime, relative, statusLabel } from '@/lib/format';

const PRIORITY_TONE = {
  low: 'bg-ink-100 text-ink-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-rose-100 text-rose-700',
};

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function SuperadminSupportPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/superadmin/tickets');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 350);

  const [selectedId, setSelectedId] = useState(null);
  const { data: detail, reload: reloadDetail } = useFetch(
    selectedId ? `/superadmin/tickets/${selectedId}` : '',
    { enabled: Boolean(selectedId) }
  );
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const tickets = data?.items || [];
  const counts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const resolvedWeek = tickets.filter(
    (t) => t.status === 'resolved' && Date.now() - new Date(t.updated_at).getTime() < weekMs
  ).length;
  const openCount = counts.open || 0;
  const progressCount = counts.in_progress || 0;

  const search = debounced.trim().toLowerCase();
  const visible = tickets.filter((t) => {
    const matchesTab = tab === 'all' || t.status === tab;
    const haystack = `${t.subject} ${t.hotel_name || ''} ${t.created_by_name || ''} ${t.category || ''}`.toLowerCase();
    return matchesTab && (!search || haystack.includes(search));
  });

  const refreshAll = () => {
    reload();
    if (selectedId) reloadDetail();
  };

  const sendReply = async () => {
    const message = reply.trim();
    if (!message || !selectedId) return;
    setSending(true);
    try {
      await api.post(`/superadmin/tickets/${selectedId}/reply`, { message });
      setReply('');
      toast.success('Reply sent');
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const patchTicket = async (body, message) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.put(`/superadmin/tickets/${selectedId}`, body);
      toast.success(message);
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const detailReady = Boolean(detail?.ticket && detail.ticket.id === selectedId);
  const ticket = detailReady ? detail.ticket : null;
  const messages = detailReady ? detail.messages || [] : [];

  return (
    <div>
      <PageHeader
        title="Support inbox"
        subtitle="Tickets raised by hotel teams across the platform"
        actions={
          <button className="btn-secondary" onClick={refreshAll}>
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={num(openCount)} sub="Awaiting first response" icon={LifeBuoy} tone="brand" />
        <StatCard label="In progress" value={num(progressCount)} sub="Being handled now" icon={Clock} tone="amber" />
        <StatCard label="Resolved (7d)" value={num(resolvedWeek)} sub="Closed in the last week" icon={Send} tone="emerald" />
        <StatCard label="All tickets" value={num(tickets.length)} sub="Lifetime total" icon={MessageSquare} tone="ink" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Tabs
          className="flex-1"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All', count: tickets.length },
            { id: 'open', label: 'Open', count: counts.open || 0 },
            { id: 'in_progress', label: 'In progress', count: counts.in_progress || 0 },
            { id: 'resolved', label: 'Resolved', count: counts.resolved || 0 },
            { id: 'closed', label: 'Closed', count: counts.closed || 0 },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search tickets…" className="w-full sm:w-64" />
      </div>

      <div className="mt-4 card">
        <DataTable
          loading={loading}
          rows={visible}
          onRowClick={(t) => setSelectedId(t.id)}
          columns={[
            {
              key: 'subject',
              label: 'Subject',
              render: (t) => (
                <div className="min-w-[220px]">
                  <p className="font-semibold text-ink-900">{t.subject}</p>
                  <p className="text-[12px] text-ink-400">{statusLabel(t.category || 'general')}</p>
                </div>
              ),
            },
            { key: 'hotel_name', label: 'Hotel', render: (t) => t.hotel_name || 'Platform' },
            { key: 'created_by_name', label: 'Requester', render: (t) => t.created_by_name || '—' },
            {
              key: 'priority',
              label: 'Priority',
              render: (t) => <Badge tone={PRIORITY_TONE[t.priority] || 'bg-ink-100 text-ink-600'}>{statusLabel(t.priority)}</Badge>,
            },
            { key: 'status', label: 'Status', render: (t) => <StatusBadge status={t.status} /> },
            { key: 'messages', label: 'Messages', render: (t) => num(t.messages) },
            { key: 'updated_at', label: 'Updated', render: (t) => <span title={fmtDateTime(t.updated_at)}>{relative(t.updated_at)}</span> },
          ]}
          empty={
            error ? (
              <EmptyState
                icon={Inbox}
                title="Could not load tickets"
                message={error.message}
                action={
                  <button className="btn-secondary" onClick={reload}>
                    Try again
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={search || tab !== 'all' ? 'No tickets match this view' : 'Inbox is clear'}
                message={search || tab !== 'all' ? 'Try another tab or clear the search.' : 'New support requests from hotels will appear here.'}
              />
            )
          }
        />
      </div>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-ink-900">{ticket?.subject || 'Ticket'}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-400">
                <Building2 size={13} /> {ticket?.hotel_name || 'Platform'}
                <span>·</span> {ticket ? fmtDateTime(ticket.created_at) : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={ticket?.status} />
                <Badge tone={PRIORITY_TONE[ticket?.priority] || 'bg-ink-100 text-ink-600'}>{statusLabel(ticket?.priority || '')}</Badge>
                <Badge>{statusLabel(ticket?.category || '')}</Badge>
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setSelectedId(null)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-b border-ink-100 px-5 py-3">
            <Field label="Status">
              <Select
                value={ticket?.status || 'open'}
                disabled={saving || !ticket}
                onChange={(v) => patchTicket({ status: v }, 'Status updated')}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={ticket?.priority || 'medium'}
                disabled={saving || !ticket}
                onChange={(v) => patchTicket({ priority: v }, 'Priority updated')}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {statusLabel(p)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {!detailReady && <PageLoader label="Loading conversation…" />}
            {detailReady && !messages.length && (
              <EmptyState icon={MessageSquare} title="No messages yet" message="The conversation will appear here." />
            )}
            {detailReady &&
              messages.map((m) => {
                const mine = m.author_role === 'superadmin';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-800'}`}>
                      <p className={`text-[11.5px] font-semibold ${mine ? 'text-white/70' : 'text-ink-500'}`}>
                        {m.author_name || (mine ? 'You' : 'Guest')} · {relative(m.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.message}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="border-t border-ink-100 px-5 py-3">
            <textarea
              className="input min-h-[76px]"
              placeholder="Write a reply to the hotel…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply();
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-ink-400">⌘/Ctrl + Enter to send</span>
              <button className="btn-primary btn-sm" onClick={sendReply} disabled={sending || !reply.trim()}>
                <Send size={14} /> {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
