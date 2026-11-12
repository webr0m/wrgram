package cc.webrom.wrgram;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.drinkless.tdlib.TdApi;

/** Periodic phonebook import; starts a TDLib client only when no foreground screen owns one. */
public final class ContactSyncWork extends Worker {
    private static final long ACCOUNT_WAIT_MS=75_000;
    public ContactSyncWork(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}

    @NonNull @Override public Result doWork(){
        WrgramApplication app=(WrgramApplication)getApplicationContext();
        if(!app.ageAccess().allowed()||!ContactSync.hasPermission(app)||!ContactSync.anyEnabled(app))return Result.success();
        ArrayList<ContactSync.Contact> values;
        try{values=ContactSync.read(app);}catch(Exception error){return getRunAttemptCount()<2?Result.retry():Result.success();}
        CountDownLatch done=new CountDownLatch(1);
        new Handler(Looper.getMainLooper()).post(()->runAccounts(app,values,done));
        try{done.await(4,TimeUnit.MINUTES);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}
        return Result.success();
    }

    private void runAccounts(WrgramApplication app,ArrayList<ContactSync.Contact> values,CountDownLatch done){
        ArrayList<TdSession> sessions=new ArrayList<>(app.accounts());
        step(app,sessions,0,values,done);
    }

    private void step(WrgramApplication app,ArrayList<TdSession> sessions,int index,ArrayList<ContactSync.Contact> values,CountDownLatch done){
        if(index>=sessions.size()){done.countDown();return;}
        TdSession session=sessions.get(index);
        long owner=ContactSync.ownerOf(app,session);
        if(owner<=0||!ContactSync.enabled(app,owner)||!session.consent()){step(app,sessions,index+1,values,done);return;}
        if(session.ready()){importContacts(app,session,owner,values,false,()->step(app,sessions,index+1,values,done));return;}
        boolean started=false;
        if(session.clientActive())started=true;
        else{session.start();started=session.clientActive();}
        waitReady(app,session,owner,values,started,SystemClock.elapsedRealtime()+ACCOUNT_WAIT_MS,()->step(app,sessions,index+1,values,done));
    }

    private void waitReady(WrgramApplication app,TdSession session,long owner,ArrayList<ContactSync.Contact> values,boolean started,long deadline,Runnable next){
        if(session.ready()){importContacts(app,session,owner,values,started,next);return;}
        if(SystemClock.elapsedRealtime()>=deadline){if(started)session.closeBackground();next.run();return;}
        new Handler(Looper.getMainLooper()).postDelayed(()->waitReady(app,session,owner,values,started,deadline,next),750);
    }

    private void importContacts(WrgramApplication app,TdSession session,long owner,ArrayList<ContactSync.Contact> values,boolean started,Runnable next){
        String fingerprint=ContactSync.fingerprint(values);
        if(values.isEmpty()){ContactSync.recordError(app,owner,"No se encontraron contactos con un número válido.");finish(session,started,next);return;}
        if(fingerprint.equals(ContactSync.lastFingerprint(app,owner))){ContactSync.recordSkipped(app,owner);finish(session,started,next);return;}
        ArrayList<TdApi.ImportedContact> imported=new ArrayList<>(values.size());
        for(ContactSync.Contact contact:values)imported.add(new TdApi.ImportedContact(contact.phone,contact.first,contact.last,null));
        session.perform(new TdApi.ImportContacts(imported.toArray(new TdApi.ImportedContact[0])),result->{
            int matched=0;
            if(result.userIds!=null)for(long id:result.userIds)if(id>0)matched++;
            ContactSync.recordSuccess(app,owner,fingerprint,matched,imported.size());
            finish(session,started,next);
        },error->{
            ContactSync.recordError(app,owner,error);
            finish(session,started,next);
        });
    }

    private void finish(TdSession session,boolean started,Runnable next){
        if(started&&!session.observed())session.closeBackground();
        next.run();
    }
}
