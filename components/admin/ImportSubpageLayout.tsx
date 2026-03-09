'use client';

import Link from 'next/link';

/** Breadcrumb and "Back to Import Dashboard" for admin import subpages. */
export function ImportSubpageLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/admin/import" className="text-foreground underline hover:text-foreground">
          Import
        </Link>
        <span aria-hidden>›</span>
        <span className="font-medium text-foreground">{title}</span>
      </div>
      <p className="mb-4">
        <Link
          href="/admin/import"
          className="text-sm text-muted underline hover:text-foreground"
        >
          ← Back to Import Dashboard
        </Link>
      </p>
      {children}
    </div>
  );
}
