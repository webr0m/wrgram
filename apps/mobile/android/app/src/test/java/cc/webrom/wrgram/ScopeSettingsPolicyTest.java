package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class ScopeSettingsPolicyTest {

    private static TdApi.ScopeNotificationSettings value(int muteFor, long sound, boolean preview, boolean storyDefault,
                                                         boolean muteStories, long storySound, boolean poster, boolean pinned, boolean mentions) {
        return new TdApi.ScopeNotificationSettings(muteFor, sound, preview, storyDefault, muteStories, storySound, poster, pinned, mentions);
    }

    private static TdApi.ScopeNotificationSettings plain() {
        return value(0, -1L, true, false, false, -1L, true, false, false);
    }

    private static JSONArray ids(String... values) throws Exception {
        JSONArray list = new JSONArray();
        for (String value : values) list.put(value);
        return list;
    }

    private static String first(JSONArray list, int index) throws Exception {
        return list.getString(index);
    }

    @Test public void onlyTheThreeScopesTelegramKnowsAreAccepted() {
        assertTrue(ScopeSettings.scope("private") instanceof TdApi.NotificationSettingsScopePrivateChats);
        assertTrue(ScopeSettings.scope("group") instanceof TdApi.NotificationSettingsScopeGroupChats);
        assertTrue(ScopeSettings.scope("channel") instanceof TdApi.NotificationSettingsScopeChannelChats);
        assertNull(ScopeSettings.scope("Private"));
        assertNull(ScopeSettings.scope("saved"));
        assertNull(ScopeSettings.scope(""));
        assertNull(ScopeSettings.scope(null));
        assertEquals("private", ScopeSettings.idOf(new TdApi.NotificationSettingsScopePrivateChats()));
        assertEquals("channel", ScopeSettings.idOf(new TdApi.NotificationSettingsScopeChannelChats()));
        assertEquals("", ScopeSettings.idOf(null));
        assertEquals(3, ScopeSettings.IDS.length);
        for (String id : ScopeSettings.IDS) assertNotEquals("", ScopeSettings.idOf(ScopeSettings.scope(id)));
    }

    @Test public void rowProjectsEveryFieldAndKeepsSoundIdsInText() throws Exception {
        TdApi.ScopeNotificationSettings settings = value(28_800, 1234567890123L, false, true, true, 0L, false, true, true);
        JSONObject row = ScopeSettings.row(new TdApi.NotificationSettingsScopeGroupChats(), settings);
        assertEquals("group", row.getString("scope"));
        assertTrue(row.getBoolean("muted"));
        assertEquals(28_800, row.getInt("muteFor"));
        assertEquals("1234567890123", row.getString("sound"));
        assertFalse(row.getBoolean("preview"));
        assertTrue(row.getBoolean("muteStories"));
        assertTrue(row.getBoolean("storyDefault"));
        assertEquals("0", row.getString("storySound"));
        assertFalse(row.getBoolean("storyPoster"));
        assertTrue(row.getBoolean("quietPinned"));
        assertTrue(row.getBoolean("quietMentions"));
    }

    @Test public void aMuteCounterNeverTravelsNegativeAndUnknownScopesProduceNothing() throws Exception {
        JSONObject row = ScopeSettings.row(new TdApi.NotificationSettingsScopePrivateChats(), value(-400, -1L, true, false, false, -1L, true, false, false));
        assertEquals(0, row.getInt("muteFor"));
        assertFalse(row.getBoolean("muted"));
        assertNull(ScopeSettings.row(null, plain()));
        assertNull(ScopeSettings.row(new TdApi.NotificationSettingsScopePrivateChats(), null));
    }

    @Test public void savedSoundsDropTheStateIdsTrimTheirTitleAndStopAtTheCap() throws Exception {
        TdApi.NotificationSound[] list = new TdApi.NotificationSound[ScopeSettings.MAX_SOUNDS + 8];
        list[0] = new TdApi.NotificationSound(-1L, 3, 1, "estado", "", null);
        list[1] = new TdApi.NotificationSound(0L, 3, 1, "estado", "", null);
        list[2] = new TdApi.NotificationSound(-9L, 3, 1, "estado", "", null);
        list[3] = new TdApi.NotificationSound(7L, 2, 1, "Tinta", "", null);
        StringBuilder longTitle = new StringBuilder();
        for (int i = 0; i < 90; i++) longTitle.append('x');
        list[4] = new TdApi.NotificationSound(8L, -5, 1, longTitle.toString(), "", null);
        list[5] = new TdApi.NotificationSound(9L, 1, 1, null, "", null);
        for (int i = 6; i < list.length; i++) list[i] = new TdApi.NotificationSound(100L + i, 1, 1, "s", "", null);
        JSONArray rows = ScopeSettings.sounds(new TdApi.NotificationSounds(list));
        assertEquals(ScopeSettings.MAX_SOUNDS, rows.length());
        assertEquals("7", rows.getJSONObject(0).getString("id"));
        JSONObject second = rows.getJSONObject(1);
        assertEquals(0, second.getInt("duration"));
        assertEquals(65, second.getString("title").length());
        assertTrue(second.getString("title").endsWith("…"));
        assertEquals("", rows.getJSONObject(2).getString("title"));
        JSONArray allowed = ScopeSettings.allowed(rows);
        assertEquals(ScopeSettings.MAX_SOUNDS, allowed.length());
        assertEquals("8", allowed.getString(1));
        assertEquals(0, ScopeSettings.sounds(null).length());
        assertEquals(0, ScopeSettings.sounds(new TdApi.NotificationSounds()).length());
    }

    @Test public void mergeOnlyTouchesWhatTheInterfaceManages() throws Exception {
        TdApi.ScopeNotificationSettings current = value(0, 4242L, true, true, false, 9999L, true, false, false);
        TdApi.ScopeNotificationSettings next = ScopeSettings.merge(current, new JSONObject().put("preview", false), ids("4242", "9999"));
        assertFalse(next.showPreview);
        assertEquals(0, next.muteFor);
        assertEquals(4242L, next.soundId);
        assertEquals(9999L, next.storySoundId);
        assertTrue(next.useDefaultMuteStories);
        assertFalse(next.muteStories);
        assertTrue(next.showStoryPoster);
        assertFalse(next.disablePinnedMessageNotifications);
        assertFalse(next.disableMentionNotifications);
        // La copia no comparte estado con la lectura: TDLib podría reescribir el objeto devuelto.
        assertNotSame(current, next);
        ScopeSettings.merge(current, new JSONObject().put("muteStories", true), ids("9999"));
        assertFalse(current.muteStories);
    }

    @Test public void unknownKeysAndEmptyPatchesAreRejectedRatherThanIgnored() {
        TdApi.ScopeNotificationSettings current = plain();
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(current, new JSONObject().put("storyDefault", true), ids()));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(current, new JSONObject().put("mute_for", 3600), ids()));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(current, new JSONObject(), ids()));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(current, null, ids()));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(null, new JSONObject().put("preview", true), ids()));
        assertTrue(ScopeSettings.known("muted"));
        assertTrue(ScopeSettings.known("quietMentions"));
        assertFalse(ScopeSettings.known("storyDefault"));
        assertFalse(ScopeSettings.known("scope"));
        assertFalse(ScopeSettings.known(""));
        assertFalse(ScopeSettings.known(null));
    }

    @Test public void muteFollowsTheSameContractAsTheChatMute() throws Exception {
        assertEquals(Integer.MAX_VALUE, ScopeSettings.muteFor(new JSONObject().put("muted", true)));
        assertEquals(0, ScopeSettings.muteFor(new JSONObject().put("muted", false)));
        assertEquals(0, ScopeSettings.muteFor(new JSONObject()));
        for (int seconds : new int[]{0, 3_600, 28_800, 172_800, Integer.MAX_VALUE})
            assertEquals(seconds, ScopeSettings.muteFor(new JSONObject().put("muted", seconds > 0).put("muteFor", seconds)));
        assertEquals(3_600, ScopeSettings.muteFor(new JSONObject().put("muteFor", 3_600)));
        for (Object bad : new Object[]{-1, 1.5, "3600", true, Long.MAX_VALUE, JSONObject.NULL})
            assertThrows(IllegalArgumentException.class, () -> ScopeSettings.muteFor(new JSONObject().put("muteFor", bad)));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.muteFor(new JSONObject().put("muted", false).put("muteFor", 3_600)));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.muteFor(new JSONObject().put("muted", true).put("muteFor", 0)));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(plain(), new JSONObject().put("muted", false).put("muteFor", 3_600), ids()));
    }

    @Test public void soundIdentifiersMustComeFromTelegram() throws Exception {
        JSONArray allowed = ids("777");
        assertEquals(-1L, ScopeSettings.sound("-1", allowed, "el sonido de los mensajes"));
        assertEquals(0L, ScopeSettings.sound("0", allowed, "el sonido de los mensajes"));
        assertEquals(777L, ScopeSettings.sound("777", allowed, "el sonido de los mensajes"));
        assertEquals(777L, ScopeSettings.sound(777L, allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound("888", allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound("-777", allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound("0777", allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound("77.5", allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound("tinta", allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.sound(null, allowed, "el sonido de los mensajes"));
        assertThrows(IllegalArgumentException.class, () -> ScopeSettings.merge(plain(), new JSONObject().put("sound", "888"), allowed));
        assertTrue(ScopeSettings.contains(allowed, "777"));
        assertFalse(ScopeSettings.contains(allowed, "77"));
    }

    @Test public void changesDescribeOnlyWhatActuallyDiffers() throws Exception {
        assertEquals(0, ScopeSettings.changes(plain(), plain()).length());
        assertEquals("silencio: 8 h", first(ScopeSettings.changes(plain(), value(28_800, -1L, true, false, false, -1L, true, false, false)), 0));
        assertEquals("sin silencio", first(ScopeSettings.changes(value(28_800, -1L, true, false, false, -1L, true, false, false), plain()), 0));
        assertEquals("silencio: 1 h → 2 días", first(ScopeSettings.changes(value(3_600, -1L, true, false, false, -1L, true, false, false), value(172_800, -1L, true, false, false, -1L, true, false, false)), 0));
        assertEquals("sonido: sin sonido", first(ScopeSettings.changes(plain(), value(0, 0L, true, false, false, -1L, true, false, false)), 0));
        assertEquals("sonido: un sonido guardado en Telegram", first(ScopeSettings.changes(plain(), value(0, 777L, true, false, false, -1L, true, false, false)), 0));
        assertEquals("ocultar el contenido en el aviso", first(ScopeSettings.changes(plain(), value(0, -1L, false, false, false, -1L, true, false, false)), 0));
        assertEquals("historias con aviso", first(ScopeSettings.changes(value(0, -1L, true, false, true, -1L, true, false, false), plain()), 0));
        JSONArray many = ScopeSettings.changes(plain(), value(0, -1L, false, false, true, 0L, false, true, true));
        assertEquals(6, many.length());
        assertEquals("los mensajes fijados avisarán como cualquiera", first(many, 4));
        assertEquals("las menciones volverán a destacar", first(ScopeSettings.changes(value(0, -1L, true, false, false, -1L, true, true, true), value(0, -1L, true, false, false, -1L, true, true, false)), 0));
    }

    @Test public void theDialogNamesASavedSoundWithTheTitleTelegramGaveIt() throws Exception {
        JSONArray sounds = new JSONArray()
            .put(new JSONObject().put("id", "777").put("title", "Tinta"))
            .put(new JSONObject().put("id", "888").put("title", ""));
        assertEquals("sonido: «Tinta»", first(ScopeSettings.changes(plain(), value(0, 777L, true, false, false, -1L, true, false, false), sounds), 0));
        // Sin título en la lista de Telegram no se le pone ninguno: se describe lo que es.
        assertEquals("sonido: un sonido guardado en Telegram", first(ScopeSettings.changes(plain(), value(0, 888L, true, false, false, -1L, true, false, false), sounds), 0));
        assertEquals("sonido: un sonido guardado en Telegram", first(ScopeSettings.changes(plain(), value(0, 999L, true, false, false, -1L, true, false, false), sounds), 0));
        assertEquals("sonido: sin sonido", first(ScopeSettings.changes(plain(), value(0, 0L, true, false, false, -1L, true, false, false), sounds), 0));
        assertEquals("sonido de historias: «Tinta»", first(ScopeSettings.changes(plain(), value(0, -1L, true, false, false, 777L, true, false, false), sounds), 0));
        assertEquals("«Tinta»", ScopeSettings.soundName(777L, sounds));
        assertEquals("el sonido de la aplicación", ScopeSettings.soundName(-1L, sounds));
        assertEquals("un sonido guardado en Telegram", ScopeSettings.soundName(777L, new JSONArray()));
    }

    @Test public void spansReadInSpanishWithTheirSingularAndPlural() {
        assertEquals("sin silencio", ScopeSettings.span(0));
        assertEquals("unos segundos", ScopeSettings.span(30));
        assertEquals("10 min", ScopeSettings.span(600));
        assertEquals("1 h", ScopeSettings.span(3_600));
        assertEquals("8 h", ScopeSettings.span(28_800));
        assertEquals("1 día", ScopeSettings.span(86_400));
        assertEquals("2 días", ScopeSettings.span(172_800));
        assertEquals("1 mes", ScopeSettings.span(2_592_000));
        assertEquals("3 meses", ScopeSettings.span(7_776_000));
        assertEquals("indefinido", ScopeSettings.span(Integer.MAX_VALUE));
        assertEquals("1 h", ScopeSettings.hours(1));
        assertEquals("1 mes", ScopeSettings.months(0));
    }

    @Test public void theStoryCaveatAppearsOnlyWhenTelegramDecides() {
        assertEquals("", ScopeSettings.storyCaveat(plain()));
        assertTrue(ScopeSettings.storyCaveat(value(0, -1L, true, true, false, -1L, true, false, false)).contains("historias"));
    }

    @Test public void concurrentChangesAreDetectedInEveryFieldIncludingTheUnmanagedOne() {
        TdApi.ScopeNotificationSettings base = value(3_600, 777L, true, false, false, 888L, true, false, false);
        assertTrue(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, false, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(0, 777L, true, false, false, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, -1L, true, false, false, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, false, false, false, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, true, false, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, true, 888L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, false, 0L, true, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, false, 888L, false, false, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, false, 888L, true, true, false)));
        assertFalse(ScopeSettings.sameAsRead(base, value(3_600, 777L, true, false, false, 888L, true, false, true)));
        assertTrue(ScopeSettings.sameAsRead(null, null));
        assertFalse(ScopeSettings.sameAsRead(null, base));
        assertFalse(ScopeSettings.sameAsRead(base, null));
    }

    @Test public void copyLeavesTheReadObjectUntouched() {
        TdApi.ScopeNotificationSettings original = plain();
        TdApi.ScopeNotificationSettings clone = ScopeSettings.copy(original);
        clone.muteFor = 28_800;
        clone.soundId = 5L;
        clone.useDefaultMuteStories = true;
        assertEquals(0, original.muteFor);
        assertEquals(-1L, original.soundId);
        assertFalse(original.useDefaultMuteStories);
    }
}
