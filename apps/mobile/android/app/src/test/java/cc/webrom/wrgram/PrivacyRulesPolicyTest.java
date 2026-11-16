package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class PrivacyRulesPolicyTest {
    private static TdApi.UserPrivacySettingRule allowAll() { return new TdApi.UserPrivacySettingRuleAllowAll(); }
    private static TdApi.UserPrivacySettingRule restrictAll() { return new TdApi.UserPrivacySettingRuleRestrictAll(); }
    private static TdApi.UserPrivacySettingRule allowContacts() { return new TdApi.UserPrivacySettingRuleAllowContacts(); }
    private static TdApi.UserPrivacySettingRule restrictBots() { return new TdApi.UserPrivacySettingRuleRestrictBots(); }
    private static TdApi.UserPrivacySettingRule allowPremium() { return new TdApi.UserPrivacySettingRuleAllowPremiumUsers(); }
    private static TdApi.UserPrivacySettingRule allowUsers(long... ids) { return new TdApi.UserPrivacySettingRuleAllowUsers(ids); }
    private static TdApi.UserPrivacySettingRule restrictUsers(long... ids) { return new TdApi.UserPrivacySettingRuleRestrictUsers(ids); }
    private static TdApi.UserPrivacySettingRule restrictChatMembers(long... ids) { return new TdApi.UserPrivacySettingRuleRestrictChatMembers(ids); }

    private static String names(TdApi.UserPrivacySettingRule[] rules) {
        StringBuilder value = new StringBuilder();
        for (TdApi.UserPrivacySettingRule rule : rules) value.append(value.length() == 0 ? "" : ",").append(rule.getClass().getSimpleName().replace("UserPrivacySettingRule", ""));
        return value.toString();
    }

    @Test public void readsEveryRuleEvenWhenTheFirstOneIsUnexpressible() throws Exception {
        JSONObject projected = PrivacyRules.project(new TdApi.UserPrivacySettingRule[]{restrictBots(), allowAll(), restrictUsers(7L)});
        assertEquals("everyone", projected.getString("value"));
        assertEquals("[]", projected.getJSONArray("allowUsers").toString());
        assertEquals(1, projected.getJSONArray("restrictUsers").length());
        assertEquals("7", projected.getJSONArray("restrictUsers").getString(0));
        assertEquals(1, projected.getJSONArray("preserved").length());
        assertEquals("bots restringidos", projected.getJSONArray("preserved").getString(0));
    }

    @Test public void reportsBaseExceptionsAndUserListsTogether() throws Exception {
        JSONObject projected = PrivacyRules.project(new TdApi.UserPrivacySettingRule[]{allowContacts(), allowUsers(1L, 2L), restrictUsers(3L)});
        assertEquals("contacts", projected.getString("value"));
        assertEquals(2, projected.getJSONArray("allowUsers").length());
        assertEquals(1, projected.getJSONArray("restrictUsers").length());
        assertEquals(0, projected.getJSONArray("preserved").length());
    }

    @Test public void ambiguousOrUnknownRulesNeverBecomeAnInventedValue() throws Exception {
        assertEquals("custom", PrivacyRules.project(new TdApi.UserPrivacySettingRule[]{allowAll(), restrictAll()}).getString("value"));
        assertEquals("custom", PrivacyRules.project(null).getString("value"));
        assertEquals("custom", PrivacyRules.project(new TdApi.UserPrivacySettingRule[]{allowPremium()}).getString("value"));
        JSONObject only = PrivacyRules.project(new TdApi.UserPrivacySettingRule[]{allowPremium(), restrictChatMembers(40L)});
        assertEquals(2, only.getJSONArray("preserved").length());
        assertEquals("miembros de chats restringidos", only.getJSONArray("preserved").getString(1));
    }

    @Test public void preservedRulesKeepTheSlotOfTheRebuiltBlock() {
        TdApi.UserPrivacySettingRule[] next = PrivacyRules.merge(
            new TdApi.UserPrivacySettingRule[]{allowPremium(), allowAll(), restrictUsers(9L)}, "nobody", new long[]{5L}, new long[0]);
        assertEquals("AllowPremiumUsers,RestrictAll,AllowUsers", names(next));
    }

    @Test public void preservedRulesAfterTheBaseStayAfterIt() {
        TdApi.UserPrivacySettingRule[] next = PrivacyRules.merge(
            new TdApi.UserPrivacySettingRule[]{allowAll(), restrictChatMembers(40L)}, "everyone", new long[0], new long[]{8L});
        assertEquals("AllowAll,RestrictUsers,RestrictChatMembers", names(next));
    }

    @Test public void noPreviousRulesMeansAFreshBlock() {
        assertEquals("RestrictAll,AllowUsers", names(PrivacyRules.merge(null, "nobody", new long[]{2L}, new long[0])));
        assertEquals("AllowAll,RestrictUsers", names(PrivacyRules.merge(new TdApi.UserPrivacySettingRule[0], "everyone", new long[0], new long[]{3L})));
    }

    @Test public void changingTheBaseNeverDropsAnUnexpressibleRule() {
        TdApi.UserPrivacySettingRule[] previous = {allowContacts(), restrictBots(), allowUsers(4L), restrictChatMembers(70L, 71L)};
        for (String value : new String[]{"everyone", "contacts", "nobody"}) {
            TdApi.UserPrivacySettingRule[] next = PrivacyRules.merge(previous, value, new long[]{4L}, new long[0]);
            int kept = 0;
            for (TdApi.UserPrivacySettingRule rule : next) if (!PrivacyRules.modeled(rule)) kept++;
            assertEquals("las reglas avanzadas se pierden con " + value, 2, kept);
        }
    }

    @Test public void rejectsValuesAndExceptionsItCannotSendSafely() {
        try { PrivacyRules.merge(null, "custom", new long[0], new long[0]); fail("un valor base desconocido no puede reescribir las reglas"); }
        catch (IllegalArgumentException error) { assertTrue(error.getMessage().contains("Valor de privacidad")); }
        try { PrivacyRules.merge(null, "everyone", new long[]{2L, 2L}, new long[0]); fail("el mismo usuario no puede repetirse"); }
        catch (IllegalArgumentException error) { assertTrue(error.getMessage().contains("duplicados")); }
        try { PrivacyRules.merge(null, "everyone", new long[]{2L}, new long[]{2L}); fail("no puede estar permitido y restringido"); }
        catch (IllegalArgumentException error) { assertTrue(error.getMessage().contains("permitido y restringido")); }
        long[] many = new long[PrivacyRules.MAX_USER_EXCEPTIONS / 2 + 1];
        for (int i = 0; i < many.length; i++) many[i] = i + 1;
        try { PrivacyRules.merge(null, "everyone", many, many); fail("Telegram admite hasta 200 excepciones"); }
        catch (IllegalArgumentException error) { assertTrue(error.getMessage().contains("200")); }
    }
}
