'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search, MapPin, CalendarDays, Users } from 'lucide-react';
import { todayISO, addDaysISO } from '@/lib/format';

export default function BookingBar({ initial = {}, compact = false, onSearch, variant = 'light' }) {
  const router = useRouter();
  const [form, setForm] = useState({
    city: initial.city || '',
    from: initial.from || addDaysISO(todayISO(), 7),
    to: initial.to || addDaysISO(todayISO(), 9),
    adults: initial.adults || 2,
    children: initial.children || 0,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e) {
    e?.preventDefault?.();
    const params = new URLSearchParams({
      city: form.city,
      from: form.from,
      to: form.to,
      adults: String(form.adults),
      children: String(form.children),
    });
    if (onSearch) onSearch(form);
    else router.push(`/hotels?${params.toString()}`);
  }

  const dark = variant === 'dark';

  return (
    <form
      onSubmit={submit}
      className={`grid gap-2.5 rounded-3xl p-3 shadow-card sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_.9fr_.9fr_auto] ${
        dark ? 'bg-white' : 'border border-ink-200 bg-white'
      }`}
    >
      <label className="relative flex items-center">
        <MapPin size={16} className="pointer-events-none absolute left-3.5 text-brand-500" />
        <input
          className="input !border-transparent !bg-ink-50 !pl-10"
          placeholder="City or hotel"
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
        />
      </label>
      <label className="relative flex items-center">
        <CalendarDays size={16} className="pointer-events-none absolute left-3.5 text-brand-500" />
        <input
          type="date"
          className="input !border-transparent !bg-ink-50 !pl-10"
          value={form.from}
          min={todayISO()}
          onChange={(e) => set('from', e.target.value)}
          aria-label="Check-in"
        />
      </label>
      <label className="relative flex items-center">
        <CalendarDays size={16} className="pointer-events-none absolute left-3.5 text-brand-500" />
        <input
          type="date"
          className="input !border-transparent !bg-ink-50 !pl-10"
          value={form.to}
          min={form.from || todayISO()}
          onChange={(e) => set('to', e.target.value)}
          aria-label="Check-out"
        />
      </label>
      <label className="relative flex items-center">
        <Users size={16} className="pointer-events-none absolute left-3.5 text-brand-500" />
        <select
          className="input !border-transparent !bg-ink-50 !pl-10"
          value={form.adults}
          onChange={(e) => set('adults', Number(e.target.value))}
          aria-label="Adults"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} adult{n > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="relative flex items-center">
        <Users size={16} className="pointer-events-none absolute left-3.5 text-brand-500" />
        <select
          className="input !border-transparent !bg-ink-50 !pl-10"
          value={form.children}
          onChange={(e) => set('children', Number(e.target.value))}
          aria-label="Children"
        >
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} kid{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-primary !rounded-2xl px-6">
        <Search size={17} /> {!compact && 'Search'}
      </button>
    </form>
  );
}
