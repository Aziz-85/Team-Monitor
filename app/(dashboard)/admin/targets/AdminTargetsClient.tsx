'use client';

import { useEffect, useState, useRef } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { SALES_TARGET_ROLE_LABELS, type SalesTargetRole } from '@/lib/sales-target-weights';
import { addMonths, getCurrentMonthKeyRiyadh } from '@/lib/time';

const ROLE_KEYS: SalesTargetRole[] = [
  'MANAGER',
  'ASSISTANT_MANAGER',
  'HIGH_JEWELLERY_EXPERT',
  'SENIOR_SALES_ADVISOR',
  'SALES_ADVISOR',
];

type EmployeeRow = {
  id: string;
  user: { id: string; empId: string; name: string; email: string | null };
  role: string;
  roleLabel: string;
  weight: number;
  active: boolean;
  scheduledDaysInMonth: number | null;
  leaveDaysInMonth: number | null;
  presentDaysInMonth: number | null;
  presenceFactor: number | null;
  effectiveWeightAtGeneration: number | null;
  distributionMethod: string | null;
  monthlyTarget: number;
  mtdSales: number;
  mtdPct: number;
  todaySales: number;
  todayTarget: number;
  todayPct: number | null;
  weekSales: number;
  weekTarget: number;
  weekPct: number;
  paceDailyRequiredSar: number;
  paceWeeklyRequiredSar: number;
  remainingMonthTargetSar: number;
};

type AdminTargetsData = {
  month: string;
  targetEditRequiresReason?: boolean;
  boutiqueTarget: { id: string; amount: number } | null;
  roleWeights?: Record<string, number>;
  employees: EmployeeRow[];
  todayStr: string;
  reconciliation?: {
    boutiqueTargetSar: number;
    employeesTotalSar: number;
    diffSar: number;
    status: 'BALANCED' | 'UNDER' | 'OVER';
  };
  warnings?: {
    sumWeights: number;
    sumWeightsZero: boolean;
    hasMissingRole: boolean;
    hasUnknownRole: boolean;
    zeroScheduledCount?: number;
    hasManyZeroScheduled?: boolean;
  };
};

type ImportResult = {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedRowCount?: number;
  skippedRowsCount?: number;
  unchangedCount?: number;
  skipped: Array<{ rowNumber: number; empId?: string; columnHeader?: string; reason: string }>;
  warnings?: Array<{ rowNumber: number; date?: string; message?: string; totalAfter?: number; sumEmployees?: number; delta?: number }>;
  ignoredColumns?: string[];
  importSummary?: {
    totalRowsRead: number;
    validRowsProcessed: number;
    rowsGenerated: number;
    newCount: number;
    updatedCount: number;
    identicalCount: number;
    lockedCount: number;
    errorCount: number;
    skippedEmptyRows: number;
    skippedSummaryRows: number;
    skippedNoNumericRows: number;
    skippedMonthFilteredRows: number;
    invalidDateRows: number;
    invalidSalesValues: number;
    totalSales: number;
    totalMismatchRowCount: number;
    dailyBreakdown: Array<{ dateKey: string; totalSar: number }>;
  } | null;
  employeeSummary?: {
    ranked: Array<{
      rank: number;
      employee: string;
      userId: string;
      totalSales: number;
      contributionPct: number;
    }>;
    perEmployeePerDay: Array<{ dateKey: string; employee: string; userId: string; sales: number }>;
  } | null;
  msrLayoutKind?: 'template_columns' | 'legacy_msr' | null;
};

