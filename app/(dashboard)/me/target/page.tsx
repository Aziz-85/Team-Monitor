import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { MyTargetClient } from './MyTargetClient';

export default async function MyTargetPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <MyTargetClient />;
}
