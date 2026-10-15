'use client';

import clsx from 'clsx';

export default function Logo({ className = '', size = 26, light = false, markOnly = false }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5 select-none', className)}>
      <span
        className="relative grid place-items-center rounded-[10px] gradient-brand shadow-glow"
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <path d="M4 20V7.5L12 3l8 4.5V20" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 20v-5.5h6V20" stroke="white" strokeWidth="2.1" strokeLinejoin="round" />
          <circle cx="12" cy="9.5" r="1.6" fill="white" />
        </svg>
      </span>
      {!markOnly && (
        <span className={clsx('font-display text-[19px] font-bold tracking-tight', light ? 'text-white' : 'text-ink-900 dark:text-white')}>
          Hotel<span className="text-brand-500">Hub</span>
        </span>
      )}
    </span>
  );
}
