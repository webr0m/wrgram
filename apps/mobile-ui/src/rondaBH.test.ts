import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PRIVACY_BASES, PRIVACY_KEYS, PRIVACY_MAX_EXCEPTIONS, PRIVACY_MAX_KEY, PRIVACY_MAX_PER_LIST,
  PRIVACY_MAX_VALUE, PRIVACY_OTHER_RULES, PRIVACY_REFUSALS, PRIVACY_RULE_LABELS,
  isModeledRule, shapedIds, type PrivacyRule,
} from './privacySettings';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const model = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/PrivacyRules.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopPrivacy.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopPrivacyFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const settings = text('./SettingsPage.tsx');
const menu = text('./UserMenu.tsx');
const mirror = text('./privacySettings.ts');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');

const javaLines = java.split('\n');
const modelLines = model.split('\n');

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const javaLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const modelLine = (number: number) => line(modelLines, number, 'PrivacyRules.java');

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** El entero que C# asigna a un techo. */
function csNumber(name: string, from = rules): number {
  const match = new RegExp(`public const int ${name} =\\s*(\\d+)`).exec(from);
  if (!match) throw new Error(`Falta el techo ${name}`);
  return Number(match[1]);
}

/** El literal que Java asigna a una cadena, con las comillas puestas. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);

/** El cuerpo de un método, cortado por el siguiente bloque de documento o por la siguiente firma. */
function body(needle: string, from: string, stop: string): string {
  const at = from.indexOf(needle);
  if (at < 0) throw new Error(`Falta ${needle}`);
  const rest = from.slice(at);
  const next = rest.indexOf(stop, 1);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Orden de apariciones dentro de un cuerpo: la prueba del cortafuegos es la posición, no una afirmación. */
function ordered(from: string, ...needles: string[]): void {
  const positions = needles.map(needle => {
    const at = from.indexOf(needle);
    if (at < 0) throw new Error(`Falta la aguja "${needle}"`);
    return at;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

const javaSet = body('private void privacySet(JSONObject p,Answer a){', java, '\n    private static long[] optionalIds');
const javaGet = body('private void privacyGet(JSONArray result,int index,Answer a){', java, '\n    private void privacySet');
const csSet = body('private async Task<object?> SetPrivacyAsync', cable, '\n    /// <summary>');
const csGet = body('private async Task<object?> PrivacyAsync', cable, '\n    /// <summary>');

describe('ronda BH · medido en el cable de las tres capas', () => {
  it('las catorce claves son las mismas en Java, en C# y en el espejo, y en el mismo orden', () => {
    const row = javaLine(3859);
    expect(row).toContain('private static final String[] PRIVACY_KEYS=');
    const declared = [...row.matchAll(/"([A-Za-z0-9]+)"/g)].map(found => found[1]);
    expect(declared).toEqual([...PRIVACY_KEYS]);
    const table = body('public static readonly (string Key, InputPrivacyKey Setting)[] Keys', rules, '\n    /// <summary>');
    expect([...table.matchAll(/\("([A-Za-z0-9]+)", InputPrivacyKey\./g)].map(found => found[1])).toEqual([...PRIVACY_KEYS]);
    expect(mirror).toContain('export const PRIVACY_KEYS = [');
  });

  it('cada clave tiene su pareja de MTProto dicha una sola vez, y su `case` en la misma tabla de Java', () => {
    const pairs: [string, string][] = [
      ['status', 'StatusTimestamp'], ['profilePhoto', 'ProfilePhoto'], ['phone', 'PhoneNumber'], ['bio', 'About'],
      ['birthdate', 'Birthday'], ['forwards', 'Forwards'], ['calls', 'PhoneCall'],
      ['voiceMessages', 'VoiceMessages'], ['invites', 'ChatInvite'], ['findPhone', 'AddedByPhone'],
      ['p2p', 'PhoneP2P'], ['noPaidMessages', 'NoPaidMessages'], ['savedMusic', 'SavedMusic'], ['starGiftsAutoSave', 'StarGiftsAutoSave'],
    ];
    for (const [key, setting] of pairs) {
      expect(rules).toContain(`("${key}", InputPrivacyKey.${setting})`);
      expect(java).toContain(`case "${key}":return new TdApi.UserPrivacySetting`);
    }
    expect([...rules.matchAll(/\("([A-Za-z0-9]+)", InputPrivacyKey\./g)].map(found => found[1])).toHaveLength(pairs.length);
    // La ronda CR cerró el hueco: las cuatro claves que antes no se ofrecían ahora se leen y se escriben en las
    // dos capas, y con ellas el enum medido de catorce queda cubierto entero, sin ninguna clave fuera.
    const measured = ['StatusTimestamp', 'ProfilePhoto', 'PhoneNumber', 'About', 'Birthday', 'Forwards', 'PhoneCall',
      'VoiceMessages', 'ChatInvite', 'AddedByPhone', 'PhoneP2P', 'NoPaidMessages', 'SavedMusic', 'StarGiftsAutoSave'];
    expect(pairs.map(([, setting]) => setting).sort()).toEqual([...measured].sort());
  });

  it('los cuatro techos están medidos en las tres capas, con el número dentro de la frase cuando Java lo dice', () => {
    expect(javaLine(3892)).toContain('BridgePolicy.text(p,"key",20)');
    expect(javaLine(3892)).toContain('BridgePolicy.text(p,"value",12)');
    expect(javaLine(3893)).toContain('optionalIds(p,"allowUsers",100)');
    expect(javaLine(3893)).toContain('optionalIds(p,"restrictUsers",100)');
    expect(modelLine(20)).toContain('MAX_USER_EXCEPTIONS = 200');
    expect(csNumber('MaxKey')).toBe(PRIVACY_MAX_KEY);
    expect(csNumber('MaxValue')).toBe(PRIVACY_MAX_VALUE);
    expect(csNumber('MaxPerList')).toBe(PRIVACY_MAX_PER_LIST);
    expect(csNumber('MaxExceptions')).toBe(PRIVACY_MAX_EXCEPTIONS);
    expect(PRIVACY_MAX_KEY).toBe(20);
    expect(PRIVACY_MAX_VALUE).toBe(12);
    expect(PRIVACY_MAX_PER_LIST).toBe(100);
    expect(PRIVACY_MAX_EXCEPTIONS).toBe(200);
  });

  it('las seis frases que Java dice en español están copiadas carácter a carácter en C# y en el espejo', () => {
    const shared: [string, string, string][] = [
      ['unknownSetting', csSentence('UnknownSetting'), javaLine(3872)],
      ['badValue', csSentence('BadValue'), modelLine(90)],
      ['tooMany', csSentence('TooMany'), modelLine(92)],
      ['duplicated', csSentence('Duplicated'), modelLine(94)],
      ['bothWays', csSentence('BothWays'), modelLine(95)],
      ['changedAccount', csSentence('ChangedAccount'), javaLine(3901)],
    ];
    for (const [name, csharp, row] of shared) {
      const phrase = (PRIVACY_REFUSALS as Record<string, string>)[name];
      expect(csharp).toBe(phrase);
      expect(says(row, phrase)).toBe(true);
    }
  });

  it('las dos negaciones de forma son las de BridgePolicy, dichas en español en las dos capas nuevas', () => {
    expect(policy).toContain('throw new IllegalArgumentException("Invalid text")');
    expect(policy).toContain('throw new IllegalArgumentException("Invalid identifier list")');
    expect(csSentence('BadText')).toBe(PRIVACY_REFUSALS.badText);
    expect(csSentence('BadList')).toBe(PRIVACY_REFUSALS.badList);
  });

  it('las siete etiquetas de lo que se conserva viven una vez por capa, y la octava es la de paridad', () => {
    const labels: [string, number][] = [
      ['allowBots', 100], ['disallowBots', 101], ['allowPremium', 102], ['disallowContacts', 103],
      ['allowChatMembers', 104], ['disallowChatMembers', 105],
    ];
    for (const [kind, number] of labels) {
      const phrase = PRIVACY_RULE_LABELS[kind];
      expect(says(modelLine(number), phrase)).toBe(true);
      expect(rules).toContain(`"${phrase}"`);
    }
    // `allowCloseFriends` no existe en TDLib: es la séptima regla que mide MTProto y la etiqueta es propia.
    expect(PRIVACY_RULE_LABELS.allowCloseFriends).toBe('amigos cercanos permitidos');
    expect(model).not.toContain('CloseFriends');
    expect(rules).toContain('PrivacyValueAllowCloseFriends => AllowCloseFriends');
    expect(PRIVACY_OTHER_RULES).toBe(csSentence('OtherRules'));
    expect(says(modelLine(106), PRIVACY_OTHER_RULES)).toBe(true);
  });

  it('las cinco reglas modeladas son cinco en las tres capas, y todo lo demás viaja intacto', () => {
    const javaModeled = body('static boolean modeled(TdApi.UserPrivacySettingRule rule)', model, '\n    static JSONObject project');
    expect([...javaModeled.matchAll(/instanceof TdApi\.(\w+)/g)].map(found => found[1])).toHaveLength(5);
    const csModeled = body('public static bool Modeled(PrivacyRule rule)', rules, '\n    /// <summary>');
    expect([...csModeled.matchAll(/PrivacyValue(\w+)/g)].map(found => found[1])).toHaveLength(5);
    const modeled = (['allowAll', 'allowContacts', 'disallowAll', 'allowUsers', 'disallowUsers'] as const)
      .map(kind => ({ kind }) as PrivacyRule);
    for (const rule of modeled) expect(isModeledRule(rule)).toBe(true);
    for (const kind of Object.keys(PRIVACY_RULE_LABELS)) {
      expect(isModeledRule({ kind } as PrivacyRule)).toBe(false);
    }
  });

  it('el cortafuegos de la escritura sigue el orden de Java, medido por posición en las dos capas', () => {
    ordered(javaSet,
      'BridgePolicy.text(p,"key",20)',
      'BridgePolicy.text(p,"value",12)',
      'optionalIds(p,"allowUsers",100)',
      'TdApi.UserPrivacySetting setting=privacySetting(key)',
      'new TdApi.GetUserPrivacySettingRules(setting)',
      'PrivacyRules.merge(current.rules',
      'session.selfId!=owner',
      'new TdApi.SetUserPrivacySettingRules(setting');
    ordered(csSet,
      'Shaped(key, DesktopPrivacy.MaxKey)',
      'Shaped(value, DesktopPrivacy.MaxValue)',
      'PrivacyIds(args, "allowUsers")',
      'DesktopPrivacy.Setting(key',
      'Account_GetPrivacy(setting)',
      'DesktopPrivacy.Merge(current.rules',
      'Account_SetPrivacy(setting, rules)');
    // La guarda de cuenta: Android la escribe una vez en el propio handler (`:3871`) y la envuelve con el `perform`
    // de `:475` en cada una de las dos peticiones. Windows la escribe dos veces —tras la lectura y antes de la
    // escritura—, y la segunda va justo delante de la petición, que es la posición que prueba el orden.
    expect([...csSet.matchAll(/client\.User\?\.id != owner/g)].length).toBe(2);
    const last = csSet.slice(csSet.indexOf('DesktopPrivacy.Merge(current.rules'), csSet.indexOf('Account_SetPrivacy(setting, rules)'));
    expect(last).toContain('client.User?.id != owner');
    expect(javaSet.match(/session\.selfId!=owner/g)).toHaveLength(1);
    // La validación de las excepciones es el primer paso del `merge`, en las dos capas.
    // La validación de las excepciones es el primer paso del `merge`, en las dos capas: Java llama a `validate`
    // antes de tocar la lista y C# llama a `Problem` antes de armar la primera regla.
    const javaMerge = body('static TdApi.UserPrivacySettingRule[] merge', model, '\n    private static TdApi.UserPrivacySettingRule[] base');
    expect(javaMerge).toContain('validate(value, allow, restrict);');
    expect(body('public static InputPrivacyRule[] Merge', rules, '\n    /// <summary>'))
      .toContain('var refusal = Problem(value, allow, restrict);');
  });

  it('la lectura es catorce viajes en el mismo orden por capa, y la cuenta se mira dentro del bucle', () => {
    expect(javaGet).toContain('if(index>=PRIVACY_KEYS.length)');
    expect(javaGet).toContain('privacyGet(result,index+1,a)');
    expect(javaGet).toContain('privacySetting(key)');
    expect(javaLine(3895)).toContain('long owner=session.selfId');
    expect(csGet).toContain('foreach (var (key, setting) in DesktopPrivacy.Keys)');
    ordered(csGet, 'Account_GetPrivacy(setting)', 'client.User?.id != owner', 'MergePeers(answer.users?.Values', 'DesktopPrivacy.Row(key, answer.rules)');
    // Android se traga el fallo de proyección de una clave y sigue; aquí no hay nada que atrapar, así que esa
    // diferencia está escrita en el cable y no copiada en silencio.
    expect(javaLine(3886)).toContain('catch(Exception ignored){}');
    expect(cable).toContain('una negación que no puede ocurrir es peor que un hueco');
    expect(rules).not.toContain('Unreadable');
  });

  it('las dos órdenes tienen brazo en Windows y siguen en la lista del puente, sin diálogo nativo', () => {
    expect(service).toContain('"privacy.get" => await PrivacyAsync()');
    expect(service).toContain('"privacy.set" => await SetPrivacyAsync(args)');
    expect(policy).toContain('"privacy.get","privacy.set"');
    // Ninguna de las dos capas abre un `Dialogs` antes de escribir, así que el plazo largo no las cobija.
    expect(bridge).not.toContain("'privacy.set',");
    expect(bridge).not.toContain("'privacy.get',");
    expect(cable).not.toContain('ConfirmPhoto');
  });

  it('la pantalla ofrece exactamente las tres bases que el puente acepta, y el andamio modela en lugar de pintar', () => {
    expect(PRIVACY_BASES).toEqual(['everyone', 'contacts', 'nobody']);
    for (const base of PRIVACY_BASES) expect(settings).toContain(`<option value="${base}">`);
    expect(settings).toContain('<option value="" disabled>Personalizado</option>');
    expect(menu).toContain("run<PrivacySetting[]>('privacy.get')");
    expect(preview).toContain('designPrivacyGet()');
    expect(preview).toContain('designPrivacySet(params)');
    expect(preview).toContain('mergePrivacy(previewPrivacyRules[key]');
    expect(preview).not.toContain('let previewPrivacy:');
    expect(preview).not.toContain('params.allowUsers as string[])||[]');
  });

  it('el panel de privacidad se abre de verdad en escritorio y solo ofrece lo que Windows atiende', () => {
    const desktop = body("if(state.platform==='desktop') return", settings, 'const categories=[');
    expect(desktop).toContain('<h3 className="settings-label">PRIVACIDAD</h3>{visibilitySection}');
    expect(settings).toContain('const visibilitySection=<Section icon={<ShieldCheck/>} title="Quién puede verte y contactarte"');
    expect(settings).toContain('<PrivacySettings run={run} ready={state.ready}/>');
    // La frase de la puerta vive una sola vez en la capa: las dos ramas la comparten, no la copian.
    expect(settings.split('Quién puede verte y contactarte').length - 1).toBe(1);
    // La norma de BH era «no ofrezcas lo que Windows no atiende». La ronda BI cableó los bloqueos y la BN el
    // borrado automático, así que la misma norma ahora exige lo contrario: las tres puertas tienen que estar en la
    // rama de escritorio, y cada una con una sola frase en la capa —la constante que comparten las dos ramas— para
    // que ninguna de las dos pueda decir cosas distintas sobre el mismo ajuste.
    expect(desktop).toContain('{visibilitySection}{blockedSection}{autoDeleteSection}');
    expect(settings).toContain('<BlockedSettings key={state.selfId} run={run} ready={state.ready}/>');
    expect(settings).toContain('<AutoDeleteSettings key={state.selfId} run={run} ready={state.ready}/>');
    expect(settings.split('Borrado automático en chats nuevos').length - 1).toBe(1);
    // La puerta del menú de usuario sigue siendo solo de Android: su rama de escritorio se adelanta a `ProfileSummary`.
    expect(body('if(desktop) return', menu, '\n  return <div className="account-menu">')).not.toContain('<ProfileSummary');
    // Sin estas dos, el panel entero fracasaría en Windows: las dos se piden juntas al entrar.
    expect(service).toContain('"contacts.list" => await ListContactsAsync()');
    expect(service).toContain('"contacts.search" => await SearchContactsAsync(args)');
  });
});

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BH · medido con las manos en el andamio', () => {
  let call: Request = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as Request;
  });

  it('lee las catorce claves en su orden, con la fila que la pantalla pinta', async () => {
    const rows = await call('privacy.get') as { key: string; value: string }[];
    expect(rows.map(row => row.key)).toEqual([...PRIVACY_KEYS]);
    expect(rows.map(row => row.value)).toEqual([
      'contacts', 'everyone', 'contacts', 'everyone', 'nobody', 'everyone', 'contacts', 'custom', 'everyone', 'contacts',
      'contacts', 'everyone', 'everyone', 'everyone',
    ]);
  });

  it('el personalizado y lo conservado salen de las reglas, no de un texto escrito a mano', async () => {
    const rows = await call('privacy.get') as { key: string; value: string; preserved: string[] }[];
    const voice = rows.find(row => row.key === 'voiceMessages')!;
    expect(voice.value).toBe('custom');
    expect(voice.preserved).toEqual(['suscriptores de Premium permitidos', 'miembros de chats restringidos']);
    const calls = rows.find(row => row.key === 'calls')!;
    expect(calls.value).toBe('contacts');
    expect(calls.preserved).toEqual([PRIVACY_RULE_LABELS.disallowBots]);
  });

  it('cambiar la base de un ajuste deja intacta la regla que la pantalla no sabe expresar', async () => {
    expect(await call('privacy.set', { key: 'calls', value: 'everyone', allowUsers: [], restrictUsers: ['42'] })).toBe(true);
    const rows = await call('privacy.get') as { key: string; value: string; preserved: string[]; restrictUsers: string[] }[];
    const calls = rows.find(row => row.key === 'calls')!;
    expect(calls.value).toBe('everyone');
    expect(calls.preserved).toEqual([PRIVACY_RULE_LABELS.disallowBots]);
    expect(calls.restrictUsers).toEqual(['42']);
  });

  it('la base de «todos» tira las excepciones de permitir y guarda las de restringir; la de «nadie», al revés', async () => {
    await call('privacy.set', { key: 'phone', value: 'contacts', allowUsers: ['7'], restrictUsers: ['8'] });
    await call('privacy.set', { key: 'phone', value: 'everyone', allowUsers: [], restrictUsers: ['8'] });
    let rows = await call('privacy.get') as { key: string; allowUsers: string[]; restrictUsers: string[] }[];
    let phone = rows.find(row => row.key === 'phone')!;
    expect(phone.allowUsers).toEqual([]);
    expect(phone.restrictUsers).toEqual(['8']);
    await call('privacy.set', { key: 'phone', value: 'nobody', allowUsers: ['7'], restrictUsers: [] });
    rows = await call('privacy.get') as { key: string; allowUsers: string[]; restrictUsers: string[] }[];
    phone = rows.find(row => row.key === 'phone')!;
    expect(phone.allowUsers).toEqual(['7']);
    expect(phone.restrictUsers).toEqual([]);
  });

  it('un ajuste que la pantalla deja en personalizado sí se reescribe por debajo, y sus reglas siguen conservadas', async () => {
    // La guarda del `custom` está en la pantalla (`SettingsPage.tsx:123` deshabilita Guardar), no en el puente:
    // Android tampoco lo niega, y el espejo lo reproduce.
    expect(await call('privacy.set', { key: 'voiceMessages', value: 'nobody', allowUsers: ['9'], restrictUsers: [] })).toBe(true);
    const rows = await call('privacy.get') as { key: string; value: string; preserved: string[] }[];
    const voice = rows.find(row => row.key === 'voiceMessages')!;
    expect(voice.value).toBe('nobody');
    expect(voice.preserved).toEqual(['suscriptores de Premium permitidos', 'miembros de chats restringidos']);
  });

  it('una clave que no es de las catorce se niega con la frase de privacySetting', async () => {
    await expect(call('privacy.set', { key: 'stories', value: 'everyone', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.unknownSetting);
  });

  it('un valor que no es una de las tres bases se niega con la frase de validate', async () => {
    await expect(call('privacy.set', { key: 'bio', value: 'friends', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badValue);
  });

  it('el duplicado y el doble sentido se niegan cada uno con su frase, en el orden de validate', async () => {
    await expect(call('privacy.set', { key: 'bio', value: 'contacts', allowUsers: ['5', '5'], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.duplicated);
    await expect(call('privacy.set', { key: 'bio', value: 'contacts', allowUsers: ['5'], restrictUsers: ['5'] }))
      .rejects.toThrow(PRIVACY_REFUSALS.bothWays);
  });

  it('las dos listas llenas caben justas, y el tope de cien por lista corta antes que la clave', async () => {
    const allow = Array.from({ length: PRIVACY_MAX_PER_LIST }, (_, index) => String(index + 1));
    const restrict = Array.from({ length: PRIVACY_MAX_PER_LIST }, (_, index) => String(index + 101));
    // Cien más cien son doscientas y `validate` niega más de doscientas: el tope conjunto no se alcanza por el
    // puente en ninguna capa, y la prueba lo mide en lugar de fingirlo.
    expect(allow.length + restrict.length).toBe(PRIVACY_MAX_EXCEPTIONS);
    expect(await call('privacy.set', { key: 'bio', value: 'contacts', allowUsers: allow, restrictUsers: restrict })).toBe(true);
    const over = Array.from({ length: PRIVACY_MAX_PER_LIST + 1 }, (_, index) => String(index + 1));
    await expect(call('privacy.set', { key: 'tampocoexiste', value: 'everyone', allowUsers: over, restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badList);
    expect(rules).toContain('if (allow.Length + restrict.Length > MaxExceptions) return TooMany;');
  });

  it('un elemento que no es un identificador corta la orden: vacío, con espacios, con letras, de otro tipo', async () => {
    for (const bad of [['abc'], [''], ['12e'], [' 12'], ['-'], ['1.5'], ['12\n'], [null], [7]]) {
      await expect(call('privacy.set', { key: 'bio', value: 'contacts', allowUsers: bad, restrictUsers: [] }))
        .rejects.toThrow(PRIVACY_REFUSALS.badList);
    }
    expect(shapedIds([])).toBe(true);
    expect(shapedIds(undefined)).toBe(true);
    expect(shapedIds(['0', '-12', '9223372036854775807'])).toBe(true);
  });

  it('la forma de las dos cadenas manda sobre todo lo demás: ni ausente, ni de otro tipo, ni pasada del tope', async () => {
    await expect(call('privacy.set', { value: 'everyone' })).rejects.toThrow(PRIVACY_REFUSALS.badText);
    await expect(call('privacy.set', { key: 'bio', allowUsers: [], restrictUsers: [] })).rejects.toThrow(PRIVACY_REFUSALS.badText);
    await expect(call('privacy.set', { key: 'bio', value: 3, allowUsers: [], restrictUsers: [] })).rejects.toThrow(PRIVACY_REFUSALS.badText);
    await expect(call('privacy.set', { key: 'x'.repeat(PRIVACY_MAX_KEY + 1), value: 'everyone', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badText);
    await expect(call('privacy.set', { key: 'bio', value: 'y'.repeat(PRIVACY_MAX_VALUE + 1), allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badText);
  });

  it('las dos negaciones que solo existen en Windows están declaradas como suyas y no las finge el andamio', async () => {
    expect(csSentence('MissingUser', rules)).toBe(PRIVACY_REFUSALS.missingUser);
    expect(csSentence('Untranslatable', rules)).toBe(PRIVACY_REFUSALS.untranslatable);
    expect(rules).toContain('negaciones que en Android no existen');
    expect(java).not.toContain('access_hash');
    expect(preview).not.toContain('PRIVACY_REFUSALS.missingUser');
    expect(preview).not.toContain('PRIVACY_REFUSALS.untranslatable');
  });

  it('después de una negativa el ajuste queda como estaba, que es lo que la pantalla promete', async () => {
    const before = await call('privacy.get') as { key: string; value: string }[];
    await expect(call('privacy.set', { key: 'invites', value: 'nadie', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badValue);
    await expect(call('privacy.set', { key: 'invites', value: 'contacts', allowUsers: ['1', '1'], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.duplicated);
    const after = await call('privacy.get') as { key: string; value: string }[];
    expect(after).toEqual(before);
  });
});
