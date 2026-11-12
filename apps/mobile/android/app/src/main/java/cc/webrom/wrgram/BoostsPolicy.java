package cc.webrom.wrgram;

import java.util.HashSet;
import java.util.Set;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Chat boost DTOs and their bounds. Pure: no Android, no network, no credentials. */
final class BoostsPolicy {
    private BoostsPolicy(){}

    /** Telegram never hands out more slots than the months of Premium paid for; a larger list is a malformed payload. */
    static final int MAX_SLOTS=64;
    static final int MAX_LEVEL=12;

    static int[] slotIds(JSONObject params,String key){
        Object value=params.opt(key);
        if(!(value instanceof JSONArray)||((JSONArray)value).length()<1||((JSONArray)value).length()>MAX_SLOTS)throw new IllegalArgumentException("Elige entre 1 y "+MAX_SLOTS+" espacios de boost.");
        JSONArray items=(JSONArray)value;
        int[] result=new int[items.length()];
        Set<Integer> seen=new HashSet<>();
        for(int index=0;index<result.length;index++){
            Object item=items.opt(index);
            if(!(item instanceof Number)||((Number)item).longValue()!=((Number)item).doubleValue())throw new IllegalArgumentException("Espacio de boost no válido.");
            int slot=((Number)item).intValue();
            if(slot<0||slot>MAX_SLOTS)throw new IllegalArgumentException("Espacio de boost no válido.");
            if(!seen.add(slot))throw new IllegalArgumentException("Hay espacios de boost repetidos.");
            result[index]=slot;
        }
        return result;
    }

    static int level(JSONObject params,String key){
        int value=params.optInt(key,0);
        if(value<1||value>MAX_LEVEL)throw new IllegalArgumentException("Nivel de boost no válido.");
        return value;
    }

    static boolean channel(JSONObject params){return params.optBoolean("channel");}

    static JSONObject slot(TdApi.ChatBoostSlot value,int now)throws Exception{
        if(value==null)throw new IllegalArgumentException("Espacio de boost no válido.");
        boolean inUse=value.currentlyBoostedChatId!=0;
        JSONObject item=new JSONObject().put("slotId",value.slotId).put("chatId",String.valueOf(value.currentlyBoostedChatId))
            .put("startDate",value.startDate).put("expirationDate",value.expirationDate)
            .put("cooldownUntilDate",value.cooldownUntilDate).put("inUse",inUse)
            .put("available",!inUse&&value.cooldownUntilDate<=now);
        if(inUse&&value.expirationDate>0&&value.expirationDate<=now)item.put("expired",true);
        return item;
    }

    static JSONObject slots(TdApi.ChatBoostSlots value,int now)throws Exception{
        JSONArray items=new JSONArray();
        int available=0;
        if(value!=null&&value.slots!=null)for(TdApi.ChatBoostSlot slot:value.slots){
            JSONObject item=slot(slot,now);
            if(item.getBoolean("available"))available++;
            items.put(item);
        }
        return new JSONObject().put("total",items.length()).put("available",available).put("items",items);
    }

    static double percentage(double value){
        if(!Double.isFinite(value)||value<0)return 0;
        return value>100?100:value;
    }

    static JSONObject status(TdApi.ChatBoostStatus value,int now)throws Exception{
        if(value==null)throw new IllegalArgumentException("Estado de boost no válido.");
        JSONObject item=new JSONObject().put("level",value.level).put("boostCount",value.boostCount)
            .put("currentLevelBoostCount",value.currentLevelBoostCount).put("nextLevelBoostCount",value.nextLevelBoostCount)
            .put("giftCodeBoostCount",value.giftCodeBoostCount).put("premiumMemberCount",value.premiumMemberCount)
            .put("premiumMemberPercentage",percentage(value.premiumMemberPercentage));
        JSONArray applied=new JSONArray();
        if(value.appliedSlotIds!=null)for(int slot:value.appliedSlotIds)applied.put(slot);
        item.put("appliedSlotIds",applied);
        if(value.boostUrl!=null&&!value.boostUrl.isEmpty())item.put("boostUrl",NativeSnapshot.limit(value.boostUrl,512));
        if(value.prepaidGiveaways!=null&&value.prepaidGiveaways.length>0){
            JSONArray giveaways=new JSONArray();
            for(TdApi.PrepaidGiveaway giveaway:value.prepaidGiveaways){
                if(giveaway==null)continue;
                JSONObject entry=new JSONObject().put("id",String.valueOf(giveaway.id)).put("winnerCount",giveaway.winnerCount)
                    .put("boostCount",giveaway.boostCount).put("paymentDate",giveaway.paymentDate);
                if(giveaway.prize instanceof TdApi.GiveawayPrizePremium)entry.put("monthCount",((TdApi.GiveawayPrizePremium)giveaway.prize).monthCount);
                if(giveaway.prize instanceof TdApi.GiveawayPrizeStars)entry.put("starCount",((TdApi.GiveawayPrizeStars)giveaway.prize).starCount);
                giveaways.put(entry);
            }
            item.put("giveaways",giveaways);
        }
        return item;
    }

