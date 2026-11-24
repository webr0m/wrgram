package cc.webrom.wrgram;

import org.json.JSONObject;

final class AccountSafetyPolicy {
    static JSONObject sponsoredSettings(boolean premium,boolean enabled) {
        try{return new JSONObject().put("premium",premium).put("canDisable",premium).put("enabled",!premium||enabled);}
        catch(Exception invalid){throw new IllegalArgumentException("No se pudo leer el estado de los patrocinados.");}
    }
    static void owner(JSONObject params,long selfId) {
        if(selfId<=0||BridgePolicy.id(params,"accountId")!=selfId)throw new IllegalArgumentException("La cuenta cambió. Vuelve a abrir este ajuste.");
    }
    static int autoDeleteSeconds(JSONObject params) {
        Object raw=params.opt("seconds");
        if(!(raw instanceof Integer)&&!(raw instanceof Long))throw new IllegalArgumentException("Duración no válida.");
        long seconds=((Number)raw).longValue();
        if(seconds<0||seconds>365L*86400||seconds%86400!=0)throw new IllegalArgumentException("Elige de 0 a 365 días completos.");
        return (int)seconds;
    }
    static String recoveryEmail(JSONObject params) {
        String email=BridgePolicy.text(params,"email",254).trim();
        if(!email.matches("[^\\s@\\p{Cntrl}]+@[^\\s@\\p{Cntrl}]+"))throw new IllegalArgumentException("Escribe un correo de recuperación válido.");
        return email;
    }
    static String code(JSONObject params) {
        String code=BridgePolicy.text(params,"code",64).trim();
        if(code.isEmpty())throw new IllegalArgumentException("Escribe el código recibido por correo.");
        return code;
    }
    static String phoneCode(JSONObject params) {
        String code=BridgePolicy.text(params,"code",32).trim();
        if(code.isEmpty())throw new IllegalArgumentException("Escribe el código que llegó a tu teléfono.");
        return code;
    }
}
