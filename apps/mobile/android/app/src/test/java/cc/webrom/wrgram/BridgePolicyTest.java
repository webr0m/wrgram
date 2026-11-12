package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class BridgePolicyTest {
    @Test public void bridgeNeverOffersArbitraryFunctionsOrFilesystem(){for(String method:new String[]{"eval","fetch","tdlib.send","readFile","executePlugin","getSessionKey","getApiHash"})assertFalse(BridgePolicy.METHODS.contains(method));}
    @Test public void preservesTelegramLongIdsWithoutJavascriptNumberRounding()throws Exception{assertEquals(9007199254740993L,BridgePolicy.id(new JSONObject().put("id","9007199254740993"),"id"));assertEquals(-1001234567890L,BridgePolicy.id(new JSONObject().put("id","-1001234567890"),"id"));}
    @Test(expected=IllegalArgumentException.class)public void refusesJavascriptNumericIds()throws Exception{BridgePolicy.id(new JSONObject().put("id",123),"id");}
    @Test(expected=IllegalArgumentException.class)public void refusesPathAsIdentifier()throws Exception{BridgePolicy.id(new JSONObject().put("id","../tdlib-key.v1"),"id");}
    @Test(expected=IllegalArgumentException.class)public void refusesUnexpectedEnvelopeFields()throws Exception{BridgePolicy.envelope(new JSONObject().put("id","1").put("method","state").put("params",new JSONObject()).put("secret","not-allowed"));}
    @Test(expected=IllegalArgumentException.class)public void refusesUnknownMethod()throws Exception{BridgePolicy.envelope(new JSONObject().put("id","1").put("method","sendRawTdlib").put("params",new JSONObject()));}
    @Test public void acceptsExplicitCommandEnvelope()throws Exception{BridgePolicy.envelope(new JSONObject().put("id","1").put("method","chat.open").put("params",new JSONObject().put("id","123")));}
    @Test public void exposesOnlyExplicitCommunityModerationContactAndStoryCommands(){for(String method:new String[]{"groups.createSuper","groups.banned","groups.member.unban","groups.member.promote","groups.member.demote","contacts.import","story.create.photo","story.edit.caption","story.delete","story.profile.toggle"})assertTrue(method,BridgePolicy.METHODS.contains(method));assertTrue(BridgePolicy.METHODS.contains("security.lock"));assertTrue(BridgePolicy.METHODS.contains("telegram.link"));assertFalse(BridgePolicy.METHODS.contains("groups.promoteRaw"));}
    @Test public void communityCreationAllowsOnlyBasicSupergroupForumAndChannel(){assertTrue(NativeBridge.communityCreation("supergroup","Team","").isForum==false);assertTrue(NativeBridge.communityCreation("forum","Team","").isForum);assertTrue(NativeBridge.communityCreation("channel","News","").isChannel);for(String kind:new String[]{"public","secret","admin"})try{NativeBridge.communityCreation(kind,"X","");fail(kind);}catch(IllegalArgumentException expected){}}
    @Test(expected=IllegalArgumentException.class)public void boundsNotesAndMessagePayloads()throws Exception{BridgePolicy.text(new JSONObject().put("text","12345"),"text",4);}
    @Test public void allowsScrollingIntoNewerHistory()throws Exception{assertTrue(BridgePolicy.METHODS.contains("history.newer"));BridgePolicy.envelope(new JSONObject().put("id","7").put("method","history.newer").put("params",new JSONObject()));}
    @Test public void allowsNativePlaybackOfDownloadedVideos()throws Exception{assertTrue(BridgePolicy.METHODS.contains("media.play"));BridgePolicy.envelope(new JSONObject().put("id","8").put("method","media.play").put("params",new JSONObject()));}
}
