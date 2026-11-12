package cc.webrom.wrgram;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.location.Location;
import android.location.LocationManager;
import android.os.Bundle;
import android.webkit.*;
import android.view.WindowManager;
import android.widget.*;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URL;
import java.util.Collections;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Separate, origin-restricted Mini App host; never installs the Telegram account bridge. */
public final class MiniAppActivity extends AccessActivity {
    private MiniWebView web;private LinearLayout root;private MiniAppLaunch.Launch launch;private String origin;private Button mainButton,secondaryButton,settingsButton,backButton,closeButton;private boolean confirmClose,locationSettingsOpened,popupOpen,fullscreen;private long lastUserInteraction,lastDeviceStorageOperation,lastUnsupportedNotice;private int safeTop,safeBottom,safeLeft,safeRight;private ValueCallback<android.net.Uri[]> choosing;private PermissionRequest mediaRequest;private boolean mediaGranted,mediaDenied,emojiStatusGranted,emojiStatusDenied,storyBusy;private StoryPhotoProcessor.Draft storyPhoto;private VideoStoryProcessor.Draft storyVideo;private final ArrayDeque<Long> popupTimes=new ArrayDeque<>();private final ArrayDeque<Long> outboundTimes=new ArrayDeque<>();
    private boolean allowOutbound(){long now=android.os.SystemClock.elapsedRealtime();while(!outboundTimes.isEmpty()&&now-outboundTimes.peekFirst()>3000)outboundTimes.removeFirst();if(outboundTimes.size()>=6)return false;outboundTimes.addLast(now);return true;}
    private final ActivityResultLauncher<String[]> picker=registerForActivityResult(new ActivityResultContracts.OpenDocument(),uri->{ValueCallback<android.net.Uri[]> callback=choosing;choosing=null;if(callback!=null)callback.onReceiveValue(uri==null||!allowed()?null:new android.net.Uri[]{uri});});
    private final ActivityResultLauncher<String[]> locationPermission=registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),result->{boolean granted=Boolean.TRUE.equals(result.get(android.Manifest.permission.ACCESS_FINE_LOCATION))||Boolean.TRUE.equals(result.get(android.Manifest.permission.ACCESS_COARSE_LOCATION));finishLocationPermission(granted);});
    private final ActivityResultLauncher<String[]> mediaPermissions=registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),result->{PermissionRequest request=mediaRequest;mediaRequest=null;if(request==null)return;boolean audio=!hasResource(request,PermissionRequest.RESOURCE_AUDIO_CAPTURE)||Boolean.TRUE.equals(result.get(Manifest.permission.RECORD_AUDIO))||androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED;boolean video=!hasResource(request,PermissionRequest.RESOURCE_VIDEO_CAPTURE)||Boolean.TRUE.equals(result.get(Manifest.permission.CAMERA))||androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED;if(allowed()&&audio&&video)grantMedia(request);else request.deny();});
    private boolean allowed(){WrgramApplication app=(WrgramApplication)getApplication();return !isFinishing()&&!isDestroyed()&&launch!=null&&app.ageAccess().allowed()&&app.telegram()==launch.session()&&launch.session().ready()&&web!=null&&MiniAppPolicy.sameOrigin(origin,web.getUrl());}
    @SuppressLint("SetJavaScriptEnabled") @Override public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);if(!requireAccess())return;
        launch=MiniAppLaunch.take(getIntent().getStringExtra("launch"));WrgramApplication app=(WrgramApplication)getApplication();
        if(launch==null||launch.session()!=app.telegram()||!launch.session().ready()||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)||!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){finish();return;}
         origin=MiniAppPolicy.origin(launch.url());root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);Palette palette=Palette.get(this);root.setBackgroundColor(palette.canvas);
          backButton=new Button(this);backButton.setText(R.string.mini_app_back);backButton.setVisibility(android.view.View.GONE);backButton.setOnClickListener(v->emit("back_button_pressed",new JSONObject()));root.addView(backButton);closeButton=new Button(this);closeButton.setText(getString(R.string.mini_app_close,launch.title()));closeButton.setOnClickListener(v->close());root.addView(closeButton);settingsButton=new Button(this);settingsButton.setText(R.string.mini_app_settings);settingsButton.setVisibility(android.view.View.GONE);settingsButton.setOnClickListener(v->emit("settings_button_pressed",new JSONObject()));root.addView(settingsButton);
         web=new MiniWebView(this);web.setBackgroundColor(palette.canvas);web.setSaveEnabled(false);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(false);s.setCacheMode(WebSettings.LOAD_NO_CACHE);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setGeolocationEnabled(false);s.setSaveFormData(false);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setMediaPlaybackRequiresUserGesture(true);s.setSafeBrowsingEnabled(true);
        // No persistent WebView storage: the same service cannot inherit another Telegram account's cookie.
        CookieManager.getInstance().setAcceptCookie(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
         web.setOnTouchListener((view,touch)->{if(touch.getAction()==android.view.MotionEvent.ACTION_UP){view.performClick();if(allowed())lastUserInteraction=android.os.SystemClock.elapsedRealtime();}return false;});
         if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){WebViewCompat.addWebMessageListener(web,"WRMiniAppHost",Collections.singleton(origin),(view,message,source,mainFrame,reply)->{if(mainFrame&&origin.equals(source.toString())&&MiniAppPolicy.sameOrigin(origin,view.getUrl())&&launch.session()==app.telegram()&&app.ageAccess().allowed())event(message.getData());});}
        if(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){WebViewCompat.addDocumentStartJavaScript(web,"window.TelegramWebviewProxy={postEvent:function(type,data){window.WRMiniAppHost.postMessage(JSON.stringify({type:type,data:data}));}};",Collections.singleton(origin));}
         web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return !MiniAppPolicy.sameOrigin(origin,request.getUrl().toString());if(MiniAppPolicy.sameOrigin(origin,request.getUrl().toString()))return false;if(request.hasGesture())try{openWebLink(request.getUrl().toString());}catch(IllegalArgumentException ignored){}return true;}@Override public void onPageFinished(WebView view,String url){emitTheme();viewport();}});
        web.setWebChromeClient(new WebChromeClient(){@Override public void onPermissionRequest(PermissionRequest request){handlePermissionRequest(request);}@Override public boolean onShowFileChooser(WebView view,ValueCallback<android.net.Uri[]> result,FileChooserParams params){if(!allowed()){result.onReceiveValue(null);return true;}if(choosing!=null)choosing.onReceiveValue(null);choosing=result;picker.launch(new String[]{"*/*"});return true;}});
        web.setDownloadListener((url,agent,disposition,mime,length)->{try{openWebLink(url);}catch(IllegalArgumentException ignored){Dialogs.builder(this).setMessage("Esta beta no exporta descargas blob. Usa la opción de archivo del bot o su navegador externo.").setPositiveButton("Aceptar",null).show();}});
         root.addView(web,new LinearLayout.LayoutParams(-1,0,1));secondaryButton=new Button(this);secondaryButton.setTextColor(palette.ink);secondaryButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(palette.surface));secondaryButton.setVisibility(android.view.View.GONE);secondaryButton.setOnClickListener(v->emit("secondary_button_pressed",new JSONObject()));root.addView(secondaryButton);mainButton=new Button(this);mainButton.setTextColor(palette.onAccent);mainButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(palette.accent));mainButton.setVisibility(android.view.View.GONE);mainButton.setOnClickListener(v->emit("main_button_pressed",new JSONObject()));root.addView(mainButton);setContentView(root);root.setOnApplyWindowInsetsListener((v,insets)->{safeLeft=insets.getSystemWindowInsetLeft();safeTop=insets.getSystemWindowInsetTop();safeRight=insets.getSystemWindowInsetRight();safeBottom=insets.getSystemWindowInsetBottom();v.setPadding(safeLeft,safeTop,safeRight,safeBottom);emitSafeArea();return insets;});
         getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){if(backButton!=null&&backButton.getVisibility()==android.view.View.VISIBLE)emit("back_button_pressed",new JSONObject());else close();}});web.loadUrl(launch.url());
    }
    private void event(String raw){try{if(raw==null||raw.length()>80_000||!allowed())return;JSONObject envelope=new JSONObject(raw);String type=envelope.optString("type");if(raw.length()>(("web_app_device_storage_save_key".equals(type))?80_000:16_384))return;Object rawData=envelope.opt("data");String rawPayload=rawData instanceof String?(String)rawData:"";JSONObject data;if(rawData instanceof JSONObject)data=(JSONObject)rawData;else try{data=new JSONObject(rawPayload);}catch(Exception ignored){data=new JSONObject();}switch(type){
        case "web_app_close":close();break;
        case "web_app_ready":case "web_app_expand":case "web_app_request_viewport":viewport();break;
         case "web_app_request_theme":emitTheme();break;
         case "web_app_setup_main_button":mainButton.setText(data.optString("text","Continuar"));mainButton.setEnabled(data.optBoolean("is_active",true));if(data.has("color"))try{mainButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor(data.getString("color"))));}catch(Exception ignored){}if(data.has("text_color"))try{mainButton.setTextColor(android.graphics.Color.parseColor(data.getString("text_color")));}catch(Exception ignored){}mainButton.setVisibility(data.optBoolean("is_visible")?android.view.View.VISIBLE:android.view.View.GONE);break;
         case "web_app_setup_secondary_button":secondaryButton.setText(data.optString("text","Continuar"));secondaryButton.setEnabled(data.optBoolean("is_active",true));if(data.has("color"))try{secondaryButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor(data.getString("color"))));}catch(Exception ignored){}if(data.has("text_color"))try{secondaryButton.setTextColor(android.graphics.Color.parseColor(data.getString("text_color")));}catch(Exception ignored){}secondaryButton.setVisibility(data.optBoolean("is_visible")?android.view.View.VISIBLE:android.view.View.GONE);break;
         case "web_app_setup_settings_button":settingsButton.setVisibility(data.optBoolean("is_visible")?android.view.View.VISIBLE:android.view.View.GONE);break;
         case "web_app_check_write_access":checkWriteAccess();break;
         case "web_app_request_safe_area":emitSafeArea();break;
         case "web_app_set_emoji_status":setEmojiStatus(data);break;
         case "web_app_setup_closing_behavior":confirmClose=data.optBoolean("need_confirmation");break;
         case "web_app_set_background_color":setMiniAppBackground(data.optString("color"));break;
         case "web_app_set_header_color":setMiniAppHeader(data);break;
         case "web_app_set_bottom_bar_color":setMiniAppBottomBar(data.optString("color"));break;
         case "web_app_open_popup":showMiniAppPopup(data);break;
          case "web_app_open_link":if(consumeUserGesture(1000))try{openWebLink(data.optString("url"));}catch(IllegalArgumentException ignored){}break;
         case "web_app_open_tg_link":openTelegramLink(data);break;
         case "web_app_data_send":if(launch.keyboardData())confirmKeyboardData(data.optString("data",rawPayload));break;
         case "web_app_request_write_access":requestWriteAccess();break;
         case "web_app_request_phone":requestMiniAppPhone();break;
         case "web_app_request_location":requestMiniAppLocation();break;
         case "web_app_check_location":checkLocation();break;
         case "web_app_open_location_settings":openLocationSettings();break;
          case "web_app_read_text_from_clipboard":requestClipboard(data.optString("req_id"));break;
          case "web_app_device_storage_save_key":deviceStorageSave(data);break;
          case "web_app_device_storage_get_key":deviceStorageGet(data);break;
          case "web_app_device_storage_clear":deviceStorageClear(data);break;
         case "web_app_setup_back_button":if(backButton!=null)backButton.setVisibility(data.optBoolean("is_visible")?android.view.View.VISIBLE:android.view.View.GONE);break;
         case "web_app_trigger_haptic_feedback":triggerHaptic(data);break;
         case "web_app_request_fullscreen":setFullscreen(true);break;
         case "web_app_exit_fullscreen":setFullscreen(false);break;
         case "web_app_lock_orientation":lockOrientation(data);break;
         case "web_app_check_home_screen":checkHomeScreen();break;
         case "web_app_request_emoji_status_access":requestEmojiStatusAccess();break;
         case "web_app_open_invoice":rejectInvoice(data);break;
         case "web_app_share_to_story":shareToStory(data);break;
         case "web_app_switch_inline_query":switchInlineQuery(data);break;
         case "web_app_add_to_home_screen":addToHomeScreen();break;
         default:break; // Unsupported events do not execute generic bridge requests.
     }}catch(Exception ignored){}}
     private void confirmKeyboardData(String value){
        if(!allowed()||!launch.keyboardData()||value==null||value.isEmpty()||value.length()>4096){Dialogs.builder(this).setMessage("El dato de respuesta está vacío o supera el límite de 4096 caracteres.").setPositiveButton("Aceptar",null).show();return;}
        Dialogs.builder(this).setTitle("Enviar respuesta al bot").setMessage("La Mini App solicita enviar este dato al bot:\n\n"+value).setNegativeButton("Cancelar",null).setPositiveButton("Enviar",(dialog,which)->{if(!allowed())return;launch.session().perform(new org.drinkless.tdlib.TdApi.SendWebAppData(launch.botUserId(),launch.buttonText(),value),ignored->{if(allowed())finish();},error->Dialogs.builder(this).setMessage(error).setPositiveButton("Aceptar",null).show());}).show();
     }
    private static String hex(int value){return String.format(java.util.Locale.ROOT,"#%06X",value&0x00ffffff);}
    private void emitTheme(){if(!allowed())return;Palette palette=Palette.get(this);try{JSONObject params=new JSONObject().put("bg_color",hex(palette.canvas)).put("secondary_bg_color",hex(palette.surface)).put("text_color",hex(palette.ink)).put("hint_color",hex(palette.muted)).put("link_color",hex(palette.accent)).put("button_color",hex(palette.accent)).put("button_text_color",hex(palette.onAccent)).put("header_bg_color",hex(palette.canvas)).put("bottom_bar_bg_color",hex(palette.surface));emit("theme_changed",new JSONObject().put("theme_params",params));}catch(Exception ignored){}}
    private void setMiniAppBackground(String color){if(!allowed())return;try{int value;if("bg_color".equals(color)||"secondary_bg_color".equals(color)){Palette palette=Palette.get(this);value="bg_color".equals(color)?palette.canvas:palette.surface;}else value=android.graphics.Color.parseColor(color);root.setBackgroundColor(value);web.setBackgroundColor(value);}catch(Exception ignored){}}
    private void setMiniAppHeader(JSONObject data){if(!allowed())return;try{int color;if(data.has("color"))color=android.graphics.Color.parseColor(data.getString("color"));else{Palette palette=Palette.get(this);color="secondary_bg_color".equals(data.optString("color_key"))?palette.surface:palette.canvas;}closeButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(color));backButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(color));}catch(Exception ignored){}}
    private void setMiniAppBottomBar(String color){if(!allowed()||mainButton==null)return;try{int value;if("bg_color".equals(color)||"secondary_bg_color".equals(color)||"bottom_bar_bg_color".equals(color)){Palette palette=Palette.get(this);value="bg_color".equals(color)?palette.canvas:palette.surface;}else value=android.graphics.Color.parseColor(color);mainButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(value));}catch(Exception ignored){}}
    private void showMiniAppPopup(JSONObject data){if(!allowed()||popupOpen)return;long now=android.os.SystemClock.elapsedRealtime();while(!popupTimes.isEmpty()&&now-popupTimes.peekFirst()>3000)popupTimes.removeFirst();if(popupTimes.size()>=3)return;org.json.JSONArray buttons=data.optJSONArray("buttons");if(buttons==null||buttons.length()<1||buttons.length()>3)return;String[] labels=new String[buttons.length()],ids=new String[buttons.length()];java.util.HashSet<String> unique=new java.util.HashSet<>();try{for(int i=0;i<buttons.length();i++){JSONObject item=buttons.getJSONObject(i);String id=item.optString("id"),type=item.optString("type"),label=item.optString("text");if(id.isEmpty()||id.length()>64||!unique.add(id)||!(type.equals("ok")||type.equals("close")||type.equals("cancel")||type.equals("default")||type.equals("destructive")))return;ids[i]=id;labels[i]=NativeSnapshot.limit(label.isEmpty()?type:label,64);}}catch(Exception ignored){return;}popupTimes.addLast(now);popupOpen=true;AlertDialog dialog=Dialogs.builder(this).setTitle(NativeSnapshot.limit(data.optString("title"),64)).setMessage(NativeSnapshot.limit(data.optString("message"),256)).setItems(labels,(d,which)->{popupOpen=false;try{emit("popup_closed",new JSONObject().put("button_id",ids[which]));}catch(Exception ignored){}}).create();dialog.setOnCancelListener(ignored->{popupOpen=false;try{emit("popup_closed",new JSONObject());}catch(Exception skipped){}});dialog.show();}
    private void checkWriteAccess(){if(!allowed()||launch.botUserId()<=0){emitStatus("write_access_requested","cancelled");return;}launch.session().perform(new org.drinkless.tdlib.TdApi.CanBotSendMessages(launch.botUserId()),ignored->{if(allowed())emitStatus("write_access_requested","allowed");},error->{if(allowed())emitStatus("write_access_requested","cancelled");});}
    private void emitSafeArea(){if(!allowed())return;try{emit("safe_area_changed",new JSONObject().put("top",safeTop).put("bottom",safeBottom).put("left",safeLeft).put("right",safeRight));}catch(Exception ignored){}}
    private void setEmojiStatus(JSONObject data){
        if(!allowed()||launch.botUserId()<=0)return;
        if(!emojiStatusGranted){unsupportedNotice("La Mini App no tiene permiso para cambiar tu estado emoji.");return;}
        String id=data.optString("custom_emoji_id","");
        if(!id.matches("[1-9][0-9]{0,18}")){unsupportedNotice("El estado emoji solicitado no es válido.");return;}
        int expiration=data.optInt("expiration_date",0),now=(int)(System.currentTimeMillis()/1000);
        if(expiration!=0&&(expiration<now+60||expiration>now+367L*86400L)){unsupportedNotice("La caducidad del estado emoji no es válida.");return;}
        org.drinkless.tdlib.TdApi.EmojiStatus status=new org.drinkless.tdlib.TdApi.EmojiStatus(new org.drinkless.tdlib.TdApi.EmojiStatusTypeCustomEmoji(Long.parseLong(id)),expiration);
        launch.session().perform(new org.drinkless.tdlib.TdApi.SetEmojiStatus(status),ignored->{},error->{if(allowed())unsupportedNotice("Telegram no permitió cambiar el estado emoji.");});
    }
    private void requestWriteAccess(){if(!allowed()||launch.botUserId()<=0){emitStatus("write_access_requested","cancelled");return;}Dialogs.builder(this).setTitle("Permitir mensajes del bot").setMessage("Si continúas, "+launch.title()+" podrá enviarte mensajes directos de Telegram. Este permiso no se concede al abrir la Mini App.").setNegativeButton("Ahora no",(d,w)->emitStatus("write_access_requested","cancelled")).setPositiveButton("Permitir",(d,w)->{if(!allowed())return;launch.session().perform(new org.drinkless.tdlib.TdApi.AllowBotToSendMessages(launch.botUserId()),ignored->{if(allowed())emitStatus("write_access_requested","allowed");},error->{if(allowed())emitStatus("write_access_requested","failed");});}).setOnCancelListener(ignored->emitStatus("write_access_requested","cancelled")).show();}
    private void requestMiniAppPhone(){if(!allowed()||launch.botUserId()<=0){emitStatus("phone_requested","cancelled");return;}org.drinkless.tdlib.TdApi.User me=launch.session().user(launch.session().selfId);if(me==null||me.phoneNumber==null||me.phoneNumber.isEmpty()){emitStatus("phone_requested","unavailable");return;}Dialogs.builder(this).setTitle("Compartir tu teléfono").setMessage("Se enviará este número al bot "+launch.title()+" en el chat de Telegram:\n\n"+me.phoneNumber+"\n\nLa Mini App no recibirá el número directamente.").setNegativeButton("Cancelar",(d,w)->emitStatus("phone_requested","cancelled")).setPositiveButton("Compartir con el bot",(d,w)->{if(!allowed())return;org.drinkless.tdlib.TdApi.Contact contact=new org.drinkless.tdlib.TdApi.Contact(me.phoneNumber,NativeSnapshot.limit(me.firstName==null?"Contacto":me.firstName,64),NativeSnapshot.limit(me.lastName==null?"":me.lastName,64),"",me.id);sendMiniAppContent(new org.drinkless.tdlib.TdApi.InputMessageContact(contact),"phone_requested");}).setOnCancelListener(ignored->emitStatus("phone_requested","cancelled")).show();}
    private String locationConsentKey(){return "location."+launch.session().selfId+"."+launch.botUserId();}
    private android.content.SharedPreferences miniAppPreferences(){return getSharedPreferences("miniapp-permissions",0);}
    private boolean hasLocationPermission(){return androidx.core.content.ContextCompat.checkSelfPermission(this,android.Manifest.permission.ACCESS_FINE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED||androidx.core.content.ContextCompat.checkSelfPermission(this,android.Manifest.permission.ACCESS_COARSE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED;}
    private boolean locationServicesAvailable(){LocationManager manager=(LocationManager)getSystemService(Context.LOCATION_SERVICE);if(manager==null)return false;try{return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);}catch(Exception ignored){return false;}}
    private int locationConsentState(){return launch==null?0:miniAppPreferences().getInt(locationConsentKey(),0);}
    private boolean locationConsent(){return locationConsentState()>0&&hasLocationPermission();}
    private boolean consumeUserGesture(long maximumAge){long age=android.os.SystemClock.elapsedRealtime()-lastUserInteraction;if(lastUserInteraction==0||age<0||age>maximumAge)return false;lastUserInteraction=0;return true;}
    private void checkLocation(){if(!allowed()||launch.botUserId()<=0)return;int consent=locationConsentState();try{emit("location_checked",new JSONObject().put("available",locationServicesAvailable()).put("access_requested",consent!=0).put("access_granted",consent>0&&hasLocationPermission()));}catch(Exception ignored){}}
    private void emitUnavailableLocation(){try{emit("location_requested",new JSONObject().put("available",false));}catch(Exception ignored){}}
    private void requestMiniAppLocation(){if(!allowed()||launch.botUserId()<=0||!consumeUserGesture(10_000)||!locationServicesAvailable()){emitUnavailableLocation();return;}int consent=locationConsentState();if(consent<0){emitUnavailableLocation();return;}if(consent>0){if(hasLocationPermission())sendLocationToMiniApp();else locationPermission.launch(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION});return;}Dialogs.builder(this).setTitle("Permitir ubicación a esta Mini App").setMessage("La Mini App podrá leer tu ubicación actual mientras la uses. WRGram pedirá permiso a Android. La ubicación se entrega al sitio de la Mini App solo después de este consentimiento.").setNegativeButton("No permitir",(d,w)->{miniAppPreferences().edit().putInt(locationConsentKey(),-1).apply();checkLocation();emitUnavailableLocation();}).setPositiveButton("Continuar",(d,w)->{if(!allowed())return;miniAppPreferences().edit().putInt(locationConsentKey(),1).apply();checkLocation();if(hasLocationPermission())sendLocationToMiniApp();else locationPermission.launch(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION});}).setOnCancelListener(ignored->{miniAppPreferences().edit().putInt(locationConsentKey(),-1).apply();checkLocation();emitUnavailableLocation();}).show();}
    private void finishLocationPermission(boolean granted){if(!allowed())return;checkLocation();if(granted)sendLocationToMiniApp();else emitUnavailableLocation();}
    private void sendLocationToMiniApp(){if(!allowed()||launch.botUserId()<=0||!locationConsent()||!locationServicesAvailable()){emitUnavailableLocation();return;}LocationManager manager=(LocationManager)getSystemService(Context.LOCATION_SERVICE);Location latest=null;if(manager!=null){for(String provider:new String[]{LocationManager.NETWORK_PROVIDER,LocationManager.GPS_PROVIDER})try{Location candidate=manager.getLastKnownLocation(provider);if(candidate!=null&&(latest==null||candidate.getTime()>latest.getTime()))latest=candidate;}catch(SecurityException ignored){}}if(latest==null||System.currentTimeMillis()-latest.getTime()>5*60_000L){emitUnavailableLocation();return;}try{emit("location_requested",new JSONObject().put("available",true).put("latitude",latest.getLatitude()).put("longitude",latest.getLongitude()).put("horizontal_accuracy",latest.hasAccuracy()?latest.getAccuracy():JSONObject.NULL).put("altitude",latest.hasAltitude()?latest.getAltitude():JSONObject.NULL).put("vertical_accuracy",latest.hasAltitude()&&latest.hasVerticalAccuracy()?latest.getVerticalAccuracyMeters():JSONObject.NULL).put("course",latest.hasBearing()?latest.getBearing():JSONObject.NULL).put("course_accuracy",latest.hasBearing()&&latest.hasBearingAccuracy()?latest.getBearingAccuracyDegrees():JSONObject.NULL).put("speed",latest.hasSpeed()?latest.getSpeed():JSONObject.NULL).put("speed_accuracy",latest.hasSpeed()&&latest.hasSpeedAccuracy()?latest.getSpeedAccuracyMetersPerSecond():JSONObject.NULL));}catch(Exception ignored){emitUnavailableLocation();}}
    private void openLocationSettings(){if(!allowed()||launch.botUserId()<=0||!consumeUserGesture(10_000)||locationConsentState()==0||hasLocationPermission())return;try{locationSettingsOpened=true;startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName())));}catch(Exception ignored){locationSettingsOpened=false;}}
    private void requestClipboard(String requestId){if(!allowed()||requestId==null||requestId.length()>100||!allowOutbound())return;if(!consumeUserGesture(10_000)){emitClipboardText(requestId,null);return;}launch.session().perform(new org.drinkless.tdlib.TdApi.GetAttachmentMenuBot(launch.botUserId()),bot->{if(!allowed()||!bot.isAdded){emitClipboardText(requestId,null);return;}ClipboardManager clipboard=(ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);ClipData clip=clipboard==null?null:clipboard.getPrimaryClip();if(clip==null||clip.getItemCount()==0||clip.getItemAt(0).coerceToText(this)==null){emitClipboardText(requestId,"");return;}String text=NativeSnapshot.limit(clip.getItemAt(0).coerceToText(this).toString(),4096);String preview=NativeSnapshot.limit(text,160);Dialogs.builder(this).setTitle("Leer portapapeles").setMessage("La Mini App solicita leer el portapapeles. Se compartirán hasta los primeros 4096 caracteres, solo si lo confirmas:\n\n"+preview).setNegativeButton("No permitir",(d,w)->emitClipboardText(requestId,null)).setPositiveButton("Compartir texto",(d,w)->{if(allowed())emitClipboardText(requestId,text);}).setOnCancelListener(ignored->emitClipboardText(requestId,null)).show();},error->emitClipboardText(requestId,null));}
    private void emitClipboardText(String requestId,String value){try{JSONObject result=new JSONObject().put("req_id",requestId);if(value!=null)result.put("data",value);emit("clipboard_text_received",result);}catch(Exception ignored){}}
    private String deviceStoragePrefix(){return "webapp."+launch.session().selfId+"."+launch.botUserId()+".";}
    private boolean validStorageRequest(String reqId,String key){return allowed()&&launch.botUserId()>0&&reqId!=null&&reqId.matches("[A-Za-z0-9]{1,64}")&&key!=null&&!key.isEmpty()&&key.length()<=128;}
    private synchronized boolean allowDeviceStorageOperation(){long now=android.os.SystemClock.elapsedRealtime();if(lastDeviceStorageOperation!=0&&now-lastDeviceStorageOperation<100)return false;lastDeviceStorageOperation=now;return true;}
    private void deviceStorageSave(JSONObject data){String reqId=data.optString("req_id"),key=data.optString("key");if(!allowDeviceStorageOperation()){deviceStorageError(reqId,"RATE_LIMITED");return;}if(!validStorageRequest(reqId,key)){deviceStorageError(reqId,"KEY_INVALID");return;}Object raw=data.opt("value");if(raw!=JSONObject.NULL&&!(raw instanceof String)){deviceStorageError(reqId,"VALUE_INVALID");return;}String value=raw==JSONObject.NULL?null:(String)raw;if(value!=null&&value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>64*1024){deviceStorageError(reqId,"VALUE_TOO_LARGE");return;}long owner=launch.session().selfId;String storageKey=deviceStoragePrefix()+key;((WrgramApplication)getApplication()).storage().execute(()->{android.content.SharedPreferences preferences=getSharedPreferences("miniapp-device-storage",0);try{java.util.Map<String,?> all=preferences.getAll();long size=0;String prefix=deviceStoragePrefix();for(java.util.Map.Entry<String,?> entry:all.entrySet())if(entry.getKey().startsWith(prefix)&&!entry.getKey().equals(storageKey)&&entry.getValue() instanceof String)size+=entry.getKey().getBytes(java.nio.charset.StandardCharsets.UTF_8).length+((String)entry.getValue()).getBytes(java.nio.charset.StandardCharsets.UTF_8).length;if(value!=null)size+=storageKey.getBytes(java.nio.charset.StandardCharsets.UTF_8).length+value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;if(size>5L*1024*1024){runOnUiThread(()->deviceStorageError(reqId,"STORAGE_LIMIT_EXCEEDED"));return;}android.content.SharedPreferences.Editor editor=preferences.edit();if(value==null)editor.remove(storageKey);else editor.putString(storageKey,value);boolean saved=editor.commit();runOnUiThread(()->{if(!allowed()||launch.session().selfId!=owner)return;if(saved)emitStatusWithId("device_storage_key_saved",reqId);else deviceStorageError(reqId,"UNKNOWN_ERROR");});}catch(Exception ignored){runOnUiThread(()->deviceStorageError(reqId,"UNKNOWN_ERROR"));}});}
    private void deviceStorageGet(JSONObject data){String reqId=data.optString("req_id"),key=data.optString("key");if(!allowDeviceStorageOperation()){deviceStorageError(reqId,"RATE_LIMITED");return;}if(!validStorageRequest(reqId,key)){deviceStorageError(reqId,"KEY_INVALID");return;}long owner=launch.session().selfId;String value=getSharedPreferences("miniapp-device-storage",0).getString(deviceStoragePrefix()+key,null);if(allowed()&&owner==launch.session().selfId)try{emit("device_storage_key_received",new JSONObject().put("req_id",reqId).put("value",value==null?JSONObject.NULL:value));}catch(Exception ignored){}}
    private void deviceStorageClear(JSONObject data){String reqId=data.optString("req_id");if(!allowDeviceStorageOperation()){deviceStorageError(reqId,"RATE_LIMITED");return;}if(!allowed()||launch.botUserId()<=0||reqId==null||!reqId.matches("[A-Za-z0-9]{1,64}")){deviceStorageError(reqId,"REQUEST_INVALID");return;}long owner=launch.session().selfId;String prefix=deviceStoragePrefix();((WrgramApplication)getApplication()).storage().execute(()->{android.content.SharedPreferences preferences=getSharedPreferences("miniapp-device-storage",0);android.content.SharedPreferences.Editor editor=preferences.edit();for(String key:preferences.getAll().keySet())if(key.startsWith(prefix))editor.remove(key);boolean saved=editor.commit();runOnUiThread(()->{if(!allowed()||launch.session().selfId!=owner)return;if(saved)emitStatusWithId("device_storage_cleared",reqId);else deviceStorageError(reqId,"UNKNOWN_ERROR");});});}
    private void emitStatusWithId(String event,String reqId){try{emit(event,new JSONObject().put("req_id",reqId));}catch(Exception ignored){}}
    private void deviceStorageError(String reqId,String error){if(reqId==null||!reqId.matches("[A-Za-z0-9]{1,64}"))return;try{emit("device_storage_failed",new JSONObject().put("req_id",reqId).put("error",error));}catch(Exception ignored){}}
    private void sendMiniAppContent(org.drinkless.tdlib.TdApi.InputMessageContent content,String event){if(!allowed())return;launch.session().perform(new org.drinkless.tdlib.TdApi.CreatePrivateChat(launch.botUserId(),false),chat->{if(!allowed())return;launch.session().perform(new org.drinkless.tdlib.TdApi.SendMessage(chat.id,null,null,new org.drinkless.tdlib.TdApi.MessageSendOptions(),null,content),sent->{if(allowed())emitStatus(event,"sent");},error->{if(allowed())emitStatus(event,"cancelled");});},error->{if(allowed())emitStatus(event,"cancelled");});}
    private void openTelegramLink(JSONObject data){if(!allowed()||!consumeUserGesture(10_000))return;String path=data.optString("path_full","");if(path.length()>2048||!path.startsWith("/"))return;openWebLink("https://t.me"+path);}
    private void openWebLink(String url){
        if(!allowed()||!allowOutbound())return;
        String telegram=TelegramLinks.normalize(url);
        if(telegram!=null){Intent intent=new Intent(this,ShellActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse(telegram));intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(intent);finish();return;}
        ExternalLinks.open(this,url,()->{},()->{});
    }
    private void triggerHaptic(JSONObject data){if(!allowed()||!consumeUserGesture(1000))return;try{android.os.Vibrator vibrator=(android.os.Vibrator)getSystemService(Context.VIBRATOR_SERVICE);if(vibrator==null||!vibrator.hasVibrator())return;String type=data.optString("type");int duration="selection_change".equals(type)?8:"notification".equals(type)?35:"impact".equals(type)?switch(data.optString("impact_style")){case "heavy","rigid"->32;case "medium"->22;default->12;}:0;if(duration<=0)return;vibrator.vibrate(android.os.VibrationEffect.createOneShot(duration,android.os.VibrationEffect.DEFAULT_AMPLITUDE));}catch(Exception ignored){}}
    private void setFullscreen(boolean value){
        if(!allowed())return;
        fullscreen=value;
        android.view.View decor=getWindow().getDecorView();
        if(android.os.Build.VERSION.SDK_INT>=30){
            android.view.WindowInsetsController controller=decor.getWindowInsetsController();
            if(controller!=null){if(value){controller.hide(android.view.WindowInsets.Type.systemBars());controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}else controller.show(android.view.WindowInsets.Type.systemBars());}
        }else{
            //noinspection deprecation
            decor.setSystemUiVisibility(value?android.view.View.SYSTEM_UI_FLAG_FULLSCREEN|android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE:android.view.View.SYSTEM_UI_FLAG_VISIBLE);
        }
        try{emit("fullscreen_changed",new JSONObject().put("is_fullscreen",value));}catch(Exception ignored){}
        if(web!=null)web.post(this::viewport);
    }
    private void lockOrientation(JSONObject data){
        if(!allowed())return;
        String orientation=data.optString("orientation");
        int requested;
        if("portrait".equals(orientation))requested=android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        else if("landscape".equals(orientation))requested=android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
        else{emitOrientationFailed("Orientación no válida.");return;}
        setRequestedOrientation(requested);
        try{emit("orientation_locked",new JSONObject().put("orientation",orientation));}catch(Exception ignored){}
    }
    private void emitOrientationFailed(String error){try{emit("orientation_failed",new JSONObject().put("error",error));}catch(Exception ignored){}}
    private void checkHomeScreen(){if(!allowed())return;String status="unknown";try{android.content.pm.ShortcutManager manager=(android.content.pm.ShortcutManager)getSystemService(SHORTCUT_SERVICE);String id=MiniAppShortcuts.id(((WrgramApplication)getApplication()).currentSlot(),launch.botUserId());if(manager!=null)for(android.content.pm.ShortcutInfo shortcut:manager.getPinnedShortcuts())if(shortcut.getId().equals(id)){status="added";break;}}catch(RuntimeException ignored){}try{emit("home_screen_checked",new JSONObject().put("status",status));}catch(Exception ignored){}}
    private void addToHomeScreen(){
        if(!allowed()||launch.botUserId()<=0||!consumeUserGesture(10_000)){unsupportedNotice("Añadir a la pantalla de inicio requiere una acción tuya en la Mini App.");return;}
        android.content.pm.ShortcutManager manager=(android.content.pm.ShortcutManager)getSystemService(SHORTCUT_SERVICE);
        if(manager==null||!manager.isRequestPinShortcutSupported()){unsupportedNotice("El lanzador de tu dispositivo no admite accesos directos.");return;}
        String id=MiniAppShortcuts.put(this,((WrgramApplication)getApplication()).currentSlot(),launch.botUserId(),launch.title());
        if(id==null){unsupportedNotice("No se pudo guardar el acceso directo.");return;}
        android.content.pm.ShortcutInfo shortcut=new android.content.pm.ShortcutInfo.Builder(this,id).setShortLabel(NativeSnapshot.limit(launch.title(),40)).setLongLabel(NativeSnapshot.limit(launch.title(),80)).setIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.brand_foreground)).setIntent(new Intent(this,ShellActivity.class).setAction(ShellActivity.ACTION_MINIAPP_SHORTCUT).putExtra(ShellActivity.EXTRA_MINIAPP_SHORTCUT,id)).build();
        try{manager.requestPinShortcut(shortcut,null);}catch(RuntimeException ignored){unsupportedNotice("El lanzador no aceptó el acceso directo.");}
    }
    private void requestEmojiStatusAccess(){
        if(!allowed()||launch.botUserId()<=0||!allowOutbound()){emitStatus("emoji_status_access_requested","cancelled");return;}
        if(emojiStatusGranted){emitStatus("emoji_status_access_requested","allowed");return;}
        if(emojiStatusDenied||!consumeUserGesture(10_000)){emitStatus("emoji_status_access_requested","cancelled");return;}
        Dialogs.builder(this).setTitle("Permitir estado emoji").setMessage(launch.title()+" podrá cambiar el estado emoji de tu cuenta. Telegram registra el permiso en la cuenta; puedes quitarlo desde el perfil o bloqueando el bot. WRGram solo transmite la autorización y el emoji que elijas en la Mini App.").setNegativeButton("Ahora no",(d,w)->{emojiStatusDenied=true;emitStatus("emoji_status_access_requested","cancelled");}).setPositiveButton("Permitir",(d,w)->{if(!allowed())return;launch.session().perform(new org.drinkless.tdlib.TdApi.ToggleBotCanManageEmojiStatus(launch.botUserId(),true),ignored->{if(!allowed())return;emojiStatusGranted=true;emitStatus("emoji_status_access_requested","allowed");},error->{if(!allowed())return;emojiStatusDenied=true;emitStatus("emoji_status_access_requested","cancelled");});}).setOnCancelListener(ignored->emitStatus("emoji_status_access_requested","cancelled")).show();
    }
    private void switchInlineQuery(JSONObject data){
        if(!allowed()||launch.botUserId()<=0||!consumeUserGesture(10_000)||!allowOutbound())return;
        String query=NativeSnapshot.limit(data.optString("query",""),512);
        org.drinkless.tdlib.TdApi.User bot=launch.session().user(launch.botUserId());
        String username=null;
        if(bot!=null&&bot.usernames!=null&&bot.usernames.activeUsernames!=null)for(String item:bot.usernames.activeUsernames)if(item!=null&&item.matches("[A-Za-z0-9_]{3,32}")){username=item;break;}
        if(username==null){unsupportedNotice("Este bot no tiene un nombre público para abrir la consulta inline.");return;}
        Intent intent=new Intent(this,ShellActivity.class).setAction(ShellActivity.ACTION_INLINE_QUERY).putExtra(ShellActivity.EXTRA_INLINE_USERNAME,username).putExtra(ShellActivity.EXTRA_INLINE_QUERY,query).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);finish();
    }
    private static boolean hasResource(PermissionRequest request,String resource){for(String item:request.getResources())if(resource.equals(item))return true;return false;}
    private void handlePermissionRequest(PermissionRequest request){
        if(request==null)return;
        if(mediaRequest!=null){request.deny();return;}
        try{if(!allowed()||!MiniAppPolicy.sameOrigin(origin,request.getOrigin().toString())){request.deny();return;}}catch(RuntimeException ignored){request.deny();return;}
        boolean audio=hasResource(request,PermissionRequest.RESOURCE_AUDIO_CAPTURE),video=hasResource(request,PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if(!audio&&!video||mediaDenied){request.deny();return;}
        if(mediaGranted){requestMediaPermission(request,audio,video);return;}
        if(!consumeUserGesture(15_000)){request.deny();return;}
        mediaRequest=request;
        Dialogs.builder(this).setTitle("Permitir cámara o micrófono").setMessage(launch.title()+" solicita "+(audio&&video?"la cámara y el micrófono":audio?"el micrófono":"la cámara")+". Android pedirá su permiso. La autorización vale mientras esta Mini App esté abierta; WRGram no graba nada por su cuenta.").setNegativeButton("No permitir",(d,w)->{mediaDenied=true;denyMedia();}).setPositiveButton("Continuar",(d,w)->{if(!allowed()){denyMedia();return;}mediaGranted=true;requestMediaPermission(request,audio,video);}).setOnCancelListener(ignored->denyMedia()).show();
    }
    private void denyMedia(){PermissionRequest request=mediaRequest;mediaRequest=null;if(request!=null)request.deny();}
    private void requestMediaPermission(PermissionRequest request,boolean audio,boolean video){
        java.util.ArrayList<String> needed=new java.util.ArrayList<>();
        if(audio&&androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.RECORD_AUDIO);
        if(video&&androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)!=android.content.pm.PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.CAMERA);
        if(needed.isEmpty()){grantMedia(request);return;}
        mediaRequest=request;
        try{mediaPermissions.launch(needed.toArray(new String[0]));}catch(RuntimeException ignored){denyMedia();}
    }
    private void grantMedia(PermissionRequest request){
        java.util.ArrayList<String> grant=new java.util.ArrayList<>();
        for(String resource:request.getResources()){
            if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)&&androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED)grant.add(resource);
            else if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)&&androidx.core.content.ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED)grant.add(resource);
        }
        if(grant.isEmpty())request.deny();else request.grant(grant.toArray(new String[0]));
    }
    private void shareToStory(JSONObject data){
        if(!allowed()||storyBusy||!allowOutbound())return;
        if(!consumeUserGesture(10_000)){unsupportedNotice("Compartir en historias requiere una acción tuya en la Mini App.");return;}
        String media=data.optString("media_url","").trim();
        if(media.length()<12||media.length()>2048||!media.toLowerCase(Locale.ROOT).startsWith("https://")){unsupportedNotice("El enlace de la historia debe usar HTTPS.");return;}
        String caption=NativeSnapshot.limit(data.optString("text",""),1024);
        String link="";
        JSONObject widget=data.optJSONObject("widget_link");
        if(widget!=null){String candidate=widget.optString("url","").trim();if(candidate.length()<=200&&candidate.matches("(?i)^(https?://|tg://).{3,}$"))link=candidate;}
        WrgramApplication app=(WrgramApplication)getApplication();
        TdSession session=launch.session();
        long owner=session.selfId;
        String storyCaption=caption,storyLink=link;
        storyBusy=true;
        Toast.makeText(this,"Preparando la historia…",Toast.LENGTH_SHORT).show();
        app.storage().execute(()->{
            StoryPhotoProcessor.Draft photo=null;VideoStoryProcessor.Draft video=null;StoryDownload download=null;
            try{
                download=downloadStoryMedia(media);
                File folder=new File(session.filesDirectory(),"miniapp-stories");
                android.net.Uri local=android.net.Uri.fromFile(download.file);
                if(download.video)video=VideoStoryProcessor.prepare(this,local,folder);
                else photo=StoryPhotoProcessor.prepare(this,local,folder);
            }catch(Exception error){
                if(photo!=null)photo.clear();if(video!=null)video.clear();
                String message=error instanceof IllegalArgumentException&&error.getMessage()!=null?error.getMessage():"No se pudo preparar el contenido de la historia.";
                runOnUiThread(()->{storyBusy=false;if(allowed())Dialogs.builder(this).setMessage(message).setPositiveButton("Cerrar",null).show();});
                return;
            }finally{if(download!=null)download.file.delete();}
            StoryPhotoProcessor.Draft readyPhoto=photo;VideoStoryProcessor.Draft readyVideo=video;
            runOnUiThread(()->{
                storyBusy=false;
                if(!allowed()||app.telegram()!=session||!session.ready()){readyPhoto.clear();readyVideo.clear();return;}
                storyPhoto=readyPhoto;storyVideo=readyVideo;
                showMiniAppStoryDialog(storyCaption,storyLink,owner,session);
            });
        });
    }
    private static final class StoryDownload {final File file;final boolean video;StoryDownload(File file,boolean video){this.file=file;this.video=video;}}
    private static final int STORY_CONNECT_TIMEOUT_MS = 10_000;
    private StoryDownload downloadStoryMedia(String url)throws Exception{
        String current=url;
        for(int hop=0;hop<4;hop++){
            URL parsed=new URL(current);
            if(!"https".equalsIgnoreCase(parsed.getProtocol())||!publicHost(parsed.getHost()))throw new IllegalArgumentException("El contenido debe estar en un servidor HTTPS público.");
            HttpsURLConnection connection=(HttpsURLConnection)parsed.openConnection();
            connection.setSSLSocketFactory(new PublicOnlySocketFactory(STORY_CONNECT_TIMEOUT_MS));
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(STORY_CONNECT_TIMEOUT_MS);connection.setReadTimeout(20_000);connection.setUseCaches(false);connection.setRequestProperty("Accept","image/*,video/*");
            try{
                int code=connection.getResponseCode();
                if(code>=300&&code<400){String location=connection.getHeaderField("Location");if(location==null)throw new IllegalArgumentException("El servidor redirigió sin destino.");current=new URL(parsed,location).toString();continue;}
                if(code!=200)throw new IllegalArgumentException("El servidor respondió "+code+".");
                long length=connection.getContentLengthLong();
                if(length>20L*1024*1024)throw new IllegalArgumentException("El contenido de la historia supera 20 MB.");
                File folder=new File(getCacheDir(),"miniapp-downloads");if(!folder.isDirectory()&&!folder.mkdirs())throw new IllegalStateException("No se pudo preparar el almacenamiento temporal.");
                File output=new File(folder,"story-"+UUID.randomUUID()+".part");byte[] head=new byte[16];int headLength=0;long total=0;
                try(InputStream input=connection.getInputStream();FileOutputStream stream=new FileOutputStream(output)){
                    byte[] buffer=new byte[65536];int count;
                    while((count=input.read(buffer))!=-1){total+=count;if(total>20L*1024*1024)throw new IllegalArgumentException("El contenido de la historia supera 20 MB.");if(headLength<head.length){int copy=Math.min(count,head.length-headLength);System.arraycopy(buffer,0,head,headLength,copy);headLength+=copy;}stream.write(buffer,0,count);}
                }catch(Exception error){output.delete();throw error;}
                if(total==0){output.delete();throw new IllegalArgumentException("El contenido de la historia está vacío.");}
                String extension=storyExtension(head,headLength);
                if(extension==null){output.delete();throw new IllegalArgumentException("El archivo debe ser una imagen o un vídeo MP4.");}
                File named=new File(folder,"story-"+UUID.randomUUID()+"."+extension);
                if(!output.renameTo(named)){output.delete();throw new IllegalStateException("No se pudo guardar el contenido temporal.");}
                return new StoryDownload(named,"mp4".equals(extension));
            }finally{connection.disconnect();}
        }
        throw new IllegalArgumentException("El enlace redirige demasiadas veces.");
    }
    private static boolean publicHost(String host){
        if(host==null||host.isEmpty())return false;
        String lower=host.toLowerCase(Locale.ROOT);
        if(lower.equals("localhost")||lower.endsWith(".localhost")||lower.endsWith(".local"))return false;
        try{
            for(InetAddress address:InetAddress.getAllByName(host)) if(!PublicNetworkPolicy.isPublic(address)) return false;
        }catch(Exception ignored){return false;}
        return true;
    }

    private static String storyExtension(byte[] head,int length){
        if(length>=3&&(head[0]&0xff)==0xff&&(head[1]&0xff)==0xd8&&(head[2]&0xff)==0xff)return "jpg";
        if(length>=4&&(head[0]&0xff)==0x89&&head[1]=='P'&&head[2]=='N'&&head[3]=='G')return "png";
        if(length>=12&&head[0]=='R'&&head[1]=='I'&&head[2]=='F'&&head[3]=='F'&&head[8]=='W'&&head[9]=='E'&&head[10]=='B'&&head[11]=='P')return "webp";
        if(length>=8&&head[4]=='f'&&head[5]=='t'&&head[6]=='y'&&head[7]=='p')return "mp4";
        return null;
    }
    private void showMiniAppStoryDialog(String caption,String link,long owner,TdSession session){
        boolean video=storyVideo!=null;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);int pad=Math.round(16*getResources().getDisplayMetrics().density);form.setPadding(pad,pad,pad,0);
        TextView note=new TextView(this);note.setText(R.string.story_share_note);note.setTextSize(13);form.addView(note);
        ImageView image=new ImageView(this);image.setImageBitmap(video?storyVideo.preview:storyPhoto.preview);image.setScaleType(ImageView.ScaleType.CENTER_CROP);form.addView(image,new LinearLayout.LayoutParams(-1,Math.round(300*getResources().getDisplayMetrics().density)));
        EditText captionField=new EditText(this);captionField.setHint("Texto de la historia (opcional)");captionField.setText(caption);captionField.setMinLines(2);captionField.setMaxLines(4);captionField.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(1024)});form.addView(captionField);
        EditText linkField=new EditText(this);linkField.setHint("Enlace del área (opcional)");linkField.setSingleLine(true);linkField.setText(link);linkField.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);linkField.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});form.addView(linkField);
        android.widget.RadioGroup audiences=new android.widget.RadioGroup(this);android.widget.RadioButton contacts=new android.widget.RadioButton(this),everyone=new android.widget.RadioButton(this),closeFriends=new android.widget.RadioButton(this);contacts.setId(android.view.View.generateViewId());everyone.setId(android.view.View.generateViewId());closeFriends.setId(android.view.View.generateViewId());contacts.setText(getString(R.string.story_privacy_contacts));everyone.setText(getString(R.string.story_privacy_everyone));closeFriends.setText(getString(R.string.story_privacy_close_friends));audiences.addView(contacts);audiences.addView(everyone);audiences.addView(closeFriends);audiences.check(contacts.getId());form.addView(audiences);
        AlertDialog dialog=Dialogs.builder(this).setTitle("Compartir en tu historia").setView(form).setNegativeButton("Cancelar",(d,w)->clearMiniAppStory()).setPositiveButton("Publicar historia",null).create();
        dialog.setOnCancelListener(ignored->clearMiniAppStory());
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            if(!allowed()||storyPhoto==null&&storyVideo==null){dialog.dismiss();clearMiniAppStory();return;}
            String url=linkField.getText().toString().trim();
            if(!url.isEmpty()&&(url.length()>200||!url.matches("(?i)^(https?://|tg://).{3,}$"))){Toast.makeText(this,"El enlace debe empezar por http://, https:// o tg://.",Toast.LENGTH_SHORT).show();linkField.requestFocus();return;}
            String text=captionField.getText().toString().trim();
            org.drinkless.tdlib.TdApi.StoryPrivacySettings privacy=audiences.getCheckedRadioButtonId()==everyone.getId()?new org.drinkless.tdlib.TdApi.StoryPrivacySettingsEveryone(new long[0]):audiences.getCheckedRadioButtonId()==closeFriends.getId()?new org.drinkless.tdlib.TdApi.StoryPrivacySettingsCloseFriends():new org.drinkless.tdlib.TdApi.StoryPrivacySettingsContacts(new long[0]);
            org.drinkless.tdlib.TdApi.InputStoryContent content=video?new org.drinkless.tdlib.TdApi.InputStoryContentVideo(new org.drinkless.tdlib.TdApi.InputFileLocal(storyVideo.file.getAbsolutePath()),new int[0],storyVideo.duration,0.5,storyVideo.silent):new org.drinkless.tdlib.TdApi.InputStoryContentPhoto(new org.drinkless.tdlib.TdApi.InputFileLocal(storyPhoto.file.getAbsolutePath()),new int[0]);
            org.drinkless.tdlib.TdApi.InputStoryAreas areas=url.isEmpty()?null:new org.drinkless.tdlib.TdApi.InputStoryAreas(new org.drinkless.tdlib.TdApi.InputStoryArea[]{new org.drinkless.tdlib.TdApi.InputStoryArea(new org.drinkless.tdlib.TdApi.AreaPosition(50,84,72,8,0,2),new org.drinkless.tdlib.TdApi.InputStoryAreaTypeLink(url))});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            session.perform(new org.drinkless.tdlib.TdApi.CreatePrivateChat(owner,false),saved->session.perform(new org.drinkless.tdlib.TdApi.CanPostStory(saved.id),allowedStory->{
                if(!(allowedStory instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultOk)){dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);Dialogs.builder(this).setMessage(storyLimit(allowedStory)).setPositiveButton("Cerrar",null).show();return;}
                session.perform(new org.drinkless.tdlib.TdApi.PostStory(saved.id,content,areas,new org.drinkless.tdlib.TdApi.FormattedText(text,new org.drinkless.tdlib.TdApi.TextEntity[0]),privacy,null,86400,null,false,false),story->{dialog.dismiss();clearMiniAppStory();Toast.makeText(this,"Historia publicada.",Toast.LENGTH_SHORT).show();},error->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);Dialogs.builder(this).setMessage(error).setPositiveButton("Cerrar",null).show();});
            },error->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);Dialogs.builder(this).setMessage(error).setPositiveButton("Cerrar",null).show();}),error->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);Dialogs.builder(this).setMessage(error).setPositiveButton("Cerrar",null).show();});
        }));
        dialog.show();
    }
    private static String storyLimit(org.drinkless.tdlib.TdApi.CanPostStoryResult result){
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultPremiumNeeded)return "Telegram indica que hace falta Premium para publicar otra historia.";
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultBoostNeeded)return "Telegram indica que este chat necesita más boosts para publicar historias.";
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultActiveStoryLimitExceeded)return "Alcanzaste el límite de historias activas de Telegram.";
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultWeeklyLimitExceeded)return "Alcanzaste el límite semanal de historias de Telegram.";
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultMonthlyLimitExceeded)return "Alcanzaste el límite mensual de historias de Telegram.";
        if(result instanceof org.drinkless.tdlib.TdApi.CanPostStoryResultLiveStoryIsActive)return "Termina la historia en vivo antes de publicar otra.";
        return "Telegram no permite publicar una historia ahora.";
    }
    private void clearMiniAppStory(){StoryPhotoProcessor.Draft photo=storyPhoto;VideoStoryProcessor.Draft video=storyVideo;storyPhoto=null;storyVideo=null;if(photo!=null)photo.clear();if(video!=null)video.clear();}
    private void rejectInvoice(JSONObject data){
        if(!allowed())return;
        String slug=data.optString("slug");
        if(slug.isEmpty()||slug.length()>256)return;
        try{emit("invoice_closed",new JSONObject().put("slug",slug).put("status","failed"));}catch(Exception ignored){}
        unsupportedNotice("Los pagos por enlace de Mini Apps no están disponibles en esta versión: este binding de TDLib no expone InputInvoiceSlug.");
    }
    private void unsupportedNotice(String message){
        if(!allowed())return;
        long now=android.os.SystemClock.elapsedRealtime();
        if(lastUnsupportedNotice!=0&&now-lastUnsupportedNotice<4000)return;
        lastUnsupportedNotice=now;
        Toast.makeText(this,message,Toast.LENGTH_SHORT).show();
    }
    private void emitStatus(String event,String status){try{emit(event,new JSONObject().put("status",status));}catch(Exception ignored){}}
    private void viewport(){try{emit("viewport_changed",new JSONObject().put("height",web.getHeight()/getResources().getDisplayMetrics().density).put("is_expanded",true).put("is_state_stable",true));}catch(Exception ignored){}}
    private void emit(String type,JSONObject data){if(allowed())web.evaluateJavascript("window.Telegram&&window.Telegram.WebView&&window.Telegram.WebView.receiveEvent("+JSONObject.quote(type)+","+data+");",null);}
    private void close(){if(confirmClose)Dialogs.builder(this).setMessage("¿Cerrar la Mini App? Los cambios sin guardar pueden perderse.").setNegativeButton("Seguir",null).setPositiveButton("Cerrar",(d,w)->finish()).show();else finish();}
    @Override protected void onStart(){super.onStart();AppLock.activityStarted(this);if(launch!=null&&AppLock.enabled(this)&&!AppLock.isUnlocked()){finish();}}
    @Override protected void onStop(){AppLock.activityStopped(!isChangingConfigurations());super.onStop();}
    @Override protected void onResume(){super.onResume();if(launch!=null&&!AppLock.isUnlocked()&&AppLock.enabled(this)){finish();return;}if(launch!=null&&launch.session()!=((WrgramApplication)getApplication()).telegram()){finish();return;}if(locationSettingsOpened){locationSettingsOpened=false;if(hasLocationPermission()&&locationConsentState()!=0)miniAppPreferences().edit().putInt(locationConsentKey(),1).apply();checkLocation();}if(allowed()){emitTheme();if(fullscreen)setFullscreen(true);}}
    @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);if(!allowed())return;if(fullscreen)setFullscreen(true);else viewport();}
    @Override protected void onDestroy(){denyMedia();clearMiniAppStory();if(choosing!=null)choosing.onReceiveValue(null);if(web!=null){web.stopLoading();web.destroy();}if(launch!=null&&launch.webAppLaunchId()>0){WrgramApplication app=(WrgramApplication)getApplication();if(app.ageAccess().allowed()&&app.telegram()==launch.session()&&launch.session().ready())launch.session().perform(new org.drinkless.tdlib.TdApi.CloseWebApp(launch.webAppLaunchId()),ignored->{},error->{});}super.onDestroy();}
    private static final class MiniWebView extends WebView {
        MiniWebView(Context context){super(context);}
        @Override public boolean performClick(){return super.performClick();}
    }
}
