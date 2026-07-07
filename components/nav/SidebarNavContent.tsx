'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import type { Role } from '@prisma/client';
import {
  getSidebarGroupedSections,
} from '@/lib/nav/sidebarShellNav';

function SidebarNavIcon({ icon, active }: { icon?: 'architecture'; active: boolean }) {
  if (icon !== 'architecture') {
    return (
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
          active ? 'bg-accent' : 'bg-muted-foreground/50 group-hover:bg-muted-foreground/70'
        }`}
      />
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
      <path d="M16 10l4 2-4 2v-4z" strokeLinejoin="round" />
      <path d="M3 5h18v14H3z" strokeLinejoin="round" />
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
    <div className="min-w-0 px-3 pb-4 pt-2">
      <div className="space-y-3">
        {sections.map((section) => (
          <section key={section.key} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {section.label}
            </p>
            <ul className="space-y-1.5">
              {section.items.map((item) => {
                const active = isItemActive(item.href);
                return (
                  <li key={item.key} className="min-w-0">
                    <Link
                      href={item.href}
                      onClick={handleClick}
                      className={`group relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-muted/40'
                      }`}
                    >
                      <SidebarNavIcon icon={item.icon} active={active} />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {active ? (
                        <span
                          className={`absolute inset-y-1 ${isRtl ? 'right-0.5' : 'left-0.5'} w-0.5 rounded-full bg-accent/70`}
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
