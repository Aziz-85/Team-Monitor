'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useT } from '@/lib/i18n/useT';
import { getRiyadhMonthKey } from '@/lib/dates/riyadhDate';

type Stats = {
  byEmployee: Array<{ empId: string; name: string; completed: number }>;
  totalCompleted: number;
};

export function InventoryHistoryClient() {
  const { t } = useT();
  const [month, setMonth] = useState(() => getRiyadhMonthKey());
  const [stats, setStats] = useState<Stats | null>(null);
  const [rebalancing, setRebalancing] = useState(false);

  useEffect(() => {
    fetch(`/api/inventory/daily/stats?month=${month}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, [month]);

  const handleRebalance = async () => {
    setRebalancing(true);
    try {
      const res = await fetch('/api/inventory/daily/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (res.ok) setStats(null);
    } finally {
      setRebalancing(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/inventory/daily" className="mb-4 inline-block text-base text-accent hover:underline">
          ← {t('common.back')}
        </Link>
        <OpsCard title={t('inventory.historyTitle')}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-foreground">{t('inventory.month')}</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent md:h-10"
            />
            <button
              type="button"
              onClick={handleRebalance}
              disabled={rebalancing}
              className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 md:h-10"
            >
              {rebalancing ? '…' : t('inventory.rebalance')}
            </button>
          </div>
          {stats && (
            <>
              <p className="mb-3 text-sm font-semibold text-foreground">
                {t('inventory.totalCompleted')}: {stats.totalCompleted}
              </p>
              <LuxuryTable>
                <LuxuryTableHead>
                  <tr>
                    <LuxuryTh>{t('common.name')}</LuxuryTh>
                    <LuxuryTh>{t('inventory.completedCount')}</LuxuryTh>
                  </tr>
                </LuxuryTableHead>
                <LuxuryTableBody>
                  {stats.byEmployee.map((row) => (
                    <tr key={row.empId}>
                      <LuxuryTd>{row.name}</LuxuryTd>
                      <LuxuryTd>{row.completed}</LuxuryTd>
                    </tr>
                  ))}
                </LuxuryTableBody>
              </LuxuryTable>
            </>
          )}
        </OpsCard>
      </div>
    </div>
  );
}
