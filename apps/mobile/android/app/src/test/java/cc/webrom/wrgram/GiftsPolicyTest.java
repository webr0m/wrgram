package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class GiftsPolicyTest {
    private static final int NOW=1_700_000_000;

    private static JSONObject params(String json){try{return new JSONObject(json);}catch(Exception failure){throw new AssertionError(failure);}}
    private static void rejected(Runnable action){try{action.run();fail("Se esperaba un rechazo");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}}
    private static void rejectedChecked(Throwing action){
        try{action.run();fail("Se esperaba un rechazo");}
        catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}
        catch(Exception unexpected){fail("Telegram no debía llegar a lanzar "+unexpected);}
    }
    private interface Throwing{void run()throws Exception;}

    private static String repeated(char letter,int count){
        StringBuilder value=new StringBuilder();
        for(int index=0;index<count;index++)value.append(letter);
        return value.toString();
    }

    private static TdApi.Gift gift(){
        TdApi.Gift value=new TdApi.Gift();
        value.id=9007199254740993L; value.publisherChatId=-1001234567890L; value.starCount=50;
        value.defaultSellStarCount=30; value.upgradeStarCount=25; value.upgradeVariantCount=6;
        value.hasColors=true; value.isForBirthday=false; value.isPremium=true; value.nextSendDate=NOW+3600;
        return value;
    }

    private static TdApi.AvailableGift available(TdApi.Gift gift,int resaleCount,long minimum,String title){
        TdApi.AvailableGift value=new TdApi.AvailableGift();
        value.gift=gift; value.resaleCount=resaleCount; value.minResaleStarCount=minimum; value.title=title;
        return value;
    }

    private static TdApi.ReceivedGift received(){
        TdApi.ReceivedGift value=new TdApi.ReceivedGift();
        value.receivedGiftId="aB3_-xyz"; value.date=NOW; value.isPrivate=true; value.isSaved=true; value.isPinned=false;
        value.canBeUpgraded=true; value.canBeTransferred=false; value.canBeDeleted=true; value.wasRefunded=false;
        value.uniqueGiftNumber=12; value.sellStarCount=40; value.transferStarCount=0; value.dropOriginalDetailsStarCount=0;
        value.collectionIds=new int[]{7,8};
        return value;
    }

    private static TdApi.FormattedText text(String value){
        TdApi.FormattedText result=new TdApi.FormattedText();
        result.text=value;
        return result;
    }

    private static TdApi.UpgradedGiftModel model(String name,TdApi.UpgradedGiftAttributeRarity rarity,boolean crafted){
        TdApi.UpgradedGiftModel value=new TdApi.UpgradedGiftModel();
        value.name=name; value.rarity=rarity; value.isCrafted=crafted;
        return value;
    }

    private static TdApi.UpgradedGiftSymbol symbol(String name,TdApi.UpgradedGiftAttributeRarity rarity){
        TdApi.UpgradedGiftSymbol value=new TdApi.UpgradedGiftSymbol();
        value.name=name; value.rarity=rarity;
        return value;
    }

    private static TdApi.UpgradedGiftBackdropColors colors(){
        TdApi.UpgradedGiftBackdropColors value=new TdApi.UpgradedGiftBackdropColors();
        value.centerColor=0xFFEECC; value.edgeColor=0x221100; value.symbolColor=0x00FF00; value.textColor=0x000000;
        return value;
    }

    private static TdApi.UpgradedGiftBackdrop backdrop(){
        TdApi.UpgradedGiftBackdrop value=new TdApi.UpgradedGiftBackdrop();
        value.id=4; value.name="Fondo dorado"; value.rarity=new TdApi.UpgradedGiftAttributeRarityLegendary(); value.colors=colors();
        return value;
    }

    private static TdApi.UpgradedGiftAttributeRarity perMille(int value){
        TdApi.UpgradedGiftAttributeRarityPerMille rarity=new TdApi.UpgradedGiftAttributeRarityPerMille();
        rarity.perMille=value;
        return rarity;
    }

    private static TdApi.GiftUpgradePrice price(int date,long starCount){
        TdApi.GiftUpgradePrice value=new TdApi.GiftUpgradePrice();
        value.date=date; value.starCount=starCount;
        return value;
    }

    private static TdApi.UpgradedGift upgraded(){
        TdApi.UpgradedGift value=new TdApi.UpgradedGift();
        value.title="Oso único"; value.name="OsO"; value.number=3; value.totalUpgradedCount=250; value.maxUpgradedCount=1000;
        value.isPremium=true; value.isCrafted=false; value.isBurned=false; value.publisherChatId=-10099L;
        value.model=model("Oso",new TdApi.UpgradedGiftAttributeRarityRare(),true);
        value.symbol=symbol("Estrella",perMille(25));
        value.backdrop=backdrop();
        return value;
    }

    private static TdApi.ReceivedGift upgradedReceived(){
        TdApi.ReceivedGift value=received();
        TdApi.SentGiftUpgraded upgradedGift=new TdApi.SentGiftUpgraded();
        upgradedGift.gift=upgraded();
        value.gift=upgradedGift;
        return value;
    }

    @Test public void receivedIdsStayOpaqueTelegramTokens(){
        assertEquals("aB3_-xyz",GiftsPolicy.receivedId(params("{\"id\":\"aB3_-xyz\"}"),"id"));
        assertEquals(64,GiftsPolicy.receivedId(params("{\"id\":\""+repeated('a',64)+"\"}"),"id").length());
        rejected(()->GiftsPolicy.receivedId(params("{}"),"id"));
        rejected(()->GiftsPolicy.receivedId(params("{\"id\":\"\"}"),"id"));
        rejected(()->GiftsPolicy.receivedId(params("{\"id\":\"con espacio\"}"),"id"));
        rejected(()->GiftsPolicy.receivedId(params("{\"id\":\"rojo;DROP\"}"),"id"));
        rejected(()->GiftsPolicy.receivedId(params("{\"id\":42}"),"id"));
        rejected(()->GiftsPolicy.receivedId(params("{\"id\":\""+repeated('b',65)+"\"}"),"id"));
    }

    @Test public void pinnedListsAreBoundedUniqueAndTyped(){
        assertArrayEquals(new String[]{"a","b"},GiftsPolicy.receivedIds(params("{\"ids\":[\"a\",\"b\"]}"),"ids"));
        assertEquals(1,GiftsPolicy.receivedIds(params("{\"ids\":[\"a\",\"a\"]}"),"ids").length);
        JSONArray many=new JSONArray();
        for(int index=0;index<GiftsPolicy.MAX_PINNED;index++)many.put("gift"+index);
        assertEquals(GiftsPolicy.MAX_PINNED,GiftsPolicy.receivedIds(params("{\"ids\":"+many+"}"),"ids").length);
        rejected(()->GiftsPolicy.receivedIds(params("{}"),"ids"));
        rejected(()->GiftsPolicy.receivedIds(params("{\"ids\":[]}"),"ids"));
        rejected(()->GiftsPolicy.receivedIds(params("{\"ids\":\"a\"}"),"ids"));
        rejected(()->GiftsPolicy.receivedIds(params("{\"ids\":[\"a\",2]}"),"ids"));
        rejected(()->GiftsPolicy.receivedIds(params("{\"ids\":[\"con espacio\"]}"),"ids"));
        JSONArray tooMany=new JSONArray();
        for(int index=0;index<=GiftsPolicy.MAX_PINNED;index++)tooMany.put("gift"+index);
        rejected(()->GiftsPolicy.receivedIds(params("{\"ids\":"+tooMany+"}"),"ids"));
    }

    @Test public void pagesAndOffsetsKeepTelegramBounds(){
        assertEquals(20,GiftsPolicy.page(params("{}")));
        assertEquals(1,GiftsPolicy.page(params("{\"limit\":1}")));
        assertEquals(GiftsPolicy.MAX_PAGE,GiftsPolicy.page(params("{\"limit\":"+GiftsPolicy.MAX_PAGE+"}")));
        rejected(()->GiftsPolicy.page(params("{\"limit\":0}")));
        rejected(()->GiftsPolicy.page(params("{\"limit\":-5}")));
        rejected(()->GiftsPolicy.page(params("{\"limit\":101}")));
        assertEquals("",GiftsPolicy.offset(params("{}")));
        assertEquals("abc",GiftsPolicy.offset(params("{\"offset\":\"abc\"}")));
        assertEquals(256,GiftsPolicy.offset(params("{\"offset\":\""+repeated('o',400)+"\"}")).length());
        assertFalse(GiftsPolicy.sortByPrice(params("{}")));
        assertTrue(GiftsPolicy.sortByPrice(params("{\"sort\":true}")));
    }

    @Test public void giftMessagesAreTrimmedAndNeverOverTelegramLimit(){
        assertEquals("",GiftsPolicy.message(params("{}"),"text"));
        assertEquals("hola",GiftsPolicy.message(params("{\"text\":\"  hola  \"}"),"text"));
        assertEquals(GiftsPolicy.MAX_TEXT,GiftsPolicy.message(params("{\"text\":\""+repeated('x',GiftsPolicy.MAX_TEXT)+"\"}"),"text").length());
        rejected(()->GiftsPolicy.message(params("{\"text\":\""+repeated('x',GiftsPolicy.MAX_TEXT)+"y\"}"),"text"));
        rejected(()->GiftsPolicy.message(params("{\"text\":7}"),"text"));
        assertFalse(GiftsPolicy.flag(params("{}"),"upgrade"));
        assertTrue(GiftsPolicy.flag(params("{\"upgrade\":true}"),"upgrade"));
    }

    @Test public void everyViewMapsToTheExcludeFlagTdLibActuallyHas(){
        TdApi.MessageSenderUser owner=new TdApi.MessageSenderUser();
        owner.userId=17;
        TdApi.GetReceivedGifts all=GiftsPolicy.filters(params("{}"),owner,20,"");
        assertTrue(all.ownerId instanceof TdApi.MessageSenderUser);
        assertEquals(17,((TdApi.MessageSenderUser)all.ownerId).userId);
        assertEquals(20,all.limit);
        assertEquals("",all.offset);
        assertFalse(all.sortByPrice);
        assertFalse(all.excludeSaved); assertFalse(all.excludeUnsaved); assertFalse(all.excludeNonUpgradable);
        assertFalse(all.excludeUpgradable); assertFalse(all.excludeWithoutColors);
        assertTrue(GiftsPolicy.filters(params("{\"view\":\"saved\"}"),owner,20,"").excludeUnsaved);
        assertTrue(GiftsPolicy.filters(params("{\"view\":\"unsaved\"}"),owner,20,"").excludeSaved);
        assertTrue(GiftsPolicy.filters(params("{\"view\":\"upgradable\"}"),owner,20,"").excludeNonUpgradable);
        assertTrue(GiftsPolicy.filters(params("{\"view\":\"upgraded\"}"),owner,20,"").excludeUpgradable);
        assertTrue(GiftsPolicy.filters(params("{\"view\":\"colors\"}"),owner,20,"").excludeWithoutColors);
        TdApi.GetReceivedGifts sorted=GiftsPolicy.filters(params("{\"view\":\"all\",\"sort\":true}"),owner,20,"next");
        assertTrue(sorted.sortByPrice);
        assertEquals("next",sorted.offset);
        rejected(()->GiftsPolicy.filters(params("{\"view\":\"auction\"}"),owner,20,""));
    }

    @Test public void raritiesUnknownToThisVersionFallBackToCommon(){
        assertEquals("common",GiftsPolicy.rarity(null));
        assertEquals("uncommon",GiftsPolicy.rarity(new TdApi.UpgradedGiftAttributeRarityUncommon()));
        assertEquals("rare",GiftsPolicy.rarity(new TdApi.UpgradedGiftAttributeRarityRare()));
        assertEquals("epic",GiftsPolicy.rarity(new TdApi.UpgradedGiftAttributeRarityEpic()));
        assertEquals("legendary",GiftsPolicy.rarity(new TdApi.UpgradedGiftAttributeRarityLegendary()));
        assertEquals(0,GiftsPolicy.perMille(null));
        assertEquals(125,GiftsPolicy.perMille(perMille(125)));
        assertEquals(0,GiftsPolicy.perMille(new TdApi.UpgradedGiftAttributeRarityRare()));
    }

    @Test public void tdlibColoursBecomeCssHexStrings()throws Exception{
        assertEquals("#000000",GiftsPolicy.hex(0));
        assertEquals("#FFEECC",GiftsPolicy.hex(0xFFEECC));
        assertEquals("#FFFFFF",GiftsPolicy.hex(-1));
        assertNull(GiftsPolicy.colors(null));
        JSONObject packed=GiftsPolicy.colors(colors());
        assertEquals("#FFEECC",packed.getString("center"));
        assertEquals("#221100",packed.getString("edge"));
        assertEquals("#00FF00",packed.getString("symbol"));
        assertEquals("#000000",packed.getString("text"));
    }

    @Test public void availableGiftsKeepTheirIdsAsStringsAndTheirTitlesCapped()throws Exception{
        TdApi.AvailableGift value=available(gift(),3,120,"Regalo de temporada");
        JSONObject packed=GiftsPolicy.available(value,null);
        assertEquals("9007199254740993",packed.getString("id"));
        assertEquals("-1001234567890",packed.getString("publisherChatId"));
        assertEquals(50,packed.getLong("starCount"));
        assertEquals(30,packed.getLong("defaultSellStarCount"));
        assertEquals(25,packed.getLong("upgradeStarCount"));
        assertEquals(6,packed.getInt("upgradeVariantCount"));
        assertTrue(packed.getBoolean("isPremium"));
        assertTrue(packed.getBoolean("hasColors"));
        assertEquals(3,packed.getInt("resaleCount"));
        assertEquals(120,packed.getLong("minResaleStarCount"));
        assertEquals(NOW+3600,packed.getInt("nextSendDate"));
        assertFalse(packed.has("sticker"));
        assertFalse(packed.has("auctionInfo"));
        assertFalse(packed.has("userLimits"));
        JSONObject withSticker=GiftsPolicy.available(value,new JSONObject().put("id","55"));
        assertEquals("55",withSticker.getJSONObject("sticker").getString("id"));
        rejectedChecked(()->GiftsPolicy.available(null,null));
        rejectedChecked(()->GiftsPolicy.available(available(null,0,0,""),null));
        assertEquals(181,GiftsPolicy.available(available(gift(),0,0,repeated('t',400)),null).getString("upgradedTitle").length());
    }

    @Test public void catalogDropsTheNullsTdLibCanHandOut()throws Exception{
        List<JSONObject> items=new ArrayList<>();
        items.add(GiftsPolicy.available(available(gift(),0,0,"Oso"),null));
        items.add(null);
        assertEquals(1,GiftsPolicy.catalog(items).getJSONArray("gifts").length());
        assertEquals(0,GiftsPolicy.catalog(new ArrayList<JSONObject>()).getJSONArray("gifts").length());
    }

    @Test public void regularReceivedGiftsExposeTheBaseGiftId()throws Exception{
        TdApi.ReceivedGift value=received();
        TdApi.SentGiftRegular regular=new TdApi.SentGiftRegular();
        regular.gift=gift();
        value.gift=regular;
        TdApi.MessageSenderUser sender=new TdApi.MessageSenderUser();
        sender.userId=44;
        value.senderId=sender;
        value.text=text("  feliz cumpleaños  ");
        JSONObject packed=GiftsPolicy.received(value,"Ana",null);
        assertEquals("aB3_-xyz",packed.getString("id"));
        assertEquals("9007199254740993",packed.getString("giftId"));
        assertEquals("regular",packed.getString("kind"));
        assertEquals(50,packed.getLong("starCount"));
        assertEquals("Ana",packed.getString("sender"));
        assertEquals("44",packed.getString("senderId"));
        assertEquals("  feliz cumpleaños  ",packed.getString("text"));
        assertEquals(2,packed.getJSONArray("collections").length());
        assertTrue(packed.getBoolean("private"));
        assertTrue(packed.getBoolean("canUpgrade"));
        assertFalse(packed.getBoolean("pinned"));
        assertFalse(packed.has("unique"));
        assertFalse(packed.has("sticker"));
        assertEquals(12,packed.getInt("number"));
        assertEquals(40,packed.getLong("sellStarCount"));
        TdApi.ReceivedGift bare=received();
        JSONObject quiet=GiftsPolicy.received(bare,"",null);
        assertFalse(quiet.has("sender"));
        assertFalse(quiet.has("senderId"));
        assertFalse(quiet.has("text"));
        assertEquals("unknown",quiet.getString("kind"));
        assertFalse(quiet.has("giftId"));
        bare.collectionIds=null;
        assertEquals(0,GiftsPolicy.received(bare,"Ana",null).getJSONArray("collections").length());
        rejectedChecked(()->GiftsPolicy.received(null,"Ana",null));
        bare.text=text(repeated('x',800));
        assertEquals(GiftsPolicy.MAX_TEXT+1,GiftsPolicy.received(bare,"Ana",null).getString("text").length());
        assertEquals(181,GiftsPolicy.received(received(),repeated('s',400),null).getString("sender").length());
    }

    @Test public void upgradedReceivedGiftsCarryTheUniqueCardAndItsSticker()throws Exception{
        JSONObject packed=GiftsPolicy.received(upgradedReceived(),"Ana",new JSONObject().put("id","77"));
        assertEquals("upgraded",packed.getString("kind"));
        assertEquals("Oso único",packed.getJSONObject("unique").getString("title"));
        assertEquals("77",packed.getJSONObject("unique").getJSONObject("sticker").getString("id"));
        assertFalse(packed.has("sticker"));
        assertFalse(packed.has("giftId"));
        JSONObject withoutSticker=GiftsPolicy.received(upgradedReceived(),"Ana",null);
        assertTrue(withoutSticker.has("unique"));
        assertFalse(withoutSticker.getJSONObject("unique").has("sticker"));
    }

    @Test public void anUnknownSentGiftKindIsReportedInsteadOfInvented()throws Exception{
        TdApi.ReceivedGift value=received();
        TdApi.SentGiftRegular noGift=new TdApi.SentGiftRegular();
        value.gift=noGift;
        JSONObject packed=GiftsPolicy.received(value,"Ana",null);
        assertEquals("unknown",packed.getString("kind"));
        assertFalse(packed.has("giftId"));
        TdApi.SentGiftUpgraded empty=new TdApi.SentGiftUpgraded();
        value.gift=empty;
        JSONObject unique=GiftsPolicy.received(value,"Ana",null);
        assertEquals("upgraded",unique.getString("kind"));
        assertFalse(unique.has("unique"));
    }

    @Test public void receivedPagesReportOnlyWhatTelegramReturned()throws Exception{
        TdApi.ReceivedGifts value=new TdApi.ReceivedGifts();
        value.totalCount=42; value.nextOffset="next-token"; value.areNotificationsEnabled=true;
        List<JSONObject> items=new ArrayList<>();
        items.add(GiftsPolicy.received(received(),"Ana",null));
        items.add(null);
        JSONObject packed=GiftsPolicy.received(value,items);
        assertEquals(42,packed.getInt("total"));
        assertEquals("next-token",packed.getString("offset"));
        assertTrue(packed.getBoolean("notifications"));
        assertEquals(1,packed.getJSONArray("gifts").length());
        JSONObject empty=GiftsPolicy.received(null,new ArrayList<JSONObject>());
        assertEquals(0,empty.getInt("total"));
        assertEquals("",empty.getString("offset"));
        assertFalse(empty.getBoolean("notifications"));
        value.nextOffset=repeated('o',400);
        assertEquals(257,GiftsPolicy.received(value,items).getString("offset").length());
    }

    @Test public void uniqueCardsCapTextAndOnlyPriceWhatTelegramPrices()throws Exception{
        assertEquals(0,GiftsPolicy.unique(null,null).length());
        JSONObject packed=GiftsPolicy.unique(upgraded(),new JSONObject().put("id","88"));
        assertEquals("Oso único",packed.getString("title"));
        assertEquals("OsO",packed.getString("name"));
        assertEquals(3,packed.getInt("number"));
        assertEquals(250,packed.getInt("totalUpgradedCount"));
        assertEquals(1000,packed.getInt("maxUpgradedCount"));
        assertEquals("-10099",packed.getString("publisherChatId"));
        assertTrue(packed.getBoolean("isPremium"));
        assertFalse(packed.getBoolean("isCrafted"));
        assertEquals("rare",packed.getJSONObject("model").getString("rarity"));
        assertTrue(packed.getJSONObject("model").getBoolean("crafted"));
        assertEquals("legendary",packed.getJSONObject("backdrop").getString("rarity"));
        assertEquals("#FFEECC",packed.getJSONObject("backdrop").getJSONObject("colors").getString("center"));
        assertEquals(25,packed.getJSONObject("symbol").getInt("perMille"));
        assertFalse(packed.has("valueAmount"));
                TdApi.UpgradedGift priced=upgraded();
        priced.valueAmount=2500; priced.valueCurrency="XCT"; priced.valueUsdAmount=640;
        JSONObject card=GiftsPolicy.unique(priced,null);
        assertEquals(2500,card.getLong("valueAmount"));
        assertEquals("XCT",card.getString("valueCurrency"));
        assertEquals(640,card.getLong("valueUsdAmount"));
        TdApi.UpgradedGift burned=upgraded();
        burned.isBurned=true;
        burned.name=repeated('n',400);
        burned.model=null; burned.symbol=null; burned.backdrop=null;
        JSONObject burnedCard=GiftsPolicy.unique(burned,null);
        assertTrue(burnedCard.getBoolean("isBurned"));
        assertEquals(181,burnedCard.getString("name").length());
        assertFalse(burnedCard.has("model"));
        assertFalse(burnedCard.has("backdrop"));
    }

    @Test public void upgradePreviewPairsTheTablesItIsGiven()throws Exception{
        JSONObject packed=GiftsPolicy.preview(null,null,null);
        assertEquals(0,packed.getJSONArray("models").length());
        assertEquals(0,packed.getJSONArray("symbols").length());
        assertEquals(0,packed.getJSONArray("backdrops").length());
        assertEquals(0,packed.getJSONArray("prices").length());
        assertEquals(0,packed.getJSONArray("nextPrices").length());

        TdApi.UpgradedGiftModel[] models={model("Oso",new TdApi.UpgradedGiftAttributeRarityEpic(),false),null};
        TdApi.UpgradedGiftSymbol[] symbols={symbol("Estrella",null),null};
        TdApi.UpgradedGiftBackdrop[] backdrops={backdrop(),null};
        TdApi.GiftUpgradePreview value=new TdApi.GiftUpgradePreview();
        value.models=models; value.symbols=symbols; value.backdrops=backdrops;
        value.prices=new TdApi.GiftUpgradePrice[]{price(NOW-100,90),price(NOW+1000,40),null};
        value.nextPrices=new TdApi.GiftUpgradePrice[]{price(NOW+1000,40),null};
        JSONObject full=GiftsPolicy.preview(value,GiftsPolicy.models(models),GiftsPolicy.symbols(symbols));
        assertEquals(1,full.getJSONArray("models").length());
        assertEquals("epic",full.getJSONArray("models").getJSONObject(0).getString("rarity"));
        assertFalse(full.getJSONArray("models").getJSONObject(0).getBoolean("crafted"));
        assertEquals(1,full.getJSONArray("symbols").length());
        assertEquals("common",full.getJSONArray("symbols").getJSONObject(0).getString("rarity"));
        assertFalse(full.getJSONArray("symbols").getJSONObject(0).has("crafted"));
        assertFalse(full.getJSONArray("symbols").getJSONObject(0).has("totalCount"));
        assertEquals(1,full.getJSONArray("backdrops").length());
        assertEquals("#221100",full.getJSONArray("backdrops").getJSONObject(0).getJSONObject("colors").getString("edge"));
        assertEquals(2,full.getJSONArray("prices").length());
        assertEquals(90,full.getJSONArray("prices").getJSONObject(0).getLong("starCount"));
        assertEquals(1,full.getJSONArray("nextPrices").length());
        assertEquals(0,GiftsPolicy.models(null).length());
        assertEquals(0,GiftsPolicy.symbols(null).length());
    }

    @Test public void canSendReasonsComeFromTelegramAndNeverFromTheUi()throws Exception{
        JSONObject ok=GiftsPolicy.canSend(new TdApi.CanSendGiftResultOk());
        assertTrue(ok.getBoolean("allowed"));
        assertEquals("",ok.getString("reason"));
        TdApi.CanSendGiftResultFail fail=new TdApi.CanSendGiftResultFail();
        fail.reason=text("Ya enviaste este regalo hoy");
        JSONObject denied=GiftsPolicy.canSend(fail);
        assertFalse(denied.getBoolean("allowed"));
        assertEquals("Ya enviaste este regalo hoy",denied.getString("reason"));
        fail.reason=null;
        assertEquals("",GiftsPolicy.canSend(fail).getString("reason"));
        JSONObject unknown=GiftsPolicy.canSend(null);
        assertFalse(unknown.getBoolean("allowed"));
        assertFalse(unknown.getString("reason").isEmpty());
        fail.reason=text(repeated('r',500));
        assertEquals(301,GiftsPolicy.canSend(fail).getString("reason").length());
    }

    @Test public void upgradeResultsAlwaysCarryTheNewUniqueCard()throws Exception{
        TdApi.UpgradeGiftResult value=new TdApi.UpgradeGiftResult();
        value.receivedGiftId="Zz_9"; value.isSaved=true; value.canBeTransferred=true;
        value.transferStarCount=15; value.dropOriginalDetailsStarCount=5;
        value.nextTransferDate=NOW+86400; value.gift=upgraded();
        JSONObject packed=GiftsPolicy.upgrade(value,new JSONObject().put("id","99"));
        assertEquals("Zz_9",packed.getString("id"));
        assertTrue(packed.getBoolean("saved"));
        assertTrue(packed.getBoolean("canTransfer"));
        assertEquals(15,packed.getLong("transferStarCount"));
        assertEquals(5,packed.getLong("dropOriginalDetailsStarCount"));
        assertEquals(NOW+86400,packed.getInt("nextTransferDate"));
        assertEquals("Oso único",packed.getJSONObject("unique").getString("title"));
        assertEquals("99",packed.getJSONObject("unique").getJSONObject("sticker").getString("id"));
        assertEquals(0,GiftsPolicy.upgrade(new TdApi.UpgradeGiftResult(),null).getJSONObject("unique").length());
        rejectedChecked(()->GiftsPolicy.upgrade(null,null));
    }

    @Test public void limitsMatchTheTelegramFieldsTheBridgeSerialises(){
        assertEquals(100,GiftsPolicy.MAX_PAGE);
        assertEquals(64,GiftsPolicy.MAX_PINNED);
        assertEquals(500,GiftsPolicy.MAX_TEXT);
    }
}
