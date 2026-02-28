'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useI18n } from '@/app/providers';

type Messages = Record<string, unknown>;

type ZoneKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

type ZoneRect = {
  key: ZoneKey;
  label: string;
  colorClass: string;
  borderClass: string;
  textClass: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  note?: string;
};

const ZONES: ZoneRect[] = [
  { key: 'A', label: 'Zone A', colorClass: 'bg-blue-500/15', borderClass: 'border-blue-500', textClass: 'text-blue-900', leftPct: 38, topPct: 8, widthPct: 18, heightPct: 20, note: 'Main display A' },
  { key: 'B', label: 'Zone B', colorClass: 'bg-indigo-500/15', borderClass: 'border-indigo-500', textClass: 'text-indigo-900', leftPct: 22, topPct: 8, widthPct: 15, heightPct: 20 },
  { key: 'C', label: 'Zone C', colorClass: 'bg-slate-600/15', borderClass: 'border-slate-600', textClass: 'text-slate-900', leftPct: 7, topPct: 8, widthPct: 14, heightPct: 20 },
  { key: 'D', label: 'Zone D', colorClass: 'bg-amber-500/15', borderClass: 'border-amber-500', textClass: 'text-amber-900', leftPct: 55, topPct: 65, widthPct: 20, heightPct: 18 },
  { key: 'E', label: 'Zone E', colorClass: 'bg-green-600/15', borderClass: 'border-green-600', textClass: 'text-green-900', leftPct: 6, topPct: 65, widthPct: 40, heightPct: 18 },
  { key: 'F', label: 'Zone F', colorClass: 'bg-sky-500/15', borderClass: 'border-sky-500', textClass: 'text-sky-900', leftPct: 20, topPct: 33, widthPct: 55, heightPct: 22 },
  { key: 'G', label: 'Zone G', colorClass: 'bg-yellow-400/20', borderClass: 'border-yellow-400', textClass: 'text-yellow-900', leftPct: 78, topPct: 5, widthPct: 18, heightPct: 28 },
];

type ViewMode = 'monthly' | 'quarterly';

type ZonesMapDialogProps = {
  /** Optional external selected zone key; if omitted, component manages its own selection */
  selectedZoneKey?: ZoneKey | null;
  onSelectedZoneChange?: (key: ZoneKey | null) => void;
};

export function ZonesMapDialog(props: ZonesMapDialogProps) {
  const { selectedZoneKey, onSelectedZoneChange } = props;
  const { messages } = useI18n();
  const t = (key: string) => {
    const root = messages as Messages;
    const v = key.split('.').reduce<unknown>((o, k) => {
      if (o && typeof o === 'object' && k in o) {
        return (o as Record<string, unknown>)[k];
      }
      return undefined;
    }, root);
    return (typeof v === 'string' ? v : undefined) ?? key;
  };

  const [internalActiveZone, setInternalActiveZone] = useState<ZoneKey | null>(null);
  const activeZone = selectedZoneKey ?? internalActiveZone;

  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('inventory_zones_view_mode');
    if (stored === 'monthly' || stored === 'quarterly') {
      setViewMode(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inventory_zones_view_mode', viewMode);
  }, [viewMode]);

  const handleSetActive = (key: ZoneKey | null) => {
    if (onSelectedZoneChange) {
      onSelectedZoneChange(key);
    } else {
      setInternalActiveZone(key);
    }
  };

  const selected = activeZone ? ZONES.find((z) => z.key === activeZone) ?? null : null;

  const modeHint =
    viewMode === 'monthly' ? t('inventory.zonesViewMonthlyHint') : t('inventory.zonesViewQuarterlyHint');

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-slate-900">{t('inventory.zonesMapTitle')}</h2>
          <p className="mt-1 text-xs text-slate-600">{modeHint}</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('monthly')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              viewMode === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('inventory.zonesViewMonthly')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('quarterly')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              viewMode === 'quarterly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('inventory.zonesViewQuarterly')}
          </button>
        </div>
      </div>

      {/* Map container */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div
          className="relative mx-auto aspect-[4/3] max-h-[70vh] w-full overflow-auto rounded-md bg-slate-100"
          onClick={(e) => {
            // Click on background clears selection
            if ((e.target as HTMLElement).dataset.zoneKey == null) {
              handleSetActive(null);
            }
          }}
        >
          <div className="relative h-full w-full">
            <Image
              src="/inventory/zones-map.jpg"
              alt={t('inventory.zonesMapTitle')}
              fill
              className="h-full w-full rounded-md object-contain"
              sizes="(max-width: 768px) 100vw, 600px"
              priority={false}
            />

            {/* Overlays */}
            {ZONES.map((zone) => {
              const isActive = activeZone === zone.key;
              const baseOpacity = isActive ? 'opacity-90' : 'opacity-40 hover:opacity-70';
              const ringClass = isActive ? 'ring-2 ring-offset-1 ring-blue-500' : '';
              return (
                <button
                  key={zone.key}
                  type="button"
                  data-zone-key={zone.key}
                  style={{
                    left: `${zone.leftPct}%`,
                    top: `${zone.topPct}%`,
                    width: `${zone.widthPct}%`,
                    height: `${zone.heightPct}%`,
                  }}
                  className={`absolute rounded-md border ${zone.borderClass} ${zone.colorClass} ${baseOpacity} ${ringClass} cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}
                  onMouseEnter={() => {
                    if (!('ontouchstart' in window)) {
                      handleSetActive(zone.key);
                    }
                  }}
                  onMouseLeave={() => {
                    if (!('ontouchstart' in window)) {
                      handleSetActive(null);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetActive(isActive ? null : zone.key);
                  }}
                >
                  {isActive && (
                    <div
                      className={`pointer-events-none absolute left-1 top-1 inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${zone.textClass}`}
                    >
                      {zone.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected zone details */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('inventory.selectedZoneDetails')}
        </div>
        {selected ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${selected.borderClass} ${selected.textClass}`}>
                {selected.label}
              </span>
              {selected.note && (
                <span className="text-xs text-slate-600">
                  {selected.note}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t('inventory.selectedZoneNone')}</p>
        )}
      </div>
    </div>
  );
}

