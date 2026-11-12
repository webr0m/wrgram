package cc.webrom.wrgram;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** WorkManager owns the background lifetime while TDLib decrypts/handles the account-specific push. */
public final class PushWork extends Worker {
    public PushWork(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    @NonNull @Override public Result doWork(){String payload=getInputData().getString("payload");if(payload==null)return Result.success();java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.atomic.AtomicBoolean ok=new java.util.concurrent.atomic.AtomicBoolean();new android.os.Handler(android.os.Looper.getMainLooper()).post(()->PushNotifications.process((WrgramApplication)getApplicationContext(),payload,value->{ok.set(value);done.countDown();}));try{if(done.await(25,java.util.concurrent.TimeUnit.SECONDS)&&ok.get())return Result.success();}catch(InterruptedException ignored){Thread.currentThread().interrupt();}return getRunAttemptCount()<2?Result.retry():Result.failure();}
}
