package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class BotPublishPolicyTest {
    private static final String TOKEN = "123456789:AABC-DEF1234ghIkl_zyx57W2v1u123ew11";

    private static JSONObject identity(long id, String username) throws Exception {
        JSONObject value = new JSONObject();
        value.put("id", id);
        value.put("username", username);
        return value;
    }

    private static TdApi.ChatMemberStatusAdministrator admin(boolean canPost) {
        TdApi.ChatMemberStatusAdministrator status = new TdApi.ChatMemberStatusAdministrator();
        status.rights = new TdApi.ChatAdministratorRights();
        status.rights.canPostMessages = canPost;
        return status;
    }

    @Test public void recordDtosCarryIdentityButNeverTheToken() throws Exception {
        JSONObject record = new JSONObject();
        record.put("botUserId", "77");
        record.put("username", "mid_bot");
        record.put("name", "Mi bot");
        record.put("token", TOKEN);
        JSONObject dto = NativeBridge.botRecordDto(record);
        assertEquals("77", dto.getString("botUserId"));
        assertEquals("mid_bot", dto.getString("username"));
        assertEquals("Mi bot", dto.getString("name"));
        assertFalse(dto.has("token"));
        assertEquals(4, dto.length());
    }

    @Test public void anUnsetOrDamagedRecordReadsAsNotConfigured() throws Exception {
        assertEquals(1, NativeBridge.botRecordDto(new JSONObject()).length());
        assertFalse(NativeBridge.botRecordDto(new JSONObject("{\"botUserId\":\"0\"}")).getBoolean("configured"));
        assertFalse(NativeBridge.botRecordDto(new JSONObject("{\"botUserId\":\"-5\"}")).getBoolean("configured"));
        assertTrue(NativeBridge.botRecordDto(new JSONObject("{\"botUserId\":\"77\",\"token\":\"x\"}")).getBoolean("configured"));
    }

    @Test public void onlyBotFatherShapedTokensAreAccepted(){
        assertTrue(BotApi.validToken(TOKEN));
        assertFalse(BotApi.validToken(null));
        assertFalse(BotApi.validToken(""));
        assertFalse(BotApi.validToken("123456789:short"));
        assertFalse(BotApi.validToken("no-colon-token-at-all-aaaaaaaaaaaaaa"));
        assertFalse(BotApi.validToken(TOKEN + "x".repeat(90)));
    }

    @Test public void tokensCarryingPathSeparatorsNeverReachTheRequestLine(){
        for (String hostile : new String[]{"123456789:../../admin", "123456789:aaaaaaaaaaaaaaaaaaaaaaa?x=1",
                "123456789:aaaaaaaaaaaaaaaaaaaaaaa#frag", "123456789:aaaaaaaaaaaaaaaaaaaaaaa a"})
            assertFalse(hostile, BotApi.validToken(hostile));
        assertEquals("/bot" + TOKEN + "/getMe", BotApi.path(TOKEN, "getMe"));
        assertEquals("api.telegram.org", BotApi.HOST);
    }

    @Test public void serverDescriptionsCannotEchoTheTokenBack(){
        assertEquals("La Bot API rechazó el token del bot.", BotApi.safeDescription("Token " + TOKEN + " is invalid", TOKEN));
        assertEquals("La Bot API rechazó la petición.", BotApi.safeDescription(null, TOKEN));
        assertEquals("La Bot API rechazó la petición.", BotApi.safeDescription("   ", TOKEN));
        assertEquals("Bot was blocked by the administrator", BotApi.safeDescription("  Bot was blocked by the administrator ", TOKEN));
        assertEquals(200, BotApi.safeDescription("x".repeat(400), TOKEN).length());
    }

    @Test public void aTokenCountsOnlyForTheBotChosenOnScreen() throws Exception {
        assertTrue(NativeBridge.sameBot(identity(77, "Mi_Bot"), 77, "mi_bot"));
        assertFalse(NativeBridge.sameBot(identity(78, "mi_bot"), 77, "mi_bot"));
        assertFalse(NativeBridge.sameBot(identity(77, "other_bot"), 77, "mi_bot"));
        assertFalse(NativeBridge.sameBot(null, 77, "mi_bot"));
        assertFalse(NativeBridge.sameBot(identity(77, "mi_bot"), 77, null));
        assertFalse(NativeBridge.sameBot(new JSONObject(), 77, "mi_bot"));
    }

    @Test public void groupPublicationNeedsAdministratorsButNoPostRight(){
        assertNull(NativeBridge.botPublishProblem(admin(false), false));
        assertNull(NativeBridge.botPublishProblem(admin(true), false));
        assertNull(NativeBridge.botPublishProblem(new TdApi.ChatMemberStatusCreator(), false));
        assertEquals("El bot todavía no es administrador de este chat. Promuévelo desde Miembros para poder publicar con él.",
            NativeBridge.botPublishProblem(new TdApi.ChatMemberStatusMember(), false));
    }

    @Test public void channelPublicationAdditionallyNeedsThePostRight(){
        assertNull(NativeBridge.botPublishProblem(admin(true), true));
        assertEquals("El bot es administrador del canal pero sin permiso para publicar. Cambia sus permisos desde Miembros.",
            NativeBridge.botPublishProblem(admin(false), true));
        assertEquals("El bot es administrador del canal pero sin permiso para publicar. Cambia sus permisos desde Miembros.",
            NativeBridge.botPublishProblem(new TdApi.ChatMemberStatusAdministrator(), true));
    }

    @Test public void formerMembersAndBannedBotsAreNamedBeforeAnyNetworkCall(){
        assertEquals("El bot ya no es miembro de este chat. Vuelve a añadirlo y promuévelo a administrador.",
            NativeBridge.botPublishProblem(new TdApi.ChatMemberStatusLeft(), false));
        assertEquals("El bot está baneado en este chat. Quítale el baneo antes de publicar.",
            NativeBridge.botPublishProblem(new TdApi.ChatMemberStatusBanned(), true));
        assertEquals("El bot todavía no es administrador de este chat. Promuévelo desde Miembros para poder publicar con él.",
            NativeBridge.botPublishProblem(null, false));
    }

    @Test public void onlyAllowlistedBotMethodsCrossTheBridge(){
        for (String method : new String[]{"bot.status", "bot.save", "bot.forget", "bot.publish", "bot.posts", "bot.edit",
                "bot.delete", "bot.pin", "bot.unpin", "chat.bot.owned", "chat.bot.defaults", "chat.bot.add", "chat.bot.remove"})
            assertTrue(method, BridgePolicy.METHODS.contains(method));
        for (String method : new String[]{"bot.token", "bot.read", "bot.export", "api.telegram.org", "bot.raw", "chat.bot.token"})
            assertFalse(method, BridgePolicy.METHODS.contains(method));
    }

    @Test public void onlyEntityTypesTheBotApiKnowsAreForwarded(){
        assertEquals("bold", NativeBridge.botEntityType("bold"));
        assertEquals("spoiler", NativeBridge.botEntityType("spoiler"));
        assertEquals("blockquote", NativeBridge.botEntityType("blockquote"));
        assertEquals("pre", NativeBridge.botEntityType("pre"));
        assertEquals("text_link", NativeBridge.botEntityType("link"));
        assertEquals("url", NativeBridge.botEntityType("url"));
        assertEquals("phone_number", NativeBridge.botEntityType("phone"));
        assertEquals("bot_command", NativeBridge.botEntityType("botCommand"));
        for (String unsupported : new String[]{"customEmoji", "mentionName", "dateTime", "mediaTimestamp", "bankCard",
                "tonAddress", "expandableBlockquote", "preCode", "", "totallyMadeUp"})
            assertNull(unsupported, NativeBridge.botEntityType(unsupported));
    }

    @Test public void entitiesAreRewrittenAsPureBotApiRanges() throws Exception {
        assertEquals(0, NativeBridge.botEntities(null, "texto").length());
        JSONArray raw = new JSONArray();
        raw.put(new JSONObject().put("type", "bold").put("offset", 0).put("length", 7));
        raw.put(new JSONObject().put("type", "link").put("offset", 8).put("length", 6).put("url", "https://webrom.cc"));
        JSONArray out = NativeBridge.botEntities(raw, "negrita enlace");
        assertEquals(2, out.length());
        assertEquals("bold", out.getJSONObject(0).getString("type"));
        assertFalse(out.getJSONObject(0).has("url"));
        assertEquals("text_link", out.getJSONObject(1).getString("type"));
        assertEquals("https://webrom.cc", out.getJSONObject(1).getString("url"));
        assertEquals(8, out.getJSONObject(1).getInt("offset"));
    }

    @Test public void hostileEntityListsFailBeforeAnyRequestLeavesThePhone() throws Exception {
        StringBuilder tooLong = new StringBuilder("https://");
        for (int i = 0; i < 300; i++) tooLong.append('a');
        String[] hostile = {
            "{\"type\":\"customEmoji\",\"offset\":0,\"length\":4}",
            "{\"type\":\"bold\",\"offset\":-1,\"length\":4}",
            "{\"type\":\"bold\",\"offset\":0,\"length\":0}",
            "{\"type\":\"bold\",\"offset\":8,\"length\":9}",
            "{\"type\":\"link\",\"offset\":0,\"length\":4,\"url\":\"javascript:alert(1)\"}",
            "{\"type\":\"link\",\"offset\":0,\"length\":4,\"url\":\"" + tooLong + "\"}",
            "null", "\"texto\""};
        for (String item : hostile) assertNotNull(item, reject(item));
        JSONArray many = new JSONArray();
        for (int i = 0; i < 101; i++) many.put(new JSONObject("{\"type\":\"bold\",\"offset\":0,\"length\":4}"));
        assertTrue(reject(many), reject(many).contains("100"));
    }

    /** Un tramo hostil puede fallar al parsearse o al validarse: en ambos casos la publicación se detiene antes de salir del teléfono. */
    private static String reject(String rawEntity) {
        JSONArray raw = new JSONArray();
        try {
            raw.put(new JSONObject(rawEntity));
        } catch (Exception unparseable) {
            return unparseable.getMessage() == null ? unparseable.getClass().getSimpleName() : unparseable.getMessage();
        }
        return reject(raw);
    }

    private static String reject(JSONArray raw) {
        try {
            NativeBridge.botEntities(raw, "negrita enlace");
            return null;
        } catch (Exception expected) {
            return expected.getMessage() == null ? expected.getClass().getSimpleName() : expected.getMessage();
        }
    }

    @Test public void payloadCarriesOnlyTheOptionsEachBotApiMethodAccepts() throws Exception {
        JSONObject send = NativeBridge.botTextPayload(-1001072723865L, 0, "Hola", null, true, false, false);
        assertEquals("-1001072723865", send.getString("chat_id"));
        assertFalse(send.has("message_id"));
        assertTrue(send.getBoolean("disable_notification"));
        assertTrue(send.getJSONObject("link_preview_options").getBoolean("is_disabled"));
        JSONObject loud = NativeBridge.botTextPayload(-1001006503122L, 0, "Hola", null, false, true, false);
        assertFalse(loud.has("disable_notification"));
        assertFalse(loud.has("link_preview_options"));
        JSONObject edit = NativeBridge.botTextPayload(-1001072723865L, 42, "Hola", null, true, false, true);
        assertEquals(42, edit.getInt("message_id"));
        assertFalse("editMessageText rechaza disable_notification", edit.has("disable_notification"));
        assertTrue(edit.getJSONObject("link_preview_options").getBoolean("is_disabled"));
    }

    @Test public void usernameComesFromEditableOrActiveUsernames(){
        TdApi.User editable = new TdApi.User();
        editable.usernames = new TdApi.Usernames(new String[]{"reserve_bot"}, null, "mi_bot", null, null);
        assertEquals("mi_bot", NativeBridge.botUsername(editable));
        TdApi.User active = new TdApi.User();
        active.usernames = new TdApi.Usernames(new String[]{"mi_bot"}, null, "", null, null);
        assertEquals("mi_bot", NativeBridge.botUsername(active));
        TdApi.User blank = new TdApi.User();
        blank.usernames = new TdApi.Usernames(new String[0], null, null, null, null);
        assertNull(NativeBridge.botUsername(blank));
        assertNull(NativeBridge.botUsername(new TdApi.User()));
        assertNull(NativeBridge.botUsername(null));
    }

    @Test public void onlyNonAdminMembershipCanReceiveTheBotRole(){
        assertTrue(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusMember()));
        assertTrue(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusLeft()));
        assertTrue(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusRestricted(true, 0, new TdApi.ChatPermissions())));
        assertFalse(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusAdministrator()));
        assertFalse(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusCreator()));
        assertFalse(NativeBridge.promotableBotStatus(new TdApi.ChatMemberStatusBanned()));
        assertFalse(NativeBridge.promotableBotStatus(null));
    }

    @Test public void aRejectedBotAdditionNamesThePremiumRule(){
        assertNull(NativeBridge.failedToAddReason(null, 77));
        TdApi.FailedToAddMembers none = new TdApi.FailedToAddMembers();
        none.failedToAddMembers = new TdApi.FailedToAddMember[0];
        assertNull(NativeBridge.failedToAddReason(none, 77));
        TdApi.FailedToAddMembers one = new TdApi.FailedToAddMembers();
        one.failedToAddMembers = new TdApi.FailedToAddMember[]{new TdApi.FailedToAddMember(77, false, false)};
        assertEquals("Telegram rechazó añadir al bot a este chat.", NativeBridge.failedToAddReason(one, 77));
        assertNull(NativeBridge.failedToAddReason(one, 78));
        one.failedToAddMembers[0] = new TdApi.FailedToAddMember(77, false, true);
        assertEquals("Este chat exige Telegram Premium para añadir a este bot.", NativeBridge.failedToAddReason(one, 77));
        one.failedToAddMembers[0] = new TdApi.FailedToAddMember(77, true, true);
        assertEquals("Telegram solo permite añadir a este bot con una cuenta con Telegram Premium.", NativeBridge.failedToAddReason(one, 77));
    }
}
