'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Star,
  Sparkles,
  CalendarCheck,
  ConciergeBell,
  UtensilsCrossed,
  Wallet,
  BarChart3,
  Boxes,
  ShieldCheck,
  Bot,
  Globe,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import BookingBar from '@/components/site/BookingBar';
import { api } from '@/lib/api';
import { money, fmtDate } from '@/lib/format';

const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Bookings & channel-ready PMS',
    text: 'Direct website bookings, walk-ins and OTA reservations in one timeline with instant availability checks.',
  },
  {
    icon: ConciergeBell,
    title: 'Front desk that flies',
    text: 'Arrivals, departures, room moves, folios and key-card ready check-ins in under 30 seconds.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurant, room service & POS',
    text: 'KOT printing, table service, minibar and shop billing — all posting straight to the guest folio.',
  },
  {
    icon: Boxes,
    title: 'Inventory & stores',
    text: 'Stock levels, low-stock alerts, GRN, supplier bills and consumption per outlet.',
  },
  {
    icon: Wallet,
    title: 'Accounts that close the day',
    text: 'Double-entry ledger, tax heads, receivables and a daily z-report your CA will love.',
  },
  {
    icon: Bot,
    title: 'AI concierge',
    text: 'Ask “how is occupancy this week?” and get a real answer from your own data — plus guest replies.',
  },
];

const MODULES = [
  ['Housekeeping', 'Room status board, task assignment, inspection checklists.'],
  ['Found & Lost', 'Log, photograph and return guest belongings with a full audit trail.'],
  ['Staff & HR', 'Rosters, shifts, attendance, leave and payroll-ready exports.'],
  ['Purchases', 'Vendors, POs, GRN and bills matched three-way automatically.'],
  ['Reports', 'Occupancy, ADR, RevPAR, F&B and departmental P&L in one click.'],
  ['Multi-property', 'Run 1 or 100 hotels from a single superadmin console.'],
];

const STEPS = [
  ['Create your property', 'Sign up in 2 minutes — rooms, rates and taxes pre-filled with sensible defaults.'],
  ['Import or enter bookings', 'Add today’s arrivals, import a CSV, or let your website feed bookings in automatically.'],
  ['Run the whole hotel', 'Front desk, F&B, stores and ledgers — with AI watching the numbers for you.'],
];

