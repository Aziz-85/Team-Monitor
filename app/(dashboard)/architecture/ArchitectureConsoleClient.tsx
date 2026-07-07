'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableTd,
  DataTableTh,
} from '@/components/ui/DataTable';
import type {
  ArchitectureData,
  ArchitectureNode,
  PermissionState,
  RegistryStatus,
  StatusLevel,
} from '@/lib/architecture/collectArchitecture';

type Props = {
  data: ArchitectureData;
};

const SECTION_LINKS = [
  ['overview', 'System Overview'],
  ['application-architecture', 'Application Architecture'],
  ['route-explorer', 'Route Explorer'],
  ['navigation-explorer', 'Navigation'],
  ['permission-matrix', 'Permissions'],
  ['api-explorer', 'APIs'],
  ['business-modules', 'Business Modules'],
  ['database-explorer', 'Database'],
  ['dependency-graph', 'Dependencies'],
  ['services', 'Services'],
  ['feature-registry', 'Features'],
  ['technical-debt', 'Technical Debt'],
  ['code-statistics', 'Code Statistics'],
  ['project-timeline', 'Timeline'],
  ['health-center', 'Health'],
  ['developer-toolbox', 'Toolbox'],
  ['unused-assets', 'Unused Assets'],
  ['architecture-recommendations', 'Recommendations'],
  ['global-search', 'Search'],
  ['export-center', 'Export'],
] as const;

function statusVariant(status: StatusLevel | RegistryStatus | PermissionState): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'Healthy' || status === 'Stable' || status === 'Allowed') return 'success';
  if (status === 'Critical' || status === 'Missing' || status === 'Denied') return 'danger';
  if (status === 'Warning' || status === 'Experimental' || status === 'Conditional') return 'warning';
  return 'neutral';
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.map(csvValue).join(','), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
}

function Section({
  id,
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <details open={defaultOpen} className="group rounded-2xl border border-border bg-surface shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <span className="rounded border border-border px-2 py-1 text-xs font-medium text-muted group-open:hidden">Open</span>
          <span className="hidden rounded border border-border px-2 py-1 text-xs font-medium text-muted group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-border p-5">{children}</div>
      </details>
    </section>
  );
}

function TreeNode({ node }: { node: ArchitectureNode }) {
  const hasChildren = Boolean(node.children?.length);
  if (!hasChildren) {
    return (
      <li className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
        <span className="font-medium text-foreground">{node.name}</span>
        {node.status ? <Badge variant={statusVariant(node.status)} className="ms-2">{node.status}</Badge> : null}
      </li>
    );
  }
  return (
    <li>
      <details open className="rounded-xl border border-border bg-surface-subtle">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">{node.name}</summary>
        <ul className="grid gap-2 border-t border-border p-3 md:grid-cols-2 xl:grid-cols-4">
          {node.children?.map((child) => <TreeNode key={`${node.name}-${child.name}`} node={child} />)}
        </ul>
      </details>
    </li>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: StatusLevel }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 break-words text-lg font-semibold text-foreground">{value}</div>
      {tone ? <Badge variant={statusVariant(tone)} className="mt-3">{tone}</Badge> : null}
    </Card>
  );
}

