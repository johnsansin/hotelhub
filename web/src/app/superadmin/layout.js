'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/admin/AppShell';
import { PageLoader } from '@/components/ui/kit';

export default function SuperadminLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'superadmin') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'superadmin') {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-50">
        <PageLoader label="Checking permissions…" />
      </div>
    );
  }

  return <AppShell title="Platform Console">{children}</AppShell>;
}
