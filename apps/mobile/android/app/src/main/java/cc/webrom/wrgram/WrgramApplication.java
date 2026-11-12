package cc.webrom.wrgram;

import android.app.Application;

public final class WrgramApplication extends Application {
    private volatile TdSession telegram;
    private final java.util.LinkedHashMap<String,TdSession> accounts=new java.util.LinkedHashMap<>();
    private String currentSlot=AccountSlot.LEGACY;
    private AssistantController assistant;
    private AgeAccessStore ageAccess;
    private final TelegramCalls calls=new TelegramCalls(this);
    private final android.os.Handler accessTimer = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable expiry = () -> { if (!ageAccess.allowed()) { calls.accountChanged();for(TdSession session:accounts.values())session.pauseForAgeGate(); assistant.clear(); MiniAppLaunch.clear(); } };
    private final java.util.concurrent.ExecutorService storage = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.ExecutorService botNetwork = java.util.concurrent.Executors.newSingleThreadExecutor();

    @Override public void onCreate() {
        super.onCreate();
        ageAccess = new AgeAccessStore(this);
        android.content.SharedPreferences prefs=getSharedPreferences("accounts",0);
        accounts.put(AccountSlot.LEGACY,new TdSession(this));
        for(String slot:prefs.getString("slots","").split(","))try{if(!slot.isEmpty()&&accounts.size()<3&&!accounts.containsKey(slot))accounts.put(AccountSlot.validate(slot),new TdSession(this,slot));}catch(IllegalArgumentException ignored){}
        currentSlot=prefs.getString("active",AccountSlot.LEGACY);if(!accounts.containsKey(currentSlot))currentSlot=AccountSlot.LEGACY;
        telegram=accounts.get(currentSlot);
        assistant = new AssistantController();
        scheduleAgeExpiry();
        PushNotifications.initialize(this);
        ContactSync.schedule(this);
    }

    TdSession telegram() { return telegram; }
    TelegramCalls calls() { return calls; }
    String currentSlot(){return currentSlot;}
    java.util.Collection<TdSession> accounts(){return java.util.Collections.unmodifiableCollection(accounts.values());}
    TdSession account(String slot){return accounts.get(slot);}
    String addAccount(){for(java.util.Map.Entry<String,TdSession> entry:accounts.entrySet())if(!entry.getValue().ready())return entry.getKey();if(accounts.size()>=3)throw new IllegalStateException("Máximo de tres cuentas. Quita una cuenta sin iniciar sesión para añadir otra.");String slot=java.util.UUID.randomUUID().toString().replace("-","");accounts.put(slot,new TdSession(this,slot));getSharedPreferences("accounts",0).edit().putString("slots",String.join(",",accounts.keySet())).apply();return slot;}
    boolean removeAccount(String slot){if(AccountSlot.LEGACY.equals(slot))return false;TdSession target=accounts.get(slot);if(target==null||target.ready()||slot.equals(currentSlot))return false;accounts.remove(slot);target.discard();getSharedPreferences("accounts",0).edit().putString("slots",String.join(",",accounts.keySet())).apply();return true;}
    void switchAccount(String slot){TdSession next=accounts.get(slot);if(next==null||!ageAccess.allowed())throw new IllegalArgumentException("Cuenta no disponible");calls.accountChanged();telegram.closeChat();assistant.clear();MiniAppLaunch.clear();currentSlot=slot;telegram=next;getSharedPreferences("accounts",0).edit().putString("active",slot).apply();}
    AssistantController assistant() { return assistant; }
    AgeAccessStore ageAccess() { return ageAccess; }
    void scheduleAgeExpiry() {
        accessTimer.removeCallbacks(expiry);
        AgePolicy.Receipt receipt = ageAccess.receipt();
        if (ageAccess.allowed()) accessTimer.postDelayed(expiry, Math.max(1, receipt.expiresAt() - System.currentTimeMillis()));
        else expiry.run();
    }
    java.util.concurrent.ExecutorService storage() { return storage; }
    java.util.concurrent.ExecutorService botNetwork() { return botNetwork; }
}
