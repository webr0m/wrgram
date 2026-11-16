import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND, INDEFINITE, MUTE_CHOICES, PATCH_KEYS, SCOPE_IDS, SCOPE_TITLES, SILENT_SOUND,
  effective, keepOption, knownSound, missingScopes, muteKeepLabel, patchProblem, pendingChanges, scopeMap, soundLabel, span, storyCaveat, summaryOf, unset,
} from './scopeSettings';
import type { NotificationScopes, NotificationSound, ScopePatch, ScopeSettings } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

// Cuerpo de un método cuya firma puede terminar en `throws Exception`.
const method = (source: string, signature: string) => {
  const open = source.indexOf(signature);
  if (open < 0) throw new Error(`No se encuentra ${signature}`);
  const brace = source.indexOf('{', open + signature.length);
  if (brace < 0) throw new Error(`Sin cuerpo tras ${signature}`);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(brace, i + 1);
  }
  throw new Error(`Llave sin cerrar tras ${signature}`);
};

const WRITE = 'SetScopeNotificationSettings|SetChatNotificationSettings|MuteChat|RemoveChatActionBar|ReportChat|SendMessage|DeleteChatMessages|SetChatTitle|SetChatDescription|LeaveChat';

const sound = (id: string, title = ''): NotificationSound => ({ id, title, duration: 2 });
const settings = (over: Partial<ScopeSettings> = {}): ScopeSettings => ({
  scope: 'private', muted: false, muteFor: 0, sound: DEFAULT_SOUND, preview: true, muteStories: false,
  storyDefault: false, storySound: DEFAULT_SOUND, storyPoster: true, quietPinned: false, quietMentions: false, ...over,
});

