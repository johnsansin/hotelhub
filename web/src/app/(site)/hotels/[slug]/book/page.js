'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Tag,
  CalendarDays,
  Users,
  BadgeCheck,
  AlertCircle,
} from 'lucide-react';
import { api, qs } from '@/lib/api';
import { money, fmtDate, nights as countNights } from '@/lib/format';
import { PageLoader, Spinner } from '@/components/ui/kit';

const STEP_LABELS = ['Stay & guest', 'Review price', 'Confirm'];

function Progress({ step }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold transition ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400'
                }`}
              >
                {done ? <Check size={15} /> : n}
              </span>
              <span
                className={`hidden truncate text-[13px] font-semibold sm:block ${
                  active ? 'text-ink-900' : done ? 'text-ink-500' : 'text-ink-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && <span className={`h-0.5 flex-1 rounded ${n < step ? 'bg-emerald-400' : 'bg-ink-100'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-[12px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

function PriceBreakdown({ quote, nights, couponMsg, couponInput, setCouponInput, onApplyCoupon, quoteLoading }) {
  const nightly = quote?.nightly || [];
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-5 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Price breakdown</p>
        </div>
        <div className="space-y-2.5 px-5 py-4 text-[14px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-600">
              Room · {money(quote?.rate)} × {nights} night{nights === 1 ? '' : 's'}
            </span>
            <span className="font-semibold text-ink-900">{money(quote?.subtotal)}</span>
          </div>
          {Number(quote?.discount) > 0 && (
            <div className="flex items-center justify-between gap-3 text-emerald-600">
              <span className="inline-flex items-center gap-1.5">
                <Tag size={14} /> Discount {quote?.coupon ? `(${quote.coupon})` : ''}
              </span>
              <span className="font-semibold">− {money(quote?.discount)}</span>
            </div>
          )}
          {Number(quote?.service) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-600">Service charge</span>
              <span className="font-semibold text-ink-900">{money(quote?.service)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-600">GST ({quote?.taxRate || 0}%)</span>
            <span className="font-semibold text-ink-900">{money(quote?.tax)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
            <span className="text-[15px] font-bold text-ink-900">Total payable</span>
            <span className="text-[22px] font-extrabold text-brand-600">{money(quote?.total)}</span>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Nightly rates</p>
        <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {nightly.map((n) => (
            <div key={n.date} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[13px]">
              <span className="text-ink-600">{fmtDate(n.date)}</span>
              <span className="font-semibold text-ink-900">{money(n.price)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-ink-100 pt-4">
          <label className="label">Coupon code</label>
          <div className="flex gap-2">
            <input
              className="input uppercase"
              placeholder="e.g. WELCOME10"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
            />
            <button type="button" className="btn-secondary shrink-0" onClick={onApplyCoupon} disabled={quoteLoading}>
              {quoteLoading ? <Spinner size={15} /> : 'Apply'}
            </button>
          </div>
          {couponMsg && (
            <p className={`mt-2 text-[12.5px] font-medium ${couponMsg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {couponMsg.text}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold-600" />
        <div>
          <p className="text-[13.5px] font-bold text-ink-900">Best price guarantee</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">
            Book here and you pay the property’s lowest public rate — no OTA markup, no booking fees, free
            cancellation as per hotel policy.
          </p>
        </div>
      </div>
    </div>
  );
}

function Wizard({ slug }) {
  const sp = useSearchParams();
  const roomTypeId = sp.get('roomTypeId');
  const [stay, setStay] = useState(() => ({
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    adults: Number(sp.get('adults') || 2),
    children: Number(sp.get('children') || 0),
  }));
  const [guest, setGuest] = useState({ name: '', email: '', phone: '', notes: '' });
  const [step, setStep] = useState(1);
  const [errs, setErrs] = useState({});
  const [apiError, setApiError] = useState(null);
  const [quoteData, setQuoteData] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMsg, setCouponMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [hotelName, setHotelName] = useState(null);

  const quote = quoteData?.quote || null;
  const nights = countNights(stay.from, stay.to) || 1;

  async function loadQuote(coupon) {
    setQuoteLoading(true);
    setApiError(null);
    try {
      const d = await api.post(`/public/hotels/${slug}/quote`, {
        roomTypeId,
        from: stay.from,
        to: stay.to,
        adults: Number(stay.adults),
        children: Number(stay.children),
        ...(coupon ? { coupon } : {}),
      });
      setQuoteData(d);
      const applied = d.quote?.coupon;
      if (coupon) {
        if (applied && String(applied).toUpperCase() === String(coupon).toUpperCase()) {
          setAppliedCoupon(applied);
          setCouponMsg({ type: 'ok', text: `Coupon ${applied} applied — you saved ${money(d.quote.discount)}.` });
        } else {
          setAppliedCoupon(null);
          setCouponMsg({ type: 'error', text: 'That coupon could not be applied to this stay.' });
        }
      } else {
        setCouponMsg(null);
      }
      return d;
    } catch (e) {
      setApiError(e.message);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }

  function validateStay() {
    const e = {};
    if (!stay.from || !stay.to) e.dates = 'Check-in and check-out dates are required';
    else if (stay.to <= stay.from) e.to = 'Check-out must be after check-in';
    if (Number(stay.adults) < 1) e.adults = 'At least one adult is required';
    if (!guest.name.trim()) e.name = 'Guest name is required';
    if (!guest.email.trim() && !guest.phone.trim()) e.contact = 'Add an email or phone so we can send your confirmation';
    if (guest.email.trim() && !/^\S+@\S+\.\S+$/.test(guest.email.trim())) e.email = 'Enter a valid email address';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function goToQuote() {
    setApiError(null);
    if (!validateStay()) return;
    setStep(2);
    await loadQuote(appliedCoupon);
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) {
      setAppliedCoupon(null);
      setCouponMsg(null);
      await loadQuote(null);
      return;
    }
    await loadQuote(code);
  }

  async function confirmBooking() {
    setSubmitting(true);
    setApiError(null);
    try {
      const d = await api.post(`/public/hotels/${slug}/bookings`, {
        roomTypeId,
        from: stay.from,
        to: stay.to,
        adults: Number(stay.adults),
        children: Number(stay.children),
        guest: {
          name: guest.name.trim(),
          email: guest.email.trim(),
          phone: guest.phone.trim(),
          notes: guest.notes.trim(),
        },
        ...(appliedCoupon ? { coupon: appliedCoupon } : {}),
      });
      setBooking(d.booking);
      api
        .get(`/public/hotels/${slug}`)
        .then((h) => setHotelName(h?.hotel?.name || null))
        .catch(() => setHotelName(null));
    } catch (e) {
      setApiError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (booking) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14">
        <div className="card overflow-hidden text-center">
          <div className="gradient-brand px-6 py-10 text-white">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/15">
              <BadgeCheck size={26} />
            </div>
            <p className="mt-4 text-[13px] font-semibold uppercase tracking-[.18em] text-white/70">Booking confirmed</p>
            <p className="font-display mt-3 text-[44px] font-bold leading-none">{booking.code}</p>
            <p className="mt-3 text-[14px] text-white/80">
              Reserved for {guest.email || guest.phone} · Status: {String(booking.status || '').replace('_', ' ')}
            </p>
          </div>

          <div className="grid gap-4 px-6 py-7 text-left sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Property</p>
              <Link href={`/hotels/${slug}`} className="mt-1 block text-[15px] font-bold text-ink-900 hover:text-brand-600">
                {hotelName || 'View property'}
              </Link>
              {quote?.room_type?.name && <p className="text-[13px] text-ink-500">{quote.room_type.name}</p>}
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Guest</p>
              <p className="mt-1 text-[15px] font-bold text-ink-900">{booking.guest_name}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Stay</p>
              <p className="mt-1 text-[15px] font-bold text-ink-900">
                {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)}
              </p>
              <p className="text-[13px] text-ink-500">
                {booking.nights} night{booking.nights === 1 ? '' : 's'} · {booking.adults} adult
                {booking.adults === 1 ? '' : 's'}
                {Number(booking.children) > 0 ? ` · ${booking.children} children` : ''}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Total</p>
              <p className="mt-1 text-[22px] font-extrabold text-brand-600">{money(booking.total_amount)}</p>
              {Number(booking.discount) > 0 && (
                <p className="text-[12.5px] text-emerald-600">You saved {money(booking.discount)}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-ink-100 px-6 py-5 sm:flex-row sm:justify-center">
            <Link href={`/manage?code=${encodeURIComponent(booking.code)}`} className="btn-primary">
              Manage booking <ArrowRight size={16} />
            </Link>
            <Link href="/hotels" className="btn-secondary">
              Browse more stays
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!roomTypeId || !stay.from || !stay.to) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <div className="card p-8">
          <CalendarDays size={26} className="mx-auto text-ink-300" />
          <h1 className="font-display mt-4 text-[24px] font-bold text-ink-900">Pick a room first</h1>
          <p className="mt-2 text-[14.5px] text-ink-500">
            This booking link is missing a room or your dates. Choose a room type and we’ll carry your dates across.
          </p>
          <Link href={`/hotels/${slug}`} className="btn-primary mt-6">
            <ArrowLeft size={16} /> Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Direct booking</p>
          <h1 className="font-display mt-1.5 text-[28px] font-bold text-ink-900">Complete your reservation</h1>
        </div>
        <Link href={`/hotels/${slug}${qs({ from: stay.from, to: stay.to, adults: stay.adults, children: stay.children })}`} className="btn-ghost btn-sm">
          <ArrowLeft size={15} /> Back to property
        </Link>
      </div>

      <div className="mt-6 card p-5">
        <Progress step={step} />
      </div>

      {apiError && (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {step === 1 && (
          <>
            <div className="card p-6">
              <h2 className="text-[16px] font-bold text-ink-900">Your stay</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Check-in" error={errs.dates}>
                  <input
                    type="date"
                    className="input"
                    value={stay.from}
                    onChange={(e) => setStay((s) => ({ ...s, from: e.target.value }))}
                  />
                </Field>
                <Field label="Check-out" error={errs.to || errs.dates}>
                  <input
                    type="date"
                    className="input"
                    value={stay.to}
                    min={stay.from}
                    onChange={(e) => setStay((s) => ({ ...s, to: e.target.value }))}
                  />
                </Field>
                <Field label="Adults" error={errs.adults}>
                  <select
                    className="input"
                    value={stay.adults}
                    onChange={(e) => setStay((s) => ({ ...s, adults: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Children">
                  <select
                    className="input"
                    value={stay.children}
                    onChange={(e) => setStay((s) => ({ ...s, children: Number(e.target.value) }))}
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="mt-3 text-[13px] text-ink-500">
                {nights} night{nights === 1 ? '' : 's'} · {fmtDate(stay.from)} → {fmtDate(stay.to)}
              </p>

              <h2 className="mt-6 border-t border-ink-100 pt-5 text-[16px] font-bold text-ink-900">Guest details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={errs.name}>
                  <input
                    className="input"
                    placeholder="Aarav Sharma"
                    value={guest.name}
                    onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
                  />
                </Field>
                <Field label="Email" error={errs.email || errs.contact}>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    value={guest.email}
                    onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
                  />
                </Field>
                <Field label="Phone" error={errs.contact && !guest.email.trim() ? errs.contact : undefined}>
                  <input
                    className="input"
                    placeholder="+91 98765 43210"
                    value={guest.phone}
                    onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))}
                  />
                </Field>
                <Field label="Special requests" hint="Early check-in, extra bed, celebrations…">
                  <input
                    className="input"
                    placeholder="Optional"
                    value={guest.notes}
                    onChange={(e) => setGuest((g) => ({ ...g, notes: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="mt-6 flex justify-end">
                <button className="btn-primary" onClick={goToQuote}>
                  Review price <ArrowRight size={16} />
                </button>
              </div>
            </div>

            <div className="card h-fit overflow-hidden">
              <img src="/images/site/reception.jpg" alt="Check-in" className="h-40 w-full object-cover" />
              <div className="p-5">
                <p className="text-[13.5px] font-bold text-ink-900">Why book direct?</p>
                <ul className="mt-2.5 space-y-2 text-[13px] text-ink-600">
                  <li className="flex gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> Best price guarantee
                  </li>
                  <li className="flex gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> Instant confirmation, no fees
                  </li>
                  <li className="flex gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> Free date changes per hotel policy
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}

        {(step === 2 || step === 3) && (
          <>
            <div className="space-y-4">
              <div className="card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[16px] font-bold text-ink-900">{quote?.room_type?.name || 'Your room'}</h2>
                    <p className="mt-1 text-[13.5px] text-ink-500">
                      {fmtDate(stay.from)} → {fmtDate(stay.to)} · {nights} night{nights === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
                      <Users size={14} /> {stay.adults} adult{stay.adults === 1 ? '' : 's'}
                      {stay.children > 0 ? ` · ${stay.children} children` : ''}
                    </p>
                  </div>
                  {step === 2 && (
                    <button className="btn-ghost btn-sm" onClick={() => setStep(1)}>
                      <ArrowLeft size={14} /> Edit
                    </button>
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-ink-50 p-4 text-[13.5px]">
                  <p className="font-semibold text-ink-800">{guest.name}</p>
                  <p className="mt-0.5 text-ink-500">
                    {[guest.email, guest.phone].filter(Boolean).join(' · ') || 'Contact missing'}
                  </p>
                  {guest.notes && <p className="mt-1 text-ink-500">Note: {guest.notes}</p>}
                </div>

                {quoteData?.available !== undefined && !quoteData.canBook && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                    This room just sold out for your dates ({quoteData.available} left). Please go back and pick another
                    room or dates.
                  </div>
                )}
                {quoteData?.canBook && quoteData.available <= 3 && (
                  <p className="mt-4 text-[13px] font-semibold text-amber-600">
                    Only {quoteData.available} left for these dates.
                  </p>
                )}
              </div>

              {quoteLoading && !quote ? (
                <div className="card space-y-3 p-6">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-8 w-1/3" />
                </div>
              ) : quote ? (
                <PriceBreakdown
                  quote={quote}
                  nights={quote.nights || nights}
                  couponMsg={couponMsg}
                  couponInput={couponInput}
                  setCouponInput={setCouponInput}
                  onApplyCoupon={applyCoupon}
                  quoteLoading={quoteLoading}
                />
              ) : (
                <div className="card p-6 text-[14px] text-ink-500">We couldn’t price this stay. Go back and try again.</div>
              )}
            </div>

            <div className="card h-fit p-6">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Summary</p>
              <div className="mt-3 space-y-2.5 text-[14px]">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-500">Room</span>
                  <span className="text-right font-semibold text-ink-900">{quote?.room_type?.name || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-500">Dates</span>
                  <span className="text-right font-semibold text-ink-900">
                    {fmtDate(stay.from, 'short')} → {fmtDate(stay.to, 'short')}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-500">Guests</span>
                  <span className="font-semibold text-ink-900">
                    {stay.adults}A {stay.children > 0 ? `${stay.children}C` : ''}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-500">Coupon</span>
                  <span className="font-semibold text-ink-900">{appliedCoupon || 'None'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  <span className="font-bold text-ink-900">Total</span>
                  <span className="text-[20px] font-extrabold text-brand-600">{money(quote?.total)}</span>
                </div>
              </div>

              {step === 2 ? (
                <button
                  className="btn-primary mt-5 w-full"
                  onClick={() => setStep(3)}
                  disabled={!quote || quoteLoading || quoteData?.canBook === false}
                >
                  Continue to confirm <ArrowRight size={16} />
                </button>
              ) : (
                <>
                  <button className="btn-primary mt-5 w-full" onClick={confirmBooking} disabled={submitting || quoteLoading}>
                    {submitting ? <Spinner size={16} /> : <Check size={16} />} {submitting ? 'Booking…' : 'Confirm booking'}
                  </button>
                  <button className="btn-ghost mt-2 w-full" onClick={() => setStep(2)} disabled={submitting}>
                    <ArrowLeft size={15} /> Back to price
                  </button>
                </>
              )}

              <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-400">
                You won’t be charged now — settle at the property. Free cancellation as per hotel policy.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BookPage({ params }) {
  return (
    <Suspense fallback={<PageLoader label="Preparing your booking…" />}>
      <Wizard slug={params?.slug} />
    </Suspense>
  );
}
