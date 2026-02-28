'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Stats = {
  byEmployee: Array<{ empId: string; name: string; completed: number }>;
  totalCompleted: number;
};

export function InventoryHistoryClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
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
        <Link href="/inventory/daily" className="mb-4 inline-block text-base text-sky-600 hover:underline">
          ← {t('common.back')}
        </Link>
        <OpsCard title={t('inventory.historyTitle')}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">{t('inventory.month')}</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
            />
            <button
              type="button"
              onClick={handleRebalance}
              disabled={rebalancing}
              className="h-9 rounded-lg bg-slate-600 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10"
            >
              {rebalancing ? '…' : t('inventory.rebalance')}
            </button>
          </div>
          {stats && (
            <>
              <p className="mb-3 text-sm font-semibold text-slate-900">
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
