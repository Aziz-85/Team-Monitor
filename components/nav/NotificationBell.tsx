'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';

type Notice = { id: string; title: string; body: string | null; linkPath: string | null; isRead: boolean; createdAt: string };

export function NotificationBell() {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.items ?? []);
    setUnread(data.unread ?? 0);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 45000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markRead = async (id?: string) => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : {}),
    });
    setItems((current) => current.map((item) => (!id || item.id === id ? { ...item, isRead: true } : item)));
    setUnread((current) => (id ? Math.max(0, current - 1) : 0));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground hover:bg-surface-subtle"
        aria-label={t('notifications.title')}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
        {unread > 0 ? <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-30 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><p className="font-semibold text-foreground">{t('notifications.title')}</p><p className="text-xs text-muted">{unread} {t('notifications.unread')}</p></div>
            {unread ? <button className="text-xs font-semibold text-accent" onClick={() => void markRead()}>{t('notifications.markAllRead')}</button> : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {!items.length ? <p className="px-3 py-8 text-center text-sm text-muted">{t('notifications.empty')}</p> : items.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={item.linkPath || '#'}
                onClick={() => { setOpen(false); if (!item.isRead) void markRead(item.id); }}
                className={`mb-1 block rounded-xl px-3 py-3 hover:bg-surface-subtle ${item.isRead ? '' : 'bg-accent/5'}`}
              >
                <div className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-transparent' : 'bg-accent'}`} /><div><p className="text-sm font-semibold text-foreground">{item.title}</p>{item.body ? <p className="mt-0.5 text-xs leading-5 text-muted">{item.body}</p> : null}<p className="mt-1 text-[10px] text-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</p></div></div>
              </Link>
            ))}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-sm font-semibold text-accent">{t('notifications.viewAll')}</Link>
        </div>
      ) : null}
    </div>
  );
}
