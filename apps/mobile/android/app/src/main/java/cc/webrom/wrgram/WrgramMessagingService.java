package cc.webrom.wrgram;

import android.os.Handler;
import android.os.Looper;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;

public final class WrgramMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token){new Handler(Looper.getMainLooper()).post(()->{WrgramApplication app=(WrgramApplication)getApplication();if(!PushNotifications.enabled(app)||!app.ageAccess().allowed())return;for(TdSession session:app.accounts())if(session.consent()&&app.getSharedPreferences("accounts",0).getLong("user."+session.slot,0)>0)session.start();PushNotifications.register(app,token);});}
    @Override public void onMessageReceived(RemoteMessage message){try{String payload=new JSONObject(message.getData()).toString();if(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>8192)return;androidx.work.OneTimeWorkRequest.Builder builder=new androidx.work.OneTimeWorkRequest.Builder(PushWork.class).setInputData(new androidx.work.Data.Builder().putString("payload",payload).build());if(android.os.Build.VERSION.SDK_INT>=31&&message.getPriority()==RemoteMessage.PRIORITY_HIGH)builder.setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);androidx.work.WorkManager.getInstance(this).enqueue(builder.build());}catch(Exception ignored){}}
}
