import { APP_VERSION } from '@/lib/version';
import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AboutPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">About</h1>
        <p className="text-slate-700">
          Team Monitor – Executive Operations &amp; Performance Platform
        </p>
        <p className="mt-2 text-sm text-slate-500">Version {APP_VERSION}</p>
      </div>
    </div>
  );
}
