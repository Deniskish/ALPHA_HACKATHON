// Demo identity: «Я клиент» / «Я пока не клиент».
// Persisted in sessionStorage + localStorage, and transferable across devices via QR handoff tokens.
import { useSyncExternalStore } from 'react';
import type { CompanyView, ManualCompany } from './api';

export type DemoSession = {
  relationship: 'client' | 'non_client';
  company: CompanyView;
  manual: ManualCompany | null;
};

const key = 'opora.demo-session.v1';
const listeners = new Set<() => void>();

// Browser UTF-8 safe base64url encoding/decoding
export function toBase64Url(str: string): string {
  if (typeof TextEncoder !== 'undefined') {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Node / SSR fallback
  return Buffer.from(str, 'utf-8').toString('base64url');
}

export function fromBase64Url(base64url: string): string {
  if (typeof TextDecoder !== 'undefined') {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  // Node / SSR fallback
  return Buffer.from(base64url, 'base64url').toString('utf-8');
}

/** Builds an omnichannel transfer URL containing the active session payload. */
export function buildHandoffUrl(session: DemoSession | null, targetUrl?: string): string {
  if (typeof window === 'undefined' && !targetUrl) {
    return 'https://alfa.business-opora.ru';
  }

  const raw =
    targetUrl ||
    (typeof window !== 'undefined' && typeof window.location !== 'undefined' && window.location.href
      ? window.location.href
      : 'https://alfa.business-opora.ru');
  const [baseAndSearch, ...hashParts] = raw.split('#');
  const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : '#/';

  if (!session) {
    return `${baseAndSearch}${hash}`;
  }

  const payload = {
    r: session.relationship,
    inn: session.company.inn,
    c: {
      inn: session.company.inn,
      name: session.company.name,
      legalForm: session.company.legalForm,
      registrationDate: session.company.registrationDate,
      okved: session.company.okved,
      okvedTitle: session.company.okvedTitle,
      region: session.company.region,
      employees: session.company.employees,
      relationship: session.company.relationship,
      isSynthetic: session.company.isSynthetic,
      syntheticLabel: session.company.syntheticLabel,
      bankProfile: session.company.bankProfile,
      demo: session.company.demo,
    },
    m: session.manual,
  };

  const token = toBase64Url(JSON.stringify(payload));
  const [basePath, existingSearch] = baseAndSearch.split('?');
  const searchParams = new URLSearchParams(existingSearch || '');
  searchParams.set('s', token);

  return `${basePath}?${searchParams.toString()}${hash}`;
}

export function parseHandoffToken(token: string): DemoSession | null {
  try {
    const json = fromBase64Url(token);
    const data = JSON.parse(json);
    if (!data || (!data.inn && !data.c)) return null;

    return {
      relationship: data.r || 'client',
      company: (data.c || {
        inn: data.inn,
        name: data.inn,
        isSynthetic: true,
        relationship: data.r || 'client',
        syntheticLabel: null,
      }) as CompanyView,
      manual: data.m || null,
    };
  } catch {
    return null;
  }
}

function initSession(): DemoSession | null {
  if (typeof window === 'undefined') return null;

  // 1. Check URL for handoff token (?s=...)
  try {
    let token: string | null = null;
    if (window.location.search) {
      const searchParams = new URLSearchParams(window.location.search);
      token = searchParams.get('s');
    }
    if (!token && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      token = new URLSearchParams(hashQuery).get('s');
    }

    if (token) {
      const restored = parseHandoffToken(token);
      if (restored) {
        try {
          const s = JSON.stringify(restored);
          sessionStorage.setItem(key, s);
          localStorage.setItem(key, s);
        } catch {}

        // Clean query param from URL without page reload
        if (window.history && window.history.replaceState) {
          const searchParams = new URLSearchParams(window.location.search);
          searchParams.delete('s');
          const cleanQuery = searchParams.toString() ? `?${searchParams.toString()}` : '';
          window.history.replaceState(null, '', `${window.location.pathname}${cleanQuery}${window.location.hash}`);
        }
        return restored;
      }
    }
  } catch {
    /* fallback to storage */
  }

  // 2. Check sessionStorage
  try {
    const s = sessionStorage.getItem(key);
    if (s) return JSON.parse(s);
  } catch {}

  // 3. Check localStorage
  try {
    const l = localStorage.getItem(key);
    if (l) {
      sessionStorage.setItem(key, l);
      return JSON.parse(l);
    }
  } catch {}

  return null;
}

let current: DemoSession | null = initSession();

export function setSession(next: DemoSession | null) {
  current = next;
  try {
    if (next) {
      const serialized = JSON.stringify(next);
      sessionStorage.setItem(key, serialized);
      localStorage.setItem(key, serialized);
    } else {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {
    /* demo works without storage */
  }
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0 });
  }
}

export function useSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => null
  );
}
