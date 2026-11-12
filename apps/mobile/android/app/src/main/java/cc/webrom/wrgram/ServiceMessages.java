package cc.webrom.wrgram;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/**
 * The bundled TDLib fork delivers service actions directly as MessageContent
 * (there is no MessageService wrapper in its TdApi), so every action is matched here.
 */
final class ServiceMessages {
    private ServiceMessages(){}

    private static final class Info {
        final String kind;final String text;final JSONObject extra=new JSONObject();
        Info(String kind,String text){this.kind=kind;this.text=text;}
        Info id(long value){if(value>0)try{extra.put("messageId",String.valueOf(value));}catch(Exception ignored){}return this;}
        Info put(String key,Object value){if(value!=null)try{extra.put(key,value);}catch(Exception ignored){}return this;}
    }

    static boolean isService(TdApi.MessageContent c){
        return c!=null&&(c instanceof TdApi.MessageBasicGroupChatCreate||c instanceof TdApi.MessageSupergroupChatCreate||c instanceof TdApi.MessageChatChangeTitle||c instanceof TdApi.MessageChatChangePhoto||c instanceof TdApi.MessageChatDeletePhoto||c instanceof TdApi.MessageChatOwnerLeft||c instanceof TdApi.MessageChatOwnerChanged||c instanceof TdApi.MessageChatHasProtectedContentToggled||c instanceof TdApi.MessageChatHasProtectedContentDisableRequested||c instanceof TdApi.MessageChatAddMembers||c instanceof TdApi.MessageChatJoinByLink||c instanceof TdApi.MessageChatJoinByRequest||c instanceof TdApi.MessageChatJoinFromCommunity||c instanceof TdApi.MessageChatDeleteMember||c instanceof TdApi.MessageChatAddedToCommunity||c instanceof TdApi.MessageChatRemovedFromCommunity||c instanceof TdApi.MessageChatUpgradeTo||c instanceof TdApi.MessageChatUpgradeFrom||c instanceof TdApi.MessagePinMessage||c instanceof TdApi.MessageScreenshotTaken||c instanceof TdApi.MessageChatSetBackground||c instanceof TdApi.MessageChatSetTheme||c instanceof TdApi.MessageChatSetMessageAutoDeleteTime||c instanceof TdApi.MessageChatBoost||c instanceof TdApi.MessageForumTopicCreated||c instanceof TdApi.MessageForumTopicEdited||c instanceof TdApi.MessageForumTopicIsClosedToggled||c instanceof TdApi.MessageForumTopicIsHiddenToggled||c instanceof TdApi.MessageSuggestProfilePhoto||c instanceof TdApi.MessageSuggestBirthdate||c instanceof TdApi.MessageCustomServiceAction||c instanceof TdApi.MessageGameScore||c instanceof TdApi.MessageManagedBotCreated||c instanceof TdApi.MessagePaymentSuccessful||c instanceof TdApi.MessagePaymentSuccessfulBot||c instanceof TdApi.MessagePaymentRefunded||c instanceof TdApi.MessageGiftedPremium||c instanceof TdApi.MessagePremiumGiftCode||c instanceof TdApi.MessageGiveawayCreated||c instanceof TdApi.MessageGiveaway||c instanceof TdApi.MessageGiveawayCompleted||c instanceof TdApi.MessageGiveawayWinners||c instanceof TdApi.MessageGiftedStars||c instanceof TdApi.MessageGiftedGrams||c instanceof TdApi.MessageGiveawayPrizeStars||c instanceof TdApi.MessageTonWalletTransfer||c instanceof TdApi.MessageTonConnectRequest||c instanceof TdApi.MessageUpgradedGift||c instanceof TdApi.MessageRefundedUpgradedGift||c instanceof TdApi.MessageUpgradedGiftPurchaseOffer||c instanceof TdApi.MessageUpgradedGiftPurchaseOfferRejected||c instanceof TdApi.MessagePaidMessagesRefunded||c instanceof TdApi.MessagePaidMessagePriceChanged||c instanceof TdApi.MessageDirectMessagePriceChanged||c instanceof TdApi.MessageUnpaidMessagesAllowedByLink||c instanceof TdApi.MessageChecklistTasksDone||c instanceof TdApi.MessageChecklistTasksAdded||c instanceof TdApi.MessageSuggestedPostApprovalFailed||c instanceof TdApi.MessageSuggestedPostApproved||c instanceof TdApi.MessageSuggestedPostDeclined||c instanceof TdApi.MessageSuggestedPostPaid||c instanceof TdApi.MessageSuggestedPostRefunded||c instanceof TdApi.MessageContactRegistered||c instanceof TdApi.MessageUsersShared||c instanceof TdApi.MessageChatShared||c instanceof TdApi.MessageBotWriteAccessAllowed||c instanceof TdApi.MessageWebAppDataSent||c instanceof TdApi.MessageWebAppDataReceived||c instanceof TdApi.MessagePassportDataSent||c instanceof TdApi.MessagePassportDataReceived||c instanceof TdApi.MessageProximityAlertTriggered||c instanceof TdApi.MessageCall||c instanceof TdApi.MessageGroupCall||c instanceof TdApi.MessageVideoChatScheduled||c instanceof TdApi.MessageVideoChatStarted||c instanceof TdApi.MessageVideoChatEnded||c instanceof TdApi.MessageInviteVideoChatParticipants||c instanceof TdApi.MessagePollOptionAdded||c instanceof TdApi.MessagePollOptionDeleted||c instanceof TdApi.MessageExpiredPhoto||c instanceof TdApi.MessageExpiredVideo||c instanceof TdApi.MessageExpiredVideoNote||c instanceof TdApi.MessageExpiredVoiceNote);
    }

