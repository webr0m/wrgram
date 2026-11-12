package cc.webrom.wrgram;

import android.content.Context;
import org.json.JSONObject;

/** Launcher shortcuts store only the bot and account; the signed URL is fetched again on open. */
final class MiniAppShortcuts {
    record Entry(String slot,long botUserId,String title){}
    private static final String PREFS="miniapp-shortcuts";
    private MiniAppShortcuts(){}

    static String id(String slot,long botUserId){return "wrgram-"+slot+"-"+botUserId;}

    static synchronized String put(Context context,String slot,long botUserId,String title){
        if(slot==null||slot.isEmpty()||botUserId<=0)return null;
        try{
            JSONObject value=new JSONObject().put("slot",slot).put("bot",botUserId).put("title",NativeSnapshot.limit(title==null?"Mini App":title,80));
            context.getSharedPreferences(PREFS,0).edit().putString(id(slot,botUserId),value.toString()).apply();
            return id(slot,botUserId);
        }catch(Exception ignored){return null;}
    }

    static synchronized Entry get(Context context,String handle){
        if(handle==null||handle.length()>128)return null;
        String raw=context.getSharedPreferences(PREFS,0).getString(handle,null);
        if(raw==null)return null;
        try{
            JSONObject value=new JSONObject(raw);
            String slot=value.optString("slot");
            long bot=value.optLong("bot",0);
            String title=value.optString("title","Mini App");
            if(slot.isEmpty()||bot<=0)return null;
            return new Entry(slot,bot,title);
        }catch(Exception ignored){return null;}
    }
}
