'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  X,
  LogOut,
  ChevronDown,
  Bell,
  Moon,
  Sun,
  MessageCircleQuestion,
  Menu,
} from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { NAV_GROUPS, SUPER_NAV } from '@/lib/nav';
import { Avatar } from '@/components/ui/kit';
import { useFetch } from '@/lib/hooks';
import { relative } from '@/lib/format';
import AIAssistant from './AIAssistant';

function NavList({ groups, onNavigate }) {
  const pathname = usePathname();
  const { modules } = useAuth();
  const has = (m) => !m || m === 'dashboard' || m === 'notifications' || !modules?.length || modules.includes(m);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2 no-scrollbar">
      {groups.map((g) => {
        const items = g.items.filter((i) => has(i.module));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <p className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-500">{g.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={clsx('nav-link', active && 'nav-link-active')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={17} className="shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }) {
  const { user, isSuper } = useAuth();
  const groups = isSuper
    ? [{ label: 'Platform', items: SUPER_NAV.map((i) => ({ ...i, module: null })) }]
    : NAV_GROUPS;

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href={isSuper ? '/superadmin' : '/dashboard'}>
          <Logo light />
        </Link>
        <button onClick={onNavigate} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 lg:hidden" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <NavList groups={groups} onNavigate={onNavigate} />
      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[11.5px] text-ink-400">
              {isSuper ? 'Platform Admin' : user?.hotel_name || 'Hotel'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout, isSuper } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: notif } = useFetch('/notifications?limit=1&unreadOnly=1');
  const unread = notif?.total || 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-soft transition hover:bg-ink-50"
      >
        <Avatar name={user?.name} size={30} />
        <span className="hidden text-[13px] font-semibold text-ink-700 sm:block">{user?.name?.split(' ')[0]}</span>
        <ChevronDown size={14} className="text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 animate-scale-in rounded-2xl border border-ink-100 bg-white p-1.5 shadow-card">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-ink-900">{user?.name}</p>
              <p className="truncate text-xs text-ink-500">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-ink-100" />
            <button
              onClick={() => {
                setOpen(false);
                router.push(isSuper ? '/superadmin' : '/dashboard/settings');
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
            >
              <Bell size={15} /> Notifications
              {unread > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AppShell({ children, title, subtitle, actions }) {
  const { user, isSuper } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const pathname = usePathname();

  const headerTitle = title || user?.hotel_name || (isSuper ? 'Platform Console' : 'Dashboard');
  const headerSubtitle =
    subtitle ||
    (!isSuper
      ? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : 'Multi-tenant operations');


  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const saved = localStorage.getItem('hms-theme') === 'dark';
    setDark(saved);
    document.documentElement.classList.toggle('dark', saved);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('hms-theme', next ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] lg:block">
        <SidebarContent />
      </aside>

      {/* mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-fade-in shadow-card">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-ink-100/80 bg-white/85 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-900/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              className="rounded-xl p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-bold tracking-tight text-ink-900 dark:text-white">{headerTitle}</h1>
              {headerSubtitle && <p className="truncate text-[12.5px] text-ink-500">{headerSubtitle}</p>}
            </div>
            <button
              onClick={toggleDark}
              className="hidden rounded-xl p-2.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 sm:block dark:hover:bg-ink-800"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {actions}
            <UserMenu />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <AIAssistant />
    </div>
  );
}

export { SidebarContent };
