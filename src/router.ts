import { useEffect, useState } from 'react';

export interface Route {
  /** Path segments without the leading slash, e.g. ['screen', 'demo']. */
  segments: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter((s) => s !== '');
  return { segments, query: new URLSearchParams(queryPart) };
}

export function buildHash(segments: string[], query?: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== null && v !== undefined && v !== '') q.set(k, v);
  }
  const qs = q.toString();
  return '#/' + segments.join('/') + (qs ? '?' + qs : '');
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/** Replace one query parameter in the current hash without adding history. */
export function setQueryParam(key: string, value: string | null): void {
  const r = parseHash(window.location.hash);
  const q = Object.fromEntries(r.query.entries());
  if (value === null) delete q[key];
  else q[key] = value;
  const next = buildHash(r.segments, q);
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
