import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ronda BV: las reacciones dejan de poder escribirse con un emoji que Telegram no admite, y las que solo
 * pone una cuenta con Premium llegan por fin hasta la pantalla.
 *
 * El fallo que se repara estaba en el camino más largo: «Ver todos los emojis» abría el catálogo Unicode
 * completo —con tonos de piel— y lo que salía por ahí se mandaba a ciegas, sin preguntar a Telegram qué
 * reacciones admite ese mensaje. La respuesta era «Telegram no pudo completar la operación (400)». Las
 * agujas de abajo vigilan el orden en que se pregunta, las dos frases nuevas y que la interfaz ya no pueda
 * ofrecer lo que el puente se va a negar a enviar.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path: string) => {
  try { readFileSync(new URL(path, import.meta.url)); return true; } catch { return false; }
};

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const reactRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageReact.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const suite = text('./ReactionSuite.tsx');
const contract = text('./contract.ts');
const styles = ['./style.css', './visual-polish.css'].map(path => text(path)).join('\n');

const javaLines = java.split(/\r?\n/);
const previewLines = preview.split(/\r?\n/);

const count = (needle: string, source: string) => source.split(needle).length - 1;

function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta «${needle}»`);
  return index;
}

/** Cuerpo de un miembro de Java, desde la firma que contiene `needle` hasta la llave que lo cierra. */
function javaBody(needle: string): string {
  const start = at(needle, java);
  let depth = 0;
  for (let i = java.indexOf('{', start); i < java.length; i++) {
    if (java[i] === '{') depth++;
    else if (java[i] === '}' && --depth === 0) return java.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para «${needle}»`);
}

/** La línea medida de un archivo, con el mismo recorte que usan BK y BM: número de línea, no búsqueda suelta. */
const javaLine = (at: number) => javaLines[at - 1];
const previewLine = (at: number) => previewLines[at - 1];

/** La línea, sin la sangría, en la que aparece por primera vez el texto dado. */
function line(needle: string, source: string): string {
  const found = source.split(/\r?\n/).find(entry => entry.includes(needle));
  if (!found) throw new Error(`Falta la línea «${needle}»`);
  return found.trim();
}

/** El literal que una capa escribe entre comillas, para comparar las dos orillas carácter a carácter. */
const quoted = (needle: string, source: string, quote: '"' | "'") => {
  const body = source.slice(at(needle, source), at(needle, source) + 400);
  const match = new RegExp(`${quote}([^${quote}\\\\]*)${quote}`).exec(body);
  if (!match) throw new Error(`Falta la frase tras «${needle}»`);
  return match[1];
};

const UNOFFERED = 'Telegram no ofrece esa reacción en este chat.';
const NEEDS_PREMIUM = 'Esa reacción necesita Telegram Premium.';

