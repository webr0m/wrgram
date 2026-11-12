import { identifyLanguage } from './translationLanguage';

self.addEventListener('message', async (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  const language = await identifyLanguage(text).catch(() => undefined);
  self.postMessage({ id, language });
});
