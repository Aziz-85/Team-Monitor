'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { computeCountsFromGridRows, type DayCountContext, type GridRow as ServerGridRow } from '@/lib/services/scheduleGrid';
import {
  formatSlotViolationMessage,
  groupSlotViolationsByDate,
  validateTimeCoverageForGrid,
} from '@/lib/schedule/timeCoverageValidation';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';
import { ScheduleEditExcelViewClient } from '@/app/(dashboard)/schedule/edit/ScheduleEditExcelViewClient';
import { ScheduleEditMonthExcelViewClient } from '@/app/(dashboard)/schedule/edit/ScheduleEditMonthExcelViewClient';
import { ScheduleCellSelect } from '@/components/schedule/ScheduleCellSelect';
import { ScheduleFullExportButton } from '@/components/schedule/ScheduleFullExportButton';
import { SwapWeeklyOffModal } from '@/components/schedule/SwapWeeklyOffModal';
import { ScheduleAssistantModal } from '@/components/schedule/ScheduleAssistantModal';
import { ScheduleQualityPanel } from '@/components/schedule/ScheduleQualityPanel';
import { CompactScheduleWarnings } from '@/components/schedule/CompactScheduleWarnings';
import { CollapsibleKeyHolders } from '@/components/schedule/CollapsibleKeyHolders';
import { ScheduleShiftCellHint, ScheduleShiftReadOnlyBadge } from '@/components/schedule/ScheduleShiftCellHint';
import {
  buildGroupedWarnings,
  computeScheduleQualityMetrics,
  summarizeCoverageWarnings,
} from '@/lib/schedule/scheduleUiMetrics';
import { SCHEDULE_UI } from '@/lib/scheduleUi';
import {
  canLockUnlockDay,
  canLockWeek,
  canUnlockWeek,
  canApproveWeek,
} from '@/lib/permissions';
import { isDateInRamadanRange } from '@/lib/time/ramadan';
import { getCoverageHeaderLabel } from '@/lib/schedule/coverageHeaderLabel';
import { evaluateCoverage } from '@/lib/schedule/coveragePolicy';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import { dateFromCalendarDayString, intlLocaleForGregorianCalendar } from '@/lib/i18n/format';
import { getRiyadhDateKey, getRiyadhMonthKey } from '@/lib/dates/riyadhDate';
import type { Role } from '@prisma/client';
import { isOverrideShiftForbiddenOnDate } from '@/lib/schedule/shiftRules';
import { buildEditorShiftOptions } from '@/lib/schedule/shiftOptions';
import {
  isSplitAssignmentAllowed,
  shiftCountContribution,
} from '@/lib/schedule/coveragePolicy';
import {
  buildScheduleDisplayNames,
  getScheduleDisplayName,
} from '@/lib/schedule/displayName';

function formatDDMM(d: string): string {
  const ymd = String(d).slice(0, 10);
  const [, m, day] = ymd.split('-');
  return `${day}/${m}`;
}

function getDayName(dateStr: string, locale: string): string {
  const d = dateFromCalendarDayString(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(intlLocaleForGregorianCalendar(locale), { weekday: 'long' });
}

function getDayShort(dateStr: string, locale: string): string {
  const d = dateFromCalendarDayString(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(intlLocaleForGregorianCalendar(locale), { weekday: 'short' });
}

function weekStartSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Validates the selected schedule week (Saturday YYYY-MM-DD) for guest coverage API calls. */
function resolveGuestWeekStart(weekStart: string): string | null {
  const ws = weekStart?.trim();
  if (!ws || !/^\d{4}-\d{2}-\d{2}$/.test(ws)) return null;
  return weekStartSaturday(ws);
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function formatWeekRangeLabel(weekStart: string, locale: string): { start: string; end: string } {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  const startD = dateFromCalendarDayString(weekStart);
  const endD = dateFromCalendarDayString(addDays(weekStart, 6));
  const loc = intlLocaleForGregorianCalendar(locale);
  return {
    start: startD.toLocaleDateString(loc, opts),
    end: endD.toLocaleDateString(loc, opts),
  };
}

function formatMonthYear(monthStr: string, locale: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(intlLocaleForGregorianCalendar(locale), { month: 'long', year: 'numeric' });
}

function editKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

const FRIDAY_DAY_OF_WEEK = 5;
function isFriday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.getUTCDay() === FRIDAY_DAY_OF_WEEK;
}

/** Friday is PM-only unless the date falls in Ramadan (same rule as grid editor). */
function isFridayPmOnlyDay(
  dateStr: string,
  ramadanRange?: { start: string; end: string } | null
): boolean {
  if (!isFriday(dateStr)) return false;
  if (ramadanRange && isDateInRamadanRange(new Date(dateStr + 'T12:00:00Z'), ramadanRange)) return false;
  return true;
}

function defaultGuestShiftForDate(
  dateStr: string,
  ramadanRange?: { start: string; end: string } | null
): 'MORNING' | 'EVENING' {
  return isFridayPmOnlyDay(dateStr, ramadanRange) ? 'EVENING' : 'MORNING';
}

function formatAuditBeforeAfter(
  before: string | null,
  after: string | null,
  t: (key: string) => string
): string {
  if (!before && !after) return '';
  try {
    const b = before ? JSON.parse(before) : null;
    const a = after ? JSON.parse(after) : null;
    const parts: string[] = [];
    if (b && typeof b === 'object') {
      if (b.overrideShift != null) parts.push(`${t('governance.auditBefore')}: ${b.overrideShift}`);
      if (b.empId) parts.push(`${t('governance.auditEmp')}: ${b.empId}`);
      if (b.date) parts.push(`${t('governance.auditDate')}: ${b.date}`);
      if (b.team) parts.push(`${t('governance.auditTeam')}: ${b.team}`);
      if (b.status) parts.push(`${t('governance.auditStatus')}: ${b.status}`);
    }
    if (a && typeof a === 'object') {
      if (a.overrideShift != null) parts.push(`${t('governance.auditAfter')}: ${a.overrideShift}`);
      if (a.team && a.effectiveFrom) parts.push(`${t('governance.auditTeam')} → ${a.team} from ${a.effectiveFrom}`);
      if (a.weekStart) parts.push(`${t('governance.auditWeek')}: ${a.weekStart}`);
      if (a.statusRevertedTo) parts.push(`${t('governance.auditReverted')}: ${a.statusRevertedTo}`);
      if (a.status) parts.push(`${t('governance.auditStatus')}: ${a.status}`);
    }
    return parts.length ? parts.join(' · ') : '';
  } catch {
    return '';
  }
}

function auditActionColor(action: string): string {
  if (action.includes('LOCK') || action.includes('APPROVED')) return 'border-l-4 border-rose-400 bg-rose-50/50';
  if (action.includes('UNLOCK') || action.includes('UNAPPROVED')) return 'border-l-4 border-emerald-400 bg-emerald-50/50';
  if (action.includes('OVERRIDE') || action.includes('COVERAGE')) return 'border-l-4 border-sky-400 bg-sky-50/50';
  if (action.includes('TEAM')) return 'border-l-4 border-amber-400 bg-amber-50/50';
  return 'border-l-4 border-border bg-surface-subtle';
}

const AUDIT_ACTION_KEYS: Record<string, string> = {
  SCHEDULE_BATCH_SAVE: 'governance.actionScheduleBatchSave',
  WEEK_SAVE: 'governance.actionWeekSave',
  OVERRIDE_CREATE: 'governance.actionOverrideAdded',
  OVERRIDE_UPDATE: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_CREATED: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_UPDATED: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_REMOVED: 'governance.actionOverrideRemoved',
  COVERAGE_SUGGESTION_APPLY: 'governance.actionCoverageApplied',
  COVERAGE_ADDED: 'governance.actionCoverageAdded',
  COVERAGE_REMOVED: 'governance.actionCoverageRemoved',
  DAY_LOCKED: 'governance.actionDayLocked',
  DAY_UNLOCKED: 'governance.actionDayUnlocked',
  WEEK_LOCKED: 'governance.actionWeekLocked',
  WEEK_UNLOCKED: 'governance.actionWeekUnlocked',
  WEEK_APPROVED: 'governance.actionWeekApproved',
  WEEK_UNAPPROVED: 'governance.actionWeekUnapproved',
  TEAM_CHANGE: 'governance.actionTeamChanged',
  TEAM_CHANGED: 'governance.actionTeamChanged',
};

const SUGGESTION_TYPE_KEYS: Record<string, string> = {
  MOVE: 'schedule.move',
  SWAP: 'schedule.swap',
  REMOVE_COVER: 'schedule.removeCover',
  ASSIGN: 'schedule.assign',
};

/** Fallback labels for shift options when i18n key is not resolved (display in dropdown) */
const SHIFT_LABEL_FALLBACKS: Record<string, string> = {
  amShort: 'AM',
  pmShort: 'PM',
  morning: 'Morning (AM)',
  evening: 'Afternoon (PM)',
  splitShift: 'Split Shift',
  splitShort: 'SPLIT',
  none: 'NONE',
};

function shiftToCompactLabel(shift: string, t: (key: string) => string): string {
  if (shift === 'MORNING') return 'AM';
  if (shift === 'EVENING') return 'PM';
  if (shift === 'SPLIT') return shiftLabel(t, 'splitShort');
  if (shift === 'COVER_RASHID_AM' || shift === 'COVER_RASHID_PM') return t('schedule.externalCoverage') ?? 'External';
  return 'NONE';
}

function shiftLabel(t: (key: string) => string, key: keyof typeof SHIFT_LABEL_FALLBACKS): string {
  const fullKey = `schedule.shift.${key}`;
  const value = t(fullKey);
  return value && value !== fullKey ? value : SHIFT_LABEL_FALLBACKS[key] ?? key;
}

type EditableShift = 'MORNING' | 'EVENING' | 'SPLIT' | 'NONE' | 'COVER_RASHID_AM' | 'COVER_RASHID_PM';

type GridCell = {
  date: string;
  availability: string;
  effectiveShift: string;
  overrideId: string | null;
  baseShift: string;
  segments?: Array<{ startTime: string; endTime: string; periodIndex: number }>;
};

type GridRow = {
  empId: string;
  name: string;
  nameAr?: string | null;
  team: string;
  cells: GridCell[];
  effectiveWeeklyOffDay?: number | 'NONE';
};

type GridDay = { date: string; dayName: string; dayOfWeek: number; minAm: number; minPm: number };

type ScheduleSuggestion = {
  id: string;
  type: 'MOVE' | 'SWAP' | 'REMOVE_COVER' | 'ASSIGN';
  date: string;
  dayIndex: number;
  affected: Array<{ empId: string; name: string; fromShift: string; toShift: string }>;
  before: { am: number; pm: number; rashidAm: number; rashidPm: number };
  after: { am: number; pm: number; rashidAm: number; rashidPm: number };
  reason: string;
  highlightCells: string[];
};

type GridData = {
  weekStart: string;
  days: GridDay[];
  rows: GridRow[];
  counts: Array<{ amCount: number; pmCount: number; rashidAmCount?: number; rashidPmCount?: number }>;
  integrityWarnings?: string[];
  suggestions?: ScheduleSuggestion[];
  dayCountContexts?: DayCountContext[];
  timeCoverage?: { valid: boolean; violations: SlotViolation[] };
  /** Admin only: comp day balance per empId */
  compBalanceByEmpId?: Record<string, number>;
};

type MonthData = {
  month: string;
  days: Array<{ date: string; amCount: number; pmCount: number; warnings: string[] }>;
};

type WeekGovernance = {
  weekStart: string;
  status: 'DRAFT' | 'APPROVED';
  approvedByName?: string | null;
  approvedByRole?: string | null;
  approvedAt?: string | null;
  weekLock: {
    lockedByUserId: string;
    lockedByName: string | null;
    lockedByRole?: string | null;
    lockedAt: string;
    reason?: string | null;
  } | null;
  lockedDays: Array<{
    date: string;
    lockedByUserId: string;
    lockedByName: string | null;
    lockedAt: string;
    reason?: string | null;
  }>;
};

type PendingEdit = {
  newShift: string;
  reason?: string;
  originalEffectiveShift: string;
  overrideId: string | null;
  employeeName: string;
};

type ValidationResult = { type: string; message: string; amCount: number; pmCount: number; minAm?: number };

const DEFAULT_REASON = 'Schedule adjustment';

const LOCKED_LEAVE = '__LEAVE__';
const LOCKED_OFF = '__OFF__';
const LOCKED_HOLIDAY = '__HOLIDAY__';
const LOCKED_ABSENT = '__ABSENT__';
const LOCKED_FORCE_OFF = '__FORCE_OFF__';

function lockedCellSelectValue(availability: string): string {
  switch (availability) {
    case 'LEAVE':
      return LOCKED_LEAVE;
    case 'OFF':
      return LOCKED_OFF;
    case 'HOLIDAY':
      return LOCKED_HOLIDAY;
    case 'ABSENT':
      return LOCKED_ABSENT;
    default:
      return LOCKED_OFF;
  }
}

function lockedCellStatusLabel(availability: string, t: (key: string) => string): string {
  switch (availability) {
    case 'LEAVE':
      return (t('schedule.leaveStatus') as string) || 'Leave';
    case 'OFF':
      return (t('common.offDay') as string) || 'Off day';
    case 'HOLIDAY':
      return (t('schedule.holiday') as string) || 'Holiday';
    case 'ABSENT':
      return (t('schedule.absent') as string) || 'Absent';
    default:
      return availability;
  }
}

function countsWithoutEmployee(
  dayAm: number,
  dayPm: number,
  cell: GridCell,
  employeeShift: string
): { am: number; pm: number } {
  if (cell.availability !== 'WORK') return { am: dayAm, pm: dayPm };
  const c = shiftCountContribution(employeeShift);
  return { am: dayAm - c.am, pm: dayPm - c.pm };
}

function buildLockedCellOptions(
  cell: GridCell,
  date: string,
  ramadanRange: { start: string; end: string } | null,
  t: (key: string) => string
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    {
      value: lockedCellSelectValue(cell.availability),
      label: lockedCellStatusLabel(cell.availability, t),
    },
  ];
  const ramadanDay = ramadanRange
    ? isDateInRamadanRange(new Date(date + 'T12:00:00Z'), ramadanRange)
    : false;
  const friday = isFriday(date);
  if (friday && !ramadanDay) {
    options.push(
      { value: 'EVENING', label: shiftLabel(t, 'pmShort') },
      { value: 'NONE', label: shiftLabel(t, 'none') }
    );
  } else {
    options.push(
      { value: 'MORNING', label: shiftLabel(t, 'amShort') },
      { value: 'EVENING', label: shiftLabel(t, 'pmShort') },
      { value: 'SPLIT', label: shiftLabel(t, 'splitShift') },
      { value: 'NONE', label: shiftLabel(t, 'none') }
    );
  }
  if (cell.availability === 'LEAVE' || cell.availability === 'HOLIDAY') {
    options.push({
      value: LOCKED_FORCE_OFF,
      label: (t('common.offDay') as string) || 'Off day',
    });
  }
  return options;
}

function parseWeekStartFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return weekStartSaturday(getRiyadhDateKey());
  const normalized = weekStartSaturday(value);
  return normalized;
}

function parseMonthFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return getRiyadhMonthKey();
  return value;
}

type MonthMode = 'summary' | 'excel';

type KeyPlanDay = {
  date: string;
  amHolderEmpId: string | null;
  pmHolderEmpId: string | null;
  amEligible?: Array<{ empId: string; name: string }>;
  pmEligible?: Array<{ empId: string; name: string }>;
  suggestedAmHolderEmpId?: string | null;
  suggestedPmHolderEmpId?: string | null;
  warnings?: Array<{ date: string; code: string; message: string }>;
};

type KeyPlan = {
  weekStart: string;
  days: KeyPlanDay[];
  currentHolders: {
    key1HolderEmployeeId: string | null;
    key2HolderEmployeeId: string | null;
    key1HolderName: string | null;
    key2HolderName: string | null;
  };
} | null;

export function ScheduleEditClient({
  initialRole,
  ramadanRange,
}: {
  initialRole: Role;
  ramadanRange?: { start: string; end: string } | null;
}) {
  const { t, locale } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => parseWeekStartFromUrl(searchParams.get('weekStart')));
  const [month, setMonth] = useState(() => parseMonthFromUrl(searchParams.get('month')));
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthExcelData, setMonthExcelData] = useState<{
    month: string;
    dayRows: import('@/app/(dashboard)/schedule/excel/ScheduleMonthExcelViewClient').MonthExcelDayRow[];
  } | null>(null);
  const [monthExcelLoading, setMonthExcelLoading] = useState(false);
  const [weekGovernance, setWeekGovernance] = useState<WeekGovernance | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [globalReason, setGlobalReason] = useState(DEFAULT_REASON);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<string | null>(null);
  /** Non-blocking errors from compact admin actions (e.g. comp day / force work) — avoids alert(). */
  const [inlineErrorBanner, setInlineErrorBanner] = useState<string | null>(null);
  const [lockedCellSavingKey, setLockedCellSavingKey] = useState<string | null>(null);
  const [swapWeeklyOffOpen, setSwapWeeklyOffOpen] = useState(false);
  const [scheduleAssistantOpen, setScheduleAssistantOpen] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState<{ href: string } | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [highlightedCells, setHighlightedCells] = useState<Set<string> | null>(null);
  const [suggestionConfirm, setSuggestionConfirm] = useState<ScheduleSuggestion | null>(null);
  const [lockDayModal, setLockDayModal] = useState<{ date: string; reason: string } | null>(null);
  const [lockActionLoading, setLockActionLoading] = useState(false);
  const [auditItems, setAuditItems] = useState<Array<{
    id: string;
    createdAt: string;
    action: string;
    reason: string | null;
    beforeJson: string | null;
    afterJson: string | null;
    entityId: string | null;
    actor: { name: string; role: string } | null;
  }>>([]);
  const [auditExpanded, setAuditExpanded] = useState<Set<string>>(new Set());
  const [editorView, setEditorViewState] = useState<'grid' | 'excel'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('schedule_editor_view');
      if (saved === 'grid' || saved === 'excel') return saved;
    }
    return 'grid';
  });
  const [monthMode, setMonthModeState] = useState<MonthMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('schedule_editor_month_view');
      if (saved === 'summary' || saved === 'excel') return saved as MonthMode;
    }
    return 'summary';
  });
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [sourceBoutiques, setSourceBoutiques] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedSourceBoutiqueId, setSelectedSourceBoutiqueId] = useState('');
  const [guestEmployees, setGuestEmployees] = useState<Array<{ empId: string; name: string; boutiqueName: string }>>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestForm, setGuestForm] = useState({
    empId: '',
    date: '',
    shift: 'MORNING' as 'MORNING' | 'EVENING' | 'SPLIT',
    reason: '',
  });
  type GuestItem = {
    id: string;
    date: string;
    empId: string;
    shift: string;
    reason?: string;
    sourceBoutiqueId?: string;
    sourceBoutique?: { id: string; name: string } | null;
    employee: { name: string; nameAr?: string | null; homeBoutiqueCode: string; homeBoutiqueName?: string };
    /** true = from another boutique (show in External Coverage); false = same branch */
    isExternal?: boolean;
  };
  const [weekGuests, setWeekGuests] = useState<GuestItem[]>([]);
  // Draft-only external coverage additions. These are not persisted until user clicks "Save changes".
  const [localPendingGuests, setLocalPendingGuests] = useState<GuestItem[]>([]);

  const [keyPlan, setKeyPlan] = useState<KeyPlan>(null);
  const [keyPlanLoading, setKeyPlanLoading] = useState(false);
  const [keyPlanDirty, setKeyPlanDirty] = useState(false);
  const [keyPlanLocal, setKeyPlanLocal] = useState<KeyPlanDay[]>([]);
  const [handoverDialogOpen, setHandoverDialogOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ keyNumber: 1 as 1 | 2, toEmployeeId: '', note: '' });
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);

  /** Only guests from other boutiques (same-branch excluded from External Coverage rows) */
  const externalGuests = useMemo(
    () => weekGuests.filter((g) => g.isExternal !== false),
    [weekGuests]
  );

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('schedule_editor_view') : null;
    if (saved === 'grid' || saved === 'excel') setEditorViewState(saved);
  }, []);

  useEffect(() => {
    if (!addGuestOpen) return;
    setGuestError(null);
    setGuestEmployees([]);
    setSelectedSourceBoutiqueId('');
    fetch('/api/schedule/external-coverage/source-boutiques')
      .then((r) => (r.ok ? r.json() : { boutiques: [] as Array<{ id: string; name: string; code: string }> }))
      .then((data: { boutiques?: Array<{ id: string; name: string; code: string }> }) => {
        const list = data?.boutiques ?? [];
        setSourceBoutiques(list);
        const defaultId =
          list.find((b) => /dhahran/i.test(b.name) || /dhahran/i.test(b.code))?.id ?? list[0]?.id ?? '';
        setSelectedSourceBoutiqueId(defaultId);
        const firstDay = gridData?.days?.[0]?.date ?? weekStart;
        setGuestForm((prev) => ({
          ...prev,
          empId: '',
          date: firstDay,
          shift: defaultGuestShiftForDate(firstDay, ramadanRange),
          reason: '',
        }));
      })
      .catch(() => setSourceBoutiques([]));
  }, [addGuestOpen, weekStart, gridData?.days, ramadanRange]);

  useEffect(() => {
    if (!addGuestOpen || !selectedSourceBoutiqueId) {
      setGuestEmployees([]);
      setGuestError(null);
      return;
    }
    setGuestLoading(true);
    setGuestError(null);
    fetch(`/api/schedule/external-coverage/employees?sourceBoutiqueId=${encodeURIComponent(selectedSourceBoutiqueId)}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((body: { error?: string }) => {
            setGuestError(body?.error ?? `Error ${r.status}`);
            return { employees: [] as Array<{ empId: string; name: string; boutiqueName?: string }> };
          });
        }
        return r.json().catch(() => ({}));
      })
      .then((data: { employees?: Array<{ empId: string; name: string; boutiqueName?: string }> }) => {
        const list = (data?.employees ?? []).map((e) => ({ empId: e.empId, name: e.name, boutiqueName: e.boutiqueName ?? '' }));
        setGuestEmployees(list);
        const sourceBoutique = sourceBoutiques.find((b) => b.id === selectedSourceBoutiqueId);
        const isDhahran = sourceBoutique ? /dhahran/i.test(sourceBoutique.name) || /dhahran/i.test(sourceBoutique.code) : false;
        if (list.length <= 2 && isDhahran && typeof console !== 'undefined' && console.warn) {
          console.warn('Low employee count — check local DB seed/import.');
        }
        setGuestForm((prev) => ({ ...prev, empId: '' }));
      })
      .catch(() => {
        setGuestError('Failed to load employees');
        setGuestEmployees([]);
      })
      .finally(() => setGuestLoading(false));
  }, [addGuestOpen, selectedSourceBoutiqueId, sourceBoutiques]);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [weekStart]);

  const guestsBySource = useMemo(() => {
    const bySource = new Map<string, { sourceBoutiqueName: string; guests: GuestItem[] }>();
    for (const g of externalGuests) {
      const sid = g.sourceBoutiqueId ?? '';
      const name = g.sourceBoutique?.name ?? g.employee.homeBoutiqueName ?? 'External';
      const existing = bySource.get(sid);
      if (existing) existing.guests.push(g);
      else bySource.set(sid, { sourceBoutiqueName: name, guests: [g] });
    }
    return Array.from(bySource.entries()).sort((a, b) => a[1].sourceBoutiqueName.localeCompare(b[1].sourceBoutiqueName));
  }, [externalGuests]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('schedule_editor_month_view') : null;
    if (saved === 'summary' || saved === 'excel') setMonthModeState(saved as MonthMode);
  }, []);

  const setEditorView = useCallback((mode: 'grid' | 'excel') => {
    setEditorViewState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('schedule_editor_view', mode);
  }, []);

  const setMonthMode = useCallback((mode: MonthMode) => {
    setMonthModeState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('schedule_editor_month_view', mode);
  }, []);
  const [teamFilterExcel, setTeamFilterExcel] = useState<'all' | 'A' | 'B'>('all');
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const coverageHeaderLabel = useMemo(
    () =>
      getCoverageHeaderLabel(externalGuests, {
        hostBoutique: scopeLabel ? { name: scopeLabel } : undefined,
        externalLabel: t('schedule.externalCoverage') ?? 'External Coverage',
      }),
    [externalGuests, scopeLabel, t]
  );
  const dayRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const isWeekLocked = !!(weekGovernance?.weekLock);

  const refetchScopeLabel = useCallback(() => {
    fetch('/api/me/operational-boutique')
      .then((r) => r.json().catch(() => null))
      .then((data: { label?: string } | null) => {
        setScopeLabel(data?.label ?? null);
      })
      .catch(() => setScopeLabel(null));
  }, []);

  const fetchGrid = useCallback(() => {
    const params = new URLSearchParams({ weekStart, scope: 'all', suggestions: '1' });
    return fetch(`/api/schedule/week/grid?${params}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then(setGridData)
      .catch(() => setGridData(null));
  }, [weekStart]);

  const fetchGuests = useCallback(() => {
    const ws = resolveGuestWeekStart(weekStart);
    if (!ws) {
      setToast(
        (t('schedule.weekStartRequired') as string) ??
          'Select a valid schedule week before loading external coverage.'
      );
      setTimeout(() => setToast(null), 5000);
      return Promise.resolve();
    }
    return fetch(`/api/schedule/guests?weekStart=${encodeURIComponent(ws)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data: {
        guests?: GuestItem[];
        pendingGuests?: Array<GuestItem & { pending?: boolean; requestId?: string }>;
      }) => {
        const applied = data.guests ?? [];
        const pending = data.pendingGuests ?? [];
        const merged = [...applied, ...pending, ...localPendingGuests];
        const seen = new Set<string>();
        const keyOf = (g: GuestItem) => `${g.empId}|${g.date}|${g.shift}|${g.sourceBoutiqueId ?? ''}`;
        const unique: GuestItem[] = [];
        for (const g of merged) {
          const k = keyOf(g);
          if (seen.has(k)) continue;
          seen.add(k);
          unique.push(g);
        }
        setWeekGuests(unique);
      })
      .catch(() => setWeekGuests([]));
  }, [weekStart, localPendingGuests]);

  useEffect(() => {
    refetchScopeLabel();
  }, [refetchScopeLabel]);

  useEffect(() => {
    const onScopeChanged = () => {
      refetchScopeLabel();
      if (tab === 'week') {
        setGridLoading(true);
        fetch(`/api/schedule/week/grid?weekStart=${weekStart}&scope=all&suggestions=1`, { cache: 'no-store' })
          .then((r) => r.json().catch(() => null))
          .then(setGridData)
          .catch(() => setGridData(null))
          .finally(() => setGridLoading(false));
        fetchGuests();
        fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data ? setWeekGovernance(data) : setWeekGovernance(null)))
          .catch(() => setWeekGovernance(null));
      }
    };
    window.addEventListener('scope-changed', onScopeChanged);
    return () => window.removeEventListener('scope-changed', onScopeChanged);
  }, [tab, weekStart, refetchScopeLabel, fetchGuests]);

  const canEdit = !isWeekLocked;
  const lockedDaySet = useMemo(
    () => new Set(weekGovernance?.lockedDays?.map((d) => d.date) ?? []),
    [weekGovernance?.lockedDays]
  );
  const lockedDayInfo = useMemo(
    () => Object.fromEntries((weekGovernance?.lockedDays ?? []).map((d) => [d.date, d])),
    [weekGovernance?.lockedDays]
  );

  const fetchWeekGovernance = useCallback(() => {
    fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data ? setWeekGovernance(data) : setWeekGovernance(null)))
      .catch(() => setWeekGovernance(null));
  }, [weekStart]);

  const [removingGuestId, setRemovingGuestId] = useState<string | null>(null);
  const handleRemoveGuestShift = useCallback(
    (id: string) => {
      setRemovingGuestId(id);
      if (id.startsWith('local-')) {
        setWeekGuests((prev) => prev.filter((g) => g.id !== id));
        setLocalPendingGuests((prev) => prev.filter((g) => g.id !== id));
        setToast(t('schedule.guestRemoved') ?? 'Guest removed from draft');
        setTimeout(() => setToast(null), 3000);
        setRemovingGuestId(null);
        return;
      }
      fetch(`/api/schedule/guests?id=${encodeURIComponent(id)}`, { method: 'DELETE', cache: 'no-store' })
        .then((r) => {
          if (r.ok) {
            fetchGuests();
            fetchGrid();
            fetchWeekGovernance();
            setToast(t('schedule.guestRemoved') ?? 'Guest removed from coverage');
            setTimeout(() => setToast(null), 3000);
          } else {
            return r.json().then((body: { error?: string }) => {
              setToast(body?.error ?? 'Failed to remove');
              setTimeout(() => setToast(null), 4000);
            });
          }
        })
        .catch(() => {
          setToast('Failed to remove guest');
          setTimeout(() => setToast(null), 4000);
        })
        .finally(() => setRemovingGuestId(null));
    },
    [fetchGuests, fetchGrid, fetchWeekGovernance, t]
  );

  const handleGuestShiftChange = useCallback(
    (guest: GuestItem, newShift: string) => {
      if (newShift === '__delete__') {
        handleRemoveGuestShift(guest.id);
        return;
      }
      const shift = newShift.toUpperCase();
      if (shift === guest.shift) return;
      if (guest.id.startsWith('local-')) {
        setWeekGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, shift } : g)));
        setLocalPendingGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, shift } : g)));
        return;
      }
      setRemovingGuestId(guest.id);
      fetch(`/api/overrides/${encodeURIComponent(guest.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideShift: shift, reason: guest.reason ?? 'External coverage shift change' }),
      })
        .then((r) => {
          if (r.ok) {
            fetchGuests();
            fetchGrid();
            setToast(t('schedule.guestShiftUpdated') as string);
            setTimeout(() => setToast(null), 3000);
          } else {
            return r.json().then((body: { error?: string }) => {
              setToast(body?.error ?? 'Failed to update shift');
              setTimeout(() => setToast(null), 4000);
            });
          }
        })
        .catch(() => {
          setToast('Failed to update guest shift');
          setTimeout(() => setToast(null), 4000);
        })
        .finally(() => setRemovingGuestId(null));
    },
    [fetchGuests, fetchGrid, handleRemoveGuestShift, t]
  );

  useEffect(() => {
    if (tab === 'week') {
      setGridLoading(true);
      fetchGrid().finally(() => setGridLoading(false));
      fetchGuests();
    }
  }, [tab, fetchGrid, fetchGuests]);

  useEffect(() => {
    if (tab === 'week') fetchWeekGovernance();
  }, [tab, weekStart, fetchWeekGovernance]);

  const fetchKeyPlan = useCallback(() => {
    if (tab !== 'week' || !weekStart) return;
    setKeyPlanLoading(true);
    fetch(`/api/keys/week?weekStart=${encodeURIComponent(weekStart)}&eligible=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: KeyPlan | null) => {
        if (data) {
          setKeyPlan(data);
          setKeyPlanLocal(
            data.days.map((d) => ({
              ...d,
              amHolderEmpId: d.amHolderEmpId ?? d.suggestedAmHolderEmpId ?? null,
              pmHolderEmpId: d.pmHolderEmpId ?? d.suggestedPmHolderEmpId ?? null,
            }))
          );
          setKeyPlanDirty(false);
        } else setKeyPlan(null);
      })
      .catch(() => setKeyPlan(null))
      .finally(() => setKeyPlanLoading(false));
  }, [tab, weekStart]);

  useEffect(() => {
    if (tab === 'week' && weekStart) fetchKeyPlan();
  }, [tab, weekStart, fetchKeyPlan]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && tab === 'week') fetchWeekGovernance();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [tab, fetchWeekGovernance]);

  // Keyboard: ← previous, → next (week or month)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (tab === 'week') setWeekStart((ws) => addDays(ws, -7));
        else setMonth((m) => addMonths(m, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (tab === 'week') setWeekStart((ws) => addDays(ws, 7));
        else setMonth((m) => addMonths(m, 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'week' || !weekStart) {
      setAuditItems([]);
      return;
    }
    fetch(`/api/audit?limit=20&weekStart=${weekStart}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) =>
        setAuditItems(
          (data.items ?? []).map(
            (i: {
              id: string;
              createdAt: string;
              action: string;
              reason: string | null;
              beforeJson: string | null;
              afterJson: string | null;
              entityId: string | null;
              actor: { name: string; role: string } | null;
            }) => ({
              id: i.id,
              createdAt: i.createdAt,
              action: i.action,
              reason: i.reason ?? null,
              beforeJson: i.beforeJson ?? null,
              afterJson: i.afterJson ?? null,
              entityId: i.entityId ?? null,
              actor: i.actor,
            })
          )
        )
      )
      .catch(() => setAuditItems([]));
  }, [tab, weekStart]);

  useEffect(() => {
    setPendingEdits(new Map());
    setDismissedSuggestionIds(new Set());
  }, [weekStart]);

  // Keep URL in sync with week/month and editor view
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab === 'week') {
      params.set('weekStart', weekStart);
      if (editorView === 'excel') params.set('view', 'excel');
    } else {
      params.set('month', month);
    }
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (typeof window !== 'undefined' && (window.location.pathname + (window.location.search || '')) !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [pathname, tab, weekStart, month, editorView]);

  useEffect(() => {
    if (tab === 'month') {
      setMonthLoading(true);
      fetch(`/api/schedule/month?month=${month}`, { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then(setMonthData)
        .catch(() => setMonthData(null))
        .finally(() => setMonthLoading(false));
    }
  }, [tab, month]);

  useEffect(() => {
    if (tab !== 'month' || monthMode !== 'excel') return;
    setMonthExcelLoading(true);
    const params = new URLSearchParams({ month, locale: locale === 'ar' ? 'ar' : 'en' });
    fetch(`/api/schedule/month/excel?${params}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setMonthExcelData(data);
        } else {
          setMonthExcelData(null);
        }
      })
      .catch(() => setMonthExcelData(null))
      .finally(() => setMonthExcelLoading(false));
  }, [tab, monthMode, month, locale]);

  const pendingCount = pendingEdits.size + localPendingGuests.length;

  const getDraftShift = useCallback(
    (empId: string, date: string, serverEffective: string): string => {
      const edit = pendingEdits.get(editKey(empId, date));
      return edit ? edit.newShift : serverEffective;
    },
    [pendingEdits]
  );

  const draftCounts = useMemo(() => {
    if (!gridData?.rows.length) return [];
    return computeCountsFromGridRows(
      gridData.rows,
      getDraftShift,
      gridData.dayCountContexts
    );
  }, [gridData, getDraftShift]);

  const effectiveTimeCoverage = useMemo(() => {
    if (!gridData?.dayCountContexts?.length) {
      return gridData?.timeCoverage ?? { valid: true, violations: [] };
    }
    if (!pendingEdits.size) return gridData.timeCoverage ?? { valid: true, violations: [] };
    const rows = gridData.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        effectiveShift: getDraftShift(row.empId, cell.date, cell.effectiveShift),
      })),
    }));
    return validateTimeCoverageForGrid(rows as ServerGridRow[], gridData.dayCountContexts);
  }, [gridData, pendingEdits.size, getDraftShift]);

  /** Per-day guest (external coverage) counts so AM/PM columns include coverage from another branch. */
  const guestCountsByDay = useMemo(() => {
    const days = gridData?.days ?? [];
    const byDay = days.map(() => ({ am: 0, pm: 0 }));
    for (const g of externalGuests) {
      const dateStr = typeof g.date === 'string' ? g.date.slice(0, 10) : '';
      const i = days.findIndex((d) => d.date === dateStr);
      if (i >= 0) {
        if (g.shift === 'MORNING') byDay[i].am += 1;
        else if (g.shift === 'EVENING') byDay[i].pm += 1;
        else if (g.shift === 'SPLIT') {
          byDay[i].am += 1;
          byDay[i].pm += 1;
        }
      }
    }
    return byDay;
  }, [externalGuests, gridData?.days]);

  /** Local pending (unsaved) guest coverage counts for the non-draft view. */
  const localGuestCountsByDay = useMemo(() => {
    const days = gridData?.days ?? [];
    const byDay = days.map(() => ({ am: 0, pm: 0 }));
    for (const g of localPendingGuests) {
      const dateStr = typeof g.date === 'string' ? g.date.slice(0, 10) : '';
      const i = days.findIndex((d) => d.date === dateStr);
      if (i >= 0) {
        if (g.shift === 'MORNING') byDay[i].am += 1;
        else if (g.shift === 'EVENING') byDay[i].pm += 1;
        else if (g.shift === 'SPLIT') {
          byDay[i].am += 1;
          byDay[i].pm += 1;
        }
      }
    }
    return byDay;
  }, [localPendingGuests, gridData?.days]);

  const scheduleDisplayNames = useMemo(() => {
    if (!gridData?.rows) return new Map<string, string>();
    const pool = gridData.rows.map((row) => ({
      empId: row.empId,
      name: getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale),
    }));
    for (const g of externalGuests) {
      pool.push({ empId: g.empId, name: g.employee.name });
    }
    for (const g of localPendingGuests) {
      pool.push({ empId: g.empId, name: g.employee.name });
    }
    return buildScheduleDisplayNames(pool);
  }, [gridData?.rows, externalGuests, localPendingGuests, locale]);

  /** Counts shown in grid/excel: when using draft, add guest counts; otherwise API counts already include guests. */
  const displayCounts = useMemo(() => {
    if (!gridData?.counts) return [];
    if (!draftCounts.length) {
      return gridData.counts.map((c, i) => ({
        ...c,
        amCount: (c.amCount ?? 0) + (localGuestCountsByDay[i]?.am ?? 0),
        pmCount: (c.pmCount ?? 0) + (localGuestCountsByDay[i]?.pm ?? 0),
      }));
    }
    return draftCounts.map((c, i) => ({
      amCount: (c.amCount ?? 0) + (guestCountsByDay[i]?.am ?? 0),
      pmCount: (c.pmCount ?? 0) + (guestCountsByDay[i]?.pm ?? 0),
    }));
  }, [draftCounts, gridData?.counts, guestCountsByDay, localGuestCountsByDay]);

  /** Only show suggestions for days that still have the violation per displayCounts (avoids stale warning after local edits). */
  const effectiveSuggestions = useMemo(() => {
    const raw = gridData?.suggestions ?? [];
    const days = gridData?.days ?? [];
    if (!raw.length || !displayCounts.length) return raw;
    const filtered = raw.filter((s) => {
      const i = s.dayIndex;
      const dc = displayCounts[i];
      if (!dc) return true;
      const am = dc.amCount ?? 0;
      const pm = dc.pmCount ?? 0;
      const day = days[i];
      if (!day) return true;
      const issues = evaluateCoverage({ am, pm }, day.dayOfWeek, day.minAm ?? 0, day.minPm ?? 0);
      if (issues.length === 0) return false;
      if (s.type === 'MOVE') {
        return issues.some((x) => x.type === 'AM_ON_FRIDAY' || x.type === 'PM_NOT_ABOVE_AM' || x.type === 'PM_BELOW_MIN');
      }
      if (s.type === 'ASSIGN') {
        return issues.some((x) => x.type === 'AM_BELOW_MIN');
      }
      if (s.type === 'REMOVE_COVER') {
        return issues.some((x) => x.type === 'PM_BELOW_MIN');
      }
      return true;
    });
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG_SCHEDULE_SUGGESTIONS === '1') {
      const serverCounts = gridData?.counts ?? [];
      // eslint-disable-next-line no-console
      console.log('[ScheduleEditClient.effectiveSuggestions]', {
        weekStart: gridData?.weekStart,
        displayCountsByDay: displayCounts.map((c, i) => ({ dayIndex: i, am: c.amCount, pm: c.pmCount })),
        serverCountsByDay: serverCounts.map((c, i) => ({ dayIndex: i, am: c.amCount, pm: c.pmCount })),
        rawSuggestionsCount: raw.length,
        filteredSuggestionsCount: filtered.length,
      });
    }
    return filtered;
  }, [gridData?.suggestions, gridData?.days, gridData?.counts, gridData?.weekStart, displayCounts]);

  const getRowAndCell = useCallback(
    (empId: string, date: string): { row: GridRow; cell: GridCell } | null => {
      if (!gridData) return null;
      const row = gridData.rows.find((r) => r.empId === empId);
      if (!row) return null;
      const cell = row.cells.find((c) => c.date === date);
      return cell ? { row, cell } : null;
    },
    [gridData]
  );

  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'excel') setEditorViewState('excel');
    else if (v === 'grid') setEditorViewState('grid');
  }, [searchParams]);

  const validationsByDay = useMemo(
    (): Array<{ date: string; validations: ValidationResult[] }> => {
      const slotByDate = groupSlotViolationsByDate(effectiveTimeCoverage.violations);
      return (
        gridData?.days.map((day, i) => {
          const count = displayCounts[i] ?? gridData.counts[i];
          const am = count?.amCount ?? 0;
          const pm = count?.pmCount ?? 0;
          const effectiveMinAm = day.dayOfWeek === 5 ? 0 : Math.max(day.minAm ?? 2, 2);
          const minPm = day.minPm ?? 0;
          const isFriday = day.dayOfWeek === 5;
          const validations: ValidationResult[] = [];
          for (const v of slotByDate.get(day.date) ?? []) {
            validations.push({
              type: 'SLOT_COVERAGE',
              message: formatSlotViolationMessage(v),
              amCount: am,
              pmCount: pm,
            });
          }
          if (am > pm) validations.push({ type: 'RASHID_OVERFLOW', message: (t('schedule.warningRashidOverflow') as string) || `AM (${am}) > PM (${pm})`, amCount: am, pmCount: pm });
          if (!isFriday && effectiveMinAm > 0 && am < effectiveMinAm) validations.push({ type: 'MIN_AM', message: (t('schedule.minAmTwo') as string) || `AM must be at least ${effectiveMinAm} (${am} present)`, amCount: am, pmCount: pm, minAm: effectiveMinAm });
          if (minPm > 0 && pm < minPm) validations.push({ type: 'MIN_PM', message: `PM (${pm}) < Min PM (${minPm})`, amCount: am, pmCount: pm });
          return { date: day.date, validations };
        }) ?? []
      );
    },
    [gridData, displayCounts, effectiveTimeCoverage.violations, t]
  );
  const daysNeedingAttention = validationsByDay.filter((d) => d.validations.length > 0).length;

  const scheduleQualityMetrics = useMemo(() => {
    if (!gridData) return null;
    const rows = gridData.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        effectiveShift: getDraftShift(row.empId, cell.date, cell.effectiveShift),
      })),
    }));
    return computeScheduleQualityMetrics({
      rows,
      timeCoverage: effectiveTimeCoverage,
      externalSupportCount: externalGuests.length + localPendingGuests.length,
      dayCountContexts: gridData.dayCountContexts,
      getEffectiveShift: (cell) => cell.effectiveShift,
    });
  }, [gridData, getDraftShift, effectiveTimeCoverage, externalGuests.length, localPendingGuests.length]);

  const groupedWarnings = useMemo(() => {
    const keyPlanWarnings =
      keyPlan?.days.flatMap((d) => (d.warnings ?? []).map((w) => ({ date: d.date, code: w.code, message: w.message }))) ?? [];
    return buildGroupedWarnings({
      validationsByDay,
      keyPlanWarnings,
      integrityWarnings: gridData?.integrityWarnings,
    });
  }, [validationsByDay, keyPlan, gridData?.integrityWarnings]);

  const coverageSummaries = useMemo(
    () =>
      summarizeCoverageWarnings(
        validationsByDay.map(({ date, validations }) => ({
          date,
          validations,
          dayOfWeek: gridData?.days.find((d) => d.date === date)?.dayOfWeek,
        }))
      ),
    [validationsByDay, gridData?.days]
  );

  const addPendingEdit = useCallback(
    (empId: string, date: string, newShift: string, row: GridRow, cell: GridCell) => {
      if (cell.availability === 'LEAVE') return;
      if (
        isFridayPmOnlyDay(date, ramadanRange) &&
        isOverrideShiftForbiddenOnDate(new Date(date + 'T12:00:00Z'), newShift)
      ) {
        setToast((t('schedule.fridayPmOnly') as string) ?? 'Friday is PM-only. AM and Split Shift are not allowed.');
        setTimeout(() => setToast(null), 6000);
        return;
      }
      const key = editKey(empId, date);
      const fromShift = pendingEdits.get(key)?.newShift ?? cell.effectiveShift;
      if (newShift === 'SPLIT' && gridData) {
        const dayIndex = gridData.days.findIndex((d) => d.date === date);
        const day = gridData.days[dayIndex];
        const dc = displayCounts[dayIndex];
        if (day && dc) {
          const base = countsWithoutEmployee(dc.amCount, dc.pmCount, cell, fromShift);
          if (!isSplitAssignmentAllowed(base, fromShift, day.dayOfWeek, day.minAm ?? 0)) {
            setToast((t('schedule.splitBlockedMinAm') as string) ?? 'Split would leave AM below minimum (2).');
            setTimeout(() => setToast(null), 6000);
            return;
          }
        }
      }
      if (newShift === cell.effectiveShift) {
        setPendingEdits((m) => {
          const next = new Map(m);
          next.delete(key);
          return next;
        });
        return;
      }
      setPendingEdits((m) => {
        const next = new Map(m);
        next.set(key, {
          newShift,
          originalEffectiveShift: cell.effectiveShift,
          overrideId: cell.overrideId,
          employeeName: getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale),
        });
        return next;
      });
    },
    [locale, ramadanRange, gridData, displayCounts, pendingEdits, t]
  );

  const applyLockedCellChange = useCallback(
    async (empId: string, date: string, cell: GridCell, value: string) => {
      if (value === lockedCellSelectValue(cell.availability)) return;
      const key = editKey(empId, date);
      setLockedCellSavingKey(key);
      const reason = globalReason.trim() || DEFAULT_REASON;
      try {
        if (value === LOCKED_FORCE_OFF) {
          const res = await fetch('/api/admin/employees/day-override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: empId,
              date,
              mode: 'FORCE_OFF',
              reason,
            }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error((d.error as string) || (t('common.failed') as string) || 'Failed');
          }
          await fetchGrid();
          return;
        }

        if (['MORNING', 'EVENING', 'SPLIT', 'NONE'].includes(value)) {
          if (
            value !== 'NONE' &&
            isFridayPmOnlyDay(date, ramadanRange) &&
            isOverrideShiftForbiddenOnDate(new Date(date + 'T12:00:00Z'), value)
          ) {
            setToast((t('schedule.fridayPmOnly') as string) ?? 'Friday is PM-only.');
            setTimeout(() => setToast(null), 6000);
            return;
          }
          const overrideRes = await fetch('/api/admin/employees/day-override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: empId,
              date,
              mode: 'FORCE_WORK',
              reason,
            }),
          });
          if (!overrideRes.ok) {
            const d = await overrideRes.json().catch(() => ({}));
            throw new Error((d.error as string) || (t('common.failed') as string) || 'Failed');
          }
          const saveRes = await fetch('/api/schedule/week/grid/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason,
              changes: [
                {
                  empId,
                  date,
                  newShift: value,
                  originalEffectiveShift: cell.effectiveShift,
                  overrideId: cell.overrideId,
                },
              ],
            }),
          });
          const saveData = await saveRes.json().catch(() => ({}));
          if (!saveRes.ok) {
            throw new Error((saveData.error as string) || (t('common.failed') as string) || 'Failed');
          }
          await fetchGrid();
          router.refresh();
        }
      } catch (e) {
        setInlineErrorBanner(e instanceof Error ? e.message : 'Update failed');
        setTimeout(() => setInlineErrorBanner(null), 6000);
      } finally {
        setLockedCellSavingKey(null);
      }
    },
    [fetchGrid, globalReason, ramadanRange, router, t]
  );

  const clearPendingEdit = useCallback((empId: string, date: string) => {
    setPendingEdits((m) => {
      const next = new Map(m);
      next.delete(editKey(empId, date));
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    setPendingEdits(new Map());
    setLeaveConfirm(null);
    setLocalPendingGuests([]);
    // Remove any locally added guest shifts that were not saved.
    setWeekGuests((prev) => prev.filter((g) => !g.id.startsWith('local-')));
  }, []);

  const focusDay = useCallback((date: string) => {
    const el = dayRefs.current[date];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      el.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
    }
  }, []);

  const suggestionPreview = useCallback(
    (s: ScheduleSuggestion) => {
      focusDay(s.date);
      setHighlightedCells(new Set(s.highlightCells));
      setTimeout(() => setHighlightedCells(null), 3000);
    },
    [focusDay]
  );

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedSuggestionIds((prev) => new Set(Array.from(prev).concat(id)));
  }, []);

  const applySuggestion = useCallback(
    async (s: ScheduleSuggestion) => {
      if (!gridData || s.affected.length === 0) return;
      const a = s.affected[0];
      const row = gridData.rows.find((r) => r.empId === a.empId);
      const cell = row?.cells.find((c) => c.date === s.date);
      if (!cell) return;
      setSaving(true);
      try {
        const res = await fetch('/api/schedule/week/grid/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: `Suggestion: ${s.reason.slice(0, 80)}`,
            changes: [
              {
                empId: a.empId,
                date: s.date,
                newShift: a.toShift,
                originalEffectiveShift: cell.effectiveShift,
                overrideId: cell.overrideId,
              },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setToast((data.error as string) || t('governance.scheduleLocked'));
          fetchWeekGovernance?.();
          fetchGrid();
          setTimeout(() => setToast(null), 5000);
          return;
        }
        if (res.status === 400 && (data.code === 'RAMADAN_PM_BLOCKED' || data.code === 'FRIDAY_PM_ONLY')) {
          setToast(locale === 'ar' ? (data.messageAr as string) : (data.code === 'FRIDAY_PM_ONLY' ? (t('schedule.fridayPmOnly') as string) : (t('schedule.ramadanPmBlocked') as string)));
          setTimeout(() => setToast(null), 5000);
          return;
        }
        const applied = data.applied ?? 0;
        setSuggestionConfirm(null);
        setDismissedSuggestionIds((prev) => new Set(Array.from(prev).concat(s.id)));
        fetchGrid();
        router.refresh();
        setToast(applied ? (t('schedule.savedChanges') as string)?.replace?.('{n}', '1') ?? 'Saved 1 change' : 'No change applied');
        setTimeout(() => setToast(null), 3000);
      } finally {
        setSaving(false);
      }
    },
    [gridData, fetchGrid, fetchWeekGovernance, t, locale, router]
  );

  const applyBatch = useCallback(async () => {
    const entries = Array.from(pendingEdits.entries());
    const guestAdds = localPendingGuests;
    if (entries.length === 0 && guestAdds.length === 0) return;

    if (gridData?.rows) {
      const leaveSet = new Set<string>();
      for (const row of gridData.rows) {
        for (const cell of row.cells) {
          if (cell.availability === 'LEAVE') leaveSet.add(editKey(row.empId, cell.date));
        }
      }
      for (const [key] of entries) {
        if (leaveSet.has(key)) {
          setToast('Cannot save: one or more shift changes are on a leave day. Remove those changes.');
          setTimeout(() => setToast(null), 6000);
          return;
        }
        const [, date] = key.split('|');
        const edit = pendingEdits.get(key);
        if (
          edit &&
          isFridayPmOnlyDay(date, ramadanRange) &&
          isOverrideShiftForbiddenOnDate(new Date(date + 'T12:00:00Z'), edit.newShift)
        ) {
          setToast((t('schedule.fridayPmOnly') as string) ?? 'Friday is PM-only. AM and Split Shift are not allowed.');
          setTimeout(() => setToast(null), 6000);
          return;
        }
      }
      for (const g of guestAdds) {
        if (leaveSet.has(editKey(g.empId, g.date))) {
          setToast('Cannot save: one or more external coverage additions are on a leave day.');
          setTimeout(() => setToast(null), 6000);
          return;
        }
        if (isFridayPmOnlyDay(g.date, ramadanRange) && g.shift === 'MORNING') {
          setToast((t('schedule.fridayPmOnly') as string) ?? 'Friday is PM-only. AM is not allowed.');
          setTimeout(() => setToast(null), 6000);
          return;
        }
      }
    }

    setSaving(true);
    setSaveProgress({ done: 0, total: entries.length + guestAdds.length });
    const reason = globalReason.trim() || DEFAULT_REASON;
    const guestWeekStart = resolveGuestWeekStart(weekStart);
    if (guestAdds.length > 0 && !guestWeekStart) {
      setToast(
        (t('schedule.weekStartRequired') as string) ??
          'Cannot save external coverage: the schedule week is not set. Select a week and try again.'
      );
      setSaving(false);
      setTimeout(() => setToast(null), 5000);
      return;
    }
    try {
      let appliedEdits = 0;
      let skippedEdits = 0;

      if (entries.length > 0) {
        const changes = entries.map(([key, edit]) => {
          const [empId, date] = key.split('|');
          return {
            empId,
            date,
            newShift: edit.newShift,
            originalEffectiveShift: edit.originalEffectiveShift,
            overrideId: edit.overrideId,
          };
        });

        const res = await fetch('/api/schedule/week/grid/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, changes }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 403) {
          setToast((data.error as string) || t('governance.scheduleLocked'));
          fetchWeekGovernance();
          fetchGrid();
          fetchGuests();
          setTimeout(() => setToast(null), 5000);
          return;
        }
        if (
          res.status === 400 &&
          (data.code === 'RAMADAN_PM_BLOCKED' || data.code === 'FRIDAY_PM_ONLY')
        ) {
          setToast(
            locale === 'ar'
              ? (data.messageAr as string)
              : (data.code === 'FRIDAY_PM_ONLY'
                  ? (t('schedule.fridayPmOnly') as string)
                  : (t('schedule.ramadanPmBlocked') as string))
          );
          setTimeout(() => setToast(null), 5000);
          return;
        }

        appliedEdits = data.applied ?? 0;
        skippedEdits = data.skipped ?? 0;
        setSaveProgress((p) => ({ ...p, done: entries.length }));
      }

      if (guestAdds.length > 0 && guestWeekStart) {
        for (const g of guestAdds) {
          const res = await fetch('/api/schedule/guests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekStart: guestWeekStart,
              date: g.date,
              employeeId: g.empId,
              shift: g.shift,
              reason: g.reason?.trim() || reason,
            }),
          });
          const data = await res.json().catch(() => ({}));

          if (res.status === 403 || res.status === 423) {
            setToast((data.error as string) || t('governance.scheduleLocked'));
            fetchWeekGovernance();
            fetchGrid();
            fetchGuests();
            setTimeout(() => setToast(null), 5000);
            return;
          }
          if (res.status === 202 && data.code === 'PENDING_APPROVAL') {
            setToast(
              (t('schedule.pendingApproval') as string) ??
                'External coverage submitted for manager approval.'
            );
            setTimeout(() => setToast(null), 5000);
            continue;
          }
          if (res.status === 400 && (data.code === 'RAMADAN_PM_BLOCKED' || data.code === 'FRIDAY_PM_ONLY')) {
            setToast(
              locale === 'ar'
                ? (data.messageAr as string)
                : (data.code === 'FRIDAY_PM_ONLY'
                    ? (t('schedule.fridayPmOnly') as string)
                    : (t('schedule.ramadanPmBlocked') as string))
            );
            setTimeout(() => setToast(null), 5000);
            return;
          }
          if (!res.ok) {
            setToast(
              (data.error as string) ||
                ((t('schedule.guestSaveFailed') as string) ?? 'Failed to save external coverage')
            );
            setTimeout(() => setToast(null), 4000);
            return;
          }

          setSaveProgress((p) => ({ ...p, done: Math.min(p.total, p.done + 1) }));
        }
      }

      setPendingEdits(new Map());
      setLocalPendingGuests([]);
      setWeekGuests((prev) => prev.filter((x) => !x.id.startsWith('local-')));
      setSaveModalOpen(false);
      setGlobalReason(DEFAULT_REASON);

      fetchGrid();
      router.refresh();
      fetchWeekGovernance();
      fetchGuests();

      const parts: string[] = [];
      if (entries.length > 0) {
        let msg =
          (t('schedule.savedChanges') as string)?.replace?.('{n}', String(appliedEdits)) ??
          `Saved ${appliedEdits} changes`;
        if (skippedEdits > 0) msg += `. ${skippedEdits} skipped (${t('schedule.fridayPmOnly')})`;
        parts.push(msg);
      }
      if (guestAdds.length > 0) {
        parts.push(`Guest coverage saved (${guestAdds.length})`);
      }
      setToast(parts.join('. ') || (t('schedule.savedChanges') as string) || 'Saved changes');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [
    pendingEdits,
    localPendingGuests,
    globalReason,
    weekStart,
    fetchGrid,
    fetchWeekGovernance,
    fetchGuests,
    t,
    locale,
    gridData,
    router,
    ramadanRange,
  ]);

  useEffect(() => {
    if (pendingCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingCount]);

  useEffect(() => {
    if (pendingCount === 0 || !canEdit) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="/"]');
      if (!anchor) return;
      const href = (anchor as HTMLAnchorElement).getAttribute('href');
      if (!href || href === pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveConfirm({ href });
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pendingCount, canEdit, pathname]);

  

  return (
    <div className="min-w-0 overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-5xl overflow-x-hidden px-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('week')}
              className={`h-9 md:h-10 rounded-lg px-4 font-medium ${tab === 'week' ? 'bg-accent text-white hover:bg-accent/90' : 'bg-surface border border-border text-foreground hover:bg-surface-subtle'}`}
            >
              {t('schedule.week')}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setTab('month')}
                className={`h-9 md:h-10 rounded-lg px-4 font-medium ${tab === 'month' ? 'bg-accent text-white hover:bg-accent/90' : 'bg-surface border border-border text-foreground hover:bg-surface-subtle'}`}
              >
                {t('schedule.month')}
              </button>
            )}
          </div>
          {tab === 'week' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  disabled={gridLoading}
                  title={t('schedule.previousWeek')}
                  className="h-9 md:h-10 rounded-lg border border-border bg-surface px-3 text-foreground hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                  aria-label={t('schedule.previousWeek')}
                >
                  <span aria-hidden>◀</span>
                </button>
                <span className="min-w-[200px] text-base font-medium text-foreground">
                  {(t('schedule.weekOf') ?? 'Week of {start} – {end}')
                    .replace('{start}', formatWeekRangeLabel(weekStart, locale).start)
                    .replace('{end}', formatWeekRangeLabel(weekStart, locale).end)}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  disabled={gridLoading}
                  title={t('schedule.nextWeek')}
                  className="h-9 md:h-10 rounded-lg border border-border bg-surface px-3 text-foreground hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                  aria-label={t('schedule.nextWeek')}
                >
                  <span aria-hidden>▶</span>
                </button>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(weekStartSaturday(e.target.value))}
                  className="rounded border border-border px-3 py-2 text-base"
                  aria-label={t('schedule.week')}
                />
                {scopeLabel && (
                  <span className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs text-muted">
                    {(t('schedule.scopeLabel') ?? 'Scope')}: {scopeLabel}
                  </span>
                )}
                <ScheduleFullExportButton weekStart={weekStart} disabled={gridLoading} />
              </div>
              {ramadanRange && (() => {
                const ramadanMode = gridData?.days.some((d) => isDateInRamadanRange(new Date(d.date + 'T12:00:00Z'), ramadanRange!)) ?? false;
                return (
                  <>
                    {ramadanMode && (
                      <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800">
                        {t('schedule.ramadanModeBanner')}
                      </span>
                    )}
                    <span className="rounded bg-surface-subtle px-2 py-1 text-xs font-mono text-muted" title="Ramadan env range">
                      {(t('schedule.ramadanDebug') ?? 'RamadanMode: {status} ({range}) · weekStart: {weekStart}')
                        .replace('{status}', ramadanMode ? 'ON' : 'OFF')
                        .replace('{range}', `${ramadanRange.start}–${ramadanRange.end}`)
                        .replace('{weekStart}', weekStart)}
                    </span>
                  </>
                );
              })()}
              {weekGovernance && (
                <span
                  className={`rounded px-2 py-1 text-sm font-medium ${weekGovernance.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-subtle text-muted'}`}
                  title={
                    weekGovernance.status === 'DRAFT'
                      ? (t('governance.tooltipDraft') ?? 'Draft — week not yet approved')
                      : weekGovernance.approvedByName && weekGovernance.approvedAt
                        ? `${t('governance.approvedBy') ?? 'Approved by'} ${weekGovernance.approvedByName}${weekGovernance.approvedByRole ? ` (${weekGovernance.approvedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.approvedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                        : (t('governance.tooltipApproved') ?? 'Approved — week can be locked')
                  }
                >
                  {weekGovernance.status === 'DRAFT' ? t('governance.draft') : t('governance.approved')}
                </span>
              )}
              {weekGovernance?.weekLock && (
                <span
                  className="rounded bg-rose-100 px-2 py-1 text-sm font-medium text-rose-800"
                  title={
                    weekGovernance.weekLock.lockedByName && weekGovernance.weekLock.lockedAt
                      ? `${t('governance.lockedBy')} ${weekGovernance.weekLock.lockedByName}${weekGovernance.weekLock.lockedByRole ? ` (${weekGovernance.weekLock.lockedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.weekLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                      : (t('governance.tooltipLocked') ?? 'Locked — schedule cannot be edited')
                  }
                >
                  🔒 {t('governance.locked') ?? 'Locked'}
                </span>
              )}
              {canEdit && !isWeekLocked && (
                <button
                  type="button"
                  onClick={() => setAddGuestOpen(true)}
                  className="rounded border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
                >
                  {t('schedule.addExternalCoverage') ?? 'Add External Coverage'}
                </button>
              )}
              {canLockUnlockDay(initialRole) && (
                <button
                  type="button"
                  onClick={() => setLockDayModal({ date: gridData?.days?.[0]?.date ?? weekStart, reason: '' })}
                  disabled={lockActionLoading}
                  className="rounded border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
                >
                  {t('governance.lockDay')}
                </button>
              )}
              {canLockWeek(initialRole) && !weekGovernance?.weekLock && weekGovernance?.status === 'APPROVED' && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/lock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: 'WEEK', weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        fetchGrid();
                        setToast(t('governance.weekLocked'));
                      } else {
                        const msg = data.code === 'KEY_CONTINUITY' && Array.isArray(data.errors)
                          ? data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join(' · ') || data.error
                          : (data.error as string) || t('governance.approveBeforeLock') || 'Week must be approved before it can be locked';
                        setToast(msg);
                      }
                      setTimeout(() => setToast(null), 4000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  {t('governance.lockWeek')}
                </button>
              )}
              {canUnlockWeek(initialRole) && weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/unlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: 'WEEK', weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        fetchGrid();
                        setToast(t('governance.weekUnlocked'));
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {t('governance.unlockWeek')}
                </button>
              )}
              {canApproveWeek(initialRole) && weekGovernance?.status === 'DRAFT' && !weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/approve-week', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        setToast(t('governance.weekApproved'));
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-emerald-300 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {t('governance.approveWeek')}
                </button>
              )}
              {initialRole === 'ADMIN' && weekGovernance?.status === 'APPROVED' && !weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/week/unapprove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        setToast(t('governance.weekUnapproved') ?? 'Week unapproved');
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {t('governance.unapproveWeek') ?? 'Unapprove week'}
                </button>
              )}
            </>
          )}
        {tab === 'month' && (
          <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, -1))}
                disabled={monthLoading}
                title={t('schedule.previousMonth')}
                className="rounded border border-border bg-surface p-2 text-foreground hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50"
                aria-label={t('schedule.previousMonth')}
              >
                <span aria-hidden>◀</span>
              </button>
              <span className="min-w-[140px] text-base font-medium text-foreground">
                {formatMonthYear(month, locale)}
              </span>
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, 1))}
                disabled={monthLoading}
                title={t('schedule.nextMonth')}
                className="rounded border border-border bg-surface p-2 text-foreground hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50"
                aria-label={t('schedule.nextMonth')}
              >
                <span aria-hidden>▶</span>
              </button>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded border border-border px-3 py-2 text-base"
                aria-label={t('schedule.month')}
              />
              <div className="inline-flex h-9 rounded-lg border border-border bg-surface-subtle p-0.5">
                <button
                  type="button"
                  onClick={() => setMonthMode('summary')}
                  className={`rounded-md px-3 text-sm font-medium transition-colors ${
                    monthMode === 'summary' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {t('editor.monthSummary') ?? 'Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => setMonthMode('excel')}
                  className={`rounded-md px-3 text-sm font-medium transition-colors ${
                    monthMode === 'excel' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {t('editor.monthExcelView') ?? 'Excel View'}
                </button>
              </div>
            </div>
          )}
          {canEdit && tab === 'week' && (
            <>
              {pendingCount > 0 && (
                <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800">
                  {(t('schedule.unsavedCount') as string)?.replace?.('{n}', String(pendingCount)) ?? `${pendingCount} changes`}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                disabled={pendingCount === 0}
                className="h-9 md:h-10 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('schedule.saveChanges') ?? 'Save changes'}
              </button>
              <button
                type="button"
                onClick={discardAll}
                disabled={pendingCount === 0}
                className="h-9 md:h-10 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('schedule.discardChanges') ?? 'Discard changes'}
              </button>
              <button
                type="button"
                onClick={() => setSwapWeeklyOffOpen(true)}
                className="h-9 md:h-10 rounded-lg border border-[#0F4C3A]/30 bg-[#0F4C3A]/5 px-4 text-sm font-medium text-[#0F4C3A] hover:bg-[#0F4C3A]/10 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/30 focus:ring-offset-2"
              >
                {t('schedule.swapWeeklyOff.button')}
              </button>
              <button
                type="button"
                onClick={() => setScheduleAssistantOpen(true)}
                className="h-9 md:h-10 rounded-lg border border-violet-300 bg-violet-50 px-4 text-sm font-medium text-violet-900 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2"
              >
                {t('schedule.assistant.button')}
              </button>
            </>
          )}
        </div>

        {tab === 'week' && isWeekLocked && (
          <div className="mb-4 flex items-center gap-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
            <span className="font-semibold">{t('governance.scheduleLocked')}</span>
            {weekGovernance?.weekLock && (
              <span className="text-rose-700">
                🔒 {t('governance.lockedBy')} {weekGovernance.weekLock.lockedByName ?? weekGovernance.weekLock.lockedByUserId} {t('common.on')}{' '}
                <span dir="ltr">{new Date(weekGovernance.weekLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                  dateStyle: 'short',
                })}</span>
              </span>
            )}
          </div>
        )}

        {tab === 'week' && gridData && keyPlan && keyPlan.days.length > 0 && (
          <CollapsibleKeyHolders
            keyPlan={keyPlan}
            keyPlanLocal={keyPlanLocal}
            keyPlanDirty={keyPlanDirty}
            keyPlanLoading={keyPlanLoading}
            canEdit={
              initialRole === 'ASSISTANT_MANAGER' ||
              initialRole === 'MANAGER' ||
              initialRole === 'ADMIN' ||
              initialRole === 'SUPER_ADMIN'
            }
            onLogHandover={() => setHandoverDialogOpen(true)}
            onLocalChange={(date, field, value) => {
              setKeyPlanLocal((prev) => prev.map((x) => (x.date === date ? { ...x, [field]: value } : x)));
              setKeyPlanDirty(true);
            }}
            onSave={async () => {
              const res = await fetch('/api/keys/week', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStart: keyPlan.weekStart,
                  assignments: keyPlanLocal.map((d) => ({
                    date: d.date,
                    amHolderEmpId: d.amHolderEmpId,
                    pmHolderEmpId: d.pmHolderEmpId,
                  })),
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok) {
                setKeyPlanDirty(false);
                fetchKeyPlan();
                setToast(t('schedule.keys.saved') ?? 'Key plan saved');
                setTimeout(() => setToast(null), 3000);
              } else {
                const msg =
                  data.code === 'KEY_CONTINUITY' && Array.isArray(data.errors)
                    ? data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join(' · ') || data.error
                    : (data.error as string) ?? 'Key plan validation failed';
                setToast(msg);
                setTimeout(() => setToast(null), 6000);
              }
            }}
            onCancel={() => {
              setKeyPlanLocal(
                keyPlan.days.map((d) => ({
                  ...d,
                  amHolderEmpId: d.amHolderEmpId ?? d.suggestedAmHolderEmpId ?? null,
                  pmHolderEmpId: d.pmHolderEmpId ?? d.suggestedPmHolderEmpId ?? null,
                }))
              );
              setKeyPlanDirty(false);
            }}
            formatDayShort={(date) => getDayShort(date, locale)}
            formatDate={formatDDMM}
            t={t}
          />
        )}

        {tab === 'week' && gridData && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorView === 'grid'}
                  onClick={() => setEditorView('grid')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${editorView === 'grid' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
                >
                  {t('editor.gridView') ?? 'Grid View'}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorView === 'excel'}
                  onClick={() => setEditorView('excel')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${editorView === 'excel' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
                >
                  {t('editor.excelView') ?? 'Excel View'}
                </button>
              </div>
              {editorView === 'excel' && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-subtle px-2 py-1">
                  <span className="text-xs text-muted">{t('editor.teamFilter') ?? 'Team:'}</span>
                  <select
                    value={teamFilterExcel}
                    onChange={(e) => setTeamFilterExcel(e.target.value as 'all' | 'A' | 'B')}
                    className="rounded border border-border bg-surface px-2 py-1 text-sm"
                  >
                    <option value="all">{t('editor.allEmployees') ?? 'All employees'}</option>
                    <option value="A">{t('schedule.teamA') ?? 'Team A'}</option>
                    <option value="B">{t('schedule.teamB') ?? 'Team B'}</option>
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'week' && gridData && (
        <div className="flex min-w-0 flex-col gap-4">
            {editorView === 'grid' && scheduleQualityMetrics && (
              <ScheduleQualityPanel metrics={scheduleQualityMetrics} t={t} />
            )}
            {editorView === 'grid' ? (
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                  <span className="font-medium">{t('schedule.coverage') ?? 'Shifts'}:</span>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">AM</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">PM</span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900">Split</span>
                </div>
                <div className="max-w-full overflow-hidden">
                  <LuxuryTable noScroll>
                    <LuxuryTableHead>
                      <LuxuryTh className="sticky left-0 z-10 w-[18%] min-w-0 bg-surface-subtle">
                        {t('schedule.day')}
                      </LuxuryTh>
                      {gridData.days.map((day) => {
                        const dayLock = lockedDayInfo[day.date];
                        return (
                          <LuxuryTh
                            key={day.date}
                            ref={(el) => {
                              dayRefs.current[day.date] = el;
                            }}
                            className="w-[11.7%] min-w-0 text-center"
                          >
                            <div className="font-medium">{getDayName(day.date, locale)}</div>
                            <div className="text-xs text-muted">{formatDDMM(day.date)}</div>
                            {dayLock && (
                              <div className="mt-1 flex flex-col items-center gap-0.5 text-xs text-rose-600">
                                <span
                                  title={`${t('governance.lockedBy')} ${dayLock.lockedByName ?? dayLock.lockedByUserId} ${t('common.on')} ${new Date(dayLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`}
                                >
                                  🔒 {dayLock.lockedByName ?? dayLock.lockedByUserId}
                                </span>
                                {canLockUnlockDay(initialRole) && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setLockActionLoading(true);
                                      try {
                                        const res = await fetch('/api/schedule/unlock', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ scope: 'DAY', date: day.date }),
                                        });
                                        if (res.ok) {
                                          fetchWeekGovernance();
                                          fetchGrid();
                                          setToast(t('governance.dayUnlocked'));
                                        }
                                        setTimeout(() => setToast(null), 3000);
                                      } finally {
                                        setLockActionLoading(false);
                                      }
                                    }}
                                    disabled={lockActionLoading}
                                    className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800 hover:bg-rose-200 disabled:opacity-50"
                                  >
                                    {t('governance.unlockDay')}
                                  </button>
                                )}
                              </div>
                            )}
                          </LuxuryTh>
                        );
                      })}
                    </LuxuryTableHead>
                    <LuxuryTableBody>
                      {gridData.rows
                        .slice()
                        .sort((a, b) => {
                          if (a.team !== b.team) return a.team.localeCompare(b.team);
                          return getEmployeeDisplayName({ name: a.name, nameAr: a.nameAr }, locale).localeCompare(
                            getEmployeeDisplayName({ name: b.name, nameAr: b.nameAr }, locale)
                          );
                        })
                        .map((row) => (
                          <tr key={row.empId}>
                            <LuxuryTd className="sticky left-0 z-10 w-[18%] min-w-0 bg-surface font-medium" title={`${getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale)} (${row.empId})`}>
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full text-[10px] font-semibold ${row.team === 'A' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}
                                  aria-label={row.team === 'A' ? t('schedule.teamA') : t('schedule.teamB')}
                                >
                                  {row.team}
                                </span>
                                                <span className="truncate" title={getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale)}>
                                  {getScheduleDisplayName(
                                    row.empId,
                                    getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale),
                                    scheduleDisplayNames
                                  )}
                                </span>
                              </span>
                            </LuxuryTd>
                            {row.cells.map((cell) => {
                              const locked = cell.availability !== 'WORK';
                              const key = editKey(row.empId, cell.date);
                              const edit = pendingEdits.get(key);
                              const draftShift = edit ? edit.newShift : cell.effectiveShift;
                              const isEdited = !!edit;
                              const hasOverride = !!cell.overrideId;
                              const isBase = !locked && !hasOverride;
                              const cellClass = [
                                'w-[11.7%] min-w-0 p-0 align-middle',
                                isEdited && 'ring-1 ring-sky-400 ring-inset',
                                highlightedCells?.has(key) && 'ring-2 ring-green-500 bg-green-50',
                                isBase && 'bg-surface-subtle/60',
                                hasOverride && !isEdited && 'border-l-2 border-sky-400 bg-sky-50/50',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <LuxuryTd key={cell.date} className={cellClass}>
                                  {locked ? (
                                    canEdit && !lockedDaySet.has(cell.date) ? (
                                      <div className="flex h-9 items-center justify-center px-1">
                                        <ScheduleCellSelect
                                          compact
                                          value={lockedCellSelectValue(cell.availability)}
                                          options={buildLockedCellOptions(cell, cell.date, ramadanRange ?? null, t)}
                                          disabled={lockedCellSavingKey === editKey(row.empId, cell.date)}
                                          onChange={(val) => {
                                            void applyLockedCellChange(row.empId, cell.date, cell, val);
                                          }}
                                          className="max-w-[96px] text-center"
                                        />
                                      </div>
                                    ) : (
                                      <div className={`flex h-9 items-center justify-center bg-surface-subtle px-2 text-center ${SCHEDULE_UI.guestLine} text-muted`}>
                                        <span>{lockedCellStatusLabel(cell.availability, t)}</span>
                                      </div>
                                    )
                                  ) : canEdit && !lockedDaySet.has(cell.date) ? (
                                    <div
                                      className="relative flex min-h-9 flex-col items-center justify-center gap-0.5 px-1 py-0.5"
                                      title={isFriday(cell.date) ? t('schedule.fridayPmOnly') : undefined}
                                    >
                                      {(() => {
                                        const shiftOptions = buildEditorShiftOptions({
                                          date: cell.date,
                                          ramadanRange: ramadanRange ?? null,
                                          t,
                                        });
                                        const options = [...shiftOptions];
                                        if (isEdited || hasOverride) {
                                          options.push({ value: 'RESET', label: t('schedule.resetToBase') ?? 'Reset to Base' });
                                        }
                                        return (
                                          <ScheduleCellSelect
                                            compact
                                            value={draftShift}
                                            options={options}
                                            onChange={(val) => {
                                              if (val === 'RESET') {
                                                clearPendingEdit(row.empId, cell.date);
                                                return;
                                              }
                                              addPendingEdit(row.empId, cell.date, val as EditableShift, row, cell);
                                            }}
                                            className="max-w-[84px] text-center"
                                          />
                                        );
                                      })()}
                                      <ScheduleShiftCellHint
                                        availability={cell.availability}
                                        shift={draftShift}
                                        segments={cell.segments}
                                        t={t}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className="flex h-9 flex-col items-center justify-center gap-0.5 px-2 text-sm"
                                      title={
                                        lockedDaySet.has(cell.date) && lockedDayInfo[cell.date]
                                          ? `${t('governance.lockedBy')} ${
                                              lockedDayInfo[cell.date].lockedByName ??
                                              lockedDayInfo[cell.date].lockedByUserId
                                            } on ${new Date(
                                              lockedDayInfo[cell.date].lockedAt
                                            ).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                                              dateStyle: 'short',
                                            })}`
                                          : undefined
                                      }
                                    >
                                      {lockedDaySet.has(cell.date) && (
                                        <span className="text-rose-600" aria-hidden>
                                          🔒
                                        </span>
                                      )}
                                      {draftShift === 'MORNING' ||
                                      draftShift === 'EVENING' ||
                                      draftShift === 'SPLIT' ? (
                                        <ScheduleShiftReadOnlyBadge shift={draftShift} segments={cell.segments} t={t} />
                                      ) : null}
                                    </div>
                                  )}
                                </LuxuryTd>
                              );
                            })}
                          </tr>
                        ))}
                      {guestsBySource.map(([sourceId, { sourceBoutiqueName, guests: sourceGuests }]) => {
                        const byDate = new Map<string, GuestItem[]>();
                        for (const g of sourceGuests) {
                          const d = typeof g.date === 'string' ? g.date : (g.date as Date)?.toISOString?.()?.slice(0, 10) ?? '';
                          const list = byDate.get(d) ?? [];
                          list.push(g);
                          byDate.set(d, list);
                        }
                        return (
                          <tr key={sourceId || 'external'} className="border-t-2 border-border bg-surface-subtle">
                            <LuxuryTd className="sticky left-0 z-10 w-[18%] min-w-0 bg-surface-subtle border-r border-border py-2 font-medium text-foreground">
                              {sourceBoutiqueName} Coverage
                            </LuxuryTd>
                            {gridData.days.map((day) => {
                              const guests = byDate.get(day.date) ?? [];
                              const locked = !canEdit || lockedDaySet.has(day.date);
                              return (
                                <LuxuryTd key={day.date} className="w-[11.7%] min-w-0 align-top p-2">
                                  <div className="flex flex-col gap-1 items-start">
                                    {guests.map((g) => {
                                      const guestDate =
                                        typeof g.date === 'string'
                                          ? g.date
                                          : (g.date as Date)?.toISOString?.()?.slice(0, 10) ?? day.date;
                                      const shiftOptions = buildEditorShiftOptions({
                                        date: guestDate,
                                        ramadanRange: ramadanRange ?? null,
                                        t,
                                      });
                                      return (
                                        <div key={g.id} className="flex w-full flex-col gap-0.5">
                                          <span className="truncate text-[10px] font-medium text-foreground">
                                            {getEmployeeDisplayName(g.employee, locale)}
                                          </span>
                                          <select
                                            value={g.shift}
                                            onChange={(e) => handleGuestShiftChange(g, e.target.value)}
                                            disabled={locked || removingGuestId === g.id}
                                            className="min-w-0 w-full max-w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                                          >
                                            <option value="__delete__">{t('common.delete') ?? 'Delete'}</option>
                                            {shiftOptions.map((opt) => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </LuxuryTd>
                              );
                            })}
                          </tr>
                        );
                      })}
                      <tr className="bg-surface-subtle font-medium">
                        <LuxuryTd className="sticky left-0 z-10 bg-surface-subtle">AM</LuxuryTd>
                        {displayCounts.map((c, i) => {
                          const day = gridData.days[i];
                          const am = c.amCount;
                          const pm = c.pmCount;
                          const amGtPm = am > pm;
                          const amLtMin = day && am < day.minAm;
                          const highlight = amGtPm || amLtMin;
                          return (
                            <LuxuryTd
                              key={gridData.days[i]?.date ?? i}
                              className={`text-center ${highlight ? 'bg-amber-100 text-amber-900' : ''}`}
                            >
                              {am}
                            </LuxuryTd>
                          );
                        })}
                      </tr>
                      <tr className="bg-surface-subtle font-medium">
                        <LuxuryTd className="sticky left-0 z-10 bg-surface-subtle">PM</LuxuryTd>
                        {displayCounts.map((c, i) => {
                          const am = c.amCount;
                          const pm = c.pmCount;
                          const amGtPm = am > pm;
                          return (
                            <LuxuryTd
                              key={gridData.days[i]?.date ?? i}
                              className={`text-center ${amGtPm ? 'bg-amber-100 text-amber-900' : ''}`}
                            >
                              {pm}
                            </LuxuryTd>
                          );
                        })}
                      </tr>
                    </LuxuryTableBody>
                  </LuxuryTable>
                </div>
              </div>
            ) : null}

            {editorView === 'excel' ? (
              <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                <ScheduleEditExcelViewClient
                  gridData={{
                    days: gridData.days,
                    rows: gridData.rows,
                    counts: displayCounts,
                  }}
                  displayNameMap={scheduleDisplayNames}
                  weekGuests={externalGuests}
                  coverageHeaderLabel={coverageHeaderLabel}
                  onRemoveGuestShift={handleRemoveGuestShift}
                  removingGuestId={removingGuestId}
                  getDraftShift={getDraftShift}
                  getRowAndCell={getRowAndCell}
                  addPendingEdit={addPendingEdit}
                  canEdit={canEdit}
                  lockedDaySet={lockedDaySet}
                  formatDDMM={formatDDMM}
                  getDayName={(d: string) => getDayName(d, locale)}
                  getDayShort={(d: string) => getDayShort(d, locale)}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        )}

        {tab === 'week' && gridData && (
          <div className="mt-4 space-y-4">
            {canEdit && effectiveSuggestions.length > 0 && (
              <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {t('schedule.suggestions') ?? 'Suggestions'}
                </h3>
                <div className="mb-2 flex flex-wrap gap-1">
                  {effectiveSuggestions.some((s) => s.type === 'MOVE' && !dismissedSuggestionIds.has(s.id)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuggestionConfirm(
                          effectiveSuggestions.find(
                            (s) => s.type === 'MOVE' && !dismissedSuggestionIds.has(s.id)
                          )!
                        )
                      }
                      className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-200"
                    >
                      {t('schedule.quickFixMoveAmPm') ?? 'Move 1 from AM → PM'}
                    </button>
                  )}
                  {effectiveSuggestions.some((s) => s.type === 'REMOVE_COVER' && !dismissedSuggestionIds.has(s.id)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuggestionConfirm(
                          effectiveSuggestions.find(
                            (s) => s.type === 'REMOVE_COVER' && !dismissedSuggestionIds.has(s.id)
                          )!
                        )
                      }
                      className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                    >
                      {t('schedule.quickFixRemoveRashid') ?? 'Remove Rashid coverage'}
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {effectiveSuggestions
                    .filter((s) => !dismissedSuggestionIds.has(s.id))
                    .map((s) => (
                      <li key={s.id} className="rounded border border-border bg-surface-subtle p-2 text-xs">
                        <span className="font-medium text-foreground">{formatDDMM(s.date)}</span>
                        <span className="ms-1 rounded bg-surface-subtle px-1 py-0.5">{t(SUGGESTION_TYPE_KEYS[s.type] ?? '') || s.type}</span>
                        <p className="mt-1 text-muted">{s.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => suggestionPreview(s)}
                            className="rounded bg-surface-subtle px-2 py-1 text-foreground hover:bg-surface-subtle"
                          >
                            {t('schedule.suggestionPreview') ?? 'Preview'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSuggestionConfirm(s)}
                            className="rounded bg-accent px-2 py-1 text-white hover:bg-accent/90"
                          >
                            {t('schedule.suggestionApply') ?? 'Apply'}
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissSuggestion(s.id)}
                            className="rounded bg-surface-subtle px-2 py-1 text-foreground hover:bg-surface-subtle"
                          >
                            {t('schedule.suggestionDismiss') ?? 'Dismiss'}
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t('governance.auditThisWeek') ?? 'Audit (this week)'}
              </h3>
              {auditItems.length === 0 ? (
                <p className="text-xs text-muted">{t('governance.noAuditEntries') ?? 'No entries.'}</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-muted">
                  {auditItems.slice(0, 10).map((item) => {
                    const expanded = auditExpanded.has(item.id);
                    const summary = formatAuditBeforeAfter(item.beforeJson, item.afterJson, t);
                    return (
                      <li
                        key={item.id}
                        className={`rounded px-2 py-1.5 ${auditActionColor(item.action)}`}
                      >
                        <button
                          type="button"
                          className="w-full text-start"
                          onClick={() =>
                            setAuditExpanded((s) => {
                              const next = new Set(s);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          <span className="font-medium text-foreground">
                            {t(AUDIT_ACTION_KEYS[item.action] ?? '') || item.action}
                          </span>
                          <span className="ms-1 text-muted">
                            {new Date(item.createdAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          <span className="ms-1 text-muted">{expanded ? '▼' : '▶'}</span>
                        </button>
                        {expanded && (
                          <div className="mt-1.5 space-y-0.5 border-l-2 border-border pl-1">
                            {item.actor && (
                              <p className="text-muted">
                                {item.actor.name}{' '}
                                <span className="text-muted">({getRoleDisplayLabel(item.actor.role as Role, null, t)})</span>
                              </p>
                            )}
                            {item.entityId && (
                              <p className="text-muted">
                                {t('governance.affected') ?? 'Affected'}: {item.entityId}
                              </p>
                            )}
                            {summary && <p className="text-muted">{summary}</p>}
                            {item.reason != null && item.reason !== '' && (
                              <p className="font-medium text-foreground">{item.reason}</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <a
                href="/schedule/audit"
                className="mt-2 inline-block text-xs font-medium text-accent hover:text-accent"
              >
                {t('governance.viewFullAudit') ?? 'View full audit →'}
              </a>
            </div>

            {canEdit && (
              <CompactScheduleWarnings
                grouped={groupedWarnings}
                coverageSummaries={coverageSummaries}
                daysNeedingAttention={daysNeedingAttention}
                formatDate={formatDDMM}
                onFocusDay={focusDay}
                t={t}
              />
            )}
          </div>
        )}

        {tab === 'month' && monthData && monthMode === 'summary' && (
          <div className="overflow-hidden">
            <LuxuryTable>
              <LuxuryTableHead>
                <LuxuryTh>{t('common.date')}</LuxuryTh>
                <LuxuryTh>AM</LuxuryTh>
                <LuxuryTh>PM</LuxuryTh>
                <LuxuryTh>{t('common.reason')}</LuxuryTh>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {monthData.days.map((day) => {
                  const hasWarnings = day.warnings.length > 0;
                  return (
                    <tr key={day.date}>
                      <LuxuryTd>
                        <span className="inline-flex items-center gap-1">
                          {formatDDMM(day.date)}
                          {hasWarnings && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
                              ⚠
                            </span>
                          )}
                        </span>
                      </LuxuryTd>
                      <LuxuryTd>{day.amCount}</LuxuryTd>
                      <LuxuryTd>{day.pmCount}</LuxuryTd>
                      <LuxuryTd className="text-amber-700">{day.warnings.length > 0 ? day.warnings.join('; ') : '—'}</LuxuryTd>
                    </tr>
                  );
                })}
              </LuxuryTableBody>
            </LuxuryTable>
          </div>
        )}

        {tab === 'month' && monthMode === 'excel' && (
          <>
            {monthExcelLoading && (
              <p className="text-muted">
                {typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}
              </p>
            )}
            {!monthExcelLoading && monthExcelData && (
              <div className="mt-2">
                <ScheduleEditMonthExcelViewClient
                  month={monthExcelData.month}
                  dayRows={monthExcelData.dayRows}
                  formatDDMM={formatDDMM}
                  t={t}
                />
              </div>
            )}
          </>
        )}

        {tab === 'week' && !gridData && (
          <p className="text-muted">{typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}</p>
        )}
      </div>

      {suggestionConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !saving && setSuggestionConfirm(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-foreground">{t('schedule.suggestionApply') ?? 'Apply suggestion'}</h4>
            <p className="mt-2 text-sm text-muted">{suggestionConfirm.reason}</p>
            <ul className="mt-2 text-sm text-foreground">
              {suggestionConfirm.affected.map((a) => (
                <li key={a.empId}>
                  {a.name}: {a.fromShift} → {a.toShift}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuggestionConfirm(null)}
                disabled={saving}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => applySuggestion(suggestionConfirm)}
                disabled={saving}
                className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {saving ? '…' : (t('schedule.suggestionApply') ?? 'Apply')}
              </button>
            </div>
          </div>
        </>
      )}

      {saveModalOpen && canEdit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !saving && setSaveModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-foreground">
              {(t('schedule.saveConfirmTitle') as string)?.replace?.('{n}', String(pendingCount)) ?? `Apply ${pendingCount} changes?`}
            </h4>
            <p className="mt-2 text-sm text-muted">{t('schedule.saveConfirmSubtitle') ?? 'Summary of changes:'}</p>
            <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-surface-subtle p-2 text-sm">
              {Array.from(pendingEdits.entries()).map(([key, edit]) => {
                const [, date] = key.split('|');
                const from = shiftToCompactLabel(edit.originalEffectiveShift, t);
                const to = shiftToCompactLabel(edit.newShift, t);
                return (
                  <li key={key} className="flex justify-between gap-2 py-0.5">
                    <span className="text-foreground">{formatDDMM(date)} {edit.employeeName}</span>
                    <span className="text-muted">{from} → {to}</span>
                  </li>
                );
              })}
              {localPendingGuests.map((g) => (
                <li key={g.id} className="flex justify-between gap-2 py-0.5">
                  <span className="text-foreground">{formatDDMM(g.date)} {getEmployeeDisplayName(g.employee, locale)}</span>
                  <span className="text-muted">
                    Add External → {g.shift === 'MORNING' ? 'AM' : 'PM'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground">{t('common.reason')}</label>
              <input
                type="text"
                value={globalReason}
                onChange={(e) => setGlobalReason(e.target.value)}
                placeholder={t('editor.saveReasonPlaceholder') || DEFAULT_REASON}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent md:h-10"
                disabled={saving}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setSaveModalOpen(false)}
                disabled={saving}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={applyBatch}
                disabled={saving}
                className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {saving ? `${saveProgress.done} / ${saveProgress.total}…` : (t('schedule.saveChanges') ?? 'Save changes')}
              </button>
            </div>
          </div>
        </>
      )}

      {addGuestOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !guestSubmitting && setAddGuestOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-foreground">{t('schedule.addExternalCoverage') ?? 'Add External Coverage'}</h4>
            <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-foreground">Source boutique</label>
                  <select
                    value={selectedSourceBoutiqueId}
                    onChange={(e) => setSelectedSourceBoutiqueId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    disabled={guestSubmitting}
                  >
                    <option value="">—</option>
                    {sourceBoutiques.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">{t('schedule.employee') ?? 'Employee'}</label>
                  <select
                    value={guestForm.empId}
                    onChange={(e) => setGuestForm((f) => ({ ...f, empId: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    disabled={guestSubmitting || guestLoading}
                  >
                    <option value="">{guestLoading ? '…' : '—'}</option>
                    {guestEmployees.map((e) => (
                      <option key={e.empId} value={e.empId}>
                        {e.empId} — {e.name}{e.boutiqueName ? ` (${e.boutiqueName})` : ''}
                      </option>
                    ))}
                  </select>
                  {guestError && (
                    <p className="mt-1 text-xs text-red-600">{guestError}</p>
                  )}
                  {!guestLoading && !guestError && guestEmployees.length === 0 && selectedSourceBoutiqueId && (
                    <p className="mt-1 text-xs text-muted">No external employees found.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">{t('schedule.day') ?? 'Day'}</label>
                  <select
                    value={weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0]}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setGuestForm((f) => ({
                        ...f,
                        date: nextDate,
                        shift:
                          isFridayPmOnlyDay(nextDate, ramadanRange) && f.shift === 'MORNING'
                            ? 'EVENING'
                            : f.shift,
                      }));
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    disabled={guestSubmitting}
                  >
                    {weekDates.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">{t('schedule.shift') ?? 'Shift'}</label>
                  <select
                    value={guestForm.shift}
                    onChange={(e) =>
                      setGuestForm((f) => ({
                        ...f,
                        shift: e.target.value as 'MORNING' | 'EVENING' | 'SPLIT',
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    disabled={guestSubmitting}
                  >
                    {buildEditorShiftOptions({
                      date: weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0] ?? '',
                      ramadanRange: ramadanRange ?? null,
                      t,
                    }).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {isFridayPmOnlyDay(
                    weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0] ?? '',
                    ramadanRange
                  ) && (
                    <p className="mt-1 text-xs text-muted">{t('schedule.fridayPmOnly')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">{t('common.reason')}</label>
                  <input
                    type="text"
                    value={guestForm.reason}
                    onChange={(e) => setGuestForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder={t('schedule.guestReasonPlaceholder') || 'Coverage / branch visit'}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    disabled={guestSubmitting}
                  />
                </div>
              </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !guestSubmitting && setAddGuestOpen(false)}
                disabled={guestSubmitting}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={guestSubmitting || guestLoading || !guestForm.empId || !guestForm.date || !guestForm.reason.trim()}
                onClick={async () => {
                  const date = weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0];
                  if (!guestForm.empId || !date || !guestForm.reason.trim()) return;
                  if (!resolveGuestWeekStart(weekStart)) {
                    setToast(
                      (t('schedule.weekStartRequired') as string) ??
                        'Select a valid schedule week before adding external coverage.'
                    );
                    setTimeout(() => setToast(null), 5000);
                    return;
                  }
                  const shift =
                    isFridayPmOnlyDay(date, ramadanRange) && guestForm.shift === 'MORNING'
                      ? 'EVENING'
                      : guestForm.shift;
                  setGuestSubmitting(true);
                  try {
                    // Draft-only add: external coverage must be persisted via unified "Save changes".
                    const exists = weekGuests.some(
                      (g) =>
                        g.empId === guestForm.empId &&
                        g.date === date &&
                        g.shift === shift &&
                        (g.sourceBoutiqueId ?? '') === selectedSourceBoutiqueId
                    );
                    if (exists) {
                      setToast('Guest coverage already added to draft changes.');
                      setTimeout(() => setToast(null), 3000);
                      setAddGuestOpen(false);
                      return;
                    }

                    const sourceBoutique =
                      sourceBoutiques.find((b) => b.id === selectedSourceBoutiqueId) ?? null;
                    const emp =
                      guestEmployees.find((e) => e.empId === guestForm.empId) ?? null;

                    const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                    const newGuest: GuestItem = {
                      id: localId,
                      date,
                      empId: guestForm.empId,
                      shift,
                      reason: guestForm.reason.trim(),
                      sourceBoutiqueId: selectedSourceBoutiqueId,
                      sourceBoutique: sourceBoutique
                        ? { id: sourceBoutique.id, name: sourceBoutique.name }
                        : null,
                      isExternal: true,
                      employee: {
                        name: emp?.name ?? guestForm.empId,
                        homeBoutiqueCode: '',
                        homeBoutiqueName: emp?.boutiqueName ?? undefined,
                      },
                    };

                    setLocalPendingGuests((prev) => [...prev, newGuest]);
                    setWeekGuests((prev) => [...prev, newGuest]);
                    setAddGuestOpen(false);
                    setToast('Guest added to pending changes. Click "Save changes" to persist.');
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setGuestSubmitting(false);
                  }
                }}
                className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {guestSubmitting ? '…' : (t('schedule.add') ?? 'Add')}
              </button>
            </div>
          </div>
        </>
      )}

      {leaveConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <p className="text-sm font-medium leading-6 text-foreground">
              {t('schedule.unsavedLeaveMessage') ?? 'You have unsaved changes. Leave anyway?'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeaveConfirm(null)}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('schedule.stay') ?? 'Stay'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = leaveConfirm?.href ?? '';
                  setLeaveConfirm(null);
                  discardAll();
                  if (href) window.location.href = href;
                }}
                className="h-9 rounded-lg bg-amber-600 px-4 font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                {t('schedule.leaveAnyway') ?? 'Leave anyway'}
              </button>
            </div>
          </div>
        </>
      )}

      {gridData && (
        <SwapWeeklyOffModal
          open={swapWeeklyOffOpen}
          onClose={() => setSwapWeeklyOffOpen(false)}
          weekStart={gridData.weekStart}
          days={gridData.days}
          rows={gridData.rows}
          scheduleDisplayNames={scheduleDisplayNames}
          onSuccess={() => {
            fetchGrid();
            setToast(t('schedule.swapWeeklyOff.success') as string);
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}

      {gridData && (
        <ScheduleAssistantModal
          open={scheduleAssistantOpen}
          onClose={() => setScheduleAssistantOpen(false)}
          weekStart={gridData.weekStart}
          onApplied={() => {
            fetchGrid();
            router.refresh();
            setToast(t('schedule.assistant.applied') as string);
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}

      {lockDayModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !lockActionLoading && setLockDayModal(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-foreground">{t('governance.lockDay')}</h4>
            <div className="mt-3">
              <label className="block text-sm font-medium text-foreground">{t('schedule.day')} (YYYY-MM-DD)</label>
              <input
                type="date"
                value={lockDayModal.date}
                onChange={(e) => setLockDayModal((m) => (m ? { ...m, date: e.target.value } : null))}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent md:h-10"
                disabled={lockActionLoading}
              />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-foreground">{t('common.reason')}</label>
              <input
                type="text"
                value={lockDayModal.reason}
                onChange={(e) => setLockDayModal((m) => (m ? { ...m, reason: e.target.value } : null))}
                placeholder={t('governance.reasonOptional')}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent md:h-10"
                disabled={lockActionLoading}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !lockActionLoading && setLockDayModal(null)}
                disabled={lockActionLoading}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={lockActionLoading}
                onClick={async () => {
                  if (!lockDayModal) return;
                  setLockActionLoading(true);
                  try {
                    const res = await fetch('/api/schedule/lock', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scope: 'DAY', date: lockDayModal.date, reason: lockDayModal.reason.trim() || null }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                      setLockDayModal(null);
                      fetchWeekGovernance();
                      fetchGrid();
                      setToast(t('governance.dayLocked'));
                    } else setToast((data.error as string) || 'Failed');
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setLockActionLoading(false);
                  }
                }}
                className="h-9 rounded-lg bg-red-600 px-4 font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {lockActionLoading ? '…' : t('governance.lockDay')}
              </button>
            </div>
          </div>
        </>
      )}

      {handoverDialogOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !handoverSubmitting && setHandoverDialogOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-foreground">{t('schedule.keys.logHandover') ?? 'Log handover'}</h4>
            <div className="mt-3">
              <label className="block text-sm font-medium text-foreground">{t('schedule.keys.keyNumber') ?? 'Key'}</label>
              <select
                value={handoverForm.keyNumber}
                onChange={(e) => setHandoverForm((f) => ({ ...f, keyNumber: Number(e.target.value) as 1 | 2 }))}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={handoverSubmitting}
              >
                <option value={1}>Key #1</option>
                <option value={2}>Key #2</option>
              </select>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-foreground">{t('schedule.keys.handoverTo') ?? 'Hand over to'}</label>
              <select
                value={handoverForm.toEmployeeId}
                onChange={(e) => setHandoverForm((f) => ({ ...f, toEmployeeId: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={handoverSubmitting}
              >
                <option value="">—</option>
                {gridData?.rows?.map((r) => (
                  <option key={r.empId} value={r.empId}>{r.name}</option>
                )) ?? null}
              </select>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-foreground">{t('schedule.keys.note') ?? 'Note'}</label>
              <input
                type="text"
                value={handoverForm.note}
                onChange={(e) => setHandoverForm((f) => ({ ...f, note: e.target.value }))}
                placeholder={t('common.optional') ?? 'Optional'}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={handoverSubmitting}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !handoverSubmitting && setHandoverDialogOpen(false)}
                disabled={handoverSubmitting}
                className="h-9 rounded-lg border border-border bg-surface px-4 font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={handoverSubmitting || !handoverForm.toEmployeeId}
                onClick={async () => {
                  setHandoverSubmitting(true);
                  try {
                    const res = await fetch('/api/keys/handover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        keyNumber: handoverForm.keyNumber,
                        toEmployeeId: handoverForm.toEmployeeId,
                        note: handoverForm.note.trim() || undefined,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                      setHandoverDialogOpen(false);
                      setHandoverForm({ keyNumber: 1, toEmployeeId: '', note: '' });
                      fetchKeyPlan();
                      setToast(t('schedule.keys.handoverLogged') ?? 'Handover logged');
                      setTimeout(() => setToast(null), 3000);
                    } else {
                      setToast((data.error as string) ?? 'Failed');
                      setTimeout(() => setToast(null), 4000);
                    }
                  } finally {
                    setHandoverSubmitting(false);
                  }
                }}
                className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {handoverSubmitting ? '…' : (t('schedule.keys.submitHandover') ?? 'Submit')}
              </button>
            </div>
          </div>
        </>
      )}

      {inlineErrorBanner && (
        <div
          className="fixed start-1/2 top-20 z-50 max-w-md -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-900 shadow-md"
          role="alert"
          aria-live="assertive"
        >
          {inlineErrorBanner}
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-4 end-4 z-50 rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-900 shadow"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
