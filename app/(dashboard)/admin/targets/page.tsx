import { permanentRedirect } from 'next/navigation';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Canonical targets admin UI lives at `/targets`. */
export default async function AdminTargetsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const boutiqueId = sp.boutiqueId;
  const q = new URLSearchParams();
  if (typeof boutiqueId === 'string' && boutiqueId.trim()) {
    q.set('boutiqueId', boutiqueId.trim());
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  permanentRedirect(`/targets${suffix}`);
}
