import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import packageJson from '@/package.json';
import { prisma } from '@/lib/db';
import { NAV_GROUPS, type NavItem } from '@/lib/navConfig';
import { getSidebarGroupedSections } from '@/lib/nav/sidebarShellNav';
import { ROLE_ROUTES, canAccessRoute, type Role } from '@/lib/routeMatrix';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');
const DOCS_DIR = path.join(ROOT, 'docs');
const PRISMA_SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma/migrations');
const IGNORED_DIRS = new Set(['.git', '.next', 'node_modules', 'coverage', 'dist', 'build', '.turbo']);
const PERMISSION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'EMPLOYEE', 'VIEWER'] as const;
const ROLE_LOOKUP: Record<(typeof PERMISSION_ROLES)[number], Role> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ASSISTANT_MANAGER: 'ASSISTANT_MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'DEMO_VIEWER',
};

export type StatusLevel = 'Healthy' | 'Warning' | 'Critical';
export type RegistryStatus = 'Stable' | 'Experimental' | 'Legacy' | 'Hidden' | 'Missing';
export type PermissionState = 'Allowed' | 'Denied' | 'Conditional';

export type ArchitectureRoute = {
  route: string;
  title: string;
  module: string;
  permission: string;
  sidebar: boolean;
  legacy: boolean;
  experimental: boolean;
  hidden: boolean;
  deleteCandidate: boolean;
  lastModified: string;
  file: string;
};

export type ArchitectureApi = {
  endpoint: string;
  method: string;
  module: string;
  authentication: 'Required' | 'Public' | 'Conditional';
  permission: string;
  description: string;
  deprecated: boolean;
  experimental: boolean;
  health: StatusLevel;
  latency: string;
  file: string;
  lastModified: string;
};

export type ArchitectureData = {
  generatedAt: string;
  currentUser: { name: string; role: string };
  systemStatus: StatusLevel;
  overview: Array<{ label: string; value: string; tone?: StatusLevel }>;
  counts: {
    pages: number;
    apis: number;
    modules: number;
    components: number;
    layouts: number;
    hooks: number;
    contexts: number;
    utilities: number;
    services: number;
    libraries: number;
    prismaModels: number;
    databaseTables: number;
    migrations: number;
  };
  architectureTree: ArchitectureNode[];
  routes: ArchitectureRoute[];
  navigation: NavigationSection[];
  navigationFindings: NavigationFinding[];
  permissionColumns: readonly string[];
  permissionRows: PermissionRow[];
  apis: ArchitectureApi[];
  modules: BusinessModule[];
  database: DatabaseExplorer;
  dependencyGraph: DependencyNode[];
  services: ServiceStatus[];
  features: FeatureStatus[];
  technicalDebt: DebtItem[];
  timeline: TimelineItem[];
  health: HealthItem[];
  toolbox: ToolboxAction[];
  unusedAssets: UnusedAsset[];
  recommendations: Recommendation[];
  searchIndex: SearchItem[];
};

export type ArchitectureNode = {
  name: string;
  status?: RegistryStatus;
  children?: ArchitectureNode[];
};

export type NavigationSection = {
  group: string;
  items: Array<{ label: string; href: string; hidden: boolean; legacy: boolean; source: 'Sidebar' | 'Hidden Navigation' }>;
};

export type NavigationFinding = {
  type: 'Orphan Page' | 'Duplicate Entry' | 'Unreachable Page';
  route: string;
  detail: string;
  severity: StatusLevel;
};

export type PermissionRow = {
  target: string;
  type: 'Page' | 'API' | 'Action';
  module: string;
  states: Record<string, PermissionState>;
};

export type BusinessModule = {
  name: string;
  owner: string;
  status: RegistryStatus;
  dependencies: string[];
  pages: number;
  apis: number;
  components: number;
  databaseTables: string[];
};

export type DatabaseExplorer = {
  provider: string;
  tableCount: number;
  models: PrismaModel[];
  enums: Array<{ name: string; values: string[] }>;
  migrations: Array<{ name: string; lastModified: string }>;
  warnings: string[];
  unusedModels: string[];
};

export type PrismaModel = {
  name: string;
  fields: string[];
  relations: string[];
  indexes: string[];
  uniqueKeys: string[];
};

export type DependencyNode = {
  module: string;
  dependencies: string[];
  circular: boolean;
};

export type ServiceStatus = {
  name: string;
  health: 'Running' | 'Disabled' | 'Missing';
  detail: string;
};

export type FeatureStatus = {
  name: string;
  version: string;
  owner: string;
  status: RegistryStatus;
  pages: string[];
};

