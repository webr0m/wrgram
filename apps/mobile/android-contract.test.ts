import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`./android/${path}`, import.meta.url), 'utf8');

describe('contrato de la beta Android', () => {
  it('conserva TDLib nativo y usa una interfaz React empaquetada, separada de la demo', () => {
    const build = read('app/build.gradle');
    expect(build).toContain("applicationId 'cc.webrom.wrgram'");
    expect(build).toContain('targetSdk 36');
    expect(build).toContain('minSdk 26');
    expect(build).toContain('signingConfigs.upload');
    expect(build).not.toContain('signingConfigs.debug');
    const shell = read('app/src/main/java/cc/webrom/wrgram/ShellActivity.java');
    expect(shell).toContain('WebViewAssetLoader');
    expect(shell).toContain('WebViewCompat.addWebMessageListener');
    expect(shell).toContain('setAllowFileAccess(false)');
    expect(shell).toContain('setAllowContentAccess(false)');
    expect(shell).toContain('mainFrame && ORIGIN.equals');
    expect(shell).not.toContain('addJavascriptInterface');
    expect(build).toContain("implementation project(':tdlib')");
    expect(build).not.toContain('io.github.tdlib-android:core');
  });

  it('mantiene las dependencias nativas fijadas y los cuatro runtimes verificados', () => {
    const lock = JSON.parse(read('tdlib/native-lock.json'));
    expect(lock.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(lock.tdlibCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(lock.opensslVersion).toBe('3.5.9');
    expect(Object.keys(lock.abis).sort()).toEqual(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
    for (const [abi, files] of Object.entries(lock.abis)) {
      expect(Object.keys(files as object)).toHaveLength(3);
      for (const digest of Object.values(files as Record<string, string>)) expect(digest).toMatch(/^[a-f0-9]{64}$/);
      expect(lock.runtime.files[abi].sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('excluye backups y permisos no implementados, y protege las claves locales', () => {
    const manifest = read('app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android.permission.CAMERA');
    expect(manifest).toContain('android:name="android.hardware.camera" android:required="false"');
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toContain('android.permission.READ_CONTACTS');
    expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
    const key = read('app/src/main/java/cc/webrom/wrgram/SessionKey.java');
    expect(key).toContain('AndroidKeyStore');
    expect(key).toContain('AES/GCM/NoPadding');
    expect(key).toContain('getNoBackupFilesDir()');
    const activity = read('app/src/main/java/cc/webrom/wrgram/MainActivity.java');
    expect(activity).toContain('FLAG_SECURE');
    expect(activity).toContain('setSaveEnabled(false)');
    for (const name of ['ShellActivity', 'AgeGateActivity', 'MiniAppActivity', 'PlayerActivity']) {
      expect(read(`app/src/main/java/cc/webrom/wrgram/${name}.java`)).toContain('FLAG_SECURE');
    }
    const player = read('app/src/main/java/cc/webrom/wrgram/PlayerActivity.java');
    expect(player).toContain('FLAG_KEEP_SCREEN_ON|WindowManager.LayoutParams.FLAG_SECURE');
  });

  it('mantiene el transporte Telegram aislado del asistente y sin claves de servidor', () => {
    const engine = read('app/src/main/java/cc/webrom/wrgram/TdSession.java');
    expect(engine).toContain('new TdApi.SendMessage()');
    expect(engine).toContain('new TdApi.LogOut()');
    expect(engine).toContain('new TdApi.LogStreamEmpty()');
    expect(engine).toContain('parameters.useSecretChats = true');
    expect(engine).toContain('new TdApi.CreateNewSecretChat');
    expect(engine).toContain('content.linkPreviewOptions.isDisabled=true');
    expect(engine).not.toMatch(/GROQ_API_KEY|ollama|__wrgram\/telegram\/config|https?:\/\//);
  });

  it('desregistra el callback de red al descartar una cuenta', () => {
    const engine = read('app/src/main/java/cc/webrom/wrgram/TdSession.java');
    expect(engine).toContain('networkCallback = new ConnectivityManager.NetworkCallback()');
    expect(engine).toContain('manager.registerDefaultNetworkCallback(networkCallback)');
    expect(engine).toContain('manager.unregisterNetworkCallback(callback)');
    expect(engine).not.toMatch(/registerDefaultNetworkCallback\(new ConnectivityManager/);
    const register = engine.indexOf('registerDefaultNetworkCallback');
    const discard = engine.indexOf('void discard()');
    expect(register).toBeGreaterThan(-1);
    expect(discard).toBeGreaterThan(register);
    expect(engine.slice(discard)).toContain('unregisterNetworkCallback');
  });

  it('usa listas recicladas, lecturas con plazo y caché local independiente de la red', () => {
    const activity = read('app/src/main/java/cc/webrom/wrgram/MainActivity.java');
    const engine = read('app/src/main/java/cc/webrom/wrgram/TdSession.java');
    expect(activity).toContain('RecyclerView');
    expect(activity).not.toContain('messageRows.removeAllViews()');
    expect(read('app/src/main/java/cc/webrom/wrgram/ConversationAdapter.java')).toContain('ListAdapter');
    expect(engine).toContain('RequestTracker');
    expect(engine).toContain('historyQuery(id, read.cursor, true)');
    expect(engine).toContain('historyQuery(id, read.cursor, false)');
    expect(engine).toContain('12_000');
    expect(read('version.properties')).toContain('versionCode=48');
    expect(read('version.properties')).toContain('versionName=1.0.0-beta20');
    expect(read('app/build.gradle')).toContain('dependsOn syncMobileUiAssets');
  });

  it('exige la declaración nativa en ambos accesos y antes de abrir TDLib', () => {
    for (const name of ['ShellActivity', 'MainActivity']) {
      const source = read(`app/src/main/java/cc/webrom/wrgram/${name}.java`);
      expect(source).toContain('extends AccessActivity');
      expect(source).toContain('if (!requireAccess()) return;');
    }
    const engine = read('app/src/main/java/cc/webrom/wrgram/TdSession.java');
    expect(engine.indexOf('if (!ageAllowed())')).toBeLessThan(engine.indexOf('System.loadLibrary'));
    expect(engine).toContain('client.send(new TdApi.Close()');
    const gate = read('app/src/main/java/cc/webrom/wrgram/AgeGateActivity.java');
    expect(gate).toContain('IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS');
    expect(gate).toContain('field.setSaveEnabled(false)');
    expect(gate).not.toMatch(/getDefault\(\)|getSimCountryIso|getNetworkCountryIso|TelephonyManager|HttpURLConnection/);
    const store = read('app/src/main/java/cc/webrom/wrgram/AgeAccessStore.java');
    expect(store).toContain('getNoBackupFilesDir()');
    expect(store).toContain('AES/GCM/NoPadding');
    expect(store).not.toMatch(/put\("(birth|dateOfBirth|age|userId|phone)"/);
  });

  it('cierra el descriptor de un Range si la respuesta nunca llega a construirse', () => {
    const store = read('app/src/main/java/cc/webrom/wrgram/NativeMediaStore.java');
    const body = store.slice(store.indexOf('WebResourceResponse response(String path,String rangeHeader)'));
    expect(body).toContain('FileInputStream input=null;');
    expect(body).toContain('input=null;return full;');
    expect(body).toContain('input=null;return partial;');
    expect(body).toMatch(/catch\(Exception ignored\)\{[\s\S]*?if\(input!=null\)\{try\{input\.close\(\)/);
    // Ningún FileInputStream se entrega sin pasar antes por la variable que permite cerrarlo.
    expect(body).not.toMatch(/new WebResourceResponse\([^)]*new FileInputStream/);
  });

  it('cierra cada diálogo con su actividad en lugar de dejar la ventana huérfana', () => {
    const host = read('app/src/main/java/cc/webrom/wrgram/Dialogs.java');
    const tracker = read('app/src/main/java/cc/webrom/wrgram/DialogTracker.java');
    const access = read('app/src/main/java/cc/webrom/wrgram/AccessActivity.java');
    const gate = read('app/src/main/java/cc/webrom/wrgram/AgeGateActivity.java');
    expect(host).toContain('class Builder extends AlertDialog.Builder');
    expect(host).toContain('((Host) activity).trackDialog(dialog)');
    // Builder.show() invoca create() de forma virtual: rastrear también allí dejaría referencias dobles.
    expect(host).toContain('AlertDialog dialog = create();');
    expect(host).not.toContain('tracked(super.show())');
    expect(tracker).toContain('dialog.dismiss()');
    expect(access).toContain('implements Dialogs.Host');
    expect(access.slice(access.indexOf('protected void onDestroy'))).toContain('dialogs.closeAll()');
    expect(gate.slice(gate.indexOf('protected void onDestroy'))).toContain('dialogs.closeAll()');
    // Ningún diálogo de la carpeta — escrita la clase como sea — se construye fuera del factory.
    const dir = new URL('./android/app/src/main/java/cc/webrom/wrgram/', import.meta.url);
    const sueltos = readdirSync(dir)
      .filter((name) => name.endsWith('.java'))
      .filter((name) => /new (android\.app\.)?AlertDialog\.Builder\(/.test(readFileSync(new URL(name, dir), 'utf8')));
    expect(sueltos).toEqual([]);
    for (const name of ['MainActivity', 'ShellActivity', 'MiniAppActivity', 'NativeBridge', 'AssistantScreen', 'ExternalLinks', 'AgeGateActivity']) {
      expect(read(`app/src/main/java/cc/webrom/wrgram/${name}.java`)).toContain('Dialogs.builder(');
    }
  });

  it('ofrece las opciones web sin mezclar demo, mensajes y consultas de IA', () => {
    const activity = read('app/src/main/java/cc/webrom/wrgram/MainActivity.java');
    expect(activity).toContain('"No leídos"');
    expect(activity).toContain('"Bots"');
    expect(activity).toContain('"Guardados"');
    expect(activity).toContain('"WR IA"');
    expect(activity).toContain('"Complementos"');
    expect(activity).toContain('"Buscar en mensajes cargados"');
    expect(activity).toContain('"Insertar emoji"');
    expect(activity).toContain('"Permitir y activar"');
    const assistant = read('app/src/main/java/cc/webrom/wrgram/AssistantController.java');
    expect(assistant).not.toMatch(/import.*TdApi|TelegramClient|GROQ_API_KEY/);
    expect(assistant).toContain('https://wrgram.webrom.cc/api/v1/assistant');
    const payload = read('app/src/main/java/cc/webrom/wrgram/AssistantPayload.java');
    expect(payload).toContain('"consent", true');
    expect(payload).not.toMatch(/put\("(telegram|chats|apiKey|notes)"/);
  });

  it('aísla las Mini Apps del puente de conversaciones y exige origen y cuenta', () => {
    const host=read('app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
    expect(host).toContain('mainFrame&&origin.equals');
    expect(host).toContain('launch.session()==app.telegram()');
    expect(host).toContain('setAllowFileAccess(false)');
    expect(host).toContain('setDomStorageEnabled(false)');
    expect(host).not.toContain('addJavascriptInterface');
    expect(host).not.toContain('new NativeBridge');
    const launch=read('app/src/main/java/cc/webrom/wrgram/MiniAppLaunch.java');
    expect(launch).toContain('pending.remove(handle)');
    expect(launch).toContain('30_000');
  });

  it('juzga la dirección realmente conectada al descargar contenido de una Mini App', () => {
    const host = read('app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
    expect(host).toContain('connection.setSSLSocketFactory(new PublicOnlySocketFactory(STORY_CONNECT_TIMEOUT_MS))');
    expect(host).toContain('lower.equals("localhost")');
    const politica = read('app/src/main/java/cc/webrom/wrgram/PublicNetworkPolicy.java');
    expect(politica).toContain('static boolean isPublic(byte[] raw)');
    expect(politica).not.toContain('isSiteLocalAddress()');
    const fabrica = read('app/src/main/java/cc/webrom/wrgram/PublicOnlySocketFactory.java');
    expect(fabrica).toContain('tcp.getInetAddress()');
    expect(fabrica).toContain('delegate.createSocket(tcp, host, port, autoClose)');
    expect(fabrica).toContain('if (!publicAddress.test(address)) throw new IOException(BLOCKED);');
    expect(read('app/src/test/java/cc/webrom/wrgram/PublicOnlySocketFactoryTest.java')).toContain('rechazaEnvolverUnTCPConectadoADireccionPrivada');
    const dispositivo = read('app/src/androidTest/java/cc/webrom/wrgram/PublicOnlySocketStackTest.java');
    expect(dispositivo).toContain('laPilaDeAndroid_BloqueaElTls_HaciaUnaDireccionPrivada');
    expect(dispositivo).toContain('laPilaDeAndroid_CifraConNormalidad_UnServidorPublico');
  });

  it('bloquea toda la app con la autenticación del sistema', () => {
    const lock=read('app/src/main/java/cc/webrom/wrgram/AppLock.java');
    const screen=read('app/src/main/java/cc/webrom/wrgram/AppLockScreen.java');
    expect(screen).toContain('BiometricPrompt');
    expect(screen).toContain('createConfirmDeviceCredentialIntent');
    expect(lock).toContain('BIOMETRIC_WEAK');
    expect(lock).toContain('lockAfter');
    expect(lock).not.toContain('putString(');
    const manifest=read('app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
    expect(read('app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java')).toContain('AppLock.isUnlocked()');
  });

  it('declara push opcional sin inicialización automática ni textos de FCM', () => {
    const manifest=read('app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('firebase_messaging_auto_init_enabled" android:value="false"');
    expect(manifest).toContain('POST_NOTIFICATIONS');
    const service=read('app/src/main/java/cc/webrom/wrgram/WrgramMessagingService.java');
    expect(service).toContain('PushWork.class');
    expect(service).not.toContain('getNotification()');
    const push=read('app/src/main/java/cc/webrom/wrgram/PushNotifications.java');
    expect(push).toContain('!app.ageAccess().allowed()');
    expect(push).toContain('new TdApi.GetPushReceiverId(payload)');
    expect(push).toContain('Notification.VISIBILITY_SECRET');
    const activity=read('app/src/main/java/cc/webrom/wrgram/MainActivity.java');
    expect(activity).toContain('BuildConfig.FCM_CONFIGURED ? "Las notificaciones push son opcionales y usan Firebase Cloud Messaging');
    expect(activity).not.toMatch(/gestionan\. Las notificaciones push no est/);
  });
});
