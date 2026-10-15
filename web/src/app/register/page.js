'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowLeft, Loader2, Check } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth, homeFor } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import clsx from 'clsx';

const STEPS = ['Your hotel', 'Your plan', 'Your account'];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState([]);

  const [form, setForm] = useState({
    name: '',
    city: '',
    state: '',
    country: 'India',
    phone: '',
    star_rating: 3,
    planCode: 'growth',
    legal_name: '',
    email: '',
    password: '',
    name2: '',
  });

  useEffect(() => {
    api.get('/public/plans').then((d) => setPlans(d.items || d || [])).catch(() => setPlans([]));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const user = await register({
        planCode: form.planCode,
        hotel: {
          name: form.name,
          legal_name: form.legal_name || form.name,
          city: form.city,
          state: form.state,
          country: form.country,
          phone: form.phone,
          star_rating: form.star_rating,
        },
        user: { name: form.name2, email: form.email, password: form.password },
      });
      toast.success('Property created — welcome to HotelHub!');
      router.push(homeFor(user.role));
    } catch (e) {
      setError(e.message);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  const canNext =
    step === 0 ? form.name && form.city : step === 1 ? true : form.email && form.password.length >= 6 && form.name2;

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-ink-600 hover:text-brand-600">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        {/* stepper */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition',
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-500'
                )}
              >
                {i < step ? <Check size={15} /> : i + 1}
              </div>
              <p className={clsx('hidden text-[13px] font-semibold sm:block', i <= step ? 'text-ink-800' : 'text-ink-400')}>
                {s}
              </p>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-ink-200" />}
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8">
          {step === 0 && (
            <div className="animate-fade-up space-y-4">
              <div>
                <h1 className="text-xl font-bold text-ink-900">Tell us about your property</h1>
                <p className="mt-1 text-sm text-ink-500">You can change everything later in settings.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Hotel name *</span>
                  <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Sea View Resort" />
                </label>
                <label>
                  <span className="label">City *</span>
                  <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Goa" />
                </label>
                <label>
                  <span className="label">State / Region</span>
                  <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="Goa" />
                </label>
                <label>
                  <span className="label">Phone</span>
                  <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
                </label>
                <label>
                  <span className="label">Star rating</span>
                  <select className="input" value={form.star_rating} onChange={(e) => set('star_rating', Number(e.target.value))}>
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} star
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-up">
              <h1 className="text-xl font-bold text-ink-900">Pick your plan</h1>
              <p className="mt-1 text-sm text-ink-500">14-day free trial · cancel anytime.</p>
              <div className="mt-5 grid gap-3">
                {plans.map((p) => {
                  const active = form.planCode === p.code;
                  return (
                    <button
                      key={p.code}
                      onClick={() => set('planCode', p.code)}
                      className={clsx(
                        'flex items-start justify-between gap-4 rounded-2xl border p-4 text-left transition',
                        active ? 'border-brand-500 bg-brand-50/60 shadow-glow' : 'border-ink-200 bg-white hover:border-ink-300'
                      )}
                    >
                      <div>
                        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
                          {p.name}
                          {p.is_popular && <span className="chip bg-gold-500/15 text-gold-600">Most popular</span>}
                        </p>
                        <p className="mt-1 text-[13px] text-ink-500">{p.tagline || 'Full platform access'}</p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {(Array.isArray(p.features) ? p.features : String(p.features || '').split(',').filter(Boolean)).slice(0, 5).map((f) => (
                            <li key={f} className="chip bg-ink-100 text-ink-600">
                              {String(f).trim()}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-extrabold text-ink-900">₹{Number(p.price_monthly).toLocaleString('en-IN')}</p>
                        <p className="text-[11.5px] text-ink-400">per month</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-up space-y-4">
              <div>
                <h1 className="text-xl font-bold text-ink-900">Create your admin account</h1>
                <p className="mt-1 text-sm text-ink-500">You’ll sign in with this email from now on.</p>
              </div>
              <label className="block">
                <span className="label">Your name *</span>
                <input className="input" value={form.name2} onChange={(e) => set('name2', e.target.value)} placeholder="Priya Sharma" />
              </label>
              <label className="block">
                <span className="label">Work email *</span>
                <input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@hotel.com" />
              </label>
              <label className="block">
                <span className="label">Password *</span>
                <input type="password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" />
              </label>
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">{error}</div>
              )}
            </div>
          )}

          <div className="mt-7 flex items-center justify-between">
            <button className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
              <ArrowLeft size={16} /> Back
            </button>
            {step < 2 ? (
              <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn-primary" disabled={busy || !canNext} onClick={submit}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <>Create property <ArrowRight size={16} /></>}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-ink-500">
          By continuing you agree to HotelHub’s terms & privacy policy.
        </p>
      </main>
    </div>
  );
}