export type DebtItem = {
  severity: 'High' | 'Medium' | 'Low';
  title: string;
  detail: string;
  source: string;
};

export type TimelineItem = {
  hash: string;
  title: string;
  date: string;
  kind: 'Commit' | 'Version' | 'Security' | 'Architecture';
};

export type HealthItem = {
  name: string;
  status: StatusLevel;
  detail: string;
};

export type ToolboxAction = {
  label: string;
  href: string;
};

export type UnusedAsset = {
  type: string;
  name: string;
  reason: string;
};

export type Recommendation = {
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  detail: string;
};

export type SearchItem = {
  type: string;
  label: string;
  module: string;
  href?: string;
  detail: string;
};

type FileEntry = {
  absolute: string;
  relative: string;
  mtime: Date;
  size: number;
};

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function walk(dir: string, predicate?: (file: string) => boolean): FileEntry[] {
  const out: FileEntry[] = [];
  const visit = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (predicate && !predicate(absolute)) continue;
      const stat = safeStat(absolute);
      if (!stat) continue;
      out.push({
        absolute,
        relative: path.relative(ROOT, absolute).replaceAll(path.sep, '/'),
        mtime: stat.mtime,
        size: stat.size,
      });
    }
  };
  visit(dir);
  return out;
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

function titleize(value: string): string {
  const clean = value
    .replace(/\[[^\]]+\]/g, 'Detail')
    .replace(/[-_]/g, ' ')
    .replace(/\bapi\b/i, 'API')
    .trim();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Home';
}

function appRouteFromPage(file: string): string {
  const rel = path.relative(APP_DIR, file).replaceAll(path.sep, '/');
  const parts = rel.split('/').filter((part) => !part.startsWith('(') && part !== 'page.tsx');
  const route = '/' + parts.join('/');
  return route === '/page.tsx' || route === '/' ? '/' : route.replace(/\/page\.tsx$/, '');
}

function apiRouteFromFile(file: string): string {
  const rel = path.relative(path.join(APP_DIR, 'api'), file).replaceAll(path.sep, '/');
  return `/api/${rel.replace(/\/route\.ts$/, '')}`;
}

function moduleFromRoute(route: string): string {
  const parts = route.split('/').filter(Boolean);
  if (parts[0] === 'api') return titleize(parts[1] ?? 'system');
  if (!parts.length) return 'Dashboard';
  if (parts[0] === 'admin') return titleize(parts[1] ?? 'admin');
  if (parts[0] === 'nav') return 'Navigation';
  return titleize(parts[0]);
}

function fileModified(entry: FileEntry): string {
  return entry.mtime.toISOString().slice(0, 10);
}

