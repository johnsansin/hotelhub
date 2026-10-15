'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth, homeFor } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';

const DEMOS = [
  { role: 'Hotel Admin', email: 'admin@demo.hms' },
  { role: 'Superadmin', email: 'superadmin@hotelhub.io' },
  { role: 'Front Desk', email: 'meera@azure.demo.hms' },
  { role: 'Manager', email: 'tenzin@highland.demo.hms' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('admin@demo.hms');
  const [password, setPassword] = useState('demo123');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${user.name?.split(' ')[0] || 'there'}!`);
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* visual side */}
      <div className="gradient-hero relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="relative">
          <Link href="/">
            <Logo light />
          </Link>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-[40px] leading-[1.1] text-white">
            Run every corner of your hotel from one calm cockpit.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-300">
            Bookings, front desk, housekeeping, restaurant POS, inventory, ledgers and an AI concierge — built
            for independent hotels and chains alike.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {[
              ['3', 'Hotels live'],
              ['274', 'Bookings tracked'],
              ['43L', 'Revenue recorded'],
            ].map(([v, l]) => (
              <div key={l}>
                <p className="text-2xl font-bold text-white">{v}</p>
                <p className="text-[11.5px] text-ink-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[12px] text-ink-500">© {new Date().getFullYear()} HotelHub · Hospitality OS</p>
      </div>

      {/* form side */}
      <div className="flex flex-1 items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">Sign in to HotelHub</h1>
          <p className="mt-1.5 text-sm text-ink-500">Welcome back — your property is waiting.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@hotel.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="input pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <>Sign in <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-ink-100 bg-ink-50 p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-ink-500">Quick demo access</p>
            <div className="mt-2.5 grid gap-1.5">
              {DEMOS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword('demo123');
                  }}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-[13px] shadow-soft transition hover:shadow-card"
                >
                  <span className="font-semibold text-ink-800">{d.role}</span>
                  <span className="truncate pl-3 text-ink-400">{d.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-ink-500">
            New hotel?{' '}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              Start your free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
