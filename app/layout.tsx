import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getMessages } from '@/lib/get-messages';
import { getDir } from '@/lib/i18n';
import { APP_VERSION, GIT_HASH } from '@/lib/version';
import { getBuildId } from '@/lib/server/getBuildId';
import type { Locale } from '@/lib/i18n';
import './globals.css';
import { I18nProvider } from './providers';

export const metadata: Metadata = {
  title: 'Team Monitor',
  description: 'Scheduling and task management',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get('dt_locale')?.value === 'ar' ? 'ar' : 'en';
  const messages = await getMessages(locale);
  const dir = getDir(locale);
  const buildId = getBuildId();
  const versionLine = GIT_HASH
    ? `Server: v${APP_VERSION} (${GIT_HASH})`
    : `Server: v${APP_VERSION}`;

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className="flex min-h-screen flex-col antialiased overflow-x-hidden"
        style={{ background: 'var(--app-bg)', color: 'var(--text)' }}
      >
        <I18nProvider initialLocale={locale} initialMessages={messages}>
          <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
            {children}
          </div>
          <footer className="mt-auto py-2 text-center text-xs text-slate-500" dir="ltr" style={{ color: 'var(--muted)' }}>
            {versionLine}
            {buildId && <span className="block mt-0.5">Build: {buildId}</span>}
            <span className="block mt-0.5">Develop by Abdulaziz</span>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
