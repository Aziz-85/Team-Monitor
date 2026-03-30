import { APP_VERSION } from '@/lib/version';
import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';

export default async function AboutPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getServerTranslations('nav');

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-foreground">{t('about')}</h1>
        <p className="text-foreground">
          Team Monitor – Executive Operations &amp; Performance Platform
        </p>
        <p className="mt-2 text-sm text-muted">Version {APP_VERSION}</p>
      </div>
    </div>
  );
}
