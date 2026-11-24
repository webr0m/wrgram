package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

public class ReadReceiptsTest {
    @Test
    public void lasNegativasSonLasCompartidas() {
        assertEquals("Solo puedes consultar la lectura de tus propios mensajes.", ReadReceipts.NOT_OUTGOING);
        assertEquals("La hora de lectura solo se consulta en chats privados.", ReadReceipts.NOT_PRIVATE);
        assertEquals("Los lectores solo se consultan en grupos.", ReadReceipts.NOT_GROUP);
        assertEquals("Telegram no permite consultar la hora de lectura de este mensaje.", ReadReceipts.DATE_UNAVAILABLE);
        assertEquals("Telegram no permite consultar los lectores de este mensaje.", ReadReceipts.VIEWERS_UNAVAILABLE);
    }

    @Test
    public void laFechaLeidaViajaConSuEpoch() throws Exception {
        JSONObject value = ReadReceipts.date(new TdApi.MessageReadDateRead(1700000000));
        assertEquals("read", value.getString("state"));
        assertEquals(1700000000, value.getInt("date"));
    }

    @Test
    public void lasCuatroNegativasDeTDLegadasSinFecha() throws Exception {
        assertEquals("unread", ReadReceipts.date(new TdApi.MessageReadDateUnread()).getString("state"));
        assertEquals("tooOld", ReadReceipts.date(new TdApi.MessageReadDateTooOld()).getString("state"));
        assertEquals("userRestricted", ReadReceipts.date(new TdApi.MessageReadDateUserPrivacyRestricted()).getString("state"));
        assertEquals("myRestricted", ReadReceipts.date(new TdApi.MessageReadDateMyPrivacyRestricted()).getString("state"));
        assertFalse(ReadReceipts.date(new TdApi.MessageReadDateUnread()).has("date"));
    }

    @Test
    public void unaVarianteDesconocidaSeNiega() {
        try {
            ReadReceipts.date(new TdApi.MessageReadDate() {
                @Override
                public int getConstructor() {
                    return 0;
                }
            });
            fail("Debió negarse");
        } catch (IllegalArgumentException expected) {
            assertNotNull(expected.getMessage());
        } catch (Exception other) {
            throw new AssertionError(other);
        }
    }

    @Test
    public void losLectoresViajanConNombreYFecha() throws Exception {
        TdApi.MessageViewers viewers = new TdApi.MessageViewers(new TdApi.MessageViewer[]{
                new TdApi.MessageViewer(42, 1700000100), new TdApi.MessageViewer(7, 1700000200)});
        JSONObject value = ReadReceipts.viewers(viewers, id -> id == 42 ? "Ada" : null);
        assertEquals(2, value.getJSONArray("viewers").length());
        JSONObject first = value.getJSONArray("viewers").getJSONObject(0);
        assertEquals("42", first.getString("id"));
        assertEquals("Ada", first.getString("name"));
        assertEquals(1700000100, first.getInt("date"));
        assertEquals("Usuario de Telegram", value.getJSONArray("viewers").getJSONObject(1).getString("name"));
    }

    @Test
    public void unaListaVaciaONulaSaleVacia() throws Exception {
        assertEquals(0, ReadReceipts.viewers(new TdApi.MessageViewers(new TdApi.MessageViewer[0]), id -> "x").getJSONArray("viewers").length());
        assertEquals(0, ReadReceipts.viewers(new TdApi.MessageViewers(null), id -> "x").getJSONArray("viewers").length());
        assertEquals(0, ReadReceipts.viewers(null, id -> "x").getJSONArray("viewers").length());
    }

    @Test
    public void unLectorNuloSeSalta() throws Exception {
        TdApi.MessageViewers viewers = new TdApi.MessageViewers(new TdApi.MessageViewer[]{null, new TdApi.MessageViewer(9, 1700000300)});
        assertEquals(1, ReadReceipts.viewers(viewers, id -> "Nueve").getJSONArray("viewers").length());
    }

    @Test
    public void elScopeExigeElMismoChatYElMismoTopic() {
        assertTrue(ReadReceipts.sameScope(100, 7, 100, 7));
        assertTrue(ReadReceipts.sameScope(100, 0, 100, 0));
        assertFalse(ReadReceipts.sameScope(101, 7, 100, 7));
        assertFalse(ReadReceipts.sameScope(100, 8, 100, 7));
        assertFalse(ReadReceipts.sameScope(100, 0, 100, 7));
    }

    @Test
    public void losErroresDeFechaSeMapeanPorCodigoExacto() throws Exception {
        assertEquals("unread", ReadReceipts.error(new TdApi.Error(400, "MESSAGE_NOT_READ_YET"), false).getString("state"));
        assertEquals("tooOld", ReadReceipts.error(new TdApi.Error(400, "MESSAGE_TOO_OLD"), false).getString("state"));
        assertEquals("userRestricted", ReadReceipts.error(new TdApi.Error(400, "USER_PRIVACY_RESTRICTED"), false).getString("state"));
        assertEquals("myRestricted", ReadReceipts.error(new TdApi.Error(400, "YOUR_PRIVACY_RESTRICTED"), false).getString("state"));
        assertEquals("unread", ReadReceipts.error(new TdApi.Error(400, "MESSAGE_NOT_READ_YET: todavía no leído"), false).getString("state"));
    }

