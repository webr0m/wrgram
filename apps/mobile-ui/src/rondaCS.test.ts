import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUOTE_EMPTY, QUOTE_MISMATCH, QUOTE_NOT_TEXT, clipEntities, quoteProblem, selectionQuote } from './quoteRules';
import type { TextEntity } from './contract';

/**
 * Ronda CS · M02: citar el texto seleccionado al responder. La cita (texto + posición UTF-16 +
 * entidades recortadas) viaja en `send.text` como `quote`, las dos capas nativas la validan contra
 * el mensaje original antes de tocar la red y la proyectan de vuelta como `replyQuote`. El chat
 * secreto la descarta (TDLib exige quote null ahí) y el borrador de Telegram sigue sin cita:
 * `Drafts.java` mantiene el constructor con null. La cita entre chats distintos y los richTexts
 * quedan fuera de esta ronda (CS-B).
 *
 * Lo que no se puede probar sin cuenta queda dicho: el envío real con quote y la vuelta del
 * servidor solo se prueban en el dispositivo del propietario. Aquí se mide el contrato estático
 * y el espejo funcional de las reglas puras.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const lines = (source: string) => source.split(/\r?\n/);
const line = (source: string, at: number) => lines(source)[at - 1];

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const rules = text(`${javaDir}ReplyQuote.java`);
const engine = text(`${javaDir}TdSession.java`);
const bridge = text(`${javaDir}NativeBridge.java`);
const snapshot = text(`${javaDir}NativeSnapshot.java`);
const drafts = text(`${javaDir}Drafts.java`);
const desktopDir = '../../desktop/src/WRGram.Desktop/';
const service = text(`${desktopDir}TelegramService.cs`);
const desktop = text(`${desktopDir}DesktopReplyQuote.cs`);
const stateCs = text(`${desktopDir}DesktopState.cs`);
const contract = text('./contract.ts');
const app = text('./App.tsx');
const quoteUi = text('./ReplyQuote.tsx');

describe('ronda CS · la cita de texto en las tres capas', () => {
  it('las tres capas niegan con las mismas frases', () => {
    const java = [...rules.matchAll(/static final String \w+ = "([^"]+)";/g)].map(m => m[1]).sort();
    const cs = [...desktop.matchAll(/public const string \w+ = "([^"]+)";/g)].map(m => m[1]).sort();
    const ts = [QUOTE_NOT_TEXT, QUOTE_EMPTY, QUOTE_MISMATCH].sort();
    expect(java).toEqual(ts);
    expect(cs).toEqual(ts);
  });

  it('Android valida la cita contra el original antes de tocar la red y nombra la negativa', () => {
    expect(line(bridge, 751)).toContain('ReplyQuote.of');
    expect(line(bridge, 751)).toContain('a.fail(invalid.getMessage())');
    expect(rules).toContain('original.substring(position, position + quote.length()).equals(quote)');
    expect(rules).toContain('NativeSnapshot.formatted');
  });

  it('el envío de Android lleva la cita y el chat secreto la descarta', () => {
    expect(line(engine, 1104)).toContain('TdApi.InputTextQuote quote');
    expect(line(engine, 1130)).toContain('reply.quote');
    expect(line(engine, 1130)).toContain('ChatTypeSecret');
  });

  it('la vuelta de Android proyecta la cita con sus entidades', () => {
    expect(line(snapshot, 229)).toContain('replyQuote');
    expect(line(snapshot, 229)).toContain('entities(reply.quote.text)');
  });

  it('Windows decide la cita antes de marcar el envío como en curso', () => {
    const start = service.indexOf('    private async Task<object?> SendAsync(');
    const end = service.indexOf('    private async Task<object?> TypingAsync(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const send = service.slice(start, end);
    const quote = send.indexOf('DesktopReplyQuote.ForAsync');
    const sending = send.indexOf('_state.Sending = true;');
    expect(quote).toBeGreaterThanOrEqual(0);
    expect(sending).toBeGreaterThan(quote);
    expect(send).not.toContain('new InputReplyToMessage');
    expect(desktop).toContain('GetMessages');
    expect(desktop).toContain('quote_text');
    expect(desktop).toContain('quote_offset');
    expect(desktop).toContain('MessageEntityStrike');
    expect(desktop).toContain('MessageEntityFormattedDate');
  });

  it('la vuelta de Windows proyecta la cita hacia el DTO', () => {
    expect(line(service, 3436)).toContain('DesktopReplyQuote.Receive');
    expect(stateCs).toContain('public ReplyQuoteDto? ReplyQuote { get; set; }');
    expect(desktop).toContain('quote_text');
  });

  it('el contrato y la pantalla llevan la cita de ida y de vuelta', () => {
    expect(line(contract, 159)).toContain('replyQuote');
    expect(line(app, 822)).toContain('quote:replyQuote');
    expect(line(app, 1151)).toContain('selectionQuote');
    expect(line(app, 1264)).toContain('quote={message.replyQuote}');
    expect(quoteUi).toContain('FormattedText');
  });

  it('el borrador de Telegram sigue sin cita', () => {
    expect(drafts).toContain('new TdApi.InputMessageReplyToMessage(replyTo, null, 0, "")');
    expect(drafts).not.toContain('InputTextQuote');
  });

  it('las longitudes de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    expect(lines(engine).length).toBe(1430);
    expect(lines(snapshot).length).toBe(554);
    expect(lines(bridge).length).toBe(5602);
    expect(lines(service).length).toBe(4312);
    expect(lines(app).length).toBe(1593);
    expect(lines(contract).length).toBe(251);
    expect(lines(stateCs).length).toBe(760);
  });
});

describe('ronda CS · el espejo funcional de las reglas puras', () => {
  it('una cita que cuadra no tiene problema', () => {
    expect(quoteProblem('Hola mundo cruel', 'mundo', 5)).toBeUndefined();
  });

  it('la cita vacía y la que no cuadra se niegan por su nombre', () => {
    expect(quoteProblem('Hola mundo cruel', '', 0)).toBe(QUOTE_EMPTY);
    expect(quoteProblem('Hola mundo cruel', 'mundo', 0)).toBe(QUOTE_MISMATCH);
    expect(quoteProblem('Hola mundo cruel', 'cruel', -1)).toBe(QUOTE_MISMATCH);
    expect(quoteProblem('Hola mundo cruel', 'cruel', 12)).toBe(QUOTE_MISMATCH);
  });

  it('las entidades se recortan, se desplazan y solo viajan los tipos admitidos', () => {
    const entities: TextEntity[] = [
      { type: 'bold', offset: 5, length: 5 },
      { type: 'italic', offset: 3, length: 5 },
      { type: 'code', offset: 0, length: 16 },
      { type: 'customEmoji', offset: 6, length: 2, customEmojiId: '123' },
    ];
    const clipped = clipEntities(entities, 5, 3);
    expect(clipped).toEqual([
      { type: 'bold', offset: 0, length: 3 },
      { type: 'italic', offset: 0, length: 3 },
      { type: 'customEmoji', offset: 1, length: 2, customEmojiId: '123' },
    ]);
    expect(clipEntities(undefined, 0, 3)).toEqual([]);
    expect(clipEntities([{ type: 'bold', offset: 0, length: 2 }], 5, 3)).toEqual([]);
  });

  it('la selección se convierte en cita solo si vive dentro del texto', () => {
    const selection = { toString: () => 'mundo' } as Selection;
    expect(selectionQuote('Hola mundo cruel', selection)).toEqual({ text: 'mundo', position: 5 });
    expect(selectionQuote('Hola mundo cruel', { toString: () => 'otra cosa' } as Selection)).toBeUndefined();
    expect(selectionQuote('Hola mundo cruel', { toString: () => '' } as Selection)).toBeUndefined();
    expect(selectionQuote('Hola mundo cruel', null)).toBeUndefined();
    expect(selectionQuote('', selection)).toBeUndefined();
  });
});