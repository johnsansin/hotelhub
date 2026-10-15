'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, CalendarDays, Users, BedDouble, Phone, FileText, ArrowRight, Info, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { money, fmtDate, fmtDateTime } from '@/lib/format';
import { PageLoader, EmptyState, StatusBadge, Spinner } from '@/components/ui/kit';

function Lookup({ initialCode }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode || '');
  const [query, setQuery] = useState(initialCode || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const value = String(query || '').trim();
    if (!value) {
      setResult(null);
      setError(null);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get(`/public/bookings/${encodeURIComponent(value.toUpperCase())}`)
      .then((d) => alive && setResult(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  function submit(e) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setQuery(value);
    router.replace(`/manage?code=${encodeURIComponent(value.toUpperCase())}`);
  }

  const b = result?.booking;
  const invoices = result?.invoices || [];
  const payments = result?.payments || [];
  const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <>
      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Manage booking</p>
          <h1 className="font-display mt-3 text-[34px] font-bold leading-tight text-ink-900">Your stay, in your hands</h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-ink-500">
            Enter the booking code from your confirmation email to view dates, amounts, invoices and payments.
          </p>

          <form onSubmit={submit} className="mx-auto mt-7 flex max-w-lg gap-2">
            <input
              className="input uppercase !py-3 text-center text-[15px] font-semibold tracking-wider"
              placeholder="BK-00123"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Booking code"
            />
            <button type="submit" className="btn-primary shrink-0 px-5" disabled={loading || !code.trim()}>
              {loading ? <Spinner size={16} /> : <Search size={16} />} Find
            </button>
          </form>
          <p className="mt-3 text-[12.5px] text-ink-400">
            Codes look like <b className="text-ink-600">BK-00123</b> — letters are matched regardless of case.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-10">
        {loading ? (
          <div className="space-y-4">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-56 w-full" />
          </div>
        ) : error ? (
          <div className="card">
            <EmptyState
              icon={Search}
              title={error.status === 404 ? 'No booking found' : 'We couldn’t check that code'}
              message={
                error.status === 404
                  ? `We couldn’t find a reservation matching “${query}”. Double-check the code from your confirmation email, or contact the property directly.`
                  : error.message
              }
              action={
                <Link href="/hotels" className="btn-secondary">
                  Book a new stay <ArrowRight size={15} />
                </Link>
              }
            />
          </div>
        ) : !b ? (
          <div className="card">
            <EmptyState
              icon={CalendarDays}
              title="Look up a reservation"
              message="Enter your booking code above — or open the link in your confirmation email to see everything about your stay here."
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 bg-ink-50 px-6 py-5">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Booking code</p>
                  <p className="font-display mt-1 text-[30px] font-bold leading-none text-ink-900">{b.code}</p>
                  <p className="mt-2 text-[13.5px] text-ink-500">
                    Booked {fmtDateTime(b.created_at)} · source {String(b.source || 'direct').replace('_', ' ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={b.status} />
                  {b.hotel_slug && (
                    <Link href={`/hotels/${b.hotel_slug}`} className="btn-ghost btn-sm">
                      View property <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid gap-5 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                    <BedDouble size={13} /> Property
                  </p>
                  <p className="mt-1.5 text-[14.5px] font-bold text-ink-900">{b.hotel_name}</p>
                  <p className="text-[13px] text-ink-500">{b.room_type_name || 'Room to be assigned'}</p>
                  {b.room_number && <p className="text-[13px] text-ink-500">Room {b.room_number}</p>}
                </div>
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                    <CalendarDays size={13} /> Dates
                  </p>
                  <p className="mt-1.5 text-[14.5px] font-bold text-ink-900">
                    {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
                  </p>
                  <p className="text-[13px] text-ink-500">
                    {b.nights} night{Number(b.nights) === 1 ? '' : 's'}
                  </p>
                </div>
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                    <Users size={13} /> Guests
                  </p>
                  <p className="mt-1.5 text-[14.5px] font-bold text-ink-900">{b.guest_name}</p>
                  <p className="text-[13px] text-ink-500">
                    {b.adults} adult{Number(b.adults) === 1 ? '' : 's'}
                    {Number(b.children) > 0 ? ` · ${b.children} children` : ''}
                  </p>
                </div>
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                    <Phone size={13} /> Contact
                  </p>
                  <p className="mt-1.5 break-words text-[13.5px] text-ink-700">{b.guest_email || '—'}</p>
                  <p className="break-words text-[13.5px] text-ink-700">{b.guest_phone || '—'}</p>
                </div>
              </div>

              <div className="grid gap-5 border-t border-ink-100 px-6 py-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-ink-50 p-5">
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-400">Amount</p>
                  <div className="mt-3 space-y-1.5 text-[13.5px]">
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-500">Room subtotal</span>
                      <span className="font-semibold text-ink-800">{money(b.subtotal)}</span>
                    </div>
                    {Number(b.discount) > 0 && (
                      <div className="flex justify-between gap-3 text-emerald-600">
                        <span>Discount {b.coupon_code ? `(${b.coupon_code})` : ''}</span>
                        <span className="font-semibold">− {money(b.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-500">Taxes</span>
                      <span className="font-semibold text-ink-800">{money(b.tax)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-200 pt-2">
                      <span className="font-bold text-ink-900">Total</span>
                      <span className="text-[19px] font-extrabold text-brand-600">{money(b.total_amount)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-500">Recorded as paid</span>
                      <span className="font-semibold text-ink-800">{money(b.paid_amount || paidTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-ink-100 p-5">
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                    <CreditCard size={13} /> Payments
                  </p>
                  {payments.length === 0 ? (
                    <p className="mt-3 text-[13.5px] text-ink-500">No payments recorded yet — settle at the property.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {payments.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 text-[13.5px]">
                          <span className="text-ink-600">
                            {String(p.method || 'payment').replace('_', ' ')} · {fmtDate(p.paid_at)}
                          </span>
                          <span className="font-semibold text-ink-900">{money(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="card p-6">
              <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <FileText size={14} /> Invoices
              </p>
              {invoices.length === 0 ? (
                <p className="mt-3 text-[13.5px] text-ink-500">
                  Your pro-forma invoice will be generated when the stay begins.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="rounded-2xl border border-ink-100 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[14.5px] font-bold text-ink-900">{inv.invoice_no}</p>
                          <p className="text-[12.5px] text-ink-500">
                            Issued {fmtDate(inv.issue_date)} · {inv.items?.length || 0} line item
                            {Number(inv.items?.length) === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={inv.status} />
                          <div className="text-right">
                            <p className="text-[15px] font-bold text-ink-900">{money(inv.total)}</p>
                            <p className="text-[12px] text-ink-500">paid {money(inv.paid)}</p>
                          </div>
                        </div>
                      </div>
                      {Array.isArray(inv.items) && inv.items.length > 0 && (
                        <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[13px]">
                          {inv.items.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="text-ink-600">
                                {it.description} {it.qty > 1 ? `× ${it.qty}` : ''}
                              </span>
                              <span className="font-semibold text-ink-800">{money(it.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-5">
              <Info size={17} className="mt-0.5 shrink-0 text-brand-600" />
              <div className="text-[13.5px] leading-relaxed text-ink-700">
                <p className="font-bold text-ink-900">Need to change or cancel?</p>
                <p className="mt-1">
                  Call the property’s front desk or reply to your confirmation email — date changes and cancellations are
                  handled directly by the hotel according to its policy. Keep code <b>{b.code}</b> handy.
                </p>
              </div>
            </div>
          </div>
        )}

        {query && !loading && b && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => {
                setCode('');
                setQuery('');
                setResult(null);
                setError(null);
                router.replace('/manage');
              }}
              className="btn-ghost btn-sm"
            >
              Look up another booking
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<PageLoader label="Loading booking…" />}>
      <LookupCode />
    </Suspense>
  );
}

function LookupCode() {
  const sp = useSearchParams();
  return <Lookup initialCode={sp.get('code') || ''} />;
}
