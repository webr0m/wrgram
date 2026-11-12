package cc.webrom.wrgram;

/** Short-lived one-use handle. Signed Mini App URLs never cross the React bridge or Intents. */
final class MiniAppLaunch {
    record Launch(TdSession session,String title,String url,long botUserId,String buttonText,boolean keyboardData,long webAppLaunchId,long created){}
    private static final java.util.Map<String,Launch> pending=new java.util.HashMap<>();
    static synchronized String put(TdSession session,String title,String url){return put(session,title,url,0,"",false,0);}
    static synchronized String put(TdSession session,String title,String url,long webAppLaunchId){return put(session,title,url,0,"",false,webAppLaunchId);}
    static synchronized String putKeyboard(TdSession session,String title,String url,long botUserId,String buttonText){if(botUserId<=0||buttonText==null||buttonText.length()>128)throw new IllegalArgumentException("Invalid reply-keyboard Mini App");return put(session,title,url,botUserId,buttonText,true,0);}
    private static String put(TdSession session,String title,String url,long botUserId,String buttonText,boolean keyboardData,long webAppLaunchId){MiniAppPolicy.origin(url);pending.clear();String handle=java.util.UUID.randomUUID().toString();pending.put(handle,new Launch(session,title,url,botUserId,buttonText,keyboardData,webAppLaunchId,android.os.SystemClock.elapsedRealtime()));return handle;}
    static synchronized Launch take(String handle){Launch launch=pending.remove(handle);return launch!=null&&android.os.SystemClock.elapsedRealtime()-launch.created<30_000?launch:null;}
    static synchronized void clear(){pending.clear();}
}
