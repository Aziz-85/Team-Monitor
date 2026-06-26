/**
 * Short display names for schedule tables (first name + disambiguation).
 * Does not mutate stored employee names.
 */

import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';

const TITLE_PREFIX = /^(mr|mrs|ms|dr|eng)\.?\s+/i;

function normalizeFullName(fullName: string): string {
  return (fullName ?? '').trim().replace(/\s+/g, ' ');
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

type NameEmployee = { empId: string; name: string; first: string; family: string };

function labelWithFamilyPrefix(first: string, family: string, prefixLen: number): string {
  if (!first) return '';
  if (!family || prefixLen <= 0) return first;
  return `${first} ${family.slice(0, prefixLen)}.`;
}

function resolveDuplicateGroup(group: NameEmployee[]): Map<string, string> {
  const out = new Map<string, string>();
  if (group.length === 0) return out;

  const maxFamilyLen = Math.max(...group.map((e) => e.family.length), 0);
  for (let prefixLen = 1; prefixLen <= Math.max(maxFamilyLen, 1); prefixLen++) {
    const labels = group.map((e) => labelWithFamilyPrefix(e.first, e.family, prefixLen));
    if (new Set(labels).size === labels.length) {
      group.forEach((e, i) => out.set(e.empId, labels[i]!));
      return out;
    }
  }

  group.forEach((e) => out.set(e.empId, e.name.trim() || e.first));
  return out;
}

/**
 * Build short labels for a visible employee set.
 * 1) First name only when unique among the set.
 * 2) First name + family initial(s) with increasing prefix until unique.
 */
export function buildScheduleDisplayNames(
  employees: Array<{ empId: string; name: string }>
): Map<string, string> {
  const result = new Map<string, string>();
  const parsed: NameEmployee[] = employees
    .filter((e) => e.empId && normalizeFullName(e.name))
    .map((e) => ({
      empId: e.empId,
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
      result.set(only.empId, only.first || only.name);
      continue;
    }
    for (const [empId, label] of Array.from(resolveDuplicateGroup(group))) {
      result.set(empId, label);
    }
  }

  return result;
}

/** Map full name -> short label (for views that only have name strings, e.g. month HTML). */
export function buildScheduleDisplayNamesByFullName(names: string[]): Map<string, string> {
  const unique = Array.from(new Set(names.map((n) => normalizeFullName(n)).filter(Boolean)));
  const byEmpId = buildScheduleDisplayNames(unique.map((name, i) => ({ empId: `n${i}`, name })));
  const out = new Map<string, string>();
  unique.forEach((name, i) => {
    const short = byEmpId.get(`n${i}`);
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
  empId: string,
  fullName: string,
  map: Map<string, string>
): string {
  return map.get(empId) ?? (getFirstName(fullName) || normalizeFullName(fullName));
}

export function formatScheduleNameSlot(
  slot: ScheduleNameSlot,
  map: Map<string, string>
): { text: string; title: string } {
  const short = getScheduleDisplayName(slot.empId, slot.fullName, map);
  const note = slot.note?.trim();
  const text = note ? `${short} ${note}` : short;
  const title = note ? `${slot.fullName} ${note}` : slot.fullName;
  return { text, title };
}

export type ScheduleNameSlot = {
  empId: string;
  fullName: string;
  /** Shown in title only, e.g. "(SPLIT)". */
  note?: string;
};
