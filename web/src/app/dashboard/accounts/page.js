'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  Plus, X, Wallet, TrendingUp, TrendingDown, BookOpen, Receipt, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useFetch, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { money, fmtDate, fmtDateTime, statusLabel, todayISO } from '@/lib/format';
import { StatCard, StatusBadge, EmptyState, Tabs, Field, PageLoader, Badge } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, DateInput, PaginationBar } from '@/components/ui/table';
import { Modal, Drawer } from '@/components/ui/Modal';
import { Donut, Bars } from '@/components/Chart';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 15;
const METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'wallet', 'online', 'other'];

function AddAccountModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [group, setGroup] = useState('Operating Expenses');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!code || !name) return toast.error('Code and name are required');
    setSaving(true);
    try {
      await api.post('/accounts/chart', { code, name, type, group_name: group });
      toast.success('Account created');
      setCode('');
      setName('');
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
      title="New account"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Code" required>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="5010" />
        </Field>
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" required>
          <Select value={type} onChange={setType}>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </Field>
        <Field label="Group">
          <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function JournalModal({ open, onClose, accounts, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([
    { account_id: '', code: '', debit: '', credit: '' },
    { account_id: '', code: '', debit: '', credit: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function setLine(i, key, value) {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l;
        if (key === 'account') {
          const acc = accounts.find((a) => a.id === value);
          return acc ? { ...l, account_id: acc.id, code: acc.code } : { ...l, account_id: '', code: '' };
        }
        return { ...l, [key]: value };
      })
    );
  }

  async function submit() {
    if (!balanced) return toast.error('Total debit must equal total credit');
    setSaving(true);
    try {
      await api.post('/accounts/journal', {
        entry_date: date,
        memo: memo || 'Manual entry',
        lines: lines
          .filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)))
          .map((l) => ({
            account_id: l.account_id,
            code: l.code,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
          })),
      });
      toast.success('Journal entry posted');
      setMemo('');
      setLines([
        { account_id: '', code: '', debit: '', credit: '' },
        { account_id: '', code: '', debit: '', credit: '' },
      ]);
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
      title="New journal entry"
      size="lg"
      footer={
        <>
          <div className="mr-auto text-[13px] text-ink-500">
            Dr {money(totalDebit)} · Cr {money(totalCredit)} ·{' '}
            <span className={clsx('font-semibold', balanced ? 'text-emerald-600' : 'text-rose-600')}>
              {balanced ? 'Balanced' : 'Not balanced'}
            </span>
          </div>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !balanced}>
            {saving ? 'Posting…' : 'Post entry'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Memo">
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Description" />
          </Field>
        </div>

        <div className="rounded-2xl border border-ink-100">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-800">Lines</p>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setLines((l) => [...l, { account_id: '', code: '', debit: '', credit: '' }])}
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="space-y-2 p-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Select value={l.account_id} onChange={(v) => setLine(i, 'account', v)}>
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </Select>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Debit"
                  value={l.debit}
                  onChange={(e) => setLine(i, 'debit', e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Credit"
                  value={l.credit}
                  onChange={(e) => setLine(i, 'credit', e.target.value)}
                />
                <button
                  className="justify-self-end rounded-lg p-2 text-ink-400 hover:text-rose-600"
                  onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceDrawer({ id, onClose, onPaid }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch(id ? `/invoices/${id}` : null, { enabled: !!id });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const invoice = data?.invoice;
  const due = invoice ? Math.max(0, Number(invoice.total) - Number(invoice.paid)) : 0;

  async function pay() {
    if (!invoice?.booking_id) return toast.error('This invoice is not linked to a booking');
    setBusy(true);
    try {
      await api.post(`/bookings/${invoice.booking_id}/payments`, {
        amount: Number(amount || due),
        method,
        reference: null,
        notes: `Payment against ${invoice.invoice_no}`,
      });
      toast.success('Payment recorded');
      setAmount('');
      reload();
      onPaid();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={!!id} onClose={onClose} className="w-[min(480px,100vw)]">
      {loading && <PageLoader label="Loading invoice…" />}
      {!loading && !invoice && <EmptyState title="Invoice not found" />}
      {invoice && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-ink-900">{invoice.invoice_no}</h3>
              <p className="text-[12.5px] text-ink-500">
                {invoice.party_name || '—'} · {fmtDate(invoice.issue_date)}
                {invoice.booking_code ? ` · ${invoice.booking_code}` : ''}
              </p>
            </div>
            <button className="rounded-xl p-1.5 text-ink-400 hover:bg-ink-100" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={invoice.status} />
              <Badge>{statusLabel(invoice.type)}</Badge>
            </div>
            <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-4">
              <div className="space-y-1.5">
                {(data?.items || []).map((it) => (
                  <div key={it.id} className="flex justify-between gap-3 text-[13px] text-ink-700">
                    <span className="min-w-0 truncate">{it.description}</span>
                    <span className="shrink-0 font-medium">{money(Number(it.amount) + Number(it.tax || 0))}</span>
                  </div>
                ))}
                {(data?.items || []).length === 0 && (
                  <p className="py-3 text-center text-[13px] text-ink-400">No line items</p>
                )}
              </div>
              <div className="mt-3 space-y-1 border-t border-dashed border-ink-200 pt-3 text-[13px]">
                <div className="flex justify-between text-ink-500"><span>Sub total</span><span>{money(invoice.sub_total)}</span></div>
                <div className="flex justify-between text-ink-500"><span>Tax</span><span>{money(invoice.tax)}</span></div>
                <div className="flex justify-between text-[15px] font-bold text-ink-900"><span>Total</span><span>{money(invoice.total)}</span></div>
                <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{money(invoice.paid)}</span></div>
                <div className="flex justify-between font-semibold text-rose-600"><span>Due</span><span>{money(due)}</span></div>
              </div>
            </div>

            {(data?.payments || []).length > 0 && (
              <div>
                <p className="label">Payments</p>
                {data.payments.map((p) => (
                  <div key={p.id} className="mb-2 flex justify-between rounded-xl bg-ink-50 px-3 py-2 text-[13px]">
                    <span className="capitalize text-ink-600">{p.method} · {fmtDateTime(p.paid_at)}</span>
                    <span className="font-semibold text-ink-900">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {due > 0 && (
            <div className="flex items-end gap-2 border-t border-ink-100 px-5 py-4">
              <Field label="Amount" className="flex-1">
                <input className="input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(due)} />
              </Field>
              <Field label="Method">
                <Select value={method} onChange={setMethod}>
                  {METHODS.map((m) => <option key={m} value={m}>{statusLabel(m)}</option>)}
                </Select>
              </Field>
              <button className="btn-success" onClick={pay} disabled={busy || !invoice.booking_id}>
                {busy ? 'Saving…' : 'Record'}
              </button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default function AccountsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [invStatus, setInvStatus] = useState('');
  const [invQ, setInvQ] = useState('');
  const [dir, setDir] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);
  const [chartFilter, setChartFilter] = useState('');
  const [journalFrom, setJournalFrom] = useState('');
  const [journalTo, setJournalTo] = useState('');

  const invDebounced = useDebounced(invQ);
  const summary = useFetch('/accounts/summary');
  const chart = useFetch('/accounts/chart');
  const pnl = useFetch('/accounts/reports/pnl');
  const journal = useList(
    '/accounts/journal',
    { limit: PAGE_SIZE, page, from: journalFrom || undefined, to: journalTo || undefined },
    { enabled: tab === 'journal' }
  );
  const invoices = useList(
    '/invoices',
    { limit: PAGE_SIZE, page: invPage, status: invStatus || undefined, q: invDebounced || undefined },
    { enabled: tab === 'invoices' }
  );
  const payments = useList(
    '/accounts/payments',
    { limit: PAGE_SIZE, page: payPage, direction: dir || undefined, method: method || undefined, from: from || undefined, to: to || undefined },
    { enabled: tab === 'payments' }
  );

  const accounts = chart.data?.items || [];
  const cash = accounts.find((a) => a.code === '1000');
  const expenseRows = (pnl.data?.expenseRows || []).filter((r) => r.type === 'expense');
  const incomeRows = (pnl.data?.incomeRows || []).filter((r) => r.type === 'income');
  const donutData = expenseRows.map((r) => ({ name: r.name, value: Math.abs(Number(r.amount)) }));
  const chartRows = chartFilter ? accounts.filter((a) => a.type === chartFilter) : accounts;

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Chart of accounts, journal, invoices and payments"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAccountOpen(true)}>
              <BookOpen size={16} /> New account
            </button>
            <button className="btn-primary" onClick={() => setJournalOpen(true)}>
              <Plus size={16} /> Journal entry
            </button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cash in hand" value={money(cash?.balance)} sub="account 1000" icon={Wallet} tone="brand" />
        <StatCard label="Receivables" value={money(summary.data?.receivable)} sub="unpaid invoices" icon={ArrowDownToLine} tone="emerald" />
        <StatCard label="Payables" value={money(summary.data?.payable)} sub="unreceived POs" icon={ArrowUpFromLine} tone="rose" />
        <StatCard
          label="Net profit"
          value={money(summary.data?.profit)}
          sub={`Income ${money(summary.data?.income)} · Expense ${money(summary.data?.expense)}`}
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'journal', label: 'Journal' },
          { id: 'invoices', label: 'Invoices', count: invoices.total },
          { id: 'payments', label: 'Payments' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'overview' && (
        <div className="space-y-4">
          {summary.loading || pnl.loading ? (
            <PageLoader label="Loading overview…" />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-5">
                  <h3 className="mb-3 text-[15px] font-semibold text-ink-900">Expenses by account</h3>
                  {donutData.length ? (
                    <Donut data={donutData} formatter={(v) => money(v)} height={200} />
                  ) : (
                    <EmptyState icon={TrendingDown} title="No expenses in range" message="Expenses posted to the ledger appear here." />
                  )}
                </div>
                <div className="card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-ink-900">Monthly ledger volume</h3>
                    <span className="text-[12px] text-ink-400">
                      {fmtDate(summary.data?.from)} → {fmtDate(summary.data?.to)}
                    </span>
                  </div>
                  {summary.data?.monthly?.length ? (
                    <Bars
                      data={summary.data.monthly.map((m) => ({ ...m, label: m.month }))}
                      xKey="label"
                      series={[{ key: 'total', label: 'Journal debits', color: '#3b66f6' }]}
                      money
                      height={230}
                    />
                  ) : (
                    <EmptyState icon={TrendingUp} title="No ledger activity" />
                  )}
                </div>
              </div>

              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-4">
                  <h3 className="text-[15px] font-semibold text-ink-900">Chart of accounts</h3>
                  <div className="flex items-center gap-2">
                    <Select value={chartFilter} onChange={setChartFilter} className="w-40">
                      <option value="">All types</option>
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </Select>
                    <button className="btn-secondary btn-sm" onClick={() => setAccountOpen(true)}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
                <DataTable
                  loading={chart.loading}
                  rows={chartRows}
                  keyField="code"
                  empty={<EmptyState icon={BookOpen} title="No accounts" />}
                  columns={[
                    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-[13px] text-ink-500">{r.code}</span> },
                    { key: 'name', label: 'Account', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
                    { key: 'group_name', label: 'Group', render: (r) => r.group_name },
                    { key: 'type', label: 'Type', render: (r) => <Badge>{statusLabel(r.type)}</Badge> },
                    { key: 'total_debit', label: 'Debit', render: (r) => money(r.total_debit) },
                    { key: 'total_credit', label: 'Credit', render: (r) => money(r.total_credit) },
                    {
                      key: 'balance',
                      label: 'Balance',
                      render: (r) => <span className="font-semibold text-ink-900">{money(r.balance)}</span>,
                    },
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  { title: 'Income accounts', rows: incomeRows, tone: 'text-emerald-600' },
                  { title: 'Expense accounts', rows: expenseRows, tone: 'text-rose-600' },
                ].map((block) => (
                  <div key={block.title} className="card p-5">
                    <h3 className="mb-3 text-[15px] font-semibold text-ink-900">{block.title}</h3>
                    {block.rows.length === 0 ? (
                      <p className="py-6 text-center text-[13px] text-ink-400">Nothing posted in this range</p>
                    ) : (
                      <ul className="divide-y divide-ink-100">
                        {block.rows.map((r) => (
                          <li key={r.code} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                            <span className="min-w-0 truncate text-ink-700">
                              <span className="mr-2 font-mono text-ink-400">{r.code}</span>
                              {r.name}
                            </span>
                            <span className={clsx('shrink-0 font-semibold', block.tone)}>{money(Math.abs(Number(r.amount)))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'journal' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <DateInput value={journalFrom} onChange={(v) => { setJournalFrom(v); setPage(1); }} className="w-full sm:w-44" />
            <DateInput value={journalTo} onChange={(v) => { setJournalTo(v); setPage(1); }} className="w-full sm:w-44" />
            <button className="btn-primary ml-auto" onClick={() => setJournalOpen(true)}>
              <Plus size={16} /> New entry
            </button>
          </div>

          {journal.error ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
              <AlertTriangle size={24} className="text-rose-500" />
              <div>
                <p className="text-[15px] font-semibold text-ink-900">Journal list unavailable</p>
                <p className="mt-1 max-w-md text-[13px] text-ink-500">{journal.error.message}</p>
              </div>
              <button className="btn-secondary btn-sm" onClick={journal.reload}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : (
            <>
              <DataTable
                loading={journal.loading}
                rows={journal.items}
                onRowClick={(r) => setExpanded(expanded === r.id ? null : r.id)}
                empty={<EmptyState icon={BookOpen} title="No journal entries" message="Post a manual entry to see it here." />}
                columns={[
                  {
                    key: 'entry_no',
                    label: 'Entry',
                    render: (r) => (
                      <div>
                        <p className="font-semibold text-ink-900">{r.entry_no}</p>
                        <p className="text-[12px] text-ink-400">{r.ref_type || 'manual'}</p>
                      </div>
                    ),
                  },
                  { key: 'entry_date', label: 'Date', render: (r) => fmtDate(r.entry_date) },
                  {
                    key: 'memo',
                    label: 'Memo',
                    render: (r) => (
                      <div className="min-w-[220px]">
                        <span className="block truncate">{r.memo || '—'}</span>
                        {expanded === r.id && (
                          <div className="mt-2 space-y-1 rounded-xl bg-ink-50 p-2.5">
                            {(r.lines || []).map((l, i) => (
                              <div key={i} className="flex items-center justify-between gap-3 text-[12.5px] text-ink-600">
                                <span className="min-w-0 truncate">
                                  <span className="mr-1 font-mono text-ink-400">{l.code}</span>
                                  {l.account}
                                </span>
                                <span className="shrink-0 font-semibold">
                                  {Number(l.debit) > 0 ? `Dr ${money(l.debit)}` : `Cr ${money(l.credit)}`}
                                </span>
                              </div>
                            ))}
                            {(r.lines || []).length === 0 && (
                              <p className="text-[12px] text-ink-400">No lines returned</p>
                            )}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  { key: 'total_debit', label: 'Debit', render: (r) => <span className="font-semibold text-ink-900">{money(r.total_debit)}</span> },
                  { key: 'total_credit', label: 'Credit', render: (r) => <span className="font-semibold text-ink-900">{money(r.total_credit)}</span> },
                  { key: 'created_by_name', label: 'By', render: (r) => r.created_by_name || '—' },
                ]}
              />
              {journal.total > PAGE_SIZE && (
                <div className="mt-1"><PaginationBar page={page} pageSize={PAGE_SIZE} total={journal.total} onPage={setPage} /></div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SearchInput value={invQ} onChange={(v) => { setInvQ(v); setInvPage(1); }} placeholder="Invoice no or guest…" className="w-full sm:w-64" />
            <Select value={invStatus} onChange={(v) => { setInvStatus(v); setInvPage(1); }} className="w-full sm:w-40">
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <DataTable
            loading={invoices.loading}
            rows={invoices.items}
            onRowClick={(r) => setInvoiceId(r.id)}
            empty={<EmptyState icon={Receipt} title="No invoices" />}
            columns={[
              { key: 'invoice_no', label: 'Invoice', render: (r) => <span className="font-semibold text-ink-900">{r.invoice_no}</span> },
              { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
              {
                key: 'party_name',
                label: 'Guest',
                render: (r) => (
                  <div>
                    <p className="font-medium text-ink-900">{r.party_name || '—'}</p>
                    <p className="text-[12px] text-ink-400">{r.booking_code || '—'}</p>
                  </div>
                ),
              },
              { key: 'total', label: 'Total', render: (r) => <span className="font-semibold text-ink-900">{money(r.total)}</span> },
              { key: 'paid', label: 'Paid', render: (r) => money(r.paid) },
              {
                key: 'due',
                label: 'Due',
                render: (r) => (
                  <span className={Number(r.total) - Number(r.paid) > 0 ? 'font-semibold text-rose-600' : 'text-ink-500'}>
                    {money(Math.max(0, Number(r.total) - Number(r.paid)))}
                  </span>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
          {invoices.total > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={invPage} pageSize={PAGE_SIZE} total={invoices.total} onPage={setInvPage} /></div>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <Select value={dir} onChange={(v) => { setDir(v); setPayPage(1); }} className="w-full sm:w-36">
              <option value="">All flows</option>
              <option value="in">Money in</option>
              <option value="out">Money out</option>
            </Select>
            <Select value={method} onChange={(v) => { setMethod(v); setPayPage(1); }} className="w-full sm:w-40">
              <option value="">All methods</option>
              {METHODS.map((m) => <option key={m} value={m}>{statusLabel(m)}</option>)}
            </Select>
            <DateInput value={from} onChange={(v) => { setFrom(v); setPayPage(1); }} className="w-full sm:w-40" />
            <DateInput value={to} onChange={(v) => { setTo(v); setPayPage(1); }} className="w-full sm:w-40" />
          </div>
          <DataTable
            loading={payments.loading}
            rows={payments.items}
            empty={<EmptyState icon={Wallet} title="No payments found" message="Adjust the filters to see more." />}
            columns={[
              { key: 'paid_at', label: 'Date', render: (r) => fmtDateTime(r.paid_at) },
              {
                key: 'direction',
                label: 'Flow',
                render: (r) => (
                  <span className={clsx('chip', r.direction === 'out' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                    {r.direction === 'out' ? <ArrowUpFromLine size={11} /> : <ArrowDownToLine size={11} />}
                    {r.direction === 'out' ? 'Out' : 'In'}
                  </span>
                ),
              },
              { key: 'method', label: 'Method', render: (r) => <span className="capitalize">{statusLabel(r.method || '')}</span> },
              { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold text-ink-900">{money(r.amount)}</span> },
              { key: 'category', label: 'Category', render: (r) => statusLabel(r.category || '—') },
              {
                key: 'reference',
                label: 'Reference',
                render: (r) => r.invoice_no || r.booking_code || r.reference || r.notes || '—',
              },
              { key: 'received_by_name', label: 'Received by', render: (r) => r.received_by_name || '—' },
            ]}
          />
          {payments.total > PAGE_SIZE && (
            <div className="mt-1"><PaginationBar page={payPage} pageSize={PAGE_SIZE} total={payments.total} onPage={setPayPage} /></div>
          )}
        </div>
      )}

      <AddAccountModal open={accountOpen} onClose={() => setAccountOpen(false)} onDone={chart.reload} />
      <JournalModal open={journalOpen} onClose={() => setJournalOpen(false)} accounts={accounts} onDone={journal.reload} />
      <InvoiceDrawer
        id={invoiceId}
        onClose={() => setInvoiceId(null)}
        onPaid={() => { invoices.reload(); summary.reload(); payments.reload(); }}
      />
    </div>
  );
}