function listPageRoutes(): ArchitectureRoute[] {
  const pageFiles = walk(APP_DIR, (file) => file.endsWith('/page.tsx'));
  const navItems = allNavItems();
  const sidebarHrefs = new Set(getSidebarGroupedSections('SUPER_ADMIN', (k) => k).flatMap((g) => g.items.map((i) => i.href.split('?')[0])));
  const navByHref = new Map(navItems.map((item) => [item.href.split('?')[0], item]));
  return pageFiles
    .map((entry) => {
      const route = appRouteFromPage(entry.absolute);
      const nav = navByHref.get(route);
      const inSidebar = sidebarHrefs.has(route);
      const legacy = nav?.type === 'LEGACY' || /legacy|v3|old|editor/.test(route);
      const experimental = /next|v3|lab|preview|beta|experimental/.test(route);
      const hidden = Boolean(nav?.hiddenFromNav) || (!inSidebar && Boolean(nav));
      return {
        route,
        title: titleize(route.split('/').filter(Boolean).at(-1) ?? 'Home'),
        module: moduleFromRoute(route),
        permission: permissionLabelForRoute(route),
        sidebar: inSidebar,
        legacy,
        experimental,
        hidden,
        deleteCandidate: legacy && hidden,
        lastModified: fileModified(entry),
        file: entry.relative,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function getRouteMethods(source: string): string[] {
  const matches = Array.from(source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g));
  const methods = matches.map((m) => m[1]).filter(Boolean);
  return methods.length ? methods : ['ANY'];
}

function listApiRoutes(): ArchitectureApi[] {
  const apiFiles = walk(path.join(APP_DIR, 'api'), (file) => file.endsWith('/route.ts'));
  return apiFiles
    .flatMap((entry) => {
      const source = safeRead(entry.absolute);
      const endpoint = apiRouteFromFile(entry.absolute);
      const methods = getRouteMethods(source);
      const authentication: ArchitectureApi['authentication'] =
        source.includes('getSessionUser') || source.includes('require') ? 'Required' : endpoint.startsWith('/api/auth') ? 'Conditional' : 'Required';
      const permission = inferApiPermission(endpoint, source);
      return methods.map((method) => ({
        endpoint,
        method,
        module: moduleFromRoute(endpoint),
        authentication,
        permission,
        description: describeEndpoint(endpoint, method),
        deprecated: /deprecated|legacy/i.test(source) || /legacy|old/.test(endpoint),
        experimental: /experimental|preview|v3|next|beta/i.test(source) || /preview|v3|next/.test(endpoint),
        health: 'Healthy' as StatusLevel,
        latency: 'Not sampled',
        file: entry.relative,
        lastModified: fileModified(entry),
      }));
    })
    .sort((a, b) => `${a.endpoint}:${a.method}`.localeCompare(`${b.endpoint}:${b.method}`));
}

function inferApiPermission(endpoint: string, source: string): string {
  if (source.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (endpoint.startsWith('/api/admin')) return 'ADMIN, SUPER_ADMIN';
  if (endpoint.startsWith('/api/mobile')) return 'Authenticated mobile session';
  if (endpoint.startsWith('/api/auth')) return 'Conditional authentication';
  if (endpoint.includes('/schedule')) return 'Schedule permissions';
  if (endpoint.includes('/approvals')) return 'Approver permissions';
  return source.includes('getSessionUser') ? 'Authenticated user' : 'Not declared';
}

function describeEndpoint(endpoint: string, method: string): string {
  const action = method === 'GET' ? 'Read' : method === 'POST' ? 'Create or run' : method === 'PATCH' || method === 'PUT' ? 'Update' : method === 'DELETE' ? 'Delete' : 'Handle';
  return `${action} ${moduleFromRoute(endpoint).toLowerCase()} resource`;
}

function allNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((group) => group.items);
}

function permissionLabelForRoute(route: string): string {
  const allowed = (Object.keys(ROLE_ROUTES) as Role[]).filter((role) => canAccessRoute(role, route));
  return allowed.length ? allowed.join(', ') : 'Unreachable';
}

function buildNavigation(routes: ArchitectureRoute[]): { sections: NavigationSection[]; findings: NavigationFinding[] } {
  const navItems = allNavItems();
  const hrefCounts = new Map<string, number>();
  for (const item of navItems) {
    const href = item.href.split('?')[0];
    hrefCounts.set(href, (hrefCounts.get(href) ?? 0) + 1);
  }
  const sidebarSections: NavigationSection[] = getSidebarGroupedSections('SUPER_ADMIN', (k) => k).map((group) => ({
    group: group.label,
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      hidden: false,
      legacy: false,
      source: 'Sidebar' as const,
    })),
  }));
  const hidden = NAV_GROUPS.map((group) => ({
    group: `${group.key} hidden`,
    items: group.items
      .filter((item) => item.hiddenFromNav || item.type === 'LEGACY')
      .map((item) => ({
        label: item.key,
        href: item.href,
        hidden: Boolean(item.hiddenFromNav),
        legacy: item.type === 'LEGACY',
        source: 'Hidden Navigation' as const,
      })),
  })).filter((group) => group.items.length);
  const navHrefs = new Set(navItems.map((item) => item.href.split('?')[0]));
  const findings: NavigationFinding[] = [];
  for (const [href, count] of Array.from(hrefCounts.entries())) {
    if (count > 1) findings.push({ type: 'Duplicate Entry', route: href, detail: `${count} navigation entries share this href.`, severity: 'Warning' });
  }
  for (const route of routes) {
    if (route.permission === 'Unreachable') {
      findings.push({ type: 'Unreachable Page', route: route.route, detail: 'No role route prefix currently grants access.', severity: 'Critical' });
    } else if (!navHrefs.has(route.route) && route.route !== '/' && !route.route.includes('[')) {
      findings.push({ type: 'Orphan Page', route: route.route, detail: 'Route exists but is not represented in navigation config.', severity: 'Warning' });
    }
  }
  return { sections: [...sidebarSections, ...hidden], findings };
}

