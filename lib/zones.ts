export type ZoneKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export function getZoneBadgeClasses(zone: ZoneKey | string | null | undefined): string {
  switch (zone) {
    case 'A':
      return 'border-blue-300 bg-blue-50 text-blue-900';
    case 'B':
      return 'border-indigo-300 bg-indigo-50 text-indigo-900';
    case 'C':
      return 'border-slate-300 bg-slate-50 text-slate-900';
    case 'D':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'E':
      return 'border-green-300 bg-green-50 text-green-900';
    case 'F':
      return 'border-sky-300 bg-sky-50 text-sky-900';
    case 'G':
      return 'border-yellow-300 bg-yellow-50 text-yellow-900';
    default:
      return 'border-slate-200 bg-white text-slate-800';
  }
}

