import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_AVAILABLE_TEXT, DESKTOP_PENDING, DESKTOP_PENDING_TEXT } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopContactWrite.cs');
const flow = text('../../desktop/src/WRGram.Desktop/DesktopContactWriteFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const shared = text('../../desktop/src/WRGram.Desktop/DesktopContact.cs');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const preview = text('./preview.ts');
const scope = text('./desktopScope.ts');
const bridge = text('./bridge.ts');
const profile = text('./PeerProfile.tsx');
const app = text('./App.tsx');

/** El código de un archivo C#, sin las líneas de comentario donde van las citas de Android. */
const code = (from: string) => from.split('\n').filter(row => !/^\s*\/\/\/?/.test(row)).join('\n');

/** El literal que C# asigna a una constante de texto. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}

/** Las dos mitades del mensaje del cuadro, que en C# separa el nombre interpolado. */
function csTemplate(name: string): [string, string] {
  const match = new RegExp(`string ${name}\\(string[^)]*\\)\\s*=>\\s*\\n?\\s*"([^"]+)" \\+ [a-zA-Z]+ \\+ "([^"]+)"`).exec(rules);
  if (!match) throw new Error(`Falta la plantilla de ${name}`);
  return [match[1], match[2]];
}

/** El cuerpo de un método de una línea de `NativeBridge.java`. */
function javaMethod(name: string): string {
  const at = java.indexOf(`private void ${name}(`);
  if (at < 0) throw new Error(`Falta ${name} en NativeBridge.java`);
  return java.slice(at, java.indexOf('\n', at));
}

/** El cuerpo de un método de `WRGram.Desktop`, con llave o con flecha. */
function csBody(name: string, from = flow): string {
  const match = new RegExp(`^\\s*(?:private|public|internal)[^\\n]*\\b${name}\\(`, 'm').exec(from);
  if (!match) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  let i = from.indexOf('(', match.index);
  for (; i < from.length; i++) {
    if (from[i] === '(') depth++;
    else if (from[i] === ')' && --depth === 0) break;
  }
  const end = from.slice(i, i + 60).includes('=>') ? from.indexOf(';', i) : from.indexOf('\n    }', i);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return from.slice(match.index, end);
}

/** Que los hitos aparezcan, y en este orden. */
function order(source: string, hits: string[], label: string) {
  let previous = -1;
  for (const hit of hits) {
    const at = source.indexOf(hit, previous + 1);
    expect(at, `${label}: «${hit}» no está o está fuera de orden`).toBeGreaterThan(previous);
  }
}

const contactAction = javaMethod('contactAction');
const generic = '_ => throw new BridgeException($"No disponible en escritorio (beta)';
const addArm = service.indexOf('"contacts.add" => await AddContactAsync(args)');
const removeArm = service.indexOf('"contacts.remove" => await RemoveContactAsync(args)');
const notPrivate = csSentence('NotPrivate');
const notAddable = csSentence('NotAddable');
const copy = csTemplate('DialogBody');
/** La única negación de Windows de la familia, dicha por `RequireEntry`. */
const unloaded = /RequireEntry\(string id\) => FindEntry\(id\) \?\? throw new BridgeException\("([^"]+)"\)/.exec(service)?.[1];

type Call = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Boot = { call: Call; snap: () => Record<string, unknown>; row: (id: string) => Record<string, unknown> | undefined };

async function boot(platform: 'android' | 'web' | 'desktop'): Promise<Boot> {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  const transport = await import('./bridge');
  transport.acceptState({ ...fixture, platform });
  const snap = () => transport.snapshot() as unknown as Record<string, unknown>;
  return {
    call: designRequest as Call,
    snap,
    row: (id: string) => (snap().chats as Record<string, unknown>[]).find(chat => chat.id === id),
  };
}

