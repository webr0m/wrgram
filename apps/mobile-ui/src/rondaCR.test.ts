import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRIVACY_KEYS, PRIVACY_REFUSALS, PRIVACY_RULE_LABELS } from './privacySettings';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const tdapi = text('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopPrivacy.cs');
const settings = text('./SettingsPage.tsx');
const mirror = text('./privacySettings.ts');

const javaLines = java.split('\n');
const javaLine = (number: number) => {
  const row = javaLines[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de NativeBridge.java`);
  return row;
};

/** Las cuatro claves de la ronda CR, con su clase de TDLib medida en el vendorizado y su etiqueta de pantalla. */
const crKeys: [string, string, string][] = [
  ['p2p', 'UserPrivacySettingAllowPeerToPeerCalls', 'Llamadas entre iguales'],
  ['noPaidMessages', 'UserPrivacySettingAllowUnpaidMessages', 'Mensajes sin pago'],
  ['savedMusic', 'UserPrivacySettingShowProfileAudio', 'Música en el perfil'],
  ['starGiftsAutoSave', 'UserPrivacySettingAutosaveGifts', 'Guardar regalos en el perfil'],
];

describe('ronda CR · las cuatro claves que ninguna pantalla ofrecía', () => {
  it('las cuatro claves están en el espejo, en la tabla de Java y en la de C#, tras las diez de BH', () => {
    expect(PRIVACY_KEYS).toHaveLength(14);
    expect([...PRIVACY_KEYS].slice(10)).toEqual(crKeys.map(([key]) => key));
    const declared = javaLine(3882);
    expect(declared).toContain('private static final String[] PRIVACY_KEYS=');
    for (const [key] of crKeys) expect(declared).toContain(`"${key}"`);
    for (const [key, , ] of crKeys) expect(rules).toContain(`("${key}", InputPrivacyKey.`);
    expect(mirror).toContain("'p2p', 'noPaidMessages', 'savedMusic', 'starGiftsAutoSave'");
  });

  it('cada clave nueva tiene su clase de TDLib medida en el vendorizado y su case en el puente', () => {
    for (const [key, klass] of crKeys) {
      expect(tdapi).toContain(`public static class ${klass} extends UserPrivacySetting`);
      expect(java).toContain(`case "${key}":return new TdApi.${klass}();`);
    }
  });

  it('la inserción es neutra en líneas: el default sigue en la 3861 y los cuatro case viven en la última línea de case', () => {
    // La norma de la ronda: ninguna cita vecina envejece. Los cuatro case se añaden a la línea del último case
    // de BH, así que el `default` y todo lo que viene después conservan su número.
    expect(javaLine(3895)).toContain('default:throw new IllegalArgumentException("Ajuste de privacidad no válido.");');
    const lastCases = javaLine(3894);
    expect(lastCases).toContain('case "findPhone":return new TdApi.UserPrivacySettingAllowFindingByPhoneNumber();');
    for (const [key, klass] of crKeys) expect(lastCases).toContain(`case "${key}":return new TdApi.${klass}();`);
  });

  it('la pantalla tiene etiqueta en español para cada clave nueva, en la misma línea que las diez de BH', () => {
    const labels = settings.split('\n')[76];
    expect(labels).toContain('const privacyLabels:Record<string,string>=');
    for (const [key, , label] of crKeys) expect(labels).toContain(`${key}:'${label}'`);
  });

  it('Windows ya no dice que las cuatro claves no se tocan: la tabla las trae y el comentario lo cuenta', () => {
    expect(rules).not.toContain('no tienen fila');
    expect(rules).toContain('InputPrivacyKey.PhoneP2P');
    expect(rules).toContain('InputPrivacyKey.NoPaidMessages');
    expect(rules).toContain('InputPrivacyKey.SavedMusic');
    expect(rules).toContain('InputPrivacyKey.StarGiftsAutoSave');
    expect(rules).toContain('catorce');
  });
});

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda CR · medido con las manos en el andamio', () => {
  let call: Request = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as Request;
  });

  it('la lectura trae las cuatro claves nuevas con su base, y la de P2P conserva lo que no sabe expresar', async () => {
    const rows = await call('privacy.get') as { key: string; value: string; preserved: string[] }[];
    expect(rows).toHaveLength(14);
    const p2p = rows.find(row => row.key === 'p2p')!;
    expect(p2p.value).toBe('contacts');
    expect(p2p.preserved).toEqual([PRIVACY_RULE_LABELS.disallowBots]);
    for (const key of ['noPaidMessages', 'savedMusic', 'starGiftsAutoSave']) {
      expect(rows.find(row => row.key === key)!.value).toBe('everyone');
    }
  });

  it('cada clave nueva se puede reescribir con las tres bases, y lo conservado sigue en su hueco', async () => {
    expect(await call('privacy.set', { key: 'p2p', value: 'everyone', allowUsers: [], restrictUsers: ['42'] })).toBe(true);
    const rows = await call('privacy.get') as { key: string; value: string; preserved: string[]; restrictUsers: string[]; allowUsers: string[] }[];
    const p2p = rows.find(row => row.key === 'p2p')!;
    expect(p2p.value).toBe('everyone');
    expect(p2p.preserved).toEqual([PRIVACY_RULE_LABELS.disallowBots]);
    expect(p2p.restrictUsers).toEqual(['42']);
    expect(await call('privacy.set', { key: 'starGiftsAutoSave', value: 'nobody', allowUsers: ['7'], restrictUsers: [] })).toBe(true);
    const afterGifts = await call('privacy.get') as { key: string; value: string; allowUsers: string[] }[];
    const gifts = afterGifts.find(row => row.key === 'starGiftsAutoSave')!;
    expect(gifts.value).toBe('nobody');
    expect(gifts.allowUsers).toEqual(['7']);
    expect(await call('privacy.set', { key: 'savedMusic', value: 'contacts', allowUsers: [], restrictUsers: [] })).toBe(true);
    expect(await call('privacy.set', { key: 'noPaidMessages', value: 'nobody', allowUsers: [], restrictUsers: [] })).toBe(true);
    const after = await call('privacy.get') as { key: string; value: string }[];
    expect(after.find(row => row.key === 'savedMusic')!.value).toBe('contacts');
    expect(after.find(row => row.key === 'noPaidMessages')!.value).toBe('nobody');
  });

  it('las negativas de forma y de valor siguen valiendo igual para las claves nuevas', async () => {
    await expect(call('privacy.set', { key: 'p2p', value: 'friends', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badValue);
    await expect(call('privacy.set', { key: 'savedMusic', value: 'contacts', allowUsers: ['5', '5'], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.duplicated);
    await expect(call('privacy.set', { key: 'starGiftsAutoSave', allowUsers: [], restrictUsers: [] }))
      .rejects.toThrow(PRIVACY_REFUSALS.badText);
  });

  it('el regalo automático se expresa con las bases: todos lo guarda, nadie lo convierte', async () => {
    // El cliente oficial lo pinta como un interruptor; aquí viaja como las demás reglas de privacidad:
    // `allowAll` es guardarlos en el perfil y `disallowAll` convertirlos en estrellas. La pantalla no inventa
    // un cuarto valor: usa las tres bases que el puente acepta.
    const before = await call('privacy.get') as { key: string; value: string }[];
    expect(before.find(row => row.key === 'starGiftsAutoSave')!.value).toBe('everyone');
    await call('privacy.set', { key: 'starGiftsAutoSave', value: 'nobody', allowUsers: [], restrictUsers: [] });
    const after = await call('privacy.get') as { key: string; value: string }[];
    expect(after.find(row => row.key === 'starGiftsAutoSave')!.value).toBe('nobody');
  });
});