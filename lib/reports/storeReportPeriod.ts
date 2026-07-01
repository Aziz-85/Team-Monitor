import {
  getCurrentMonthKeyRiyadh,
  getDaysInMonth,
  getRiyadhNow,
  normalizeMonthKey,
  parseMonthKey,
  toRiyadhDateString,
} from '@/lib/time';

export type StoreReportPeriodKind = 'month' | 'quarter' | 'half' | 'year';

export type StoreReportPeriodQuery = {
  kind: StoreReportPeriodKind;
  year: number;
  month?: number;
  quarter?: 1 | 2 | 3 | 4;
  half?: 1 | 2;
};

export type StoreReportPeriodBounds = {
  monthKeys: string[];
  chartMonthKeys: string[];
  fromDateKey: string;
  toDateKey: string;
  anchorMonthKey: string;
  isInProgress: boolean;
  showClosingExpectation: boolean;
  periodLabel: string;
};

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAMES_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function clampYear(year: number): number {
  const now = getRiyadhNow();
  const current = now.getFullYear();
  if (!Number.isFinite(year)) return current;
  return Math.min(Math.max(Math.trunc(year), 2020), current + 1);
}

function parseIntParam(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function getDefaultStoreReportPeriodQuery(): StoreReportPeriodQuery {
  const mk = getCurrentMonthKeyRiyadh();
  const parsed = parseMonthKey(mk)!;
  return { kind: 'month', year: parsed.y, month: parsed.m };
}

export function storeReportPeriodFromMonthKey(monthKey: string): StoreReportPeriodQuery {
  const mk = normalizeMonthKey(monthKey);
  const parsed = parseMonthKey(mk);
  if (!parsed) return getDefaultStoreReportPeriodQuery();
  return { kind: 'month', year: parsed.y, month: parsed.m };
}

export function parseStoreReportPeriodFromSearchParams(
  sp: Record<string, string | string[] | undefined>
): StoreReportPeriodQuery {
  const get = (key: string): string | undefined => {
    const v = sp[key];
    return typeof v === 'string' ? v : undefined;
  };

  const legacyMonth = get('month');
  if (legacyMonth?.trim() && !get('period')) {
    return storeReportPeriodFromMonthKey(legacyMonth.trim());
  }

  const now = getRiyadhNow();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const year = clampYear(parseIntParam(get('year'), currentYear));

  const kindRaw = get('period');
  const kind: StoreReportPeriodKind =
    kindRaw === 'quarter' || kindRaw === 'half' || kindRaw === 'year' || kindRaw === 'month'
      ? kindRaw
      : 'month';

  if (kind === 'quarter') {
    const q = parseIntParam(get('quarter'), Math.ceil(currentMonth / 3)) as 1 | 2 | 3 | 4;
    const quarter = Math.min(4, Math.max(1, q)) as 1 | 2 | 3 | 4;
    return { kind, year, quarter };
  }

  if (kind === 'half') {
    const h = parseIntParam(get('half'), currentMonth <= 6 ? 1 : 2) as 1 | 2;
    const half = h === 2 ? 2 : 1;
    return { kind, year, half };
  }

  if (kind === 'year') {
    return { kind, year };
  }

  const monthParam = get('month');
  if (monthParam?.includes('-')) {
    return storeReportPeriodFromMonthKey(monthParam);
  }
  const month = Math.min(12, Math.max(1, parseIntParam(monthParam, currentMonth)));
  return { kind: 'month', year, month };
}

export function getMonthKeysForPeriod(query: StoreReportPeriodQuery): string[] {
  const { year } = query;
  if (query.kind === 'month' && query.month) {
    return [monthKey(year, query.month)];
  }
  if (query.kind === 'quarter' && query.quarter) {
    const start = (query.quarter - 1) * 3 + 1;
    return [start, start + 1, start + 2].map((m) => monthKey(year, m));
  }
  if (query.kind === 'half' && query.half) {
    const start = query.half === 1 ? 1 : 7;
    return Array.from({ length: 6 }, (_, i) => monthKey(year, start + i));
  }
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

export function formatStoreReportPeriodLabel(
  query: StoreReportPeriodQuery,
  locale: 'en' | 'ar' = 'en'
): string {
  const names = locale === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
  const { year } = query;

  if (query.kind === 'month' && query.month) {
    return `${names[query.month - 1] ?? query.month} ${year}`;
  }
  if (query.kind === 'quarter' && query.quarter) {
    return locale === 'ar' ? `الربع ${query.quarter} ${year}` : `Q${query.quarter} ${year}`;
  }
  if (query.kind === 'half' && query.half) {
    if (locale === 'ar') {
      return query.half === 1 ? `النصف الأول ${year}` : `النصف الثاني ${year}`;
    }
    return query.half === 1 ? `H1 ${year}` : `H2 ${year}`;
  }
  return String(year);
}

export function getStoreReportPeriodBounds(
  query: StoreReportPeriodQuery,
  todayKey?: string
): StoreReportPeriodBounds {
  const today = todayKey ?? toRiyadhDateString(getRiyadhNow());
  const currentMonthKey = getCurrentMonthKeyRiyadh();
  const monthKeys = getMonthKeysForPeriod(query);
  const first = monthKeys[0]!;
  const last = monthKeys[monthKeys.length - 1]!;
  const fromDateKey = `${first}-01`;
  const lastDay = getDaysInMonth(last);
  const periodEndFull = `${last}-${String(lastDay).padStart(2, '0')}`;

  const isInProgress = today >= fromDateKey && today <= periodEndFull;
  const toDateKey = isInProgress ? today : periodEndFull;

  const chartMonthKeys = monthKeys.filter((mk) => {
    const monthEnd = `${mk}-${String(getDaysInMonth(mk)).padStart(2, '0')}`;
    return monthEnd >= fromDateKey && mk <= toDateKey.slice(0, 7);
  });

  const anchorMonthKey = toDateKey.slice(0, 7);
  const showClosingExpectation =
    query.kind === 'month' &&
    query.month != null &&
    monthKey(query.year, query.month) === currentMonthKey &&
    isInProgress;

  return {
    monthKeys,
    chartMonthKeys,
    fromDateKey,
    toDateKey,
    anchorMonthKey,
    isInProgress,
    showClosingExpectation,
    periodLabel: formatStoreReportPeriodLabel(query, 'en'),
  };
}

export function storeReportPeriodToQueryString(query: StoreReportPeriodQuery): string {
  const params = new URLSearchParams();
  params.set('period', query.kind);
  params.set('year', String(query.year));
  if (query.kind === 'month' && query.month) {
    params.set('month', String(query.month));
  }
  if (query.kind === 'quarter' && query.quarter) {
    params.set('quarter', String(query.quarter));
  }
  if (query.kind === 'half' && query.half) {
    params.set('half', String(query.half));
  }
  return params.toString();
}

export function getStoreReportYearOptions(): number[] {
  const current = getRiyadhNow().getFullYear();
  return Array.from({ length: 6 }, (_, i) => current - i);
}

export function storeReportPeriodFromMeta(meta: {
  periodKind: StoreReportPeriodKind;
  periodYear: number;
  periodMonth?: number;
  periodQuarter?: 1 | 2 | 3 | 4;
  periodHalf?: 1 | 2;
}): StoreReportPeriodQuery {
  return {
    kind: meta.periodKind,
    year: meta.periodYear,
    month: meta.periodMonth,
    quarter: meta.periodQuarter,
    half: meta.periodHalf,
  };
}
