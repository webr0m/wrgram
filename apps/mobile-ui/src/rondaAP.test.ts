import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const contactRules = text('../../desktop/src/WRGram.Desktop/DesktopContact.cs');
const clipboardRules = text('../../desktop/src/WRGram.Desktop/DesktopClipboard.cs');
const pollRules = text('../../desktop/src/WRGram.Desktop/DesktopPoll.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const stateFile = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const panels = text('./BatchPanels.tsx');
const card = text('./MessageExtraCard.tsx');
const contract = text('./contract.ts');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const extras = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MessageExtras.java');
const snapshot = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');

/** El literal que la clase de reglas asigna a una constante de C#. */
function csSentence(name: string, from = contactRules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El literal de una constante de TypeScript declarada con `=` y no dentro de un objeto. */
function tsConst(name: string, from = preview): string {
  const match = new RegExp(`\\b${name} = '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** El método Java correspondiente, desde su firma hasta la llave que lo cierra. */
function javaBody(name: string, from = java): string {
  const start = from.search(new RegExp(`(?:private|void|String) [^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Lo que el puente lee de una tarjeta de contacto: desde su `case` hasta el `break` que lo cierra. */
function csCard(): string {
  const start = at('case MessageMediaContact card:', service);
  return service.slice(start, start + at('break;', service.slice(start)));
}

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** Lo que una capa hace antes que la otra: si el orden se pierde, la prueba dice cuál iba primero. */
function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta «${needle}»`);
  return index;
}

const contactRefusals = /const CONTACT_REFUSALS = \{([\s\S]*?)\n\};/.exec(preview)?.[1] ?? '';
const pollRefusals = /const POLL_REFUSALS = \{([\s\S]*?)\n\};/.exec(preview)?.[1] ?? '';

/** Las cuatro frases que la tarjeta pronuncia, con dónde nacieron. */
const CONTACT_SENTENCES: [string, string, 'java' | 'aquí'][] = [
  ['notAllowed', 'NotAllowed', 'java'],
  ['noPhone', 'NoPhone', 'java'],
  ['longQuery', 'LongQuery', 'aquí'],
  ['notListed', 'NotListed', 'aquí'],
];

describe('ronda AP · la tarjeta de contacto habla en las tres capas', () => {
  it('cada negativa de la tarjeta está en las dos capas de este cliente', () => {
    expect(contactRefusals).not.toBe('');
    for (const [key, name, origin] of CONTACT_SENTENCES) {
      const sentence = csSentence(name);
      expect(tsProperty(key, contactRefusals)).toBe(sentence);
      // Las dos que Android dice se las dice a sí mismo en Java; las otras dos no están en su fuente.
      if (origin === 'java') expect(java).toContain(`"${sentence}"`);
      else expect(java).not.toContain(sentence);
    }
  });

  it('la primera negativa es la frase de siempre, referenciada y no copiada', () => {
    // En C# `CannotSend` es el `const` de la encuesta y en el espejo su clave: dos capas apuntando a una sola frase,
    // que es la forma de que no se desfasen nunca.
    expect(contactRules).toContain('public const string CannotSend = DesktopPoll.Sending;');
    expect(contactRules).not.toContain(`"${csSentence('Sending', pollRules)}"`);
    expect(contactRefusals).toContain('cannotSend: POLL_REFUSALS.sending');
    expect(tsProperty('sending', pollRefusals)).toBe(csSentence('Sending', pollRules));
    // Y la frase de armar la tabla no viaja al andamio: aquí la tabla son seis filas escritas a mano, sin caché que
    // se tuerza, y una negativa que nadie puede pronunciar es una negativa que se pudre.
    expect(contactRefusals).not.toMatch(/prepare:/);
    // Y en C# la frase sí existe, porque allí la tabla se arma sobre una caché que puede venir rara.
    expect(csSentence('Prepare')).toBe('No se pudieron preparar los contactos.');
    expect(csBody('ListContactsAsync')).toContain('DesktopContact.Prepare');
    expect(csBody('SearchContactsAsync')).toContain('DesktopContact.Prepare');
  });

  it('la negativa por falta de lista es del protocolo, no del puente', () => {
    // TDLib puede pedir cualquier usuario por su id; MTProto necesita el `access_hash` que solo viene en la lista.
    // Que exista en Windows y no en Android es la prueba de que la traducción está pensada, no copiada.
    const sentence = csSentence('NotListed');
    expect(java).not.toContain(sentence);
    expect(contactRules).toContain('access_hash');
    expect(csBody('ShareContactAsync')).toContain('_users.TryGetValue');
  });

  it('el puente niega en el orden de Android, línea por línea', () => {
    const phone = javaBody('shareContact');
    expect(at('session.canSend()', phone)).toBeLessThan(at('TdApi.Chat chat=session.chat', phone));
    expect(at('TdApi.Chat chat=session.chat', phone)).toBeLessThan(at('canSendOtherMessages', phone));
    expect(at('canSendOtherMessages', phone)).toBeLessThan(at('new TdApi.GetUser', phone));
    expect(at('new TdApi.GetUser', phone)).toBeLessThan(at('phone.isEmpty()', phone));
    const bridge = csBody('ShareContactAsync');
    expect(at('DesktopAttachment.Uncertain', bridge)).toBeLessThan(at('FindEntry(_active)', bridge));
    expect(at('FindEntry(_active)', bridge)).toBeLessThan(at('DesktopContact.CannotSend', bridge));
    expect(at('DesktopContact.CannotSend', bridge)).toBeLessThan(at('DesktopContact.NotAllowed', bridge));
    expect(at('DesktopContact.NotAllowed', bridge)).toBeLessThan(at('DesktopContact.NotListed', bridge));
    expect(at('DesktopContact.NotListed', bridge)).toBeLessThan(at('DesktopContact.NoPhone', bridge));
    expect(at('DesktopContact.NoPhone', bridge)).toBeLessThan(at('new InputMediaContact', bridge));
    // Y el espejo guarda el mismo orden entre las cuatro que le tocan.
    const mirror = tsBody('desktopShareContact');
    expect(at('CONTACT_REFUSALS.cannotSend', mirror)).toBeLessThan(at('CONTACT_REFUSALS.notAllowed', mirror));
    expect(at('CONTACT_REFUSALS.notAllowed', mirror)).toBeLessThan(at('CONTACT_REFUSALS.notListed', mirror));
    expect(at('CONTACT_REFUSALS.notListed', mirror)).toBeLessThan(at('CONTACT_REFUSALS.noPhone', mirror));
  });

  it('el derecho de la tarjeta es `send_docs` y la regla de derechos no se copia', () => {
    expect(csBody('CanShare', contactRules)).toContain('DesktopPoll.Free(rights, ChatBannedRights.Flags.send_docs)');
    // La escalera de los tres campos está en un solo sitio; duplicarla sería tener dos maneras de leer el mismo bit.
    expect(pollRules).toContain('public static bool Free(Rights rights, ChatBannedRights.Flags bit)');
    expect(contactRules).not.toContain('rights.Privileged');
    expect(count('DesktopPoll.Free(rights,', `${pollRules}${contactRules}`)).toBe(1);
    expect(count('=> Free(rights,', pollRules)).toBe(2);
  });

  it('los tres topes salen del puente y el recorte lleva su punto suspensivo', () => {
    expect(contactRules).toContain('public const int MaxName = 64;');
    expect(contactRules).toContain('public const int MaxQuery = 80;');
    expect(contactRules).toContain('public const int MaxResults = 50;');
    expect(javaBody('shareContact')).toContain('NativeSnapshot.limit(first,64)');
    expect(java).toContain('BridgePolicy.text(p,"query",80)');
    expect(javaBody('contacts')).toContain('new TdApi.SearchContacts(query,50)');
    expect(csBody('Limit', contactRules)).toContain('"…"');
    expect(snapshot).toContain('static String limit(String text,int size){return text.length()>size?text.substring(0,size)+"…":text;}');
    // El recorte con el que se escribe la tarjeta no es el `Clip` del host, que corta sin nada.
    expect(csBody('Limit', contactRules)).not.toContain('Clip');
    expect(preview).toContain('const CONTACT_MAX_QUERY = 80');
  });

  it('la escritura no manda identificador y la lectura sí lo recibe', () => {
    // La divergencia de esquema: `InputMediaContact` tiene cuatro campos de texto y `MessageMediaContact` cinco.
    const media = csBody('ShareContactAsync').match(/new InputMediaContact\s*\{([\s\S]*?)\}/);
    expect(media).not.toBeNull();
    for (const field of ['phone_number', 'first_name', 'last_name', 'vcard']) expect(media?.[1]).toContain(field);
    expect(media?.[1]).not.toContain('user_id');
    expect(csCard()).toContain('card.user_id');
    expect(javaBody('shareContact')).toContain('new TdApi.Contact(phone');
  });

  it('la tarjeta leída tiene los cuatro campos de Android y ni uno más', () => {
    const card = csCard();
    for (const field of ['Kind = "contact"', 'Name = DesktopContact.CardName', 'CanCopy = exportable'])
      expect(card).toContain(field);
    expect(card).toContain('card.user_id > 0 ? card.user_id.ToString() : ""');
    const start = at('return kind("contact")', extras);
    const body = extras.slice(start, start + 700);
    for (const key of ['"name"', '"phone"', '"userId"', '"canCopy"']) expect(body).toContain(`put(${key}`);
    expect(stateFile).toContain('public string Kind { get; set; } = "contact";');
    expect(contract).toContain("{kind:'contact';name:string;phone:string;userId:string;canCopy:boolean}");
    // El relleno cuando no hay nombre es la misma palabra en las dos capas y en los dos sentidos.
    expect(csSentence('FallbackFirst')).toBe('Contacto');
    expect(extras).toContain('return "Contacto"');
    expect(javaBody('shareContact')).toContain('first="Contacto"');
  });

  it('el nombre que se lee no se recorta otra vez', () => {
    // Lo que Telegram ya escribió en el mensaje no se acorta en la pantalla sin decirlo.
    expect(csBody('CardName', contactRules)).not.toContain('Limit(');
    const body = javaBody('contactName', extras);
    expect(body).toContain('contact.firstName');
    expect(body).toContain('contact.lastName');
  });

  it('las tres agujas del puente entran por su nombre y una sola vez', () => {
    expect(count('"contacts.list" => await ListContactsAsync(),', service)).toBe(1);
    expect(count('"contacts.search" => await SearchContactsAsync(args),', service)).toBe(1);
    expect(count('"share.contact" => await ShareContactAsync(args),', service)).toBe(1);
    expect(count("if (method === 'share.contact' && state.platform === 'desktop') return desktopShareContact(params, state);", preview)).toBe(1);
  });

  it('el botón de la agenda ya no depende de la plataforma', () => {
    // La aguja de la ronda AK decía que esta entrada estaba escondida en Windows porque no había brazo. Desde la
    // ronda AP lo hay, y lo que no puede volver a pasar es que el botón dependa del dispositivo.
    const item = '<MenuItem icon={<UserRound/>} label="Compartir contacto" onClick={()=>{setDialog(undefined);openShareContact();}}/>';
    expect(count(item, app)).toBe(1);
    expect(count(`{!desktop&&${item}}`, app)).toBe(0);
    expect(panels).toContain("await run<Contact[]>('contacts.list')");
  });

  it('el portapapeles estaba vacío y la tarjeta lo encontró', () => {
    expect(count('"clipboard.copy" => ClipboardCopy(Str(args, "text")),', service)).toBe(1);
    expect(clipboardRules).toContain('public const int MaxText = 4096;');
    expect(preview).toContain('const CLIPBOARD_MAX_TEXT = 4096');
    expect(java).toContain('BridgePolicy.text(p,"text",4096)');
    expect(tsConst('CLIPBOARD_REFUSAL')).toBe(csSentence('TooLong', clipboardRules));
    // WPF solo deja tocar el portapapeles en su hilo, y el puente puede llegar de otro.
    expect(csBody('ClipboardCopy')).toContain('dispatcher.Invoke(() => Clipboard.SetText(text))');
    // El espejo lo niega solo en la plataforma que tiene puente.
    expect(tsBody('designRequest').includes("if (state.platform === 'desktop' && String(params.text ?? '').length > CLIPBOARD_MAX_TEXT)")).toBe(true);
  });

  it('la tarjeta dice si el número llegó al portapapeles', () => {
    // El botón disparaba la copia y no contaba nada: en Android funcionaba en silencio y en Windows podía
    // negarse sin que la conversación se enterase. «Número copiado» solo se escribe con el `true` del puente
    // delante; el motivo de la negativa ya lo cuenta el aviso que arma `report` en App.
    expect(count("case 'contact':return <ContactCard message={message} run={run} openUser={openUser}/>;", card)).toBe(1);
    expect(count("setCopied((await run?.<boolean>('clipboard.copy',{text:extra.phone??''}))===true);", card)).toBe(1);
    expect(count("{copied?'Número copiado':'Copiar número'}", card)).toBe(1);
    // Y la tarjeta sigue sin prometer una copia que el dueño del chat prohibió.
    expect(count('{extra.canCopy&&extra.phone&&run&&<button', card)).toBe(1);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = {
  id: string; text: string; chatId: string; outgoing: boolean; sender: string;
  extra?: { kind: string; name: string; phone: string; userId: string; canCopy: boolean };
};
type Snap = {
  active: string; selfId: string; canSend: boolean; messages: Row[];
  chats: { id: string; noContacts?: boolean }[];
};

describe('ronda AP · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', canSend: true, messages: [], chats: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', active: '11', selfId: '1', canSend: true });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  /** Comparte a la persona que se le diga y devuelve cuántas filas había antes. */
  const share = async (id: string, patch: Partial<Snap> = {}) => {
    const before = snap().messages.length;
    set(patch);
    await call('share.contact', { id, reply: '0', silent: false });
    return snap().messages.length - before;
  };

  /** Lo mismo, esperando que la llamada falle y que no quede ni una fila nueva. */
  const refused = async (id: string, patch: Partial<Snap> = {}) => {
    const before = snap().messages.length;
    set(patch);
    return { error: call('share.contact', { id }).catch((caught: Error) => caught.message), before };
  };

  it('compartir a una persona con número escribe la tarjeta y nada más', async () => {
    expect(await share('502')).toBe(1);
    const row = snap().messages.at(-1) as Row;
    expect(row.text).toBe('');
    expect(row.outgoing).toBe(true);
    expect(row.sender).toBe('Tú');
    expect(row.chatId).toBe('11');
    expect(row.extra).toEqual({
      kind: 'contact', name: 'María Fernández', phone: '+34 600 11 22 33', userId: '502', canCopy: true,
    });
  });

  it('la fila nueva no repite identificador: la pantalla monta cada burbuja con el id como clave', async () => {
    // Solo dentro de la conversación, porque el andamio reetiqueta las mismas filas para los chats 11, 14 y 24 y
    // ahí los identificadores se repiten a propósito.
    const ids = snap().messages.filter(row => row.chatId === '11').map(row => row.id);
    expect(await share('502')).toBe(1);
    expect(await share('503')).toBe(1);
    const despues = snap().messages.filter(row => row.chatId === '11').map(row => row.id);
    expect(new Set(despues).size).toBe(despues.length);
    expect(despues.slice(0, ids.length)).toEqual(ids);
    expect(Number(despues.at(-1))).toBeGreaterThan(Number(despues.at(-2)));
  });

  it('sin número no hay tarjeta, y la frase es la privacidad de Telegram', async () => {
    // Héctor Vidal está en la lista sin número a propósito: es la única negativa de esta ronda que se alcanza con
    // el ratón sin tocar el estado.
    const { error, before } = await refused('718');
    expect(await error).toBe(tsProperty('noPhone', contactRefusals));
    expect(snap().messages.length).toBe(before);
  });

  it('quien no está en la lista se niega con la causa, no con un número vacío', async () => {
    for (const id of ['999999', '', '0']) {
      const { error, before } = await refused(id);
      expect(await error).toBe(tsProperty('notListed', contactRefusals));
      expect(snap().messages.length).toBe(before);
    }
  });

  it('la conversación que niega la tarjeta la niega antes de mirar a la persona', async () => {
    // El chat 23 es el del andamio con el derecho negado. Se niega incluso un id inexistente, que es el orden del
    // puente: el permiso de Telegram va delante de la caché.
    for (const id of ['502', '999999']) {
      const { error, before } = await refused(id, { active: '23' });
      expect(await error).toBe(tsProperty('notAllowed', contactRefusals));
      expect(snap().messages.length).toBe(before);
    }
  });

  it('sin permiso de escritura la frase es la de siempre, con chat o sin él', async () => {
    const sentence = tsProperty('sending', pollRefusals);
    for (const patch of [{ canSend: false }, { active: '9999' }] as Partial<Snap>[]) {
      const { error } = await refused('502', patch);
      expect(await error).toBe(sentence);
    }
  });

  it('en un chat protegido la tarjeta se envía sin botón de copiar', async () => {
    // El canal de novedades es el protegido del andamio y trae además el derecho de la tarjeta negado por la otra
    // aguja; se quita ese negado para llegar al único sitio donde `canCopy` sale falso.
    set({ chats: snap().chats.map(chat => chat.id === '22' ? { ...chat, noContacts: false } : chat) });
    expect(await share('502', { active: '22' })).toBe(1);
    expect((snap().messages.at(-1) as Row).extra?.canCopy).toBe(false);
  });

  it('en Android el andamio sigue sin puente y el botón no finge un envío', async () => {
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    const before = snap().messages.length;
    await expect(call('share.contact', { id: '502' })).rejects.toThrow('Vista sintética');
    expect(snap().messages).toHaveLength(before);
  });

  it('la lista de contactos da las cuatro columnas del DTO, sin retrato', async () => {
    const rows = await call('contacts.list') as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['bot', 'id', 'name', 'username']);
  });

  it('la búsqueda niega los 81 caracteres y acepta los 80', async () => {
    expect(Array.isArray(await call('contacts.search', { query: 'a'.repeat(80) }))).toBe(true);
    await expect(call('contacts.search', { query: 'a'.repeat(81) }))
      .rejects.toThrow(tsProperty('longQuery', contactRefusals));
    // El largo se mide antes de recortar: no es una búsqueda vacía con otro nombre.
    await expect(call('contacts.search', { query: ' '.repeat(81) }))
      .rejects.toThrow(tsProperty('longQuery', contactRefusals));
  });

  it('la búsqueda larga es solo del puente: Android sigue filtrando su agenda', async () => {
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    expect(Array.isArray(await call('contacts.search', { query: 'a'.repeat(200) }))).toBe(true);
  });

  it('compartir no reescribe ninguna de las filas que ya estaban', async () => {
    const antes = JSON.stringify(snap().messages);
    expect(await share('502')).toBe(1);
    const despues = snap().messages;
    expect(JSON.stringify(despues.slice(0, -1))).toBe(antes);
  });
});