function buildPermissionRows(routes: ArchitectureRoute[], apis: ArchitectureApi[]): PermissionRow[] {
  const routeRows: PermissionRow[] = routes.map((route) => ({
    target: route.route,
    type: 'Page',
    module: route.module,
    states: Object.fromEntries(PERMISSION_ROLES.map((role) => [role, canAccessRoute(ROLE_LOOKUP[role], route.route) ? 'Allowed' : 'Denied'])) as Record<string, PermissionState>,
  }));
  const apiRows: PermissionRow[] = apis.slice(0, 180).map((api) => ({
    target: `${api.method} ${api.endpoint}`,
    type: 'API',
    module: api.module,
    states: Object.fromEntries(PERMISSION_ROLES.map((role) => [role, apiPermissionState(api, role)])) as Record<string, PermissionState>,
  }));
  const actionRows: PermissionRow[] = [
    actionRow('Save schedule changes', 'Schedule', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ASSISTANT_MANAGER']),
    actionRow('Approve week', 'Schedule', ['SUPER_ADMIN', 'ADMIN', 'MANAGER']),
    actionRow('Manage users', 'Authentication', ['SUPER_ADMIN', 'ADMIN']),
    actionRow('Import sales', 'Sales', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ASSISTANT_MANAGER']),
    actionRow('View own tasks', 'Tasks', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'EMPLOYEE']),
    actionRow('Export reports', 'Reports', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'EMPLOYEE', 'VIEWER']),
  ];
  return [...routeRows, ...apiRows, ...actionRows];
}

function apiPermissionState(api: ArchitectureApi, role: (typeof PERMISSION_ROLES)[number]): PermissionState {
  if (api.endpoint.startsWith('/api/auth') || api.permission.includes('Conditional')) return 'Conditional';
  if (api.permission.includes('SUPER_ADMIN')) return role === 'SUPER_ADMIN' ? 'Allowed' : 'Denied';
  if (api.permission.includes('ADMIN')) return role === 'SUPER_ADMIN' || role === 'ADMIN' ? 'Allowed' : 'Denied';
  if (api.endpoint.startsWith('/api/mobile')) return role === 'EMPLOYEE' ? 'Conditional' : 'Denied';
  if (api.authentication === 'Required') return role === 'VIEWER' ? 'Conditional' : 'Allowed';
  return 'Conditional';
}

function actionRow(target: string, module: string, allowed: string[]): PermissionRow {
  return {
    target,
    type: 'Action',
    module,
    states: Object.fromEntries(PERMISSION_ROLES.map((role) => [role, allowed.includes(role) ? 'Allowed' : 'Denied'])) as Record<string, PermissionState>,
  };
}

function parsePrisma(): DatabaseExplorer {
  const source = safeRead(PRISMA_SCHEMA);
  const provider = source.match(/provider\s+=\s+"([^"]+)"/)?.[1] ?? 'unknown';
  const models = Array.from(source.matchAll(/model\s+(\w+)\s+\{([\s\S]*?)\n\}/g)).map((match) => {
    const body = match[2] ?? '';
    const fieldLines = body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'));
    const fields = fieldLines.filter((line) => !line.startsWith('@@')).map((line) => line.split(/\s+/)[0]).filter(Boolean);
    const relations = fieldLines.filter((line) => line.includes('@relation')).map((line) => line.split(/\s+/)[0]).filter(Boolean);
    const indexes = fieldLines.filter((line) => line.startsWith('@@index')).map((line) => line);
    const uniqueKeys = fieldLines.filter((line) => line.includes('@unique') || line.startsWith('@@unique')).map((line) => line);
    return { name: match[1] ?? 'Unknown', fields, relations, indexes, uniqueKeys };
  });
  const enums = Array.from(source.matchAll(/enum\s+(\w+)\s+\{([\s\S]*?)\n\}/g)).map((match) => ({
    name: match[1] ?? 'Unknown',
    values: (match[2] ?? '').split('\n').map((line) => line.replace(/\/\/.*$/, '').trim()).filter(Boolean),
  }));
  const migrations = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const stat = safeStat(path.join(MIGRATIONS_DIR, entry.name));
          return { name: entry.name, lastModified: stat?.mtime.toISOString().slice(0, 10) ?? 'unknown' };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const codeFiles = walk(ROOT, (file) => /\.(ts|tsx)$/.test(file) && !file.includes('/node_modules/') && !file.includes('/.next/'));
  const usedText = codeFiles.map((file) => safeRead(file.absolute)).join('\n');
  const unusedModels = models.map((m) => m.name).filter((name) => !new RegExp(`\\b${name}\\b`).test(usedText.replace(new RegExp(`model\\s+${name}\\b[\\s\\S]*?\\n\\}`, 'g'), '')));
  const warnings = [
    ...(migrations.length === 0 ? ['No migrations found.'] : []),
    ...(unusedModels.length ? [`${unusedModels.length} model names have no direct TypeScript reference.`] : []),
  ];
  return { provider, tableCount: models.length, models, enums, migrations, warnings, unusedModels };
}

