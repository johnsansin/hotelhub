'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import Logo from '@/components/Logo';

const LINKS = [
  { href: '/hotels', label: 'Find a stay' },
  { href: '/#platform', label: 'Platform' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/manage', label: 'Manage booking' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/">
          <Logo light />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                'rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition',
                pathname === l.href ? 'text-white' : 'text-ink-300 hover:text-white'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <Link href="/login" className="btn-ghost btn-sm !text-ink-200 hover:!bg-white/10">
            Sign in
          </Link>
          <Link href="/register" className="btn-primary btn-sm">
            Start free trial
          </Link>
        </div>

        <button className="rounded-lg p-2 text-white md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-white/10 bg-ink-950 px-5 py-4 md:hidden">
          <nav className="space-y-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-200 hover:bg-white/5"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            <Link href="/login" className="btn-secondary btn-sm flex-1" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/register" className="btn-primary btn-sm flex-1" onClick={() => setOpen(false)}>
              Free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
