'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { ImportSalesPanel } from '@/components/admin/import/ImportSalesPanel';
import { MonthlyImportMatrixPanel } from '@/components/admin/import/MonthlyImportMatrixPanel';
import { ImportIssuesPanel } from '@/components/admin/import/ImportIssuesPanel';
import { DailySalesLedgerPanel } from '@/components/admin/import/DailySalesLedgerPanel';
import { MonthlyMatrixPanel } from '@/components/admin/import/MonthlyMatrixPanel';

const SECTIONS = [
  { id: 'import', label: 'Import Sales' },
  { id: 'matrix', label: 'Monthly Import (Matrix)' },
  { id: 'issues', label: 'Import Issues' },
  { id: 'ledger', label: 'Daily Sales Ledger' },
  { id: 'monthly', label: 'Monthly Matrix' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const VALID_SECTIONS: SectionId[] = ['import', 'matrix', 'issues', 'ledger', 'monthly'];

function parseSection(value: string | null): SectionId {
  if (value && VALID_SECTIONS.includes(value as SectionId)) return value as SectionId;
  return 'import';
}

export function SalesImportTabsClient({ canResolve }: { canResolve: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = parseSection(searchParams.get('section'));

  const setSection = (next: SectionId) => {
    router.replace(`/admin/import/sales?section=${next}`, { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Internal sidebar */}
      <aside className="w-full border-b border-slate-200 bg-slate-50 md:w-52 md:flex-shrink-0 md:border-b-0 md:border-r md:border-slate-200">
        <nav className="p-2 md:p-3">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'border-l-4 border-l-sky-500 bg-slate-100 font-medium text-slate-900'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Content panel */}
      <main className="min-w-0 flex-1">
        <div className="p-4 md:p-6">
          <p className="mb-1 text-sm text-slate-600">Import &gt; Sales</p>
          <h1 className="mb-4 text-xl font-semibold text-slate-900">Sales Import</h1>

          <div className="min-h-0">
            {section === 'import' && <ImportSalesPanel />}
            {section === 'matrix' && <MonthlyImportMatrixPanel />}
            {section === 'issues' && <ImportIssuesPanel canResolve={canResolve} />}
            {section === 'ledger' && <DailySalesLedgerPanel />}
            {section === 'monthly' && <MonthlyMatrixPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