function buildModules(routes: ArchitectureRoute[], apis: ArchitectureApi[], database: DatabaseExplorer): BusinessModule[] {
  const moduleNames = ['Schedule', 'Inventory', 'Sales', 'Tasks', 'CRM', 'Reports', 'Approvals', 'Notifications', 'Authentication', 'HR', 'Settings'];
  const componentFiles = walk(path.join(ROOT, 'components'), (file) => file.endsWith('.tsx'));
  return moduleNames.map((name) => {
    const key = name.toLowerCase();
    const pages = routes.filter((route) => route.module.toLowerCase().includes(key) || route.route.includes(`/${key}`));
    const moduleApis = apis.filter((api) => api.module.toLowerCase().includes(key) || api.endpoint.includes(`/${key}`));
    const components = componentFiles.filter((file) => file.relative.toLowerCase().includes(key)).length;
    const tables = database.models.filter((model) => model.name.toLowerCase().includes(key.slice(0, -1)) || model.fields.some((field) => field.toLowerCase().includes(key.slice(0, -1))));
    return {
      name,
      owner: ownerForModule(name),
      status: statusForModule(name),
      dependencies: dependenciesForModule(name),
      pages: pages.length,
      apis: moduleApis.length,
      components,
      databaseTables: tables.slice(0, 12).map((model) => model.name),
    };
  });
}

function ownerForModule(name: string): string {
  if (['Authentication', 'Settings'].includes(name)) return 'Platform';
  if (['Schedule', 'Tasks', 'Inventory'].includes(name)) return 'Operations';
  if (['Sales', 'Reports'].includes(name)) return 'Commercial';
  return 'Product';
}

function statusForModule(name: string): RegistryStatus {
  if (name === 'CRM') return 'Experimental';
  if (name === 'Notifications') return 'Stable';
  return 'Stable';
}

function dependenciesForModule(name: string): string[] {
  const map: Record<string, string[]> = {
    Schedule: ['Employees', 'Approvals', 'Notifications'],
    Inventory: ['Tasks', 'Reports'],
    Sales: ['Targets', 'Reports', 'Employees'],
    Tasks: ['Employees', 'Notifications'],
    CRM: ['Sales', 'Tasks'],
    Reports: ['Schedule', 'Sales', 'Inventory'],
    Approvals: ['Authentication', 'Schedule'],
    Notifications: ['Authentication'],
    Authentication: ['Database', 'Audit'],
    HR: ['Employees', 'Leaves'],
    Settings: ['Authentication'],
  };
  return map[name] ?? [];
}

function buildArchitectureTree(): ArchitectureNode[] {
  return [
    {
      name: 'Frontend',
      children: ['Dashboard', 'Schedule', 'Inventory', 'CRM', 'Reports', 'HR', 'Approvals', 'Exports'].map((name) => ({ name })),
    },
    {
      name: 'Backend',
      children: ['API', 'Services', 'Business Logic', 'Database'].map((name) => ({ name })),
    },
    {
      name: 'Infrastructure',
      children: ['Storage', 'Queue', 'Notifications', 'Background Jobs'].map((name) => ({ name })),
    },
  ];
}

function buildDependencyGraph(modules: BusinessModule[]): DependencyNode[] {
  const graph = modules.map((module) => ({
    module: module.name,
    dependencies: module.dependencies,
    circular: module.dependencies.some((dep) => modules.find((m) => m.name === dep)?.dependencies.includes(module.name)),
  }));
  return graph;
}

function buildServices(): ServiceStatus[] {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies } as Record<string, string>;
  const hasFiles = (term: string) => walk(ROOT, (file) => /\.(ts|tsx)$/.test(file) && file.toLowerCase().includes(term.toLowerCase())).length > 0;
  return [
    { name: 'Authentication', health: 'Running', detail: 'Session, CSRF, password policy, and 2FA modules detected.' },
    { name: 'Notifications', health: hasFiles('notify') ? 'Running' : 'Missing', detail: hasFiles('notify') ? 'Notification helpers are present.' : 'No notification module detected.' },
    { name: 'Email', health: hasFiles('email') ? 'Running' : 'Missing', detail: hasFiles('email') ? 'Email code paths detected.' : 'No email service module detected.' },
    { name: 'WhatsApp', health: hasFiles('whatsapp') ? 'Running' : 'Missing', detail: hasFiles('whatsapp') ? 'WhatsApp code paths detected.' : 'No WhatsApp integration detected.' },
    { name: 'Scheduler', health: hasFiles('schedule') ? 'Running' : 'Missing', detail: 'Schedule services and API routes detected.' },
    { name: 'Queue', health: deps.bullmq || deps.bull ? 'Running' : 'Missing', detail: deps.bullmq || deps.bull ? 'Queue dependency detected.' : 'No queue package dependency detected.' },
    { name: 'Storage', health: hasFiles('upload') || hasFiles('storage') ? 'Running' : 'Missing', detail: 'Upload/storage paths inferred from source files.' },
    { name: 'Uploads', health: hasFiles('upload') ? 'Running' : 'Missing', detail: hasFiles('upload') ? 'Upload endpoints detected.' : 'No upload route detected.' },
    { name: 'Background Workers', health: hasFiles('worker') || hasFiles('cron') ? 'Running' : 'Disabled', detail: 'Worker status is inferred from code presence.' },
    { name: 'Redis', health: deps.redis || deps.ioredis ? 'Running' : 'Missing', detail: deps.redis || deps.ioredis ? 'Redis dependency detected.' : 'No Redis dependency detected.' },
    { name: 'Cron Jobs', health: hasFiles('cron') ? 'Running' : 'Disabled', detail: hasFiles('cron') ? 'Cron code paths detected.' : 'No cron code paths detected.' },
  ];
}

