'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Star,
  MapPin,
  Wifi,
  Waves,
  Dumbbell,
  UtensilsCrossed,
  Sparkles,
  Car,
  Sun,
  ConciergeBell,
  ShieldCheck,
  Clock,
  CalendarDays,
  BedDouble,
  ArrowRight,
  CheckCircle2,
  Phone,
  Mail,
} from 'lucide-react';
import BookingBar from '@/components/site/BookingBar';
import { qs } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { money, fmtDate, todayISO, addDaysISO, nights as countNights } from '@/lib/format';
import { PageLoader, EmptyState } from '@/components/ui/kit';

const ROOM_IMAGES = [
  '/images/rooms/standard-double.jpg',
  '/images/rooms/deluxe-king.jpg',
  '/images/rooms/twin-deluxe.jpg',
  '/images/rooms/garden-view.jpg',
  '/images/rooms/family-room.jpg',
  '/images/rooms/executive-suite.jpg',
  '/images/rooms/apartment.jpg',
  '/images/rooms/presidential-suite.jpg',
];

const SITE_IMAGES = ['/images/site/pool.jpg', '/images/site/lobby.jpg', '/images/site/beach.jpg', '/images/site/spa.jpg'];

const AMENITY_ICONS = [
  [/wi-?fi|internet|business centre/i, Wifi],
  [/pool|swim|beach/i, Waves],
  [/gym|fitness|yoga|sport/i, Dumbbell],
  [/restaurant|dining|breakfast|bar|kitchen/i, UtensilsCrossed],
  [/spa|ayurveda|massage|wellness|sauna/i, Sparkles],
  [/parking|transfer|ev charg|car|shuttle/i, Car],
  [/garden|sun|view|terrace|balcony/i, Sun],
  [/laundry|room service|concierge|housekeep/i, ConciergeBell],
];

function parseList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function amenityIcon(label) {
  const found = AMENITY_ICONS.find(([re]) => re.test(String(label)));
  return found ? found[1] : Sparkles;
}

