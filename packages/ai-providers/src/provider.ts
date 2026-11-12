import { GroqProvider } from './groq';
import { OllamaProvider } from './ollama';

export function createAssistantProvider() {
  const provider = process.env.WRGRAM_AI_PROVIDER ?? 'groq';
  if (provider === 'groq') return new GroqProvider();
  if (provider === 'ollama') return new OllamaProvider();
  throw new Error('WRGRAM_AI_PROVIDER debe ser groq u ollama.');
}