describe('ronda BL · las palabras de :1839, carácter a carácter', () => {
  it('el cable de Windows dice literalmente lo que dice contactAction', () => {
    // La comprobación va del C# a Java: lo que esta casa escribió tiene que estar en la línea que traduce.
    for (const value of [notPrivate, notAddable, csSentence('ChangedAccount'), csSentence('DialogTitle'),
      csSentence('DialogAccept'), copy[0], copy[1]]) {
      expect(contactAction, `NativeBridge.java no dice «${value}»`).toContain(`"${value}"`);
    }
    expect(contactAction).toContain('setNegativeButton("Cancelar"');
    expect(csSentence('NoPhone')).toBe('');
  });

  it('ninguna de las dos negaciones está escrita en otro sitio de las tres capas', () => {
    for (const phrase of [notPrivate, notAddable]) {
      expect((code(rules).match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1);
      expect(code(flow)).not.toContain(phrase);
      expect(preview.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).toHaveLength(1);
    }
    expect(app).not.toContain(notPrivate);
    expect(profile).not.toContain(notAddable);
  });

  it('la pantalla no añade ninguna frase al cuadro, pero el quitar sigue confirmando en ella', () => {
    // El trozo final de la frase, que es el único que no puede salir por casualidad de otro diálogo.
    expect(profile).not.toContain(copy[1]);
    expect(app).not.toContain(copy[1]);
    expect(app).toContain("confirm('Quitar de contactos'");
    // Y el host no abre ninguna ventana para quitar, que es lo que Android tampoco hace.
    expect(csBody('RemoveContactAsync')).not.toContain('ConfirmPhoto');
  });
});

describe('ronda BL · el brazo existe y el orden es el de :1839', () => {
  it('las dos claves tienen brazo, y antes del rechazo genérico', () => {
    expect(addArm).toBeGreaterThan(-1);
    expect(removeArm).toBeGreaterThan(-1);
    expect(addArm).toBeLessThan(service.indexOf(generic));
    expect(removeArm).toBeLessThan(service.indexOf(generic));
    // Quedaron pegadas a la familia de la agenda, entre el abrir y el estado de la sincronización.
    expect(service.indexOf('"contacts.open" =>')).toBeLessThan(addArm);
    expect(removeArm).toBeLessThan(service.indexOf('"contacts.sync.status" =>'));
  });

  it('las guardas van en el orden de Java: conversación, forma del chat y luego la persona', () => {
    expect(contactAction.indexOf(`"${notPrivate}"`)).toBeLessThan(contactAction.indexOf(`"${notAddable}"`));
    order(csBody('ContactTarget'), ['RequireEntry(Str(args, "id"))', 'is not PeerUser', 'NotPrivate', 'NotAddable'], 'ContactTarget');
    expect(contactAction).toContain('user==null||user.type instanceof TdApi.UserTypeBot||userId==session.selfId');
    for (const needle of ['user == null', 'IsBot(user)', 'IsSelf(user, owner)']) expect(csBody('ContactTarget')).toContain(needle);
  });

  it('añadir: primero el estado, después el hash, luego la ventana y al final Telegram', () => {
    order(csBody('AddContactAsync'), [
      'ContactTarget(args, owner)', 'IsContact(person)', 'ContactInput(person)', 'ConfirmPhoto(',
      'DesktopContactWrite.ChangedAccount', 'Contacts_AddContact(', 'MarkContact(entry, person, true)',
    ], 'AddContactAsync');
    expect(contactAction).toContain(`if(!currentAccount()||session.selfId!=answer.owner){answer.fail("${csSentence('ChangedAccount')}")`);
    // El número no viaja, la nota tampoco y la excepción de privacidad tampoco: las tres promesas del cuadro.
    expect(csBody('AddContactAsync')).toContain('DesktopContactWrite.NoPhone, null, false)');
    expect(contactAction).toContain('new TdApi.ImportedContact("",first,last,null),false');
  });

  it('quitar: sin ventana, y el identificador con hash es lo único que añade Windows', () => {
    const body = csBody('RemoveContactAsync');
    order(body, ['ContactTarget(args, owner)', '!DesktopContactWrite.IsContact(person)', 'Contacts_DeleteContacts(', 'MarkContact(entry, person, false)'], 'RemoveContactAsync');
    expect(contactAction).toContain('if(method.equals("contacts.remove")){if(!user.isContact){answer.ok(false);return;}');
    // TDLib escribe con números sueltos; MTProto, con `InputUserBase[]`. Medido sobre 4.4.10.
    expect(body).toContain('new InputUserBase[] { ContactInput(person) }');
  });

  it('los dos «no hace nada» siguen siendo un false sin frase', () => {
    expect(csBody('AddContactAsync')).toContain('if (DesktopContactWrite.IsContact(person)) return false;');
    expect(csBody('RemoveContactAsync')).toContain('if (!DesktopContactWrite.IsContact(person)) return false;');
    expect(contactAction).toContain('if(user.isContact){answer.ok(false);return;}');
    // Y la pantalla solo repinta con un true, que es lo que hace honesto ese false.
    expect(app).toContain('.then(done=>{if(done)showPeerProfile({...peer,isContact:!remove}');
  });

  it('la falta de access_hash se niega antes de preguntar, y cero no se manda', () => {
    const refusal = csSentence('NeedsHash');
    expect(refusal.length).toBeGreaterThan(40);
    order(csBody('ContactInput'), ['user.access_hash == 0', 'DesktopContactWrite.NeedsHash', 'new InputUser(user.id, user.access_hash)'], 'ContactInput');
    expect(csBody('AddContactAsync').indexOf('ContactInput(person)')).toBeLessThan(csBody('AddContactAsync').indexOf('ConfirmPhoto('));
    // Solo existe en la capa que la necesita.
    expect(java).not.toContain(refusal);
    expect(preview).not.toContain(refusal);
  });
});

describe('ronda BL · las reglas de la tarjeta, en una sola casa', () => {
  it('los dos nombres salen del recorte y del relleno que ya estaban escritos', () => {
    expect(code(rules)).toContain('DesktopContact.Limit(');
    expect(code(rules)).toContain('DesktopContact.FallbackFirst');
    expect(code(rules)).toContain('DesktopContact.MaxName');
    expect(shared).toContain('public const int MaxName = 64;');
    expect(shared).toContain('public const string FallbackFirst = "Contacto"');
    expect(code(rules)).not.toMatch(/,\s*64\s*\)/);
    expect(code(rules)).not.toContain('const string FallbackFirst');
    expect(contactAction).toContain('user.firstName==null||user.firstName.isBlank()?"Contacto":NativeSnapshot.limit(user.firstName,64)');
    expect(contactAction).toContain('NativeSnapshot.limit(user.lastName==null?"":user.lastName,64)');
  });

  it('el apellido puede quedarse vacío; el nombre, no, y el del cuadro no se recorta', () => {
    expect(code(rules)).toMatch(/static string First\(User user\) => string\.IsNullOrWhiteSpace\(user\.first_name\)/);
    expect(code(rules)).toMatch(/static string Last\(User user\) => DesktopContact\.Limit\(user\.last_name \?\? ""/);
    expect(code(rules)).toMatch(/static string DialogName\(User user, string title\) =>\s*\n?\s*string\.IsNullOrEmpty\(user\.first_name\) \? title : user\.first_name/);
    expect(code(rules)).not.toMatch(/DialogName[\s\S]{0,200}Limit\(/);
  });

  it('la marca de contacto es una bandera, dicha una sola vez y sin confundirla con la mutua', () => {
    const body = code(rules);
    expect(body).toContain('(user.flags & User.Flags.contact) != 0');
    expect(body.match(/User\.Flags\.contact/g)).toHaveLength(1);
    expect(body.match(/User\.Flags\.bot/g)).toHaveLength(1);
    expect(body.match(/User\.Flags\.self/g)).toHaveLength(1);
    expect(body).not.toContain('mutual_contact');
    expect(contactAction).toContain('user.isContact');
  });
});

describe('ronda BL · el aviso y la puerta del andamio', () => {
  it('las dos escribientes pasaron al lado disponible y su familia quedó partida en dos líneas', () => {
    expect(DESKTOP_AVAILABLE.find(item => item.methods.includes('contacts.add'))?.methods).toEqual(['contacts.add', 'contacts.remove']);
    expect(DESKTOP_PENDING.some(item => item.methods.includes('contacts.add') || item.methods.includes('contacts.remove'))).toBe(false);
    expect(DESKTOP_PENDING.find(item => item.methods.includes('contacts.import'))?.methods)
      .toEqual(['contacts.import', 'contacts.sync.set', 'contacts.sync.now']);
    expect(DESKTOP_AVAILABLE_TEXT).toContain('agenda escribible');
    expect(DESKTOP_PENDING_TEXT).toContain('importar la agenda');
    // La línea que antes negaba las cuatro cosas ya no está en ninguna de las dos frases.
    expect(scope).not.toContain('añadir, importar, quitar contactos');
    expect(DESKTOP_PENDING_TEXT).not.toContain('quitar contactos');
  });

  it('la puerta de BK deja de negar las dos y sigue negando las tres de importar y sincronizar', () => {
    expect(desktopGapRefusal('contacts.add')).toBeUndefined();
    expect(desktopGapRefusal('contacts.remove')).toBeUndefined();
    for (const key of ['contacts.import', 'contacts.sync.set', 'contacts.sync.now']) {
      expect(desktopGapRefusal(key)).toBe(`No disponible en escritorio (beta): ${key}`);
    }
  });

  it('el andamio modela las dos después de la puerta, no delante', () => {
    const gate = preview.indexOf('desktopGapRefusal(method)');
    const arm = preview.indexOf("if (method === 'contacts.add' || method === 'contacts.remove')");
    const called = preview.indexOf('return designContactWrite(method, params, state)');
    expect(gate).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(gate);
    expect(called).toBe(arm + "if (method === 'contacts.add' || method === 'contacts.remove') ".length);
    // El modelado vive en una auxiliar declarada antes de la puerta; lo que tiene que estar después es la llamada,
    // que es lo que la puerta corta. La cadena suelta «method === 'contacts.add'» sí aparece delante: es la
    // comparación de `designContactWrite`, no un brazo del reparto.
    expect(preview.slice(0, gate)).not.toContain("if (method === 'contacts.add'");
    // Las dos plataformas pasan por el mismo modelado, que es lo que ya hacen en las dos capas.
    expect(preview.slice(arm, arm + 120)).not.toContain("state.platform");
  });

  it('la pantalla siguió ofreciendo el botón, y ahora es cierto en las dos capas', () => {
    const row = profile.split('\n')[98] ?? '';
    expect(row).toContain("chat.type==='private' && !chat.bot && chat.id!==ownId");
    expect(row).toContain('changeContact(chat,!!chat.isContact)');
    expect(row).toContain("chat.isContact?'Quitar de contactos':'Añadir a contactos'");
    expect(row).not.toContain('desktop');
  });

  it('añadir sigue siendo una orden que espera a la persona, y quitar no', () => {
    const at = bridge.indexOf('const USER_DRIVEN');
    const waiting = bridge.slice(at, bridge.indexOf('];', at));
    expect(waiting).toContain("'contacts.add'");
    // El quitar no abre diálogo nativo en ninguna de las dos capas: la pantalla confirma con su `confirm()`.
    expect(waiting).not.toContain("'contacts.remove'");
  });
});

describe('ronda BL · medido llamando de verdad', () => {
  let desktop: Boot = { call: async () => undefined, snap: () => ({}), row: () => undefined };

  beforeEach(async () => {
    desktop = await boot('desktop');
  });

  it('el botón de la ficha contesta: añade, repite y quita sobre la misma fila', async () => {
    expect(desktop.row('11')?.isContact).toBeFalsy();
    await expect(desktop.call('contacts.add', { id: '11' })).resolves.toBe(true);
    expect(desktop.row('11')?.isContact).toBe(true);
    await expect(desktop.call('contacts.add', { id: '11' })).resolves.toBe(false);
    expect(desktop.row('11')?.isContact).toBe(true);
    await expect(desktop.call('contacts.remove', { id: '11' })).resolves.toBe(true);
    expect(desktop.row('11')?.isContact).toBe(false);
    await expect(desktop.call('contacts.remove', { id: '11' })).resolves.toBe(false);
  });

  it('y hay una fila que ya está en la agenda, para que el quitar se vea sin añadir antes', async () => {
    expect(desktop.row('15')?.isContact).toBe(true);
    await expect(desktop.call('contacts.add', { id: '15' })).resolves.toBe(false);
    await expect(desktop.call('contacts.remove', { id: '15' })).resolves.toBe(true);
    expect(desktop.row('15')?.isContact).toBe(false);
  });

  it('las guardas niegan con las frases de las dos capas y en el orden de arriba', async () => {
    const cases: [string, string][] = [['404', unloaded!], ['12', notPrivate], ['14', notPrivate], ['22', notPrivate],
      ['16', notPrivate], ['26', notPrivate], ['1', notAddable]];
    for (const [id, phrase] of cases) for (const method of ['contacts.add', 'contacts.remove']) {
      const error = await desktop.call(method, { id }).then(() => new Error('respondió sin negarse'), (reason: unknown) => reason as Error);
      expect(error.message, `${method} sobre ${id}`).toBe(phrase);
    }
  });

  it('negar no escribe: ninguna fila cambió de estado', async () => {
    const marks = () => JSON.stringify((desktop.snap().chats as Record<string, unknown>[]).map(chat => [chat.id, chat.isContact]));
    const before = marks();
    for (const id of ['404', '12', '14', '16', '22', '26', '1']) for (const method of ['contacts.add', 'contacts.remove']) {
      await desktop.call(method, { id }).catch(() => undefined);
    }
    expect(marks()).toBe(before);
  });

  it('la identidad que pregunta la pantalla es la de la fila, no la de la persona', async () => {
    // `App.tsx:755` manda `peer.id`, que es la clave de la conversación; el brazo la resuelve con `RequireEntry`.
    expect(app).toContain("run<boolean>(remove?'contacts.remove':'contacts.add',{id:peer.id})");
    expect(csBody('ContactTarget')).toContain('RequireEntry(Str(args, "id"))');
    await expect(desktop.call('contacts.add', { id: '13' })).resolves.toBe(true);
    expect(desktop.row('13')?.isContact).toBe(true);
  });

  it('en Android las dos responden igual, que es lo que le faltaba al espejo', async () => {
    const phone = await boot('android');
    expect(phone.row('15')?.isContact).toBe(true);
    await expect(phone.call('contacts.add', { id: '11' })).resolves.toBe(true);
    await expect(phone.call('contacts.add', { id: '11' })).resolves.toBe(false);
    await expect(phone.call('contacts.remove', { id: '15' })).resolves.toBe(true);
    await expect(phone.call('contacts.add', { id: '12' })).rejects.toThrow(notPrivate);
    await expect(phone.call('contacts.remove', { id: '1' })).rejects.toThrow(notAddable);
  });
});
