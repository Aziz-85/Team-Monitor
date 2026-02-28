import { redirect } from 'next/navigation';
import { FEATURES } from '@/lib/featureFlags';

export default function ExecutiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!FEATURES.EXECUTIVE) {
    redirect('/');
  }
  return <>{children}</>;
}
