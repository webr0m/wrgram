import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { BUILTIN_PLUGINS } from '@wrgram/plugin-sdk';
import { validateAssistantRequest, type AssistantProvider } from '@wrgram/assistant';
import { createAssistantProvider, ProviderError } from '@wrgram/ai-providers';
import { createTelegramWebGateway, registerTelegramWebRoutes, type TelegramWebGateway } from './telegram/routes';

const DISABLED_TELEGRAM: TelegramWebGateway = {
  enabled: false,
  reason: 'El cliente web TDLib está desactivado en este servidor.',
  config: null,
  manager: null,
  close: async () => undefined,
};

export function buildApp(options: {
  assistant?: AssistantProvider;
  logger?: boolean;
  telegram?: TelegramWebGateway | false;
} = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : { redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 192 * 1024,
    trustProxy: process.env.WRGRAM_TRUST_PROXY === '1',
  });
  const assistant = options.assistant ?? createAssistantProvider();
  const telegram = options.telegram === false ? DISABLED_TELEGRAM : options.telegram ?? createTelegramWebGateway();
  let inFlight = 0;
  // El hook onRoute del limitador debe estar registrado antes de declarar las rutas.
  app.register(async (routes) => {
    await routes.register(rateLimit, { global: false });
    await registerTelegramWebRoutes(routes, telegram);
    routes.get('/health', async () => ({ status: 'ok', service: 'wrgram-api', version: '0.1.0' }));
    routes.get('/v1/plugins', async () => ({ plugins: BUILTIN_PLUGINS }));
    routes.get('/v1/assistant/status', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return assistant.status();
    });
    routes.post('/v1/assistant/chat', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!validateAssistantRequest(request.body)) {
        return reply.code(400).send({ message: 'Solicitud inválida. Escribe tu propio texto y acepta el aviso de IA.' });
      }
      if (request.body.provider !== assistant.id) {
        return reply.code(409).send({ message: 'El proveedor de IA cambió. Actualiza su estado y acepta de nuevo el aviso de privacidad.' });
      }
      if (inFlight >= 2) return reply.code(429).send({ message: 'El asistente está ocupado. Inténtalo de nuevo en unos instantes.' });
      const controller = new AbortController();
      const onDisconnect = () => { if (!reply.raw.writableEnded) controller.abort(); };
      reply.raw.once('close', onDisconnect);
      inFlight++;
      try { return await assistant.chat(request.body, controller.signal); }
      catch (error) {
        if (error instanceof ProviderError) return reply.code(error.statusCode).send({ message: error.message });
        return reply.code(503).send({ message: 'El servicio de IA no está disponible. Revisa el proveedor configurado.' });
      } finally {
        inFlight--;
        reply.raw.off('close', onDisconnect);
      }
    });
  });
  return app;
}
