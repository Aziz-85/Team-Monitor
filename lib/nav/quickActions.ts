export type QuickActionKey =
  | 'dashboard'
  | 'schedule'
  | 'tasks'
  | 'salesSummary'
  | 'inventoryDaily'
  | 'targets'
  | 'weeklyReport'
  | 'executive';

export type QuickActionDefinition = {
  key: QuickActionKey;
  href: string;
  titleKey: string;
  hintKey: string;
};

export const QUICK_ACTION_DEFS: QuickActionDefinition[] = [
  { key: 'dashboard', href: '/dashboard', titleKey: 'home.quickActions.dashboard.title', hintKey: 'home.quickActions.dashboard.hint' },
  { key: 'schedule', href: '/schedule/view', titleKey: 'home.quickActions.schedule.title', hintKey: 'home.quickActions.schedule.hint' },
  { key: 'tasks', href: '/tasks', titleKey: 'home.quickActions.tasks.title', hintKey: 'home.quickActions.tasks.hint' },
  { key: 'salesSummary', href: '/sales/summary', titleKey: 'home.quickActions.salesSummary.title', hintKey: 'home.quickActions.salesSummary.hint' },
  { key: 'inventoryDaily', href: '/inventory/daily', titleKey: 'home.quickActions.inventoryDaily.title', hintKey: 'home.quickActions.inventoryDaily.hint' },
  { key: 'targets', href: '/targets', titleKey: 'home.quickActions.targets.title', hintKey: 'home.quickActions.targets.hint' },
  { key: 'weeklyReport', href: '/reports/weekly', titleKey: 'home.quickActions.weeklyReport.title', hintKey: 'home.quickActions.weeklyReport.hint' },
  { key: 'executive', href: '/executive', titleKey: 'home.quickActions.executive.title', hintKey: 'home.quickActions.executive.hint' },
];

export const QUICK_ACTION_FALLBACK: QuickActionKey[] = ['salesSummary', 'schedule', 'tasks'];

export function actionKeyFromPathname(pathname: string): QuickActionKey | null {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'dashboard';
  if (pathname === '/schedule/view' || pathname.startsWith('/schedule/view/')) return 'schedule';
  if (pathname === '/schedule/edit' || pathname.startsWith('/schedule/edit/')) return 'schedule';
  if (pathname === '/schedule/editor' || pathname.startsWith('/schedule/editor/')) return 'schedule';
  if (pathname === '/tasks' || pathname.startsWith('/tasks/')) return 'tasks';
  if (pathname === '/sales/summary' || pathname.startsWith('/sales/summary/')) return 'salesSummary';
  if (pathname === '/inventory/daily' || pathname.startsWith('/inventory/daily/')) return 'inventoryDaily';
  if (pathname === '/targets' || pathname.startsWith('/targets/')) return 'targets';
  if (pathname === '/reports/weekly' || pathname.startsWith('/reports/weekly/')) return 'weeklyReport';
  if (pathname === '/executive' || pathname.startsWith('/executive/')) return 'executive';
  return null;
}

