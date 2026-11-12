package cc.webrom.wrgram;

import java.util.ArrayList;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Telegram Star gift DTOs and their bounds. Pure: no Android, no network, no credentials. */
final class GiftsPolicy {
    private GiftsPolicy(){}

    static final int MAX_PAGE=100;
    static final int MAX_PINNED=64;
    /** gift_text_length_max is a TDLib option; 500 stays below every value Telegram has shipped. */
    static final int MAX_TEXT=500;

    /** A receivedGiftId is an opaque Telegram token: it never leaves the bridge as anything but a bounded string. */
    static String receivedId(JSONObject params,String key){
        Object value=params.opt(key);
        if(!(value instanceof String)||((String)value).isEmpty()||((String)value).length()>64||!((String)value).matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException("Identificador de regalo no válido.");
        return (String)value;
    }

    static String offset(JSONObject params){
        String value=params.optString("offset","");
        return value.length()>256?value.substring(0,256):value;
    }

    static int page(JSONObject params){
        int value=params.optInt("limit",20);
        if(value<1||value>MAX_PAGE)throw new IllegalArgumentException("Elige entre 1 y "+MAX_PAGE+" regalos por página.");
        return value;
    }

    static boolean sortByPrice(JSONObject params){return params.optBoolean("sort");}

    /** Only the filters TDLib can answer with; an unknown view asks for everything instead of pretending to filter. */
    static TdApi.GetReceivedGifts filters(JSONObject params,TdApi.MessageSender owner,int limit,String offset){
        TdApi.GetReceivedGifts request=new TdApi.GetReceivedGifts();
        request.ownerId=owner; request.limit=limit; request.offset=offset; request.sortByPrice=sortByPrice(params);
        String view=params.optString("view","all");
        if(view.equals("saved"))request.excludeUnsaved=true;
        else if(view.equals("unsaved"))request.excludeSaved=true;
        else if(view.equals("upgradable"))request.excludeNonUpgradable=true;
        else if(view.equals("upgraded"))request.excludeUpgradable=true;
        else if(view.equals("colors"))request.excludeWithoutColors=true;
        else if(!view.equals("all"))throw new IllegalArgumentException("Ese filtro de regalos no existe en Telegram.");
        return request;
    }

    static String rarity(TdApi.UpgradedGiftAttributeRarity value){
        if(value instanceof TdApi.UpgradedGiftAttributeRarityUncommon)return "uncommon";
        if(value instanceof TdApi.UpgradedGiftAttributeRarityRare)return "rare";
        if(value instanceof TdApi.UpgradedGiftAttributeRarityEpic)return "epic";
        if(value instanceof TdApi.UpgradedGiftAttributeRarityLegendary)return "legendary";
        return "common";
    }

    static int perMille(TdApi.UpgradedGiftAttributeRarity value){
        if(value instanceof TdApi.UpgradedGiftAttributeRarityPerMille)return ((TdApi.UpgradedGiftAttributeRarityPerMille)value).perMille;
        return 0;
    }

    /** TDLib colours are 0xRRGGBB integers; the WebView only understands hex strings. */
    static String hex(int color){return String.format("#%06X",color&0xFFFFFF);}

    static JSONObject colors(TdApi.UpgradedGiftBackdropColors value) throws Exception{
        if(value==null)return null;
        return new JSONObject()
            .put("center",hex(value.centerColor)).put("edge",hex(value.edgeColor))
            .put("symbol",hex(value.symbolColor)).put("text",hex(value.textColor));
    }

    private static JSONObject attribute(String name,TdApi.UpgradedGiftAttributeRarity rarity,JSONObject sticker) throws Exception{
        JSONObject item=new JSONObject().put("name",NativeSnapshot.limit(name==null?"":name,120)).put("rarity",rarity(rarity)).put("perMille",perMille(rarity));
        if(sticker!=null)item.put("sticker",sticker);
        return item;
    }

    /**
     * The sticker of an upgraded gift is the model's own sticker, so callers hand it in already
     * serialised; nothing here touches the network.
     */
    static JSONObject unique(TdApi.UpgradedGift value,JSONObject sticker) throws Exception{
        JSONObject item=new JSONObject();
        if(value==null)return item;
        item.put("title",NativeSnapshot.limit(value.title==null?"":value.title,180))
            .put("name",NativeSnapshot.limit(value.name==null?"":value.name,180))
            .put("number",value.number).put("totalUpgradedCount",value.totalUpgradedCount).put("maxUpgradedCount",value.maxUpgradedCount)
            .put("isPremium",value.isPremium).put("isCrafted",value.isCrafted).put("isBurned",value.isBurned)
            .put("publisherChatId",String.valueOf(value.publisherChatId));
        if(value.model!=null)item.put("model",attribute(value.model.name,value.model.rarity,null).put("crafted",value.model.isCrafted));
        if(value.symbol!=null)item.put("symbol",attribute(value.symbol.name,value.symbol.rarity,null));
        if(value.backdrop!=null)item.put("backdrop",new JSONObject().put("id",value.backdrop.id).put("name",NativeSnapshot.limit(value.backdrop.name==null?"":value.backdrop.name,120))
            .put("rarity",rarity(value.backdrop.rarity)).put("perMille",perMille(value.backdrop.rarity)).put("colors",colors(value.backdrop.colors)));
        if(value.valueAmount>0)item.put("valueCurrency",NativeSnapshot.limit(value.valueCurrency==null?"":value.valueCurrency,8))
            .put("valueAmount",value.valueAmount).put("valueUsdAmount",value.valueUsdAmount);
        if(sticker!=null)item.put("sticker",sticker);
        return item;
    }

    static JSONObject available(TdApi.AvailableGift value,JSONObject sticker) throws Exception{
        if(value==null||value.gift==null)throw new IllegalArgumentException("Regalo de Telegram no válido.");
        TdApi.Gift gift=value.gift;
        JSONObject item=new JSONObject().put("id",String.valueOf(gift.id)).put("starCount",gift.starCount)
            .put("defaultSellStarCount",gift.defaultSellStarCount).put("upgradeStarCount",gift.upgradeStarCount)
            .put("upgradeVariantCount",gift.upgradeVariantCount).put("hasColors",gift.hasColors)
            .put("isPremium",gift.isPremium).put("isForBirthday",gift.isForBirthday).put("nextSendDate",gift.nextSendDate)
            .put("publisherChatId",String.valueOf(gift.publisherChatId))
            .put("resaleCount",value.resaleCount).put("minResaleStarCount",value.minResaleStarCount)
            .put("upgradedTitle",NativeSnapshot.limit(value.title==null?"":value.title,180));
        if(sticker!=null)item.put("sticker",sticker);
        return item;
    }

    static JSONObject catalog(List<JSONObject> items) throws Exception{
        JSONArray gifts=new JSONArray();
        for(JSONObject item:items)if(item!=null)gifts.put(item);
        return new JSONObject().put("gifts",gifts);
    }

    static JSONObject received(TdApi.ReceivedGift value,String sender,JSONObject sticker) throws Exception{
        if(value==null)throw new IllegalArgumentException("Regalo recibido no válido.");
        JSONObject item=new JSONObject().put("id",NativeSnapshot.limit(value.receivedGiftId==null?"":value.receivedGiftId,64))
            .put("date",value.date).put("private",value.isPrivate).put("saved",value.isSaved).put("pinned",value.isPinned)
            .put("canUpgrade",value.canBeUpgraded).put("canTransfer",value.canBeTransferred).put("canDelete",value.canBeDeleted)
            .put("refunded",value.wasRefunded).put("number",value.uniqueGiftNumber)
            .put("sellStarCount",value.sellStarCount).put("prepaidUpgradeStarCount",value.prepaidUpgradeStarCount)
            .put("upgradeSeparate",value.isUpgradeSeparate).put("transferStarCount",value.transferStarCount)
            .put("dropOriginalDetailsStarCount",value.dropOriginalDetailsStarCount)
            .put("nextTransferDate",value.nextTransferDate).put("nextResaleDate",value.nextResaleDate).put("exportDate",value.exportDate);
        JSONArray collections=new JSONArray();
        if(value.collectionIds!=null)for(int id:value.collectionIds)collections.put(id);
        item.put("collections",collections);
        if(sender!=null&&!sender.isEmpty())item.put("sender",NativeSnapshot.limit(sender,180));
        if(value.senderId instanceof TdApi.MessageSenderUser)item.put("senderId",String.valueOf(((TdApi.MessageSenderUser)value.senderId).userId));
        else if(value.senderId instanceof TdApi.MessageSenderChat)item.put("senderId",String.valueOf(((TdApi.MessageSenderChat)value.senderId).chatId));
        if(value.text!=null&&value.text.text!=null&&!value.text.text.isEmpty())item.put("text",NativeSnapshot.limit(value.text.text,MAX_TEXT));
        String kind="unknown";
        if(value.gift instanceof TdApi.SentGiftRegular){
            TdApi.Gift gift=((TdApi.SentGiftRegular)value.gift).gift;
            if(gift!=null){kind="regular";item.put("giftId",String.valueOf(gift.id)).put("starCount",gift.starCount).put("upgradeStarCount",gift.upgradeStarCount).put("isPremium",gift.isPremium);}
        }else if(value.gift instanceof TdApi.SentGiftUpgraded){
            kind="upgraded";
            TdApi.UpgradedGift upgraded=((TdApi.SentGiftUpgraded)value.gift).gift;
            if(upgraded!=null)item.put("unique",unique(upgraded,sticker));
        }
        if(sticker!=null&&!("upgraded".equals(kind)))item.put("sticker",sticker);
        item.put("kind",kind);
        return item;
    }

    static JSONObject received(TdApi.ReceivedGifts value,List<JSONObject> items) throws Exception{
        JSONArray gifts=new JSONArray();
        for(JSONObject item:items)if(item!=null)gifts.put(item);
        return new JSONObject().put("total",value==null?0:value.totalCount)
            .put("offset",value==null||value.nextOffset==null?"":NativeSnapshot.limit(value.nextOffset,256))
            .put("notifications",value!=null&&value.areNotificationsEnabled)
            .put("gifts",gifts);
    }

    static JSONObject canSend(TdApi.CanSendGiftResult value) throws Exception{
        if(value instanceof TdApi.CanSendGiftResultOk)return new JSONObject().put("allowed",true).put("reason","");
        if(value instanceof TdApi.CanSendGiftResultFail){
            TdApi.FormattedText reason=((TdApi.CanSendGiftResultFail)value).reason;
            return new JSONObject().put("allowed",false).put("reason",NativeSnapshot.limit(reason==null||reason.text==null?"":reason.text,300));
        }
        return new JSONObject().put("allowed",false).put("reason","Telegram no permite enviar este regalo ahora.");
    }

    static JSONObject preview(TdApi.GiftUpgradePreview value,JSONArray models,JSONArray symbols) throws Exception{
        JSONArray modelList=models==null?new JSONArray():models, symbolList=symbols==null?new JSONArray():symbols;
        JSONArray backdrops=new JSONArray(), prices=new JSONArray(), nextPrices=new JSONArray();
        if(value!=null&&value.backdrops!=null)for(TdApi.UpgradedGiftBackdrop backdrop:value.backdrops){
            if(backdrop==null)continue;
            backdrops.put(new JSONObject().put("id",backdrop.id).put("name",NativeSnapshot.limit(backdrop.name==null?"":backdrop.name,120))
                .put("rarity",rarity(backdrop.rarity)).put("perMille",perMille(backdrop.rarity)).put("colors",colors(backdrop.colors)));
        }
        if(value!=null&&value.prices!=null)for(TdApi.GiftUpgradePrice price:value.prices){
            if(price==null)continue;
            prices.put(new JSONObject().put("date",price.date).put("starCount",price.starCount));
        }
        if(value!=null&&value.nextPrices!=null)for(TdApi.GiftUpgradePrice price:value.nextPrices){
            if(price==null)continue;
            nextPrices.put(new JSONObject().put("date",price.date).put("starCount",price.starCount));
        }
        return new JSONObject().put("models",modelList).put("symbols",symbolList).put("backdrops",backdrops)
            .put("prices",prices).put("nextPrices",nextPrices);
    }

    static JSONArray models(TdApi.UpgradedGiftModel[] values) throws Exception{
        JSONArray items=new JSONArray();
        if(values!=null)for(TdApi.UpgradedGiftModel model:values){
            if(model==null)continue;
            JSONObject item=attribute(model.name,model.rarity,null);
            item.put("crafted",model.isCrafted);
            items.put(item);
        }
        return items;
    }

    static JSONArray symbols(TdApi.UpgradedGiftSymbol[] values) throws Exception{
        JSONArray items=new JSONArray();
        if(values!=null)for(TdApi.UpgradedGiftSymbol symbol:values){
            if(symbol==null)continue;
            items.put(attribute(symbol.name,symbol.rarity,null));
        }
        return items;
    }

    static JSONObject upgrade(TdApi.UpgradeGiftResult value,JSONObject sticker) throws Exception{
        if(value==null)throw new IllegalArgumentException("Telegram no devolvió el regalo mejorado.");
        JSONObject item=new JSONObject().put("id",NativeSnapshot.limit(value.receivedGiftId==null?"":value.receivedGiftId,64))
            .put("saved",value.isSaved).put("canTransfer",value.canBeTransferred)
            .put("transferStarCount",value.transferStarCount).put("dropOriginalDetailsStarCount",value.dropOriginalDetailsStarCount)
            .put("nextTransferDate",value.nextTransferDate).put("nextResaleDate",value.nextResaleDate).put("exportDate",value.exportDate)
            .put("unique",unique(value.gift,sticker));
        return item;
    }

    static String[] receivedIds(JSONObject params,String key){
        Object value=params.opt(key);
        if(!(value instanceof JSONArray)||((JSONArray)value).length()<1||((JSONArray)value).length()>MAX_PINNED)throw new IllegalArgumentException("Elige entre 1 y "+MAX_PINNED+" regalos.");
        JSONArray items=(JSONArray)value;
        List<String> ids=new ArrayList<>();
        for(int index=0;index<items.length();index++){
            Object item=items.opt(index);
            if(!(item instanceof String)||!((String)item).matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException("Identificador de regalo no válido.");
            if(!ids.contains((String)item))ids.add((String)item);
        }
        return ids.toArray(new String[0]);
    }

    static String message(JSONObject params,String key){
        Object value=params.opt(key);
        if(value==null)return "";
        if(!(value instanceof String))throw new IllegalArgumentException("El mensaje del regalo no es válido.");
        String text=((String)value).trim();
        if(text.length()>MAX_TEXT)throw new IllegalArgumentException("El mensaje del regalo no puede superar "+MAX_TEXT+" caracteres.");
        return text;
    }

    static boolean flag(JSONObject params,String key){return params.optBoolean(key);}
}