    static String text(TdApi.Message message,TdSession session){
        Info info=info(message,session);
        return info==null?null:info.text;
    }

    static JSONObject dto(TdApi.Message message,NativeSnapshot snapshot){
        Info info=info(message,snapshot.session);
        if(info==null)return null;
        try{
            JSONObject value=new JSONObject().put("kind",info.kind).put("text",NativeSnapshot.limit(info.text,700));
            for(String key:new String[]{"messageId"})if(info.extra.has(key))value.put(key,info.extra.optString(key));
            for(String key:new String[]{"currency","amount","date","duration","count","chatId","userId"})if(info.extra.has(key))value.put(key,info.extra.opt(key));
            TdApi.MessageContent content=message.content;TdApi.ChatPhoto photo=content instanceof TdApi.MessageChatChangePhoto?((TdApi.MessageChatChangePhoto)content).photo:content instanceof TdApi.MessageSuggestProfilePhoto?((TdApi.MessageSuggestProfilePhoto)content).photo:null;
            if(photo!=null){TdApi.File small=null,big=null;long smallWidth=Long.MAX_VALUE,bestWidth=-1;if(photo.sizes!=null)for(TdApi.PhotoSize size:photo.sizes){if(size==null||size.photo==null)continue;if(size.width>0&&size.width<smallWidth){smallWidth=size.width;small=size.photo;}if(size.width<=1280&&size.width>bestWidth){bestWidth=size.width;big=size.photo;}}if(big==null)big=small;if(small==null)small=big;JSONObject file=snapshot.photoDto(small,big,photo.minithumbnail,"Foto del chat");if(file!=null)value.put("photo",file);}
            return value;
        }catch(Exception ignored){return null;}
    }

