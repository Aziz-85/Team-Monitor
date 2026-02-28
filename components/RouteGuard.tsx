'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { canAccessRoute } from '@/lib/permissions';
import type { Role } from '@prisma/client';

export function RouteGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (canAccessRoute(role, pathname)) return;
    if (role === 'EMPLOYEE' || role === 'ASSISTANT_MANAGER') {
      window.location.replace('/employee');
    } else {
      window.location.replace('/');
    }
  }, [role, pathname]);

  return <>{children}</>;
}
