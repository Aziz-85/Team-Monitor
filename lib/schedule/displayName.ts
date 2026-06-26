/**
 * Short display names for schedule tables (first name + disambiguation).
 * Does not mutate stored employee names.
 */

import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';

const TITLE_PREFIX = /^(mr|mrs|ms|dr|eng)\.?\s+/i;

/** Split-shift glyph shown beside shortened names in schedule view tables. */
export const SPLIT_SHIFT_GLYPH = '↕';
export const SPLIT_SHIFT_GLYPH_CLASS = 'text-violet-700 font-semibold';

function normalizeFullName(fullName: string): string {
  return (fullName ?? '').trim().replace(/\s+/g, ' ');
}

function employeeKey(employee: { empId?: string; name: string }): string {
  const id = employee.empId?.trim();
  if (id) return id;
  return normalizeFullName(employee.name);
}

/** First token of the display name (strips common honorifics). */
export function getFirstName(fullName: string): string {
  const raw = normalizeFullName(fullName);
  if (!raw) return '';
  const cleaned = raw.replace(TITLE_PREFIX, '');
  return cleaned.split(' ')[0] ?? '';
}

/** Family / surname portion after the first name token. */
export function getFamilyName(fullName: string): string {
  const raw = normalizeFullName(fullName);
  if (!raw) return '';
  const cleaned = raw.replace(TITLE_PREFIX, '');
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(1).join(' ');
}

/** Family body after skipping a leading "Al" prefix (Arabic surnames). */
function getMeaningfulFamilyBody(familyName: string): string {
  const family = familyName.trim();
  if (!family) return '';
  if (/^Al/i.test(family) && family.length > 2) {
    return family.slice(2);
  }
  return family;
}

/**
 * First meaningful letter of the family name (skips leading "Al").
 * "Almarhon" -> "M", "Alrashdi" -> "R", "Rashdi" -> "R".
 */
export function getMeaningfulFamilyInitial(familyName: string): string {
  const body = getMeaningfulFamilyBody(familyName);
  const letter = body[0];
  return letter ? letter.toUpperCase() : '';
}

function labelWithMeaningfulInitial(first: string, family: string): string {
  if (!first) return '';
  const initial = getMeaningfulFamilyInitial(family);
  if (!initial) return first;
  return `${first} ${initial}.`;
}

function labelWithMeaningfulLetters(first: string, family: string, count: number): string {
  if (!first) return '';
  const body = getMeaningfulFamilyBody(family);
  if (!body) return first;
  const letters = body.slice(0, count);
  if (!letters) return first;
  return `${first} ${letters}.`;
}

function labelWithFamilyPrefix(first: string, family: string, prefixLen: number): string {
  if (!first) return '';
  if (!family || prefixLen <= 0) return first;
  return `${first} ${family.slice(0, prefixLen)}.`;
}

type NameEmployee = { key: string; name: string; first: string; family: string };

function resolveDuplicateGroup(group: NameEmployee[]): Map<string, string> {
  const out = new Map<string, string>();
  if (group.length === 0) return out;

  const tryAssign = (labels: string[]): boolean => {
    if (new Set(labels).size !== labels.length) return false;
    group.forEach((e, i) => out.set(e.key, labels[i]!));
    return true;
  };

  if (tryAssign(group.map((e) => labelWithMeaningfulInitial(e.first, e.family)))) {
    return out;
  }

  if (tryAssign(group.map((e) => labelWithMeaningfulLetters(e.first, e.family, 2)))) {
    return out;
  }

  const maxFamilyLen = Math.max(...group.map((e) => e.family.length), 0);
  for (let prefixLen = 1; prefixLen <= Math.max(maxFamilyLen, 1); prefixLen++) {
    if (tryAssign(group.map((e) => labelWithFamilyPrefix(e.first, e.family, prefixLen)))) {
      return out;
    }
  }

  group.forEach((e) => out.set(e.key, e.name.trim() || e.first));
  return out;
}

/**
 * Build short labels for a visible employee set.
 * 1) First name only when unique among the set.
 * 2) First name + meaningful family initial (skips "Al").
 * 3) First name + first two meaningful family letters.
 * 4) Progressive raw family prefix until unique.
 */