    private static Info info(TdApi.Message message,TdSession session){
        TdApi.MessageContent c=message==null?null:message.content;
        if(!isService(c))return null;
        String actor=actor(message,session);
        boolean self=isSelf(message,session);
        String kind="system",text="";

        if(c instanceof TdApi.MessageBasicGroupChatCreate){TdApi.MessageBasicGroupChatCreate a=(TdApi.MessageBasicGroupChatCreate)c;kind="members";text=a.title==null||a.title.isBlank()?"Se creó un grupo":"Se creó el grupo «"+a.title+"»";}
        else if(c instanceof TdApi.MessageSupergroupChatCreate){TdApi.MessageSupergroupChatCreate a=(TdApi.MessageSupergroupChatCreate)c;kind="members";text=a.title==null||a.title.isBlank()?"Se creó un grupo o canal":"Se creó «"+a.title+"»";}
        else if(c instanceof TdApi.MessageChatChangeTitle){TdApi.MessageChatChangeTitle a=(TdApi.MessageChatChangeTitle)c;kind="title";text=a.title==null||a.title.isBlank()?"Se eliminó el título del chat":"El título del chat cambió a «"+a.title+"»";}
        else if(c instanceof TdApi.MessageChatChangePhoto){kind="photo";text="Se cambió la foto del chat";}
        else if(c instanceof TdApi.MessageChatDeletePhoto){kind="photo";text="Se eliminó la foto del chat";}
        else if(c instanceof TdApi.MessageChatOwnerLeft){TdApi.MessageChatOwnerLeft a=(TdApi.MessageChatOwnerLeft)c;kind="members";text=a.newOwnerUserId>0?"El propietario salió del chat · el nuevo propietario será "+userName(session,a.newOwnerUserId):"El propietario salió del chat";}
        else if(c instanceof TdApi.MessageChatOwnerChanged){TdApi.MessageChatOwnerChanged a=(TdApi.MessageChatOwnerChanged)c;kind="members";text=session!=null&&a.newOwnerUserId==session.selfId?"Ahora eres el propietario del chat":"Ahora "+userName(session,a.newOwnerUserId)+" es el propietario del chat";}
        else if(c instanceof TdApi.MessageChatHasProtectedContentToggled){TdApi.MessageChatHasProtectedContentToggled a=(TdApi.MessageChatHasProtectedContentToggled)c;kind="security";text=a.oldHasProtectedContent==a.newHasProtectedContent?"La solicitud para cambiar la protección de contenido fue rechazada":a.newHasProtectedContent?"Se activó la protección de contenido del chat":"Se desactivó la protección de contenido del chat";}
        else if(c instanceof TdApi.MessageChatHasProtectedContentDisableRequested){TdApi.MessageChatHasProtectedContentDisableRequested a=(TdApi.MessageChatHasProtectedContentDisableRequested)c;kind="security";text=a.isExpired?"La solicitud para desactivar la protección de contenido caducó":"Se solicitó desactivar la protección de contenido del chat";}
        else if(c instanceof TdApi.MessageChatAddMembers){TdApi.MessageChatAddMembers a=(TdApi.MessageChatAddMembers)c;kind="members";boolean containsSelf=contains(a.memberUserIds,session==null?0:session.selfId);text=self?("Añadiste a "+names(session,a.memberUserIds)):containsSelf?actor+" te añadió al grupo":actor+" añadió a "+names(session,a.memberUserIds);}
        else if(c instanceof TdApi.MessageChatJoinByLink){kind="members";text=self?"Te uniste al grupo mediante un enlace":actor+" se unió al grupo mediante un enlace";}
        else if(c instanceof TdApi.MessageChatJoinByRequest){kind="members";text=self?"Te uniste al grupo mediante una solicitud":actor+" se unió al grupo mediante una solicitud";}
        else if(c instanceof TdApi.MessageChatJoinFromCommunity){kind="members";text=self?"Te uniste al grupo desde una comunidad":actor+" se unió al grupo desde una comunidad";}
        else if(c instanceof TdApi.MessageChatDeleteMember){TdApi.MessageChatDeleteMember a=(TdApi.MessageChatDeleteMember)c;kind="members";boolean targetSelf=isSelfUser(message,session,a.userId);text=targetSelf?"Saliste del grupo":self?"Expulsaste a "+nameOf(session,a.userId):actor+" expulsó a "+nameOf(session,a.userId);}
        else if(c instanceof TdApi.MessageChatAddedToCommunity){kind="community";text="El chat se añadió a una comunidad";}
        else if(c instanceof TdApi.MessageChatRemovedFromCommunity){kind="community";text="El chat se eliminó de la comunidad";}
        else if(c instanceof TdApi.MessageChatUpgradeTo){kind="title";text="El grupo se convirtió en un supergrupo";}
        else if(c instanceof TdApi.MessageChatUpgradeFrom){TdApi.MessageChatUpgradeFrom a=(TdApi.MessageChatUpgradeFrom)c;kind="title";text=a.title==null||a.title.isBlank()?"El grupo se convirtió en un supergrupo":"El grupo «"+a.title+"» se convirtió en un supergrupo";}
        else if(c instanceof TdApi.MessagePinMessage){TdApi.MessagePinMessage a=(TdApi.MessagePinMessage)c;kind="pin";text=self?"Fijaste un mensaje":actor+" fijó un mensaje";return new Info(kind,text).id(a.messageId);}
        else if(c instanceof TdApi.MessageScreenshotTaken){kind="security";text="Se hizo una captura de pantalla";}
        else if(c instanceof TdApi.MessageChatSetBackground){TdApi.MessageChatSetBackground a=(TdApi.MessageChatSetBackground)c;kind="background";text=a.onlyForSelf?"Cambiaste el fondo del chat para ti":a.oldBackgroundMessageId>0?"Se volvió a usar un fondo anterior":"Se cambió el fondo del chat";}
        else if(c instanceof TdApi.MessageChatSetTheme){TdApi.MessageChatSetTheme a=(TdApi.MessageChatSetTheme)c;kind="theme";text=a.theme instanceof TdApi.ChatThemeEmoji&&((TdApi.ChatThemeEmoji)a.theme).name!=null&&!((TdApi.ChatThemeEmoji)a.theme).name.isBlank()?"Se cambió el tema del chat a «"+((TdApi.ChatThemeEmoji)a.theme).name+"»":a.theme==null?"Se restableció el tema del chat":"Se aplicó el tema de un regalo";}
        else if(c instanceof TdApi.MessageChatSetMessageAutoDeleteTime){TdApi.MessageChatSetMessageAutoDeleteTime a=(TdApi.MessageChatSetMessageAutoDeleteTime)c;kind="timer";String timer=a.messageAutoDeleteTime<=0?"Se desactivó la eliminación automática de mensajes":"Los mensajes se eliminan automáticamente después de "+duration(a.messageAutoDeleteTime);text=a.fromUserId>0?nameOf(session,a.fromUserId)+" cambió el temporizador · "+timer:timer;}
        else if(c instanceof TdApi.MessageChatBoost){TdApi.MessageChatBoost a=(TdApi.MessageChatBoost)c;kind="boost";text=a.boostCount>0?"El chat recibió "+a.boostCount+" mejora"+(a.boostCount==1?"":"s"):"El chat alcanzó un nuevo nivel con mejoras";}
        else if(c instanceof TdApi.MessageForumTopicCreated){TdApi.MessageForumTopicCreated a=(TdApi.MessageForumTopicCreated)c;kind="topic";text=a.isNameImplicit||a.name==null||a.name.isBlank()?"Se creó el tema general":"Se creó el tema «"+a.name+"»";}
        else if(c instanceof TdApi.MessageForumTopicEdited){TdApi.MessageForumTopicEdited a=(TdApi.MessageForumTopicEdited)c;kind="topic";text=a.name!=null&&!a.name.isBlank()?"El tema pasó a llamarse «"+a.name+"»":"Se editó el tema";}
        else if(c instanceof TdApi.MessageForumTopicIsClosedToggled){TdApi.MessageForumTopicIsClosedToggled a=(TdApi.MessageForumTopicIsClosedToggled)c;kind="topic";text=a.isClosed?"Se cerró el tema":"Se reabrió el tema";}
        else if(c instanceof TdApi.MessageForumTopicIsHiddenToggled){TdApi.MessageForumTopicIsHiddenToggled a=(TdApi.MessageForumTopicIsHiddenToggled)c;kind="topic";text=a.isHidden?"Se ocultó el tema general":"Se mostró el tema general";}
        else if(c instanceof TdApi.MessageSuggestProfilePhoto){kind="photo";text="Se sugirió una foto de perfil";}
        else if(c instanceof TdApi.MessageSuggestBirthdate){kind="profile";text="Se sugirió una fecha de nacimiento";}
        else if(c instanceof TdApi.MessageCustomServiceAction){TdApi.MessageCustomServiceAction a=(TdApi.MessageCustomServiceAction)c;kind="system";text=a.text==null||a.text.isBlank()?"Mensaje de servicio":a.text;}
        else if(c instanceof TdApi.MessageGameScore){TdApi.MessageGameScore a=(TdApi.MessageGameScore)c;kind="game";return new Info(kind,"Nueva puntuación del juego: "+a.score).id(a.gameMessageId);}
        else if(c instanceof TdApi.MessageManagedBotCreated){kind="bot";text="Se creó un bot gestionado";}
        else if(c instanceof TdApi.MessagePaymentSuccessful){TdApi.MessagePaymentSuccessful a=(TdApi.MessagePaymentSuccessful)c;kind="payment";text="Pago completado · "+money(a.currency,a.totalAmount)+(a.isRecurring?(a.isFirstRecurring?" · primera renovación":" · renovación"):"");return new Info(kind,text).id(a.invoiceMessageId);}
        else if(c instanceof TdApi.MessagePaymentSuccessfulBot){TdApi.MessagePaymentSuccessfulBot a=(TdApi.MessagePaymentSuccessfulBot)c;kind="payment";text="Pago recibido · "+money(a.currency,a.totalAmount);return new Info(kind,text).put("currency",a.currency==null?"":a.currency).put("amount",a.totalAmount);}
        else if(c instanceof TdApi.MessagePaymentRefunded){TdApi.MessagePaymentRefunded a=(TdApi.MessagePaymentRefunded)c;kind="payment";text="Pago reembolsado · "+money(a.currency,a.totalAmount);return new Info(kind,text).put("currency",a.currency==null?"":a.currency).put("amount",a.totalAmount);}
        else if(c instanceof TdApi.MessageGiftedPremium){TdApi.MessageGiftedPremium a=(TdApi.MessageGiftedPremium)c;kind="gift";text=giftLine(session,a.gifterUserId,a.receiverUserId,"Telegram Premium")+(a.monthCount>0?" · "+a.monthCount+(a.monthCount==1?" mes":" meses"):a.dayCount>0?" · "+a.dayCount+(a.dayCount==1?" día":" días"):"");}
        else if(c instanceof TdApi.MessagePremiumGiftCode){kind="gift";text="Se creó un código de regalo de Telegram Premium";}
        else if(c instanceof TdApi.MessageGiveawayCreated){TdApi.MessageGiveawayCreated a=(TdApi.MessageGiveawayCreated)c;kind="giveaway";text=a.starCount>0?"Se creó un sorteo de "+stars(a.starCount):"Se creó un sorteo";}
        else if(c instanceof TdApi.MessageGiveaway){TdApi.MessageGiveaway a=(TdApi.MessageGiveaway)c;kind="giveaway";text="Sorteo · "+a.winnerCount+" ganador"+(a.winnerCount==1?"":"es");}
        else if(c instanceof TdApi.MessageGiveawayCompleted){TdApi.MessageGiveawayCompleted a=(TdApi.MessageGiveawayCompleted)c;kind="giveaway";text="El sorteo terminó · "+a.winnerCount+" ganador"+(a.winnerCount==1?"":"es")+(a.unclaimedPrizeCount>0?" · "+a.unclaimedPrizeCount+" premio"+(a.unclaimedPrizeCount==1?"":"s")+" sin reclamar":"");return new Info(kind,text).id(a.giveawayMessageId);}
        else if(c instanceof TdApi.MessageGiveawayWinners){TdApi.MessageGiveawayWinners a=(TdApi.MessageGiveawayWinners)c;kind="giveaway";text=a.wasRefunded?"El sorteo se canceló y se reembolsó":"Se eligieron "+a.winnerCount+" ganador"+(a.winnerCount==1?"":"es")+" del sorteo";return new Info(kind,text).id(a.giveawayMessageId);}
        else if(c instanceof TdApi.MessageGiftedStars){TdApi.MessageGiftedStars a=(TdApi.MessageGiftedStars)c;kind="gift";text=giftLine(session,a.gifterUserId,a.receiverUserId,stars(a.starCount));}
        else if(c instanceof TdApi.MessageGiftedGrams){TdApi.MessageGiftedGrams a=(TdApi.MessageGiftedGrams)c;kind="gift";text=giftLine(session,a.gifterUserId,a.receiverUserId,a.gramAmount+" Grams");}
        else if(c instanceof TdApi.MessageGiveawayPrizeStars){TdApi.MessageGiveawayPrizeStars a=(TdApi.MessageGiveawayPrizeStars)c;kind="giveaway";text=a.isUnclaimed?"Recibiste "+stars(a.starCount)+" de un sorteo sin reclamar":"Recibiste "+stars(a.starCount)+" de un sorteo";}
        else if(c instanceof TdApi.MessageTonWalletTransfer){TdApi.MessageTonWalletTransfer a=(TdApi.MessageTonWalletTransfer)c;kind="ton";text="Transferencia TON recibida · "+grams(a.amount)+(a.comment==null||a.comment.isBlank()?"":" · "+a.comment);}
        else if(c instanceof TdApi.MessageTonConnectRequest){TdApi.MessageTonConnectRequest a=(TdApi.MessageTonConnectRequest)c;kind="ton";String app=a.dappName==null||a.dappName.isBlank()?"una dApp":a.dappName;text=a.state instanceof TdApi.TonConnectRequestStateAccepted?"Se aceptó la solicitud de TON Connect de "+app:a.state instanceof TdApi.TonConnectRequestStateRejected?"Se rechazó la solicitud de TON Connect de "+app:"Solicitud de TON Connect de "+app;}
        else if(c instanceof TdApi.MessageUpgradedGift){TdApi.MessageUpgradedGift a=(TdApi.MessageUpgradedGift)c;kind="gift";text=a.text!=null&&a.text.text!=null&&!a.text.text.isBlank()?a.text.text:"Regalo mejorado"+(a.isPrivate?" · privado":"")+(a.isSaved?" · guardado":"");}
        else if(c instanceof TdApi.MessageRefundedUpgradedGift){kind="gift";text="Se reembolsó un regalo mejorado";}
        else if(c instanceof TdApi.MessageUpgradedGiftPurchaseOffer){TdApi.MessageUpgradedGiftPurchaseOffer a=(TdApi.MessageUpgradedGiftPurchaseOffer)c;kind="gift";text=a.state instanceof TdApi.GiftPurchaseOfferStateAccepted?"Se aceptó una oferta de compra de un regalo":a.state instanceof TdApi.GiftPurchaseOfferStateRejected?"Se rechazó una oferta de compra de un regalo":"Oferta de compra de un regalo";}
        else if(c instanceof TdApi.MessageUpgradedGiftPurchaseOfferRejected){TdApi.MessageUpgradedGiftPurchaseOfferRejected a=(TdApi.MessageUpgradedGiftPurchaseOfferRejected)c;kind="gift";text=a.wasExpired?"La oferta de compra de un regalo caducó":"Se rechazó la oferta de compra de un regalo";return new Info(kind,text).id(a.offerMessageId);}
        else if(c instanceof TdApi.MessagePaidMessagesRefunded){TdApi.MessagePaidMessagesRefunded a=(TdApi.MessagePaidMessagesRefunded)c;kind="payment";text="Se reembolsaron "+a.messageCount+" mensaje"+(a.messageCount==1?"":"s")+" de pago · "+stars(a.starCount);}
        else if(c instanceof TdApi.MessagePaidMessagePriceChanged){TdApi.MessagePaidMessagePriceChanged a=(TdApi.MessagePaidMessagePriceChanged)c;kind="payment";text=a.paidMessageStarCount<=0?"Se desactivaron los mensajes de pago":"El precio de los mensajes de pago ahora es "+stars(a.paidMessageStarCount);}
        else if(c instanceof TdApi.MessageDirectMessagePriceChanged){TdApi.MessageDirectMessagePriceChanged a=(TdApi.MessageDirectMessagePriceChanged)c;kind="payment";text=a.isEnabled?"Se habilitaron los mensajes directos"+(a.paidMessageStarCount>0?" · "+stars(a.paidMessageStarCount):""):"Se deshabilitaron los mensajes directos";}
        else if(c instanceof TdApi.MessageUnpaidMessagesAllowedByLink){kind="payment";text="Se permitieron mensajes sin pago mediante enlace";}
        else if(c instanceof TdApi.MessageChecklistTasksDone){TdApi.MessageChecklistTasksDone a=(TdApi.MessageChecklistTasksDone)c;kind="checklist";int count=(a.markedAsDoneTaskIds==null?0:a.markedAsDoneTaskIds.length)+(a.markedAsNotDoneTaskIds==null?0:a.markedAsNotDoneTaskIds.length);text="Se actualizaron "+count+" tarea"+(count==1?"":"s")+" de la lista";return new Info(kind,text).id(a.checklistMessageId);}
        else if(c instanceof TdApi.MessageChecklistTasksAdded){TdApi.MessageChecklistTasksAdded a=(TdApi.MessageChecklistTasksAdded)c;kind="checklist";int count=a.tasks==null?0:a.tasks.length;text="Se añadieron "+count+" tarea"+(count==1?"":"s")+" a la lista";return new Info(kind,text).id(a.checklistMessageId);}
        else if(c instanceof TdApi.MessageSuggestedPostApprovalFailed){TdApi.MessageSuggestedPostApprovalFailed a=(TdApi.MessageSuggestedPostApprovalFailed)c;kind="post";text="No se pudo aprobar la publicación sugerida";return new Info(kind,text).id(a.suggestedPostMessageId);}
        else if(c instanceof TdApi.MessageSuggestedPostApproved){TdApi.MessageSuggestedPostApproved a=(TdApi.MessageSuggestedPostApproved)c;kind="post";text="Se aprobó la publicación sugerida"+(a.sendDate>0?" · "+date(a.sendDate):"");return new Info(kind,text).id(a.suggestedPostMessageId).put("date",a.sendDate);}
        else if(c instanceof TdApi.MessageSuggestedPostDeclined){TdApi.MessageSuggestedPostDeclined a=(TdApi.MessageSuggestedPostDeclined)c;kind="post";text="Se rechazó la publicación sugerida"+(a.comment==null||a.comment.isBlank()?"":" · "+a.comment);return new Info(kind,text).id(a.suggestedPostMessageId);}
        else if(c instanceof TdApi.MessageSuggestedPostPaid){TdApi.MessageSuggestedPostPaid a=(TdApi.MessageSuggestedPostPaid)c;kind="post";long paidStars=a.starAmount==null?0:a.starAmount.starCount;text="Se pagó la publicación sugerida"+(paidStars>0?" · "+stars(paidStars):a.gramAmount>0?" · "+grams(a.gramAmount):"");return new Info(kind,text).id(a.suggestedPostMessageId);}
        else if(c instanceof TdApi.MessageSuggestedPostRefunded){TdApi.MessageSuggestedPostRefunded a=(TdApi.MessageSuggestedPostRefunded)c;kind="post";text="Se reembolsó la publicación sugerida"+(a.reason instanceof TdApi.SuggestedPostRefundReasonPostDeleted?" · la publicación se eliminó":a.reason instanceof TdApi.SuggestedPostRefundReasonPaymentRefunded?" · el pago se reembolsó":"");return new Info(kind,text).id(a.suggestedPostMessageId);}
        else if(c instanceof TdApi.MessageContactRegistered){kind="members";text=self?"Te uniste a Telegram":actor+" se unió a Telegram";}
        else if(c instanceof TdApi.MessageUsersShared){TdApi.MessageUsersShared a=(TdApi.MessageUsersShared)c;kind="contact";int count=a.users==null?0:a.users.length;text="Se compartieron "+count+" contacto"+(count==1?"":"s");}
        else if(c instanceof TdApi.MessageChatShared){kind="contact";text="Se compartió un chat";}
        else if(c instanceof TdApi.MessageBotWriteAccessAllowed){TdApi.MessageBotWriteAccessAllowed a=(TdApi.MessageBotWriteAccessAllowed)c;kind="webapp";text=a.reason instanceof TdApi.BotWriteAccessAllowReasonConnectedWebsite?"El bot obtuvo acceso a través de un sitio conectado":a.reason instanceof TdApi.BotWriteAccessAllowReasonAddedToAttachmentMenu?"El bot se añadió al menú de adjuntar":a.reason instanceof TdApi.BotWriteAccessAllowReasonLaunchedWebApp?"El bot obtuvo acceso desde una Mini App":"El bot obtuvo permiso para escribirte";}
        else if(c instanceof TdApi.MessageWebAppDataSent){TdApi.MessageWebAppDataSent a=(TdApi.MessageWebAppDataSent)c;kind="webapp";text="Se enviaron datos a una Mini App"+(a.buttonText==null||a.buttonText.isBlank()?"":" · "+a.buttonText);}
        else if(c instanceof TdApi.MessageWebAppDataReceived){kind="webapp";text="Se recibieron datos de una Mini App";}
        else if(c instanceof TdApi.MessagePassportDataSent){kind="security";text="Se enviaron datos de Telegram Passport";}
        else if(c instanceof TdApi.MessagePassportDataReceived){kind="security";text="Se recibieron datos de Telegram Passport";}
        else if(c instanceof TdApi.MessageProximityAlertTriggered){TdApi.MessageProximityAlertTriggered a=(TdApi.MessageProximityAlertTriggered)c;kind="contact";text=nameOfSender(session,a.travelerId)+" está a "+a.distance+" m de "+nameOfSender(session,a.watcherId);}
        else if(c instanceof TdApi.MessageCall){TdApi.MessageCall a=(TdApi.MessageCall)c;kind="call";String type=a.isVideo?"Videollamada":"Llamada";text=a.discardReason instanceof TdApi.CallDiscardReasonMissed?type+" perdida":a.discardReason instanceof TdApi.CallDiscardReasonDeclined?type+" rechazada":a.discardReason instanceof TdApi.CallDiscardReasonDisconnected?type+" interrumpida":type+" finalizada"+(a.duration>0?" · "+duration(a.duration):"");return new Info(kind,text).put("duration",a.duration);}
        else if(c instanceof TdApi.MessageGroupCall){TdApi.MessageGroupCall a=(TdApi.MessageGroupCall)c;kind="call";text=a.wasMissed?"Videollamada perdida":a.isActive?"Videollamada en curso":"Videollamada finalizada"+(a.duration>0?" · "+duration(a.duration):"");return new Info(kind,text).put("duration",a.duration);}
        else if(c instanceof TdApi.MessageVideoChatScheduled){TdApi.MessageVideoChatScheduled a=(TdApi.MessageVideoChatScheduled)c;kind="call";text="Videollamada programada · "+date(a.startDate);return new Info(kind,text).put("date",a.startDate);}
        else if(c instanceof TdApi.MessageVideoChatStarted){kind="call";text="Videollamada iniciada";}
        else if(c instanceof TdApi.MessageVideoChatEnded){TdApi.MessageVideoChatEnded a=(TdApi.MessageVideoChatEnded)c;kind="call";text="Videollamada finalizada"+((a.duration>0)?" · "+duration(a.duration):"");return new Info(kind,text).put("duration",a.duration);}
        else if(c instanceof TdApi.MessageInviteVideoChatParticipants){TdApi.MessageInviteVideoChatParticipants a=(TdApi.MessageInviteVideoChatParticipants)c;kind="call";int count=a.userIds==null?0:a.userIds.length;text="Se invitó a "+count+" persona"+(count==1?"":"s")+" a la videollamada";}
        else if(c instanceof TdApi.MessagePollOptionAdded){TdApi.MessagePollOptionAdded a=(TdApi.MessagePollOptionAdded)c;kind="poll";text="Se añadió una opción a la encuesta"+(a.text==null||a.text.text==null||a.text.text.isBlank()?"":" · "+a.text.text);return new Info(kind,text).id(a.pollMessageId);}
        else if(c instanceof TdApi.MessagePollOptionDeleted){TdApi.MessagePollOptionDeleted a=(TdApi.MessagePollOptionDeleted)c;kind="poll";text="Se eliminó una opción de la encuesta"+(a.text==null||a.text.text==null||a.text.text.isBlank()?"":" · "+a.text.text);return new Info(kind,text).id(a.pollMessageId);}
        else if(c instanceof TdApi.MessageExpiredPhoto||c instanceof TdApi.MessageExpiredVideo||c instanceof TdApi.MessageExpiredVideoNote||c instanceof TdApi.MessageExpiredVoiceNote){kind="system";text="El contenido temporal caducó";}

        return new Info(kind,text);
    }