function buildFeatures(routes: ArchitectureRoute[]): FeatureStatus[] {
  const featureDefs = [
    ['Schedule Engine V3', 'Experimental', ['/schedule/v3']],
    ['Schedule Next', 'Experimental', ['/schedule/next']],
    ['Proposal Generator', 'Experimental', ['/schedule/next']],
    ['Coverage Checker', 'Stable', ['/schedule/edit', '/schedule/view']],
    ['Task Monitor', 'Stable', ['/tasks/monitor']],
    ['Inventory', 'Stable', ['/inventory/daily', '/inventory/zones']],
    ['Export Center', 'Stable', ['/reports/export-center']],
    ['Analytics', 'Stable', ['/sales/analytics', '/performance']],
  ] as const;
  return featureDefs.map(([name, status, pages]) => ({
    name,
    version: packageJson.version,
    owner: name.includes('Schedule') || name.includes('Coverage') ? 'Operations' : 'Platform',
    status,
    pages: pages.filter((page) => routes.some((route) => route.route === page)),
  }));
}

function buildTechnicalDebt(routes: ArchitectureRoute[]): DebtItem[] {
  const docs = fs.existsSync(DOCS_DIR) ? walk(DOCS_DIR, (file) => /\.(md|json)$/.test(file)) : [];
  const debt: DebtItem[] = [];
  for (const doc of docs) {
    const text = safeRead(doc.absolute);
    const matches = text.match(/legacy|unused|delete candidate|technical debt|duplicate|dead code/gi);
    if (matches?.length) {
      debt.push({ severity: matches.length > 8 ? 'High' : matches.length > 3 ? 'Medium' : 'Low', title: titleize(path.basename(doc.relative)), detail: `${matches.length} architecture debt references found.`, source: doc.relative });
    }
  }
  const largeFiles = walk(ROOT, (file) => /\.(ts|tsx)$/.test(file)).filter((file) => safeRead(file.absolute).split('\n').length > 900);
  for (const file of largeFiles.slice(0, 12)) {
    debt.push({ severity: 'Medium', title: 'Large file', detail: `${file.relative} exceeds 900 lines.`, source: file.relative });
  }
  for (const route of routes.filter((r) => r.deleteCandidate).slice(0, 12)) {
    debt.push({ severity: 'Low', title: 'Legacy route candidate', detail: `${route.route} is hidden or legacy-classified.`, source: route.file });
  }
  return debt.slice(0, 40);
}

function buildUnusedAssets(routes: ArchitectureRoute[]): UnusedAsset[] {
  const sourceFiles = walk(ROOT, (file) => /\.(ts|tsx)$/.test(file));
  const sourceText = sourceFiles.map((file) => safeRead(file.absolute)).join('\n');
  const components = walk(path.join(ROOT, 'components'), (file) => file.endsWith('.tsx'));
  const unusedComponents = components
    .filter((file) => {
      const name = path.basename(file.relative, '.tsx');
      return !sourceText.replace(safeRead(file.absolute), '').includes(name);
    })
    .slice(0, 30)
    .map((file) => ({ type: 'Component', name: file.relative, reason: 'No direct component name reference found.' }));
  const hiddenRoutes = routes.filter((route) => route.hidden || route.deleteCandidate).slice(0, 30).map((route) => ({
    type: 'Page',
    name: route.route,
    reason: route.deleteCandidate ? 'Hidden legacy route.' : 'Route exists outside visible navigation.',
  }));
  return [...hiddenRoutes, ...unusedComponents];
}

