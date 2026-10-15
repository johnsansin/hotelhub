'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, homeFor } from '@/lib/auth';
import AppShell from '@/components/admin/AppShell';
import { PageLoader } from '@/components/ui/kit';

export default function DashboardLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role === 'superadmin') router.replace('/superadmin');
  }, [user, loading, router]);

  if (loading || !user || user.role === 'superadmin') {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-50">
        <PageLoader label="Preparing your workspace…" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
