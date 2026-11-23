package cc.webrom.wrgram;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que Android entrega al compartir hacia WRGram, medido contra las dos acciones del sistema:
 * {@code ACTION_SEND} trae texto y, a veces, un archivo; {@code ACTION_SEND_MULTIPLE} trae hasta diez
 * archivos y ningún texto. El texto se recorta al tope de mensaje de Telegram (4096) y los nombres se
 * sanean con la misma regla que el selector del sistema, para que la copia privada no herede rutas raras.
 */
final class ShareInbox {
    static final String SEND="android.intent.action.SEND";
    static final String SEND_MULTIPLE="android.intent.action.SEND_MULTIPLE";
    static final int MAX_ITEMS=10;
    static final int MAX_TEXT=4096;
    private ShareInbox(){}
    static JSONObject payload(String action,String type,String text,List<String> uris) throws Exception {
        if(!SEND.equals(action)&&!SEND_MULTIPLE.equals(action))return null;
        String body=SEND.equals(action)&&text!=null?text.trim():"";
        if(body.length()>MAX_TEXT)body=body.substring(0,MAX_TEXT);
        JSONArray items=new JSONArray();
        if(uris!=null)for(String uri:uris){if(uri==null||uri.isBlank())continue;if(items.length()>=MAX_ITEMS)break;items.put(uri);}
        if(body.isEmpty()&&items.length()==0)return null;
        JSONObject value=new JSONObject();
        value.put("text",body);
        value.put("mime",type==null||type.isBlank()?"*/*":type);
        value.put("items",items);
        return value;
    }
    static String nameOf(String raw){
        String name=raw==null?"archivo":raw.replaceAll("[^\\p{L}\\p{N}._ -]","_");
        if(name.length()>90)name=name.substring(name.length()-90);
        if(name.isBlank()||name.startsWith("."))name="archivo";
        return name;
    }
}