function buildRecommendations(debt: DebtItem[], navFindings: NavigationFinding[], graph: DependencyNode[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  if (navFindings.some((f) => f.type === 'Unreachable Page')) {
    recommendations.push({ priority: 'High', title: 'Resolve unreachable pages', detail: 'Update routeMatrix or retire pages that no role can access.' });
  }
  if (graph.some((node) => node.circular)) {
    recommendations.push({ priority: 'Medium', title: 'Review module cycles', detail: 'Circular module dependencies increase release risk and make feature ownership unclear.' });
  }
  if (debt.some((item) => item.title === 'Large file')) {
    recommendations.push({ priority: 'Medium', title: 'Split oversized files', detail: 'Move feature-specific logic from large pages into focused components or services.' });
  }
  recommendations.push(
    { priority: 'Medium', title: 'Archive legacy schedule experiments', detail: 'Keep Engine Lab hidden and document its ownership, support status, and retirement criteria.' },
    { priority: 'Low', title: 'Keep architecture metadata close to code', detail: 'Add owner/status annotations to modules as they mature so this console can become more precise.' },
    { priority: 'Low', title: 'Add sampled endpoint latency', detail: 'Persist lightweight route health checks to make API Explorer latency actionable.' }
  );
  return recommendations;
}

function buildTimeline(): TimelineItem[] {
  const log = git(['log', '-12', '--date=short', '--pretty=format:%h%x09%ad%x09%s']);
  if (log === 'unknown') return [];
  return log.split('\n').filter(Boolean).map((line) => {
    const [hash = '', date = '', title = ''] = line.split('\t');
    const lower = title.toLowerCase();
    return {
      hash,
      title,
      date,
      kind: lower.includes('security') || lower.includes('auth') ? 'Security' : lower.includes('release') || lower.includes('version') ? 'Version' : lower.includes('architecture') || lower.includes('nav') ? 'Architecture' : 'Commit',
    };
  });
}

function buildSearchIndex(routes: ArchitectureRoute[], apis: ArchitectureApi[], modules: BusinessModule[], database: DatabaseExplorer, features: FeatureStatus[]): SearchItem[] {
  return [
    ...routes.map((route) => ({ type: 'Page', label: route.route, module: route.module, href: route.route, detail: route.title })),
    ...apis.map((api) => ({ type: 'API', label: `${api.method} ${api.endpoint}`, module: api.module, detail: api.permission })),
    ...modules.map((module) => ({ type: 'Module', label: module.name, module: module.name, detail: `${module.pages} pages, ${module.apis} APIs` })),
    ...database.models.map((model) => ({ type: 'Database', label: model.name, module: 'Database', detail: `${model.fields.length} fields` })),
    ...features.map((feature) => ({ type: 'Feature', label: feature.name, module: feature.owner, detail: feature.status })),
  ];
}

function projectStats() {
  const codeFiles = walk(ROOT, (file) => /\.(ts|tsx|js|jsx|json|prisma|md)$/.test(file));
  const totalBytes = codeFiles.reduce((sum, file) => sum + file.size, 0);
  return {
    files: codeFiles.length,
    size: `${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
  };
}

async function databaseHealth(): Promise<{ status: StatusLevel; latency: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'Healthy', latency: `${Date.now() - start} ms` };
  } catch {
    return { status: 'Critical', latency: 'Unavailable' };
  }
}

export async function collectArchitectureData(user: { name?: string | null; username?: string | null; role: string }): Promise<ArchitectureData> {
  const routes = listPageRoutes();
  const apis = listApiRoutes();
  const database = parsePrisma();
  const modules = buildModules(routes, apis, database);
  const { sections: navigation, findings: navigationFindings } = buildNavigation(routes);
  const dependencyGraph = buildDependencyGraph(modules);
  const services = buildServices();
  const features = buildFeatures(routes);
  const technicalDebt = buildTechnicalDebt(routes);
  const unusedAssets = buildUnusedAssets(routes);
  const timeline = buildTimeline();
  const stats = projectStats();
  const db = await databaseHealth();
  const counts = {
    pages: routes.length,
    apis: apis.length,
    modules: modules.length,
    components: walk(path.join(ROOT, 'components'), (file) => file.endsWith('.tsx')).length,
    layouts: walk(APP_DIR, (file) => file.endsWith('/layout.tsx')).length,
    hooks: walk(ROOT, (file) => /\/use[A-Z][^/]*\.ts(x)?$/.test(file) || file.includes('/hooks/')).length,
    contexts: walk(ROOT, (file) => /\.(ts|tsx)$/.test(file) && /context|provider/i.test(path.basename(file))).length,
    utilities: walk(path.join(ROOT, 'lib'), (file) => /\.(ts|tsx)$/.test(file)).length,
    services: walk(path.join(ROOT, 'lib'), (file) => file.includes('/services/') && /\.(ts|tsx)$/.test(file)).length,
    libraries: Object.keys(packageJson.dependencies ?? {}).length,
    prismaModels: database.models.length,
    databaseTables: database.tableCount,
    migrations: database.migrations.length,
  };
  const systemStatus: StatusLevel =
    db.status === 'Critical' || navigationFindings.some((f) => f.severity === 'Critical') ? 'Critical' : technicalDebt.some((d) => d.severity === 'High') ? 'Warning' : 'Healthy';
  const overview = [
    { label: 'Application Name', value: packageJson.name },
    { label: 'Current Version', value: packageJson.version },
    { label: 'Build Number', value: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || git(['rev-parse', '--short', 'HEAD']) },
    { label: 'Git Commit', value: git(['rev-parse', '--short', 'HEAD']) },
    { label: 'Branch', value: git(['rev-parse', '--abbrev-ref', 'HEAD']) },
    { label: 'Environment', value: process.env.NODE_ENV === 'production' ? 'Production' : 'Development' },
    { label: 'Node Version', value: process.version },
    { label: 'Next Version', value: packageJson.dependencies.next },
    { label: 'Prisma Version', value: packageJson.dependencies['@prisma/client'] },
    { label: 'Database', value: database.provider },
    { label: 'Database Status', value: db.status, tone: db.status },
    { label: 'Current User', value: user.name || user.username || 'Current session' },
    { label: 'Current Role', value: user.role },
    { label: 'Project Size', value: `${stats.size} across ${stats.files} files` },
    { label: 'Total Pages', value: String(counts.pages) },
    { label: 'Total APIs', value: String(counts.apis) },
    { label: 'Total Modules', value: String(counts.modules) },
    { label: 'Total Components', value: String(counts.components) },
  ];
  const health: HealthItem[] = [
    { name: 'System', status: systemStatus, detail: `${counts.pages} pages and ${counts.apis} API handlers detected.` },
    { name: 'Database', status: db.status, detail: `Prisma ${database.provider}; latency ${db.latency}.` },
    { name: 'Storage', status: services.find((s) => s.name === 'Storage')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Inferred from upload/storage code paths.' },
    { name: 'Authentication', status: 'Healthy', detail: 'Session auth, CSRF, lockout, and 2FA modules are present.' },
    { name: 'Queue', status: services.find((s) => s.name === 'Queue')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Queue package detection only.' },
    { name: 'Scheduler', status: 'Healthy', detail: 'Schedule services and routes are present.' },
    { name: 'Notifications', status: services.find((s) => s.name === 'Notifications')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Notification module detection only.' },
    { name: 'Redis', status: services.find((s) => s.name === 'Redis')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Redis dependency detection only.' },
    { name: 'Background Jobs', status: services.find((s) => s.name === 'Background Workers')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Worker file detection only.' },
    { name: 'Uploads', status: services.find((s) => s.name === 'Uploads')?.health === 'Running' ? 'Healthy' : 'Warning', detail: 'Upload route detection only.' },
  ];
  return {
    generatedAt: new Date().toISOString(),
    currentUser: { name: user.name || user.username || 'Current session', role: user.role },
    systemStatus,
    overview,
    counts,
    architectureTree: buildArchitectureTree(),
    routes,
    navigation,
    navigationFindings,
    permissionColumns: PERMISSION_ROLES,
    permissionRows: buildPermissionRows(routes, apis),
    apis,
    modules,
    database,
    dependencyGraph,
    services,
    features,
    technicalDebt,
    timeline,
    health,
    toolbox: [
      { label: 'Open Dashboard', href: '/dashboard' },
      { label: 'Open Schedule Editor', href: '/schedule/edit' },
      { label: 'Open Schedule View', href: '/schedule/view' },
      { label: 'Open Schedule Next', href: '/schedule/next' },
      { label: 'Open Engine Lab', href: '/schedule/v3' },
      { label: 'Open Reports', href: '/reports/export-center' },
      { label: 'Open API Explorer', href: '#api-explorer' },
      { label: 'Open Users', href: '/admin/users' },
      { label: 'Open Settings', href: '/admin/administration/settings' },
    ],
    unusedAssets,
    recommendations: buildRecommendations(technicalDebt, navigationFindings, dependencyGraph),
    searchIndex: buildSearchIndex(routes, apis, modules, database, features),
  };
}
