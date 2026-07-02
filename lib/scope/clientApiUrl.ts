/**
 * Append SUPER_ADMIN boutique context (?b= / ?boutique=) to client-side API fetches
 * so server routes resolve the same host boutique as the visible schedule page.
 */

type SearchParamsLike = {
  get(name: string): string | null;
};

export function appendBoutiqueContextToApiPath(
  path: string,
  searchParams?: SearchParamsLike | null
): string {
  if (!searchParams) return path;
  const b = searchParams.get('b')?.trim();
  const boutique = searchParams.get('boutique')?.trim();
  if (!b && !boutique) return path;

  const [base, existingQuery] = path.split('?');
  const params = new URLSearchParams(existingQuery ?? '');
  if (b) {
    params.set('b', b);
    params.delete('boutique');
  } else if (boutique) {
    params.set('boutique', boutique);
    params.delete('b');
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
