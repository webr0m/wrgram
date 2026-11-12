import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from './ollama';

describe('proveedor Ollama sin servicios de pago', () => {
  it('comprueba que el modelo está instalado sin descargarlo', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'qwen3:1.7b' }] })));
    expect((await new OllamaProvider({ transport }).status()).state).toBe('ready');
    expect(transport.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags');
  });
  it('informa de modelo ausente y de servicio desconectado', async () => {
    expect((await new OllamaProvider({ transport: vi.fn<typeof fetch>().mockResolvedValue(new Response('{"models":[]}')) }).status()).state).toBe('model-missing');
    expect((await new OllamaProvider({ transport: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')) }).status()).state).toBe('offline');
  });
  it('solo devuelve propuestas permitidas sin ejecutar herramientas', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: {
      content: '', tool_calls: [
        { function: { name: 'prepare_personal_note', arguments: { title: 'Mi plan', text: 'Estudiar TypeScript' } } },
        { function: { name: 'send_telegram_message', arguments: { text: 'No' } } },
      ],
    } })));
    const result = await new OllamaProvider({ transport }).chat({ messages: [{ role: 'user', content: 'Crea una nota sobre mi plan' }], consent: true, provider: 'ollama' });
    expect(result.proposals).toEqual([{ type: 'prepare_personal_note', title: 'Mi plan', text: 'Estudiar TypeScript' }]);
    expect(transport).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(payload.stream).toBe(false);
    expect(payload.messages[0].role).toBe('system');
    expect(payload).not.toHaveProperty('chatId');
  });
  it('no filtra errores internos ni inventa respuestas', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('private error', { status: 500 }));
    await expect(new OllamaProvider({ transport }).chat({ messages: [{ role: 'user', content: 'Hola' }], consent: true, provider: 'ollama' })).rejects.toThrow('Ollama no pudo generar');
  });
  it('rechaza modelos cloud y orígenes con credenciales', () => {
    expect(() => new OllamaProvider({ model: 'gpt-oss:20b-cloud' })).toThrow();
    expect(() => new OllamaProvider({ baseURL: 'http://user:pass@localhost:11434' })).toThrow();
  });
});