describe('ronda I (N02): Telegram guarda los ajustes por tipo de chat y WRGram solo toca lo pedido', () => {
  const pure = java('ScopeSettings');
  const bridge = java('NativeBridge');
  const policy = java('BridgePolicy');
  const panel = ui('NotificationScopesPanel.tsx');
  const page = ui('SettingsPage.tsx');
  const preview = ui('preview.ts');
  const bridgeUi = ui('bridge.ts');

  it('la fusión vive sola: ni sesión, ni red, ni diálogos', () => {
    expect(pure).not.toMatch(/TdSession|session\.|perform\(|Dialogs|Activity/);
    expect(pure).toMatch('static final int MAX_MUTE = Integer.MAX_VALUE');
    expect(pure).toMatch('static final int MAX_SOUNDS = 64');
    expect(pure).toMatch('static final String[] IDS = {"private", "group", "channel"}');
  });

  it('solo existen los tres alcances que admite TDLib', () => {
    const body = method(pure, 'static TdApi.NotificationSettingsScope scope(String id)');
    expect(body).toMatch('if (id == null) return null;');
    expect(body).toMatch('NotificationSettingsScopePrivateChats');
    expect(body).toMatch('NotificationSettingsScopeGroupChats');
    expect(body).toMatch('NotificationSettingsScopeChannelChats');
    expect(body).toMatch(/return null;\s*\}\s*$/);
    expect(method(pure, 'static String phrase(String id)')).toMatch('return "este tipo de chat";');
  });

  it('la fila proyecta lo que Telegram dijo: el silencio resta segundos y los ids viajan en texto', () => {
    const body = method(pure, 'static JSONObject row(TdApi.NotificationSettingsScope scope, TdApi.ScopeNotificationSettings value)');
    expect(body).toMatch('if (id.isEmpty() || value == null) return null;');
    expect(body).toMatch('.put("muted", value.muteFor > 0)');
    expect(body).toMatch('.put("muteFor", Math.max(0, value.muteFor))');
    expect(body).toMatch('Long.toString(value.soundId)');
    expect(body).toMatch('.put("storyDefault", value.useDefaultMuteStories)');
    expect(body).toMatch('.put("quietPinned", value.disablePinnedMessageNotifications)');
    expect(body).toMatch('.put("quietMentions", value.disableMentionNotifications)');
  });

  it('los sonidos elegibles son los que Telegram guarda: sin -1, sin 0, cortados y con título recortado', () => {
    const body = method(pure, 'static JSONArray sounds(TdApi.NotificationSounds list)');
    expect(body).toMatch('if (list == null || list.notificationSounds == null) return rows;');
    expect(body).toMatch('rows.length() >= MAX_SOUNDS');
    expect(body).toMatch('sound.id == DEFAULT_SOUND || sound.id == SILENT || sound.id < 0');
    expect(body).toMatch('NativeSnapshot.limit(sound.title == null ? "" : sound.title, MAX_TITLE)');
    expect(body).toMatch('Math.max(0, sound.duration)');
  });

  it('el parche no puede tocar lo que la interfaz no gestiona, sobre todo las historias por defecto', () => {
    const body = method(pure, 'static TdApi.ScopeNotificationSettings merge(TdApi.ScopeNotificationSettings current, JSONObject patch, JSONArray ids)');
    expect(body).toMatch('if (current == null || patch == null || patch.length() == 0) throw new IllegalArgumentException("No hay ningún ajuste que cambiar.")');
    expect(body).toMatch('if (!known(key)) throw new IllegalArgumentException("Ese ajuste no corresponde a ninguno de Telegram.")');
    expect(body).toMatch('TdApi.ScopeNotificationSettings next = copy(current);');
    // `SetScopeNotificationSettings` sustituye el objeto entero: lo no gestionado se copia, nunca se rellena.
    expect(body).not.toMatch(/next\.useDefaultMuteStories\s*=/);
    expect(method(pure, 'static TdApi.ScopeNotificationSettings copy(TdApi.ScopeNotificationSettings value)'))
      .toMatch('value.muteFor, value.soundId, value.showPreview,');
  });

  it('silencio y duración no pueden contradecirse, ni el silencio ser negativo', () => {
    const body = method(pure, 'static int muteFor(JSONObject patch)');
    expect(body).toMatch('return Boolean.TRUE.equals(state) ? MAX_MUTE : 0;');
    expect(body).toMatch('seconds < 0 || seconds > MAX_MUTE');
    expect(body).toMatch('Boolean.TRUE.equals(state) != (seconds > 0)');
    expect(body).toMatch('El silencio y su duración no coinciden.');
  });

  it('un sonido nuevo tiene que ser -1, 0 o uno confirmado por Telegram', () => {
    const body = method(pure, 'static long sound(Object value, JSONArray ids, String what)');
    expect(body).toMatch('id.matches("-?[0-9]{1,19}")');
    expect(body).toMatch('if (parsed == DEFAULT_SOUND || parsed == SILENT) return parsed;');
    expect(body).toMatch('if (parsed > 0 && contains(ids, id)) return parsed;');
    expect(body).toMatch('Ese sonido no está entre los que Telegram guarda en esta cuenta.');
    // Un id negativo que no sea -1 no existe: no se escribe a ver qué pasa.
    expect(body).not.toMatch(/parsed < 0.*return/);
  });

  it('el diálogo describe cambios, con las mismas bandas que luego guarda Telegram', () => {
    const body = method(pure, 'static JSONArray changes(TdApi.ScopeNotificationSettings before, TdApi.ScopeNotificationSettings after, JSONArray sounds)');
    expect(body).toMatch('"silencio: " + span(before.muteFor) + " → " + span(after.muteFor)');
    expect(body).toMatch('"sin silencio"');
    expect(body).toMatch('ocultar el contenido en el aviso');
    expect(body).toMatch('las menciones volverán a destacar');
    expect(pure).toMatch('add(list, "sonido: " + soundName(after.soundId, sounds));');
    expect(pure).toMatch('add(list, "sonido de historias: " + soundName(after.storySoundId, sounds));');
    expect(pure).toMatch('if (text.equals(sounds.getJSONObject(i).optString("id")) && !title.isEmpty()) return "«" + title + "»";');
    expect(pure).toMatch('return changes(before, after, new JSONArray());');
    expect(pure).toMatch('if (seconds >= MAX_MUTE) return "indefinido";');
    expect(pure).toMatch('return amount == 1 ? "1 día" : amount + " días";');
    expect(pure).toMatch('return amount == 1 ? "1 mes" : amount + " meses";');
  });

  it('leer los tres alcances no escribe nada en Telegram', () => {
    for (const signature of ['private void scopeSettings(', 'private void scopeStep(', 'private void savedSounds(', 'private void respondScope(']) {
      expect(method(bridge, signature)).not.toMatch(new RegExp(WRITE));
    }
  });

  it('el recorrido de lectura está acotado: tres alcances y una lista de sonidos', () => {
    expect(method(bridge, 'private void scopeSettings(')).toMatch('scopeStep(a,0,new JSONArray());');
    const step = method(bridge, 'private void scopeStep(Answer a,int index,JSONArray scopes)');
    expect(step).toMatch('if(index>=ScopeSettings.IDS.length){savedSounds(a,scopes);return;}');
    expect(step).toMatch('new TdApi.GetScopeNotificationSettings(scope)');
    expect(step.match(/new TdApi\./g)!.length).toBe(1);
    expect(method(bridge, 'private void savedSounds(')).toMatch('new TdApi.GetSavedNotificationSounds()');
  });

  it('si la lista de sonidos falla, los ajustes ya leídos se responden igual', () => {
    const body = method(bridge, 'private void savedSounds(');
    expect(body).toMatch('a.ok(object("scopes",scopes,"sounds",new JSONArray()));');
    expect(body).toMatch('a.owner!=session.selfId');
    expect(body).toMatch('La cuenta cambió. Vuelve a abrir los ajustes.');
  });

  it('guardar siempre parte de la lectura de Telegram y solo pide sonidos si cambian', () => {
    const body = method(bridge, 'private void saveScopeSettings(');
    expect(body).toMatch('BridgePolicy.id(p,"accountId")!=session.selfId){a.ok(false);return;}');
    expect(body).toMatch('if(scope==null){a.fail("Ese tipo de chat no corresponde a ninguno de los ajustes de Telegram.");return;}');
    expect(body).toMatch('if(patch==null||patch.length()==0){a.fail("No hay ningún ajuste que cambiar.");return;}');
    expect(body).toMatch('perform(new TdApi.GetScopeNotificationSettings(scope),a,current->{');
    expect(body).toMatch('if(patch.has("sound")||patch.has("storySound"))session.perform(new TdApi.GetSavedNotificationSounds()');
    expect(body).toMatch('else prepareScope(a,scope,patch,current,new JSONArray());');
    expect(body).not.toMatch('SetScopeNotificationSettings');
  });

  it('confirma, relee, comprueba que nadie cambió el ajuste y entonces escribe', () => {
    const body = method(bridge, 'private void prepareScope(');
    expect(body).toMatch('next=ScopeSettings.merge(current,patch,ScopeSettings.allowed(sounds));');
    // El diálogo nombra el sonido con el título que Telegram dio, no con un id suelto.
    expect(body).toMatch('changes=ScopeSettings.changes(current,next,sounds);');
    expect(body).toMatch('if(changes.length()==0){a.fail("No hay ningún ajuste que cambiar.");return;}');
    expect(body).toMatch('final TdApi.ScopeNotificationSettings before=ScopeSettings.copy(current);');
    expect(body).toMatch('if(!ScopeSettings.sameAsRead(before,latest)){a.fail("El ajuste cambió en otro dispositivo. Vuelve a abrir los ajustes de notificación.");return;}');
    expect(body).toMatch('perform(new TdApi.SetScopeNotificationSettings(scope,next),a,ignored->{');
    expect(body).toMatch('schedule();');
    expect(body).toMatch('perform(new TdApi.GetScopeNotificationSettings(scope),a,updated->respondScope(a,scope,updated));');
    // SetScopeNotificationSettings es la única escritura de toda la ronda.
    expect(body.match(/new TdApi\.Set\w+/g)).toEqual(['new TdApi.SetScopeNotificationSettings']);
    expect(method(pure, 'static boolean sameAsRead(TdApi.ScopeNotificationSettings a, TdApi.ScopeNotificationSettings b)'))
      .toMatch('a.useDefaultMuteStories == b.useDefaultMuteStories');
  });

  it('el diálogo cancela sin escribir y vuelve a mirar la cuenta antes de aceptar', () => {
    const body = method(bridge, 'private void confirmScope(');
    expect(body).toMatch('setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(body).toMatch('setOnCancelListener(d->a.ok(false))');
    expect(body).toMatch('if(destroyed||!currentAccount()||a.owner!=session.selfId){a.fail("La cuenta cambió. No se modificó ningún ajuste.");return;}');
    expect(body).toMatch('"En "+ScopeSettings.phrase(ScopeSettings.idOf(scope))+" cambiará: "');
    expect(body).toMatch('los de cada chat concreto no se modifican.');
    expect(body).toMatch('String caveat=ScopeSettings.storyCaveat(next);');
  });

  it('los dos métodos están permitidos y despachados', () => {
    expect(policy).toMatch('"notify.scopes","notify.scope.save"');
    expect(bridge).toMatch('case "notify.scopes":scopeSettings(p,a);break;');
    expect(bridge).toMatch('case "notify.scope.save":saveScopeSettings(p,a);break;');
  });

  it('confirmar un ajuste espera a la persona, como el resto de los diálogos nativos', () => {
    const literal = bridgeUi.split('const USER_DRIVEN = new Set([')[1].split(']);')[0];
    expect(literal).toMatch("'notify.scope.save'");
    // Ronda H abrió el mismo hueco: descartar un aviso también muestra un diálogo.
    expect(literal).toMatch("'chat.safety.dismiss'");
  });

  it('la pantalla no rellena lo que Telegram no devolvió', () => {
    expect(panel).toMatch("request<NotificationScopes>('notify.scopes', { accountId: owner.current })");
    expect(panel).toMatch('if (!result || !Array.isArray(result.scopes) || !result.scopes.length) throw new Error(');
    expect(panel).toMatch('const absent = missingScopes(result);');
    expect(panel).toMatch('Telegram no devolvió los ajustes de');
    expect(panel).toMatch('no se rellenan con valores de WRGram.');
    expect(panel).not.toMatch(/settings\.\w+ \?\? (true|false)/);
    expect(panel).not.toMatch(/scopes\[id\] \?\?/);
  });

  it('cada control tiene su opción neutra: mantener no es un valor por defecto', () => {
    expect(panel.match(/keepOption\(/g)!.length).toBe(3);
    expect(panel).toMatch("if (event.target.value === 'keep') { onKeep('muteFor'); onKeep('muted'); return; }");
    expect(panel).toMatch("onKeep={key => { setNotice(''); setPatches(current => ({ ...current, [id]: unset(current[id] ?? emptyPatch(), key) })); }}");
    expect(panel).toMatch('keepOption(muteKeepLabel(settings.muteFor))');
    expect(panel).not.toMatch(/restantes` : 'sin silencio'/);
    expect(panel).toMatch('const changes = pendingChanges(settings, patch, sounds);');
    expect(panel).toMatch('<option value={DEFAULT_SOUND}>{t(\'El sonido de la aplicación\')}</option>');
    expect(panel).toMatch('<option value={SILENT_SOUND}>{t(\'Sin sonido\')}</option>');
    expect(panel).toMatch('sounds.map(item => <option key={item.id} value={item.id}>');
  });

  it('historias: si Telegram decide por su cuenta, el control se bloquea y se dice por qué', () => {
    expect(panel).toMatch('const caveat = storyCaveat(settings);');
    expect(panel).toMatch('disabled={working || settings.storyDefault}');
    expect(panel).toMatch('{caveat ? <p className="settings-note settings-warn">{t(caveat)}</p> : <>');
    expect(panel).toMatch('Avisar aparte los mensajes fijados');
    expect(panel).toMatch('Avisar aparte cuando te mencionan');
  });

  it('una escritura por alcance y el estado solo cambia con lo que responde Telegram', () => {
    expect(panel).toMatch("request<ScopeSettings | false>('notify.scope.save', { scope: scope.scope, patch, accountId: owner.current })");
    expect(panel).toMatch("if (applied === false) { setNotice('Cancelado. En Telegram no ha cambiado ningún ajuste.'); return; }");
    expect(panel).toMatch('applied.scope !== scope.scope');
    expect(panel).toMatch('item.scope === applied.scope ? applied : item');
    expect(panel).toMatch('[applied.scope]: emptyPatch()');
    expect(panel).toMatch('if (snapshot().selfId !== owner.current)');
    expect(panel.match(/await request</g)!.length).toBe(2);
    expect(panel).toMatch('if (working || busy) return;');
  });

  it('refrescar no tira los cambios sin guardar y deja de escribir mientras llega la lectura', () => {
    // `setPatches({})` en la lectura habría borrado el borrador de las tres tarjetas al pulsar Actualizar.
    expect(panel).not.toMatch('setPatches({})');
    expect(panel).toMatch('const first = busy && !data;');
    expect(panel).toMatch('working={working === id || busy}');
    expect(panel).toMatch('onClick={() => void load()}');
  });

  it('Ajustes solo ofrece el panel donde hay transporte, y lo abre sin tocar nada', () => {
    expect(page).toMatch('[scopes,setScopes]=useState(false)');
    // Sin puente nativo no hay transporte; la maqueta de desarrollo sí puede abrir el panel.
    expect(page).toMatch('{!native&&!import.meta.env.DEV?<p className="settings-note settings-unavailable">');
    expect(page).toMatch('onClick={()=>setScopes(true)}');
    expect(page).toMatch('{scopes&&<NotificationScopesPanel close={()=>setScopes(false)}/>}');
    expect(page).toMatch('no tiene transporte para leerlos ni escribirlos');
    expect(page).toMatch('cada guardado se confirma antes de escribir en Telegram');
  });

  it('la maqueta enseña los tres estados reales de Telegram y obedece al puente', () => {
    expect(preview).toMatch("muted: false, muteFor: 0, sound: '-1'");
    expect(preview).toMatch("muted: true, muteFor: 28_800, sound: '777'");
    expect(preview).toMatch("muted: true, muteFor: INDEFINITE, sound: '0', preview: false, muteStories: true, storyDefault: true");
    expect(preview).toMatch("if (String(params.accountId ?? '') !== state.selfId) return false");
    expect(preview).toMatch('if (!pendingChanges(current, patch, savedSounds).length) throw new Error(\'No hay ningún ajuste que cambiar.\')');
    expect(preview).toMatch('const next = effective(current, patch);');
    expect(preview).toMatch('return { scopes: Object.values(scopeFixtures).map(item => ({ ...item })), sounds: savedSounds.map(sound => ({ ...sound })) };');
  });
});

describe('el modelo de ajustes refleja la fusión de Java, sin valores propios', () => {
  const pure = java('ScopeSettings');

  it('las teclas que viajan son exactamente las que admite el puente', () => {
    const body = method(pure, 'static boolean known(String key)');
    const keys = [...body.matchAll(/"([a-zA-Z]+)"\.equals\(key\)/g)].map(match => match[1]);
    expect([...keys].sort()).toEqual([...PATCH_KEYS].sort());
    // `storyDefault` es de Telegram: la interfaz no puede escribirlo.
    expect(PATCH_KEYS).not.toContain('storyDefault');
    expect(keys).not.toContain('useDefaultMuteStories');
  });

  it('las bandas de silencio se leen como las escribe el nativo', () => {
    expect(span(0)).toBe('sin silencio');
    expect(span(-5)).toBe('sin silencio');
    expect(span(30)).toBe('unos segundos');
    expect(span(600)).toBe('10 min');
    expect(span(3_600)).toBe('1 h');
    expect(span(28_800)).toBe('8 h');
    expect(span(172_800)).toBe('2 días');
    expect(span(86_400)).toBe('1 día');
    expect(span(2_592_000)).toBe('1 mes');
    expect(span(90 * 86_400)).toBe('3 meses');
    expect(span(INDEFINITE)).toBe('indefinido');
    expect(INDEFINITE).toBe(2_147_483_647);
    expect(pure).toMatch('static final int MAX_MUTE = Integer.MAX_VALUE');
  });

  it('un id de sonido se describe con lo que se sabe de él', () => {
    const saved = [sound('777', 'Tinta'), sound('888', '')];
    expect(soundLabel(DEFAULT_SOUND, saved)).toBe('el sonido de la aplicación');
    expect(soundLabel(SILENT_SOUND, saved)).toBe('sin sonido');
    expect(soundLabel('777', saved)).toBe('«Tinta»');
    expect(soundLabel('888', saved)).toBe('un sonido guardado');
    expect(soundLabel('999', saved)).toBe('un sonido guardado en Telegram');
    expect(soundLabel('', saved)).toBe('sin confirmar');
    expect(soundLabel(undefined, saved)).toBe('sin confirmar');
    expect(knownSound('777', saved)).toBe(true);
    expect(knownSound('999', saved)).toBe(false);
    expect(knownSound(DEFAULT_SOUND, [])).toBe(true);
    expect(keepOption('8 h')).toBe('Mantener: 8 h');
  });

  it('el borrador nunca toca lo que no se editó y el silencio arrastra su estado', () => {
    const base = settings({ muteFor: 28_800, muted: true, sound: '777', storyDefault: true });
    expect(effective(base, {})).toEqual(base);
    expect(effective(base, { muteFor: 0 })).toEqual({ ...base, muteFor: 0, muted: false });
    expect(effective(base, { muted: true })).toEqual({ ...base, muted: true, muteFor: INDEFINITE });
    expect(effective(base, { muted: false })).toEqual({ ...base, muted: false, muteFor: 0 });
    expect(effective(base, { preview: false }).storyDefault).toBe(true);
    expect(effective(base, { quietMentions: false }).sound).toBe('777');
  });

  it('sin diferencia no hay cambios, y cada diferencia se nombra una vez', () => {
    expect(pendingChanges(settings(), {})).toEqual([]);
    expect(pendingChanges(settings({ muteFor: 3_600, muted: true }), { muteFor: 3_600, muted: true })).toEqual([]);
    expect(pendingChanges(settings(), { muteFor: 28_800 })).toEqual(['silencio: 8 h']);
    expect(pendingChanges(settings({ muteFor: 3_600, muted: true }), { muteFor: 172_800 })).toEqual(['silencio: 1 h → 2 días']);
    expect(pendingChanges(settings({ muteFor: 3_600, muted: true }), { muteFor: 0 })).toEqual(['sin silencio']);
    expect(pendingChanges(settings(), { sound: SILENT_SOUND })).toEqual(['sonido: sin sonido']);
    // Con la lista a la vista el cambio se nombra como lo conoce la persona.
    expect(pendingChanges(settings(), { sound: '888' }, [sound('888', 'Burbuja')])).toEqual(['sonido: «Burbuja»']);
    expect(pendingChanges(settings(), { storySound: '888' }, [sound('888', 'Burbuja')])).toEqual(['sonido de historias: «Burbuja»']);
    expect(pendingChanges(settings(), { sound: '888' })).toEqual(['sonido: un sonido guardado en Telegram']);
    expect(pendingChanges(settings(), { preview: false, quietPinned: true, quietMentions: true, muteStories: true, storyPoster: false }))
      .toEqual(['ocultar el contenido en el aviso', 'historias silenciadas', 'ocultar quién publica la historia', 'los mensajes fijados avisarán como cualquiera', 'las menciones avisarán como cualquier mensaje']);
  });

  it('el formulario rechaza lo mismo que rechaza el puente', () => {
    const saved = [sound('777', 'Tinta')];
    expect(patchProblem({}, saved)).toBe('');
    expect(patchProblem({ muteFor: 28_800 }, saved)).toBe('');
    expect(patchProblem({ muteFor: INDEFINITE }, saved)).toBe('');
    expect(patchProblem({ muteFor: -1 }, saved)).toBe('La duración del silencio no es válida.');
    expect(patchProblem({ muteFor: 1.5 }, saved)).toBe('La duración del silencio no es válida.');
    expect(patchProblem({ muteFor: INDEFINITE + 1 }, saved)).toBe('La duración del silencio no es válida.');
    expect(patchProblem({ muted: false, muteFor: 3_600 }, saved)).toBe('El silencio y su duración no coinciden.');
    expect(patchProblem({ sound: '777' }, saved)).toBe('');
    expect(patchProblem({ storySound: '999' }, saved)).toBe('Ese sonido no está entre los que Telegram guarda en esta cuenta.');
    expect(patchProblem({ sound: 'abc' }, saved)).toBe('El identificador del sonido de los mensajes no es válido.');
    expect(patchProblem({ storySound: 'abc' }, saved)).toBe('El identificador del sonido de las historias no es válido.');
    expect(patchProblem({ preview: 'sí' as unknown as boolean }, saved)).toBe('Alguno de los ajustes de notificación solo admite un sí o un no.');
    // Los mismos textos que devuelve el puente: la pantalla no puede prometer otra redacción.
    expect(pure).toMatch('throw new IllegalArgumentException("Alguno de los ajustes de notificación solo admite un sí o un no.");');
    expect(pure).toMatch('"El identificador del " + what + " no es válido."');
    expect(pure).toMatch('sound(patch.opt("sound"), ids, "sonido de los mensajes")');
    for (const choice of MUTE_CHOICES) expect(patchProblem({ muteFor: choice.seconds }, [])).toBe('');
    expect(MUTE_CHOICES[MUTE_CHOICES.length - 1].seconds).toBe(INDEFINITE);
  });

  it('con la lista de sonidos sin llegar no se afirma nada: lo decide el nativo', () => {
    expect(patchProblem({ sound: '999' }, [])).toBe('');
    expect(patchProblem({ sound: '999' }, [sound('777')])).toBe('Ese sonido no está entre los que Telegram guarda en esta cuenta.');
  });

  it('mientras Telegram maneje las historias, el aviso acompaña al control', () => {
    expect(storyCaveat(settings({ storyDefault: true }))).toContain('no se aplicará');
    expect(storyCaveat(settings({ storyDefault: false }))).toBe('');
  });

  it('ningún alcance inventado llega a la pantalla y ninguno se duplica', () => {
    const data = { scopes: [settings({ scope: 'group' }), settings({ scope: 'group', muteFor: 60 }), settings({ scope: 'basic' as ScopeSettings['scope'] }), settings()], sounds: [sound('777', 'Tinta')] } as unknown as NotificationScopes;
    const map = scopeMap(data);
    expect(Object.keys(map.scopes)).toEqual(['group', 'private']);
    expect(map.scopes.private.muteFor).toBe(0);
    expect(map.sounds).toHaveLength(1);
    expect(scopeMap(undefined).scopes).toEqual({});
    expect(scopeMap({ scopes: [], sounds: [] } as unknown as NotificationScopes).sounds).toEqual([]);
    expect(missingScopes(data)).toEqual(['channel']);
    expect(missingScopes({ scopes: SCOPE_IDS.map(id => settings({ scope: id })), sounds: [] })).toEqual([]);
    expect(missingScopes(undefined)).toEqual(SCOPE_IDS);
    expect(SCOPE_IDS).toEqual(['private', 'group', 'channel']);
    expect(SCOPE_TITLES.channel).toBe('Canales');
  });

  it('quitar una clave del borrador es devolverla a «no tocar»', () => {
    const patch: ScopePatch = { muteFor: 3_600, muted: true, preview: false };
    expect(unset(patch, 'muted')).toEqual({ muteFor: 3_600, preview: false });
    expect(patch).toEqual({ muteFor: 3_600, muted: true, preview: false });
    expect(pendingChanges(settings({ muteFor: 3_600, muted: true }), unset(unset({ muteFor: 3_600, muted: true }, 'muteFor'), 'muted'))).toEqual([]);
  });

  it('el resumen de cabecera solo dice lo que Telegram devolvió', () => {
    expect(summaryOf(settings(), [])).toBe('con aviso · sonido el de la aplicación · contenido visible · historias con aviso');
    expect(summaryOf(settings({ muteFor: 28_800, muted: true, sound: '777', preview: false, quietMentions: true, storyDefault: true }), [sound('777', 'Tinta')]))
      .toBe('silenciado 8 h · sonido «Tinta» · contenido oculto · menciones sin aviso aparte · historias: decide Telegram');
    expect(summaryOf(settings({ sound: '999' }), [])).toBe('con aviso · un sonido de Telegram · contenido visible · historias con aviso');
    expect(summaryOf(settings({ sound: '888' }), [sound('888', '')])).toBe('con aviso · sonido guardado · contenido visible · historias con aviso');
    // «indefinido restantes» se vio en pantalla: un silencio sin reloj no cuenta nada.
    expect(muteKeepLabel(0)).toBe('sin silencio');
    expect(muteKeepLabel(28_800)).toBe('8 h restantes');
    expect(muteKeepLabel(INDEFINITE)).toBe('indefinido');
    expect(muteKeepLabel(172_800)).toBe('2 días restantes');
  });
});