function fmtClock(v) {
  if (!v) return '—';
  const [h, m] = String(v).split(':');
  const hh = Number(h);
  if (Number.isNaN(hh)) return v;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${m || '00'} ${suffix}`;
}

function Stars({ value, size = 14 }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex gap-0.5 text-gold-500">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < n ? 'currentColor' : 'none'} className={i < n ? '' : 'text-ink-300'} />
      ))}
    </span>
  );
}

function RoomCard({ rt, index, stay, onSelect }) {
  const quote = rt.quote || {};
  const image = (Array.isArray(rt.images) && rt.images[0]) || rt.image || ROOM_IMAGES[index % ROOM_IMAGES.length];
  const price = quote.rate || rt.base_price;
  const total = quote.total;
  const available = rt.available ?? 0;
  const scarce = available > 0 && available <= 3;

  return (
    <div className="card card-hover flex flex-col overflow-hidden">
      <div className="relative h-40 overflow-hidden">
        <img src={image} alt={rt.name} className="h-full w-full object-cover" />
        <span
          className={`chip absolute right-3 top-3 ${
            scarce ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {scarce ? `Only ${available} left` : `${available} available`}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15.5px] font-bold text-ink-900">{rt.name}</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              Sleeps {rt.max_adults} adult{rt.max_adults > 1 ? 's' : ''}
              {rt.max_children > 0 ? ` + ${rt.max_children} child${rt.max_children > 1 ? 'ren' : ''}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[15.5px] font-extrabold text-brand-600">{money(price)}</p>
            <p className="text-[11.5px] text-ink-400">per night</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {rt.bed_type && (
            <span className="chip bg-ink-100 text-ink-600">
              <BedDouble size={12} /> {rt.bed_type} bed
            </span>
          )}
          {rt.size_sqft ? <span className="chip bg-ink-100 text-ink-600">{rt.size_sqft} sq.ft</span> : null}
          {rt.short_desc ? <span className="chip bg-ink-100 text-ink-600">{rt.short_desc}</span> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <div>
            <p className="text-[12px] text-ink-500">
              {stay.nights} night{stay.nights === 1 ? '' : 's'} total
            </p>
            <p className="text-[15px] font-bold text-ink-900">
              {money(total || price * stay.nights)}
              {quote.tax ? <span className="text-[11.5px] font-medium text-ink-400"> incl. tax</span> : null}
            </p>
          </div>
          <button onClick={() => onSelect(rt)} className="btn-primary btn-sm">
            Select <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HotelDetail({ slug }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [stay, setStay] = useState(() => {
    const from = sp.get('from') || addDaysISO(todayISO(), 7);
    const to = sp.get('to') || addDaysISO(todayISO(), 9);
    return {
      from,
      to,
      adults: Number(sp.get('adults') || 2),
      children: Number(sp.get('children') || 0),
      nights: countNights(from, to) || 1,
    };
  });

  const { data, loading, error } = useFetch(`/public/hotels/${slug}`);
  const { data: avail, loading: availLoading, error: availError } = useFetch(
    `/public/hotels/${slug}/availability${qs({
      from: stay.from,
      to: stay.to,
      adults: stay.adults,
      children: stay.children,
    })}`
  );

  function onSearch(form) {
    const from = form.from;
    const to = form.to;
    setStay({
      from,
      to,
      adults: Number(form.adults),
      children: Number(form.children),
      nights: countNights(from, to) || 1,
    });
    router.replace(
      `/hotels/${slug}${qs({ from, to, adults: form.adults, children: form.children })}`
    );
  }

  function selectRoom(rt) {
    router.push(
      `/hotels/${slug}/book${qs({
        roomTypeId: rt.id,
        from: stay.from,
        to: stay.to,
        adults: stay.adults,
        children: stay.children,
      })}`
    );
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton h-[340px] rounded-none" />
        <div className="mx-auto max-w-6xl space-y-4 px-5 py-10">
          <div className="skeleton h-8 w-1/2" />
          <div className="skeleton h-4 w-1/3" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="skeleton h-56" />
            <div className="skeleton h-56" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-5 py-20">
        <div className="card">
          <EmptyState
            icon={MapPin}
            title={notFound ? 'This property is not available' : 'Something went wrong'}
            message={notFound ? 'The hotel you are looking for may have been unpublished or the link is incorrect.' : error.message}
            action={
              <Link href="/hotels" className="btn-primary">
                Browse all stays
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const hotel = data?.hotel || {};
  const stats = data?.stats || {};
  const reviews = data?.reviews || [];
  const gallery = (data?.gallery || []).slice(0, 3);
  const amenities = parseList(hotel.amenities);
  const rooms = avail?.items || [];
  const heroImage = hotel.cover_url || gallery[0] || SITE_IMAGES[0];
  const policies = hotel.policies && typeof hotel.policies === 'object' ? hotel.policies : {};

  return (
    <>
      <section className="relative h-[300px] overflow-hidden bg-ink-950 sm:h-[380px]">
        <img src={heroImage} alt={hotel.name} className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/45 to-ink-950/20" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-5 pb-8">
          <span className="chip w-fit bg-white/15 text-white backdrop-blur-sm">
            {hotel.star_rating || 3}★ · {hotel.city}
            {hotel.state ? `, ${hotel.state}` : ''}
          </span>
          <h1 className="font-display mt-3 text-[34px] font-bold leading-tight text-white sm:text-[44px]">{hotel.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-200">
            <span className="inline-flex items-center gap-2">
              <Stars value={stats.rating || hotel.star_rating} />
              <b className="text-white">{Number(stats.rating || 0).toFixed(1)}</b>
              <span className="text-ink-300">({stats.review_count || 0} reviews)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} className="text-gold-400" /> {hotel.address}, {hotel.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BedDouble size={15} className="text-gold-400" /> {stats.rooms || 0} rooms
            </span>
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-3">
          <BookingBar initial={{ city: hotel.city, from: stay.from, to: stay.to, adults: stay.adults, children: stay.children }} onSearch={onSearch} />
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">Live rates</p>
            <h2 className="font-display mt-2 text-[27px] font-bold text-ink-900">Availability for your dates</h2>
            <p className="mt-1 text-[14px] text-ink-500">
              {stay.from} → {stay.to} · {stay.nights} night{stay.nights === 1 ? '' : 's'} · {stay.adults} adult
              {stay.adults > 1 ? 's' : ''} · {stay.children} child{stay.children === 1 ? '' : 'ren'}
            </p>
          </div>
          <span className="chip bg-emerald-100 text-emerald-700">
            <ShieldCheck size={13} /> Best price guarantee
          </span>
        </div>

        {availError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {availError.message}
          </div>
        ) : availLoading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="skeleton h-64" />
            <div className="skeleton h-64" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="mt-6 card">
            <EmptyState
              icon={CalendarDays}
              title="No rooms for these dates"
              message="Try shifting your check-in or check-out a day — or contact the property directly."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {rooms.map((rt, i) => (
              <RoomCard key={rt.id} rt={rt} index={i} stay={stay} onSelect={selectRoom} />
            ))}
          </div>
        )}
      </section>

      {amenities.length > 0 && (
        <section className="bg-ink-50 py-12">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-[26px] font-bold text-ink-900">What this property offers</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {amenities.map((a) => {
                const Icon = amenityIcon(a);
                return (
                  <div key={a} className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon size={18} />
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink-800">{a}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-brand-600">About</p>
            <h2 className="font-display mt-2 text-[26px] font-bold text-ink-900">
              {hotel.tagline || `Stay at ${hotel.name}`}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">{hotel.about || hotel.description}</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {gallery.map((g, i) => (
                <img
                  key={g + i}
                  src={g}
                  alt={`${hotel.name} gallery`}
                  className="h-32 w-full rounded-2xl object-cover shadow-soft sm:h-36"
                />
              ))}
            </div>
          </div>

          <div className="card h-fit p-6">
            <p className="text-[11.5px] font-bold uppercase tracking-[.16em] text-ink-400">Guest rating</p>
            <div className="mt-3 flex items-end gap-3">
              <p className="font-display text-[46px] font-bold leading-none text-ink-900">
                {Number(stats.rating || 0).toFixed(1)}
              </p>
              <div className="pb-1.5">
                <Stars value={stats.rating} size={16} />
                <p className="mt-1 text-[12.5px] text-ink-500">{stats.review_count || 0} verified reviews</p>
              </div>
            </div>
            <div className="mt-5 space-y-4 border-t border-ink-100 pt-5">
              {reviews.length === 0 && <p className="text-sm text-ink-500">No reviews yet — be the first to stay here.</p>}
              {reviews.slice(0, 4).map((r) => (
                <div key={r.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13.5px] font-bold text-ink-900">{r.guest_name}</p>
                    <span className="text-[12px] text-ink-400">{fmtDate(r.created_at, 'short')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars value={r.rating} size={12} />
                    {r.category && r.category !== 'overall' && <span className="chip bg-ink-100 text-ink-500">{r.category}</span>}
                  </div>
                  {r.comment && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50 py-10">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-ink-100 bg-white p-5">
              <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <Clock size={14} /> Check-in
              </p>
              <p className="mt-2 text-[17px] font-bold text-ink-900">{policies.check_in || fmtClock(hotel.check_in_time)}</p>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white p-5">
              <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <Clock size={14} /> Check-out
              </p>
              <p className="mt-2 text-[17px] font-bold text-ink-900">{policies.check_out || fmtClock(hotel.check_out_time)}</p>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white p-5">
              <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <CheckCircle2 size={14} /> Cancellation
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
                {policies.cancellation || 'Free cancellation up to 24 hours before check-in.'}
              </p>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white p-5">
              <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <Phone size={14} /> Front desk
              </p>
              <p className="mt-2 text-[13.5px] font-semibold text-ink-800">{hotel.phone || '—'}</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
                <Mail size={13} /> {hotel.email || '—'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {policies.children && <span className="chip bg-white text-ink-600">{policies.children}</span>}
            {policies.pets && <span className="chip bg-white text-ink-600">{policies.pets}</span>}
          </div>
        </div>
      </section>
    </>
  );
}

export default function HotelPage({ params }) {
  const slug = params?.slug;
  return (
    <Suspense fallback={<PageLoader label="Loading property…" />}>
      <HotelDetail slug={slug} />
    </Suspense>
  );
}
