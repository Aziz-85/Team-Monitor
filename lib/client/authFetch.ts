import { CSRF_HEADER } from '@/lib/csrf';

let cachedCsrf: string | null = null;

/** Fetch CSRF token (sets cookie + returns token for header). */
export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  const token = typeof data.csrfToken === 'string' ? data.csrfToken : '';
  cachedCsrf = token;
  return token;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = cachedCsrf ?? (await fetchCsrfToken());
  const headers = new Headers(init.headers);
  headers.set(CSRF_HEADER, token);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}
