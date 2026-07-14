import { prisma } from '@/lib/db';

export const APP_THEME_KEY = 'APP_THEME';
export const APP_THEMES = ['current', 'aurora', 'obsidian'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && APP_THEMES.includes(value as AppTheme);
}

export async function getAppTheme(): Promise<AppTheme> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: APP_THEME_KEY },
      select: { valueJson: true },
    });
    if (!row?.valueJson) return 'current';
    const parsed: unknown = JSON.parse(row.valueJson);
    return isAppTheme(parsed) ? parsed : 'current';
  } catch {
    return 'current';
  }
}
