'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';
import { getWeekStartSaturday, getWeekNumber, getWeekEndFriday } from '@/lib/utils/week';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

/** Week start = Saturday (local). Returns YYYY-MM-DD of the Saturday that starts the week containing the given date */
function weekStartFor(date: Date): string {
  const start = getWeekStartSaturday(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** From weekStart (YYYY-MM-DD Saturday) return period key e.g. 2026-W06 */
function periodKeyFromWeekStart(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00Z');
  const w = getWeekNumber(d);
  const y = d.getFullYear();
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/** From weekStart return week range string e.g. 2026-02-07 – 2026-02-13 */
function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = getWeekEndFriday(start);
  const endStr = end.toISOString().slice(0, 10);
  return `${weekStart} – ${endStr}`;
}

type WeeklyRunItem = {
  id: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  status: string;
  effectiveStatus?: string;
  completedAt: string | null;
};

type ByEmployee = {
  empId: string;
  employeeName: string;
  zones: WeeklyRunItem[];
};

type WeeklyData = {
  weekStart: string;
  byEmployee: ByEmployee[];
  myZones: WeeklyRunItem[];
  isManagerOrAdmin: boolean;
};

export function InventoryWeeklyClient({
  embedded,
  mapImageKey,
}: { embedded?: boolean; mapImageKey?: number } = {}) {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const mapSrc = mapImageKey != null
    ? `/zones/dhahran-zones-map.png?t=${mapImageKey}`
    : '/zones/dhahran-zones-map.png';
  const [mapImageError, setMapImageError] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    return weekStartFor(d);
  });
  const [data, setData] = useState<WeeklyData | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [completingAll, setCompletingAll] = useState(false);
  const [confirmMarkAllOpen, setConfirmMarkAllOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsInfo, setToastIsInfo] = useState(false);
  const myZonesSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMapImageError(false);
  }, [mapImageKey]);

  useEffect(() => {
    fetch(`/api/inventory/zones/weekly?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [weekStart]);

  const handleMarkComplete = async (zoneId: string) => {
    setCompleting(zoneId);
    try {
      const res = await fetch('/api/inventory/zones/weekly/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, zoneId }),
      });
      if (res.ok) {
        const next = await fetch(`/api/inventory/zones/weekly?weekStart=${weekStart}`, { cache: 'no-store' }).then((r) => r.json());
        setData(next);
      }
    } finally {
      setCompleting(null);
    }
  };

  const handleConfirmMarkAll = async () => {
    setCompletingAll(true);
    try {
      const res = await fetch('/api/inventory/zones/weekly/complete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const json = await res.json().catch(() => ({}));
      setConfirmMarkAllOpen(false);
      if (res.ok && json.updatedCount != null) {
        const refetchWeek = json.weekStartNormalized ?? weekStart;
        const next = await fetch(`/api/inventory/zones/weekly?weekStart=${refetchWeek}`, { cache: 'no-store' }).then((r) => r.json());
        setData(next);
        let msg: string;
        if (json.updatedCount > 0) {
          msg = (t('inventory.completedZonesToast') as string).replace('{count}', String(json.updatedCount));
        } else if (json.message === 'No zones assigned') {
          msg = t('inventory.noZonesAssigned');
        } else if (json.message === 'All already completed') {
          msg = t('inventory.allZonesAlreadyCompleted');
        } else {
          msg = json.message ?? '';
        }
        if (msg) {
          setToastMessage(msg);
          setToastIsInfo(json.updatedCount === 0);
          setTimeout(() => {
            setToastMessage(null);
            setToastIsInfo(false);
          }, 4000);
        }
      }
    } finally {
      setCompletingAll(false);
    }
  };

  const myZones = data?.myZones ?? [];
  const byEmployee = data?.byEmployee ?? [];
  const isManagerOrAdmin = data?.isManagerOrAdmin ?? false;

  const myCompleted = myZones.filter((z) => z.status === 'COMPLETED').length;
  const myTotal = myZones.length;
  const pendingCount = myZones.filter((z) => z.status !== 'COMPLETED').length;
  const showMarkAllButton = myZones.length > 0;
  const markAllEnabled = pendingCount > 0;

  const allZones = byEmployee.flatMap((e) => e.zones);
  const allCompleted = allZones.filter((z) => z.status === 'COMPLETED').length;
  const allTotal = allZones.length;

  const eff = (z: WeeklyRunItem) => z.effectiveStatus ?? z.status;
  const renderZoneRow = (z: WeeklyRunItem) => (
    <li
      key={z.id}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
    >
      <span className="text-lg font-semibold text-slate-900">{z.zoneCode}</span>
      {z.zoneName && <span className="text-sm text-slate-600">({z.zoneName})</span>}
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
          eff(z) === 'COMPLETED'
            ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
            : eff(z) === 'LATE'
              ? 'border-red-200 bg-red-100 text-red-900'
              : 'border-slate-200 bg-slate-100 text-slate-700'
        }`}
      >
        {eff(z) === 'COMPLETED' ? t('inventory.completed') : eff(z) === 'LATE' ? t('inventory.late') : t('inventory.planned')}
      </span>
      {z.status !== 'COMPLETED' && (
        <button
          type="button"
          onClick={() => handleMarkComplete(z.zoneId)}
          disabled={completing === z.zoneId}
          className="ml-auto h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {completing === z.zoneId ? '…' : t('inventory.markZoneCompleted')}
        </button>
      )}
    </li>
  );

  const copyWeeklyReminder = (pendingCodes: string[]) => {
    const text = `Reminder: Weekly inventory zones pending: ${pendingCodes.join(', ')}.`;
    navigator.clipboard.writeText(text).then(() => {}, () => {});
  };

  const periodKey = periodKeyFromWeekStart(weekStart);
  const weekRange = weekRangeLabel(weekStart);
  const myZoneLetter = myZones.length > 0 ? myZones[0].zoneCode : null;
  const hasAnyRecords = allZones.length > 0;

  return (
    <div className={embedded ? '' : 'p-4 md:p-6'}>
      <div className="mx-auto max-w-3xl">
        {!embedded && (
          <Link href="/inventory/daily" className="mb-4 inline-block text-base text-sky-600 hover:underline">
            ← {t('common.back')}
          </Link>
        )}

        {/* Static Zones Map - visible to all users */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            {t('inventory.zonesMapSectionTitle')}
          </h2>
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-lg bg-slate-100">
            <div className="relative aspect-[4/3] w-full">
              {mapImageError ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-200/80 p-6 text-center text-slate-600">
                  <span className="text-sm font-medium">{t('inventory.zonesMapNoImage')}</span>
                </div>
              ) : (
                <Image
                  src={mapSrc}
                  alt={t('inventory.zonesMapSectionTitle')}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 672px"
                  onError={() => setMapImageError(true)}
                />
              )}
            </div>
          </div>
        </section>

        {/* My Zone card */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {t('inventory.myZoneCardTitle')}
          </h3>
          {myZoneLetter ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border-2 border-blue-500 bg-blue-50 px-3 py-1.5 text-lg font-bold text-blue-900">
                {myZoneLetter}
              </span>
              <span className="text-sm text-slate-600">{periodKey}</span>
              <button
                type="button"
                onClick={() => myZonesSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('inventory.goToMyZoneInventory')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{t('inventory.noZoneAssignmentMessage')}</p>
          )}
        </section>

        <OpsCard title={t('inventory.weekly')}>
          {!hasAnyRecords && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">{t('inventory.noRecordsThisWeek')}</p>
              <p className="mt-2 text-amber-800">{t('inventory.stepsToGenerate')}</p>
            </div>
          )}
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">{t('inventory.weekStart')}</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
            />
          </div>
          {isManagerOrAdmin && (
            <p className="mb-4 font-mono text-xs text-slate-500" aria-hidden>
              {(t('inventory.periodKeyWeekRangeDebug') as string)
                .replace('{key}', periodKey)
                .replace('{range}', weekRange)
                .replace('{count}', String(allZones.length))}
            </p>
          )}

          {/* Employee: My zones this week first */}
          {myZones.length > 0 && (
            <div ref={myZonesSectionRef} id="my-zones" className="mb-6">
              <h3 className="mb-2 text-base font-semibold text-slate-800">{t('inventory.myZonesThisWeek')}</h3>
              {toastMessage && (
                <p
                  className={`mb-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${toastIsInfo ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-emerald-200 bg-emerald-100 text-emerald-900'}`}
                  role="status"
                >
                  {toastMessage}
                </p>
              )}
              <p className="mb-2 text-sm text-slate-600">
                {t('inventory.summaryCompletedTotal')}: {myCompleted} / {myTotal}
              </p>
              {pendingCount > 0 && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => copyWeeklyReminder(myZones.filter((z) => z.status !== 'COMPLETED').map((z) => z.zoneCode))}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {t('inventory.copyReminder')}
                  </button>
                </div>
              )}
              {showMarkAllButton && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => markAllEnabled && setConfirmMarkAllOpen(true)}
                    disabled={!markAllEnabled || completingAll}
                    className={`h-9 rounded-lg px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10 ${markAllEnabled ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50' : 'cursor-default bg-slate-200 text-slate-500'}`}
                  >
                    {completingAll
                      ? '…'
                      : markAllEnabled
                        ? t('inventory.markAllMyZonesCompleted')
                        : t('inventory.allZonesAlreadyCompleted')}
                  </button>
                </div>
              )}
              <ul className="space-y-3">
                {myZones.map((z) => renderZoneRow(z))}
              </ul>
            </div>
          )}

          {/* Confirm Mark All modal */}
          {confirmMarkAllOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50"
                aria-hidden
                onClick={() => !completingAll && setConfirmMarkAllOpen(false)}
              />
              <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
                <h4 className="text-lg font-semibold text-slate-900">{t('inventory.confirmMarkAllTitle')}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {(t('inventory.confirmMarkAllBody') as string).replace('{count}', String(pendingCount))}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => !completingAll && setConfirmMarkAllOpen(false)}
                    disabled={completingAll}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmMarkAll}
                    disabled={completingAll}
                    className="h-9 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {completingAll ? '…' : t('inventory.confirmMarkAllContinue')}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Manager: Zones by employee */}
          {isManagerOrAdmin && byEmployee.length > 0 && (
            <div>
              <h3 className="mb-2 text-base font-semibold text-slate-800">{t('inventory.zonesByEmployee')}</h3>
              <p className="mb-3 text-sm text-slate-600">
                {t('inventory.summaryCompletedTotal')}: {allCompleted} / {allTotal}
              </p>
              <div className="space-y-4">
                {byEmployee.map((emp) => {
                  const pendingZones = emp.zones.filter((z) => z.status !== 'COMPLETED');
                  const pendingCodes = pendingZones.map((z) => z.zoneCode);
                  return (
                    <div key={emp.empId}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium text-slate-700">{emp.employeeName}</h4>
                        {pendingCodes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => copyWeeklyReminder(pendingCodes)}
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          >
                            {t('inventory.copyReminder')}
                          </button>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {emp.zones.map((z) => renderZoneRow(z))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Employee with no zones */}
          {!isManagerOrAdmin && myZones.length === 0 && (
            <p className="text-slate-600">{t('inventory.noZonesAssigned')}</p>
          )}
        </OpsCard>
      </div>
    </div>
  );
}
