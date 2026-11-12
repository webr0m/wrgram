package cc.webrom.wrgram;

import android.Manifest;
import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.drinkless.tdlib.Client;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/** Opt-in FCM -> encrypted Telegram push -> native TDLib notifications; never accepts message text from FCM. */
final class PushNotifications {
    private static final String CHANNEL="wrgram.messages.v1",SILENT="wrgram.messages.silent.v1";
    static boolean enabled(Context c){return c.getSharedPreferences("notifications",0).getBoolean("enabled",false);}
    static boolean permitted(Context c){return Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
    static JSONObject status(Context c)throws Exception{String slot=((WrgramApplication)c.getApplicationContext()).currentSlot();return new JSONObject().put("configured",BuildConfig.FCM_CONFIGURED).put("missing",BuildConfig.FCM_MISSING).put("enabled",enabled(c)).put("permission",permitted(c)).put("provider","FCM").put("registered",c.getSharedPreferences("notifications",0).getLong("receiver."+slot,0)!=0).put("status",c.getSharedPreferences("notifications",0).getString("status."+slot,"Pendiente de registro en Telegram"));}
    static void enable(WrgramApplication app){if(!BuildConfig.FCM_CONFIGURED||!app.ageAccess().allowed()||!permitted(app))return;app.getSharedPreferences("notifications",0).edit().putBoolean("enabled",true).apply();initialize(app);}
    static void disable(WrgramApplication app){app.getSharedPreferences("notifications",0).edit().putBoolean("enabled",false).apply();for(TdSession session:app.accounts()){if(session.ready())session.perform(new TdApi.RegisterDevice(new TdApi.DeviceTokenFirebaseCloudMessaging("",true),new long[0]),receiver->{},failure->{});clearReceiver(app,session.slot);}if(BuildConfig.FCM_CONFIGURED&&!FirebaseApp.getApps(app).isEmpty()){FirebaseMessaging.getInstance().setAutoInitEnabled(false);FirebaseMessaging.getInstance().deleteToken();}}
    static void initialize(WrgramApplication app){if(!BuildConfig.FCM_CONFIGURED||!enabled(app)||!app.ageAccess().allowed())return;
        if(FirebaseApp.getApps(app).isEmpty()){FirebaseOptions options=new FirebaseOptions.Builder().setApplicationId(BuildConfig.FCM_APPLICATION_ID).setApiKey(BuildConfig.FCM_API_KEY).setProjectId(BuildConfig.FCM_PROJECT_ID).setGcmSenderId(BuildConfig.FCM_SENDER_ID).build();FirebaseApp instance=FirebaseApp.initializeApp(app,options);if(instance!=null)instance.setDataCollectionDefaultEnabled(false);}
        FirebaseMessaging.getInstance().setAutoInitEnabled(true);FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->register(app,token)).addOnFailureListener(failure->app.getSharedPreferences("notifications",0).edit().putString("status."+app.currentSlot(),"Google no pudo registrar el dispositivo. Revisa la configuración de Firebase y la conexión.").apply());
    }
    static void register(WrgramApplication app,String token){if(!enabled(app)||!app.ageAccess().allowed()||token==null||token.isEmpty())return;for(TdSession session:app.accounts())if(session.ready()){
        long[] others=app.accounts().stream().filter(s->s!=session).mapToLong(s->s.ready()?s.selfId:app.getSharedPreferences("accounts",0).getLong("user."+s.slot,0)).filter(id->id>0).distinct().toArray();session.perform(new TdApi.RegisterDevice(new TdApi.DeviceTokenFirebaseCloudMessaging(token,true),others),receiver->{if(session.ready()&&enabled(app)){app.getSharedPreferences("notifications",0).edit().putLong("receiver."+session.slot,receiver.id).putString("status."+session.slot,"Registro de Telegram confirmado; falta validar entrega en un teléfono.").apply();session.notificationStatusChanged();}},failure->{app.getSharedPreferences("notifications",0).edit().putString("status."+session.slot,"Telegram no confirmó el registro. "+failure).apply();session.notificationStatusChanged();});
    }}
    static void authorized(TdSession session,Context c){WrgramApplication app=(WrgramApplication)c;if(enabled(app))initialize(app);}
    static void clearReceiver(Context c,String slot){c.getSharedPreferences("notifications",0).edit().remove("receiver."+slot).apply();NotificationManager manager=c.getSystemService(NotificationManager.class);if(manager!=null)for(android.service.notification.StatusBarNotification item:manager.getActiveNotifications())if(item.getTag()!=null&&item.getTag().startsWith("account."+slot+"."))manager.cancel(item.getTag(),item.getId());}
    static void process(WrgramApplication app,String payload,java.util.function.Consumer<Boolean> done){if(!BuildConfig.FCM_CONFIGURED||!enabled(app)||!app.ageAccess().allowed()||payload.length()>65536){done.accept(true);return;}
        try{System.loadLibrary("c++_shared");System.loadLibrary("cryptox");System.loadLibrary("sslx");System.loadLibrary("tdjni");TdApi.Object receiver=Client.execute(new TdApi.GetPushReceiverId(payload));if(receiver instanceof TdApi.PushReceiverId){long id=((TdApi.PushReceiverId)receiver).id;if(id!=0)for(TdSession session:app.accounts())if(app.getSharedPreferences("notifications",0).getLong("receiver."+session.slot,0)==id){session.receivePush(payload,done);return;}}done.accept(true);}catch(Throwable ignored){done.accept(false);}
    }
    private static long lastMessage(TdApi.UpdateNotificationGroup group){long id=0;if(group.addedNotifications==null)return id;for(TdApi.Notification item:group.addedNotifications){if(item!=null&&item.type instanceof TdApi.NotificationTypeNewMessage){TdApi.Message message=((TdApi.NotificationTypeNewMessage)item.type).message;if(message!=null&&message.id>id)id=message.id;}}return id;}
    static void update(Context c,TdSession session,TdApi.UpdateNotificationGroup group){if(!enabled(c)||!permitted(c)||!((WrgramApplication)c).ageAccess().allowed())return;NotificationManager manager=c.getSystemService(NotificationManager.class);if(manager==null)return;String tag="account."+session.slot+".group."+group.notificationGroupId;if(group.totalCount==0){manager.cancel(tag,1);return;}if(group.addedNotifications==null||group.addedNotifications.length==0)return;
        TdApi.Chat settings=session.chat(group.notificationSettingsChatId!=0?group.notificationSettingsChatId:group.chatId);if(settings!=null&&settings.notificationSettings!=null&&!settings.notificationSettings.useDefaultMuteFor&&settings.notificationSettings.muteFor>(System.currentTimeMillis()/1000)){manager.cancel(tag,1);return;}
        NotificationChannel audible=new NotificationChannel(CHANNEL,"Mensajes de Telegram",NotificationManager.IMPORTANCE_DEFAULT);NotificationChannel silent=new NotificationChannel(SILENT,"Mensajes silenciosos",NotificationManager.IMPORTANCE_LOW);silent.setSound(null,null);manager.createNotificationChannel(audible);manager.createNotificationChannel(silent);
        long message=lastMessage(group);
        Intent intent=new Intent(c,NotificationOpenActivity.class).putExtra("slot",session.slot).putExtra("chat",group.chatId).putExtra("message",message).setData(android.net.Uri.parse("wrgram-notification://"+session.slot+"/"+group.chatId+(message!=0?"/"+message:"")));PendingIntent open=PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(c,group.notificationSoundId==0?SILENT:CHANNEL).setSmallIcon(cc.webrom.wrgram.R.drawable.brand_foreground).setColor(Palette.get(c).accent).setContentTitle("WRGram").setContentText("Tienes mensajes nuevos en Telegram").setNumber(group.totalCount).setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_SECRET).setCategory(Notification.CATEGORY_MESSAGE).build();
        try{manager.notify(tag,1,notification);}catch(SecurityException ignored){}
    }
}