export default function LandingPage() {
  const [hotels, setHotels] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/public/hotels?limit=6').catch(() => ({ items: [] })),
      api.get('/public/plans').catch(() => ({ items: [] })),
    ])
      .then(([h, p]) => {
        setHotels(h.items || []);
        setPlans(p.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/site/lobby.jpg')] bg-cover bg-center opacity-[.14]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <span className="chip glass !bg-white/10 !text-brand-100 !border-white/15">
              <Sparkles size={13} /> Hospitality OS for modern hotels
            </span>
            <h1 className="font-display mt-6 text-balance text-[42px] font-bold leading-[1.06] text-white sm:text-[58px]">
              Run the whole hotel from <span className="text-gold-400">one calm</span> cockpit.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-300">
              Bookings, front desk, restaurant POS, inventory, ledgers and an AI concierge — replacing five
              disconnected tools with a single subscription.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="btn-primary btn-lg">
                Start 14-day free trial <ArrowRight size={17} />
              </Link>
              <Link href="/hotels" className="btn-lg btn-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/20">
                Browse live demo hotels
              </Link>
            </div>
          </div>

          <div className="mt-12 animate-fade-up" style={{ animationDelay: '.12s' }}>
            <BookingBar variant="dark" />
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-4">
            {[
              ['53', 'tables in one database'],
              ['25+', 'operational endpoints'],
              ['24/7', 'AI concierge answers'],
              ['₹0', 'setup & migration fee'],
            ].map(([v, l]) => (
              <div key={l} className="text-center sm:text-left">
                <p className="text-2xl font-extrabold text-white">{v}</p>
                <p className="text-[12.5px] text-ink-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FEATURED HOTELS ================= */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Live on HotelHub</p>
            <h2 className="font-display mt-2 text-[30px] font-bold text-ink-900">Featured stays</h2>
          </div>
          <Link href="/hotels" className="btn-secondary btn-sm">
            View all <ArrowRight size={15} />
          </Link>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="skeleton h-48 rounded-none" />
                  <div className="space-y-2.5 p-5">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3.5 w-1/2" />
                  </div>
                </div>
              ))
            : hotels.map((h) => (
                <Link
                  key={h.id}
                  href={`/hotels/${h.slug}`}
                  className="card card-hover group overflow-hidden"
                >
                  <div className="relative h-52 overflow-hidden">
                    <img
                      src={h.cover_url || '/images/site/pool.jpg'}
                      alt={h.name}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/85 to-transparent" />
                    <span className="absolute left-3 top-3 chip glass !text-white">
                      {h.star_rating || 3}★ {h.city}
                    </span>
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                      <p className="font-display text-lg font-bold text-white">{h.name}</p>
                      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-gold-400">
                        <Star size={13} fill="currentColor" /> {Number(h.rating || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-[12.5px] text-ink-500">
                        {h.rooms || 0} rooms · {h.room_types || 0} categories
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-600">{h.tagline}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-ink-400">from</p>
                      <p className="text-[15px] font-bold text-brand-600">{money(h.from_price)}</p>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* ================= PLATFORM ================= */}
      <section id="platform" className="bg-ink-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">The platform</p>
            <h2 className="font-display mt-2 text-[32px] font-bold leading-tight text-ink-900">
              Everything a property needs — nothing it doesn’t.
            </h2>
            <p className="mt-3 text-[15px] text-ink-500">
              Each module is built for the way hotels actually work: fast, keyboard-friendly, and mobile-ready
              on the floor.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <f.icon size={20} />
                </div>
                <h3 className="mt-4 text-[15.5px] font-bold text-ink-900">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{f.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(([t, d]) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-[14px] font-semibold text-ink-800">{t}</p>
                  <p className="mt-0.5 text-[13px] text-ink-500">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Get going</p>
            <h2 className="font-display mt-2 text-[32px] font-bold leading-tight text-ink-900">
              Live in an afternoon, not a quarter.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
              No implementation consultants. No servers. Your team signs in on the browser they already use.
            </p>
            <div className="mt-8 space-y-5">
              {STEPS.map(([t, d], i) => (
                <div key={t} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-[13px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-bold text-ink-900">{t}</p>
                    <p className="mt-1 text-[13.5px] text-ink-500">{d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/register" className="btn-primary mt-8">
              Create your property <ArrowRight size={16} />
            </Link>
          </div>

          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <img src="/images/site/reception.jpg" alt="Reception" className="h-64 w-full rounded-3xl object-cover shadow-card" />
              <img src="/images/site/restaurant.jpg" alt="Restaurant" className="mt-8 h-64 w-full rounded-3xl object-cover shadow-card" />
              <img src="/images/site/spa.jpg" alt="Spa" className="-mt-4 h-56 w-full rounded-3xl object-cover shadow-card" />
              <img src="/images/site/event.jpg" alt="Events" className="mt-4 h-56 w-full rounded-3xl object-cover shadow-card" />
            </div>
            <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-ink-100 bg-white px-5 py-3.5 shadow-card">
              <ShieldCheck size={20} className="text-emerald-500" />
              <div>
                <p className="text-[13px] font-bold text-ink-900">Role-based access</p>
                <p className="text-[11.5px] text-ink-500">Reception sees rooms. Accountants see ledgers. Nothing else.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section className="bg-ink-950 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-gold-400">Pricing</p>
            <h2 className="font-display mt-2 text-[32px] font-bold text-white">Simple pricing that scales with rooms</h2>
            <p className="mt-3 text-[15px] text-ink-400">All plans include unlimited bookings, updates and support.</p>
          </div>

          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            {(loading ? Array.from({ length: 3 }) : plans).map((p, i) => (
              <div
                key={p?.code || i}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  p?.is_popular ? 'border-gold-500/60 bg-white/[.06] shadow-glow' : 'border-white/10 bg-white/[.03]'
                }`}
              >
                {p?.is_popular && (
                  <span className="absolute -top-3 left-7 chip bg-gold-500 text-ink-950">Most popular</span>
                )}
                {loading ? (
                  <div className="space-y-3">
                    <div className="skeleton h-5 w-1/3" />
                    <div className="skeleton h-9 w-1/2" />
                    <div className="skeleton h-24 w-full" />
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-bold uppercase tracking-wider text-brand-300">{p.name}</p>
                    <p className="mt-2 text-[14px] text-ink-400">{p.tagline}</p>
                    <p className="mt-5">
                      <span className="text-4xl font-extrabold text-white">₹{Number(p.price_monthly).toLocaleString('en-IN')}</span>
                      <span className="text-[13.5px] text-ink-400"> /month</span>
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-500">
                      {p.max_rooms ? `Up to ${p.max_rooms} rooms` : ''} · {p.max_staff ? `${p.max_staff} staff logins` : ''}
                    </p>
                    <ul className="mt-5 flex-1 space-y-2.5">
                      {(p.features || []).map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-ink-200">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/register"
                      className={`mt-6 ${p.is_popular ? 'btn-primary' : 'btn-secondary !border-white/15 !bg-white/5 !text-white hover:!bg-white/10'} w-full`}
                    >
                      Start free trial
                    </Link>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="gradient-brand relative overflow-hidden rounded-4xl px-8 py-14 text-center">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <h2 className="font-display mx-auto max-w-2xl text-balance text-[30px] font-bold text-white sm:text-[36px]">
              Your front desk deserves better software.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] text-white/75">
              Set up your property in minutes — invite your team, and take your first booking today.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="btn-lg rounded-2xl bg-white font-semibold text-brand-700 hover:bg-ink-50">
                Start free trial <ArrowRight size={17} />
              </Link>
              <Link href="/pricing" className="btn-lg btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
