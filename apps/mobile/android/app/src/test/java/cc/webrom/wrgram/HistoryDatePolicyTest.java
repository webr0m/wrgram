package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.junit.Test;

/**
 * La única cifra del salto por fecha, sin sesión: qué hora puede hacer el viaje y cuál no.
 * <p>
 * Lo que el formulario produce de verdad lo mide la interfaz (`endOfLocalDate`, `inboxModel.ts`), y aquí se
 * comprueba el extremo que ese corte deja: «hoy» llega como el propio instante, así que la frontera es inclusiva
 * y el día en el que se está nunca se niega.
 */
public class HistoryDatePolicyTest {
    private static final long NOW = 1_763_000_000L;

    @Test public void theInstantItselfIsTheLastHourThatWorks() {
        assertTrue(HistoryDate.acceptable(NOW, NOW));
        assertTrue(HistoryDate.acceptable(NOW - 1, NOW));
    }

    @Test public void aDateInTheFutureHasNoLastMessageToOpen() {
        assertFalse(HistoryDate.acceptable(NOW + 1, NOW));
        assertFalse(HistoryDate.acceptable(Long.MAX_VALUE, NOW));
    }

    @Test public void absentAndNegativeDatesAreRefused() {
        assertFalse(HistoryDate.acceptable(0, NOW));
        assertFalse(HistoryDate.acceptable(-1, NOW));
        assertFalse(HistoryDate.acceptable(Long.MIN_VALUE, NOW));
    }

    @Test public void overflowingTheIntFieldIsRefusedInsteadOfTruncated() {
        assertFalse(HistoryDate.acceptable(Integer.MAX_VALUE + 1L, Long.MAX_VALUE));
        assertFalse(HistoryDate.acceptable(Long.MAX_VALUE, Long.MAX_VALUE));
        assertTrue(HistoryDate.acceptable(Integer.MAX_VALUE, Integer.MAX_VALUE));
    }

    @Test public void refusingNeverHappensInsideTheRangeTheFormCanProduce() {
        // Un año de días hacia atrás, que es lo que el calendario deja elegir, y el propio «ahora» del recorte.
        for (int days = 0; days < 366; days++) assertTrue(HistoryDate.acceptable(NOW - days * 86_400L, NOW));
    }

    @Test public void theThreeSentencesAreTheOnesTheBridgeAnswers() {
        assertEquals("Este historial no admite saltos por fecha.", HistoryDate.History);
        assertEquals("Fecha fuera de rango.", HistoryDate.Range);
        assertEquals("La conversación cambió.", HistoryDate.Changed);
    }
}
