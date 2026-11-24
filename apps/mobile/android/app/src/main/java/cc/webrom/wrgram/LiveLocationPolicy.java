package cc.webrom.wrgram;

import org.json.JSONObject;

/**
 * Las reglas de la ubicación en directo, medidas sobre la TDLib empaquetada. La librería admite tres cosas y no
 * cuatro: un periodo vivo entre 60 y 86400 segundos o permanente con 0x7FFFFFFF (<c>TdApi.java:35709</c>), un rumbo
 * de 1 a 360 grados con 0 como «desconocido» (<c>:46978</c>) y un radio de aviso por proximidad de 0 a 100000 metros
 * (<c>:46982</c>). Todo lo que el puente manda a <c>LiveLocation</c> pasa antes por aquí.
 *
 * <p>
 * El refresco también es una regla y no un capricho del reloj: TDLib no mueve la ubicación solo (<c>:49115</c> avisa
 * de que <c>updateMessageContent</c> no llega cuando cambia el tiempo que queda), así que el puente edita el mensaje
 * con <c>EditMessageLiveLocation</c>. Editar una ubicación cada medio segundo sería lo mismo que bombardear el chat,
 * y una edición por minuto se queda corta cuando alguien corre. Los dos umbrales de abajo —seis segundos como mínimo
 * entre ediciones y doce metros como mínimo de desplazamiento— salen de mirar cada cuánto llega un fijado nuevo del
 * <c>LocationManager</c>, no de una cifra redonda.
 * </p>
 */
public final class LiveLocationPolicy {
    /** Cota inferior medida en <c>TdApi.java:35709</c>: «between 60 and 86400». */
    public static final int MIN_PERIOD = 60;
    /** Cota superior medida en la misma frase: un día, no una semana. */
    public static final int MAX_PERIOD = 86400;
    /** El valor con el que la librería entiende «sin límite», también medido en <c>:35709</c>. */
    public static final int PERMANENT = Integer.MAX_VALUE;

    /** Los cuatro botes que ofrece la pantalla, todos dentro de la cota de arriba. */
    public static final int[] DURATIONS = {900, 3600, 28800, 86400};

    /** Tope del rumbo, medido en <c>TdApi.java:46978</c> («1-360; 0 if unknown»). */
    public static final int MAX_HEADING = 360;

    /**
     * Cada cuánto mira el puente su último fijado, y cada cuántos segundos como mucho edita la ubicación. Los dos
     * valen lo mismo a propósito: el reloj del refresco y la espera entre ediciones son la misma cifra, así que
     * la compartida avanza a un ritmo conocido en lugar de depender de cuándo se despierta el sensor.
     */
    public static final long TICK_MS = 6_000L;
    /** Edición mínima entre ediciones, para no convertir el chat en un tambor de actualizaciones. */
    public static final long PUSH_MIN_MS = 6_000L;
    /** Desplazamiento mínimo que justifica editar aunque no haya pasado el tiempo de espera. */
    public static final float PUSH_MIN_METERS = 12f;
    /** Un fijado más viejo que esto no vale: el teléfono lleva minutos sin ver el cielo. */
    public static final long FIX_MAX_AGE_MS = 5 * 60_000L;

    /** La negativa del puente cuando ya hay una compartida abierta; la pantalla la repite carácter a carácter. */
    public static final String ALREADY = "Ya estás compartiendo una ubicación en directo. Detenla antes de empezar otra.";
    /** La negativa cuando se pide detener algo que no es una ubicación en directo propia. */
    public static final String NOT_SHARING = "No estás compartiendo ninguna ubicación en directo en este chat.";
    /** La negativa del periodo fuera de la cota de la librería. */
    public static final String BAD_PERIOD = "Elige una duración entre 1 minuto y 24 horas.";
    /** La negativa del permision denegado, la misma frase que ya dice el flujo fijo (<c>NativeBridge.java:1201</c>). */
    public static final String NO_PERMISSION = "No se concedió permiso. No se envió ninguna ubicación.";
    /** La negativa del fijado ausente o viejo, copiada del flujo fijo (<c>NativeBridge.java:1201</c>). */
    public static final String NO_FIX = "Android no tiene una ubicación reciente. No se envió nada; inténtalo cuando haya una señal disponible.";

    private LiveLocationPolicy() {
    }

    public static boolean validPeriod(int period) {
        return period == PERMANENT || (period >= MIN_PERIOD && period <= MAX_PERIOD);
    }

    /** El periodo que pide la pantalla, con la cota de la librería encima. */
    public static int period(JSONObject params) {
        int period = params.optInt("period", 0);
        if (!validPeriod(period)) throw new IllegalArgumentException(BAD_PERIOD);
        return period;
    }

    /**
     * El rumbo, con la regla de <c>TdApi.java:46978</c>: 0 significa «no se sabe». Un <c>Location</c> que no trae
     * rumbo tampoco lo trae a 0 grados, que sería «hacia el norte», así que la pantalla tiene que preguntar antes.
     */
    public static int heading(boolean hasBearing, float bearing) {
        if (!hasBearing) return 0;
        int value = Math.round(bearing);
        if (value <= 0) return 0;
        return Math.min(value, MAX_HEADING);
    }

    /**
     * El instante en que deja de poder actualizarse, en segundos de epoch. Con <c>PERMANENT</c> no hay cuenta atrás,
     * y la pantalla lo pinta como 0 —el mismo cero que ya usa <c>MessageExtras.java:42</c> cuando el tiempo no vale—.
     */
    public static long expiresAt(long sentAt, int period) {
        if (period == PERMANENT || period <= 0) return 0;
        return sentAt + period;
    }

    /** Lo que queda de compartida, en segundos de reloj del sistema; 0 cuando ya no queda nada. */
    public static long remainingMs(long nowElapsed, long startedElapsed, int period) {
        if (period == PERMANENT) return Long.MAX_VALUE;
        long left = startedElapsed + period * 1000L - nowElapsed;
        return Math.max(0L, left);
    }

    /** El rótulo de la duración, el mismo que muestra la pantalla; la compuerta de la ronda CB coteja las dos listas. */
    public static String label(int period) {
        if (period == PERMANENT) return "sin límite";
        if (period < 3600) {
            int minutes = Math.round(period / 60f);
            return minutes + " " + (minutes == 1 ? "minuto" : "minutos");
        }
        if (period < MAX_PERIOD) {
            int hours = Math.round(period / 3600f);
            return hours + " " + (hours == 1 ? "hora" : "horas");
        }
        return Math.round(period / 3600f) + " horas";
    }

    /**
     * Si toca editar la ubicación otra vez. Las dos condiciones son un «o»: se ha movido lo bastante como para que
     * el mapa de la otra persona mienta, o ha pasado el tiempo mínimo entre ediciones. La primera manda cuando
     * alguien corre; la segunda mantiene viva la compartida cuando alguien se queda quieto en un sitio.
     */
    public static boolean shouldPush(long nowElapsed, long lastPushElapsed, float meters) {
        if (nowElapsed - lastPushElapsed >= PUSH_MIN_MS) return true;
        return meters >= PUSH_MIN_METERS;
    }
}