export function AdminTargetsClient() {
  const { t } = useT();
  const [month, setMonth] = useState(() => getCurrentMonthKeyRiyadh());
  const [boutiqueAmount, setBoutiqueAmount] = useState('');
  const [data, setData] = useState<AdminTargetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBoutique, setSavingBoutique] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [regenerateModal, setRegenerateModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearingBoutique, setClearingBoutique] = useState(false);
  const [clearingSales, setClearingSales] = useState(false);
  const [showWeightHelp, setShowWeightHelp] = useState(false);
  const [editWeights, setEditWeights] = useState<Record<string, string>>({});
  const [savingWeights, setSavingWeights] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync editable weights from API when data loads (fallback to defaults if missing)
  const defaultWeights: Record<string, number> = {
    MANAGER: 0.5,
    ASSISTANT_MANAGER: 0.75,
    HIGH_JEWELLERY_EXPERT: 2.0,
    SENIOR_SALES_ADVISOR: 1.5,
    SALES_ADVISOR: 1.0,
  };
  useEffect(() => {
    const rw = data?.roleWeights;
    const next: Record<string, string> = {};
    for (const role of ROLE_KEYS) {
      const v = rw?.[role];
      next[role] =
        typeof v === 'number' && Number.isFinite(v) ? String(v) : String(defaultWeights[role] ?? '');
    }
    setEditWeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultWeights is stable
  }, [data?.roleWeights]);
  const [importMode, setImportMode] = useState<'simple' | 'msr' | 'msr-template'>('simple');
  const [importMonth, setImportMonth] = useState(() => getCurrentMonthKeyRiyadh());
  const [showImportDetails, setShowImportDetails] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [targetEditError, setTargetEditError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/targets?month=${month}`)
      .then((r) => r.json())
      .then((d: AdminTargetsData) => {
        setData(d);
        setBoutiqueAmount(d.boutiqueTarget != null ? String(d.boutiqueTarget.amount) : '');
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when month changes
  }, [month]);

  const saveBoutique = async () => {
    const amount = Math.round(Number(boutiqueAmount));
    if (amount < 0 || !Number.isFinite(amount)) return;
    setSavingBoutique(true);
    try {
      const res = await fetch('/api/admin/boutique-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, amount }),
      });
      if (res.ok) load();
    } finally {
      setSavingBoutique(false);
    }
  };

  const generateTargets = async (regenerate: boolean) => {
    setRegenerateModal(false);
    if (regenerate && reconciliation && reconciliation.diffSar !== 0) {
      const msg =
        reconciliation.diffSar > 0
          ? t('targets.regenerateWarningRemaining')
          : t('targets.regenerateWarningOver');
      if (!window.confirm(msg)) return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/generate-employee-targets?regenerate=${regenerate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (res.ok) load();
    } finally {
      setGenerating(false);
    }
  };

  const resetTargets = async () => {
    if (!window.confirm(t('targets.resetTargetsConfirmBody'))) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset-employee-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (res.ok) load();
    } finally {
      setResetting(false);
    }
  };

  const patchEmployeeTarget = async (id: string, amount: number, reason?: string) => {
    setTargetEditError(null);
    setSavingTargetId(id);
    try {
      const body: { id: string; amount: number; reason?: string } = { id, amount: Math.round(amount) };
      if (data?.targetEditRequiresReason && typeof reason === 'string') body.reason = reason.trim();
      const res = await fetch('/api/admin/employee-target', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingId(null);
        setEditAmount('');
        setEditReason('');
        load();
      } else {
        const msg = typeof json?.error === 'string' ? json.error : t('targets.saveTargetError');
        setTargetEditError(msg === 'Reason is required when editing targets after day 3' ? t('targets.reasonRequiredAfterDay3') : msg);
      }
    } finally {
      setSavingTargetId(null);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append('file', file);
    form.append('importMode', importMode);
    form.append('month', importMonth);
    try {
      const res = await fetch('/api/admin/sales-import', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setImportResult({
          importedCount: json.importedCount ?? 0,
          updatedCount: json.updatedCount ?? 0,
          skippedCount: json.skippedCount ?? 0,
          skippedRowCount: json.skippedRowCount ?? json.skippedRowsCount ?? 0,
          skippedRowsCount: json.skippedRowsCount ?? json.skippedRowCount ?? 0,
          unchangedCount: json.unchangedCount,
          skipped: json.skipped ?? [],
          warnings: json.warnings ?? [],
          ignoredColumns: json.ignoredColumns ?? [],
          importSummary: json.importSummary ?? null,
          employeeSummary: json.employeeSummary ?? null,
          msrLayoutKind: json.msrLayoutKind ?? null,
        });
        setShowImportDetails(true);
        load();
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatNum = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
  const formatPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');
  const warnings = data?.warnings;
  const reconciliation = data?.reconciliation;

  if (loading && !data) {
    return (
      <div className="p-4">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-xl font-semibold text-foreground">{t('targets.masterTitle')}</h1>

        {reconciliation && (
          <div className="sticky top-0 z-10 mb-4 rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-md bg-surface-subtle px-3 py-1">
                  <div className="text-xs text-muted">{t('targets.branchTarget')}</div>
                  <div className="text-sm font-semibold text-foreground">
                    {formatNum(reconciliation.boutiqueTargetSar)} {t('targets.sar')}
                  </div>
                </div>
                <div className="rounded-md bg-surface-subtle px-3 py-1">
                  <div className="text-xs text-muted">{t('targets.employeesTotal')}</div>
                  <div className="text-sm font-semibold text-foreground">
                    {formatNum(reconciliation.employeesTotalSar)} {t('targets.sar')}
                  </div>
                </div>
                <div
                  className={`rounded-md px-3 py-1 ${
                    reconciliation.diffSar === 0
                      ? 'bg-emerald-50'
                      : reconciliation.diffSar > 0
                      ? 'bg-amber-50'
                      : 'bg-red-50'
                  }`}
                >
                  <div className="text-xs text-muted">
                    {reconciliation.diffSar >= 0 ? t('targets.remaining') : t('targets.excess')}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {reconciliation.diffSar === 0
                      ? `${formatNum(0)} ${t('targets.sar')} (${t('targets.balanced')})`
                      : `${formatNum(Math.abs(reconciliation.diffSar))} ${t('targets.sar')}`}
                  </div>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  reconciliation.status === 'BALANCED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : reconciliation.status === 'UNDER'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {reconciliation.status === 'BALANCED'
                  ? t('targets.balanced')
                  : reconciliation.status === 'UNDER'
                  ? t('targets.remaining')
                  : t('targets.excess')}
              </span>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-foreground">{t('targets.month')}</label>
          <div className="inline-flex items-center rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className="rounded-s-lg px-3 py-2 text-sm text-muted hover:bg-surface-subtle"
              aria-label={t('common.prev')}
            >
              ◀
            </button>
            <span className="min-w-[7rem] px-3 py-2 text-center text-sm font-medium text-foreground">
              {month}
            </span>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="rounded-e-lg px-3 py-2 text-sm text-muted hover:bg-surface-subtle"
              aria-label={t('common.next')}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMonth(getCurrentMonthKeyRiyadh())}
            className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
          >
            {t('common.thisMonth')}
          </button>
        </div>

        <OpsCard title={t('targets.boutiqueTarget')} className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                data?.boutiqueTarget ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-subtle text-foreground'
              }`}
            >
              {data?.boutiqueTarget ? t('targets.boutiqueStatusSet') : t('targets.boutiqueStatusNotSet')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              value={boutiqueAmount}
              onChange={(e) => setBoutiqueAmount(e.target.value)}
              className="w-32 rounded border border-border px-3 py-2 text-sm"
              placeholder="0"
            />
            <span className="text-muted">{t('targets.sar')}</span>
            <button
              type="button"
              onClick={saveBoutique}
              disabled={savingBoutique}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {savingBoutique ? t('common.loading') : t('common.save')}
            </button>
            {data?.boutiqueTarget && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(t('targets.clearBoutiqueTargetConfirm'))) return;
                  setClearingBoutique(true);
                  try {
                    const res = await fetch(`/api/admin/boutique-target?month=${encodeURIComponent(month)}`, {
                      method: 'DELETE',
                    });
                    if (res.ok) load();
                  } finally {
                    setClearingBoutique(false);
                  }
                }}
                disabled={clearingBoutique}
                className="rounded border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {clearingBoutique ? t('common.loading') : t('targets.clearBoutiqueTarget')}
              </button>
            )}
          </div>
        </OpsCard>

        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowWeightHelp((v) => !v)}
            className="text-sm font-medium text-muted hover:text-foreground underline-offset-2 hover:underline"
            aria-expanded={showWeightHelp}
          >
            {showWeightHelp ? t('targets.hideWeightHelp') : t('targets.showWeightHelp')}
          </button>
          {showWeightHelp && (
            <OpsCard title={t('targets.weightedExplanation')} className="mt-2 border-accent/20 bg-accent/5">
              <p className="text-sm text-foreground">{t('targets.weightedLeaveAdjusted')}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 font-medium text-foreground">{t('targets.role')}</th>
                      <th className="p-2 font-medium text-foreground">{t('targets.weight')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_KEYS.map((role) => (
                      <tr key={role} className="border-b border-border">
                        <td className="p-2">{SALES_TARGET_ROLE_LABELS[role]}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            step={0.25}
                            value={editWeights[role] ?? ''}
                            onChange={(e) =>
                              setEditWeights((prev) => ({ ...prev, [role]: e.target.value }))
                            }
                            className="w-20 rounded border border-border px-2 py-1 text-sm"
                            aria-label={SALES_TARGET_ROLE_LABELS[role]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={async () => {
                    const weights: Record<string, number> = {};
                    for (const role of ROLE_KEYS) {
                      const v = Number(editWeights[role]);
                      if (Number.isFinite(v) && v >= 0) weights[role] = v;
                    }
                    if (Object.keys(weights).length === 0) return;
                    setSavingWeights(true);
                    try {
                      const res = await fetch('/api/admin/role-weights', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weights }),
                      });
                      if (res.ok) load();
                    } finally {
                      setSavingWeights(false);
                    }
                  }}
                  disabled={savingWeights}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {savingWeights ? t('common.loading') : t('targets.saveWeights')}
                </button>
              </div>
            </OpsCard>
          )}
        </div>

        {warnings && (warnings.sumWeightsZero || warnings.hasMissingRole || warnings.hasUnknownRole || warnings.hasManyZeroScheduled) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {warnings.sumWeightsZero && (
              <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {t('targets.warningSumWeightsZero')}
              </span>
            )}
            {warnings.hasMissingRole && (
              <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {t('targets.warningMissingRole')}
              </span>
            )}
            {warnings.hasUnknownRole && (
              <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {t('targets.warningUnknownRole')}
              </span>
            )}
            {warnings.hasManyZeroScheduled && (
              <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {t('targets.warningManyZeroScheduled')}
              </span>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => generateTargets(false)}
            disabled={generating || !data?.boutiqueTarget}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {generating ? t('common.loading') : t('targets.generateTargets')}
          </button>
          <button
            type="button"
            onClick={() => setRegenerateModal(true)}
            disabled={generating || !data?.boutiqueTarget}
            className="rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            {t('targets.recalculateUsingLeaves')}
          </button>
          <button
            type="button"
            onClick={resetTargets}
            disabled={resetting || generating}
            className="rounded border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {resetting ? t('common.loading') : t('targets.resetTargets')}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(t('targets.clearMonthSalesConfirm'))) return;
              setClearingSales(true);
              try {
                const res = await fetch('/api/admin/clear-sales-month', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ month }),
                });
                if (res.ok) load();
              } finally {
                setClearingSales(false);
              }
            }}
            disabled={clearingSales}
            className="rounded border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {clearingSales ? t('common.loading') : t('targets.clearMonthSales')}
          </button>
        </div>

        <OpsCard title={t('targets.importSales')} className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <fieldset className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'simple'}
                  onChange={() => setImportMode('simple')}
                  className="rounded border-border"
                />
                {t('targets.importSimple')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'msr'}
                  onChange={() => setImportMode('msr')}
                  className="rounded border-border"
                />
                {t('targets.importMsr')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'msr-template'}
                  onChange={() => setImportMode('msr-template')}
                  className="rounded border-border"
                />
                {t('targets.importMsrStrict')}
              </label>
            </fieldset>
            {(importMode === 'msr' || importMode === 'msr-template') && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">{t('targets.month')}</label>
                <input
                  type="month"
                  value={importMonth}
                  onChange={(e) => setImportMonth(e.target.value)}
                  className="rounded border border-border px-2 py-1 text-sm"
                />
                <span className="text-xs text-muted">{t('targets.importMsrMonthHint')}</span>
              </div>
            )}
            {(importMode === 'msr' || importMode === 'msr-template') && (
              <p className="mt-2 max-w-3xl text-xs text-muted">{t('targets.importMsrV2ColumnsHint')}</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            onChange={onFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {importing ? t('common.loading') : t('targets.uploadExcel')}
          </button>
        </OpsCard>

        {regenerateModal && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50"
              aria-hidden
              onClick={() => setRegenerateModal(false)}
            />
            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg">
              <h3 className="mb-2 text-lg font-semibold text-foreground">{t('targets.recalculateConfirmTitle')}</h3>
              <p className="mb-4 text-sm text-muted">{t('targets.recalculateConfirmBody')}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRegenerateModal(false)}
                  className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => generateTargets(true)}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  {t('targets.confirm')}
                </button>
              </div>
            </div>
          </>
        )}

        {importResult != null && (
          <div className="mb-4 rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground">
            {importResult.importSummary != null && importResult.msrLayoutKind === 'template_columns' ? (
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {t('targets.importV2ProcessedIntro')}{' '}
                  {importResult.importSummary.validRowsProcessed}{' '}
                  {t('targets.importV2ProcessedOutro')}
                </p>
                <p className="text-muted">
                  {t('targets.importV2New')}: {importResult.importedCount} · {t('targets.importV2Updated')}:{' '}
                  {importResult.updatedCount} · {t('targets.importV2Identical')}:{' '}
                  {importResult.importSummary.identicalCount} · {t('targets.importV2Locked')}:{' '}
                  {importResult.importSummary.lockedCount} · {t('targets.importV2Errors')}:{' '}
                  {importResult.importSummary.errorCount}
                </p>
                <p className="font-semibold text-foreground">
                  {t('targets.importV2TotalSalesLine')}: {formatNum(importResult.importSummary.totalSales)}{' '}
                  {t('targets.sar')}
                </p>
                {(importResult.importSummary.totalMismatchRowCount ?? 0) > 0 && (
                  <p className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900">
                    {t('targets.importV2TotalMismatch')}: {importResult.importSummary.totalMismatchRowCount}
                  </p>
                )}
              </div>
            ) : (
              <p>
                {t('targets.imported')}: {importResult.importedCount} · {t('targets.updated')}: {importResult.updatedCount}{' '}
                · {t('targets.skipped')}: {importResult.skippedCount}
                {(importResult.unchangedCount ?? 0) > 0 &&
                  ` · ${t('targets.importUnchanged')}: ${importResult.unchangedCount}`}
                {(importResult.skippedRowCount ?? importResult.skippedRowsCount ?? 0) > 0 &&
                  ` · ${t('targets.skippedRows')}: ${importResult.skippedRowCount ?? importResult.skippedRowsCount}`}
                {(importResult.warnings?.length ?? 0) > 0 && ` · ${t('targets.warnings')}: ${importResult.warnings!.length}`}
                {(importResult.ignoredColumns?.length ?? 0) > 0 &&
                  ` · ${t('targets.ignoredColumns')}: ${importResult.ignoredColumns!.length}`}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowImportDetails(!showImportDetails)}
              className="mt-1 text-accent hover:underline"
            >
              {showImportDetails ? t('common.close') : t('targets.showDetails')}
            </button>
            {showImportDetails && (
              <div className="mt-2 max-h-96 overflow-y-auto rounded border border-border bg-surface p-2 text-xs">
                {importResult.importSummary != null && importResult.msrLayoutKind === 'template_columns' && (
                  <div className="mb-2 border-b border-border pb-2">
                    <p className="font-medium text-foreground">{t('targets.importParseSummary')}</p>
                    <p className="text-muted">
                      {t('targets.importSummaryRowsRead')}: {importResult.importSummary.totalRowsRead} ·{' '}
                      {t('targets.importSummaryGenerated')}: {importResult.importSummary.rowsGenerated}.{' '}
                      {t('targets.importNoiseTitle')}: {t('targets.importNoiseEmpty')}{' '}
                      {importResult.importSummary.skippedEmptyRows}, {t('targets.importNoiseSummary')}{' '}
                      {importResult.importSummary.skippedSummaryRows}, {t('targets.importNoiseNoSales')}{' '}
                      {importResult.importSummary.skippedNoNumericRows}, {t('targets.importNoiseMonth')}{' '}
                      {importResult.importSummary.skippedMonthFilteredRows}. {t('targets.importSummaryInvalidDates')}:{' '}
                      {importResult.importSummary.invalidDateRows}. {t('targets.importSummaryInvalidSales')}:{' '}
                      {importResult.importSummary.invalidSalesValues}.
                    </p>
                    {(importResult.importSummary.dailyBreakdown?.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-foreground">{t('targets.importV2DailyTitle')}</p>
                        {importResult.importSummary.dailyBreakdown!.map((d) => (
                          <div key={d.dateKey} className="py-0.5 text-muted">
                            {d.dateKey} → {formatNum(d.totalSar)} {t('targets.sar')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {(importResult.employeeSummary?.ranked?.length ?? 0) > 0 && (
                  <div className="mb-2 border-b border-border pb-2">
                    <p className="font-medium text-foreground">{t('targets.importEmployeeRank')}</p>
                    {importResult.employeeSummary!.ranked.slice(0, 15).map((r) => (
                      <div key={r.userId} className="py-0.5 text-muted">
                        #{r.rank} {r.employee}: {formatNum(r.totalSales)} SAR ({r.contributionPct}%)
                      </div>
                    ))}
                  </div>
                )}
                {importResult.skipped.length > 0 && (
                  <p className="font-medium text-foreground">{t('targets.skipped')}:</p>
                )}
                {importResult.skipped.slice(0, 50).map((s, i) => (
                  <div key={i} className="py-0.5">
                    Row {s.rowNumber}
                    {s.empId != null && ` empId ${s.empId}`}
                    {s.columnHeader != null && ` col "${s.columnHeader}"`}: {s.reason}
                  </div>
                ))}
                {importResult.skipped.length > 50 && (
                  <p className="text-muted">… and {importResult.skipped.length - 50} more</p>
                )}
                {(importResult.ignoredColumns?.length ?? 0) > 0 && (
                  <>
                    <p className="mt-2 font-medium text-muted">{t('targets.ignoredColumns')}:</p>
                    <p className="py-0.5 text-muted">{importResult.ignoredColumns!.slice(0, 30).join(', ')}{importResult.ignoredColumns!.length > 30 ? '…' : ''}</p>
                  </>
                )}
                {(importResult.warnings?.length ?? 0) > 0 && (
                  <>
                    <p className="mt-2 font-medium text-amber-700">{t('targets.warnings')}:</p>
                    {importResult.warnings!.slice(0, 20).map((w, i) => (
                      <div key={i} className="py-0.5">
                        Row {w.rowNumber}{w.message != null ? `: ${w.message}` : w.date != null ? ` date ${w.date}: Total Sale After ${w.totalAfter}, sum employees ${w.sumEmployees}, delta ${w.delta}` : ''}
                      </div>
                    ))}
                    {importResult.warnings!.length > 20 && (
                      <p className="text-muted">… and {importResult.warnings!.length - 20} more</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <OpsCard title={t('targets.employeesTable')}>
          {!data?.employees?.length ? (
            <p className="text-muted">{t('targets.noEmployees')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 font-medium text-foreground">{t('targets.empId')}</th>
                    <th className="p-2 font-medium text-foreground">{t('common.name')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.role')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.weight')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.active')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.scheduledDays')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.leaveDays')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.presenceFactor')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.effectiveWeight')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.monthlyTarget')}</th>
                    <th className="p-2 font-medium text-foreground">MTD Sales</th>
                    <th className="p-2 font-medium text-foreground">MTD %</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.todaySales')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.todayTarget')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.paceDailyColumn')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.weekSales')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.weekTarget')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.paceWeeklyColumn')}</th>
                    <th className="p-2 font-medium text-foreground">{t('targets.remainingMonthColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((row) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="p-2 font-mono text-muted">{row.user.empId}</td>
                      <td className="p-2">{row.user.name}</td>
                      <td className="p-2">{row.roleLabel}</td>
                      <td className="p-2">{row.weight}</td>
                      <td className="p-2">{row.active ? t('targets.yes') : t('targets.no')}</td>
                      <td className="p-2">{row.scheduledDaysInMonth ?? '—'}</td>
                      <td className="p-2">{row.leaveDaysInMonth ?? '—'}</td>
                      <td className="p-2">{row.presenceFactor != null ? (row.presenceFactor * 100).toFixed(0) + '%' : '—'}</td>
                      <td className="p-2">{row.effectiveWeightAtGeneration ?? '—'}</td>
                      <td className="p-2">
                        {editingId === row.id ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const v = Math.round(Number(editAmount));
                                    const reason = data?.targetEditRequiresReason ? editReason.trim() : undefined;
                                    if (Number.isFinite(v) && v >= 0 && (!data?.targetEditRequiresReason || reason)) patchEmployeeTarget(row.id, v, reason);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingId(null);
                                    setEditAmount('');
                                    setEditReason('');
                                    setTargetEditError(null);
                                  }
                                }}
                                className="w-24 rounded border border-border px-2 py-1 text-sm"
                                autoFocus
                                disabled={savingTargetId === row.id}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const v = Math.round(Number(editAmount));
                                  const reason = data?.targetEditRequiresReason ? editReason.trim() : undefined;
                                  if (Number.isFinite(v) && v >= 0 && (!data?.targetEditRequiresReason || reason)) patchEmployeeTarget(row.id, v, reason);
                                }}
                                disabled={savingTargetId === row.id || (!!data?.targetEditRequiresReason && !editReason.trim())}
                                className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                              >
                                {savingTargetId === row.id ? t('common.loading') : t('common.save')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditAmount('');
                                  setEditReason('');
                                  setTargetEditError(null);
                                }}
                                className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-subtle"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                            {data?.targetEditRequiresReason && (
                              <input
                                type="text"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                placeholder={t('targets.editReasonPlaceholder')}
                                className="w-full max-w-xs rounded border border-border px-2 py-1 text-sm placeholder:text-muted"
                                disabled={savingTargetId === row.id}
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditAmount(String(row.monthlyTarget));
                              setEditReason('');
                              setTargetEditError(null);
                            }}
                            className="text-start underline hover:no-underline"
                          >
                            {formatNum(row.monthlyTarget)}
                          </button>
                        )}
                        {targetEditError != null && editingId === row.id && (
                          <p className="mt-1 text-xs text-red-600">{targetEditError}</p>
                        )}
                      </td>
                      <td className="p-2">{formatNum(row.mtdSales)}</td>
                      <td className="p-2">{formatPct(row.mtdPct)}</td>
                      <td className="p-2">{formatNum(row.todaySales)}</td>
                      <td className="p-2">{formatNum(row.todayTarget)}</td>
                      <td className="p-2">{formatNum(row.paceDailyRequiredSar)}</td>
                      <td className="p-2">{formatNum(row.weekSales)}</td>
                      <td className="p-2">{formatNum(row.weekTarget)}</td>
                      <td className="p-2">{formatNum(row.paceWeeklyRequiredSar)}</td>
                      <td className="p-2">{formatNum(row.remainingMonthTargetSar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpsCard>
      </div>
    </div>
  );
}
