'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppTheme } from '@/lib/appTheme';

const options: Array<{ id: AppTheme; name: string; description: string; swatch: string }> = [
  { id: 'current', name: 'الثيم الحالي', description: 'Executive Clean', swatch: 'from-stone-100 to-amber-500' },
  { id: 'aurora', name: 'Aurora', description: 'Expressive Light', swatch: 'from-violet-600 to-teal-400' },
  { id: 'obsidian', name: 'Obsidian', description: 'Precision Dark', swatch: 'from-slate-950 to-emerald-500' },
];

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'obsidian');
}

export function AppThemePicker() {
  const router = useRouter();
  const [theme, setTheme] = useState<AppTheme>('current');
  const [saving, setSaving] = useState<AppTheme | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/system/theme', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        const loaded = data.theme as AppTheme;
        setTheme(loaded);
        applyTheme(loaded);
      })
      .catch(() => setError('تعذر تحميل إعداد الثيم'));
  }, []);

  const select = async (next: AppTheme) => {
    const previous = theme;
    setTheme(next);
    setSaving(next);
    setError('');
    applyTheme(next);
    try {
      const response = await fetch('/api/admin/system/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setTheme(previous);
      applyTheme(previous);
      setError('تعذر حفظ الثيم');
    } finally {
      setSaving(null);
    }
  };

  return <section className="space-y-4">
    <div>
      <h2 className="text-base font-semibold text-foreground">مظهر النظام</h2>
      <p className="mt-1 text-sm text-muted">يُطبّق على جميع المستخدمين وصفحات النظام.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {options.map(option => <button
        key={option.id}
        type="button"
        aria-pressed={theme === option.id}
        disabled={saving !== null}
        onClick={() => select(option.id)}
        className={`flex items-center gap-3 rounded-xl border p-4 text-start transition ${theme === option.id ? 'border-accent bg-surface-elevated ring-2 ring-accent/25' : 'border-border bg-surface hover:border-accent/60'}`}
      >
        <span className={`h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br ${option.swatch}`} />
        <span className="min-w-0">
          <strong className="block text-sm text-foreground">{option.name}</strong>
          <small className="text-muted">{saving === option.id ? 'جاري الحفظ…' : option.description}</small>
        </span>
      </button>)}
    </div>
    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </section>;
}
