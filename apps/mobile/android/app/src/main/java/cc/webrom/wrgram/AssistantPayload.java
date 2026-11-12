package cc.webrom.wrgram;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Text deliberately authored in WR IA only. No Telegram objects or chat context in this contract. */
final class AssistantPayload {
    static final class Turn {
        final String role, content;
        Turn(String role, String content) { this.role = role; this.content = content; }
    }
    static JSONObject build(List<Turn> history, boolean consent, String provider) throws Exception {
        if (!consent || !provider.equals("groq") || history.isEmpty() || history.size() > 10 || !history.get(history.size() - 1).role.equals("user")) throw new IllegalArgumentException("Consent and explicit provider required");
        JSONArray messages = new JSONArray();
        for (Turn turn : history) {
            if (!(turn.role.equals("user") || turn.role.equals("assistant")) || turn.content.trim().isEmpty() || turn.content.length() > (turn.role.equals("user") ? 4000 : 12000)) throw new IllegalArgumentException("Invalid own instruction");
            messages.put(new JSONObject().put("role", turn.role).put("content", turn.content));
        }
        return new JSONObject().put("messages", messages).put("consent", true).put("provider", provider);
    }
}
