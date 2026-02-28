'use client';

import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';

const IMPORT_CARDS: { href: string; title: string; description: string }[] = [
  { href: '/admin/import/sales', title: 'Sales Imports', description: 'Preview and apply sales data (simple or MSR sheet).' },
  { href: '/admin/import/monthly-snapshot', title: 'Targets / Month Snapshot', description: 'Upload monthly snapshot for targets and staff data.' },
  { href: '/admin/import/historical', title: 'Historical Import', description: 'Import historical daily and staff sales by month.' },
  { href: '/admin/import/issues', title: 'Import Issues', description: 'View and resolve import validation errors.' },
  { href: '/admin/import/monthly-matrix', title: 'Monthly Matrix', description: 'Upload .xlsx DATA_MATRIX (ScopeId, Date, employee columns).' },
];

export function AdminImportClient() {
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Import Dashboard</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IMPORT_CARDS.map((card) => (
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
