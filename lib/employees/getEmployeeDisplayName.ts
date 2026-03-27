type EmployeeNameInput =
  | string
  | {
      name?: string | null;
      nameAr?: string | null;
    }
  | null
  | undefined;

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getEmployeeDisplayName(employee: EmployeeNameInput, locale?: string): string {
  if (typeof employee === 'string') return clean(employee);
  const fallback = clean(employee?.name);
  const arabic = clean(employee?.nameAr);
  const isArabicUi = typeof locale === 'string' && locale.toLowerCase().startsWith('ar');

  if (isArabicUi) return arabic || fallback;
  return fallback || arabic;
}