describe('ronda BV · Android: se pregunta antes de añadir', () => {
  it('el camino de quitar no se toca, y el de añadir pasa por la pregunta', () => {
    const react = javaBody('private void react(JSONObject p,Answer a)');
    expect(react).toContain('if(p.optBoolean("remove")){perform(new TdApi.RemoveMessageReaction(message.chatId,message.id,reaction),a,value->a.ok(true));return;}');
    expect(react).toContain('reactOffered(message,reaction,a);}');
    // Antes de la ronda BV el `add` salía directo desde aquí; ya no hay un `AddMessageReaction` en el brazo.
    expect(count('new TdApi.AddMessageReaction', react)).toBe(0);
  });

  it('los tres estados de la pregunta, en el orden que decide el resultado', () => {
    const guard = javaBody('private void reactOffered(TdApi.Message message,TdApi.ReactionTypeEmoji reaction,Answer a)');
    expect(quoted('if(offered==0){a.fail(', guard, '"')).toBe(UNOFFERED);
    expect(guard).toContain('if(offered==1){sendReaction(message,reaction,a);return;}');
    expect(quoted('if(!user.isPremium){a.fail(', guard, '"')).toBe(NEEDS_PREMIUM);
    expect(at('if(offered==0)', guard)).toBeLessThan(at('if(offered==1)', guard));
    expect(at('if(offered==1)', guard)).toBeLessThan(at('perform(new TdApi.GetUser(session.selfId)', guard));
    // La marca de Premium no la inventa la app: es la que trae cada `AvailableReaction` de TDLib.
    expect(javaBody('private static int offeredReaction')).toContain('return reaction.needsPremium?2:1;');
  });

  it('si Telegram no contesta la lista, la reacción se manda igual: quien la niega es el servidor', () => {
    expect(java).toContain('},failure->sendReaction(message,reaction,a));');
    expect(count('new TdApi.AddMessageReaction', java)).toBe(2);
    expect(java).toContain('private void sendReaction(TdApi.Message message,TdApi.ReactionType reaction,Answer a){perform(new TdApi.AddMessageReaction(message.chatId,message.id,reaction,false,true),a,value->a.ok(true));}');
  });

  it('la lista que se enseña es la misma forma que ya usaban las historias', () => {
    const list = javaBody('private JSONArray reactionOptions(TdApi.AvailableReactions available)');
    expect(list).toContain('JSONObject item=reactionDto(reaction.type)');
    expect(list).toContain('item.put("needsPremium",reaction.needsPremium)');
    // El filtro que ocultaba las de Premium y el tope de dieciséis ya no están.
    expect(list).not.toContain('!reaction.needsPremium&&');
    expect(list).not.toContain('result.length()<16');
    expect(java).not.toContain('private JSONArray emojis(');
    expect(javaLine(4310)).toContain('result.put("reactions",reactionOptions(value))');
    expect(javaLine(4314).startsWith('    private JSONArray reactionOptions(')).toBe(true);
    expect(javaLine(4315).startsWith('    private void react(JSONObject p,Answer a){')).toBe(true);
  });

  it('las tres claves de reacción del puente siguen siendo las tres de siempre', () => {
    for (const key of ['message.react', 'message.react.custom', 'message.react.paid']) {
      expect(policy).toContain(`"${key}"`);
      expect(java).toContain(`case "${key}":`);
    }
    expect(count('"message.react"', policy)).toBe(1);
  });
});

describe('ronda BV · la interfaz ya no puede ofrecer lo que el puente niega', () => {
  it('el catálogo Unicode libre desaparece de las reacciones', () => {
    expect(exists('./EmojiSuite.tsx')).toBe(false);
    expect(exists('./emoji-suite.css')).toBe(false);
    expect(app).not.toContain('EmojiSuite');
    expect(preview).not.toContain('EmojiSuite');
    expect(suite).toContain('Telegram decide qué reacciones admite cada mensaje');
  });

  it('la banda son ocho y el más abre la lista entera, sin tonos de piel', () => {
    expect(app).toContain('{props.reactions.slice(0,8).map(option=><ReactionButton key={reactionKey(option)} option={option} pick={reactWith}/>)}');
    expect(app).toContain('<ReactionSuite options={props.reactions} pick={reactWith}/>');
    expect(at('props.reactions.slice(0,8)', app)).toBeLessThan(at('<ReactionSuite options={props.reactions}', app));
    expect(suite).not.toContain('SKIN_TONES');
    expect(suite).not.toContain('tonedEmoji');
  });

  it('cada clase de reacción sabe a dónde va a parar', () => {
    const route = line('const reactWith=(option:ReactionOption)=>', app);
    expect(route).toContain("if(option.kind==='custom'){act('message.react.custom',{emoji:option.customEmojiId});return;}");
    expect(route).toContain("act('message.react',{emoji:option.emoji})");
    expect(suite).toContain("{custom?<CustomEmoji id={option.customEmojiId??''} size={22}/>:option.emoji}");
    expect(suite).toContain("title={option.needsPremium?'Requiere Telegram Premium':undefined}");
    expect(suite).toContain("className={option.needsPremium?'reaction-premium':''}");
    expect(styles).toContain('.reaction-picker .reaction-premium::after');
  });

  it('el contrato y el espejo viajan en la forma nueva', () => {
    expect(contract).toContain('reactions: ReactionOption[]');
    expect(contract).toContain('export interface ReactionOption { kind: \'emoji\' | \'custom\'');
    expect(contract).toContain('export type StoryReactionOption = ReactionOption;');
    expect(previewLine(377).startsWith('const DESIGN_REACTIONS: ReactionOption[] = [')).toBe(true);
    const sample = /\[([^\]]*)\]\.map<ReactionOption>/.exec(preview)![1].split(',');
    expect(sample.length).toBe(14);
    expect(count('needsPremium: true', preview)).toBe(2);
    expect(preview).toContain("{ kind: 'custom', customEmojiId: '544028896108879570', needsPremium: true }");
  });
});

