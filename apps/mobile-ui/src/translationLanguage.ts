import { loadModule } from 'cld3-asm';

let detector: ReturnType<typeof createDetector> | undefined;

async function createDetector() {
  return (await loadModule({ timeout: 5000 })).create(0, 2400);
}

export async function identifyLanguage(text: string): Promise<string | undefined> {
  const sample = text.slice(0, 800).normalize('NFC')
    .replace(/(?:https?:\/\/|www\.)\S+|(?:^|\s)[@#][\p{L}\p{N}_]+/giu, ' ')
    .replace(/\s+/g, ' ').trim();
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 4) return;
  const latinOnly = !/\p{L}/u.test(sample.replace(/\p{Script=Latin}/gu, ''));
  if (latinOnly &&
      (letters < 10 || !/\p{L}[^\p{L}]+\p{L}/u.test(sample))) return;

  detector ??= createDetector();
  const result = (await detector).findMostFrequentLanguages(sample, 2)[0];
  if (!result?.is_reliable || result.proportion < .8 || result.language === 'und') return;
  return result.language;
}