    static JSONObject levelFeatures(TdApi.ChatBoostLevelFeatures value)throws Exception{
        if(value==null)throw new IllegalArgumentException("Nivel de ventajas no válido.");
        return new JSONObject().put("level",value.level).put("storyPerDayCount",value.storyPerDayCount)
            .put("customEmojiReactionCount",value.customEmojiReactionCount).put("titleColorCount",value.titleColorCount)
            .put("profileAccentColorCount",value.profileAccentColorCount).put("accentColorCount",value.accentColorCount)
            .put("chatThemeBackgroundCount",value.chatThemeBackgroundCount)
            .put("canSetProfileBackgroundCustomEmoji",value.canSetProfileBackgroundCustomEmoji)
            .put("canSetBackgroundCustomEmoji",value.canSetBackgroundCustomEmoji)
            .put("canSetEmojiStatus",value.canSetEmojiStatus).put("canSetCustomBackground",value.canSetCustomBackground)
            .put("canSetCustomEmojiStickerSet",value.canSetCustomEmojiStickerSet)
            .put("canEnableAutomaticTranslation",value.canEnableAutomaticTranslation)
            .put("canRecognizeSpeech",value.canRecognizeSpeech).put("canDisableSponsoredMessages",value.canDisableSponsoredMessages);
    }

    static JSONObject features(TdApi.ChatBoostFeatures value)throws Exception{
        JSONArray levels=new JSONArray();
        if(value!=null&&value.features!=null)for(TdApi.ChatBoostLevelFeatures level:value.features){if(level!=null)levels.put(levelFeatures(level));}
        JSONObject minimum=new JSONObject();
        if(value!=null){
            minimum.put("profileBackgroundCustomEmoji",value.minProfileBackgroundCustomEmojiBoostLevel)
                .put("backgroundCustomEmoji",value.minBackgroundCustomEmojiBoostLevel)
                .put("emojiStatus",value.minEmojiStatusBoostLevel)
                .put("chatThemeBackground",value.minChatThemeBackgroundBoostLevel)
                .put("customBackground",value.minCustomBackgroundBoostLevel)
                .put("customEmojiStickerSet",value.minCustomEmojiStickerSetBoostLevel)
                .put("automaticTranslation",value.minAutomaticTranslationBoostLevel)
                .put("speechRecognition",value.minSpeechRecognitionBoostLevel)
                .put("sponsoredMessageDisable",value.minSponsoredMessageDisableBoostLevel);
        }
        return new JSONObject().put("levels",levels).put("minimum",minimum);
    }

    static JSONObject link(TdApi.ChatBoostLink value)throws Exception{
        if(value==null)throw new IllegalArgumentException("Enlace de boost no válido.");
        return new JSONObject().put("link",NativeSnapshot.limit(value.link==null?"":value.link,512)).put("isPublic",value.isPublic);
    }

    /** A boost link is only ever handed to TDLib for parsing; nothing is fetched from it here. */
    static String boostUrl(String raw){
        String value=raw==null?"":raw.trim();
        if(value.isEmpty())throw new IllegalArgumentException("Escribe el enlace de boost.");
        if(value.length()>512)throw new IllegalArgumentException("El enlace de boost es demasiado largo.");
        if(!value.startsWith("https://")&&!value.startsWith("http://"))throw new IllegalArgumentException("El enlace de boost debe empezar por https://.");
        return value;
    }
}
