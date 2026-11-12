package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class BoostsPolicyTest {
    private static JSONObject params(String json){try{return new JSONObject(json);}catch(Exception failure){throw new AssertionError(failure);}}
    private static void rejected(Runnable action){try{action.run();fail("Se esperaba un rechazo");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}}
    private static void rejectedChecked(Throwing action){
        try{action.run();fail("Se esperaba un rechazo");}
        catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}
        catch(Exception unexpected){fail("Telegram no debía llegar a lanzar "+unexpected);}
    }
    private interface Throwing{void run()throws Exception;}

    private static TdApi.ChatBoostSlot slot(int id,long chat,int start,int expiration,int cooldown){
        TdApi.ChatBoostSlot value=new TdApi.ChatBoostSlot();
        value.slotId=id; value.currentlyBoostedChatId=chat; value.startDate=start; value.expirationDate=expiration; value.cooldownUntilDate=cooldown;
        return value;
    }

    @Test public void slotListsAreOptionalButNeverEmptyOrHuge(){
        assertEquals(1,BoostsPolicy.slotIds(params("{\"slots\":[0]}"),"slots").length);
        assertEquals(3,BoostsPolicy.slotIds(params("{\"slots\":[0,1,2]}"),"slots").length);
        JSONArray many=new JSONArray();
        for(int index=0;index<BoostsPolicy.MAX_SLOTS;index++)many.put(index);
        assertEquals(BoostsPolicy.MAX_SLOTS,BoostsPolicy.slotIds(params("{\"slots\":"+many+"}"),"slots").length);
        rejected(()->BoostsPolicy.slotIds(params("{}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":[]}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":\"0\"}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":[0,0]}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":[-1]}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":[1.5]}"),"slots"));
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":[\"3\"]}"),"slots"));
        JSONArray tooMany=new JSONArray();
        for(int index=0;index<=BoostsPolicy.MAX_SLOTS;index++)tooMany.put(index);
        rejected(()->BoostsPolicy.slotIds(params("{\"slots\":"+tooMany+"}"),"slots"));
    }

    @Test public void levelIsOnlyAskedForWithinTheTableTelegramPublishes(){
        assertEquals(1,BoostsPolicy.level(params("{\"level\":1}"),"level"));
        assertEquals(BoostsPolicy.MAX_LEVEL,BoostsPolicy.level(params("{\"level\":"+BoostsPolicy.MAX_LEVEL+"}"),"level"));
        rejected(()->BoostsPolicy.level(params("{}"),"level"));
        rejected(()->BoostsPolicy.level(params("{\"level\":0}"),"level"));
        rejected(()->BoostsPolicy.level(params("{\"level\":-2}"),"level"));
        rejected(()->BoostsPolicy.level(params("{\"level\":13}"),"level"));
    }

    @Test public void channelFlagDefaultsToGroups(){
        assertFalse(BoostsPolicy.channel(params("{}")));
        assertTrue(BoostsPolicy.channel(params("{\"channel\":true}")));
        assertFalse(BoostsPolicy.channel(params("{\"channel\":false}")));
    }

    @Test public void freeSlotsExpireButNeverBoth()throws Exception{
        int now=1_700_000_000;
        JSONObject boosting=BoostsPolicy.slot(slot(3,-1001234L,now-100,now+2_000_000,now+3_000_000),now);
        assertTrue(boosting.getBoolean("inUse"));
        assertFalse(boosting.getBoolean("available"));
        assertFalse(boosting.has("expired"));
        assertEquals("-1001234",boosting.getString("chatId"));

        JSONObject expired=BoostsPolicy.slot(slot(4,-1009999L,now-5_000_000,now-10,now+1_000),now);
        assertTrue(expired.getBoolean("inUse"));
        assertTrue(expired.getBoolean("expired"));
        assertFalse(expired.getBoolean("available"));

        JSONObject cooling=BoostsPolicy.slot(slot(5,0,now-5_000_000,now-100,now+1_000),now);
        assertFalse(cooling.getBoolean("inUse"));
        assertFalse(cooling.getBoolean("available"));

        JSONObject free=BoostsPolicy.slot(slot(6,0,now-5_000_000,now+2_000_000,now-50),now);
        assertFalse(free.getBoolean("inUse"));
        assertTrue(free.getBoolean("available"));
        assertFalse(free.has("expired"));
        rejectedChecked(()->BoostsPolicy.slot(null,now));
    }

    @Test public void slotCountsComeFromTheSamePayloadTheyDescribe()throws Exception{
        int now=1_700_000_000;
        TdApi.ChatBoostSlots value=new TdApi.ChatBoostSlots();
        value.slots=new TdApi.ChatBoostSlot[]{slot(0,0,now-9,now+99,now-1),slot(1,-1005L,now-9,now+99,now+9),slot(2,0,now-9,now+99,now+9)};
        JSONObject packed=BoostsPolicy.slots(value,now);
        assertEquals(3,packed.getInt("total"));
        assertEquals(1,packed.getInt("available"));
        assertEquals(3,packed.getJSONArray("items").length());
        assertEquals(0,BoostsPolicy.slots(new TdApi.ChatBoostSlots(),now).getInt("total"));
        assertEquals(0,BoostsPolicy.slots(null,now).getInt("total"));
    }

    @Test public void premiumMemberPercentageStaysAPercentage()throws Exception{
        assertEquals(0,BoostsPolicy.percentage(-5),0);
        assertEquals(0,BoostsPolicy.percentage(Double.NaN),0);
        assertEquals(0,BoostsPolicy.percentage(Double.POSITIVE_INFINITY),0);
        assertEquals(37.5,BoostsPolicy.percentage(37.5),0);
        assertEquals(100,BoostsPolicy.percentage(250),0);
    }

    @Test public void statusKeepsEveryCounterAndDropsNothingTheUiReads()throws Exception{
        int now=1_700_000_000;
        TdApi.ChatBoostStatus value=new TdApi.ChatBoostStatus();
        value.level=4; value.boostCount=42; value.currentLevelBoostCount=30; value.nextLevelBoostCount=60;
        value.giftCodeBoostCount=7; value.premiumMemberCount=120; value.premiumMemberPercentage=180;
        value.appliedSlotIds=new int[]{0,2};
        value.boostUrl="https://t.me/+abc";
        JSONObject packed=BoostsPolicy.status(value,now);
        assertEquals(4,packed.getInt("level"));
        assertEquals(42,packed.getInt("boostCount"));
        assertEquals(30,packed.getInt("currentLevelBoostCount"));
        assertEquals(60,packed.getInt("nextLevelBoostCount"));
        assertEquals(7,packed.getInt("giftCodeBoostCount"));
        assertEquals(120,packed.getInt("premiumMemberCount"));
        assertEquals(100,packed.getDouble("premiumMemberPercentage"),0);
        JSONArray applied=packed.getJSONArray("appliedSlotIds");
        assertEquals(2,applied.length());
        assertEquals(0,applied.getInt(0));
        assertEquals(2,applied.getInt(1));
        assertEquals("https://t.me/+abc",packed.getString("boostUrl"));
        assertFalse(packed.has("giveaways"));

        value.appliedSlotIds=null; value.boostUrl="";
        JSONObject bare=BoostsPolicy.status(value,now);
        assertEquals(0,bare.getJSONArray("appliedSlotIds").length());
        assertFalse(bare.has("boostUrl"));
        rejectedChecked(()->BoostsPolicy.status(null,now));
    }

    @Test public void boostUrlNeverLeaksMoreThanTheBridgeAllows()throws Exception{
        TdApi.ChatBoostStatus value=new TdApi.ChatBoostStatus();
        value.appliedSlotIds=new int[0];
        StringBuilder longUrl=new StringBuilder("https://t.me/");
        for(int index=0;index<600;index++)longUrl.append('a');
        value.boostUrl=longUrl.toString();
        assertEquals(513,BoostsPolicy.status(value,1_700_000_000).getString("boostUrl").length());
    }

    @Test public void prepaidGiveawaysKeepTheirPrizeTypeSeparate()throws Exception{
        TdApi.ChatBoostStatus value=new TdApi.ChatBoostStatus();
        value.appliedSlotIds=new int[0];
        TdApi.GiveawayPrizePremium months=new TdApi.GiveawayPrizePremium();
        months.monthCount=3;
        TdApi.GiveawayPrizeStars stars=new TdApi.GiveawayPrizeStars();
        stars.starCount=50_000L;
        TdApi.PrepaidGiveaway first=new TdApi.PrepaidGiveaway();
        first.id=9007199254740993L; first.winnerCount=10; first.boostCount=4; first.paymentDate=1_690_000_000; first.prize=months;
        TdApi.PrepaidGiveaway second=new TdApi.PrepaidGiveaway();
        second.id=12; second.winnerCount=1; second.boostCount=0; second.paymentDate=0; second.prize=stars;
        value.prepaidGiveaways=new TdApi.PrepaidGiveaway[]{first,second,null};
        JSONArray items=BoostsPolicy.status(value,1_700_000_000).getJSONArray("giveaways");
        assertEquals(2,items.length());
        assertEquals("9007199254740993",items.getJSONObject(0).getString("id"));
        assertEquals(3,items.getJSONObject(0).getInt("monthCount"));
        assertFalse(items.getJSONObject(0).has("starCount"));
        assertEquals("12",items.getJSONObject(1).getString("id"));
        assertEquals(50000,items.getJSONObject(1).getInt("starCount"));
        assertFalse(items.getJSONObject(1).has("monthCount"));
    }

    @Test public void levelFeaturesExposeOnlyTheFieldsThePanelRenders()throws Exception{
        TdApi.ChatBoostLevelFeatures level=new TdApi.ChatBoostLevelFeatures();
        level.level=2; level.storyPerDayCount=1; level.titleColorCount=4; level.canSetEmojiStatus=true; level.canDisableSponsoredMessages=true;
        JSONObject packed=BoostsPolicy.levelFeatures(level);
        assertEquals(2,packed.getInt("level"));
        assertEquals(1,packed.getInt("storyPerDayCount"));
        assertEquals(4,packed.getInt("titleColorCount"));
        assertEquals(0,packed.getInt("customEmojiReactionCount"));
        assertTrue(packed.getBoolean("canSetEmojiStatus"));
        assertFalse(packed.getBoolean("canSetCustomBackground"));
        assertTrue(packed.getBoolean("canDisableSponsoredMessages"));
        assertEquals(15,packed.length());
        rejectedChecked(()->BoostsPolicy.levelFeatures(null));
    }

    @Test public void featuresPairTheLevelTableWithTheMinimumsMap()throws Exception{
        TdApi.ChatBoostFeatures value=new TdApi.ChatBoostFeatures();
        TdApi.ChatBoostLevelFeatures one=new TdApi.ChatBoostLevelFeatures();
        one.level=1;
        value.features=new TdApi.ChatBoostLevelFeatures[]{one,null};
        value.minEmojiStatusBoostLevel=4;
        value.minSponsoredMessageDisableBoostLevel=8;
        JSONObject packed=BoostsPolicy.features(value);
        assertEquals(1,packed.getJSONArray("levels").length());
        JSONObject minimum=packed.getJSONObject("minimum");
        assertEquals(4,minimum.getInt("emojiStatus"));
        assertEquals(8,minimum.getInt("sponsoredMessageDisable"));
        assertEquals(0,minimum.getInt("customBackground"));
        assertEquals(9,minimum.length());
        JSONObject empty=BoostsPolicy.features(null);
        assertEquals(0,empty.getJSONArray("levels").length());
        assertEquals(0,empty.getJSONObject("minimum").length());
    }

    @Test public void boostLinkKeepsTelegramIdsAsStringsAndCapsTheUrl()throws Exception{
        TdApi.ChatBoostLink value=new TdApi.ChatBoostLink();
        value.isPublic=true;
        StringBuilder longLink=new StringBuilder("https://t.me/");
        for(int index=0;index<700;index++)longLink.append('b');
        value.link=longLink.toString();
        JSONObject packed=BoostsPolicy.link(value);
        assertTrue(packed.getBoolean("isPublic"));
        assertEquals(513,packed.getString("link").length());
        assertFalse(BoostsPolicy.link(new TdApi.ChatBoostLink()).getBoolean("isPublic"));
        assertEquals("",BoostsPolicy.link(new TdApi.ChatBoostLink()).getString("link"));
        rejectedChecked(()->BoostsPolicy.link(null));
    }

    @Test public void boostLinksAreTrimmedBoundedAndSchemeChecked(){
        assertEquals("https://t.me/+abcd",BoostsPolicy.boostUrl("  https://t.me/+abcd  "));
        assertEquals("http://telegram.me/+abcd",BoostsPolicy.boostUrl("http://telegram.me/+abcd"));
        StringBuilder longUrl=new StringBuilder("https://");
        for(int index=0;index<600;index++)longUrl.append('a');
        rejected(()->BoostsPolicy.boostUrl(longUrl.toString()));
        rejected(()->BoostsPolicy.boostUrl(""));
        rejected(()->BoostsPolicy.boostUrl("   "));
        rejected(()->BoostsPolicy.boostUrl(null));
        rejected(()->BoostsPolicy.boostUrl("t.me/+abcd"));
        rejected(()->BoostsPolicy.boostUrl("ftp://t.me/+abcd"));
        rejected(()->BoostsPolicy.boostUrl("javascript:alert(1)"));
    }
}
