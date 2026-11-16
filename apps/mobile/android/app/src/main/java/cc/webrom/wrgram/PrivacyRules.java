package cc.webrom.wrgram;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * TDLib matches privacy rules in order and uses the first one that applies, so rebuilding a
 * setting from a single base value would silently change every rule the interface cannot express
 * (bots, Premium subscribers, members of specific chats, restricted contacts). Unexpressible
 * rules are therefore carried over verbatim in their original slot; only the base value and the
 * per-user exceptions are rewritten.
 */
final class PrivacyRules {
    static final int MAX_USER_EXCEPTIONS = 200;

    private PrivacyRules() {}

    /** True for the rules whose value the interface can offer as a base or as user exceptions. */
    static boolean modeled(TdApi.UserPrivacySettingRule rule) {
        return rule instanceof TdApi.UserPrivacySettingRuleAllowAll
            || rule instanceof TdApi.UserPrivacySettingRuleAllowContacts
            || rule instanceof TdApi.UserPrivacySettingRuleRestrictAll
            || rule instanceof TdApi.UserPrivacySettingRuleAllowUsers
            || rule instanceof TdApi.UserPrivacySettingRuleRestrictUsers;
    }

    static JSONObject project(TdApi.UserPrivacySettingRule[] rules) throws Exception {
        JSONArray allow = new JSONArray(), restrict = new JSONArray(), preserved = new JSONArray();
        List<String> bases = new ArrayList<>();
        if (rules != null) for (TdApi.UserPrivacySettingRule rule : rules) {
            if (rule instanceof TdApi.UserPrivacySettingRuleAllowAll) bases.add("everyone");
            else if (rule instanceof TdApi.UserPrivacySettingRuleRestrictAll) bases.add("nobody");
            else if (rule instanceof TdApi.UserPrivacySettingRuleAllowContacts) bases.add("contacts");
            else if (rule instanceof TdApi.UserPrivacySettingRuleAllowUsers) for (long id : ids(((TdApi.UserPrivacySettingRuleAllowUsers) rule).userIds)) allow.put(String.valueOf(id));
            else if (rule instanceof TdApi.UserPrivacySettingRuleRestrictUsers) for (long id : ids(((TdApi.UserPrivacySettingRuleRestrictUsers) rule).userIds)) restrict.put(String.valueOf(id));
            else {
                String label = label(rule);
                if (!contains(preserved, label)) preserved.put(label);
            }
        }
        String value = bases.size() == 1 ? bases.get(0) : "custom";
        return new JSONObject().put("value", value).put("allowUsers", allow).put("restrictUsers", restrict).put("preserved", preserved);
    }

    /**
     * Rules to send for the chosen base and exceptions, keeping every rule TDLib reported that the
     * interface cannot express. The preserved rules stay around the position the modelled block had,
     * so their precedence relative to the base value does not change.
     */
    static TdApi.UserPrivacySettingRule[] merge(TdApi.UserPrivacySettingRule[] previous, String value, long[] allow, long[] restrict) {
        validate(value, allow, restrict);
        TdApi.UserPrivacySettingRule[] base = base(value, allow, restrict);
        List<TdApi.UserPrivacySettingRule> before = new ArrayList<>(), after = new ArrayList<>();
        boolean inBlock = false;
        if (previous != null) for (TdApi.UserPrivacySettingRule rule : previous) {
            if (modeled(rule)) { inBlock = true; continue; }
            if (inBlock) after.add(rule); else before.add(rule);
        }
        List<TdApi.UserPrivacySettingRule> next = new ArrayList<>(before.size() + base.length + after.size());
        next.addAll(before);
        next.addAll(java.util.Arrays.asList(base));
        next.addAll(after);
        return next.toArray(new TdApi.UserPrivacySettingRule[0]);
    }

    private static TdApi.UserPrivacySettingRule[] base(String value, long[] allow, long[] restrict) {
        List<TdApi.UserPrivacySettingRule> rules = new ArrayList<>();
        if (value.equals("everyone")) {
            rules.add(new TdApi.UserPrivacySettingRuleAllowAll());
            if (restrict.length > 0) rules.add(new TdApi.UserPrivacySettingRuleRestrictUsers(restrict));
        } else if (value.equals("contacts")) {
            rules.add(new TdApi.UserPrivacySettingRuleAllowContacts());
            if (allow.length > 0) rules.add(new TdApi.UserPrivacySettingRuleAllowUsers(allow));
            if (restrict.length > 0) rules.add(new TdApi.UserPrivacySettingRuleRestrictUsers(restrict));
        } else {
            rules.add(new TdApi.UserPrivacySettingRuleRestrictAll());
            if (allow.length > 0) rules.add(new TdApi.UserPrivacySettingRuleAllowUsers(allow));
        }
        return rules.toArray(new TdApi.UserPrivacySettingRule[0]);
    }

    private static void validate(String value, long[] allow, long[] restrict) {
        if (!value.equals("everyone") && !value.equals("contacts") && !value.equals("nobody"))
            throw new IllegalArgumentException("Valor de privacidad no válido.");
        if (allow.length + restrict.length > MAX_USER_EXCEPTIONS)
            throw new IllegalArgumentException("Máximo 200 excepciones por ajuste.");
        Set<Long> seen = new HashSet<>();
        for (long id : allow) if (!seen.add(id)) throw new IllegalArgumentException("Hay usuarios duplicados en las excepciones.");
        for (long id : restrict) if (!seen.add(id)) throw new IllegalArgumentException("Un usuario no puede estar permitido y restringido a la vez.");
    }

    /** How an unexpressible rule is described to the user, without inventing a value for it. */
    private static String label(TdApi.UserPrivacySettingRule rule) {
        if (rule instanceof TdApi.UserPrivacySettingRuleAllowBots) return "bots permitidos";
        if (rule instanceof TdApi.UserPrivacySettingRuleRestrictBots) return "bots restringidos";
        if (rule instanceof TdApi.UserPrivacySettingRuleAllowPremiumUsers) return "suscriptores de Premium permitidos";
        if (rule instanceof TdApi.UserPrivacySettingRuleRestrictContacts) return "contactos restringidos";
        if (rule instanceof TdApi.UserPrivacySettingRuleAllowChatMembers) return "miembros de chats permitidos";
        if (rule instanceof TdApi.UserPrivacySettingRuleRestrictChatMembers) return "miembros de chats restringidos";
        return "otras reglas de Telegram";
    }

    private static boolean contains(JSONArray array, String value) {
        for (int i = 0; i < array.length(); i++) if (value.equals(array.optString(i))) return true;
        return false;
    }

    private static long[] ids(long[] values) { return values == null ? new long[0] : values; }
}
