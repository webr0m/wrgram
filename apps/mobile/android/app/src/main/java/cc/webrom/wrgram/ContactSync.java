package cc.webrom.wrgram;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Shared phonebook import used by the foreground bridge and the periodic WorkManager job. */
final class ContactSync {
    static final String WORK = "wrgram.contact.sync";
    static final int MAX_CONTACTS = 200;

    static final class Contact {
        final String first, last, phone;
        Contact(String first,String last,String phone){this.first=first;this.last=last;this.phone=phone;}
        String label(){return (first+" "+last).trim()+" · "+phone;}
    }

    private ContactSync(){}

    static SharedPreferences prefs(Context context){return context.getSharedPreferences("appearance",0);}
    static boolean enabled(Context context,long owner){return owner>0&&prefs(context).getBoolean("contacts.sync."+owner,false);}
    static void setEnabled(Context context,long owner,boolean value){prefs(context).edit().putBoolean("contacts.sync."+owner,value).apply();}
    static boolean hasPermission(Context context){return ContextCompat.checkSelfPermission(context,Manifest.permission.READ_CONTACTS)==PackageManager.PERMISSION_GRANTED;}

    static boolean anyEnabled(Context context){
        for(String key:prefs(context).getAll().keySet())if(key.startsWith("contacts.sync.")&&!key.substring("contacts.sync.".length()).contains(".")&&prefs(context).getBoolean(key,false))return true;
        return false;
    }

    static long ownerOf(Context context,TdSession session){
        if(session.ready())return session.selfId;
        return context.getSharedPreferences("accounts",0).getLong("user."+session.slot,0);
    }

    static ArrayList<Contact> read(Context context)throws Exception{
        LinkedHashMap<String,Contact> contacts=new LinkedHashMap<>();
        String[] columns={ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,ContactsContract.CommonDataKinds.Phone.NUMBER,ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER};
        try(Cursor cursor=context.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,columns,null,null,ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY+" COLLATE NOCASE ASC")){
            if(cursor!=null){
                int nameColumn=cursor.getColumnIndex(columns[0]),phoneColumn=cursor.getColumnIndex(columns[1]),normalizedColumn=cursor.getColumnIndex(columns[2]);
                while(cursor.moveToNext()&&contacts.size()<MAX_CONTACTS){
                    String raw=normalizedColumn>=0?cursor.getString(normalizedColumn):null;
                    if(raw==null||raw.isBlank())raw=phoneColumn<0?"":cursor.getString(phoneColumn);
                    String phone=normalize(raw);
                    if(phone==null||contacts.containsKey(phone))continue;
                    String full=nameColumn<0?"":cursor.getString(nameColumn);
                    String[] parts=(full==null?"":full.trim()).split("\\s+",2);
                    String first=parts.length==0||parts[0].isBlank()?"Contacto":NativeSnapshot.limit(parts[0],64);
                    String last=parts.length<2?"":NativeSnapshot.limit(parts[1],64);
                    contacts.put(phone,new Contact(first,last,phone));
                }
            }
        }
        return new ArrayList<>(contacts.values());
    }

    static String normalize(String raw){
        if(raw==null)return null;
        String phone=raw.trim().replaceAll("[^+0-9]","");
        String digits=phone.replace("+","");
        return phone.startsWith("+")&&phone.indexOf('+',1)<0&&digits.length()>=7&&digits.length()<=15?phone:null;
    }

    static String fingerprint(List<Contact> contacts){
        try{
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            StringBuilder value=new StringBuilder();
            for(Contact contact:contacts)value.append(contact.phone).append('|').append(contact.first).append('|').append(contact.last).append('\n');
            byte[] hash=digest.digest(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex=new StringBuilder();
            for(byte item:hash)hex.append(String.format(Locale.ROOT,"%02x",item&255));
            return hex.toString();
        }catch(Exception ignored){return Integer.toHexString(contacts.hashCode());}
    }

    static String lastFingerprint(Context context,long owner){return prefs(context).getString("contacts.sync."+owner+".fingerprint","");}
    static void recordSuccess(Context context,long owner,String fingerprint,int matched,int imported){prefs(context).edit().putLong("contacts.sync."+owner+".last",System.currentTimeMillis()/1000).putInt("contacts.sync."+owner+".matched",matched).putInt("contacts.sync."+owner+".imported",imported).putString("contacts.sync."+owner+".fingerprint",fingerprint).putBoolean("contacts.sync."+owner+".skipped",false).putString("contacts.sync."+owner+".error","").apply();}
    static void recordSkipped(Context context,long owner){prefs(context).edit().putLong("contacts.sync."+owner+".last",System.currentTimeMillis()/1000).putBoolean("contacts.sync."+owner+".skipped",true).putString("contacts.sync."+owner+".error","").apply();}
    static void recordError(Context context,long owner,String error){prefs(context).edit().putString("contacts.sync."+owner+".error",error==null?"No se pudo sincronizar la agenda.":error).apply();}

    /** Schedules the periodic job only while at least one account keeps the option enabled. */
    static void schedule(Context context){
        try{
            WorkManager manager=WorkManager.getInstance(context);
            if(!anyEnabled(context)){manager.cancelUniqueWork(WORK);return;}
            Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(ContactSyncWork.class,24,TimeUnit.HOURS,1,TimeUnit.HOURS).setConstraints(constraints).build();
            manager.enqueueUniquePeriodicWork(WORK,ExistingPeriodicWorkPolicy.UPDATE,request);
        }catch(RuntimeException ignored){}
    }

    static void refreshSchedule(Context context){
        try{
            if(anyEnabled(context))schedule(context);
            else WorkManager.getInstance(context).cancelUniqueWork(WORK);
        }catch(RuntimeException ignored){}
    }
}
