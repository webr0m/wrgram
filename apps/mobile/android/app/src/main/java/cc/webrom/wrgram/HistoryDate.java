package cc.webrom.wrgram;

/**
 * Reglas de «Ir a una fecha», solas y sin sesión, para que las dos capas de escritorio puedan copiarlas.
 * <para>
 * Lo que manda el formulario no es la medianoche del día elegido: <code>endOfLocalDate</code>
 * (<code>inboxModel.ts:53-61</code>, llamado desde <code>Inbox.tsx:209</code>) toma el día siguiente a las cero
 * horas, le quita un segundo y corta el resultado a «ahora» con su propio <code>Math.min</code> de la línea 60.
 * Así que un día pasado llega como 23:59:59 de ese día y «hoy» llega como este instante —nunca como futuro—, y el
 * <code>max</code> del campo (<code>Inbox.tsx:218</code>) además no deja elegir mañana.
 * </para>
 * <para>
 * Queda dicho aquí porque esta ronda entró a cambiar esta aritmética creyendo que «hoy» se negaba siempre, y al
 * medirlo resultó que no: la negación del futuro es la guarda del puente consigo mismo, no un gesto de la pantalla.
 * Se queda como estaba y lo que cambia es dónde está escrita.
 * </para>
 */
final class HistoryDate {
    private HistoryDate() {}

    /** Literal de <code>messageByDate</code> cuando el historial pedido no es el abierto o no es saltable. */
    static final String History = "Este historial no admite saltos por fecha.";

    /**
     * Literal de <code>messageByDate</code> para la hora que no puede hacer el viaje: cero o negativo es que el
     * llamador no mandó nada; un número mayor que <code>Integer.MAX_VALUE</code> no es «dentro de mucho», es un
     * desbordamiento del <code>int</code> con el que <code>GetChatMessageByDate</code> guarda la cifra
     * (<code>TdApi.java</code>, campo <code>date</code>); y el futuro no tiene «último mensaje hasta esa hora».
     */
    static final String Range = "Fecha fuera de rango.";

    /** Literal de <code>messageByDate</code> cuando la conversación cambió mientras se esperaba a Telegram. */
    static final String Changed = "La conversación cambió.";

    /** Si la hora manda algo, cabe en el <code>int</code> de TDLib y no está por delante de <code>now</code>. */
    static boolean acceptable(long at, long now) {
        return at > 0 && at <= Integer.MAX_VALUE && at <= now;
    }
}
