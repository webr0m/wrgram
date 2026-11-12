import { parseNoteProposal, type NoteProposal } from '@wrgram/assistant';

export class ProviderError extends Error {
  constructor(message: string, readonly statusCode = 503) { super(message); this.name = 'ProviderError'; }
}

export const SYSTEM_PROMPT = `Eres WR IA, el asistente de WRGram. Responde en español, con claridad y sin inventar capacidades.
Eres independiente de Telegram: no puedes leer chats, contactos, archivos, sesiones, internet ni enviar mensajes.
Trabaja exclusivamente con las instrucciones propias que el usuario escribe en este espacio.
No pidas ni proceses conversaciones de Telegram, contraseñas, códigos de acceso ni tokens.
Si te piden analizar mensajes de Telegram, explica que esta integración no admite ese uso y ofrece trabajar con una idea original del usuario.
Puedes ayudar a escribir textos originales, organizar ideas, explicar conceptos o planificar proyectos.
La única herramienta disponible prepara una PROPUESTA de nota personal, independiente de cualquier chat.
Úsala solo cuando el usuario pida explícitamente crear o guardar una nota. Nunca afirmes que ya la guardaste: requiere confirmación en la interfaz.
Las notas se guardan localmente sin cifrado. No sugieras guardar secretos. No ejecutes código ni simules herramientas inexistentes.`;

export const NOTE_TOOL = {
  type: 'function',
  function: {
    name: 'prepare_personal_note',
    description: 'Proponer una nota personal a partir de una idea original del usuario. No guarda datos; requiere confirmación.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { title: { type: 'string', maxLength: 80 }, text: { type: 'string', maxLength: 5000 } },
      required: ['title', 'text'],
    },
  },
};

/** Solo traduce llamadas en propuestas de datos. No ejecuta funciones del modelo. */
export function parseToolProposals(calls: unknown): NoteProposal[] {
  return (Array.isArray(calls) ? calls : []).slice(0, 3).flatMap((call: unknown) => {
    if (!call || typeof call !== 'object') return [];
    const fn = (call as { function?: unknown }).function;
    if (!fn || typeof fn !== 'object') return [];
    const tool = fn as { name?: unknown; arguments?: unknown };
    if (tool.name !== 'prepare_personal_note') return [];
    let args: unknown = tool.arguments;
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return []; } }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
    const proposal = parseNoteProposal({ ...args, type: 'prepare_personal_note' });
    return proposal ? [proposal] : [];
  });
}
