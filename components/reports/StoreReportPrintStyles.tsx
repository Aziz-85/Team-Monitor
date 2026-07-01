'use client';

import { useEffect } from 'react';

/** Injects print styles to hide dashboard chrome and format A4 landscape output. */
export function StoreReportPrintStyles({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    document.body.classList.add('store-report-print-page');
    return () => document.body.classList.remove('store-report-print-page');
  }, []);

  useEffect(() => {
    if (autoPrint) {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <style jsx global>{`
      body.store-report-print-page aside,
      body.store-report-print-page header,
      body.store-report-print-page nav,
      body.store-report-print-page footer,
      body.store-report-print-page main > div:first-of-type,
      body.store-report-print-page .flex.flex-1.flex-col > .sticky,
      body.store-report-print-page .flex.flex-1.flex-col > .bg-amber-100 {
        display: none !important;
      }

      body.store-report-print-page main {
        padding: 0 !important;
      }

      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        body {
          background: white !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        aside,
        nav,
        header,
        footer,
        [data-print-hide],
        .print\\:hidden {
          display: none !important;
        }

        main {
          padding: 0 !important;
        }

        .store-report-print {
          max-width: none !important;
          padding: 0 !important;
        }

        .store-report-print section {
          break-inside: avoid-page;
        }
      }
    `}</style>
  );
}
