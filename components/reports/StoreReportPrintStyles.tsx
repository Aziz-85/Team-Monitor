'use client';

import { useEffect } from 'react';

/** Injects print styles to hide dashboard chrome and format A4 landscape output. */
export function StoreReportPrintStyles({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (autoPrint) {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <style jsx global>{`
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
