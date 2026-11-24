package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/**
 * Cambiar el número de teléfono no es un paso de inicio de sesión. `SendPhoneNumberCode`
 * (TdApi.java:148644) con `PhoneNumberCodeTypeChange` (TdApi.java:63859) contesta un
 * `AuthenticationCodeInfo` (TdApi.java:3380) con la sesión ya abierta, `CheckPhoneNumberCode`
 * (TdApi.java:112596) contesta `Ok` y `ResendPhoneNumberCode` (TdApi.java:144644) solo funciona si el
 * `nextType` recibido no era nulo y el `timeout` del servidor pasó. Esta clase es la única que traduce
 * ese objeto a lo que la pantalla puede prometer; no guarda el código —se lee, se envía y se olvida— ni
 * toca la sesión, así que se prueba sin cuenta.
 */
final class PhoneChange {
    /** La misma regla que `TdSession.authenticate` usa para el número del inicio de sesión (TdSession.java:532). */
    private static final String INTERNATIONAL = "\\+[1-9][0-9]{6,14}";

    private PhoneChange() {}

    /** Deja el número en formato internacional o devuelve `null` si no puede serlo. */
    static String number(String raw) {
        if (raw == null) return null;
        String value = raw.replaceAll("[\\s()-]", "");
        return value.matches(INTERNATIONAL) ? value : null;
    }

    /** Cómo llegó el código. Las nueve variantes están en TdApi.java:3472-3744. */
    static String describe(TdApi.AuthenticationCodeType type) {
        if (type instanceof TdApi.AuthenticationCodeTypeTelegramMessage) return "un mensaje dentro de Telegram";
        if (type instanceof TdApi.AuthenticationCodeTypeSms) return "un SMS";
        if (type instanceof TdApi.AuthenticationCodeTypeCall) return "una llamada que tienes que descolgar";
        if (type instanceof TdApi.AuthenticationCodeTypeFlashCall) return "una llamada automática que no hace falta descolgar";
        if (type instanceof TdApi.AuthenticationCodeTypeMissedCall) return "una llamada perdida cuyo prefijo marca el código";
        if (type instanceof TdApi.AuthenticationCodeTypeFragment) return "un mensaje del servicio Fragment";
        if (type instanceof TdApi.AuthenticationCodeTypeFirebaseAndroid) return "una recepción automática del SMS por Google Play";
        if (type instanceof TdApi.AuthenticationCodeTypeSmsPhrase) return "un SMS que empieza por una frase";
        if (type instanceof TdApi.AuthenticationCodeTypeSmsWord) return "un SMS que empieza por una palabra";
        return "otro medio";
    }

    /** Cuántos caracteres tiene el código; cero cuando el medio no lo dice. */
    static int length(TdApi.AuthenticationCodeType type) {
        if (type instanceof TdApi.AuthenticationCodeTypeSms) return ((TdApi.AuthenticationCodeTypeSms) type).length;
        if (type instanceof TdApi.AuthenticationCodeTypeCall) return ((TdApi.AuthenticationCodeTypeCall) type).length;
        if (type instanceof TdApi.AuthenticationCodeTypeMissedCall) return ((TdApi.AuthenticationCodeTypeMissedCall) type).length;
        if (type instanceof TdApi.AuthenticationCodeTypeFragment) return ((TdApi.AuthenticationCodeTypeFragment) type).length;
        if (type instanceof TdApi.AuthenticationCodeTypeTelegramMessage) return ((TdApi.AuthenticationCodeTypeTelegramMessage) type).length;
        if (type instanceof TdApi.AuthenticationCodeTypeFirebaseAndroid) return ((TdApi.AuthenticationCodeTypeFirebaseAndroid) type).length;
        return 0;
    }

    /** Lo que hay que buscar antes de escribir: un patrón, un prefijo, la frase o la palabra inicial. */
    static String hint(TdApi.AuthenticationCodeType type) {
        if (type instanceof TdApi.AuthenticationCodeTypeFlashCall) return text(((TdApi.AuthenticationCodeTypeFlashCall) type).pattern);
        if (type instanceof TdApi.AuthenticationCodeTypeMissedCall) return text(((TdApi.AuthenticationCodeTypeMissedCall) type).phoneNumberPrefix);
        if (type instanceof TdApi.AuthenticationCodeTypeFragment) return text(((TdApi.AuthenticationCodeTypeFragment) type).url);
        if (type instanceof TdApi.AuthenticationCodeTypeSmsPhrase) return text(((TdApi.AuthenticationCodeTypeSmsPhrase) type).firstWord);
        if (type instanceof TdApi.AuthenticationCodeTypeSmsWord) return text(((TdApi.AuthenticationCodeTypeSmsWord) type).firstLetter);
        return "";
    }

    /** `ResendPhoneNumberCode` solo vale si el servidor prometió un medio siguiente. */
    static boolean canResend(TdApi.AuthenticationCodeInfo info) {
        return info != null && info.nextType != null;
    }

    /** Telegram distingue el reenvío pedido de brazo del reenvío que sigue a un código rechazado. */
    static TdApi.ResendCodeReason resendReason(boolean verificationFailed) {
        return verificationFailed ? new TdApi.ResendCodeReasonVerificationFailed() : new TdApi.ResendCodeReasonUserRequest();
    }

    /** Lo que viaja al puente: nunca el código, que no se guarda en ninguna capa. */
    static JSONObject project(TdApi.AuthenticationCodeInfo info) throws Exception {
        JSONObject value = new JSONObject();
        if (info == null) return value;
        return value
            .put("phone", text(info.phoneNumber))
            .put("sent", describe(info.type))
            .put("next", info.nextType == null ? "" : describe(info.nextType))
            .put("length", length(info.type))
            .put("hint", hint(info.type))
            .put("timeout", Math.max(0, info.timeout));
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }
}
