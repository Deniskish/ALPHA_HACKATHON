// Demo identity: «Я клиент» / «Я пока не клиент». Not an authorization — the choice lives in sessionStorage only.
import { useSyncExternalStore } from 'react';
import type { CompanyView, ManualCompany } from './api';

export type DemoSession = { relationship: 'client' | 'non_client'; company: CompanyView; manual: ManualCompany | null };
const key = 'opora.demo-session.v1';
const listeners = new Set<() => void>();
let current: DemoSession | null = read();

function read(): DemoSession | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { return null; }
}
export function setSession(next: DemoSession | null) {
  current = next;
  try { if (next) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key); } catch { /* demo works without storage */ }
  listeners.forEach((listener) => listener());
}
export function useSession() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => null);
}
