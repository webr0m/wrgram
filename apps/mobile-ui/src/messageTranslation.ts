import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Message } from './contract';
import { readPreference, writePreference } from './devicePreferences';
import { useLanguage } from './language';

export const TRANSLATION_MODES = [
  ['different', 'Solo en otros idiomas'],
  ['all', 'En todos los mensajes'],
  ['off', 'Ocultar la opción de traducir'],
] as const;
type Mode = typeof TRANSLATION_MODES[number][0];
const key = 'wrgram.message-translation-mode';
const listeners = new Set<() => void>();
let mode: Mode = 'different';
let changed = false;

const getMode = () => mode;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function isMode(value: unknown): value is Mode {
  return TRANSLATION_MODES.some(([id]) => id === value);
}
function applyMode(value: Mode) {
  if (mode === value) return;
  mode = value;
  listeners.forEach(listener => listener());
}
export function setTranslationMode(value: string) {
  if (!isMode(value)) return;
  changed = true;
  applyMode(value);
  void writePreference(key, value).catch(() => {});
}
void readPreference<unknown>(key).then(value => {
  if (!changed && isMode(value)) applyMode(value);
}).catch(() => {});

export function useTranslationMode() {
  return useSyncExternalStore(subscribe, getMode);
}

const cache = new Map<string, Promise<string | undefined>>();
const pending = new Map<number, (language?: string) => void>();
let worker: Worker | undefined;
let unavailable = false;
let sequence = 0;

function stopDetection() {
  unavailable = true;
  worker?.terminate();
  pending.forEach(resolve => resolve());
  pending.clear();
}

function detect(text: string): Promise<string | undefined> {
  const sample = text.slice(0, 800);
  const cached = cache.get(sample);
  if (cached) return cached;
  if (unavailable) return Promise.resolve(undefined);
  const task = new Promise<string | undefined>(resolve => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./translationLanguage.worker.ts', import.meta.url), { type: 'module' });
        worker.addEventListener('error', stopDetection);
        worker.addEventListener('message', ({ data }: MessageEvent<{ id: number; language?: string }>) => {
          pending.get(data.id)?.(data.language);
          pending.delete(data.id);
        });
      }
      const id = ++sequence;
      pending.set(id, resolve);
      worker.postMessage({ id, text: sample });
    } catch {
      stopDetection();
      resolve(undefined);
    }
  });
  cache.set(sample, task);
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return task;
}

export function translationLanguageFamily(code: string): string {
  const primary = code.toLowerCase().split('-')[0];
  return primary === 'nb' || primary === 'nn' ? 'no' : primary;
}

export function useShowMessageTranslation(message: Message, allowed: boolean): boolean {
  const mode = useTranslationMode();
  const { language } = useLanguage();
  const eligible = allowed && !!message.text.trim() && !message.service && !message.rich &&
    !message.checklist && message.status !== 'pending' && message.status !== 'failed';
  const sample = eligible && mode === 'different' ? message.text : '';
  const [result, setResult] = useState<{ text: string; language?: string }>();

  useEffect(() => {
    if (!sample) return;
    let active = true;
    void detect(sample).then(language => {
      if (active) setResult({ text: sample, language });
    });
    return () => { active = false; };
  }, [sample]);

  if (!eligible || mode === 'off') return false;
  if (mode === 'all') return true;
  return result?.text === sample && !!result.language &&
    translationLanguageFamily(result.language) !== translationLanguageFamily(language);
}
