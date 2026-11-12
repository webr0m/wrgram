package cc.webrom.wrgram;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Gravity;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.activity.result.IntentSenderRequest;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.Collections;
import java.util.function.Consumer;

/** Bundled React/Vite UI, not a remotely hosted website. TDLib and keys remain native. */
public final class ShellActivity extends AccessActivity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String ENTRY = ORIGIN + "/assets/ui/index.html";
    static final String ACTION_INLINE_QUERY = "cc.webrom.wrgram.INLINE_QUERY";
    static final String ACTION_MINIAPP_SHORTCUT = "cc.webrom.wrgram.MINIAPP_SHORTCUT";
    static final String EXTRA_INLINE_USERNAME = "username";
    static final String EXTRA_INLINE_QUERY = "query";
    static final String EXTRA_MINIAPP_SHORTCUT = "shortcut";
    private WebView web;
    private NativeBridge bridge;
    private PlayUpdateController updateController;
    private FrameLayout root;
    private AppLockScreen lockScreen;
    private String pendingDeepLink;
    private String pendingThemeLink;
    private String pendingInlineQuery;
    private String pendingMiniAppShortcut;
    private android.webkit.ValueCallback<Uri[]> fileChooserCallback;
    private int insetBottomPx;
    private boolean uiReady;
    private final Runnable incomingCall=this::showIncomingCall;
    private boolean resumed;
    final ActivityResultLauncher<String> notificationPermission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted->{if(granted)PushNotifications.enable((WrgramApplication)getApplication());if(bridge!=null)bridge.changed("notifications");});
    final ActivityResultLauncher<IntentSenderRequest> playUpdateFlow=registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(),result->{if(updateController!=null)updateController.result(result.getResultCode());});
    final ActivityResultLauncher<String[]> botLocationPermission=registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),result->{boolean granted=Boolean.TRUE.equals(result.get(android.Manifest.permission.ACCESS_FINE_LOCATION))||Boolean.TRUE.equals(result.get(android.Manifest.permission.ACCESS_COARSE_LOCATION));if(bridge!=null)bridge.botLocationPermissionResult(granted);});
    final ActivityResultLauncher<String> contactsPermission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted->{if(bridge!=null)bridge.contactsImportPermissionResult(granted);});
    void enableNotifications(){if(!BuildConfig.FCM_CONFIGURED){Dialogs.builder(this).setMessage("Esta compilación no incluye la configuración de Firebase, así que Telegram no puede registrar el dispositivo para push. No está operativo en esta compilación.").setPositiveButton("Aceptar",null).show();return;}if(Build.VERSION.SDK_INT>=33&&!PushNotifications.permitted(this))notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS);else PushNotifications.enable((WrgramApplication)getApplication());}
    org.json.JSONObject playUpdateStatus(){try{return updateController==null?new org.json.JSONObject().put("supported",false).put("available",false).put("checking",false).put("downloaded",false).put("currentVersionCode",BuildConfig.VERSION_CODE).put("availableVersionCode",0).put("priority",0).put("error",""):updateController.status();}catch(Exception ignored){return new org.json.JSONObject();}}
    void checkPlayUpdate(){if(updateController!=null)updateController.check(true);}
    void startPlayUpdate(){if(updateController!=null)updateController.start();}
    void completePlayUpdate(){if(updateController!=null)updateController.complete();}
    void openPlayStore(){if(updateController!=null)updateController.openPlayStore();}
    void updateChanged(){if(bridge!=null)bridge.updateChanged();}
    void showSettingsSupport(){
        String[] actions={"Privacidad y límites","Actualizar edad o residencia","Estado y ayuda de conexión","Contactar con @webrom_bot"};
        Dialogs.builder(this).setTitle("Privacidad, edad y soporte · WRGram "+BuildConfig.VERSION_NAME).setItems(actions,(dialog,which)->{
            if(which==0)showPrivacyInformation();
            else if(which==1)confirmAgeRefresh();
            else if(which==2)showConnectionHelp();
            else ExternalLinks.open(this,"https://t.me/webrom_bot",()->{},()->{});
        }).setNegativeButton("Cerrar",null).show();
    }
    private void showPrivacyInformation(){
        String message="TDLib conecta esta beta directamente con Telegram. Los chats en la nube no son E2EE; los chats secretos sí usan el cifrado de Telegram. La app puede guardar notas locales cifradas y hasta tres cuentas separadas.\n\nLas Mini Apps no reciben el historial de chats. Las solicitudes de teléfono, ubicación, portapapeles, cámara y micrófono requieren tu confirmación nativa por Mini App; cámara y micrófono se conceden solo mientras esa Mini App está abierta y tras una acción tuya. La ubicación y el portapapeles pueden llegar al sitio de la Mini App. Compartir en historias descarga el contenido del servidor indicado por la Mini App y solo se publica después de tu confirmación.\n\nEsta compilación no incluye todas las funciones del cliente oficial. Consulta la política pública para más información.";
        Dialogs.builder(this).setTitle("Privacidad y límites · "+BuildConfig.VERSION_NAME).setMessage(message)
            .setNegativeButton("Cerrar",null).setPositiveButton("Política de privacidad",(dialog,which)->ExternalLinks.open(this,"https://wrgram.webrom.cc/android/privacy/",()->{},()->{})).show();
    }
    private void confirmAgeRefresh(){
        Dialogs.builder(this).setTitle("Actualizar edad o residencia").setMessage("Telegram se pausará sin revocar la sesión. Tendrás que completar de nuevo la autodeclaración en esta misma versión de WRGram.")
            .setNegativeButton("Cancelar",null).setPositiveButton("Continuar",(dialog,which)->{
                try{WrgramApplication app=(WrgramApplication)getApplication();app.ageAccess().forgetApproval();app.scheduleAgeExpiry();if(bridge!=null)bridge.refreshAccessGate();requireAccess();}
                catch(Exception ignored){Dialogs.builder(this).setMessage("No se pudo actualizar la comprobación local. Si hay una restricción temporal, espera antes de volver a intentarlo.").setPositiveButton("Cerrar",null).show();}
            }).show();
    }
    private void showConnectionHelp(){
        TdSession session=((WrgramApplication)getApplication()).telegram();
        String sending=session.activeChat==0?"selecciona una conversación":session.canSend()?"disponible":!session.connected()?"esperando conexión con Telegram":"el chat no permite enviar o tiene permisos restringidos";
        String status="WRGram "+BuildConfig.VERSION_NAME+"\n"+session.connection+"\nSesión: "+(session.ready()?"autenticada":"sin autenticar")+"\nEnvío: "+sending;
        Dialogs.builder(this).setTitle("Estado y ayuda de conexión").setMessage(status+"\n\nAl volver a primer plano se vuelve a notificar a TDLib el tipo de red. No reenvíes mensajes que quedaron sin confirmar; revisa primero el historial.")
            .setNegativeButton("Cerrar",null).setPositiveButton("Reintentar conexión",(dialog,which)->session.retry()).show();
    }
    void requestBotLocationPermission(){if(androidx.core.content.ContextCompat.checkSelfPermission(this,android.Manifest.permission.ACCESS_FINE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED||androidx.core.content.ContextCompat.checkSelfPermission(this,android.Manifest.permission.ACCESS_COARSE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED){if(bridge!=null)bridge.botLocationPermissionResult(true);return;}botLocationPermission.launch(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION});}
    void requestContactsImportPermission(){if(androidx.core.content.ContextCompat.checkSelfPermission(this,android.Manifest.permission.READ_CONTACTS)==android.content.pm.PackageManager.PERMISSION_GRANTED){if(bridge!=null)bridge.contactsImportPermissionResult(true);return;}contactsPermission.launch(android.Manifest.permission.READ_CONTACTS);}
    @Override boolean handlesAccessGate(){return true;}
    @Override void onAccessGateRefresh(){if(bridge!=null)bridge.refreshAccessGate();}
    void accessGranted(){dispatchPendingInlineQuery();dispatchPendingMiniAppShortcut();dispatchPendingThemeLink();}
    static boolean canHostBundledUi(android.content.Context context){return WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)&&bundledUiCompatible(context);}
    void clearSensitiveGateFields(){if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('wrgram:clear-sensitive'))",null);}
    final ActivityResultLauncher<String[]> picker = registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> { if (bridge != null) bridge.picked(uri); });
    final ActivityResultLauncher<String[]> albumPicker=registerForActivityResult(new ActivityResultContracts.OpenMultipleDocuments(),uris->{if(bridge!=null)bridge.pickedAlbum(uris);});
    final ActivityResultLauncher<String> profilePhotoPicker=registerForActivityResult(new ActivityResultContracts.GetContent(),uri->{if(bridge!=null)bridge.pickedProfilePhoto(uri);});
    final ActivityResultLauncher<String> videoNotePicker=registerForActivityResult(new ActivityResultContracts.GetContent(),uri->{if(bridge!=null)bridge.pickedVideoNote(uri);});
    final ActivityResultLauncher<String> microphonePermission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted->{if(bridge!=null)bridge.voicePermissionResult(granted);});
    final ActivityResultLauncher<String> export = registerForActivityResult(new ActivityResultContracts.CreateDocument("application/octet-stream"), uri -> { if (bridge != null) bridge.exported(uri); });
    private Uri cameraOutput;
    final ActivityResultLauncher<Uri> camera=registerForActivityResult(new ActivityResultContracts.TakePicture(),saved->{if(bridge!=null)bridge.cameraResult(saved);});
    private Uri videoNoteOutput;
    final ActivityResultLauncher<android.content.Intent> videoNoteCamera=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{Uri uri=videoNoteOutput;videoNoteOutput=null;if(bridge!=null)bridge.recordedVideoNote(result.getResultCode()==android.app.Activity.RESULT_OK?uri:null);});
    final ActivityResultLauncher<android.content.Intent> themeFilePicker=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{android.webkit.ValueCallback<Uri[]> callback=fileChooserCallback;fileChooserCallback=null;if(callback!=null)callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(),result.getData()));});

    void chooseProfilePhoto(){profilePhotoPicker.launch("image/*");}
    void chooseAlbum(){albumPicker.launch(new String[]{"image/*"});}
    void chooseVideoNote(){videoNotePicker.launch("video/mp4");}
    boolean recordVideoNote(){
        try{
            File folder=new File(getCacheDir(),"video-notes");if(!folder.isDirectory()&&!folder.mkdirs())return false;
            File[] stale=folder.listFiles();if(stale!=null){long cutoff=System.currentTimeMillis()-3600000L;for(File item:stale)if(item.isFile()&&item.lastModified()<cutoff)item.delete();}
            Uri uri=FileProvider.getUriForFile(this,getPackageName()+".fileprovider",File.createTempFile("note-",".mp4",folder));
            android.content.Intent intent=new android.content.Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE);
            intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT,uri);
            intent.putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT,60);
            intent.putExtra(android.provider.MediaStore.EXTRA_VIDEO_QUALITY,0);
            intent.addFlags(android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION|android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            videoNoteOutput=uri;videoNoteCamera.launch(intent);return true;
        }catch(RuntimeException|java.io.IOException error){videoNoteOutput=null;return false;}
    }
    void requestVoicePermission(){microphonePermission.launch(android.Manifest.permission.RECORD_AUDIO);}
    boolean capturePhoto(){
        try{
            File folder=new File(getCacheDir(),"camera");if(!folder.isDirectory()&&!folder.mkdirs())return false;
            File[] stale=folder.listFiles();if(stale!=null){long cutoff=System.currentTimeMillis()-3600000L;for(File item:stale)if(item.isFile()&&item.lastModified()<cutoff)item.delete();}
            Uri uri=FileProvider.getUriForFile(this,getPackageName()+".fileprovider",File.createTempFile("capture-",".jpg",folder));
            cameraOutput=uri;camera.launch(uri);return true;
        }catch(RuntimeException|java.io.IOException error){cameraOutput=null;return false;}
    }
    Uri cameraOutput(){return cameraOutput;}
    void clearCameraOutput(){cameraOutput=null;}

    private void onAppUnlocked(){
        if(bridge!=null)bridge.changed("security");
        if(pendingDeepLink!=null&&bridge!=null){String link=pendingDeepLink;pendingDeepLink=null;bridge.openSystemLink(link);}
        dispatchPendingInlineQuery();dispatchPendingMiniAppShortcut();dispatchPendingThemeLink();
        showIncomingCall();
    }
    private void showIncomingCall(){
        WrgramApplication app=(WrgramApplication)getApplication();
        if(resumed&&app.ageAccess().allowed()&&AppLock.isUnlocked()&&app.calls().claimIncomingScreen()){
            startActivity(new Intent(this,CallActivity.class));
        }
    }
    void changeAppLock(boolean enabled,Consumer<Boolean> callback){
        if(!AppLock.available(this)||lockScreen==null){callback.accept(false);return;}
        lockScreen.requestChange(enabled,callback);
    }
    void lockNow(){if(lockScreen!=null)lockScreen.lockNow();}
    void applyThemeBars(){
        Palette palette=Palette.get(this);
        android.view.Window window=getWindow();
        window.setStatusBarColor(palette.canvas);
        if(Build.VERSION.SDK_INT>=29){window.setNavigationBarColor(palette.canvas);window.setNavigationBarDividerColor(palette.surface);window.setNavigationBarContrastEnforced(false);}
        else window.setNavigationBarColor(palette.canvas);
        if(root!=null)root.setBackgroundColor(palette.canvas);
        if(web!=null)web.setBackgroundColor(palette.canvas);
        if(Build.VERSION.SDK_INT>=30){
            android.view.WindowInsetsController controller=window.getInsetsController();
            if(controller!=null)controller.setSystemBarsAppearance(palette.dark?0:android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }else{
            View decor=window.getDecorView();int flags=decor.getSystemUiVisibility();int light=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            decor.setSystemUiVisibility(palette.dark?flags&~light:flags|light);
        }
    }
    private void captureThemeLink(Intent intent){
        if(intent==null||intent.getData()==null)return;
        Uri data=intent.getData();
        if(!"wrgram".equals(data.getScheme())||!"theme".equals(data.getHost()))return;
        String link=data.toString();
        if(link.length()>9000)return;
        pendingThemeLink=link;
    }
    private void dispatchPendingThemeLink(){
        if(pendingThemeLink==null||web==null||!uiReady||!AppLock.isUnlocked())return;
        String link=pendingThemeLink;pendingThemeLink=null;
        try{web.evaluateJavascript("window.dispatchEvent(new CustomEvent('wrgram:theme-link',{detail:"+org.json.JSONObject.quote(link)+"}))",null);}catch(Exception ignored){}
    }
    void applyContentInsets(int bottomPx){
        insetBottomPx=bottomPx;
        if(!uiReady||web==null)return;
        String css="document.documentElement.style.setProperty('--inset-bottom','"+(bottomPx/getResources().getDisplayMetrics().density)+"px')";
        web.evaluateJavascript(css,null);
    }
    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);pendingDeepLink=TelegramLinks.normalize(getIntent()==null?null:getIntent().getDataString());captureThemeLink(getIntent());captureIntentExtras(getIntent());
        if (!requireAccess()) return;
        if (!canHostBundledUi(this)) {
            startActivity(new Intent(this, MainActivity.class)); finish(); return;
        }
        root = new FrameLayout(this); root.setBackgroundColor(Palette.get(this).canvas);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                // Only the keyboard shrinks the WebView; the page reserves the system
                // navigation bar itself through --inset-bottom so it can draw behind it.
                view.setPadding(bars.left, bars.top, bars.right, ime.bottom);
                applyContentInsets(Build.VERSION.SDK_INT >= 35 && ime.bottom == 0 ? bars.bottom : 0);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this); web.setBackgroundColor(Palette.get(this).canvas); web.setSaveEnabled(false);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        // The bundled UI sizes its own text. Keeping system font scaling out of the
        // WebView prevents clipped rows and horizontal overflow on large-font devices.
        settings.setTextZoom(100);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false); settings.setSaveFormData(false);
        // The bundled, first-party UI uses muted inline playback only for Telegram's MPEG4 thumbnails.
        settings.setMediaPlaybackRequiresUserGesture(false); settings.setGeolocationEnabled(false); settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        updateController=new PlayUpdateController(this,playUpdateFlow);bridge = new NativeBridge(this, web);
        NativeBridge uiBridge=bridge;
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !ENTRY.equals(request.getUrl().toString()); }
            @Override public void onPageFinished(WebView view, String url) {
                if (view==web&&ENTRY.equals(url)) { uiReady = true; applyContentInsets(insetBottomPx); dispatchPendingInlineQuery(); dispatchPendingMiniAppShortcut(); dispatchPendingThemeLink(); }
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                showInterfaceRecovery(view);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority()) || !"GET".equals(request.getMethod())) return blocked();
                 if (uri.getPath() != null && uri.getPath().startsWith("/media/")) {String range=null;for(java.util.Map.Entry<String,String> header:request.getRequestHeaders().entrySet())if("range".equalsIgnoreCase(header.getKey())){range=header.getValue();break;}return uiBridge.mediaResponse(uri.getPath(),range);}
                if (uri.getPath() == null || !uri.getPath().startsWith("/assets/ui/")) return blocked();
                WebResourceResponse response = assets.shouldInterceptRequest(uri); return response == null ? blocked() : response;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) { fileChooserCallback.onReceiveValue(null); fileChooserCallback = null; }
                fileChooserCallback = callback;
                try { themeFilePicker.launch(params.createIntent()); return true; }
                catch (RuntimeException error) { fileChooserCallback = null; callback.onReceiveValue(null); return false; }
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "WRGramNative", Collections.singleton(ORIGIN), (view, message, source, mainFrame, reply) -> {
                if (view == web && mainFrame && ORIGIN.equals(source.toString()) && ENTRY.equals(view.getUrl())) {
                    uiBridge.receive(message.getData(),reply);
                }
            });
        }
        if(!AppLock.enabled(this))AppLock.setUnlocked(true);
        lockScreen=new AppLockScreen(this,this::onAppUnlocked);
        root.addView(web, new FrameLayout.LayoutParams(-1,-1)); lockScreen.install(root); setContentView(root); root.requestApplyInsets(); applyThemeBars();
        if(!AppLock.isUnlocked())lockScreen.show(false);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if(web==null||!AppLock.isUnlocked()){finish();return;}
                web.evaluateJavascript("window.dispatchEvent(new Event('wrgram:back'))", null);
            }
        });
        web.loadUrl(ENTRY);
    }
    private void showInterfaceRecovery(WebView failed){
        if(web!=failed)return;
        web=null;
        uiReady=false;
        if(bridge!=null){bridge.detach();bridge.destroy();bridge=null;}
        fileChooserCallback=null;
        root.removeView(failed);
        failed.destroy();

        Palette palette=Palette.get(this);
        LinearLayout recovery=new LinearLayout(this);
        recovery.setOrientation(LinearLayout.VERTICAL);
        recovery.setGravity(Gravity.CENTER);
        int padding=Math.round(24*getResources().getDisplayMetrics().density);
        recovery.setPadding(padding,padding,padding,padding);
        recovery.setBackgroundColor(palette.canvas);
        TextView text=new TextView(this);
        text.setText(R.string.interface_recovery_message);
        text.setTextColor(palette.ink);
        text.setTextSize(17);
        text.setGravity(Gravity.CENTER);
        recovery.addView(text);
        Button retry=new Button(this);
        retry.setText(R.string.interface_recovery_retry);
        retry.setOnClickListener(view->{retry.setEnabled(false);recreate();});
        recovery.addView(retry);
        root.addView(recovery,0,new FrameLayout.LayoutParams(-1,-1));
    }
    private static boolean bundledUiCompatible(android.content.Context context) {
        try { android.content.pm.PackageInfo provider = WebViewCompat.getCurrentWebViewPackage(context); return provider != null && supportsBundledUiVersion(provider.versionName); }
        catch (RuntimeException ignored) { return false; }
    }
    static boolean supportsBundledUiVersion(String version){try{return version!=null&&Integer.parseInt(version.split("\\.")[0])>=100;}catch(RuntimeException ignored){return false;}}
    static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0])); }
    @Override protected void onStart() {
        super.onStart();
        AppLock.activityStarted(this);
        ((WrgramApplication)getApplication()).calls().addObserver(incomingCall);
        if (bridge != null && requireAccess()) {if(!bridge.currentAccount()){bridge.detach();recreate();return;}bridge.attach();if(((WrgramApplication)getApplication()).ageAccess().allowed()&&updateController!=null)updateController.check(false);}
        if(lockScreen!=null&&AppLock.disableIfUnavailable(this)){android.widget.Toast.makeText(this,R.string.app_lock_removed,android.widget.Toast.LENGTH_LONG).show();if(bridge!=null)bridge.changed("security");}
        if(lockScreen!=null){if(AppLock.isUnlocked())lockScreen.hide();else lockScreen.show(false);}
        if(AppLock.isUnlocked()&&pendingDeepLink!=null&&bridge!=null){String link=pendingDeepLink;pendingDeepLink=null;bridge.openSystemLink(link);}
        if(AppLock.isUnlocked()){dispatchPendingInlineQuery();dispatchPendingMiniAppShortcut();dispatchPendingThemeLink();}
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);setIntent(intent);captureThemeLink(intent);captureIntentExtras(intent);
        String link=TelegramLinks.normalize(intent==null?null:intent.getDataString());
        if(link!=null){if(bridge!=null&&AppLock.isUnlocked()){bridge.openSystemLink(link);}else pendingDeepLink=link;}
        if(AppLock.isUnlocked()){dispatchPendingInlineQuery();dispatchPendingMiniAppShortcut();dispatchPendingThemeLink();}
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration){
        super.onConfigurationChanged(configuration);applyThemeBars();if(bridge!=null)bridge.changed("appearance");
    }
    private void captureIntentExtras(Intent intent){
        if(intent==null)return;
        try{
            if(ACTION_INLINE_QUERY.equals(intent.getAction())){
                String username=intent.getStringExtra(EXTRA_INLINE_USERNAME),query=intent.getStringExtra(EXTRA_INLINE_QUERY);
                if(username!=null&&username.matches("[A-Za-z0-9_]{3,32}")&&query!=null&&query.length()<=512)pendingInlineQuery=new org.json.JSONObject().put("username",username).put("query",query).toString();
            }else if(ACTION_MINIAPP_SHORTCUT.equals(intent.getAction())){
                String id=intent.getStringExtra(EXTRA_MINIAPP_SHORTCUT);
                if(id!=null&&id.length()<=128)pendingMiniAppShortcut=id;
            }
        }catch(Exception ignored){}
    }
    private void dispatchPendingInlineQuery(){
        if(pendingInlineQuery==null||web==null||!uiReady||!AppLock.isUnlocked())return;
        String payload=pendingInlineQuery;pendingInlineQuery=null;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('wrgram:inline-query',{detail:"+payload+"}))",null);
    }
    private void dispatchPendingMiniAppShortcut(){
        if(pendingMiniAppShortcut==null||!AppLock.isUnlocked())return;
        WrgramApplication app=(WrgramApplication)getApplication();
        if(!app.ageAccess().allowed())return;
        String id=pendingMiniAppShortcut;pendingMiniAppShortcut=null;
        MiniAppShortcuts.Entry entry=MiniAppShortcuts.get(this,id);
        if(entry==null){android.widget.Toast.makeText(this,"El acceso directo ya no está disponible. Añádelo de nuevo desde la Mini App.",android.widget.Toast.LENGTH_SHORT).show();return;}
        TdSession session=app.account(entry.slot());
        if(session==null||session!=app.telegram()||!session.ready()){android.widget.Toast.makeText(this,"Abre WRGram con la misma cuenta que añadió este acceso directo.",android.widget.Toast.LENGTH_SHORT).show();return;}
        session.perform(new org.drinkless.tdlib.TdApi.GetMainWebApp(0,entry.botUserId(),"",new org.drinkless.tdlib.TdApi.WebAppOpenParameters(null,"WRGram",new org.drinkless.tdlib.TdApi.WebAppOpenModeFullSize())),result->{
            if(!app.ageAccess().allowed()||app.telegram()!=session||!session.ready()||result==null||result.url==null)return;
            String url=result.url.url;
            try{MiniAppPolicy.origin(url);}catch(IllegalArgumentException ignored){return;}
            startActivity(new Intent(this,MiniAppActivity.class).putExtra("launch",MiniAppLaunch.put(session,entry.title(),url)));
        },error->android.widget.Toast.makeText(this,error,android.widget.Toast.LENGTH_SHORT).show());
    }
    @Override protected void onResume(){super.onResume();resumed=true;if(lockScreen!=null){if(AppLock.isUnlocked())lockScreen.hide();else lockScreen.show(true);}if(((WrgramApplication)getApplication()).ageAccess().allowed()){((WrgramApplication)getApplication()).telegram().onForeground();if(updateController!=null)updateController.resume();}showIncomingCall();}
    @Override protected void onPause(){resumed=false;super.onPause();}
    @Override protected void onStop() { ((WrgramApplication)getApplication()).calls().removeObserver(incomingCall);AppLock.activityStopped(!isChangingConfigurations()&&(lockScreen==null||!lockScreen.authenticating()));if (bridge != null) bridge.detach(); super.onStop(); }
    @Override protected void onDestroy() { if(fileChooserCallback!=null){fileChooserCallback.onReceiveValue(null);fileChooserCallback=null;}if (bridge != null) bridge.destroy();if(updateController!=null)updateController.close(); if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
