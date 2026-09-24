'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import type { Role } from '@prisma/client';
import {
  getSidebarGroupedSections,
} from '@/lib/nav/sidebarShellNav';

const iconPaths: Record<string, ReactNode> = {
  HOME: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
  DASHBOARD: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  EMPLOYEE_HOME: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.5-4.3 2.8-6.5 7-6.5s6.5 2.2 7 6.5"/></>,
  SCHEDULE_EDIT: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h8M8 18h5"/></>,
  SCHEDULE_NEXT: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2M16.5 5.5 19 5l-.5 2.5"/></>,
  SCHEDULE_VIEW: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></>,
  SCHEDULE_AUDIT: <><path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="m8 13 2 2 5-5M8 18h8"/></>,
  APPROVALS: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8"/></>,
  TASKS: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14 9h3M14 15h3"/></>,
  TASK_SETUP: <><path d="M4 6h10M4 12h16M4 18h10"/><circle cx="17" cy="6" r="2"/><circle cx="7" cy="18" r="2"/></>,
  TASK_MONITOR: <><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/></>,
  INV_DAILY: <><path d="m4 8 8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></>,
  INV_HISTORY: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 7v5l3 2"/></>,
  INV_ZONES: <><path d="m4 7 5-3 6 3 5-3v13l-5 3-6-3-5 3zM9 4v13M15 7v13"/></>,
  INV_FOLLOW: <><path d="M4 6h10M4 12h8M4 18h7"/><circle cx="17" cy="15" r="4"/><path d="m20 18 2 2"/></>,
  SALES_SUMMARY: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  SALES_ANALYTICS: <><path d="M3 20h18"/><path d="m5 16 4-5 4 2 6-8"/><circle cx="5" cy="16" r="1"/><circle cx="9" cy="11" r="1"/><circle cx="13" cy="13" r="1"/><circle cx="19" cy="5" r="1"/></>,
  PERFORMANCE_INTELLIGENCE: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16v-4M12 16V8M17 16v-6"/><path d="M6 7h2"/></>,
  PERFORMANCE: <><path d="M4 18 9 13l3 3 7-9"/><path d="M14 7h5v5"/></>,
  EXECUTIVE: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20"/></>,
  EXECUTIVE_MONTHLY: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 17l2-3 3 2 3-3"/></>,
  EXECUTIVE_INSIGHTS: <><path d="M9 18h6M10 22h4"/><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5L14 17h-4z"/></>,
  ADMIN_TARGETS: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  EXPORT_CENTER: <><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 17v4h14v-4"/></>,
  SCHEDULE_EXPORT: <><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 17v4h14v-4"/></>,
  WEEKLY_REPORT: <><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h5M9 12h7M9 16h7"/></>,
  STORE_REPORT: <><path d="M4 10h16M5 10v10h14V10M3 10l2-6h14l2 6"/><path d="M9 20v-6h6v6"/></>,
  ADMIN_EMPLOYEES: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21c.4-4 2.4-6 6-6s5.6 2 6 6M15 15c3.5 0 5.5 1.8 6 5"/></>,
  LEAVES: <><path d="M12 21C7 18 5 14 6 9c4 0 7-2 9-6 3 5 3 10 0 14-1 1.5-2 2.5-3 4z"/><path d="M8 17c2-3 4-5 8-8"/></>,
  ADMIN_USERS: <><circle cx="9" cy="8" r="3"/><path d="M3 21c.4-4 2.4-6 6-6 2.4 0 4.1.9 5.1 2.7"/><circle cx="18" cy="17" r="3"/><path d="M18 12v2M18 20v2M13 17h2M21 17h2"/></>,
  BOUTIQUE_CONFIGURATION: <><path d="M4 10h16M5 10v10h14V10M3 10l2-6h14l2 6"/><path d="M12 14v3M10.5 15.5h3"/></>,
  ADMIN_IMPORT: <><path d="M12 21V9M8 13l4-4 4 4"/><path d="M5 7V3h14v4"/></>,
  SYNC_PLANNER: <><path d="M20 7h-5V2M4 17h5v5"/><path d="M18.5 5.5A9 9 0 0 0 4 10M5.5 18.5A9 9 0 0 0 20 14"/></>,
  CHANGE_PASSWORD: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  ARCHITECTURE_CONSOLE: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h9"/></>,
};

function SidebarNavIcon({ itemKey, active }: { itemKey: string; active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? 'text-accent' : 'text-muted group-hover:text-foreground'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[itemKey] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

type SidebarNavContentProps = {
  role: Role;
  isItemActive: (href: string) => boolean;
  onNavigate?: () => void;
};

/**
 * Shared navigation lists for desktop sidebar and mobile drawer (same links, order, and grouping).
 */
export function SidebarNavContent({ role, isItemActive, onNavigate }: SidebarNavContentProps) {
  const { t, isRtl } = useT();
  const sections = useMemo(() => getSidebarGroupedSections(role, t), [role, t]);

  const handleClick = () => {
    onNavigate?.();
  };

  return (
    <div className="min-w-0 px-3 pb-5 pt-1">
      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.key} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted/80">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isItemActive(item.href);
                return (
                  <li key={item.key} className="min-w-0">
                    <Link
                      href={item.href}
                      onClick={handleClick}
                      className={`group relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                        active ? 'bg-accent-soft text-accent shadow-sm' : 'text-foreground/75 hover:bg-surface-subtle hover:text-foreground'
                      }`}
                    >
                      <SidebarNavIcon itemKey={item.key} active={active} />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {active ? (
                        <span
                          className={`absolute inset-y-2 ${isRtl ? 'right-0' : 'left-0'} w-0.5 rounded-full bg-accent`}
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
