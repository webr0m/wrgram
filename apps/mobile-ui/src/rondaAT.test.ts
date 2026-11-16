import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopAccountProfile.cs');
const arms = text('../../desktop/src/WRGram.Desktop/DesktopAccount.cs');
// La ronda AU partió el cable del perfil en su propio archivo, así que los brazos se buscan en los dos.
const photoArms = text('../../desktop/src/WRGram.Desktop/DesktopAccountPhoto.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const menu = text('./UserMenu.tsx');
const contract = text('./contract.ts');
const formatting = text('./formatting.tsx');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

/** El literal que la clase de reglas de C# asigna a una constante. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de Java que está en la línea del `case` de una orden del puente. */
function javaArm(method: string): string {
  const line = java.split('\n').find(entry => entry.includes(`case "${method}":`));
  if (!line) throw new Error(`Falta el case de ${method}`);
  return line;
}

/** La frase que Android escribe dentro de un `case`, o la que lanza con `throw new IllegalArgumentException(...)`. */
function javaArmSentence(method: string, needle: string): string {
  const line = javaArm(method);
  const match = new RegExp(`IllegalArgumentException\\("((?:[^"\\\\]|\\\\.)*)"\\)`).exec(line);
  if (!match) throw new Error(`${method} no lanza una frase con ${needle}`);
  return match[1];
}

/** El número que la clase de reglas de C# asigna a una constante. */
function csNumber(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** La propiedad de un objeto de literales del espejo. */
function tsProperty(name: string, from: string): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El bloque del espejo, desde su declaración hasta la llave que lo cierra. */
function tsBlock(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  const end = preview.indexOf('};', start);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return preview.slice(start, end);
}

/** Cuerpo de un miembro de C#, hasta la siguiente declaración de la clase. */
function csMember(name: string): string {
  const start = rules.search(new RegExp(`\\b(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el miembro ${name}`);
  const next = rules.slice(start + 1).search(/\n *(?:public|private) /);
  return rules.slice(start, next < 0 ? rules.length : start + 1 + next);
}

/** Cuerpo de un método del puente de C#. */
function csBody(name: string, from = arms): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La documentación XML que precede a un método del puente. */
function csDoc(name: string): string {
  const start = at(`private async Task<object?> ${name}(`, arms);
  const opening = arms.lastIndexOf('<summary>', start);
  if (opening < 0) throw new Error(`Falta la documentación de ${name}`);
  return arms.slice(opening, start);
}

/** La documentación XML de la clase entera, antes de su declaración. */
function csClassDoc(name: string): string {
  const start = at(`public sealed partial class ${name}`, arms);
  const opening = arms.lastIndexOf('<summary>', start);
  if (opening < 0) throw new Error(`Falta la documentación de la clase ${name}`);
  return arms.slice(opening, start);
}

/** La última línea de `archivo` que cita el bloque de documentación de una constante, sin cruzarse con el vecino. */
function cited(file: string, name: string): number {
  const declaration = at(`public const string ${name} =`, rules);
  const previous = rules.lastIndexOf('public const string', declaration - 1);
  const block = rules.slice(previous < 0 ? 0 : previous, declaration);
  const matches = [...block.matchAll(new RegExp(`${file.split('.').join('\\.')}:(\\d+)(?!-)`, 'g'))];
  if (matches.length === 0) throw new Error(`${name} no cita la línea de ${file} donde nace su frase`);
  return Number(matches.at(-1)![1]);
}

/** Cuerpo de una función del espejo. */
function tsBody(name: string): string {
  const start = preview.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = preview.indexOf('{', start); i < preview.length; i++) {
    if (preview[i] === '{') depth++;
    else if (preview[i] === '}' && --depth === 0) return preview.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, from: string) => from.split(needle).length - 1;
function at(needle: string, from: string): number {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
}

describe('ronda AT · las reglas, cruzadas con las tres capas', () => {
  it('las dos frases de Android están letra por letra en el puente y en el espejo', () => {
    expect(javaArmSentence('account.name', 'vacío')).toBe(csSentence('NoName'));
    expect(javaArmSentence('account.username', 'empezar')).toBe(csSentence('BadUsername'));
    const mirror = tsBlock('ACCOUNT_REFUSALS');
    expect(tsProperty('noName', mirror)).toBe(csSentence('NoName'));
    expect(tsProperty('badUsername', mirror)).toBe(csSentence('BadUsername'));
  });

  it('el tope dicho en español es la misma plantilla que ya usaban los mensajes editados', () => {
    // En Android las dos causas —no es cadena y se pasa del máximo— son la misma palabra inglesa. Aquí se
    // separan, y la del máximo no se reinventa: apunta a la frase que la ronda AH ya tenía.
    expect(csMember('TooLong')).toContain('DesktopMessageEdit.TooLong(maximum)');
    expect(preview).toContain('const EDIT_REFUSALS = {');
    for (const name of ['NameProblem', 'BioProblem', 'UsernameProblem'])
      expect(csMember(name)).toContain('TooLong(');
    expect(tsBody('profileNameProblem')).toContain('EDIT_REFUSALS.tooLong(ACCOUNT_MAX.name)');
    expect(tsBody('profileBioProblem')).toContain('EDIT_REFUSALS.tooLong(ACCOUNT_MAX.bio)');
    expect(tsBody('profileUsernameProblem')).toContain('EDIT_REFUSALS.tooLong(ACCOUNT_MAX.username)');
  });

  it('los tres topes son los de BridgePolicy.text en los tres brazos java', () => {
    expect(csNumber('MaxName')).toBe('64');
    expect(csNumber('MaxBio')).toBe('140');
    expect(csNumber('MaxUsername')).toBe('32');
    expect(javaArm('account.name')).toContain('BridgePolicy.text(p,"firstName",64)');
    expect(javaArm('account.name')).toContain('BridgePolicy.text(p,"lastName",64)');
    expect(javaArm('account.bio')).toContain('BridgePolicy.text(p,"bio",140)');
    expect(javaArm('account.username')).toContain('BridgePolicy.text(p,"username",32)');
    expect(tsBlock('ACCOUNT_MAX')).toContain('name: 64');
    expect(tsBlock('ACCOUNT_MAX')).toContain('bio: 140');
    expect(tsBlock('ACCOUNT_MAX')).toContain('username: 32');
  });

  it('el orden es el de Android: tope sin recortar, trim después, y el vacío al final', () => {
    // `BridgePolicy.text` mide la cadena cruda y el `.trim()` llega en la misma línea del `case`; copiar el orden
    // es lo que hace que «ana» con espacios sobrantes valga en las tres capas y «  » no valga en ninguna.
    const name = csMember('NameProblem');
    expect(at('first.Length > MaxName', name)).toBeLessThan(at('Trim(first).Length == 0', name));
    expect(javaArm('account.name')).toContain('BridgePolicy.text(p,"firstName",64).trim()');
    const username = csMember('UsernameProblem');
    expect(at('username.Length > MaxUsername', username)).toBeLessThan(at('Trim(username)', username));
    expect(javaArm('account.username')).toContain('BridgePolicy.text(p,"username",32).trim()');
    expect(javaArm('account.bio')).toContain('.replace(\'\\n\',\' \').trim()');
    expect(csMember('Bio')).toContain("Replace('\\n', ' ')");
    expect(tsBody('profileUsernameProblem')).toContain('value.trim()');
    expect(tsBody('designAccountBio')).toContain(".replace(/\\n/g, ' ')");
  });

  it('el patrón del nombre público es el de Java, con los anclajes que .NET no pone solo', () => {
    expect(javaArm('account.username')).toContain('matches("[A-Za-z][A-Za-z0-9_]{4,31}")');
    expect(csNumber('MaxUsername')).toBe('32');
    // Java ancla los dos extremos con `matches`; en .NET `$` deja pasar un salto de línea final, y esa diferencia
    // de una sola capa sobre la misma cadena ya fue el motivo de varias rondas.
    expect(rules).toContain('public const string UsernamePattern = @"\\A[A-Za-z][A-Za-z0-9_]{4,31}\\z";');
    expect(preview).toContain('const ACCOUNT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/');
  });

  it('vaciar la bio y vaciar el nombre público son valores, no errores', () => {
    // Son las dos escrituras que Android deja pasar con cadena vacía: `SetBio("")` y `SetUsername("")`.
    expect(csMember('BioProblem')).not.toContain('NoName');
    expect(csMember('UsernameProblem')).toContain('value.Length > 0');
    expect(tsBody('profileBioProblem')).not.toContain('ACCOUNT_REFUSALS.noName');
    expect(tsBody('profileUsernameProblem')).toContain('trimmed.length > 0');
  });

  it('la lectura del perfil no usa la caché de la librería, con la medición escrita', () => {
    // El plan era asignar `client.User`; reflexionado, su `set_User` es privado. La nota está en el doc de la clase
    // —no en el del método, que habla del DTO— para que nadie vuelva a intentar el atajo, y la consecuencia es la
    // lectura fresca, que es lo que Android siempre hizo.
    const doc = csClassDoc('TelegramService');
    expect(doc).toContain('ese <c>set_User</c> es **privado**');
    expect(doc).toContain('no existe un <c>GetMe()</c> público');
    expect(doc).toContain('la asignación');
    expect(csDoc('AccountProfileAsync')).toContain('users.getUsers([self])');
    expect(csBody('AccountProfileAsync')).toContain('await SelfAsync(client)');
    expect(csBody('SelfAsync')).toContain('Users_GetUsers([new InputUserSelf()])');
    expect(csBody('SelfAsync')).not.toContain('_client.User =');
    expect(csBody('AccountProfileAsync')).toContain('Users_GetFullUser(new InputUserSelf())');
    expect(java).toContain('perform(new TdApi.GetMe(),answer,user->perform(new TdApi.GetUserFullInfo(user.id)');
  });

  it('el hueco que no se toca viaja null y el que se escribe viaja cadena', () => {
    // `account.updateProfile` arma su marca de bits mirando si el argumento es `null`, así que confundir los dos
    // significados borra o conserva lo contrario de lo que la pantalla enseña.
    expect(csBody('AccountNameAsync')).toContain('LastName(last!), null)');
    expect(csBody('AccountBioAsync')).toContain('ApplyProfileAsync(client, null, null,');
    expect(rules).toContain('about: null');
    expect(rules).toContain('about: ""');
  });

  it('después de escribir, el nombre del estado se refresca en las dos capas', () => {
    expect(csBody('ApplyProfileAsync')).toContain('RefreshSelf(await client.Account_UpdateProfile');
    expect(csBody('AccountUsernameAsync')).toContain('RefreshSelf(await client.Account_UpdateUsername');
    expect(csBody('RefreshSelf')).toContain('_state.Name = FullName(user)');
    expect(csBody('RefreshSelf')).toContain('Push();');
    expect(tsBody('designAccountName')).toContain('designAccountRefresh()');
    expect(tsBody('designAccountRefresh')).toContain('acceptState({ ...snapshot(), name:');
    // Las tres escrituras de Android terminan con `schedule()`, que es exactamente este aviso.
    expect(javaArm('account.name')).toContain('result->{schedule();a.ok(true);}');
    expect(javaArm('account.bio')).toContain('result->{schedule();a.ok(true);}');
    expect(javaArm('account.username')).toContain('result->{schedule();a.ok(true);}');
  });

  it('lo que MTProto no publica no se finge', () => {
    const doc = csDoc('AccountProfileAsync');
    expect(doc).toContain('bioEntities');
    expect(doc).toContain('sin la lista paralela de entidades');
    expect(doc).toContain('business');
    expect(csBody('AccountProfileAsync')).not.toContain('bioEntities');
    // Y el andamio no lo disimula con la plataforma de al lado: en desktop esas dos claves se quitan antes de
    // responder, que es lo que de verdad llega del puente de C#.
    expect(preview).toContain("if (method === 'account.profile') return designAccountProfile(state.platform);");
    expect(tsBody('designAccountProfile')).toContain("platform !== 'desktop'");
    expect(tsBody('designAccountProfile')).toContain('delete windows.bioEntities');
    expect(tsBody('designAccountProfile')).toContain('delete windows.business');
    expect(count("method === 'account.profile'", preview)).toBe(1);
  });

  it('la ausencia de esas dos claves es legal en el contrato y la pantalla la pinta plana', () => {
    // Sin esta pareja, recortar el andamio sería cambiar una pantalla falsa por un fallo en runtime.
    expect(contract).toContain('bioEntities?:TextEntity[]');
    expect(contract).toContain('business?:AccountBusiness');
    expect(menu).toContain('<FormattedText text={profile.bio} entities={profile.bioEntities}');
    expect(formatting).toContain('const valid = (entities || [])');
    expect(formatting).toContain('if (!valid.length) return <>{text}</>;');
  });

  it('cada orden tiene un brazo y un manejador, y lo que no tiene brazo se niega con nombre', () => {
    for (const [method, name] of [
      ['account.profile', 'AccountProfileAsync'], ['account.name', 'AccountNameAsync'],
      ['account.bio', 'AccountBioAsync'], ['account.username', 'AccountUsernameAsync'],
      // Las dos de la foto tenían brazo de negación cuando se escribió esta prueba; la ronda AU los cambió por
      // los de verdad, así que entran en la misma comprobación: un brazo, un manejador y un espejo.
      ['account.photo.pick', 'AccountPhotoPickAsync'], ['account.photo.delete', 'AccountPhotoDeleteAsync'],
    ] as const) {
      expect(count(`"${method}" => await ${name}(args),`, service) + count(`"${method}" => await ${name}(),`, service)).toBe(1);
      expect(count(`private async Task<object?> ${name}(`, arms + photoArms)).toBe(1);
      expect(count(`method === '${method}'`, preview)).toBe(1);
      expect(javaArm(method)).toBeTruthy();
      expect(policy).toContain(`"${method}"`);
    }
    // La ronda AV cerró la última negativa del menú de cuenta, así que la constante que negaba las sesiones no
    // puede volver a citarse: un brazo fantasma sobre una orden ya conectada es lo que estas dos pruebas llevan
    // rondas vigilando.
    expect(service).not.toContain('NoSessions');
    expect(rules).not.toContain('NoSessions');
    // Y el espejo de la ronda AU quitó también la constante que negaba la foto: si alguien la volviera a citar,
    // sería un brazo fantasma sobre una orden que ya está conectada.
    expect(service).not.toContain('NoPhoto');
    expect(rules).not.toContain('NoPhoto');
  });

  it('la pantalla de escritorio ofrece ya las tres entradas del perfil', () => {
    // Las dos fotos se destaparon en la ronda AU y las sesiones en la AV: en este diálogo ya no queda ninguna
    // entrada con `!desktop`, porque ya no queda ninguna orden sin brazo. Se mira solo el trozo de `openProfile`,
    // que sigue teniendo su rama móvil en otras pantallas —la cámara y la nota de voz de `adjuntos`—.
    const profile = app.slice(app.indexOf('function openProfile('), app.indexOf('function openSessions('));
    expect(profile).not.toBe('');
    // La ronda BO añadió una guarda: el estado emoji pide `emojiStatus.options` y `emojiPacks.list`, que el host de
    // Windows aún no contesta. Es la única puerta cerrada del diálogo; las tres entradas destapadas siguen abiertas.
    expect(profile.match(/!desktop/g) ?? []).toHaveLength(1);
    expect(profile).toContain('{!desktop&&state.wallet?.premium&&<MenuItem icon={<Sparkles/>} label="Cambiar estado emoji"');
    expect(app).toContain('{<MenuItem icon={<Image/>} label="Cambiar foto de perfil"');
    expect(app).toContain('{profile.photoId!=="0"&&<MenuItem icon={<Trash2/>} label="Eliminar foto de perfil"');
    expect(app).toContain('<MenuItem icon={<ShieldCheck/>} label="Administrar sesiones" onClick={openSessions}/>');
    expect(menu).toContain('label="Mi perfil de Telegram"');
    expect(menu).toContain('onClick={openProfile}/>}');
    // Y la nota que explicaba el hueco de Windows se fue con el hueco: dejarla habría enseñado una limitación
    // que este host ya no tiene.
    expect(app).not.toContain('Las sesiones todavía no se gestionan en Windows');
  });

  it('los topes y el nombre vacío son guardas del puente, no gestos: la pantalla ya los corta', () => {
    // Lo mismo que se aprendió en la ronda AS, aplicado antes de escribir la prueba: `TextEntry` pone
    // `maxLength` en el campo y deja el botón muerto con el campo en blanco, así que ninguna de esas tres
    // negaciones se alcanza con el ratón. Siguen escritas porque son la guarda sobre quien llame al puente.
    const entry = app.slice(at('function TextEntry(', app), at('function TextEntry(', app) + 1400);
    expect(entry).toContain('maxLength={maximum}');
    expect(entry).toContain('disabled={!multiline&&!allowEmpty&&!value.trim()}');
    expect(app).toContain('label="Nombre" initial={profile.firstName} maximum={64}');
    expect(app).toContain('Biografía · hasta 140 caracteres');
    // BadUsername y las dos cadenas vacías sí son gestos: el campo permite escribir «ab» y permite vaciar.
    expect(app).toContain('placeholder="nombre_usuario" maximum={32} allowEmpty');
  });

  it('las citas de Java en la regla pura dicen eso mismo en la línea citada', () => {
    // Un número de línea es una promesa que se pudre: la ronda AS lo aprendió cuando dos líneas de comentario
    // movieron tres citas y las agujas viejas siguieron en verde sobre un archivo mentiroso. Aquí se lee la cita
    // del propio bloque de documentación y se comprueba lo que hay en esa línea.
    const lines = java.split('\n');
    for (const [name, method] of [['NoName', 'account.name'], ['BadUsername', 'account.username']] as const) {
      const line = lines[cited('NativeBridge.java', name) - 1] ?? '';
      expect(line).toContain(`case "${method}":`);
      expect(line).toContain(`IllegalArgumentException("${csSentence(name)}")`);
    }
    // `Missing` no nace en un `case`: es la otra cara del `Invalid text` de `BridgePolicy.text`, y lo que prueba la
    // cita es que esa función sigue midiendo la cadena cruda antes de que nadie la recorte.
    const policyLine = policy.split('\n')[cited('BridgePolicy.java', 'Missing') - 1] ?? '';
    expect(policyLine).toContain('static String text(JSONObject params,String key,int maximum)');
    expect(policyLine).toContain('throw new IllegalArgumentException("Invalid text")');
    // Y la línea que cita el brazo de lectura es el `GetMe` con el que Android empieza el perfil.
    const profileDoc = arms.slice(0, at('private async Task<object?> AccountProfileAsync(', arms));
    const citations = [...profileDoc.matchAll(/NativeBridge\.java:(\d+)(?!-)/g)];
    if (citations.length === 0) throw new Error('El brazo de lectura no cita la línea de Android donde nace el perfil.');
    expect(lines[Number(citations.at(-1)![1]) - 1] ?? '').toContain('perform(new TdApi.GetMe()');
    expect(csDoc('AccountProfileAsync')).toContain('users.getUsers([self])');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Profile = {
  firstName: string; lastName: string; username: string; usernames: string[]; editableUsername: string;
  bio: string; bioEntities?: unknown[]; photoId: string; phoneNumber: string;
  birthday?: { day: number; month: number; year: number }; business?: { address: string };
};
type Snap = { name: string; platform: string };

describe('ronda AT · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ name: '', platform: 'desktop' });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  const profile = async () => (await call('account.profile')) as Profile;
  const write = async (method: string, params?: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);

  it('leer el perfil trae las claves que la pantalla consume', async () => {
    const value = await profile();
    expect(value.firstName).toBe('Rodrigo');
    expect(value.username).toBe('rodrigo');
    expect(value.usernames).toEqual(['rodrigo']);
    expect(value.editableUsername).toBe('rodrigo');
    expect(value.bio.length).toBeGreaterThan(10);
    expect(value.photoId).toBe('0');
    expect(value.phoneNumber).toBe('+34600111222');
    expect(value.birthday).toEqual({ day: 14, month: 6, year: 1994 });
  });

  it('el andamio de Windows recorta lo que el puente de C# no manda', async () => {
    // No es adorno: `UserMenu.tsx:83` pinta la bio con `FormattedText text entities`, y con las entidades del
    // andamio delante la vista de diseño enseñaría enlaces que en Windows no existen. `FormattedText` (`formatting.tsx:98`)
    // convierte la ausencia en texto plano, que es exactamente lo que MTProto publica.
    const windows = await profile();
    expect(windows.bioEntities).toBeUndefined();
    expect(windows.business).toBeUndefined();
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    const android = await profile();
    expect(android.bioEntities).toBeInstanceOf(Array);
    expect((android.bioEntities as unknown[]).length).toBeGreaterThan(0);
    expect(android.business?.address).toContain('Madrid');
  });

  it('escribir el nombre se ve en la lectura siguiente y en el rótulo del estado', async () => {
    expect(await write('account.name', { firstName: '  Ana  ', lastName: ' ' })).toBe(true);
    const value = await profile();
    // El `trim` de Android, no un recorte propio: «Ana» y apellido vacío, que en MTProto es borrar el apellido.
    expect(value.firstName).toBe('Ana');
    expect(value.lastName).toBe('');
    expect(snap().name).toBe('Ana');
  });

  it('el nombre no puede quedar vacío, ni con espacios, ni sin la clave', async () => {
    const refusal = csSentence('NoName');
    expect(await write('account.name', { firstName: '   ', lastName: 'G' })).toBe(refusal);
    expect(await write('account.name', { lastName: 'G' })).toBe(csSentence('Missing'));
    expect((await profile()).firstName).toBe('Rodrigo');
    expect(snap().name).toBe('Rodrigo');
  });

  it('pasarse del tope se niega antes de recortar, en las dos capas', async () => {
    const tooLong = (maximum: number) => `El texto supera los ${maximum} caracteres que acepta Telegram.`;
    // 64 crudos entran: el tope es `> 64`, no `>= 64`.
    expect(await write('account.name', { firstName: 'a'.repeat(64), lastName: ' ' })).toBe(true);
    expect((await profile()).lastName).toBe('');
    // 64 más un espacio sobrante se niega medido en crudo, aunque recortado quepa: es el orden de `BridgePolicy.text`.
    expect(await write('account.name', { firstName: `${'a'.repeat(64)} `, lastName: '' })).toBe(tooLong(64));
    expect((await profile()).firstName).toBe('a'.repeat(64));
    expect(await write('account.name', { firstName: 'Ana', lastName: 'g'.repeat(65) })).toBe(tooLong(64));
  });

  it('la biografía se normaliza, se puede vaciar y una bio nueva no trae entidades', async () => {
    expect(await write('account.bio', { bio: '  una línea\notra línea  ' })).toBe(true);
    expect((await profile()).bio).toBe('una línea otra línea');
    expect(await write('account.bio', { bio: '' })).toBe(true);
    expect((await profile()).bio).toBe('');
    // El rótulo del estado no se mueve con la bio: `RefreshSelf` solo aporta el nombre.
    expect(snap().name).toBe('Rodrigo');
    // Las entidades del andamio eran del texto viejo; en Android, donde sí viajan, una bio nueva llega sin ninguna.
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    expect(await write('account.bio', { bio: 'sin entidades ya' })).toBe(true);
    expect((await profile()).bioEntities).toEqual([]);
  });

  it('la biografía larga se niega con el mismo tope de siempre', async () => {
    const before = (await profile()).bio;
    expect(await write('account.bio', { bio: 'x'.repeat(141) })).toBe('El texto supera los 140 caracteres que acepta Telegram.');
    expect((await profile()).bio).toBe(before);
  });

  it('el nombre público admite el válido, admite vaciarlo y rechaza el resto', async () => {
    expect(await write('account.username', { username: ' ana_dev ' })).toBe(true);
    let value = await profile();
    expect(value.username).toBe('ana_dev');
    expect(value.usernames).toEqual(['ana_dev']);
    expect(value.editableUsername).toBe('ana_dev');
    // Vaciar es quitar: así lo escribe TDLib y así lo escribe `account.updateUsername`.
    expect(await write('account.username', { username: '' })).toBe(true);
    value = await profile();
    expect(value.username).toBe('');
    expect(value.usernames).toEqual([]);
    expect(snap().name).toBe('Rodrigo');
  });

  it('un nombre público mal formado no viaja a Telegram', async () => {
    const refusal = csSentence('BadUsername');
    for (const bad of ['ab', '9abcde', 'ana-dev', '_ana_', 'ana dev'])
      expect(await write('account.username', { username: bad })).toBe(refusal);
    expect((await profile()).username).toBe('rodrigo');
  });

  it('el tope crudo del nombre público va antes que el patrón', async () => {
    // 33 letras cabrían mal en las dos guarda, y la que habla primero es la de `BridgePolicy.text`, que mide sin
    // recortar: la frase que se lee es la del máximo, no la del formato.
    expect(await write('account.username', { username: 'a'.repeat(33) }))
      .toBe('El texto supera los 32 caracteres que acepta Telegram.');
    expect(await write('account.username', { username: 'a'.repeat(32) })).toBe(true);
    expect((await profile()).username).toBe('a'.repeat(32));
  });

  it('los bordes del patrón son los de Java: 5 entra, 4 no, 32 entra', async () => {
    expect(await write('account.username', { username: 'abcde' })).toBe(true);
    expect(await write('account.username', { username: 'abcd' })).toBe(csSentence('BadUsername'));
    expect(await write('account.username', { username: 'a'.repeat(32) })).toBe(true);
    expect((await profile()).username).toBe('a'.repeat(32));
    // 33 crudos ni se recortan: es el tope de `BridgePolicy.text`, que mide antes del `trim`.
    expect(await write('account.username', { username: `${'a'.repeat(32)} ` })).toBe('El texto supera los 32 caracteres que acepta Telegram.');
  });

  it('escribir no toca las otras claves del perfil', async () => {
    const before = await profile();
    expect(await write('account.name', { firstName: 'Ana', lastName: 'García' })).toBe(true);
    const after = await profile();
    expect(after.photoId).toBe(before.photoId);
    expect(after.phoneNumber).toBe(before.phoneNumber);
    expect(after.birthday).toEqual(before.birthday);
    expect(after.bio).toBe(before.bio);
    expect(after.username).toBe(before.username);
    expect(snap().name).toBe('Ana García');
  });

  it('en Android el espejo se comporta igual, porque las reglas no miran la plataforma', async () => {
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    expect(await write('account.name', { firstName: '  Ana  ', lastName: '' })).toBe(true);
    expect((await profile()).firstName).toBe('Ana');
    expect(await write('account.name', { firstName: ' ', lastName: '' })).toBe(csSentence('NoName'));
    expect(await write('account.username', { username: 'ana-dev' })).toBe(csSentence('BadUsername'));
    expect(await write('account.bio', { bio: `${'x'.repeat(140)}y` })).toBe('El texto supera los 140 caracteres que acepta Telegram.');
  });
});
