/**
 * Active state for nav links that may include query strings (e.g. /approvals?module=SCHEDULE).
 * Plain /approvals is active only when there is no `module` query param.
 */
export function isNavHrefActive(pathname: string, search: string, href: string): boolean {
  const qs = search.startsWith('?') ? search.slice(1) : search;
  const have = new URLSearchParams(qs);

  if (href.includes('?')) {
    const [path, wantQs] = href.split('?');
    if (pathname !== path) return false;
    const want = new URLSearchParams(wantQs ?? '');
    let match = true;
    want.forEach((v, k) => {
      if (have.get(k) !== v) match = false;
    });
    if (!match) return false;
    return true;
  }

  if (pathname !== href) {
    return href !== '/' && pathname.startsWith(`${href}/`);
  }

  if (href === '/approvals' && have.get('module')) return false;
  return true;
}
