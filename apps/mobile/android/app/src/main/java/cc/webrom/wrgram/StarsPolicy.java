package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Stars wallet and Premium DTOs plus their bounds. Pure: no Android, no network, no credentials. */
final class StarsPolicy {
    private StarsPolicy(){}

    static final int MAX_PAGE=100;
    /** Telegram sells gift cards up to 10000 Stars; anything above is a malformed or hostile payload. */
    static final long MAX_STARS=100_000_000L;
    static final String STORE_PURCHASE_UNAVAILABLE="WRGram se distribuye por Google Play, así que no puede iniciar el cobro: TDLib reserva InputInvoiceTelegram a clientes fuera de tienda y CanPurchaseFromStore a las apps oficiales. Compra Stars o Premium en Telegram oficial y gástalos aquí.";

    static int page(JSONObject params){int limit=params.optInt("limit",50);if(limit<1||limit>MAX_PAGE)throw new IllegalArgumentException("El límite debe estar entre 1 y "+MAX_PAGE+".");return limit;}

    static String offset(JSONObject params){String value=params.optString("offset","");if(value.length()>512)throw new IllegalArgumentException("Desplazamiento no válido.");return value;}

    static TdApi.TransactionDirection direction(String key){
        switch(key==null?"":key){
            case "":case "all":return null;
            case "in":return new TdApi.TransactionDirectionIncoming();
            case "out":return new TdApi.TransactionDirectionOutgoing();
            default:throw new IllegalArgumentException("Dirección de transacciones no válida.");
        }
    }

    static long stars(JSONObject params,String key,long maximum){
        Object value=params.opt(key);
        if(!(value instanceof Number)||((Number)value).longValue()!=((Number)value).doubleValue())throw new IllegalArgumentException("Importe de Stars no válido.");
        long amount=((Number)value).longValue();
        if(amount<1||amount>maximum)throw new IllegalArgumentException("El importe debe estar entre 1 y "+maximum+" Stars.");
        return amount;
    }

    static JSONObject amount(TdApi.StarAmount value){
        if(value==null)return null;
        try{return new JSONObject().put("starCount",value.starCount).put("nanostarCount",value.nanostarCount);}catch(Exception ignored){throw new IllegalArgumentException("Invalid DTO");}
    }

    static long wholeStars(TdApi.StarAmount value){return value==null?0:value.starCount;}

    static String period(int seconds){
        if(seconds<=0)return "el periodo indicado por Telegram";
        if(seconds%86400==0){int days=seconds/86400;return days==1?"1 día":days+" días";}
        if(seconds%3600==0){int hours=seconds/3600;return hours==1?"1 hora":hours+" horas";}
        if(seconds%60==0){int minutes=seconds/60;return minutes==1?"1 minuto":minutes+" minutos";}
        return seconds+" segundos";
    }

    static String months(int count){return count==1?"1 mes":count+" meses";}

    static JSONObject transaction(TdApi.StarTransaction value)throws Exception{
        JSONObject item=new JSONObject().put("id",value.id==null?"":value.id).put("date",value.date).put("refund",value.isRefund);
        JSONObject amount=amount(value.starAmount);
        item.put("starCount",amount==null?0:amount.getLong("starCount")).put("nanostarCount",amount==null?0:amount.getInt("nanostarCount"));
        item.put("kind",transactionKind(value.type)).put("label",transactionLabel(value.type));
        long chat=transactionChat(value.type),user=transactionUser(value.type);
        if(chat!=0)item.put("chatId",String.valueOf(chat));
        if(user!=0)item.put("userId",String.valueOf(user));
        String title=transactionTitle(value.type);
        if(title!=null&&!title.isEmpty())item.put("title",NativeSnapshot.limit(title,180));
        int period=transactionPeriod(value.type);
        if(period>0)item.put("period",period);
        return item;
    }

    static JSONArray transactions(TdApi.StarTransaction[] values)throws Exception{
        JSONArray list=new JSONArray();
        if(values!=null)for(TdApi.StarTransaction value:values){if(value!=null)list.put(transaction(value));}
        return list;
    }