export function ArchitectureConsoleClient({ data }: Props) {
  const [query, setQuery] = useState('');
  const [routeFilter, setRouteFilter] = useState<'all' | 'sidebar' | 'hidden' | 'legacy' | 'experimental' | 'delete'>('all');
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRoutes = useMemo(() => {
    return data.routes.filter((route) => {
      const matchesQuery = !normalizedQuery || `${route.route} ${route.title} ${route.module} ${route.permission}`.toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        routeFilter === 'all' ||
        (routeFilter === 'sidebar' && route.sidebar) ||
        (routeFilter === 'hidden' && route.hidden) ||
        (routeFilter === 'legacy' && route.legacy) ||
        (routeFilter === 'experimental' && route.experimental) ||
        (routeFilter === 'delete' && route.deleteCandidate);
      return matchesQuery && matchesFilter;
    });
  }, [data.routes, normalizedQuery, routeFilter]);

  const filteredSearch = useMemo(() => {
    if (!normalizedQuery) return data.searchIndex.slice(0, 30);
    return data.searchIndex
      .filter((item) => `${item.type} ${item.label} ${item.module} ${item.detail}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 60);
  }, [data.searchIndex, normalizedQuery]);

  const exportJson = () => download('team-monitor-architecture.json', JSON.stringify(data, null, 2), 'application/json');
  const exportRoutes = () => download('team-monitor-routes.csv', toCsv(data.routes), 'text/csv');
  const exportPermissions = () => {
    const rows = data.permissionRows.map((row) => ({
      target: row.target,
      type: row.type,
      module: row.module,
      ...row.states,
    }));
    download('team-monitor-permission-matrix.csv', toCsv(rows), 'text/csv');
  };
  const exportDatabase = () => download('team-monitor-database-diagram.json', JSON.stringify(data.database, null, 2), 'application/json');

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Console Navigation</div>
            <nav className="mt-3 max-h-[calc(100vh-160px)] space-y-1 overflow-y-auto pr-1">
              {SECTION_LINKS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-subtle hover:text-foreground">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <header className="rounded-3xl border border-border bg-surface p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-muted">Enterprise System Overview</div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Architecture Console</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted">
                  Single source of truth for Team Monitor routes, navigation, permissions, APIs, Prisma schema, services, features, health, and technical debt.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">System Status</div>
                <Badge variant={statusVariant(data.systemStatus)} className="mt-2 text-sm">{data.systemStatus}</Badge>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages, APIs, modules, database, features, permissions"
                className="h-11 rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-subtle"
              >
                Command Palette
              </button>
            </div>
          </header>

          <Section id="overview" title="System Overview" subtitle="Runtime, repository, project, and current session metadata.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {data.overview.map((item) => <StatCard key={item.label} label={item.label} value={item.value} tone={item.tone} />)}
            </div>
          </Section>

          <Section id="application-architecture" title="Application Architecture" subtitle="Expandable enterprise architecture map.">
            <ul className="grid gap-4">
              {data.architectureTree.map((node) => <TreeNode key={node.name} node={node} />)}
            </ul>
          </Section>

          <Section id="route-explorer" title="Route Explorer" subtitle="Automatically discovered page routes with navigation and lifecycle flags.">
            <div className="mb-4 flex flex-wrap gap-2">
              {(['all', 'sidebar', 'hidden', 'legacy', 'experimental', 'delete'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRouteFilter(filter)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${routeFilter === filter ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-foreground hover:bg-surface-subtle'}`}
                >
                  {filter === 'delete' ? 'Delete Candidate' : filter[0].toUpperCase() + filter.slice(1)}
                </button>
              ))}
              <button type="button" onClick={exportRoutes} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-subtle">
                Export CSV
              </button>
            </div>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Route</DataTableTh>
                <DataTableTh>Title</DataTableTh>
                <DataTableTh>Module</DataTableTh>
                <DataTableTh>Permission</DataTableTh>
                <DataTableTh>Flags</DataTableTh>
                <DataTableTh>Last Modified</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {filteredRoutes.map((route) => (
                  <tr key={route.file}>
                    <DataTableTd truncate><Link className="font-medium text-accent" href={route.route}>{route.route}</Link></DataTableTd>
                    <DataTableTd truncate>{route.title}</DataTableTd>
                    <DataTableTd>{route.module}</DataTableTd>
                    <DataTableTd truncate>{route.permission}</DataTableTd>
                    <DataTableTd>
                      <div className="flex flex-wrap gap-1">
                        {route.sidebar ? <Badge variant="success">Sidebar</Badge> : null}
                        {route.hidden ? <Badge variant="warning">Hidden</Badge> : null}
                        {route.legacy ? <Badge variant="neutral">Legacy</Badge> : null}
                        {route.experimental ? <Badge variant="warning">Experimental</Badge> : null}
                        {route.deleteCandidate ? <Badge variant="danger">Delete Candidate</Badge> : null}
                      </div>
                    </DataTableTd>
                    <DataTableTd>{route.lastModified}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="navigation-explorer" title="Navigation Explorer" subtitle="Visible sidebar, hidden navigation, orphan pages, duplicates, and unreachable routes.">
            <div className="grid gap-4 lg:grid-cols-2">
              {data.navigation.map((section) => (
                <Card key={section.group} className="p-4">
                  <h3 className="font-semibold text-foreground">{section.group}</h3>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <div key={`${section.group}-${item.href}-${item.label}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{item.label}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-muted">{item.href}</span>
                          {item.hidden ? <Badge variant="warning">Hidden</Badge> : null}
                          {item.legacy ? <Badge variant="neutral">Legacy</Badge> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {data.navigationFindings.slice(0, 30).map((finding) => (
                <Card key={`${finding.type}-${finding.route}`} className="p-4">
                  <Badge variant={statusVariant(finding.severity)}>{finding.type}</Badge>
                  <div className="mt-2 font-medium text-foreground">{finding.route}</div>
                  <p className="mt-1 text-sm text-muted">{finding.detail}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="permission-matrix" title="Permission Matrix" subtitle="Pages, APIs, and key actions across requested role columns." defaultOpen={false}>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Target</DataTableTh>
                <DataTableTh>Type</DataTableTh>
                <DataTableTh>Module</DataTableTh>
                {data.permissionColumns.map((role) => <DataTableTh key={role}>{role}</DataTableTh>)}
              </DataTableHead>
              <DataTableBody>
                {data.permissionRows.slice(0, 260).map((row) => (
                  <tr key={`${row.type}-${row.target}`}>
                    <DataTableTd truncate>{row.target}</DataTableTd>
                    <DataTableTd>{row.type}</DataTableTd>
                    <DataTableTd>{row.module}</DataTableTd>
                    {data.permissionColumns.map((role) => (
                      <DataTableTd key={`${row.target}-${role}`}>
                        <Badge variant={statusVariant(row.states[role])}>{row.states[role]}</Badge>
                      </DataTableTd>
                    ))}
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="api-explorer" title="API Explorer" subtitle="Automatically listed route handlers, methods, inferred permissions, health, and lifecycle status." defaultOpen={false}>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Method</DataTableTh>
                <DataTableTh>Endpoint</DataTableTh>
                <DataTableTh>Auth</DataTableTh>
                <DataTableTh>Permission</DataTableTh>
                <DataTableTh>Module</DataTableTh>
                <DataTableTh>Flags</DataTableTh>
                <DataTableTh>Health</DataTableTh>
                <DataTableTh>Latency</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.apis.slice(0, 260).map((api) => (
                  <tr key={`${api.method}-${api.endpoint}`}>
                    <DataTableTd>{api.method}</DataTableTd>
                    <DataTableTd truncate>{api.endpoint}</DataTableTd>
                    <DataTableTd>{api.authentication}</DataTableTd>
                    <DataTableTd truncate>{api.permission}</DataTableTd>
                    <DataTableTd>{api.module}</DataTableTd>
                    <DataTableTd>
                      <div className="flex flex-wrap gap-1">
                        {api.deprecated ? <Badge variant="danger">Deprecated</Badge> : null}
                        {api.experimental ? <Badge variant="warning">Experimental</Badge> : null}
                      </div>
                    </DataTableTd>
                    <DataTableTd><Badge variant={statusVariant(api.health)}>{api.health}</Badge></DataTableTd>
                    <DataTableTd>{api.latency}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="business-modules" title="Business Modules" subtitle="Owners, stability, dependencies, pages, APIs, components, and database tables.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.modules.map((module) => (
                <Card key={module.name} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{module.name}</h3>
                      <p className="text-sm text-muted">Owner: {module.owner}</p>
                    </div>
                    <Badge variant={statusVariant(module.status)}>{module.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><div className="text-muted">Pages</div><div className="font-semibold">{module.pages}</div></div>
                    <div><div className="text-muted">APIs</div><div className="font-semibold">{module.apis}</div></div>
                    <div><div className="text-muted">Components</div><div className="font-semibold">{module.components}</div></div>
                  </div>
                  <p className="mt-3 text-sm text-muted">Dependencies: {module.dependencies.join(', ') || 'None detected'}</p>
                  <p className="mt-1 text-sm text-muted">Tables: {module.databaseTables.join(', ') || 'No direct table match'}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="database-explorer" title="Database Explorer" subtitle="Prisma models, relations, indexes, unique keys, enums, migrations, warnings, and unused-model candidates." defaultOpen={false}>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <StatCard label="Provider" value={data.database.provider} />
              <StatCard label="Table Count" value={String(data.database.tableCount)} />
              <StatCard label="Enums" value={String(data.database.enums.length)} />
              <StatCard label="Migrations" value={String(data.database.migrations.length)} />
            </div>
            {data.database.warnings.length ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {data.database.warnings.join(' ')}
              </div>
            ) : null}
            <DataTable>
              <DataTableHead>
                <DataTableTh>Model</DataTableTh>
                <DataTableTh>Fields</DataTableTh>
                <DataTableTh>Relations</DataTableTh>
                <DataTableTh>Indexes</DataTableTh>
                <DataTableTh>Unique Keys</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.database.models.map((model) => (
                  <tr key={model.name}>
                    <DataTableTd>{model.name}</DataTableTd>
                    <DataTableTd>{model.fields.length}</DataTableTd>
                    <DataTableTd truncate>{model.relations.join(', ') || 'None'}</DataTableTd>
                    <DataTableTd>{model.indexes.length}</DataTableTd>
                    <DataTableTd>{model.uniqueKeys.length}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="dependency-graph" title="Dependency Graph" subtitle="Module dependency graph with circular dependency highlighting.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.dependencyGraph.map((node) => (
                <Card key={node.module} className={`p-4 ${node.circular ? 'border-amber-300' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{node.module}</h3>
                    {node.circular ? <Badge variant="warning">Circular</Badge> : <Badge variant="success">Clear</Badge>}
                  </div>
                  <div className="mt-3 space-y-2">
                    {node.dependencies.map((dep) => (
                      <div key={`${node.module}-${dep}`} className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
                        {node.module} <span className="text-muted">depends on</span> {dep}
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="services" title="Services" subtitle="Platform services inferred from source paths and package dependencies.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.services.map((service) => (
                <Card key={service.name} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{service.name}</h3>
                    <Badge variant={statusVariant(service.health === 'Running' ? 'Healthy' : service.health === 'Missing' ? 'Critical' : 'Warning')}>{service.health}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{service.detail}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="feature-registry" title="Feature Registry" subtitle="Major features with version, owner, status, and page bindings.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.features.map((feature) => (
                <Card key={feature.name} className="p-4">
                  <h3 className="font-semibold text-foreground">{feature.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={statusVariant(feature.status)}>{feature.status}</Badge>
                    <Badge>{feature.version}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">Owner: {feature.owner}</p>
                  <p className="mt-1 text-sm text-muted">Pages: {feature.pages.join(', ') || 'No page binding detected'}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="technical-debt" title="Technical Debt" subtitle="Findings from docs, audit notes, legacy route flags, and large files." defaultOpen={false}>
            <div className="grid gap-3 md:grid-cols-2">
              {data.technicalDebt.map((item) => (
                <Card key={`${item.source}-${item.title}-${item.detail}`} className="p-4">
                  <Badge variant={item.severity === 'High' ? 'danger' : item.severity === 'Medium' ? 'warning' : 'neutral'}>{item.severity}</Badge>
                  <h3 className="mt-2 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                  <p className="mt-2 text-xs text-muted">{item.source}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="code-statistics" title="Code Statistics" subtitle="Project structure counts.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(data.counts).map(([key, value]) => (
                <StatCard key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value)} />
              ))}
            </div>
          </Section>

          <Section id="project-timeline" title="Project Timeline" subtitle="Latest commits, version history, security updates, and architecture changes.">
            <div className="space-y-2">
              {data.timeline.map((item) => (
                <div key={`${item.hash}-${item.title}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.title}</div>
                    <div className="text-muted">{item.hash} · {item.date}</div>
                  </div>
                  <Badge variant={item.kind === 'Security' ? 'warning' : item.kind === 'Architecture' ? 'success' : 'neutral'}>{item.kind}</Badge>
                </div>
              ))}
            </div>
          </Section>

          <Section id="health-center" title="Health Center" subtitle="System, database, storage, authentication, queue, scheduler, notifications, Redis, background jobs, and uploads.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.health.map((item) => (
                <Card key={item.name} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{item.detail}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="developer-toolbox" title="Developer Toolbox" subtitle="Quick actions into key system areas.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.toolbox.map((action) => (
                <Link key={action.label} href={action.href} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">
                  {action.label}
                </Link>
              ))}
            </div>
          </Section>

          <Section id="unused-assets" title="Unused Assets" subtitle="Automatically detected unused or hidden asset candidates." defaultOpen={false}>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Type</DataTableTh>
                <DataTableTh>Name</DataTableTh>
                <DataTableTh>Reason</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.unusedAssets.map((asset) => (
                  <tr key={`${asset.type}-${asset.name}`}>
                    <DataTableTd>{asset.type}</DataTableTd>
                    <DataTableTd truncate>{asset.name}</DataTableTd>
                    <DataTableTd truncate>{asset.reason}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="architecture-recommendations" title="Architecture Recommendations" subtitle="Generated recommendations from architecture metadata and detected risks.">
            <div className="grid gap-3 md:grid-cols-2">
              {data.recommendations.map((item) => (
                <Card key={item.title} className="p-4">
                  <Badge variant={item.priority === 'High' ? 'danger' : item.priority === 'Medium' ? 'warning' : 'neutral'}>{item.priority}</Badge>
                  <h3 className="mt-2 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="global-search" title="Search" subtitle="Search pages, components, routes, APIs, database, modules, features, and permissions.">
            <DataTable>
              <DataTableHead>
                <DataTableTh>Type</DataTableTh>
                <DataTableTh>Label</DataTableTh>
                <DataTableTh>Module</DataTableTh>
                <DataTableTh>Detail</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {filteredSearch.map((item) => (
                  <tr key={`${item.type}-${item.label}`}>
                    <DataTableTd>{item.type}</DataTableTd>
                    <DataTableTd truncate>{item.href ? <Link className="text-accent" href={item.href}>{item.label}</Link> : item.label}</DataTableTd>
                    <DataTableTd>{item.module}</DataTableTd>
                    <DataTableTd truncate>{item.detail}</DataTableTd>
                  </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </Section>

          <Section id="export-center" title="Export" subtitle="Export architecture report data without secrets or environment values.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <button type="button" onClick={() => window.print()} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">Architecture Report PDF</button>
              <button type="button" onClick={exportJson} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">Architecture JSON</button>
              <button type="button" onClick={exportRoutes} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">Route List CSV</button>
              <button type="button" onClick={exportPermissions} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">Permission Matrix Excel</button>
              <button type="button" onClick={exportDatabase} className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm font-medium text-foreground hover:bg-surface">Database Diagram</button>
            </div>
          </Section>
        </main>
      </div>

      {paletteOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4" onClick={() => setPaletteOpen(false)}>
          <div className="mx-auto mt-20 max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Command Palette</h2>
                <p className="text-sm text-muted">Jump to a console section or search result.</p>
              </div>
              <button type="button" onClick={() => setPaletteOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm">Close</button>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search architecture console"
              className="mt-4 h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="mt-3 max-h-80 overflow-y-auto">
              {SECTION_LINKS.map(([id, label]) => (
                <a key={id} href={`#${id}`} onClick={() => setPaletteOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-subtle">
                  {label}
                </a>
              ))}
              {filteredSearch.slice(0, 12).map((item) => (
                <Link key={`${item.type}-${item.label}`} href={item.href || '#global-search'} onClick={() => setPaletteOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-subtle hover:text-foreground">
                  {item.type}: {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
