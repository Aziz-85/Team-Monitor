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
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Link href="/admin/import" className="text-slate-700 underline hover:text-slate-900">
          Import
        </Link>
        <span aria-hidden>›</span>
        <span className="font-medium text-slate-900">{title}</span>
      </div>
      <p className="mb-4">
        <Link
          href="/admin/import"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          ← Back to Import Dashboard
        </Link>
      </p>
      {children}
    </div>
  );
}
