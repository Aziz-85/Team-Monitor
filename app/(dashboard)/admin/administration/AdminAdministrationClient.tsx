'use client';

import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';

const ADMINISTRATION_CARDS: { href: string; title: string; description: string }[] = [
  { href: '/admin/administration/users', title: 'Users & Roles', description: 'Manage users and role assignments.' },
  { href: '/admin/administration/access', title: 'Permissions / Access', description: 'Manage memberships and access control.' },
  { href: '/admin/administration/audit', title: 'Audit Logs', description: 'View login and system audit logs.' },
  { href: '/admin/administration/settings', title: 'System Settings', description: 'Configure system and boutique settings.' },
  { href: '/admin/administration/version', title: 'Version / Build', description: 'View version, deploys and build info.' },
];

export function AdminAdministrationClient() {
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Administration Dashboard</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMINISTRATION_CARDS.map((card) => (
            <Link key={card.href} href={card.href}>
              <OpsCard className="h-full transition-colors hover:bg-slate-50">
                <h3 className="mb-1 text-sm font-medium text-slate-900">{card.title}</h3>
                <p className="text-xs text-slate-600">{card.description}</p>
              </OpsCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