    private static boolean isSelf(TdApi.Message message,TdSession session){return message.isOutgoing||isSelfUser(message,session,0);}
    private static boolean isSelfUser(TdApi.Message message,TdSession session,long other){
        if(session==null||session.selfId==0)return message!=null&&message.isOutgoing&&other==0;
        if(other>0&&other==session.selfId)return true;
        return message!=null&&message.senderId instanceof TdApi.MessageSenderUser&&((TdApi.MessageSenderUser)message.senderId).userId==session.selfId;
    }
    private static boolean contains(long[] values,long value){if(values==null||value==0)return false;for(long item:values)if(item==value)return true;return false;}
    private static String actor(TdApi.Message message,TdSession session){return session==null?"Alguien":session.senderName(message.senderId);}
    private static String nameOf(TdSession session,long id){return session==null?"un usuario":session.senderName(new TdApi.MessageSenderUser(id));}
    private static String userName(TdSession session,long id){return nameOf(session,id);}
    private static String nameOfSender(TdSession session,TdApi.MessageSender sender){return session==null?"Alguien":session.senderName(sender);}
    private static String names(TdSession session,long[] ids){
        if(ids==null||ids.length==0)return "un miembro";
        List<String> values=new ArrayList<>();int total=0;
        for(long id:ids){if(id==0)continue;total++;if(values.size()<3)values.add(nameOf(session,id));}
        if(values.isEmpty())return "un miembro";
        if(total>values.size())return String.join(", ",values)+" y "+(total-values.size())+" más";
        if(values.size()==1)return values.get(0);
        return String.join(", ",values.subList(0,values.size()-1))+" y "+values.get(values.size()-1);
    }
    private static String giftLine(TdSession session,long gifter,long receiver,String gift){
        if(gifter>0&&receiver>0&&gifter==receiver)return nameOf(session,gifter)+" recibió "+gift;
        if(gifter==0)return "Se regaló "+gift;
        if(receiver>0&&session!=null&&receiver==session.selfId)return nameOf(session,gifter)+" te regaló "+gift;
        if(session!=null&&gifter==session.selfId)return "Regalaste "+gift+(receiver>0?" a "+nameOf(session,receiver):"");
        return nameOf(session,gifter)+" regaló "+gift+(receiver>0?" a "+nameOf(session,receiver):"");
    }
    static String duration(int seconds){
        int total=Math.max(0,seconds);int hours=total/3600,minutes=(total%3600)/60,secs=total%60;
        if(hours>0)return hours+" h "+minutes+" min";
        if(minutes>0)return minutes+" min "+secs+" s";
        return secs+" s";
    }
    private static String date(int timestamp){return timestamp<=0?"":new SimpleDateFormat("d MMM, HH:mm",new Locale("es","ES")).format(new Date(timestamp*1000L));}
    private static String money(String currency,long amount){
        String code=currency==null?"":currency;
        if("XTR".equals(code))return stars(amount);
        return (amount/100.0)+" "+code;
    }
    private static String stars(long count){return count+" ⭐";}
    private static String grams(long nanograms){return (nanograms/1_000_000_000.0)+" TON";}
}
