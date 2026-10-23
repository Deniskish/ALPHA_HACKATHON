// Hash routes keep browser Back, reloads and shareable links working without a server-side router.
import { useEffect, useState } from 'react';

export const stages = ['need', 'match', 'form', 'review', 'decision'] as const;
export type Stage = typeof stages[number];
export type Route =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'application'; id: string; stage?: Stage }
  | { name: 'bank' }
  | { name: 'bank-application'; id: string };

/** Which shell renders a route: the client cabinet or the bank workspace. */
export const shellOf = (route: Route) => route.name === 'bank' || route.name === 'bank-application' ? 'bank' : 'client';

/** Client shell: `#/`, `#/credit/new`, `#/credit/applications/:id/:stage`; bank shell: `#/bank`, `#/bank/applications/:id`.
 * Links of the previous version (`#/new`, `#/applications/...`) still open. */
export function parseRoute(hash: string): Route {
  const path = (hash.replace(/^#/, '') || '/').replace(/^\/credit(?=\/)/, '');
  const id = (prefix: string) => path.startsWith(prefix) ? decodeURIComponent(path.slice(prefix.length)) : '';
  if (path === '/new') return { name: 'new' };
  if (path === '/bank' || path === '/bank/applications') return { name: 'bank' };
  if (id('/bank/applications/')) return { name: 'bank-application', id: id('/bank/applications/') };
  if (id('/applications/')) {
    const [appId, stage] = id('/applications/').split('/');
    return stages.includes(stage as Stage) ? { name: 'application', id: appId, stage: stage as Stage } : { name: 'application', id: appId };
  }
  return { name: 'dashboard' };
}

export function routeHash(route: Route) {
  switch (route.name) {
    case 'dashboard': return '#/';
    case 'new': return '#/credit/new';
    case 'bank': return '#/bank';
    case 'application': return `#/credit/applications/${encodeURIComponent(route.id)}${route.stage ? `/${route.stage}` : ''}`;
    case 'bank-application': return `#/bank/applications/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route) {
  if (location.hash !== routeHash(route)) location.hash = routeHash(route);
  window.scrollTo({ top: 0 });
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
