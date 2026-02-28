'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/app/providers';
import { InventoryWeeklyClient } from './weekly/InventoryWeeklyClient';
import { InventoryZonesClient } from './InventoryZonesClient';

/** Canonical Zone Inventory component path (for Manager/Admin debug). */
const ZONE_INVENTORY_COMPONENT_PATH = 'app/(dashboard)/inventory/zones/InventoryZonesPageClient.tsx';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Tab = 'weekly' | 'assignments';

export function InventoryZonesPageClient({
  isManagerOrAdmin,
  isAdmin,
}: {
  isManagerOrAdmin: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [tab, setTab] = useState<Tab>('weekly');
  const [mapImageKey, setMapImageKey] = useState<number | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [deletingMap, setDeletingMap] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setUploadMessage({ type: 'error', text: t('inventory.uploadMapError') });
      setTimeout(() => setUploadMessage(null), 3000);
      e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadMessage(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/inventory/zones/upload-map', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMapImageKey(Date.now());
        setUploadMessage({ type: 'success', text: t('inventory.uploadMapSuccess') });
      } else {
        setUploadMessage({ type: 'error', text: (data.error as string) || t('inventory.uploadMapError') });
      }
    } catch {
      setUploadMessage({ type: 'error', text: t('inventory.uploadMapError') });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteMap = async () => {
    if (!window.confirm(t('inventory.deleteZonesMapConfirm'))) return;
    setDeletingMap(true);
    setUploadMessage(null);
    try {
      const res = await fetch('/api/inventory/zones/upload-map', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMapImageKey(Date.now());
        setUploadMessage({ type: 'success', text: t('inventory.deleteMapSuccess') });
      } else {
        setUploadMessage({ type: 'error', text: (data.error as string) || t('inventory.deleteMapError') });
      }
    } catch {
      setUploadMessage({ type: 'error', text: t('inventory.deleteMapError') });
    } finally {
      setDeletingMap(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/inventory/daily"
          className="mb-4 inline-block text-base text-sky-600 hover:underline"
        >
          ← {t('common.back')} ({t('inventory.daily')})
        </Link>

        {isAdmin && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              {t('inventory.uploadZonesMap')} (Admin)
            </h3>
            <p className="mb-3 text-xs text-slate-600">
              {t('inventory.uploadZonesMapHint')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                onChange={handleUploadMap}
                disabled={uploading || deletingMap}
                className="text-sm text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:hover:bg-blue-700"
                aria-label={t('inventory.uploadZonesMap')}
              />
              <button
                type="button"
                onClick={handleDeleteMap}
                disabled={uploading || deletingMap}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingMap ? t('common.loading') : t('inventory.deleteZonesMap')}
              </button>
              {uploadMessage && (
                <span
                  className={`text-sm font-medium ${uploadMessage.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}
                  role="status"
                >
                  {uploadMessage.text}
                </span>
              )}
              {uploading && (
                <span className="text-sm text-slate-500">{t('common.loading')}</span>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {t('inventory.zones')}
          </h1>
          <nav
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            aria-label={t('inventory.zones')}
          >
            <button
              type="button"
              onClick={() => setTab('weekly')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'weekly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('inventory.weekly')}
            </button>
            {isManagerOrAdmin && (
              <button
                type="button"
                onClick={() => setTab('assignments')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'assignments'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('inventory.assignments')}
              </button>
            )}
          </nav>
        </div>

        {tab === 'weekly' && (
          <InventoryWeeklyClient embedded mapImageKey={mapImageKey} />
        )}
        {tab === 'assignments' && isManagerOrAdmin && (
          <InventoryZonesClient embedded />
        )}

        {/* Manager/Admin-only debug: confirms canonical page is served */}
        {isManagerOrAdmin && (
          <p className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-400" aria-hidden>
            [Debug] pathname: {pathname} · component: {ZONE_INVENTORY_COMPONENT_PATH}
          </p>
        )}
      </div>
    </div>
  );
}
