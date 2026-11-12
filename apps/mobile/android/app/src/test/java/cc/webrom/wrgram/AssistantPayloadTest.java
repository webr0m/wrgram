package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;
import org.json.JSONObject;
import org.junit.Test;

public class AssistantPayloadTest {
    @Test public void payloadContainsOnlyOwnInstructionConsentAndExplicitProvider() throws Exception {
        JSONObject request = AssistantPayload.build(Collections.singletonList(new AssistantPayload.Turn("user", "Mi idea")), true, "groq");
        assertEquals(3, request.length()); assertTrue(request.getBoolean("consent")); assertEquals("groq", request.getString("provider"));
        assertEquals("Mi idea", request.getJSONArray("messages").getJSONObject(0).getString("content"));
        assertFalse(request.has("telegram")); assertFalse(request.has("notes")); assertFalse(request.has("apiKey"));
    }
    @Test(expected = IllegalArgumentException.class) public void refusesWithoutConsent() throws Exception { AssistantPayload.build(Collections.singletonList(new AssistantPayload.Turn("user", "Idea")), false, "groq"); }
    @Test(expected = IllegalArgumentException.class) public void noAutomaticProviderFallback() throws Exception { AssistantPayload.build(Collections.singletonList(new AssistantPayload.Turn("user", "Idea")), true, "ollama"); }
    @Test(expected = IllegalArgumentException.class) public void rejectsSystemRoleAndOverlongOwnText() throws Exception { AssistantPayload.build(Collections.singletonList(new AssistantPayload.Turn("system", "private context")), true, "groq"); }
    @Test(expected = IllegalArgumentException.class) public void rejectsOversizedPrompt() throws Exception { AssistantPayload.build(Collections.singletonList(new AssistantPayload.Turn("user", new String(new char[4001]).replace('\0', 'a'))), true, "groq"); }
    @Test(expected = IllegalArgumentException.class) public void requestMustEndWithUserInstruction() throws Exception { AssistantPayload.build(Arrays.asList(new AssistantPayload.Turn("user", "Idea"), new AssistantPayload.Turn("assistant", "Reply")), true, "groq"); }
}
