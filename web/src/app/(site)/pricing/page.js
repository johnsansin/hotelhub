'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Sparkles, ShieldCheck, CreditCard } from 'lucide-react';
import { useFetch } from '@/lib/hooks';
import { money } from '@/lib/format';
import { Segmented } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kit';

const FAQS = [
  {
    q: 'How does the 14-day free trial work?',
    a: 'Every plan starts with a full-featured 14-day trial — no card required. Import your rooms, take real bookings and invite your team. If you don’t upgrade, your data stays exportable for 30 days.',
  },
  {
    q: 'Do you charge per booking or per room night?',
    a: 'Never. All plans include unlimited bookings, unlimited room nights and unlimited OTA/direct reservations. You pay one flat subscription for the property.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes — upgrade or downgrade any time from Settings → Billing. Changes are prorated to the day, and your data, users and history move with you untouched.',
  },
  {
    q: 'Is GST invoicing and accounting included?',
    a: 'GST invoicing, tax heads, the double-entry ledger and daily z-reports are included from the Growth plan upward. Starter includes folios and basic invoices.',
  },
  {
    q: 'Will you migrate data from my current system?',
    a: 'Yes. On Growth and Enterprise we import guests, bookings, room inventory and opening balances from a CSV or your existing PMS export at no extra cost.',
  },
];

function PlanCard({ plan, billing }) {
  const yearly = billing === 'yearly';
  const price = yearly ? plan.price_yearly : plan.price_monthly;
  const popular = !!plan.is_popular;
  const rooms = plan.max_rooms ? `Up to ${plan.max_rooms} rooms` : 'Unlimited rooms';
  const staff = plan.max_staff ? `${plan.max_staff} staff logins` : 'Unlimited staff logins';

  return (
    <div
      className={`relative flex flex-col rounded-3xl border bg-white p-7 transition ${
        popular ? 'border-gold-500/60 shadow-card ring-1 ring-gold-500/25' : 'border-ink-100 shadow-soft'
      }`}
    >
      {popular && (
        <span className="chip absolute -top-3 left-7 bg-gold-500 text-ink-950">
          <Sparkles size={12} /> Most popular
        </span>
      )}

      <p className="text-[13px] font-bold uppercase tracking-wider text-brand-600">{plan.name}</p>
      <p className="mt-2 min-h-[40px] text-[14px] text-ink-500">{plan.tagline}</p>

      <div className="mt-5 flex items-end gap-2">
        <span className="text-[38px] font-extrabold leading-none text-ink-900">{money(price)}</span>
        <span className="pb-1 text-[13.5px] text-ink-400">/{yearly ? 'year' : 'month'}</span>
      </div>
      <p className="mt-2 min-h-[20px] text-[12.5px] font-medium text-ink-500">
        {yearly ? (
          <span className="text-emerald-600">2 months free · billed yearly</span>
        ) : (
          `Billed monthly · ${money(Math.round((plan.price_yearly || 0) / 12))}/mo if billed yearly`
        )}
      </p>

      <p className="mt-3 text-[12.5px] text-ink-500">
        {rooms} · {staff}
      </p>

      {Array.isArray(plan.highlights) && plan.highlights.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {plan.highlights.map((h) => (
            <span key={h} className="chip bg-brand-50 text-brand-700">
              {h}
            </span>
          ))}
        </div>
      )}

      <ul className="mt-5 flex-1 space-y-2.5 border-t border-ink-100 pt-5">
        {(plan.features || []).map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-ink-600">
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
            {f}
          </li>
        ))}
      </ul>

      <Link href="/register" className={`mt-6 w-full ${popular ? 'btn-primary' : 'btn-secondary'}`}>
        Start 14-day free trial <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export default function PricingPage() {
  const { data, loading, error, reload } = useFetch('/public/plans');
  const [billing, setBilling] = useState('monthly');
  const [openFaq, setOpenFaq] = useState(0);

  const plans = data?.items || [];

  return (
    <>
      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center">
          <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-gold-600">Pricing</p>
          <h1 className="font-display mx-auto mt-3 max-w-2xl text-balance text-[36px] font-bold leading-[1.1] text-ink-900 sm:text-[46px]">
            One subscription for the whole property.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-500">
            Bookings, front desk, F&amp;B POS, inventory and ledgers — priced by rooms, never by bookings. Every plan
            starts with a 14-day free trial.
          </p>

          <div className="mt-7 flex flex-col items-center gap-3">
            <Segmented
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
              value={billing}
              onChange={setBilling}
            />
            <span className="text-[12.5px] text-ink-500">
              {billing === 'yearly' ? 'Yearly billing saves you 2 months on every plan.' : 'Switch to yearly and get 2 months free.'}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-500" /> No card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CreditCard size={15} className="text-brand-500" /> Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-gold-500" /> Free setup &amp; migration
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        {error ? (
          <div className="card">
            <EmptyState
              title="Plans are unavailable right now"
              message={error.message}
              action={
                <button onClick={reload} className="btn-primary">
                  Try again
                </button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {(loading ? Array.from({ length: 3 }) : plans).map((p, i) =>
              loading ? (
                <div key={i} className="rounded-3xl border border-ink-100 bg-white p-7">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton mt-4 h-9 w-1/2" />
                  <div className="skeleton mt-5 h-40 w-full" />
                  <div className="skeleton mt-5 h-10 w-full" />
                </div>
              ) : (
                <PlanCard key={p.id || p.code} plan={p} billing={billing} />
              )
            )}
          </div>
        )}

        <div className="mt-8 grid gap-4 rounded-3xl border border-ink-100 bg-ink-50 p-6 sm:grid-cols-3">
          {[
            ['Included in every plan', 'Unlimited bookings, staff training and product updates.'],
            ['Support that answers', 'Email support on Starter, priority queue from Growth, a named manager on Enterprise.'],
            ['Your data stays yours', 'One-click CSV export any time. No lock-in, no exit fee.'],
          ].map(([t, d]) => (
            <div key={t}>
              <p className="text-[14px] font-bold text-ink-900">{t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink-50 py-14">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="font-display text-center text-[30px] font-bold text-ink-900">Questions, answered</h2>
          <p className="mt-2 text-center text-[14.5px] text-ink-500">Everything owners ask before switching to HotelHub.</p>

          <div className="mt-7 space-y-3">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
                  <button
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={open}
                  >
                    <span className="text-[14.5px] font-semibold text-ink-900">{f.q}</span>
                    <ChevronDown
                      size={17}
                      className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180 text-brand-600' : ''}`}
                    />
                  </button>
                  {open && <p className="border-t border-ink-100 px-5 py-4 text-[14px] leading-relaxed text-ink-600">{f.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="gradient-brand relative overflow-hidden rounded-4xl px-8 py-14 text-center">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <h2 className="font-display mx-auto max-w-2xl text-balance text-[30px] font-bold text-white sm:text-[36px]">
              Try the full platform free for 14 days.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] text-white/75">
              No card, no setup fee. Import your rooms today and take your first direct booking this week.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="btn-lg rounded-2xl bg-white font-semibold text-brand-700 hover:bg-ink-50">
                Start free trial <ArrowRight size={17} />
              </Link>
              <Link
                href="/hotels"
                className="btn-lg btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10"
              >
                See a live property
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