export function buildScheduleDisplayNames(
  employees: Array<{ empId?: string; name: string }>
): Map<string, string> {
  const result = new Map<string, string>();
  const parsed: NameEmployee[] = employees
    .filter((e) => normalizeFullName(e.name))
    .map((e) => ({
      key: employeeKey(e),
      name: normalizeFullName(e.name),
      first: getFirstName(e.name),
      family: getFamilyName(e.name),
    }));

  const byFirst = new Map<string, NameEmployee[]>();
  for (const emp of parsed) {
    const key = emp.first.toLowerCase();
    const list = byFirst.get(key) ?? [];
    list.push(emp);
    byFirst.set(key, list);
  }

  for (const group of Array.from(byFirst.values())) {
    if (group.length === 1) {
      const only = group[0]!;
      result.set(only.key, only.first || only.name);
      continue;
    }
    for (const [key, label] of Array.from(resolveDuplicateGroup(group))) {
      result.set(key, label);
    }
  }

  return result;
}

/** Map full name -> short label (for views that only have name strings, e.g. month HTML). */
export function buildScheduleDisplayNamesByFullName(names: string[]): Map<string, string> {
  const unique = Array.from(new Set(names.map((n) => normalizeFullName(n)).filter(Boolean)));
  const byKey = buildScheduleDisplayNames(unique.map((name, i) => ({ empId: `n${i}`, name })));
  const out = new Map<string, string>();
  unique.forEach((name, i) => {
    const short = byKey.get(`n${i}`);
    if (short) out.set(name, short);
  });
  return out;
}

export function buildScheduleDisplayNameMapForRows(
  rows: Array<{ empId: string; name: string; nameAr?: string | null }>,
  locale: string
): Map<string, string> {
  return buildScheduleDisplayNames(
    rows.map((row) => ({
      empId: row.empId,
      name: getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale),
    }))
  );
}

export function getScheduleDisplayName(
  empId: string | undefined,
  fullName: string,
  map: Map<string, string>
): string {
  if (empId && map.has(empId)) return map.get(empId)!;
  const normalized = normalizeFullName(fullName);
  if (normalized && map.has(normalized)) return map.get(normalized)!;
  return getFirstName(fullName) || normalized;
}

/** Short employee label for schedule tables (first name + disambiguation). */
export function formatScheduleEmployeeName(
  fullName: string,
  displayNameMap?: Map<string, string>,
  lookupKey?: string
): string {
  return displayNameMap
    ? getScheduleDisplayName(lookupKey, fullName, displayNameMap)
    : getFirstName(fullName) || normalizeFullName(fullName);
}

export type ScheduleNameSlot = {
  empId: string;
  fullName: string;
  /** Split shift: render ↕ beside the short name. */
  isSplit?: boolean;
  /** @deprecated Use isSplit. Kept for editor compatibility. */
  note?: string;
};

export type ScheduleSlotLabel = {
  text: string;
  title: string;
  isSplit: boolean;
};

function slotIsSplit(slot: ScheduleNameSlot): boolean {
  if (slot.isSplit) return true;
  const note = slot.note?.trim().toUpperCase();
  return note === '(SPLIT)' || note === 'SPLIT';
}

export function formatScheduleNameSlot(
  slot: ScheduleNameSlot,
  map: Map<string, string>
): ScheduleSlotLabel {
  const short = getScheduleDisplayName(slot.empId, slot.fullName, map);
  const isSplit = slotIsSplit(slot);
  return {
    text: short,
    title: isSplit ? `${slot.fullName} — Split Shift` : slot.fullName,
    isSplit,
  };
}

export type CoverageShift = 'AM' | 'PM' | 'SPLIT';

/** @deprecated Use formatScheduleEmployeeName + CoverageCell shift badges. */
export function formatCoverageName(
  name: string,
  shift: CoverageShift,
  displayNameMap?: Map<string, string>,
  lookupKey?: string
): ScheduleSlotLabel {
  const short = formatScheduleEmployeeName(name, displayNameMap, lookupKey);
  const isSplit = shift === 'SPLIT';
  const title = isSplit ? `${name} — Split Shift` : name;
  const text = isSplit ? short : `${short} ${shift}`;
  return { text, title, isSplit };
}
