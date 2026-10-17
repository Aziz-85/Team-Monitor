'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';

type Notice = { id: string; title: string; body: string | null; isRead: boolean; createdAt: string };
type Boutique = { id: string; name: string; code: string };

export function NotificationsPageClient({ canSend, isPreview, boutiques }: { canSend: boolean; isPreview: boolean; boutiques: Boutique[] }) {
  const { t, locale } = useT();
  const [items, setItems] = useState<Notice[]>([]);
  const [sent, setSent] = useState('');
  const load = async () => { const r = await fetch('/api/notifications', { cache: 'no-store' }); if (r.ok) setItems((await r.json()).items ?? []); };
  useEffect(() => { void load(); void fetch('/api/notifications/read', { method: 'POST' }); }, []);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSent('');
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) });
    if (response.ok) { const result = await response.json(); setSent(`${t('notifications.sentTo')} ${result.recipients}`); event.currentTarget.reset(); }
  };
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-7">
    <div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">{t('notifications.center')}</p><h1 className="mt-2 text-3xl font-bold text-foreground">{t('notifications.title')}</h1><p className="mt-2 text-sm text-muted">{t('notifications.subtitle')}</p></div>
    {isPreview ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">{t('notifications.previewReadOnly')}</div> : null}
    {canSend ? <form onSubmit={send} className="grid gap-4 rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="text-lg font-semibold text-foreground">{t('notifications.send')}</h2></div>
      <select name="boutiqueId" className="rounded-xl border border-border bg-surface px-3 py-2.5" required>{boutiques.length > 1 ? <option value="ALL">{t('notifications.allBoutiques')}</option> : null}{boutiques.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select>
      <input name="title" className="rounded-xl border border-border bg-surface px-3 py-2.5" placeholder={t('notifications.subject')} required maxLength={120} />
      <textarea name="body" className="min-h-24 rounded-xl border border-border bg-surface px-3 py-2.5 md:col-span-2" placeholder={t('notifications.message')} required maxLength={800} />
      <div className="flex items-center gap-3 md:col-span-2"><button className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-white">{t('notifications.sendNow')}</button>{sent ? <span className="text-sm text-emerald-600">{sent}</span> : null}</div>
    </form> : null}
    <section className="rounded-2xl border border-border bg-surface-elevated p-3 shadow-sm"><h2 className="px-2 py-3 text-lg font-semibold text-foreground">{t('notifications.history')}</h2>{items.length ? items.map((item) => <div key={item.id} className="border-t border-border px-3 py-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-foreground">{item.title}</p>{item.body ? <p className="mt-1 text-sm text-muted">{item.body}</p> : null}</div><time className="shrink-0 text-xs text-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></div></div>) : <p className="px-3 py-10 text-center text-muted">{t('notifications.empty')}</p>}</section>
  </div>;
}
