import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_APPS } from './builtInApps';
import { readTgs } from './tgs';
const native=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BuiltInApps.java',import.meta.url),'utf8');
describe('renderizado seguro de stickers TGS',()=>{
  it('descomprime animaciones válidas y bloquea referencias externas y cargas excesivas',async()=>{const valid=gzipSync(JSON.stringify({v:'5.5.7',fr:30,ip:0,op:60,w:512,h:512,layers:[],assets:[]}));await expect(readTgs(new Uint8Array(valid))).resolves.toMatchObject({w:512,h:512,fr:30});const external=gzipSync(JSON.stringify({fr:30,ip:0,op:60,w:512,h:512,layers:[],assets:[{p:'https://example.invalid/x.png',u:'https://example.invalid/'}]}));await expect(readTgs(new Uint8Array(external))).rejects.toThrow('External sticker assets are blocked');await expect(readTgs(new Uint8Array(2*1024*1024+1))).rejects.toThrow('safe compressed-size limit');});
});
describe('catálogo beta de apps propias',()=>{
  it('incluye por defecto exactamente las seis identidades del propietario',()=>{expect(BUILT_IN_APPS.map(app=>app.username)).toEqual(['GroupButlerEsp_bot','antiubot','anycompressorbot','WRShorten_bot','mutidlprobot','Wrsnakebot']);expect(new Set(BUILT_IN_APPS.map(app=>app.id)).size).toBe(6);});
  it('coincide con la lista nativa cerrada sin URLs ni tokens',()=>{for(const app of BUILT_IN_APPS){expect(native).toContain(`"${app.id}"`);expect(native).toContain(`"${app.username}"`);expect(app).not.toHaveProperty('token');expect(app).not.toHaveProperty('url');}});
  it('no añade permisos administrativos ni monetización al catálogo',()=>{for(const app of BUILT_IN_APPS){expect(app).not.toHaveProperty('premium');expect(app).not.toHaveProperty('permissions');expect(app).not.toHaveProperty('autoStart');}});
  it('integra la autodeclaración en el shell nuevo antes de mostrar la autenticación',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const gate=readFileSync(new URL('./AgeGate.tsx',import.meta.url),'utf8');expect(app).toContain('native&&!state.access.allowed');expect(app).toContain('<AgeGate state={state}');expect(gate).toContain("request<Country[]>('access.countries')");expect(gate).toContain("request('access.declare'");expect(gate).toContain("wrgram:clear-sensitive");expect(gate).not.toMatch(/localStorage|sessionStorage|fetch\(/);});
  it('presenta el inicio QR en la autenticación nueva sin persistir el enlace',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const qr=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/QrCodeImage.java',import.meta.url),'utf8');expect(app).toContain("state.auth==='qr'");expect(app).toContain("run('authenticate.qr')");expect(snapshot).toContain('QrCodeImage.dataUri');expect(snapshot).not.toContain('put(\"qrLink\"');expect(qr).toContain('data:image/png;base64,');});
  it('conserva el límite de edad en la UI empaquetada sin llamar a TDLib',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const gate=readFileSync(new URL('./AgeGate.tsx',import.meta.url),'utf8');expect(app).toContain('native&&!state.access.checked');expect(app).toContain('native&&!state.access.allowed');expect(gate).toContain("request('access.declare'");expect(gate).toContain('18 años en la UE, Reino Unido y Australia');});
  it('pinta teclado inline y teclado de respuesta en chats reales',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const keyboard=readFileSync(new URL('./BotKeyboard.tsx',import.meta.url),'utf8');const native=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');expect(app).toContain('message.inlineKeyboard&&<BotKeyboard');expect(app).toContain('state.botKeyboard&&<BotKeyboard');expect(keyboard).toContain("'bot.button'");expect(native).toContain('ReplyMarkupInlineKeyboard');expect(native).toContain('ReplyMarkupShowKeyboard');expect(native).toContain('inlineKeyboard');});
  it('envía las acciones del teclado y cierra Mini Apps mediante TDLib sin exponer datos al bridge',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const mini=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');expect(policy).toContain('"bot.button"');expect(bridge).toContain('GetCallbackQueryAnswer');expect(bridge).toContain('OpenWebApp');expect(bridge).toContain('GetWebAppUrl');expect(bridge).toContain('GetUserFullInfo(bot)');expect(bridge).toContain('openLinkOrTelegram(((TdApi.InlineKeyboardButtonTypeUrl)button.type).url,answer)');expect(mini).toContain('new org.drinkless.tdlib.TdApi.CloseWebApp(launch.webAppLaunchId())');expect(mini).toContain('new org.drinkless.tdlib.TdApi.SendWebAppData');expect(mini).toContain('confirmKeyboardData');});
  it('incluye cambio a inline mode, login URL y callback con verificación explícita',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const keyboard=readFileSync(new URL('./BotKeyboard.tsx',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');expect(bridge).toContain('GetInlineQueryResults');expect(bridge).toContain('SendInlineQueryResultMessage');expect(bridge).toContain('GetLoginUrlInfo');expect(bridge).toContain('GetLoginUrl(');expect(bridge).toContain('CallbackQueryPayloadDataWithPassword');expect(keyboard).toContain('bot.inline.more');expect(keyboard).toContain('bot.inline.send');expect(snapshot).toContain('InlineKeyboardButtonTypeSwitchInline');expect(snapshot).toContain('InlineKeyboardButtonTypeLoginUrl');});
   it('resuelve destinos internos inline a chats públicos, bots, mensajes e historias y confirma antes de consultar',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');expect(snapshot).toContain('TargetChatInternalLink');expect(snapshot).toContain('InternalLinkTypePublicChat');expect(bridge).toContain('resolveInlineInternalLink');expect(bridge).toContain('currentInternalSwitch');expect(bridge).toContain('sameInternalLink');expect(bridge).toContain('TdApi.InternalLinkTypeBotStart');expect(bridge).toContain('new TdApi.GetMessageLinkInfo(url)');expect(bridge).toContain('TdApi.InternalLinkTypeStory');expect(bridge).toContain('TdApi.InternalLinkTypeLiveStory');expect(bridge).toContain('El botón o la conversación cambió');expect(bridge).toContain('no se enviará nada hasta que elijas un resultado');});
  it('conserva resultados inline nativos tras seleccionar un resultado y no los reenvía',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');expect(bridge).toContain('SendInlineQueryResultMessage');expect(bridge).toContain('inlineBatches.remove(token);perform(');expect(bridge).toContain('TargetChatCurrent');expect(bridge).not.toContain('put("resultId"');});
   it('mantiene el último archivo TDLib y soporta contenido multimedia con rangos HTTP',()=>{const store=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeMediaStore.java',import.meta.url),'utf8');const session=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java',import.meta.url),'utf8');const activity=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java',import.meta.url),'utf8');const ui=readFileSync(new URL('./MediaView.tsx',import.meta.url),'utf8');expect(session).toContain('updateFile(((TdApi.UpdateFile) object).file)');expect(session).toContain('preferLocalFile(file.local,cached.local)');expect(store).toContain('Content-Range');expect(store).toContain('Partial Content');expect(store).toContain('TELEGRAM_FILE_LIMIT=4096L*MB');expect(activity).toContain('request.getRequestHeaders()');expect(ui).toContain('state.mediaLoading');expect(ui).toContain('state.mediaFailed');expect(ui).toContain('media.downloadLimit');});
   it('espera a abrir el chat y separa los fallos opcionales de anuncios del historial',()=>{const session=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');expect(session).toContain('fetchSponsoredMessages(id,0,generation)');expect(session).toContain('retrySponsoredMessages()');expect(session).not.toContain('No se pudieron consultar los mensajes patrocinados de Telegram. Reabre el chat');expect(app).toContain("run('sponsored.retry')");expect(policy).toContain('"sponsored.retry"');});
   it('anuncia actualizaciones consultadas a Play y enlaza a sus notas oficiales',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const settings=readFileSync(new URL('./SettingsPage.tsx',import.meta.url),'utf8');const controller=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/PlayUpdateController.java',import.meta.url),'utf8');const build=readFileSync(new URL('../../mobile/android/app/build.gradle',import.meta.url),'utf8');expect(app).toContain('state.update?.available');expect(app).toContain("act('updates.open')");expect(settings).toContain("run('updates.check')");expect(controller).toContain('AppUpdateManagerFactory.create');expect(controller).toContain('getAppUpdateInfo');expect(controller).toContain('store/apps/details?id=cc.webrom.wrgram');expect(build).toContain('com.google.android.play:app-update:2.1.0');expect(controller).not.toMatch(/fetch\(|HttpURLConnection|OkHttpClient/);});
  it('pide confirmación separada para compartir teléfono, ubicación y encuestas',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const manifest=readFileSync(new URL('../../mobile/android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');expect(bridge).toContain('setTitle("Compartir teléfono con el bot")');expect(bridge).toContain('setPositiveButton("Compartir"');expect(bridge).toContain('requestBotLocationPermission()');expect(bridge).toContain('setTitle("Confirmar ubicación")');expect(bridge).toContain('setPositiveButton("Enviar ubicación"');expect(bridge).toContain('setPositiveButton("Crear y enviar"');expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');});
  it('comparte usuarios o chats solicitados por botones solo tras selección y confirmación',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');expect(snapshot).toContain('KeyboardButtonTypeRequestUsers');expect(snapshot).toContain('KeyboardButtonTypeRequestChat');expect(bridge).toContain('ShareUsersWithBot(source,button.id,ids,true)');expect(bridge).toContain('ShareUsersWithBot(source,button.id,ids,false)');expect(bridge).toContain('ShareChatWithBot(source,button.id,selected.id,true)');expect(bridge).toContain('ShareChatWithBot(source,button.id,selected.id,false)');expect(bridge).toContain('botIsMember||button.userAdministratorRights!=null||button.botAdministratorRights!=null');});
   it('agrupa los ajustes disponibles al estilo TGX y aplica el tamaño real del texto desde Ajustes',()=>{const settings=readFileSync(new URL('./SettingsPage.tsx',import.meta.url),'utf8');const appearance=readFileSync(new URL('./AppearanceSettings.tsx',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const menu=readFileSync(new URL('./UserMenu.tsx',import.meta.url),'utf8');const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');expect(settings).toContain('Notificaciones');expect(settings).toContain('Privacidad y seguridad');expect(settings).toContain('Datos y almacenamiento');expect(settings).not.toContain('CHATS Y MENSAJES');expect(settings).not.toContain("document.documentElement.style.setProperty('--font-size'");expect(menu).not.toContain('APARIENCIA');expect(menu).toContain('Ajustes y privacidad');expect(appearance).toContain('[14, 16, 18, 21]');expect(appearance).toContain("run('appearance', { font })");expect(appearance).toContain('Enorme');expect(app).toContain("root.style.setProperty('--font-size'");expect(bridge).toContain('edit.putInt("font",font)');});
   it('actualiza fotos de chat y limita/correlaciona las descargas de miniaturas',()=>{const session=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java',import.meta.url),'utf8');const store=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeMediaStore.java',import.meta.url),'utf8');const media=readFileSync(new URL('./MediaView.tsx',import.meta.url),'utf8');const queue=readFileSync(new URL('./mediaQueue.ts',import.meta.url),'utf8');expect(session).toContain('object instanceof TdApi.UpdateChatPhoto');expect(store).toContain('postDelayed');expect(store).toContain('Telegram no completó la descarga');expect(media).toContain('loadMedia(thumb.id)');expect(media).toContain('state.mediaReady?state.mediaReady.includes(id)');expect(media).toContain('pickImageVariant');expect(queue).toContain('running<4');expect(queue).toContain('snapshot().selfId===owner');});
    it('bloquea la app con autenticación del dispositivo sin guardar secretos',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const settings=readFileSync(new URL('./SettingsPage.tsx',import.meta.url),'utf8');const shell=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java',import.meta.url),'utf8');const screen=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AppLockScreen.java',import.meta.url),'utf8');const lock=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AppLock.java',import.meta.url),'utf8');const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');expect(settings).toContain('Bloqueo de la app');expect(settings).toContain("change('security.lock'");expect(screen).toContain('BiometricPrompt');expect(screen).toContain('createConfirmDeviceCredentialIntent');expect(shell).toContain('new AppLockScreen');expect(lock).toContain('isDeviceSecure');expect(lock).not.toMatch(/putString\(|getString\(/);expect(bridge).toContain('case "security.lock"');expect(policy).toContain('"security.lock"');expect(app).toContain('<SettingsPage');});
    it('integra ajustes rápidos en el menú de cuenta y deja un diagnóstico de medios local',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const menu=readFileSync(new URL('./UserMenu.tsx',import.meta.url),'utf8');const settings=readFileSync(new URL('./SettingsPage.tsx',import.meta.url),'utf8');const media=readFileSync(new URL('./MediaView.tsx',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');expect(app).toContain('<UserMenu');expect(app).not.toContain("['settings','Ajustes'");expect(app).toContain('mobile-account-avatar');expect(menu).toContain('Ajustes y privacidad');expect(menu).not.toContain('APARIENCIA');expect(settings).toContain('Apariencia');expect(settings).toContain('DIAGNÓSTICO');expect(settings).toContain("run<number>('media.retry')");expect(settings).toContain('Reintentar miniaturas');expect(media).toContain('eager?:boolean');expect(snapshot).toContain('ThumbnailFormatGif');expect(snapshot).toContain('ThumbnailFormatWebm');expect(policy).toContain('"media.retry"');});
    it('abre enlaces internos de Telegram dentro de la app y no delega en el cliente oficial',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const menu=readFileSync(new URL('./UserMenu.tsx',import.meta.url),'utf8');const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const shell=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java',import.meta.url),'utf8');const mini=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java',import.meta.url),'utf8');const links=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TelegramLinks.java',import.meta.url),'utf8');const manifest=readFileSync(new URL('../../mobile/android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');expect(app).toContain("run<TelegramLinkResult>('telegram.link'");expect(menu).toContain('Abrir enlace de Telegram');expect(bridge).toContain('GetInternalLinkType');expect(bridge).toContain('CheckChatInviteLink');expect(bridge).toContain('GetMessageLinkInfo');expect(bridge).toContain('SearchStickerSet');expect(bridge).toContain('No se abrirá Telegram oficial');expect(shell).toContain('onNewIntent');expect(shell).toContain('TelegramLinks.normalize');expect(mini).toContain('openWebLink');expect(mini).toContain('ShellActivity.class');expect(links).toContain('telegram.me');expect(manifest).toContain('android:scheme="tg"');expect(manifest).toContain('android:host="t.me"');});
   it('conecta el menú de cuenta a las opciones de perfil y sesiones reales de TDLib',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');expect(app).toContain('Abrir menú de usuario');expect(app).toContain('Editar nombre');expect(app).toContain('Editar biografía');expect(app).toContain('Editar nombre de usuario público');expect(app).toContain('Sesiones activas');expect(policy).toContain('account.session.revoke');expect(policy).toContain('account.username');expect(bridge).toContain('new TdApi.GetActiveSessions()');expect(bridge).toContain('new TdApi.TerminateSession(id)');expect(bridge).toContain('new TdApi.SetName(first,last)');expect(bridge).toContain('new TdApi.SetBio(bio)');expect(bridge).toContain('new TdApi.SetUsername(username)');});
   it('abre historias activas explícitamente, registra la vista y las cierra en TDLib',()=>{const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');expect(policy).toContain('"chat.stories"');expect(bridge).toContain('new TdApi.GetChatActiveStories(chat.id)');expect(bridge).toContain('new TdApi.GetStory(chatId,storyId,false)');expect(bridge).toContain('new TdApi.OpenStory(chatId,storyId)');expect(bridge).toContain('new TdApi.CloseStory(chatId,storyId)');expect(snapshot).toContain('JSONObject storyMedia(TdApi.Story story)');expect(app).toContain('Historias activas');expect(app).toContain("run<OpenStory>('story.open'");expect(app).toContain("run('story.close'");});
   it('mantiene el progreso y los errores de instalación in-app visibles y reanudables',()=>{const controller=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/PlayUpdateController.java',import.meta.url),'utf8');const shell=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');expect(controller).toContain('bytesDownloaded=state.bytesDownloaded()');expect(controller).toContain('void result(int resultCode)');expect(controller).toContain('resumeAllowed=false');expect(controller).toContain('if(resumeAllowed&&info.updateAvailability()');expect(controller).toContain('DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS');expect(shell).toContain('updateController.result(result.getResultCode())');expect(app).toContain('update-status-banner');expect(app).toContain('update.downloaded?\'updates.complete\':\'updates.start\'');});
   it('edita la foto propia con recorte, confirmación y privacidad conservada',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const shell=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');expect(bridge).toContain('new TdApi.SetProfilePhoto(new TdApi.InputChatPhotoStatic');expect(bridge).toContain(')),false)');expect(bridge).toContain('Confirmar foto de perfil');expect(bridge).toContain('20 MB');expect(snapshot).toContain('"profilePhoto"');expect(shell).toContain('profilePhotoPicker.launch("image/*")');expect(app).toContain('Cambiar foto de perfil');});
   it('permite buscar contactos, crear grupos y editar permisos si TDLib lo autoriza',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');expect(bridge).toContain('new TdApi.GetContacts()');expect(bridge).toContain('new TdApi.SearchContacts(query,50)');expect(bridge).toContain('new TdApi.CreateNewBasicGroupChat');expect(bridge).toContain('contacts.containsAll(ids)');expect(bridge).toContain('new TdApi.SetChatPermissions(chat.id,value)');expect(bridge).toContain('rights.canRestrictMembers');expect(policy).toContain('"contacts.open"');expect(policy).toContain('"groups.permissions.set"');expect(app).toContain('ContactPicker');expect(app).toContain('Crear grupo de Telegram');expect(app).toContain('Permisos predeterminados');});
   it('restringe la moderación a administradores con permiso y aplica ban o restricción con duración explícita',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');expect(bridge).toContain('rights.canRestrictMembers');expect(bridge).toContain('supergroupMembersFilter(filterKey)');expect(bridge).toContain('new TdApi.ChatMemberStatusBanned(until)');expect(bridge).toContain('new TdApi.ChatMemberStatusRestricted(true,until');expect(bridge).toContain('banDurationLabel');expect(bridge).toContain('target.status instanceof TdApi.ChatMemberStatusMember');});
   it('solo inicia pagos de factura Stars tras revisar el formulario y confirmar el cargo',()=>{const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const content=readFileSync(new URL('./MessageContent.tsx',import.meta.url),'utf8');expect(bridge).toContain('"XTR".equals(invoice.currency)');expect(bridge).toContain('form.type instanceof TdApi.PaymentFormTypeStars');expect(bridge).toContain('TdApi.PaymentFormTypeStarSubscription');expect(bridge).toContain('new TdApi.SendPaymentForm');expect(bridge).toContain('setTitle(payment.subscription?"Confirmar suscripción con Telegram Stars":"Confirmar pago con Telegram Stars")');expect(bridge).toContain('Suscripción: Telegram renovará');expect(bridge).toContain('null,0)');expect(snapshot).toContain('"eligible","XTR".equals(invoice.currency)');expect(content).toContain('Revisar pago con Stars');});
   it('renderiza stickers TGS localmente con límites y sin assets externos',()=>{const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');const media=readFileSync(new URL('./TgsSticker.tsx',import.meta.url),'utf8');const parser=readFileSync(new URL('./tgs.ts',import.meta.url),'utf8');const view=readFileSync(new URL('./MediaView.tsx',import.meta.url),'utf8');expect(snapshot).toContain('application/x-tgsticker');expect(parser).toContain('new DecompressionStream(\'gzip\')');expect(parser).toContain('External sticker assets are blocked');expect(media).toContain('lottie.loadAnimation');expect(view).toContain('<TgsSticker');});
   it('soporta write access, teléfono, ubicación, clipboard y DeviceStorage en Mini Apps con controles',()=>{const mini=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java',import.meta.url),'utf8');expect(mini).toContain('TdApi.AllowBotToSendMessages');expect(mini).toContain('Compartir con el bot');expect(mini).toContain('Permitir ubicación a esta Mini App');expect(mini).toContain('location_checked');expect(mini).toContain('access_granted');expect(mini).toContain('GetAttachmentMenuBot');expect(mini).toContain('consumeUserGesture(10_000)');expect(mini).toContain('Leer portapapeles');expect(mini).toContain('web_app_device_storage_save_key');expect(mini).toContain('STORAGE_LIMIT_EXCEEDED');expect(mini).toContain('back_button_pressed');expect(mini).toContain('web_app_request_fullscreen');expect(mini).toContain('fullscreen_changed');expect(mini).toContain('web_app_lock_orientation');expect(mini).toContain('orientation_locked');expect(mini).toContain('invoice_closed');expect(mini).toContain('home_screen_checked');expect(mini).toContain('emoji_status_access_requested');expect(mini).not.toContain('InputMessageLocation');expect(mini).toContain('handlePermissionRequest(request)');expect(mini).toContain('Permitir cámara o micrófono');expect(mini).toContain('web_app_share_to_story');expect(mini).toContain('MiniAppShortcuts.put');expect(mini).toContain('ACTION_INLINE_QUERY');});
});
describe('lote de encuestas, voz, stickers, proxy y almacenamiento',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
  const snapshot=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');
  const shell=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java');
  const manifest=source('../../mobile/android/app/src/main/AndroidManifest.xml');
  const panels=source('./BatchPanels.tsx');
  const app=source('./App.tsx');
  const settings=source('./SettingsPage.tsx');
  const contract=source('./contract.ts');
  it('envía, vota, cierra y audita encuestas con TDLib sin inventar resultados',()=>{
    expect(bridge).toContain('new TdApi.InputMessagePoll');
    expect(bridge).toContain('new TdApi.InputPollTypeQuiz');
    expect(bridge).toContain('new TdApi.SetPollAnswer');
    expect(bridge).toContain('new TdApi.StopPoll');
    expect(bridge).toContain('new TdApi.GetPollVoters');
    expect(bridge).toContain('canSendPolls');
    expect(snapshot).toContain('TdApi.MessagePoll');
    expect(snapshot).toContain('pollRestriction');
    expect(snapshot).toContain('optionOrder');
    expect(contract).toContain('interface Poll');
    expect(contract).toContain('poll?:Poll');
    expect(panels).toContain("'poll.answer'");
    expect(panels).toContain("'poll.stop'");
    expect(panels).toContain("'poll.voters'");
    expect(app).toContain("'poll.send'");
    expect(app).toContain('<PollComposer');
    expect(source('./MessageContent.tsx')).toContain('<PollCard');
  });
  it('comparte contactos y ubicación con confirmación y sin delegar en el cliente oficial',()=>{
    expect(bridge).toContain('new TdApi.InputMessageContact');
    expect(bridge).toContain('new TdApi.InputMessageLocation');
    expect(bridge).toContain('canSendOtherMessages');
    expect(bridge).toContain('Telegram no comparte el número de teléfono');
    expect(bridge).toContain('setTitle("Confirmar ubicación")');
    expect(app).toContain("'share.contact'");
    expect(app).toContain("'share.location'");
    expect(app).toContain('<ShareContactPicker');
    expect(panels).toContain("'contacts.list'");
    expect(manifest).toContain('ACCESS_FINE_LOCATION');
  });
  it('graba notas de voz con permiso explícito, límite de un minuto y onda real',()=>{
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(shell).toContain('microphonePermission');
    expect(shell).toContain('requestVoicePermission');
    expect(bridge).toContain('voicePermissionResult');
    expect(bridge).toContain('new android.media.MediaRecorder');
    expect(bridge).toContain('>=60_000L');
    expect(bridge).toContain('new TdApi.InputMessageVoiceNote');
    expect(bridge).toContain('voiceWaveform');
    expect(bridge).toContain('cancelVoiceRecording');
    expect(app).toContain("'voice.start'");
    expect(app).toContain('<VoiceRecorder');
    expect(panels).toContain("'voice.finish'");
    expect(panels).toContain("'voice.cancel'");
  });
  it('avisa a la interfaz cuando la nota de voz se detiene sola al llegar al minuto',()=>{
    expect(bridge).toContain('voiceAutoStopped=true;stopVoiceRecorder();schedule();');
    expect(bridge).toContain('value.put("voiceAutoStopped",voiceAutoStopped)');
    expect(bridge).toContain('voiceAutoStopped=false;voiceLevels.clear();voiceOwner=session.selfId');
    expect(bridge).toContain('voiceFile=null;voiceAutoStopped=false;');
    expect(contract).toContain('voiceAutoStopped?: boolean');
    expect(app).toContain('autoStopped={state.voiceAutoStopped===true}');
    expect(panels).toContain("autoStopped?'voice-recorder stopped':'voice-recorder'");
    expect(panels).toContain('La grabación se detuvo sola al llegar a 1:00. Envíala o descártala.');
    expect(panels).toContain("if(autoStopped){setElapsed(60);return;}");
    expect(source('./batch.css')).toContain('.voice-recorder.stopped .voice-dot{background:var(--faint);animation:none}');
  });
  it('graba y envía videomensajes de hasta 60 segundos y 640 px',()=>{
    expect(bridge).toContain('new TdApi.InputMessageVideoNote');
    expect(bridge).toContain('MediaMetadataRetriever');
    expect(bridge).toContain('20L*1024*1024');
    expect(bridge).toContain('duration<1||duration>60');
    expect(bridge).toContain('Math.max(width,height)>640');
    expect(bridge).not.toContain('Recorta el vídeo a formato cuadrado');
    expect(bridge).toContain('canSendVideoNotes');
    expect(bridge).toContain('pickedVideoNote');
    expect(bridge).toContain('recordedVideoNote');
    expect(shell).toContain('videoNotePicker');
    expect(shell).toContain('chooseVideoNote');
    expect(shell).toContain('recordVideoNote');
    expect(shell).toContain('EXTRA_DURATION_LIMIT');
    expect(app).toContain("'attachment.videoNote'");
    expect(app).toContain("'attachment.videoNote.record'");
    expect(app).not.toContain("'switchCamera'");
  });
  it('administra packs de stickers oficiales sin descargar fuera de Telegram',()=>{
    expect(bridge).toContain('new TdApi.GetInstalledStickerSets(new TdApi.StickerTypeRegular())');
    expect(bridge).toContain('new TdApi.SearchStickerSet(name,false)');
    expect(bridge).toContain('new TdApi.ChangeStickerSet(id,installed,false)');
    expect(panels).toContain("'stickers.installed'");
    expect(panels).toContain("'stickers.search'");
    expect(panels).toContain("'stickers.install'");
    expect(settings).toContain('<StickerPacks');
  });
  it('configura proxies por TDLib sin devolver credenciales a la interfaz',()=>{
    expect(bridge).toContain('new TdApi.AddProxy');
    expect(bridge).toContain('new TdApi.EnableProxy');
    expect(bridge).toContain('new TdApi.DisableProxy()');
    expect(bridge).toContain('new TdApi.RemoveProxy');
    expect(bridge).toContain('new TdApi.PingProxy');
    expect(bridge).toContain('new TdApi.ProxyTypeSocks5');
    expect(bridge).toContain('new TdApi.ProxyTypeMtproto');
    expect(bridge).not.toContain('put("password"');
    expect(bridge).not.toContain('put("secret"');
    expect(panels).toContain("'proxy.list'");
    expect(panels).toContain("'proxy.ping'");
    expect(panels).toContain("'proxy.add'");
    expect(settings).toContain('<ProxySettings');
  });
  it('expone las operaciones de caché en los ajustes de Android',()=>{
    expect(bridge).toContain('new TdApi.GetStorageStatisticsFast');
    for(const method of ['storage.status','storage.details','storage.settings','storage.optimize']){
      expect(bridge).toContain(`case "${method}"`);
      expect(panels).toContain(`'${method}'`);
    }
    expect(settings).toContain('<StorageSettings');
  });
  it('actualiza la versión empaquetada y la agenda en segundo plano en la documentación visible',()=>{
    expect(contract).toContain("version: '1.0.0-beta20'");
    expect(contract).toContain('currentVersionCode:48');
    expect(settings).toContain('trabajo periódico de Android');
    expect(settings).not.toContain('no como servicio en segundo plano');
  });
  it('permite consultar bots inline desde el compositor y elegir un resultado',()=>{
    const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
    const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');
    const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');
    expect(app).toContain("'bot.inline.query'");
    expect(app).toContain('InlineQueryResults');
    expect(bridge).toContain('private void inlineQuery');
    expect(bridge).toContain('GetInlineQueryResults(botId');
    expect(policy).toContain('"bot.inline.query"');
  });
  it('permite acceso por correo, registro y recuperación de 2FA sin simular estados',()=>{
    const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
    const session=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java',import.meta.url),'utf8');
    const snapshot=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java',import.meta.url),'utf8');
    const bridge=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java',import.meta.url),'utf8');
    const policy=readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java',import.meta.url),'utf8');
    expect(session).toContain('new TdApi.SetAuthenticationEmailAddress(email)');
    expect(session).toContain('new TdApi.CheckAuthenticationEmailCode(code)');
    expect(session).toContain('new TdApi.RegisterUser(first, last, false)');
    expect(session).toContain('new TdApi.RequestAuthenticationPasswordRecovery()');
    expect(session).toContain('new TdApi.RecoverAuthenticationPassword(code.trim(), password');
    expect(snapshot).toContain('AuthorizationStateWaitEmailAddress?"email"');
    expect(snapshot).toContain('AuthorizationStateWaitEmailCode?"emailCode"');
    expect(snapshot).toContain('AuthorizationStateWaitRegistration?"registration"');
    for(const method of ['"auth.register"','"auth.recover.request"','"auth.recover.reset"','"auth.resend"'])expect(policy).toContain(method);
    expect(bridge).toContain('session.register(');
    expect(bridge).toContain('session.requestPasswordRecovery()');
    expect(bridge).toContain('session.resetPassword(');
    expect(app).toContain("state.auth==='emailCode'");
    expect(app).toContain("state.auth==='registration'");
    expect(app).toContain("run('auth.recover.reset'");
    expect(app).toContain("run('auth.register'");
    expect(app).toContain('authTerms');
  });
});

describe('programados, 2FA, privacidad, filtros, historias, estado emoji y reenvío',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
  const session=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
  const policy=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
  const app=source('./App.tsx');
  const settings=source('./SettingsPage.tsx');
  const contract=source('./contract.ts');
  it('gestiona mensajes programados con TDLib y permite enviarlos o cambiar su hora',()=>{
    expect(bridge).toContain('new TdApi.GetChatScheduledMessages(chat)');
    expect(bridge).toContain('new TdApi.EditMessageSchedulingState(chat,messageId,state)');
    expect(bridge).toContain('new TdApi.MessageSchedulingStateSendAtDate()');
    expect(bridge).toContain('new TdApi.DeleteMessages(chat,new long[]{messageId},true)');
    for(const method of ['"scheduled.list"','"scheduled.reschedule"','"scheduled.sendNow"','"scheduled.delete"'])expect(policy).toContain(method);
    expect(app).toContain("'scheduled.list'");
    expect(app).toContain("'scheduled.sendNow'");
    expect(app).toContain('Mensajes programados');
  });
  it('lee y cambia la contraseña de dos pasos sin guardar el secreto en la app',()=>{
    expect(bridge).toContain('new TdApi.GetPasswordState()');
    expect(bridge).toContain('new TdApi.SetPassword(current,next,hint,false,"")');
    expect(bridge).toContain('confirmRemove');
    for(const method of ['"password.state"','"password.set"'])expect(policy).toContain(method);
    expect(settings).toContain("'password.set'");
    expect(settings).toContain('no se guarda en WRGram');
    expect(bridge).not.toContain('put("password"');
    expect(contract).toContain('interface PasswordState');
  });
  it('aplica excepciones de privacidad por usuario con reglas reales de Telegram',()=>{
    expect(bridge).toContain('new TdApi.UserPrivacySettingRuleAllowUsers(');
    expect(bridge).toContain('new TdApi.UserPrivacySettingRuleRestrictUsers(');
    expect(bridge).toContain('"allowUsers"');
    expect(bridge).toContain('"restrictUsers"');
    expect(settings).toContain('Excepciones');
    expect(settings).toContain('200 excepciones');
    expect(contract).toContain('interface PrivacySetting');
  });
  it('filtra búsquedas por tipo de contenido y reaplica el filtro al paginar',()=>{
    for(const filter of ['SearchMessagesFilterPhoto','SearchMessagesFilterVideo','SearchMessagesFilterPhotoAndVideo','SearchMessagesFilterDocument','SearchMessagesFilterAudio','SearchMessagesFilterVoiceNote','SearchMessagesFilterVideoNote','SearchMessagesFilterAnimation','SearchMessagesFilterUrl','SearchMessagesFilterPoll','SearchMessagesFilterMention'])expect(bridge).toContain(`new TdApi.${filter}()`);
    expect(bridge).toContain('searchFilterKey');
    expect(bridge).toContain('mentions');
    expect(app).toContain('SEARCH_FILTERS');
    expect(app).toContain('searchFilter');
  });
  it('reacciona a historias y muestra interacciones solo cuando la API las ofrece',()=>{
    expect(bridge).toContain('new TdApi.GetStoryAvailableReactions(20)');
    expect(bridge).toContain('new TdApi.SetStoryReaction(');
    expect(bridge).toContain('new TdApi.GetStoryInteractions(');
    expect(bridge).toContain('ReactionTypeCustomEmoji');
    for(const method of ['"story.reactions"','"story.react"','"story.interactions"'])expect(policy).toContain(method);
    expect(app).toContain("'story.react'");
    expect(app).toContain('story-views');
    expect(contract).toContain('interface StoryInteractions');
  });
  it('permite elegir estado emoji Premium y caducidad',()=>{
    expect(bridge).toContain('new TdApi.GetDefaultEmojiStatuses()');
    expect(bridge).toContain('new TdApi.GetThemedEmojiStatuses()');
    expect(bridge).toContain('new TdApi.GetRecentEmojiStatuses()');
    expect(bridge).toContain('new TdApi.SetEmojiStatus(selected)');
    expect(bridge).toContain('new TdApi.EmojiStatusTypeCustomEmoji(');
    for(const method of ['"emojiStatus.state"','"emojiStatus.options"','"emojiStatus.set"'])expect(policy).toContain(method);
    expect(settings).toContain('Estado emoji');
    expect(contract).toContain('interface EmojiStatusState');
  });
  it('reenvía con copia, sin texto, silencioso y programado',()=>{
    expect(session).toContain('TdApi.MessageSendOptions options, boolean sendCopy, boolean removeCaption');
    expect(session).toContain('forward.sendCopy = sendCopy');
    expect(session).toContain('forward.removeCaption = removeCaption && sendCopy');
    expect(bridge).toContain('canBeCopied');
    expect(bridge).toContain('"copyContent"');
    expect(app).toContain('ForwardDialog');
    expect(app).toContain('Ocultar remitente');
    expect(app).toContain('Sin notificación');
    expect(contract).toContain('copyContent: boolean');
  });
});

describe('bloqueo de la app con autenticación del dispositivo',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const lock=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AppLock.java');
  const screen=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AppLockScreen.java');
  const shell=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java');
  const main=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MainActivity.java');
  const mini=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
  const policy=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
  const settings=source('./SettingsPage.tsx');
  const contract=source('./contract.ts');
  it('delega huella, rostro, PIN, patrón y contraseña en Android',()=>{
    expect(screen).toContain('BiometricManager.Authenticators.BIOMETRIC_WEAK');
    expect(screen).toContain('DEVICE_CREDENTIAL');
    expect(screen).toContain('setDeviceCredentialAllowed(true)');
    expect(screen).toContain('createConfirmDeviceCredentialIntent');
    expect(screen).toContain('app_lock_credentials');
    expect(lock).not.toContain('putString(');
    expect(lock).toContain('isDeviceSecure');
  });
  it('comparte el estado y aplica el retardo en segundo plano',()=>{
    expect(lock).toContain('private static boolean unlocked');
    expect(lock).toContain('SystemClock.elapsedRealtime()');
    expect(lock).toContain('static synchronized void activityStarted');
    expect(lock).toContain('static synchronized void activityStopped');
    expect(lock).toContain('lock_after');
    expect(shell).toContain('AppLock.activityStarted(this)');
    expect(shell).toContain('!lockScreen.authenticating()');
    expect(shell).toContain('lockScreen.show(true)');
    expect(lock).toContain('returning && !unlocked');
    expect(main).toContain('lockScreen.install(host)');
  });
  it('impide saltarse el bloqueo desde Mini Apps o la vista nativa',()=>{
    expect(mini).toContain('AppLock.activityStarted(this)');
    expect(mini).toContain('AppLock.enabled(this)&&!AppLock.isUnlocked()');
    expect(main).toContain('if(!AppLock.isUnlocked()){moveTaskToBack(true);return;}');
    expect(screen).toContain('interface Callback');
  });
  it('permite elegir el retardo y bloquear ahora sin secretos en la app',()=>{
    for(const method of ['"security.timeout"','"security.lockNow"'])expect(policy).toContain(method);
    expect(settings).toContain("'security.timeout'");
    expect(settings).toContain("'security.lockNow'");
    expect(settings).toContain('Bloquear ahora');
    expect(settings).toContain('WRGram no recibe ni guarda esos datos');
    expect(contract).toContain('lockAfter:number');
  });
});

describe('administración completa, álbumes de historias y eventos Mini App de beta19',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
  const policy=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
  const mini=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
  const app=source('./App.tsx');
  const contract=source('./contract.ts');
  const preview=source('./preview.ts');
  it('pagina, filtra y busca miembros con roles, restricciones y baneos de duración completa',()=>{
    expect(bridge).toContain('new TdApi.GetSupergroupMembers(supergroupId,supergroupMembersFilter(filterKey),offset,limit)');
    expect(bridge).toContain('new TdApi.SearchChatMembers(chat.id,query.trim(),limit,chatMembersFilter(filterKey))');
    expect(bridge).toContain('new TdApi.ChatMemberStatusRestricted(true,until');
    expect(bridge).toContain('new TdApi.ChatMemberStatusBanned(until)');
    expect(bridge).toContain('new TdApi.DeleteChatMessagesBySender(chat.id');
    expect(bridge).toContain('canBeEdited');
    for(const method of ['"groups.members.page"','"groups.member.ban"','"groups.member.restrict"','"groups.member.unban"','"groups.member.promote"'])expect(policy).toContain(method);
    expect(app).toContain("'groups.members.page'");
    expect(app).toContain('MemberSanctionDialog');
    expect(app).toContain('Borrar todos sus mensajes');
    expect(app).toContain('Editar permisos');
    expect(contract).toContain('interface GroupMemberPage');
    expect(contract).toContain('currentRights?:GroupAdminRights');
    expect(preview).toContain("method === 'groups.members.page'");
  });
  it('crea comunidades con descripción y ofrece nombre público al terminar',()=>{
    expect(app).toContain('description:description.trim()');
    expect(app).toContain('Configurar nombre público');
    expect(app).toContain('openChatUsername(result.id,title)');
  });
  it('administra álbumes de historias más allá de Archivo',()=>{
    for(const api of ['GetChatStoryAlbums','CreateStoryAlbum(saved.id,name,new int[0])','SetStoryAlbumName(saved.id,albumId,name)','DeleteStoryAlbum(saved.id,albumId)','AddStoryAlbumStories(saved.id,albumId,new int[]{storyId})','RemoveStoryAlbumStories(saved.id,albumId,new int[]{storyId})','ReorderStoryAlbums(saved.id,ids)','ReorderStoryAlbumStories(saved.id,albumId,ids)','GetStoryAlbumStories(saved.id,albumId,offset,50)'])expect(bridge).toContain(api);
    for(const method of ['"story.albums.list"','"story.albums.create"','"story.albums.rename"','"story.albums.delete"','"story.albums.order"','"story.albums.stories"','"story.albums.add"','"story.albums.remove"','"story.albums.story.order"'])expect(policy).toContain(method);
    expect(app).toContain("'story.albums.create'");
    expect(app).toContain("'story.albums.story.order'");
    expect(app).toContain('Guardar en álbum');
    expect(app).not.toContain("'story.archive.add'");
    expect(contract).toContain('interface StoryAlbum');
  });
  it('expone botón secundario, ajustes, área segura, escritura y estado emoji en Mini Apps',()=>{
    for(const event of ['web_app_setup_secondary_button','web_app_setup_settings_button','web_app_check_write_access','web_app_request_safe_area','web_app_set_emoji_status'])expect(mini).toContain(`case "${event}"`);
    expect(mini).toContain('new org.drinkless.tdlib.TdApi.ToggleBotCanManageEmojiStatus(launch.botUserId(),true)');
    expect(mini).toContain('new org.drinkless.tdlib.TdApi.SetEmojiStatus(status)');
    expect(mini).toContain('EmojiStatusTypeCustomEmoji(Long.parseLong(id))');
    expect(mini).toContain('emitSafeArea()');
    expect(mini).toContain('safe_area_changed');
    expect(mini).toContain('write_access_requested');
  });
});

describe('perfil público y biografía con entidades',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const menu=source('./UserMenu.tsx');
  const app=source('./App.tsx');
  const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
  const session=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
  const policy=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
  const formatting=source('./formatting.tsx');
  const preview=source('./preview.ts');
  it('quita la nota de datos de perfil y pinta la biografía propia con sus entidades',()=>{
    expect(menu).not.toContain('El móvil, la biografía y el cumpleaños');
    expect(menu).toContain('<FormattedText text={profile.bio} entities={profile.bioEntities}');
    expect(menu).toContain('DATOS DEL PERFIL');
  });
  it('ofrece copiar junto a cada dato y conserva el botón de editar',()=>{
    expect(menu).toContain('export function ProfileCopy');
    expect(menu).toContain('account.profile');
    expect(menu).toContain("control('bio')");
    expect(menu).toContain("'clipboard.copy'");
    expect(menu).toContain('<Pencil size={13}/>Editar');
  });
  it('carga el perfil público del usuario con username y biografía desde TDLib',()=>{
    expect(policy).toContain('"chat.profile"');
    expect(policy).toContain('"clipboard.copy"');
    expect(bridge).toContain('private void chatProfile(JSONObject p,Answer answer)');
    expect(bridge).toContain('new TdApi.GetUserFullInfo(userId)');
    expect(bridge).toContain('"bioEntities",NativeSnapshot.entities(info.bio)');
    expect(bridge).toContain('GetSupergroup(supergroupId)');
    expect(app).toContain("request<ChatProfile|null>('chat.profile'");
    expect(app).toContain('https://t.me/${chatProfile.username}');
    expect(app).toContain('<FormattedText text={chatProfile.bio} entities={chatProfile.bioEntities}');
  });
  it('abre en la app las menciones por nombre y los enlaces de la biografía',()=>{
    expect(formatting).toContain("type === 'mentionName'");
    expect(formatting).toContain('openUser');
    expect(app).toContain("run('contacts.open',{id:userId})");
    expect(app).toContain('openUser={openUser}');
    expect(menu).toContain('openUser={openUser}');
    expect(preview).toContain("method === 'chat.profile'");
    expect(preview).toContain('bioEntities');
  });
  it('envía los comandos al tocarlos y busca las etiquetas dentro del chat',()=>{
    expect(formatting).toContain('openCommand(segment)');
    expect(formatting).toContain('openTag(segment)');
    expect(app).toContain("run<boolean>('send.text',{text,reply:active&&active.type==='group'?message.id:'0'");
    expect(app).toContain('openCommand={command=>sendCommand(message,command)}');
    expect(app).toContain('setSearchQuery(tag)');
    expect(app).toContain("setSearchMode('chat')");
  });
  it('no deja controles de carga de chats sin efecto',()=>{
    expect(app).not.toContain('list-footer');
    expect(app).not.toContain('Cargar más chats');
  });
  it('reancla la vista al último mensaje cuando los medios cambian el alto',()=>{
    expect(app).toContain('function jumpToLatest()');
    expect(app).toContain('observer.observe(contents)');
    expect(app).toContain('!followLatest.current||unreadAnchor.current||jumpPending.current');
    expect(app).toContain('scrollHistoryEnd(host)');
  });
  it('no avisa en pantalla de cada lectura marcada',()=>{
    expect(bridge).toContain('case "chat.read"');
    expect(session).not.toContain('Telegram confirmó la lectura');
  });
});
describe('mensajes enriquecidos de Telegram',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const snapshot=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');
  const summary=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/RichMessages.java');
  const session=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
  const contract=source('./contract.ts');
  const content=source('./MessageContent.tsx');
  const view=source('./RichMessage.tsx');
  it('serializa MessageRichMessage con todos los bloques y textos',()=>{
    expect(snapshot).toContain('TdApi.MessageRichMessage');
    expect(snapshot).toContain('PageBlockTitle');
    expect(snapshot).toContain('PageBlockParagraph');
    expect(snapshot).toContain('PageBlockPreformatted');
    expect(snapshot).toContain('PageBlockBlockQuote');
    expect(snapshot).toContain('PageBlockList');
    expect(snapshot).toContain('PageBlockPhoto');
    expect(snapshot).toContain('PageBlockVideo');
    expect(snapshot).toContain('PageBlockCollage');
    expect(snapshot).toContain('PageBlockSlideshow');
    expect(snapshot).toContain('PageBlockTable');
    expect(snapshot).toContain('PageBlockDetails');
    expect(snapshot).toContain('PageBlockRelatedArticles');
    expect(snapshot).toContain('PageBlockChatLink');
    expect(snapshot).toContain('PageBlockButtonRow');
    expect(snapshot).toContain('RichTexts');
    expect(snapshot).toContain('RichTextCustomEmoji');
    expect(snapshot).toContain('RichTextButton');
    expect(snapshot).toContain('RichTextReferenceLink');
    expect(session).toContain('RichMessages.summary');
    expect(summary).toContain('static String plain(TdApi.RichText text)');
  });
  it('renderiza los bloques ricos en lugar del texto de reserva',()=>{
    expect(contract).toContain('interface RichMessageInfo');
    expect(contract).toContain('rich?:RichMessageInfo');
    expect(content).toContain('<RichMessage rich={message.rich}');
    expect(content).toContain("openCommand={openCommand}");
    expect(view).toContain("case 'table'");
    expect(view).toContain("case 'list'");
    expect(view).toContain("case 'details'");
    expect(view).toContain("case 'relatedArticles'");
    expect(view).toContain("case 'chatLink'");
    expect(view).toContain("case 'buttons'");
    expect(view).toContain('<MediaView media={block.media}');
    expect(view).toContain('rich-partial');
  });
});

describe('controles visibles coherentes con lo que hace el nativo',()=>{
  const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const app=source('./App.tsx');
  const panels=source('./BetaPanels.tsx');
  const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
  const snapshot=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');
  const palette=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/Palette.java');
  const mini=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
  const main=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MainActivity.java');
  it('alterna Día / Noche sobre el esquema efectivo y desactiva el modo sistema',()=>{
    expect(app).toContain("const themeId=autoTheme?(systemDark?'night':'day'):state.appearance.theme");
    expect(app).toContain("resolveTheme(themeId,customTheme)");
    expect(app).toContain("run('appearance',{theme:theme.scheme==='dark'?'day':'night',auto:false})");
    expect(app).not.toContain("state.appearance.theme==='day'?'gold':'day'");
    expect(bridge).toContain('for(String key:new String[]{"compact","typing","enter","auto"})if(p.has(key))edit.putBoolean(key,p.getBoolean(key));');
    expect(palette).toContain('if (prefs.getBoolean("auto", false)) return get(systemDark ? "night" : "day");');
    expect(snapshot).toContain('put("systemDark",Palette.systemDark(context))');
  });
  it('usa el modo oscuro real de Android y deja matchMedia solo como respaldo',()=>{
    expect(app).toContain("useEffect(()=>{if(state.appearance.systemDark!==undefined)return;const media=typeof window!=='undefined'?window.matchMedia?.('(prefers-color-scheme: dark)'):undefined;if(!media)return;const update=()=>setSystemDark(media.matches);update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);},[state.appearance.systemDark]);");
    expect(app).not.toContain("return()=>media.removeEventListener?.('change',update);},[]);");
  });
  it('muestra la versión empaquetada en Complementos en lugar de una beta fija',()=>{
    expect(panels).toContain('<span className="pill">{state.version}</span>');
    expect(panels).not.toMatch(/BETA \d+/);
    expect(snapshot).toContain('put("version",BuildConfig.VERSION_NAME)');
  });
  it('describe los permisos reales de las Mini Apps sin negar funciones ya implementadas',()=>{
    expect(panels).not.toContain('Esta beta no concede cámara, micrófono, ubicación');
    expect(panels).not.toContain('sin almacenamiento web persistente, pagos, solicitudes de teléfono');
    expect(panels).toContain('Cámara, micrófono, ubicación y portapapeles solo se activan tras tu confirmación y el permiso de Android');
    expect(panels).toContain('se envía al bot como un contacto en el chat de Telegram, nunca al sitio web');
    expect(panels).toContain('El almacenamiento de la Mini App es persistente y está separado por cuenta y bot');
    expect(panels).toContain('Sin pagos con factura ni exportación de descargas blob');
    expect(mini).toContain('setTitle("Permitir cámara o micrófono")');
    expect(mini).toContain('setTitle("Permitir ubicación a esta Mini App")');
    expect(mini).toContain('setTitle("Compartir tu teléfono")');
    expect(mini).toContain('new org.drinkless.tdlib.TdApi.InputMessageContact(contact)');
    expect(mini).toContain('return "webapp."+launch.session().selfId+"."+launch.botUserId()+".";');
    expect(mini).toContain('rejectInvoice');
    expect(mini).toContain('Esta beta no exporta descargas blob');
  });
  it('el aviso nativo de privacidad usa la versión empaquetada y no niega funciones vivas',()=>{
    expect(main).not.toMatch(/WRGram [0-9]+\.[0-9]+\.[0-9]+-beta[0-9]+/);
    expect(main).toContain('"WRGram " + BuildConfig.VERSION_NAME + ": TDLib conecta directamente con Telegram');
    expect(main).toContain('hasta 200 contactos');
    expect(main).not.toContain('no se importa la agenda del tel');
    expect(main).toContain('se piden aparte');
    expect(main).not.toContain('No se conceden c');
    expect(main).toContain('60 segundos se publican');
    expect(main).not.toContain('Las historias solo se consultan');
    expect(main).not.toContain('creaci\\u00f3n de supergrupos/canales');
    expect(main).not.toContain('funciones beta09');
    expect(main).toContain('Faltan llamadas de voz y video');
  });
  it('no anuncia como pendiente lo que la compilación ya trae ni filtra rutas internas al usuario',()=>{
    const settings=source('./SettingsPage.tsx');
    const menu=source('./UserMenu.tsx');
    expect(settings).not.toMatch(/\.private\/firebase|google-services\.json/);
    expect(settings).not.toContain('Push no está operativo en esta compilación');
    expect(settings).toContain("'Esta compilación no incluye proveedor de notificaciones, así que Telegram no registra este dispositivo para push.'");
    expect(settings).toContain("'Consultando el estado del push.'");
    expect(settings).not.toContain('push FCM hasta que el propietario');
    // Cierto: session.dat lo cifra WTelegramClient; sin eso, la frase no debe volver.
    expect(menu).toContain("'WRGram Desktop · sesión local cifrada'");
  });
});