describe('ronda BV · Windows no cambia de opinión', () => {
  it('las tres escrituras se siguen negando con la causa, antes que cualquier pregunta', () => {
    expect(service).toContain('"message.react" or "message.react.custom" or "message.react.paid" => throw new BridgeException(DesktopMessageReact.Refused),');
    expect(service).toContain('reactions = DesktopMessageReact.None,');
    const refused = /Refused =\s*\n\s*"([^"]+)"/.exec(reactRules)![1];
    expect(preview).toContain(`if (method === 'message.react' && state.platform === 'desktop') throw new Error(REACT_REFUSAL);`);
    expect(at("'message.react' && state.platform === 'desktop'", preview))
      .toBeLessThan(at("&& !params.remove && !DESIGN_REACTIONS.some", preview));
    expect(refused.length).toBeGreaterThan(0);
  });

  it('la frase nueva del andamio es la del puente, carácter a carácter', () => {
    expect(quoted("throw new Error('Telegram no ofrece", preview, "'")).toBe(UNOFFERED);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Props = { reactions: { kind: string; emoji?: string; customEmojiId?: string; needsPremium?: boolean }[] };

describe('ronda BV · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'android' });
    call = designRequest as DesignCall;
  });

  it('lo que Telegram no ofrece se niega con su frase, sin 400 de por medio', async () => {
    await expect(call('message.react', { id: '101', emoji: '🤡' })).rejects.toThrow(UNOFFERED);
    // Un emoji con tono de piel —los que fabricaba el catálogo libre— entra en la misma negativa.
    await expect(call('message.react', { id: '101', emoji: '👋🏾' })).rejects.toThrow(UNOFFERED);
    await expect(call('message.react', { id: '101', emoji: '🫠' })).rejects.toThrow(UNOFFERED);
  });

  it('lo que sí se ofrece sigue pidiendo una cuenta real, que es la verdad del andamio', async () => {
    await expect(call('message.react', { id: '101', emoji: '👍' })).rejects.toThrow(
      'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
    );
    // Quitar no se pregunta: lo que ya está puesto en la fila se puede quitar aunque no esté en la banda.
    await expect(call('message.react', { id: '101', emoji: '🤡', remove: true })).rejects.toThrow(
      'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
    );
  });

  it('el espejo ofrece las tres clases: libre, de Premium y personalizada', async () => {
    const props = await call('message.properties', { id: '101' }) as Props;
    expect(props.reactions).toHaveLength(16);
    expect(props.reactions.slice(0, 8).map(option => option.emoji)).toEqual(['👍', '❤️', '🔥', '👏', '🎉', '✅', '👀', '🙏']);
    expect(props.reactions.filter(option => option.needsPremium).map(option => option.kind)).toEqual(['emoji', 'custom']);
    expect(props.reactions.some(option => option.kind === 'custom' && option.customEmojiId === '544028896108879570')).toBe(true);
  });
});
