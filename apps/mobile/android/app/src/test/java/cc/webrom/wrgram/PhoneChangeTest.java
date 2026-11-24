package cc.webrom.wrgram;

import static org.junit.Assert.*;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Cambiar el número no pasa por la máquina de estados de inicio de sesión: `SendPhoneNumberCode`
 * (TdApi.java:148644) con `PhoneNumberCodeTypeChange` (TdApi.java:63859) contesta un
 * `AuthenticationCodeInfo` (TdApi.java:3380) y `CheckPhoneNumberCode` (TdApi.java:112596) contesta `Ok`,
 * así que la sesión se mantiene abierta mientras el asistente dura. Lo que la persona necesita ver sale
 * todo de ese objeto: el medio por el que llegó el código (nueve variantes, TdApi.java:3472-3744, cada una
 * con su propio campo), cuánto tarda, y si existe un medio siguiente, porque `ResendPhoneNumberCode`
 * (TdApi.java:144644) solo funciona «if the previously received authenticationCodeInfo.nextType was not
 * null and the server-specified timeout has passed». El código en sí no se guarda en ninguna parte: se
 * lee, se envía y se olvida.
 */
public class PhoneChangeTest {
    private static TdApi.AuthenticationCodeInfo info(TdApi.AuthenticationCodeType type, TdApi.AuthenticationCodeType next, int timeout) {
        TdApi.AuthenticationCodeInfo value = new TdApi.AuthenticationCodeInfo();
        value.phoneNumber = "+34600123456";
        value.type = type;
        value.nextType = next;
        value.timeout = timeout;
        return value;
    }

    @Test public void normalizaElNumeroYRechazaLoQueNoLoEs() {
        assertEquals("+34600123456", PhoneChange.number(" +34 600-123 (456) "));
        assertEquals("+34600123456", PhoneChange.number("+34600123456"));
        assertNull(PhoneChange.number("600123456"));
        assertNull(PhoneChange.number("+034600123456"));
        assertNull(PhoneChange.number("+34601"));
        assertNull(PhoneChange.number("+346001234561234567"));
        assertNull(PhoneChange.number(null));
    }

    @Test public void cadaMedioTieneSuFraseYSoloUnoEsElAutomatico() {
        List<TdApi.AuthenticationCodeType> types = Arrays.asList(
            new TdApi.AuthenticationCodeTypeTelegramMessage(), new TdApi.AuthenticationCodeTypeSms(),
            new TdApi.AuthenticationCodeTypeCall(), new TdApi.AuthenticationCodeTypeFlashCall(),
            new TdApi.AuthenticationCodeTypeMissedCall(), new TdApi.AuthenticationCodeTypeFragment(),
            new TdApi.AuthenticationCodeTypeFirebaseAndroid(), new TdApi.AuthenticationCodeTypeSmsPhrase(),
            new TdApi.AuthenticationCodeTypeSmsWord());
        List<String> labels = new ArrayList<>();
        for (TdApi.AuthenticationCodeType type : types) {
            String label = PhoneChange.describe(type);
            assertFalse(type.getClass().getSimpleName() + " se queda sin frase", label.isEmpty());
            labels.add(label);
        }
        assertEquals("dos medios comparten frase", 9, labels.stream().distinct().count());
    }

    @Test public void laLongitudDelCodigoSoloLaTieneQuienLaRecibe() {
        TdApi.AuthenticationCodeTypeSms sms = new TdApi.AuthenticationCodeTypeSms();
        sms.length = 5;
        assertEquals(5, PhoneChange.length(sms));
        TdApi.AuthenticationCodeTypeTelegramMessage message = new TdApi.AuthenticationCodeTypeTelegramMessage();
        message.length = 6;
        assertEquals(6, PhoneChange.length(message));
        TdApi.AuthenticationCodeTypeFlashCall call = new TdApi.AuthenticationCodeTypeFlashCall();
        call.pattern = "XXNNN";
        assertEquals(0, PhoneChange.length(call));
        assertEquals("XXNNN", PhoneChange.hint(call));
        assertEquals(0, PhoneChange.length(new TdApi.AuthenticationCodeTypeSmsPhrase()));
    }