    static String transactionKind(TdApi.StarTransactionType type){
        if(type instanceof TdApi.StarTransactionTypePremiumBotDeposit)return "premiumBotDeposit";
        if(type instanceof TdApi.StarTransactionTypeAppStoreDeposit)return "appStoreDeposit";
        if(type instanceof TdApi.StarTransactionTypeGooglePlayDeposit)return "googlePlayDeposit";
        if(type instanceof TdApi.StarTransactionTypeFragmentDeposit)return "fragmentDeposit";
        if(type instanceof TdApi.StarTransactionTypeUserDeposit)return "userDeposit";
        if(type instanceof TdApi.StarTransactionTypeGiveawayDeposit)return "giveawayDeposit";
        if(type instanceof TdApi.StarTransactionTypeFragmentWithdrawal)return "fragmentWithdrawal";
        if(type instanceof TdApi.StarTransactionTypeTelegramAdsWithdrawal)return "adsWithdrawal";
        if(type instanceof TdApi.StarTransactionTypeTelegramApiUsage)return "apiUsage";
        if(type instanceof TdApi.StarTransactionTypeBotPaidMediaPurchase)return "botPaidMediaPurchase";
        if(type instanceof TdApi.StarTransactionTypeBotPaidMediaSale)return "botPaidMediaSale";
        if(type instanceof TdApi.StarTransactionTypeChannelPaidMediaPurchase)return "channelPaidMediaPurchase";
        if(type instanceof TdApi.StarTransactionTypeChannelPaidMediaSale)return "channelPaidMediaSale";
        if(type instanceof TdApi.StarTransactionTypeBotInvoicePurchase)return "botInvoicePurchase";
        if(type instanceof TdApi.StarTransactionTypeBotInvoiceSale)return "botInvoiceSale";
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionPurchase)return "botSubscriptionPurchase";
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionSale)return "botSubscriptionSale";
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionPurchase)return "channelSubscriptionPurchase";
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionSale)return "channelSubscriptionSale";
        if(type instanceof TdApi.StarTransactionTypeGiftAuctionBid)return "giftAuctionBid";
        if(type instanceof TdApi.StarTransactionTypeGiftPurchase)return "giftPurchase";
        if(type instanceof TdApi.StarTransactionTypeGiftPurchaseOffer)return "giftPurchaseOffer";
        if(type instanceof TdApi.StarTransactionTypeGiftTransfer)return "giftTransfer";
        if(type instanceof TdApi.StarTransactionTypeGiftOriginalDetailsDrop)return "giftOriginalDetailsDrop";
        if(type instanceof TdApi.StarTransactionTypeGiftSale)return "giftSale";
        if(type instanceof TdApi.StarTransactionTypeGiftUpgrade)return "giftUpgrade";
        if(type instanceof TdApi.StarTransactionTypeGiftUpgradePurchase)return "giftUpgradePurchase";
        if(type instanceof TdApi.StarTransactionTypeUpgradedGiftPurchase)return "upgradedGiftPurchase";
        if(type instanceof TdApi.StarTransactionTypeUpgradedGiftSale)return "upgradedGiftSale";
        if(type instanceof TdApi.StarTransactionTypeChannelPaidReactionSend)return "paidReactionSend";
        if(type instanceof TdApi.StarTransactionTypeChannelPaidReactionReceive)return "paidReactionReceive";
        if(type instanceof TdApi.StarTransactionTypeAffiliateProgramCommission)return "affiliateCommission";
        if(type instanceof TdApi.StarTransactionTypePaidMessageSend)return "paidMessageSend";
        if(type instanceof TdApi.StarTransactionTypePaidMessageReceive)return "paidMessageReceive";
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallMessageSend)return "paidGroupCallMessageSend";
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallMessageReceive)return "paidGroupCallMessageReceive";
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallReactionSend)return "paidGroupCallReactionSend";
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallReactionReceive)return "paidGroupCallReactionReceive";
        if(type instanceof TdApi.StarTransactionTypeSuggestedPostPaymentSend)return "suggestedPostSend";
        if(type instanceof TdApi.StarTransactionTypeSuggestedPostPaymentReceive)return "suggestedPostReceive";
        if(type instanceof TdApi.StarTransactionTypePremiumPurchase)return "premiumPurchase";
        if(type instanceof TdApi.StarTransactionTypeBusinessBotTransferSend)return "businessBotTransferSend";
        if(type instanceof TdApi.StarTransactionTypeBusinessBotTransferReceive)return "businessBotTransferReceive";
        if(type instanceof TdApi.StarTransactionTypePublicPostSearch)return "publicPostSearch";
        return "unsupported";
    }

    static String transactionLabel(TdApi.StarTransactionType type){
        String kind=transactionKind(type);
        switch(kind){
            case "premiumBotDeposit":return "Compra de Stars en @PremiumBot";
            case "appStoreDeposit":return "Compra de Stars en App Store";
            case "googlePlayDeposit":return "Compra de Stars en Google Play";
            case "fragmentDeposit":return "Compra de Stars en Fragment";
            case "userDeposit":return "Stars regalados por un usuario";
            case "giveawayDeposit":return "Stars de un sorteo";
            case "fragmentWithdrawal":return "Retirada a Fragment";
            case "adsWithdrawal":return "Retirada de ingresos de Telegram Ads";
            case "apiUsage":return "Uso de la API de Telegram";
            case "botPaidMediaPurchase":return "Contenido de pago comprado a un bot";
            case "botPaidMediaSale":return "Contenido de pago vendido por tu bot";
            case "channelPaidMediaPurchase":return "Contenido de pago comprado a un canal";
            case "channelPaidMediaSale":return "Contenido de pago vendido por tu canal";
            case "botInvoicePurchase":return "Factura pagada a un bot";
            case "botInvoiceSale":return "Factura cobrada por tu bot";
            case "botSubscriptionPurchase":return "Suscripción pagada a un bot";
            case "botSubscriptionSale":return "Suscripción cobrada por tu bot";
            case "channelSubscriptionPurchase":return "Suscripción pagada a un canal";
            case "channelSubscriptionSale":return "Suscripción cobrada por tu canal";
            case "giftAuctionBid":return "Puja en una subasta de regalos";
            case "giftPurchase":return "Compra de un regalo";
            case "giftPurchaseOffer":return "Oferta de compra de un regalo";
            case "giftTransfer":return "Transferencia de un regalo";
            case "giftOriginalDetailsDrop":return "Retirada de los datos originales de un regalo";
            case "giftSale":return "Venta de un regalo";
            case "giftUpgrade":return "Mejora de un regalo";
            case "giftUpgradePurchase":return "Compra de la mejora de un regalo";
            case "upgradedGiftPurchase":return "Compra de un regalo mejorado";
            case "upgradedGiftSale":return "Venta de un regalo mejorado";
            case "paidReactionSend":return "Reacción de pago enviada";
            case "paidReactionReceive":return "Reacción de pago recibida";
            case "affiliateCommission":return "Comisión de programa de afiliados";
            case "paidMessageSend":return "Mensajes de pago enviados";
            case "paidMessageReceive":return "Mensajes de pago recibidos";
            case "paidGroupCallMessageSend":return "Mensajes de pago en un grupo de voz";
            case "paidGroupCallMessageReceive":return "Ingresos de mensajes en un grupo de voz";
            case "paidGroupCallReactionSend":return "Reacciones de pago en un grupo de voz";
            case "paidGroupCallReactionReceive":return "Ingresos de reacciones en un grupo de voz";
            case "suggestedPostSend":return "Publicación sugerida pagada";
            case "suggestedPostReceive":return "Publicación sugerida cobrada";
            case "premiumPurchase":return "Telegram Premium regalado con Stars";
            case "businessBotTransferSend":return "Transferencia a un bot de negocio";
            case "businessBotTransferReceive":return "Transferencia de un bot de negocio";
            case "publicPostSearch":return "Búsqueda de publicaciones públicas";
            default:return "Movimiento de Stars no reconocido por esta versión";
        }
    }

    static long transactionChat(TdApi.StarTransactionType type){
        if(type instanceof TdApi.StarTransactionTypeGiveawayDeposit)return ((TdApi.StarTransactionTypeGiveawayDeposit)type).chatId;
        if(type instanceof TdApi.StarTransactionTypeChannelPaidMediaPurchase)return ((TdApi.StarTransactionTypeChannelPaidMediaPurchase)type).chatId;
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionPurchase)return ((TdApi.StarTransactionTypeChannelSubscriptionPurchase)type).chatId;
        if(type instanceof TdApi.StarTransactionTypeChannelPaidReactionSend)return ((TdApi.StarTransactionTypeChannelPaidReactionSend)type).chatId;
        if(type instanceof TdApi.StarTransactionTypeAffiliateProgramCommission)return ((TdApi.StarTransactionTypeAffiliateProgramCommission)type).chatId;
        if(type instanceof TdApi.StarTransactionTypePaidMessageSend)return ((TdApi.StarTransactionTypePaidMessageSend)type).chatId;
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallMessageSend)return ((TdApi.StarTransactionTypePaidGroupCallMessageSend)type).chatId;
        if(type instanceof TdApi.StarTransactionTypePaidGroupCallReactionSend)return ((TdApi.StarTransactionTypePaidGroupCallReactionSend)type).chatId;
        if(type instanceof TdApi.StarTransactionTypeSuggestedPostPaymentSend)return ((TdApi.StarTransactionTypeSuggestedPostPaymentSend)type).chatId;
        return 0;
    }

    static long transactionUser(TdApi.StarTransactionType type){
        if(type instanceof TdApi.StarTransactionTypeUserDeposit)return ((TdApi.StarTransactionTypeUserDeposit)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotPaidMediaPurchase)return ((TdApi.StarTransactionTypeBotPaidMediaPurchase)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotPaidMediaSale)return ((TdApi.StarTransactionTypeBotPaidMediaSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeChannelPaidMediaSale)return ((TdApi.StarTransactionTypeChannelPaidMediaSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotInvoicePurchase)return ((TdApi.StarTransactionTypeBotInvoicePurchase)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotInvoiceSale)return ((TdApi.StarTransactionTypeBotInvoiceSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionPurchase)return ((TdApi.StarTransactionTypeBotSubscriptionPurchase)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionSale)return ((TdApi.StarTransactionTypeBotSubscriptionSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionSale)return ((TdApi.StarTransactionTypeChannelSubscriptionSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeGiftSale)return ((TdApi.StarTransactionTypeGiftSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeGiftUpgrade)return ((TdApi.StarTransactionTypeGiftUpgrade)type).userId;
        if(type instanceof TdApi.StarTransactionTypeUpgradedGiftPurchase)return ((TdApi.StarTransactionTypeUpgradedGiftPurchase)type).userId;
        if(type instanceof TdApi.StarTransactionTypeUpgradedGiftSale)return ((TdApi.StarTransactionTypeUpgradedGiftSale)type).userId;
        if(type instanceof TdApi.StarTransactionTypeChannelPaidReactionReceive)return ((TdApi.StarTransactionTypeChannelPaidReactionReceive)type).userId;
        if(type instanceof TdApi.StarTransactionTypeSuggestedPostPaymentReceive)return ((TdApi.StarTransactionTypeSuggestedPostPaymentReceive)type).userId;
        if(type instanceof TdApi.StarTransactionTypePremiumPurchase)return ((TdApi.StarTransactionTypePremiumPurchase)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBusinessBotTransferSend)return ((TdApi.StarTransactionTypeBusinessBotTransferSend)type).userId;
        if(type instanceof TdApi.StarTransactionTypeBusinessBotTransferReceive)return ((TdApi.StarTransactionTypeBusinessBotTransferReceive)type).userId;
        return 0;
    }

    static String transactionTitle(TdApi.StarTransactionType type){
        TdApi.ProductInfo product=null;
        if(type instanceof TdApi.StarTransactionTypeBotInvoicePurchase)product=((TdApi.StarTransactionTypeBotInvoicePurchase)type).productInfo;
        else if(type instanceof TdApi.StarTransactionTypeBotInvoiceSale)product=((TdApi.StarTransactionTypeBotInvoiceSale)type).productInfo;
        else if(type instanceof TdApi.StarTransactionTypeBotSubscriptionPurchase)product=((TdApi.StarTransactionTypeBotSubscriptionPurchase)type).productInfo;
        else if(type instanceof TdApi.StarTransactionTypeBotSubscriptionSale)product=((TdApi.StarTransactionTypeBotSubscriptionSale)type).productInfo;
        return product==null||product.title==null?null:product.title;
    }

    static int transactionPeriod(TdApi.StarTransactionType type){
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionPurchase)return ((TdApi.StarTransactionTypeBotSubscriptionPurchase)type).subscriptionPeriod;
        if(type instanceof TdApi.StarTransactionTypeBotSubscriptionSale)return ((TdApi.StarTransactionTypeBotSubscriptionSale)type).subscriptionPeriod;
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionPurchase)return ((TdApi.StarTransactionTypeChannelSubscriptionPurchase)type).subscriptionPeriod;
        if(type instanceof TdApi.StarTransactionTypeChannelSubscriptionSale)return ((TdApi.StarTransactionTypeChannelSubscriptionSale)type).subscriptionPeriod;
        return 0;
    }

    static JSONObject subscription(TdApi.StarSubscription value,String chatTitle)throws Exception{
        TdApi.StarSubscriptionPricing pricing=value.pricing;
        JSONObject item=new JSONObject().put("id",value.id==null?"":value.id).put("chatId",String.valueOf(value.chatId))
            .put("title",chatTitle==null||chatTitle.isEmpty()?"Chat "+value.chatId:NativeSnapshot.limit(chatTitle,180))
            .put("expirationDate",value.expirationDate).put("canceled",value.isCanceled).put("expiring",value.isExpiring)
            .put("period",pricing==null?0:pricing.period).put("starCount",pricing==null?0:pricing.starCount)
            .put("kind",value.type instanceof TdApi.StarSubscriptionTypeChannel?"channel":value.type instanceof TdApi.StarSubscriptionTypeBot?"bot":"unsupported");
        if(value.type instanceof TdApi.StarSubscriptionTypeChannel){
            TdApi.StarSubscriptionTypeChannel channel=(TdApi.StarSubscriptionTypeChannel)value.type;
            item.put("canReuse",channel.canReuse);
            if(channel.inviteLink!=null&&!channel.inviteLink.isEmpty())item.put("inviteLink",NativeSnapshot.limit(channel.inviteLink,512));
        }else if(value.type instanceof TdApi.StarSubscriptionTypeBot){
            TdApi.StarSubscriptionTypeBot bot=(TdApi.StarSubscriptionTypeBot)value.type;
            item.put("canceledByBot",bot.isCanceledByBot);
            if(bot.title!=null&&!bot.title.isEmpty())item.put("title",NativeSnapshot.limit(bot.title,180));
        }
        return item;
    }

    static JSONObject paymentOption(TdApi.StarPaymentOption value)throws Exception{
        return new JSONObject().put("currency",value.currency==null?"":value.currency).put("amount",value.amount)
            .put("starCount",value.starCount).put("additional",value.isAdditional);
    }

    static JSONObject revenue(TdApi.StarRevenueStatistics value)throws Exception{
        TdApi.StarRevenueStatus status=value.status;
        JSONObject item=new JSONObject().put("usdRate",value.usdRate);
        item.put("total",amount(status==null?null:status.totalAmount));
        item.put("current",amount(status==null?null:status.currentAmount));
        item.put("available",amount(status==null?null:status.availableAmount));
        item.put("withdrawalEnabled",status!=null&&status.withdrawalEnabled);
        item.put("nextWithdrawalIn",status==null?0:status.nextWithdrawalIn);
        return item;
    }

    static String featureKey(TdApi.PremiumFeature feature){
        if(feature instanceof TdApi.PremiumFeatureIncreasedLimits)return "increasedLimits";
        if(feature instanceof TdApi.PremiumFeatureIncreasedUploadFileSize)return "uploadSize";
        if(feature instanceof TdApi.PremiumFeatureImprovedDownloadSpeed)return "downloadSpeed";
        if(feature instanceof TdApi.PremiumFeatureVoiceRecognition)return "voiceRecognition";
        if(feature instanceof TdApi.PremiumFeatureDisabledAds)return "disabledAds";
        if(feature instanceof TdApi.PremiumFeatureUniqueReactions)return "uniqueReactions";
        if(feature instanceof TdApi.PremiumFeatureUniqueStickers)return "uniqueStickers";
        if(feature instanceof TdApi.PremiumFeatureCustomEmoji)return "customEmoji";
        if(feature instanceof TdApi.PremiumFeatureAdvancedChatManagement)return "advancedChatManagement";
        if(feature instanceof TdApi.PremiumFeatureProfileBadge)return "profileBadge";
        if(feature instanceof TdApi.PremiumFeatureEmojiStatus)return "emojiStatus";
        if(feature instanceof TdApi.PremiumFeatureAnimatedProfilePhoto)return "animatedProfilePhoto";
        if(feature instanceof TdApi.PremiumFeatureForumTopicIcon)return "forumTopicIcon";
        if(feature instanceof TdApi.PremiumFeatureAppIcons)return "appIcons";
        if(feature instanceof TdApi.PremiumFeatureRealTimeChatTranslation)return "realTimeTranslation";
        if(feature instanceof TdApi.PremiumFeatureUpgradedStories)return "upgradedStories";
        if(feature instanceof TdApi.PremiumFeatureChatBoost)return "chatBoost";
        if(feature instanceof TdApi.PremiumFeatureAccentColor)return "accentColor";
        if(feature instanceof TdApi.PremiumFeatureBackgroundForBoth)return "backgroundForBoth";
        if(feature instanceof TdApi.PremiumFeatureSavedMessagesTags)return "savedMessagesTags";
        if(feature instanceof TdApi.PremiumFeatureMessagePrivacy)return "messagePrivacy";
        if(feature instanceof TdApi.PremiumFeatureLastSeenTimes)return "lastSeenTimes";
        if(feature instanceof TdApi.PremiumFeatureBusiness)return "business";
        if(feature instanceof TdApi.PremiumFeatureMessageEffects)return "messageEffects";
        if(feature instanceof TdApi.PremiumFeatureChecklists)return "checklists";
        if(feature instanceof TdApi.PremiumFeaturePaidMessages)return "paidMessages";
        if(feature instanceof TdApi.PremiumFeatureProtectPrivateChatContent)return "protectPrivateContent";
        if(feature instanceof TdApi.PremiumFeatureTextComposition)return "textComposition";
        if(feature instanceof TdApi.PremiumFeatureRichMessages)return "richMessages";
        return "unsupported";
    }

    static String featureLabel(String key){
        switch(key){
            case "increasedLimits":return "Límites ampliados";
            case "uploadSize":return "Archivos de hasta 4 GB";
            case "downloadSpeed":return "Descarga sin límite de velocidad";
            case "voiceRecognition":return "Transcripción de voz y vídeo";
            case "disabledAds":return "Sin anuncios patrocinados";
            case "uniqueReactions":return "Reacciones adicionales";
            case "uniqueStickers":return "Stickers exclusivos";
            case "customEmoji":return "Emojis personalizados en cualquier chat";
            case "advancedChatManagement":return "Gestión avanzada de chats";
            case "profileBadge":return "Insignia en el perfil";
            case "emojiStatus":return "Estado emoji junto a tu nombre";
            case "animatedProfilePhoto":return "Foto de perfil animada";
            case "forumTopicIcon":return "Iconos personalizados en temas de foro";
            case "appIcons":return "Iconos de aplicación alternativos";
            case "realTimeTranslation":return "Traducción de chats en tiempo real";
            case "upgradedStories":return "Historias ampliadas";
            case "chatBoost":return "Impulsos para canales";
            case "accentColor":return "Color de perfil y nombre";
            case "backgroundForBoth":return "Fondo de chat para ambas partes";
            case "savedMessagesTags":return "Etiquetas en mensajes guardados";
            case "messagePrivacy":return "Privacidad de mensajes de voz";
            case "lastSeenTimes":return "Última vez visto con más detalle";
            case "business":return "Funciones de Telegram Business";
            case "messageEffects":return "Efectos de mensaje";
            case "checklists":return "Listas de tareas";
            case "paidMessages":return "Mensajes de pago";
            case "protectPrivateContent":return "Protección del contenido en chats privados";
            case "textComposition":return "Estilos de redacción";
            case "richMessages":return "Mensajes enriquecidos";
            default:return "Ventaja no reconocida por esta versión";
        }
    }

    static String limitKey(TdApi.PremiumLimitType type){
        if(type instanceof TdApi.PremiumLimitTypeSupergroupCount)return "supergroupCount";
        if(type instanceof TdApi.PremiumLimitTypePinnedChatCount)return "pinnedChatCount";
        if(type instanceof TdApi.PremiumLimitTypeCreatedPublicChatCount)return "createdPublicChatCount";
        if(type instanceof TdApi.PremiumLimitTypeSavedAnimationCount)return "savedAnimationCount";
        if(type instanceof TdApi.PremiumLimitTypeFavoriteStickerCount)return "favoriteStickerCount";
        if(type instanceof TdApi.PremiumLimitTypeChatFolderCount)return "chatFolderCount";
        if(type instanceof TdApi.PremiumLimitTypeChatFolderChosenChatCount)return "chatFolderChosenChatCount";
        if(type instanceof TdApi.PremiumLimitTypePinnedArchivedChatCount)return "pinnedArchivedChatCount";
        if(type instanceof TdApi.PremiumLimitTypePinnedSavedMessagesTopicCount)return "pinnedSavedMessagesTopicCount";
        if(type instanceof TdApi.PremiumLimitTypeMessageTextLength)return "messageTextLength";
        if(type instanceof TdApi.PremiumLimitTypeCaptionLength)return "captionLength";
        if(type instanceof TdApi.PremiumLimitTypeBioLength)return "bioLength";
        if(type instanceof TdApi.PremiumLimitTypeChatFolderInviteLinkCount)return "chatFolderInviteLinkCount";
        if(type instanceof TdApi.PremiumLimitTypeShareableChatFolderCount)return "shareableChatFolderCount";
        if(type instanceof TdApi.PremiumLimitTypeActiveStoryCount)return "activeStoryCount";
        if(type instanceof TdApi.PremiumLimitTypeWeeklyPostedStoryCount)return "weeklyPostedStoryCount";
        if(type instanceof TdApi.PremiumLimitTypeMonthlyPostedStoryCount)return "monthlyPostedStoryCount";
        if(type instanceof TdApi.PremiumLimitTypeStoryCaptionLength)return "storyCaptionLength";
        if(type instanceof TdApi.PremiumLimitTypeStorySuggestedReactionAreaCount)return "storySuggestedReactionAreaCount";
        if(type instanceof TdApi.PremiumLimitTypeSimilarChatCount)return "similarChatCount";
        if(type instanceof TdApi.PremiumLimitTypeOwnedBotCount)return "ownedBotCount";
        if(type instanceof TdApi.PremiumLimitTypeCustomTextCompositionStyleCount)return "customTextCompositionStyleCount";
        return "unsupported";
    }

    static String limitLabel(String key){
        switch(key){
            case "supergroupCount":return "Grupos y canales unidos";
            case "pinnedChatCount":return "Chats fijados";
            case "createdPublicChatCount":return "Chats públicos propios";
            case "savedAnimationCount":return "GIF guardados";
            case "favoriteStickerCount":return "Stickers favoritos";
            case "chatFolderCount":return "Carpetas de chats";
            case "chatFolderChosenChatCount":return "Chats por carpeta";
            case "pinnedArchivedChatCount":return "Chats fijados en el archivo";
            case "pinnedSavedMessagesTopicCount":return "Temas fijados en mensajes guardados";
            case "messageTextLength":return "Longitud de un mensaje";
            case "captionLength":return "Longitud de un pie de foto";
            case "bioLength":return "Longitud de la biografía";
            case "chatFolderInviteLinkCount":return "Enlaces de invitación por carpeta";
            case "shareableChatFolderCount":return "Carpetas compartibles";
            case "activeStoryCount":return "Historias activas";
            case "weeklyPostedStoryCount":return "Historias por semana";
            case "monthlyPostedStoryCount":return "Historias por mes";
            case "storyCaptionLength":return "Longitud del pie de una historia";
            case "storySuggestedReactionAreaCount":return "Áreas de reacción en historias";
            case "similarChatCount":return "Chats similares";
            case "ownedBotCount":return "Bots propios";
            case "customTextCompositionStyleCount":return "Estilos de redacción propios";
            default:return "Límite no reconocido por esta versión";
        }
    }

    static TdApi.PremiumLimitType limitType(String key){
        switch(key==null?"":key){
            case "supergroupCount":return new TdApi.PremiumLimitTypeSupergroupCount();
            case "pinnedChatCount":return new TdApi.PremiumLimitTypePinnedChatCount();
            case "createdPublicChatCount":return new TdApi.PremiumLimitTypeCreatedPublicChatCount();
            case "savedAnimationCount":return new TdApi.PremiumLimitTypeSavedAnimationCount();
            case "favoriteStickerCount":return new TdApi.PremiumLimitTypeFavoriteStickerCount();
            case "chatFolderCount":return new TdApi.PremiumLimitTypeChatFolderCount();
            case "chatFolderChosenChatCount":return new TdApi.PremiumLimitTypeChatFolderChosenChatCount();
            case "pinnedArchivedChatCount":return new TdApi.PremiumLimitTypePinnedArchivedChatCount();
            case "pinnedSavedMessagesTopicCount":return new TdApi.PremiumLimitTypePinnedSavedMessagesTopicCount();
            case "messageTextLength":return new TdApi.PremiumLimitTypeMessageTextLength();
            case "captionLength":return new TdApi.PremiumLimitTypeCaptionLength();
            case "bioLength":return new TdApi.PremiumLimitTypeBioLength();
            case "chatFolderInviteLinkCount":return new TdApi.PremiumLimitTypeChatFolderInviteLinkCount();
            case "shareableChatFolderCount":return new TdApi.PremiumLimitTypeShareableChatFolderCount();
            case "activeStoryCount":return new TdApi.PremiumLimitTypeActiveStoryCount();
            case "weeklyPostedStoryCount":return new TdApi.PremiumLimitTypeWeeklyPostedStoryCount();
            case "monthlyPostedStoryCount":return new TdApi.PremiumLimitTypeMonthlyPostedStoryCount();
            case "storyCaptionLength":return new TdApi.PremiumLimitTypeStoryCaptionLength();
            case "storySuggestedReactionAreaCount":return new TdApi.PremiumLimitTypeStorySuggestedReactionAreaCount();
            case "similarChatCount":return new TdApi.PremiumLimitTypeSimilarChatCount();
            case "ownedBotCount":return new TdApi.PremiumLimitTypeOwnedBotCount();
            case "customTextCompositionStyleCount":return new TdApi.PremiumLimitTypeCustomTextCompositionStyleCount();
            default:throw new IllegalArgumentException("Límite de Premium no válido.");
        }
    }

    static JSONObject limit(TdApi.PremiumLimit value)throws Exception{
        String key=limitKey(value.type);
        return new JSONObject().put("key",key).put("label",limitLabel(key)).put("defaultValue",value.defaultValue).put("premiumValue",value.premiumValue);
    }

    static JSONObject features(TdApi.PremiumFeatures value)throws Exception{
        JSONArray features=new JSONArray();
        if(value.features!=null)for(TdApi.PremiumFeature feature:value.features){
            if(feature==null)continue;
            String key=featureKey(feature);
            features.put(new JSONObject().put("key",key).put("label",featureLabel(key)));
        }
        JSONArray limits=new JSONArray();
        if(value.limits!=null)for(TdApi.PremiumLimit limit:value.limits){if(limit!=null)limits.put(limit(limit));}
        return new JSONObject().put("features",features).put("limits",limits);
    }

    static JSONObject premiumGiftOption(TdApi.PremiumGiftPaymentOption value)throws Exception{
        return new JSONObject().put("currency",value.currency==null?"":value.currency).put("amount",value.amount)
            .put("starCount",value.starCount).put("monthCount",value.monthCount).put("discountPercentage",value.discountPercentage);
    }

    /** Plan oficial de Premium: se muestra como referencia, nunca como un cobro que WRGram pueda iniciar. */
    static JSONObject premiumPaymentOption(TdApi.PremiumStatePaymentOption value)throws Exception{
        TdApi.PremiumPaymentOption option=value.paymentOption;
        return new JSONObject().put("currency",option==null||option.currency==null?"":option.currency)
            .put("amount",option==null?0:option.amount).put("monthCount",option==null?0:option.monthCount)
            .put("discountPercentage",option==null?0:option.discountPercentage)
            .put("current",value.isCurrent).put("upgrade",value.isUpgrade);
    }

    static JSONObject giftCodeInfo(TdApi.PremiumGiftCodeInfo value,String creatorName)throws Exception{
        JSONObject item=new JSONObject().put("creationDate",value.creationDate).put("fromGiveaway",value.isFromGiveaway)
            .put("monthCount",value.monthCount).put("dayCount",value.dayCount).put("useDate",value.useDate)
            .put("used",value.useDate>0).put("userId",String.valueOf(value.userId));
        if(creatorName!=null&&!creatorName.isEmpty())item.put("creator",NativeSnapshot.limit(creatorName,180));
        if(value.isFromGiveaway)item.put("giveawayMessageId",String.valueOf(value.giveawayMessageId));
        return item;
    }

    /** Telegram gift codes are 12..64 URL-safe characters; anything else never leaves the device. */
    static String giftCode(String raw){
        String value=raw==null?"":raw.trim();
        if(value.startsWith("https://t.me/"))value=value.substring("https://t.me/".length());
        if(value.startsWith("t.me/"))value=value.substring("t.me/".length());
        if(value.startsWith("premium/"))value=value.substring("premium/".length());
        int slash=value.indexOf('/');
        if(slash>=0)value=value.substring(0,slash);
        int query=value.indexOf('?');
        if(query>=0)value=value.substring(0,query);
        if(!value.matches("[A-Za-z0-9_-]{12,64}"))throw new IllegalArgumentException("El código de regalo de Premium debe tener entre 12 y 64 letras, números, guiones o guiones bajos.");
        return value;
    }

    static String subscriptionId(JSONObject params,String key){
        String value=params.optString(key,"");
        if(!value.matches("[A-Za-z0-9_.:-]{1,128}"))throw new IllegalArgumentException("Identificador de suscripción no válido.");
        return value;
    }
}