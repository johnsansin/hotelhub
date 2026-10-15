import Link from 'next/link';
import Logo from '@/components/Logo';

const COLS = [
  {
    title: 'Platform',
    links: [
      ['Hotel PMS', '/#platform'],
      ['Restaurant & POS', '/#platform'],
      ['Inventory & Purchases', '/#platform'],
      ['Accounts & Reports', '/#platform'],
      ['AI Concierge', '/#platform'],
    ],
  },
  {
    title: 'Guests',
    links: [
      ['Find a stay', '/hotels'],
      ['Manage booking', '/manage'],
      ['Pricing', '/pricing'],
      ['Sign in', '/login'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Start free trial', '/register'],
      ['List your property', '/register'],
      ['Contact sales', '/register'],
      ['Support', '/login'],
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-ink-400">
            The all-in-one hospitality operating system — bookings to ledgers — for independent hotels and
            growing chains.
          </p>
          <div className="mt-5 flex gap-2">
            {['Twitter', 'LinkedIn', 'Instagram'].map((s) => (
              <span key={s} className="chip bg-white/5 text-ink-400 hover:text-white">
                {s}
              </span>
            ))}
          </div>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-ink-500">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-[13.5px] text-ink-300 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-[12.5px] text-ink-500 sm:flex-row">
          <p>© {new Date().getFullYear()} HotelHub Technologies. All rights reserved.</p>
          <p>Built for hospitality · Privacy · Terms</p>
        </div>
      </div>
    </footer>
  );
}
