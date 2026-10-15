'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Star, MapPin, BedDouble, CalendarDays, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import BookingBar from '@/components/site/BookingBar';
import { api, qs } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { money, todayISO, addDaysISO, nights as countNights } from '@/lib/format';
import { PageLoader, EmptyState } from '@/components/ui/kit';

const COVERS = [
  '/images/site/pool.jpg',
  '/images/site/lobby.jpg',
  '/images/site/hero.jpg',
  '/images/site/beach.jpg',
  '/images/site/reception.jpg',
  '/images/site/restaurant.jpg',
];

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-48 rounded-none" />
      <div className="space-y-2.5 p-5">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3.5 w-1/2" />
        <div className="skeleton h-3.5 w-1/3" />
      </div>
    </div>
  );
}

function HotelCard({ hotel, index, stay }) {
  const href = `/hotels/${hotel.slug}${qs({ from: stay.from, to: stay.to, adults: stay.adults, children: stay.children })}`;
  return (
    <div className="card card-hover group flex flex-col overflow-hidden">
      <Link href={href} className="relative block h-52 overflow-hidden">
        <img
          src={hotel.cover_url || COVERS[index % COVERS.length]}
          alt={hotel.name}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/85 to-transparent" />
        <span className="chip absolute left-3 top-3 bg-ink-950/70 text-white backdrop-blur-sm">
          {hotel.star_rating || 3}★ · {hotel.city}
        </span>
        {Number(hotel.rating) > 0 && (
          <span className="absolute right-3 top-3 chip bg-white/95 text-ink-900">
            <Star size={12} className="text-gold-500" fill="currentColor" />
            {Number(hotel.rating).toFixed(1)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={href} className="font-display text-[19px] font-bold leading-snug text-ink-900 hover:text-brand-600">
          {hotel.name}
        </Link>
        <p className="mt-1 line-clamp-1 text-[13.5px] text-ink-500">{hotel.tagline || `${hotel.city}, ${hotel.state || hotel.country}`}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-brand-500" /> {hotel.city}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BedDouble size={14} className="text-brand-500" /> {hotel.room_types || 0} room types
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-ink-100 pt-4">
          <div>
            <p className="text-[11.5px] uppercase tracking-wide text-ink-400">from</p>
            <p className="text-[17px] font-extrabold text-brand-600">
              {money(hotel.from_price)}
              <span className="text-[12.5px] font-medium text-ink-400"> /night</span>
            </p>
          </div>
          <Link href={href} className="btn-primary btn-sm">
            View rooms <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Results() {
  const sp = useSearchParams();
  const router = useRouter();

  const [stay, setStay] = useState({
    q: sp.get('q') || sp.get('city') || '',
    from: sp.get('from') || addDaysISO(todayISO(), 7),
    to: sp.get('to') || addDaysISO(todayISO(), 9),
    adults: Number(sp.get('adults') || 2),
    children: Number(sp.get('children') || 0),
  });
  const [city, setCity] = useState(sp.get('city') && !sp.get('q') ? sp.get('city') : '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const debouncedQ = useDebounced(stay.q, 350);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get(`/public/hotels${qs({ q: debouncedQ })}`)
      .then((d) => {
        if (!alive) return;
        setItems(d.items || []);
        setError(null);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [debouncedQ, tick]);

  function onSearch(form) {
    const next = { q: form.city || '', from: form.from, to: form.to, adults: Number(form.adults), children: Number(form.children) };
    setStay(next);
    router.replace(`/hotels${qs({ q: next.q, from: next.from, to: next.to, adults: next.adults, children: next.children, city })}`);
  }

  function clearFilters() {
    setCity('');
    setStay((s) => ({ ...s, q: '' }));
    router.replace('/hotels');
  }

  const cities = [...new Set(items.map((h) => h.city).filter(Boolean))].sort();
  const visible = city ? items.filter((h) => h.city === city) : items;
  const stayNights = countNights(stay.from, stay.to);

  return (
    <>
      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-9">
          <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Live demo properties</p>
          <h1 className="font-display mt-2 text-[34px] font-bold leading-tight text-ink-900">Find your stay</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-500">
            Real rooms, live availability and instant confirmation — every property runs on HotelHub.
          </p>

          <div className="mt-6">
            <BookingBar
              key={`${stay.q}|${stay.from}|${stay.to}|${stay.adults}|${stay.children}`}
              initial={{ city: stay.q, from: stay.from, to: stay.to, adults: stay.adults, children: stay.children }}
              onSearch={onSearch}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-500" /> No booking fees
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={15} className="text-gold-500" /> Instant confirmation
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} className="text-brand-500" />
              {stayNights} night{stayNights === 1 ? '' : 's'} · {fmtRange(stay.from, stay.to)}
            </span>
          </div>

          {cities.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-ink-400">Quick filters</span>
              <button
                onClick={() => setCity('')}
                className={`chip border transition ${!city ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'}`}
              >
                All cities
              </button>
              {cities.map((c) => (
                <button
                  key={c}
                  onClick={() => setCity(c === city ? '' : c)}
                  className={`chip border transition ${city === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[24px] font-bold text-ink-900">
              {loading ? 'Searching stays…' : `${visible.length} propert${visible.length === 1 ? 'y' : 'ies'}`}
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-500">
              {city ? `In ${city} · ` : ''}Check-in {stay.from} · Check-out {stay.to}
            </p>
          </div>
          {(city || stay.q) && (
            <button onClick={clearFilters} className="btn-ghost btn-sm">
              Clear filters
            </button>
          )}
        </div>

        {error ? (
          <div className="mt-6">
            <EmptyState
              icon={Search}
              title="We couldn’t reach the hotels service"
              message={error.message}
              action={
                <button onClick={() => setTick((t) => t + 1)} className="btn-secondary">
                  Try again
                </button>
              }
            />
          </div>
        ) : loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-6 card">
            <EmptyState
              icon={Search}
              title="No stays match your search"
              message="Try a different city, or widen your dates — our demo properties are spread across Goa, Kerala and Rajasthan."
              action={
                <button onClick={clearFilters} className="btn-primary">
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((h, i) => (
              <HotelCard key={h.id || h.slug} hotel={h} index={i} stay={stay} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function fmtRange(from, to) {
  if (!from || !to) return '—';
  return `${from} → ${to}`;
}

export default function HotelsPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading stays…" />}>
      <Results />
    </Suspense>
  );
}
