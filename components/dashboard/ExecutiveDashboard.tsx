'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import type { Role } from '@prisma/client';
import type { EmployeePosition } from '@prisma/client';
import { SalesPerformanceCard } from './cards/SalesPerformanceCard';
import { ScheduleHealthCard } from './cards/ScheduleHealthCard';
import { TaskControlCard } from './cards/TaskControlCard';
import { ControlAlertsCard } from './cards/ControlAlertsCard';
import { SalesBreakdownSection } from './sections/SalesBreakdownSection';
import { ScheduleOverviewSection } from './sections/ScheduleOverviewSection';
import { TaskIntegritySection } from './sections/TaskIntegritySection';
import { TeamTableSection } from './sections/TeamTableSection';
import { PageHeader } from '@/components/ui/PageHeader';

type DashboardData = {
  rbac: {
    role: string;
    showAntiGaming: boolean;
    showPlannerSync: boolean;
    showFullDashboard: boolean;
  };
  snapshot?: {
    sales?: {
      currentMonthTarget: number;
      currentMonthActual: number;
      completionPct: number;
      remainingGap: number;
    };
    scheduleHealth?: {
      weekApproved: boolean;
      todayAmCount: number;
      todayPmCount: number;
      coverageViolationsCount: number;
    };
    taskControl?: {
      totalWeekly: number;
      completed: number;
      pending: number;
      overdue: number;
      zoneStatusSummary: string;
    };
    controlAlerts?: {
      suspiciousCount: number;
      leaveConflictsCount: number;
      unapprovedWeekWarning: boolean;
      lastPlannerSync: string | null;
    };
  };
  salesBreakdown?: { empId?: string; name: string; target: number; actual: number; pct: number }[];
  scheduleOverview?: {
    amPmBalanceSummary: string;
    daysOverloaded: string[];
    imbalanceHighlight: boolean;
  };
  taskIntegrity?: {
    burstFlagsCount: number;
    sameDayBulkCount: number;
    top3SuspiciousUsers: string[];
  };
  teamTable?: {
    rows: {
      empId?: string;
      employee: string;
      role: string;
      position?: EmployeePosition | null;
      target: number;
      actual: number;
      pct: number;
      tasksDone: number;
      late: number;
      zone: string | null;
    }[];
  };
};

export function ExecutiveDashboard() {
  const { t } = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamRowsWithRoleLabel = useMemo(() => {
    const rows = data?.teamTable?.rows ?? [];
    return rows.map((r) => ({
      ...r,
      roleLabel: getRoleDisplayLabel(r.role as Role, r.position ?? null, t),
    }));
  }, [data?.teamTable?.rows, t]);

  const fetchDashboard = useCallback(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Refetch when user returns to tab so Schedule Overview reflects latest roster after edits
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchDashboard();
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-muted">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-red-600">{error ?? 'Failed to load dashboard'}</p>
      </div>
    );
  }

  const { rbac, snapshot, salesBreakdown, scheduleOverview, taskIntegrity, teamTable } = data;

  const role = (rbac?.role ?? '') as string;
  const titleKey =
    role === 'EMPLOYEE'
      ? 'my'
      : role === 'ASSISTANT_MANAGER'
        ? 'branch'
        : role === 'MANAGER'
          ? 'manager'
          : role === 'ADMIN' || role === 'SUPER_ADMIN'
            ? 'admin'
            : role === 'DEMO_VIEWER'
              ? 'demo'
              : role === 'AREA_MANAGER'
                ? 'area'
                : 'default';
  const isEmployee = role === 'EMPLOYEE';
  const showBranchSections = !isEmployee;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 pb-nav">
      <PageHeader title={t(`dashboard.title.${titleKey}`)} subtitle={t('dashboard.asOfToday')} />

      {/* Section 1 — Top 4 cards */}
      <section className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {snapshot?.sales && (
          <SalesPerformanceCard
            currentMonthTarget={snapshot.sales.currentMonthTarget}
            currentMonthActual={snapshot.sales.currentMonthActual}
            completionPct={snapshot.sales.completionPct}
            remainingGap={snapshot.sales.remainingGap}
          />
        )}
        {snapshot?.scheduleHealth && (
          <ScheduleHealthCard
            weekApproved={snapshot.scheduleHealth.weekApproved}
            todayAmCount={snapshot.scheduleHealth.todayAmCount}
            todayPmCount={snapshot.scheduleHealth.todayPmCount}
            coverageViolationsCount={snapshot.scheduleHealth.coverageViolationsCount}
          />
        )}
        {snapshot?.taskControl && (
          <TaskControlCard
            totalWeekly={snapshot.taskControl.totalWeekly}
            completed={snapshot.taskControl.completed}
            pending={snapshot.taskControl.pending}
            overdue={snapshot.taskControl.overdue}
            zoneStatusSummary={snapshot.taskControl.zoneStatusSummary}
          />
        )}
        {snapshot?.controlAlerts && (
          <ControlAlertsCard
            suspiciousCount={snapshot.controlAlerts.suspiciousCount}
            leaveConflictsCount={snapshot.controlAlerts.leaveConflictsCount}
            unapprovedWeekWarning={snapshot.controlAlerts.unapprovedWeekWarning}
            lastPlannerSync={snapshot.controlAlerts.lastPlannerSync}
            showPlannerSync={rbac.showPlannerSync}
          />
        )}
      </section>

      {/* Quick links — EMPLOYEE only */}
      {isEmployee && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t('dashboard.quickLinks.title')}</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tasks"
              className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
            >
              {t('dashboard.quickLinks.tasks')}
            </Link>
            <Link
              href="/sales/my"
              className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
            >
              {t('dashboard.quickLinks.mySales')}
            </Link>
            <Link
              href="/me/target"
              className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
            >
              {t('dashboard.quickLinks.myTarget')}
            </Link>
            <Link
              href="/leaves/requests"
              className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
            >
              {t('dashboard.quickLinks.myLeaves')}
            </Link>
          </div>
        </section>
      )}

      {/* Section 2 — Sales breakdown (branch/manager/admin only) */}
      {showBranchSections && salesBreakdown && salesBreakdown.length > 0 && (
        <section className="mb-6">
          <SalesBreakdownSection employees={salesBreakdown} />
        </section>
      )}

      {/* Section 3 — Schedule overview (branch/manager/admin only) */}
      {showBranchSections && scheduleOverview && (
        <section className="mb-6">
          <ScheduleOverviewSection
            amPmBalanceSummary={scheduleOverview.amPmBalanceSummary}
            daysOverloaded={scheduleOverview.daysOverloaded ?? []}
            imbalanceHighlight={scheduleOverview.imbalanceHighlight}
          />
        </section>
      )}

      {/* Section 4 — Task integrity (hide for ASSISTANT_MANAGER) */}
      {rbac.showAntiGaming && taskIntegrity && (
        <section className="mb-6">
          <TaskIntegritySection
            burstFlagsCount={taskIntegrity.burstFlagsCount}
            sameDayBulkCount={taskIntegrity.sameDayBulkCount}
            top3SuspiciousUsers={taskIntegrity.top3SuspiciousUsers ?? []}
          />
        </section>
      )}

      {/* Section 5 — Team table (branch/manager/admin only) */}
      {showBranchSections && teamTable && teamTable.rows.length > 0 && (
        <section className="mb-6">
          <TeamTableSection rows={teamRowsWithRoleLabel} />
        </section>
      )}
    </div>
  );
}