    @Test
    public void losPrefijosParecidosNoSeMapean() throws Exception {
        for (String message : new String[]{"OTHER_MESSAGE_NOT_READ_YET", "MESSAGE_NOT_READ_YET_EXTRA", "MESSAGE_NOT_READ_YETISH", "MESSAGE_NOT_READ_YET : detalle"}) {
            assertNull(ReadReceipts.error(new TdApi.Error(400, message), false));
            assertNull(ReadReceipts.error(new TdApi.Error(400, message), true));
        }
        assertNull(ReadReceipts.error(new TdApi.Error(400, "CHAT_ADMIN_REQUIRED: detalle"), false));
        assertNull(ReadReceipts.error(null, false));
        assertNull(ReadReceipts.error(new TdApi.Error(400, null), false));
    }

    @Test
    public void noLeidoEnLectoresDevuelveUnaListaVacia() throws Exception {
        JSONObject value = ReadReceipts.error(new TdApi.Error(400, "MESSAGE_NOT_READ_YET: todavía no leído"), true);
        assertEquals(0, value.getJSONArray("viewers").length());
        assertNull(ReadReceipts.error(new TdApi.Error(400, "MESSAGE_TOO_OLD"), true));
        assertNull(ReadReceipts.error(new TdApi.Error(400, "USER_PRIVACY_RESTRICTED"), true));
        assertNull(ReadReceipts.error(new TdApi.Error(400, "YOUR_PRIVACY_RESTRICTED"), true));
    }

    @Test
    public void soloSeHidratanLosIdsSinNombreYUnaVez() {
        TdApi.MessageViewers viewers = new TdApi.MessageViewers(new TdApi.MessageViewer[]{
                new TdApi.MessageViewer(42, 1), new TdApi.MessageViewer(42, 2),
                new TdApi.MessageViewer(7, 3), null, new TdApi.MessageViewer(9, 4)});
        assertArrayEquals(new long[]{42, 9}, ReadReceipts.missingViewerIds(viewers, id -> id == 7 ? "Siete" : null));
        assertArrayEquals(new long[0], ReadReceipts.missingViewerIds(null, id -> null));
        assertArrayEquals(new long[0], ReadReceipts.missingViewerIds(new TdApi.MessageViewers(null), id -> null));
    }

    @Test
    public void laHidratacionArrancaTodasLasConsultasYSoloTerminaConLaUltima() {
        List<Long> started = new ArrayList<>();
        Map<Long, Consumer<TdApi.User>> success = new HashMap<>();
        Map<Long, Consumer<TdApi.Error>> failure = new HashMap<>();
        AtomicInteger done = new AtomicInteger();
        AtomicInteger failed = new AtomicInteger();
        ReadReceipts.hydrateViewerNames(new long[]{42, 7, 9}, (id, ok, bad) -> {
            started.add(id);
            success.put(id, ok);
            failure.put(id, bad);
        }, (id, name) -> {}, done::incrementAndGet, error -> failed.incrementAndGet());

        assertEquals(List.of(42L, 7L, 9L), started);
        success.get(42L).accept(user(42, "Ada"));
        success.get(7L).accept(user(7, "Siete"));
        assertEquals(0, done.get());
        success.get(9L).accept(user(9, "Nueve"));
        assertEquals(1, done.get());
        failure.get(42L).accept(new TdApi.Error(500, " tardío "));
        assertEquals(1, done.get());
        assertEquals(0, failed.get());
    }

    @Test
    public void laHidratacionVaciaTerminaSinConsultasYUnErrorCierraUnaSolaVez() {
        List<Long> started = new ArrayList<>();
        AtomicInteger done = new AtomicInteger();
        AtomicInteger failed = new AtomicInteger();
        ReadReceipts.hydrateViewerNames(new long[0], (id, ok, bad) -> started.add(id), (id, name) -> {}, done::incrementAndGet, error -> failed.incrementAndGet());
        assertEquals(0, started.size());
        assertEquals(1, done.get());

        Map<Long, Consumer<TdApi.User>> success = new HashMap<>();
        Map<Long, Consumer<TdApi.Error>> failure = new HashMap<>();
        done.set(0);
        ReadReceipts.hydrateViewerNames(new long[]{42, 7}, (id, ok, bad) -> {
            started.add(id);
            success.put(id, ok);
            failure.put(id, bad);
        }, (id, name) -> {}, done::incrementAndGet, error -> failed.incrementAndGet());
        failure.get(42L).accept(new TdApi.Error(500, "fallo"));
        failure.get(7L).accept(new TdApi.Error(500, "otro"));
        success.get(7L).accept(user(7, "Siete"));
        assertEquals(0, done.get());
        assertEquals(1, failed.get());
    }

    private static TdApi.User user(long id, String name) {
        TdApi.User value = new TdApi.User();
        value.id = id;
        value.firstName = name;
        return value;
    }
}