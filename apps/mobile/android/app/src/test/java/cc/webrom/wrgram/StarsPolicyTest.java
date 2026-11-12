package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class StarsPolicyTest {
    private static JSONObject params(String json){try{return new JSONObject(json);}catch(Exception failure){throw new AssertionError(failure);}}
    private static void rejected(Runnable action){try{action.run();fail("Se esperaba un rechazo");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}}

    @Test public void pageAndOffsetStayInsideTheBridgeBounds()throws Exception{
        assertEquals(50,StarsPolicy.page(params("{}")));
        assertEquals(1,StarsPolicy.page(params("{\"limit\":1}")));
        assertEquals(100,StarsPolicy.page(params("{\"limit\":100}")));
        rejected(()->StarsPolicy.page(params("{\"limit\":0}")));
        rejected(()->StarsPolicy.page(params("{\"limit\":101}")));
        rejected(()->StarsPolicy.page(params("{\"limit\":-5}")));
        assertEquals("",StarsPolicy.offset(params("{}")));
        StringBuilder longOffset=new StringBuilder();
        for(int i=0;i<512;i++)longOffset.append('a');
        assertEquals(512,StarsPolicy.offset(params("{\"offset\":\""+longOffset+"\"}")).length());
        rejected(()->StarsPolicy.offset(params("{\"offset\":\""+longOffset+"a\"}")));
    }

    @Test public void directionMapsToTdlibAndRejectsUnknownFilters()throws Exception{
        assertNull(StarsPolicy.direction(""));
        assertNull(StarsPolicy.direction("all"));
        assertNull(StarsPolicy.direction(null));
        assertTrue(StarsPolicy.direction("in") instanceof TdApi.TransactionDirectionIncoming);
        assertTrue(StarsPolicy.direction("out") instanceof TdApi.TransactionDirectionOutgoing);
        rejected(()->StarsPolicy.direction("both"));
    }

    @Test public void starAmountsMustBeWholeNumbersInsideTheLimit()throws Exception{
        assertEquals(250L,StarsPolicy.stars(params("{\"amount\":250}"),"amount",StarsPolicy.MAX_STARS));
        assertEquals(StarsPolicy.MAX_STARS,StarsPolicy.stars(params("{\"amount\":100000000}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":0}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":-1}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":1.5}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":\"250\"}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":100000001}"),"amount",StarsPolicy.MAX_STARS));
        rejected(()->StarsPolicy.stars(params("{\"amount\":10}"),"amount",5));
    }

    @Test public void subscriptionIdentifiersAreReadFromTheKeyTheUiActuallySends()throws Exception{
        assertEquals("abc-123",StarsPolicy.subscriptionId(params("{\"id\":\"abc-123\"}"),"id"));
        assertEquals("sub_9",StarsPolicy.subscriptionId(params("{\"subscriptionId\":\"sub_9\"}"),"subscriptionId"));
        rejected(()->StarsPolicy.subscriptionId(params("{\"subscriptionId\":\"abc\"}"),"id"));
        rejected(()->StarsPolicy.subscriptionId(params("{\"id\":\"\"}"),"id"));
        rejected(()->StarsPolicy.subscriptionId(params("{\"id\":\"a b\"}"),"id"));
        rejected(()->StarsPolicy.subscriptionId(params("{\"id\":\"../../etc\"}"),"id"));
        StringBuilder longId=new StringBuilder();
        for(int i=0;i<129;i++)longId.append('a');
        rejected(()->StarsPolicy.subscriptionId(params("{\"id\":\""+longId+"\"}"),"id"));
    }

    @Test public void giftCodesAreUnwrappedFromTelegramLinksAndValidated()throws Exception{
        assertEquals("Abcdefghij12",StarsPolicy.giftCode("Abcdefghij12"));
        assertEquals("Abcdefghij12",StarsPolicy.giftCode("  https://t.me/premium/Abcdefghij12  "));
        assertEquals("Abcdefghij12",StarsPolicy.giftCode("t.me/premium/Abcdefghij12?gift=1"));
        assertEquals("Abcdefghij12",StarsPolicy.giftCode("premium/Abcdefghij12/extra"));
        assertEquals("code_with-dash",StarsPolicy.giftCode("code_with-dash"));
        rejected(()->StarsPolicy.giftCode(null));
        rejected(()->StarsPolicy.giftCode("short"));
        rejected(()->StarsPolicy.giftCode("https://t.me/premium/short"));
        rejected(()->StarsPolicy.giftCode("Abcdefghij12!"));
        rejected(()->StarsPolicy.giftCode("Abcdefghij12 spaces"));
        StringBuilder longCode=new StringBuilder();
        for(int i=0;i<65;i++)longCode.append('a');
        rejected(()->StarsPolicy.giftCode(longCode.toString()));
    }

    @Test public void periodsReadAsSpanishDurations()throws Exception{
        assertEquals("1 día",StarsPolicy.period(86400));
        assertEquals("30 días",StarsPolicy.period(2592000));
        assertEquals("1 hora",StarsPolicy.period(3600));
        assertEquals("5 horas",StarsPolicy.period(18000));
        assertEquals("1 minuto",StarsPolicy.period(60));
        assertEquals("90 segundos",StarsPolicy.period(90));
        assertEquals("el periodo indicado por Telegram",StarsPolicy.period(0));
        assertEquals("el periodo indicado por Telegram",StarsPolicy.period(-1));
        assertEquals("1 mes",StarsPolicy.months(1));
        assertEquals("12 meses",StarsPolicy.months(12));
    }

    @Test public void outgoingTransactionsKeepTheirNegativeSignAndPeer()throws Exception{
        TdApi.StarTransaction value=new TdApi.StarTransaction("t1",new TdApi.StarAmount(-250,500000000),false,1700000000,
            new TdApi.StarTransactionTypeChannelSubscriptionPurchase(-100123,2592000));
        JSONObject item=StarsPolicy.transaction(value);
        assertEquals("t1",item.optString("id"));
        assertEquals(-250L,item.optLong("starCount"));
        assertEquals(500000000,item.optInt("nanostarCount"));
        assertFalse(item.optBoolean("refund"));
        assertEquals("channelSubscriptionPurchase",item.optString("kind"));
        assertEquals("Suscripción pagada a un canal",item.optString("label"));
        assertEquals("-100123",item.optString("chatId"));
        assertFalse(item.has("userId"));
        assertEquals(2592000,item.optInt("period"));
        assertEquals(-250L,StarsPolicy.wholeStars(value.starAmount));
        assertEquals(0L,StarsPolicy.wholeStars(null));
    }

    @Test public void botPurchasesCarryTheProductTitleAndRefundsAreFlagged()throws Exception{
        TdApi.ProductInfo product=new TdApi.ProductInfo("Curso de dibujo",null,null);
        TdApi.StarTransaction value=new TdApi.StarTransaction("t2",new TdApi.StarAmount(120,0),true,1700000001,
            new TdApi.StarTransactionTypeBotSubscriptionPurchase(77,2592000,product));
        JSONObject item=StarsPolicy.transaction(value);
        assertTrue(item.optBoolean("refund"));
        assertEquals("botSubscriptionPurchase",item.optString("kind"));
        assertEquals("Curso de dibujo",item.optString("title"));
        assertEquals("77",item.optString("userId"));
        assertFalse(item.has("chatId"));
        assertEquals(2592000,item.optInt("period"));
        TdApi.StarTransaction nullProduct=new TdApi.StarTransaction("t3",new TdApi.StarAmount(1,0),false,0,
            new TdApi.StarTransactionTypeBotInvoicePurchase(77,null));
        assertFalse(StarsPolicy.transaction(nullProduct).has("title"));
        assertEquals("unsupported",StarsPolicy.transactionKind(null));
        assertEquals("Movimiento de Stars no reconocido por esta versión",StarsPolicy.transactionLabel(null));
        assertEquals(0,StarsPolicy.transactions(null).length());
        assertEquals(2,StarsPolicy.transactions(new TdApi.StarTransaction[]{value,null,nullProduct}).length());
    }

    @Test public void channelSubscriptionsExposeReuseAndTheRenewalLink()throws Exception{
        TdApi.StarSubscription value=new TdApi.StarSubscription("s1",-100123,1800000000,false,true,
            new TdApi.StarSubscriptionPricing(2592000,300),new TdApi.StarSubscriptionTypeChannel(true,"https://t.me/+abc"));
        JSONObject item=StarsPolicy.subscription(value,"Canal de dibujo");
        assertEquals("s1",item.optString("id"));
        assertEquals("-100123",item.optString("chatId"));
        assertEquals("Canal de dibujo",item.optString("title"));
        assertEquals("channel",item.optString("kind"));
        assertTrue(item.optBoolean("canReuse"));
        assertTrue(item.optBoolean("expiring"));
        assertFalse(item.optBoolean("canceled"));
        assertEquals("https://t.me/+abc",item.optString("inviteLink"));
        assertEquals(300L,item.optLong("starCount"));
        assertEquals(2592000,item.optInt("period"));
        assertFalse(item.has("canceledByBot"));
    }

    @Test public void botSubscriptionsUseTheBotTitleAndMissingChatsFallBack()throws Exception{
        TdApi.StarSubscription value=new TdApi.StarSubscription("s2",77,0,true,false,null,
            new TdApi.StarSubscriptionTypeBot(true,"Bot de cursos",null,""));
        JSONObject item=StarsPolicy.subscription(value,"");
        assertEquals("bot",item.optString("kind"));
        assertEquals("Bot de cursos",item.optString("title"));
        assertTrue(item.optBoolean("canceledByBot"));
        assertTrue(item.optBoolean("canceled"));
        assertFalse(item.has("canReuse"));
        assertFalse(item.has("inviteLink"));
        assertEquals(0L,item.optLong("starCount"));
        assertEquals(0,item.optInt("period"));
        TdApi.StarSubscription untitled=new TdApi.StarSubscription("s4",-100555,0,false,false,null,new TdApi.StarSubscriptionTypeChannel(false,""));
        assertEquals("Chat -100555",StarsPolicy.subscription(untitled,null).optString("title"));
        assertEquals("Canal sin nombre",StarsPolicy.subscription(untitled,"Canal sin nombre").optString("title"));
        assertEquals("Bot de cursos",StarsPolicy.subscription(value,null).optString("title"));
        TdApi.StarSubscription emptyLink=new TdApi.StarSubscription("s3",5,0,false,false,null,new TdApi.StarSubscriptionTypeChannel(false,""));
        assertFalse(StarsPolicy.subscription(emptyLink,"Canal").has("inviteLink"));
    }

    @Test public void paymentOptionsNeverLeakTheStoreProductIdentifier()throws Exception{
        TdApi.StarPaymentOption option=new TdApi.StarPaymentOption("EUR",199,100,"android.test.purchased",true);
        JSONObject item=StarsPolicy.paymentOption(option);
        assertEquals("EUR",item.optString("currency"));
        assertEquals(199L,item.optLong("amount"));
        assertEquals(100L,item.optLong("starCount"));
        assertTrue(item.optBoolean("additional"));
        assertFalse(item.has("storeProductId"));
        assertFalse(item.toString().contains("android.test.purchased"));
        assertEquals("",StarsPolicy.paymentOption(new TdApi.StarPaymentOption(null,0,0,null,false)).optString("currency"));
    }

    @Test public void revenueHandlesAMissingStatusWithoutInventingAmounts()throws Exception{
        TdApi.StarRevenueStatus status=new TdApi.StarRevenueStatus(new TdApi.StarAmount(900,0),new TdApi.StarAmount(400,0),new TdApi.StarAmount(150,0),true,3600);
        JSONObject item=StarsPolicy.revenue(new TdApi.StarRevenueStatistics(null,status,0.013));
        assertEquals(0.013,item.optDouble("usdRate"),0.000001);
        assertEquals(900L,item.getJSONObject("total").optLong("starCount"));
        assertEquals(400L,item.getJSONObject("current").optLong("starCount"));
        assertEquals(150L,item.getJSONObject("available").optLong("starCount"));
        assertTrue(item.optBoolean("withdrawalEnabled"));
        assertEquals(3600,item.optInt("nextWithdrawalIn"));
        JSONObject empty=StarsPolicy.revenue(new TdApi.StarRevenueStatistics(null,null,0));
        assertTrue(empty.isNull("total"));
        assertTrue(empty.isNull("current"));
        assertTrue(empty.isNull("available"));
        assertFalse(empty.optBoolean("withdrawalEnabled"));
        assertEquals(0,empty.optInt("nextWithdrawalIn"));
        assertNull(StarsPolicy.amount(null));
    }

    @Test public void premiumFeaturesAndLimitsAreLabelledAndRoundTrip()throws Exception{
        TdApi.PremiumFeatures value=new TdApi.PremiumFeatures(
            new TdApi.PremiumFeature[]{new TdApi.PremiumFeatureIncreasedLimits(),null,new TdApi.PremiumFeatureChatBoost()},
            new TdApi.PremiumLimit[]{new TdApi.PremiumLimit(new TdApi.PremiumLimitTypeChatFolderCount(),10,20),null},null);
        JSONObject item=StarsPolicy.features(value);
        assertEquals(2,item.getJSONArray("features").length());
        assertEquals("increasedLimits",item.getJSONArray("features").getJSONObject(0).optString("key"));
        assertEquals("Límites ampliados",item.getJSONArray("features").getJSONObject(0).optString("label"));
        assertEquals("Impulsos para canales",item.getJSONArray("features").getJSONObject(1).optString("label"));
        assertEquals(1,item.getJSONArray("limits").length());
        JSONObject limit=item.getJSONArray("limits").getJSONObject(0);
        assertEquals("chatFolderCount",limit.optString("key"));
        assertEquals(10,limit.optInt("defaultValue"));
        assertEquals(20,limit.optInt("premiumValue"));
        assertFalse(limit.optString("label").isEmpty());
        assertTrue(StarsPolicy.limitType("chatFolderCount") instanceof TdApi.PremiumLimitTypeChatFolderCount);
        assertEquals("chatFolderCount",StarsPolicy.limitKey(StarsPolicy.limitType("chatFolderCount")));
        rejected(()->StarsPolicy.limitType("invented"));
        assertEquals("unsupported",StarsPolicy.featureKey(null));
        assertEquals(0,StarsPolicy.features(new TdApi.PremiumFeatures(null,null,null)).getJSONArray("features").length());
    }

    @Test public void premiumGiftOptionsAndCodesKeepOnlyPublicData()throws Exception{
        JSONObject option=StarsPolicy.premiumGiftOption(new TdApi.PremiumGiftPaymentOption("EUR",2499,1500,20,12,"premium_12",null));
        assertEquals(12,option.optInt("monthCount"));
        assertEquals(20,option.optInt("discountPercentage"));
        assertEquals(1500L,option.optLong("starCount"));
        assertFalse(option.has("storeProductId"));
        TdApi.PremiumGiftCodeInfo code=new TdApi.PremiumGiftCodeInfo(new TdApi.MessageSenderUser(9),1700000000,true,42,3,0,77,0);
        JSONObject item=StarsPolicy.giftCodeInfo(code,"Sorteo de dibujo");
        assertEquals("Sorteo de dibujo",item.optString("creator"));
        assertTrue(item.optBoolean("fromGiveaway"));
        assertEquals("42",item.optString("giveawayMessageId"));
        assertEquals(3,item.optInt("monthCount"));
        assertFalse(item.optBoolean("used"));
        assertEquals("77",item.optString("userId"));
        assertFalse(item.has("creatorId"));
        TdApi.PremiumGiftCodeInfo used=new TdApi.PremiumGiftCodeInfo(null,0,false,0,0,7,0,1700000009);
        JSONObject usedItem=StarsPolicy.giftCodeInfo(used,null);
        assertTrue(usedItem.optBoolean("used"));
        assertEquals(7,usedItem.optInt("dayCount"));
        assertFalse(usedItem.has("creator"));
        assertFalse(usedItem.has("giveawayMessageId"));
    }

    @Test public void premiumPlansKeepTheSmallestCurrencyUnitAndNeverTheStoreProduct()throws Exception{
        TdApi.PremiumPaymentOption plan=new TdApi.PremiumPaymentOption("EUR",499,10,12,"premium_12_eur",null);
        JSONObject current=StarsPolicy.premiumPaymentOption(new TdApi.PremiumStatePaymentOption(plan,true,false,"tx1"));
        assertEquals("EUR",current.optString("currency"));
        assertEquals(499L,current.optLong("amount"));
        assertEquals(12,current.optInt("monthCount"));
        assertEquals(10,current.optInt("discountPercentage"));
        assertTrue(current.optBoolean("current"));
        assertFalse(current.optBoolean("upgrade"));
        assertFalse(current.has("storeProductId"));
        assertFalse(current.has("paymentLink"));
        assertFalse(current.has("lastTransactionId"));
        JSONObject upgrade=StarsPolicy.premiumPaymentOption(new TdApi.PremiumStatePaymentOption(new TdApi.PremiumPaymentOption("CLP",399000,0,1,"premium_1_clp",null),false,true,""));
        assertTrue(upgrade.optBoolean("upgrade"));
        assertFalse(upgrade.optBoolean("current"));
        assertEquals(399000L,upgrade.optLong("amount"));
        JSONObject missing=StarsPolicy.premiumPaymentOption(new TdApi.PremiumStatePaymentOption(null,false,false,""));
        assertEquals("",missing.optString("currency"));
        assertEquals(0L,missing.optLong("amount"));
        assertEquals(0,missing.optInt("monthCount"));
    }

    @Test public void theStorePurchaseBoundaryIsStatedInsteadOfSilentlyFaked()throws Exception{
        assertTrue(StarsPolicy.STORE_PURCHASE_UNAVAILABLE.contains("Google Play"));
        assertTrue(StarsPolicy.STORE_PURCHASE_UNAVAILABLE.contains("InputInvoiceTelegram"));
        assertTrue(StarsPolicy.STORE_PURCHASE_UNAVAILABLE.contains("CanPurchaseFromStore"));
        assertTrue(StarsPolicy.STORE_PURCHASE_UNAVAILABLE.contains("Telegram oficial"));
    }
}