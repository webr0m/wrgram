import { describe, expect, it, vi } from 'vitest';
import { GroqProvider } from './groq';

const request = { messages: [{ role: 'user' as const, content: 'Prepara una nota para mi proyecto.' }], consent: true as const, provider: 'groq' as const };

describe('Groq online con clave solo en el servidor', () => {
  it('no llama al proveedor si no hay clave', async () => {
    const transport = vi.fn<typeof fetch>();
    const provider = new GroqProvider({ apiKey: '', transport });
    expect((await provider.status()).state).toBe('not-configured');
    await expect(provider.chat(request)).rejects.toThrow('Configura GROQ_API_KEY');
    expect(transport).not.toHaveBeenCalled();
  });
  it('convierte tool calls en propuestas sin ejecutarlas', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {
      content: null, tool_calls: [
        { function: { name: 'prepare_personal_note', arguments: JSON.stringify({ title: 'Mi proyecto', text: 'Un primer paso.' }) } },
        { function: { name: 'execute_code', arguments: '{}' } },
      ],
    } }] })));
    const result = await new GroqProvider({ apiKey: 'test-secret-not-real', transport }).chat(request);
    expect(result.provider).toBe('groq');
    expect(result.proposals).toHaveLength(1);
    expect(result).not.toHaveProperty('apiKey');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });
  it('no cambia de proveedor ni reintenta al agotar cuota', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(new GroqProvider({ apiKey: 'test', transport }).chat(request)).rejects.toThrow('cuota de Groq');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
