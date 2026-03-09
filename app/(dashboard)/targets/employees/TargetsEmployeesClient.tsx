'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar } from '@/components/ui/FilterBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';

type Boutique = { id: string; code: string; name: string };
type Row = {
  id: string;
  month: string;
  amount: number;
  source: string | null;
  notes: string | null;
  boutique: Boutique;
  user: { id: string; empId: string; employee: { name: string } | null };
};

export function TargetsEmployeesClient() {
  const { t } = useT();
  const [scope, setScope] = useState<{ boutiques: Boutique[] } | null>(null);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/targets/scope', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.boutiques) {
          setScope({ boutiques: data.boutiques });
          if (data.boutiques.length > 0 && !boutiqueId) setBoutiqueId(data.boutiques[0].id);
        }
      })
      .catch(() => {});
  }, [boutiqueId]);

  const load = useCallback(() => {
    if (!year && !month) return;
    setLoading(true);
    const params = new URLSearchParams();
    const y = year || String(new Date().getFullYear());
    if (year && month) params.set('month', `${y}-${month}`);
    else if (year) params.set('year', year);
    else if (month) params.set('month', `${y}-${month}`);
    if (boutiqueId) params.set('boutiqueId', boutiqueId);
    fetch(`/api/targets/employees?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [year, month, boutiqueId]);

  useEffect(() => {
    if (year || month) load();
    else setRows([]);
  }, [year, month, boutiqueId, load]);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const boutiqueOptions = (scope?.boutiques ?? []).map((b) => ({
    value: b.id,
    label: `${b.name} (${b.code})`,
  }));

  const summaryLine =
    year || month || boutiqueId
      ? `Viewing ${scope?.boutiques?.find((b) => b.id === boutiqueId)?.name ?? '—'} • ${year || '—'} ${month || '—'}`
      : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/targets" className="text-sm text-muted hover:text-foreground">
          ← {t('targetsManagement.title')}
        </Link>
      </div>
      <PageHeader
        title={t('targetsManagement.employeeTargets')}
        subtitle={t('targetsManagement.month')}
      />
      <FilterBar summaryLine={summaryLine}>
        <Select
          label={t('targetsManagement.year')}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          options={[{ value: '', label: '—' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          className="min-w-[6rem]"
        />
        <Select
          label={t('targetsManagement.month')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          options={[
            { value: '', label: '—' },
            ...Array.from({ length: 12 }, (_, i) => {
              const m = String(i + 1).padStart(2, '0');
              return { value: m, label: m };
            }),
          ]}
          className="min-w-[5rem]"
        />
        {scope && scope.boutiques.length > 1 && (
          <Select
            label={t('targetsManagement.boutique')}
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            options={[{ value: '', label: '—' }, ...boutiqueOptions]}
            className="min-w-[10rem]"
          />
        )}
        <Button variant="primary" onClick={load} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </Button>
      </FilterBar>

      {rows.length === 0 && !loading && (year || month) && (
        <EmptyState title={t('targetsManagement.noData')} />
      )}
      {rows.length > 0 && (
        <DataTable variant="luxury" zebra>
          <DataTableHead>
            <DataTableTh>{t('targetsManagement.month')}</DataTableTh>
            <DataTableTh>{t('targetsManagement.boutique')}</DataTableTh>
            <DataTableTh>{t('targetsManagement.employee')}</DataTableTh>
            <DataTableTh className="text-end">{t('targetsManagement.target')}</DataTableTh>
            <DataTableTh>{t('targetsManagement.source')}</DataTableTh>
          </DataTableHead>
          <DataTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <DataTableTd>{r.month}</DataTableTd>
                <DataTableTd>{r.boutique.name} ({r.boutique.code})</DataTableTd>
                <DataTableTd>{r.user.employee?.name ?? r.user.empId}</DataTableTd>
                <DataTableTd className="text-end">{r.amount.toLocaleString()}</DataTableTd>
                <DataTableTd>{r.source ?? '—'}</DataTableTd>
              </tr>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