    @Test public void laPistaDependeDelMedioYElCodigoNunca() {
        TdApi.AuthenticationCodeTypeSmsPhrase phrase = new TdApi.AuthenticationCodeTypeSmsPhrase();
        phrase.firstWord = "Cobertura";
        assertEquals("Cobertura", PhoneChange.hint(phrase));
        TdApi.AuthenticationCodeTypeSmsWord word = new TdApi.AuthenticationCodeTypeSmsWord();
        word.firstLetter = "R";
        assertEquals("R", PhoneChange.hint(word));
        TdApi.AuthenticationCodeTypeFragment fragment = new TdApi.AuthenticationCodeTypeFragment();
        fragment.url = "https://fragment/tg://confirm";
        fragment.length = 4;
        assertEquals("https://fragment/tg://confirm", PhoneChange.hint(fragment));
        assertEquals("un SMS no tiene pista que mostrar", "", PhoneChange.hint(new TdApi.AuthenticationCodeTypeSms()));
        assertEquals("una llamada no tiene pista que mostrar", "", PhoneChange.hint(new TdApi.AuthenticationCodeTypeCall()));
    }

    @Test public void elPrefijoDeLaLlamadaPerdidaTambienEsPista() {
        TdApi.AuthenticationCodeTypeMissedCall missed = new TdApi.AuthenticationCodeTypeMissedCall();
        missed.phoneNumberPrefix = "+346001";
        missed.length = 4;
        assertEquals("+346001", PhoneChange.hint(missed));
        assertEquals(4, PhoneChange.length(missed));
    }

    @Test public void reenviarSoloCuandoHayMedioSiguiente() {
        assertFalse(PhoneChange.canResend(info(new TdApi.AuthenticationCodeTypeSms(), null, 0)));
        assertTrue(PhoneChange.canResend(info(new TdApi.AuthenticationCodeTypeSms(), new TdApi.AuthenticationCodeTypeCall(), 30)));
    }

    @Test public void elMotivoDelReenvioDependeDeSiElCodigoFallos() {
        assertTrue(PhoneChange.resendReason(false) instanceof TdApi.ResendCodeReasonUserRequest);
        assertTrue(PhoneChange.resendReason(true) instanceof TdApi.ResendCodeReasonVerificationFailed);
    }

    @Test public void laProyeccionLlevaLoQueLaPantallaNecesitaYNoElCodigo() throws Exception {
        TdApi.AuthenticationCodeTypeTelegramMessage message = new TdApi.AuthenticationCodeTypeTelegramMessage();
        message.length = 6;
        JSONObject json = PhoneChange.project(info(message, new TdApi.AuthenticationCodeTypeSms(), 60));
        assertEquals("+34600123456", json.getString("phone"));
        assertEquals(60, json.getInt("timeout"));
        assertEquals(6, json.getInt("length"));
        assertEquals("", json.getString("hint"));
        assertFalse(json.getString("next").isEmpty());
        List<String> keys = new ArrayList<>();
        for (java.util.Iterator<String> it = json.keys(); it.hasNext();) keys.add(it.next());
        assertEquals(Arrays.asList("hint", "length", "next", "phone", "sent", "timeout"), keys.stream().sorted().toList());
    }

    @Test public void sinMedioSiguienteLaProyeccionLoDiceVacio() throws Exception {
        JSONObject json = PhoneChange.project(info(new TdApi.AuthenticationCodeTypeSms(), null, 0));
        assertEquals("", json.getString("next"));
        assertEquals("", json.getString("hint"));
        // `ResendPhoneNumberCode` pide haber dejado pasar el `timeout`; uno que llegara negativo no puede ofrecerse
        // como espera, así que la proyección lo corta en cero antes de que la pantalla lo cuente hacia atrás.
        assertEquals(0, PhoneChange.project(info(new TdApi.AuthenticationCodeTypeSms(), null, -3)).getInt("timeout"));
    }

    @Test public void losCamposQueElEsquemaDejaNulosSalenComoCadenasVacias() throws Exception {
        // `AuthenticationCodeInfo` lo rellena el cliente campo a campo, así que `phoneNumber` puede llegar nulo. La
        // pantalla lee las seis claves por su nombre: si una faltara porque `put` descartó el nulo, el puente
        // mandaría un objeto incompleto y el panel se quedaría sin número que mostrar.
        JSONObject json = PhoneChange.project(new TdApi.AuthenticationCodeInfo());
        assertEquals("", json.getString("phone"));
        assertEquals("", json.getString("hint"));
        assertEquals("", json.getString("next"));
        assertEquals(0, json.getInt("length"));
        assertEquals(0, json.getInt("timeout"));
        List<String> keys = new ArrayList<>();
        for (java.util.Iterator<String> it = json.keys(); it.hasNext();) keys.add(it.next());
        assertEquals("seis claves incluso con el objeto vacío", 6, keys.size());
    }

    @Test public void laClaseNoRetieneNadaEntreLlamadas() {
        for (Field field : PhoneChange.class.getDeclaredFields()) {
            assertTrue(field.getName() + " no puede ser de instancia", Modifier.isStatic(field.getModifiers()));
            assertTrue(field.getName() + " no puede reescribirse", Modifier.isFinal(field.getModifiers()));
        }
    }
}
