import { useSyncExternalStore } from 'react';
import { readPreference, writePreference } from './devicePreferences';
import { isLanguage, resolveSystemLanguage, translateLabel } from './locales/catalog';
import type { Language } from './locales/catalog';

export { LANGUAGES } from './locales/catalog';
export type { Language } from './locales/catalog';

type Preference = Language | 'system';
const key = 'wrgram.interface-language';
const listeners = new Set<() => void>();

function getSystemLanguage() {
  const browser = globalThis.navigator;
  return resolveSystemLanguage(browser?.languages?.length ? browser.languages : [browser?.language ?? '']);
}

function getState(selected: Preference) {
  return { selected, language: selected === 'system' ? getSystemLanguage() : selected };
}

let state = getState('es');
let changed = false;
const getSnapshot = () => state;

function applyPreference(selected: Preference) {
  const next = getState(selected);
  if (next.selected === state.selected && next.language === state.language) return;
  state = next;
  listeners.forEach(listener => listener());
}

const refreshSystemLanguage = () => {
  if (state.selected === 'system') applyPreference('system');
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    globalThis.addEventListener?.('languagechange', refreshSystemLanguage);
    refreshSystemLanguage();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) globalThis.removeEventListener?.('languagechange', refreshSystemLanguage);
  };
}

export function setLanguage(value: string) {
  if (value !== 'system' && !isLanguage(value)) return;
  changed = true;
  applyPreference(value);
  void writePreference(key, value).catch(() => {});
}

void readPreference<unknown>(key).then(value => {
  if (!changed && (value === 'system' || isLanguage(value))) applyPreference(value);
}).catch(() => {});

export function useLanguage() {
  const { selected, language } = useSyncExternalStore(subscribe, getSnapshot);
  return { selected, language, t: (text: string) => translateLabel(language, text) };
}
