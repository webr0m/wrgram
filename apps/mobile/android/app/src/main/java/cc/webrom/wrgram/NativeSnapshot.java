package cc.webrom.wrgram;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Stable allowlisted DTOs. Never serialize TDLib reflection, credentials, local paths or keys. */
final class NativeSnapshot {
    final TdSession session;final NativeMediaStore media;final SharedPreferences prefs;final AssistantController assistant;
    NativeSnapshot(TdSession session,NativeMediaStore media,SharedPreferences prefs,AssistantController assistant){this.session=session;this.media=media;this.prefs=prefs;this.assistant=assistant;}
    JSONObject state()throws Exception{
        return state(true,true);
    }
    JSONObject state(boolean includeChats,boolean includeMessages)throws Exception{
        JSONObject data=new JSONObject();String auth=session.ready()?"ready":session.authorization instanceof TdApi.AuthorizationStateWaitPhoneNumber?"phone":session.authorization instanceof TdApi.AuthorizationStateWaitCode?"code":session.authorization instanceof TdApi.AuthorizationStateWaitEmailAddress?"email":session.authorization instanceof TdApi.AuthorizationStateWaitEmailCode?"emailCode":session.authorization instanceof TdApi.AuthorizationStateWaitRegistration?"registration":session.authorization instanceof TdApi.AuthorizationStateWaitPassword?"password":session.authorization instanceof TdApi.AuthorizationStateClosed?"closed":session.authorization==null?"welcome":"loading";
        if(session.authorization instanceof TdApi.AuthorizationStateWaitOtherDeviceConfirmation)auth="qr";
        data.put("ready",session.ready()).put("auth",auth).put("consent",session.consent()).put("busy",session.busy).put("connection",session.connection).put("online",session.connected()).put("error",session.error).put("notice",session.notice).put("version",BuildConfig.VERSION_NAME).put("selfId",String.valueOf(session.selfId)).put("name",session.displayName).put("active",String.valueOf(session.activeChat)).put("canSend",session.canSend()).put("sending",session.sending(session.activeChat)).put("uncertain",session.uncertain(session.activeChat)).put("chatsBusy",session.chatsBusy).put("chatsEnd",session.chatsEnd).put("typing",session.typingLabel());
        if(session.authorization instanceof TdApi.AuthorizationStateWaitEmailCode){TdApi.EmailAddressAuthenticationCodeInfo info=((TdApi.AuthorizationStateWaitEmailCode)session.authorization).codeInfo;if(info!=null)data.put("authEmailPattern",info.emailAddressPattern==null?"":info.emailAddressPattern).put("authCodeLength",info.length);}
        if(session.authorization instanceof TdApi.AuthorizationStateWaitPassword){TdApi.AuthorizationStateWaitPassword password=(TdApi.AuthorizationStateWaitPassword)session.authorization;data.put("authHint",password.passwordHint==null?"":password.passwordHint).put("authRecoveryAvailable",password.hasRecoveryEmailAddress).put("authRecoveryPattern",password.recoveryEmailAddressPattern==null?"":password.recoveryEmailAddressPattern);}
        if(session.authorization instanceof TdApi.AuthorizationStateWaitRegistration){TdApi.TermsOfService terms=((TdApi.AuthorizationStateWaitRegistration)session.authorization).termsOfService;if(terms!=null){data.put("authMinAge",terms.minUserAge);if(terms.text!=null&&terms.text.text!=null)data.put("authTerms",limit(terms.text.text,4000));}}
         if(session.authorization instanceof TdApi.AuthorizationStateWaitOtherDeviceConfirmation)data.put("qrImage",QrCodeImage.dataUri(((TdApi.AuthorizationStateWaitOtherDeviceConfirmation)session.authorization).link));
         TdApi.User self=session.user(session.selfId);if(self!=null&&self.profilePhoto!=null){TdApi.ProfilePhoto photo=self.profilePhoto;if(photo.small!=null)data.put("profilePhoto",preview(media.register(photo.small,"image/jpeg","image",session.displayName),null,photo.minithumbnail));else if(photo.minithumbnail!=null&&photo.minithumbnail.data!=null&&photo.minithumbnail.data.length<=16384)data.put("profilePhoto",new JSONObject().put("id",0).put("ready",false).put("mime","image/jpeg").put("kind","image").put("name",session.displayName).put("size",0).put("minithumbnail","data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(photo.minithumbnail.data)));}
        if(!data.has("profilePhoto"))data.put("profilePhoto",JSONObject.NULL);
        JSONObject ownStatus=emojiStatus(self);
        data.put("emojiStatus",ownStatus==null?JSONObject.NULL:ownStatus);
        if(includeChats){
            JSONArray chats=new JSONArray();List<TdApi.Chat> list=session.chatList("");for(TdApi.Chat chat:list)chats.put(chat(chat));
            if(session.activeChat!=0&&list.stream().noneMatch(chat->chat.id==session.activeChat)&&session.chat(session.activeChat)!=null)chats.put(chat(session.chat(session.activeChat)).put("inList",false));
            data.put("chats",chats).put("chatList",session.selectedListKey());
        }
         if(includeMessages){JSONArray messages=new JSONArray();for(TdApi.Message message:session.history())messages.put(message(message));data.put("messages",messages);}
         JSONObject keyboard=botKeyboard();data.put("botKeyboard",keyboard==null?JSONObject.NULL:keyboard);
        JSONArray folders=new JSONArray();for(TdApi.ChatFolderInfo folder:session.folders)folders.put(new JSONObject().put("id",folder.id).put("title",folder.name.text.text));data.put("folders",folders);
        data.put("quickReplies",quickRepliesDto());
        HistoryWindow history=session.currentWindow();data.put("history",new JSONObject().put("loading",history!=null&&history.loading).put("initialRetry",history!=null&&history.waitingRetry).put("end",history!=null&&history.end).put("error",history==null?"":history.error).put("latest",history==null||history.latest).put("anchor",String.valueOf(history==null?0:history.anchor))).put("topic",session.topicState());
        data.put("appearance",appearanceDto(prefs,session.context()));
        data.put("permissions",new JSONObject().put("notes",granted("notes")).put("replies",granted("replies")));
        JSONArray turns=new JSONArray();for(AssistantPayload.Turn turn:assistant.history())turns.put(new JSONObject().put("role",turn.role).put("content",turn.content));
        data.put("assistant",new JSONObject().put("state",assistant.state).put("ready",assistant.ready).put("busy",assistant.busy).put("consent",assistant.consent).put("error",assistant.error).put("turns",turns));
        JSONArray ads=new JSONArray();for(TdApi.SponsoredMessage ad:session.sponsored.values()){JSONObject value=new JSONObject().put("id",String.valueOf(ad.messageId)).put("chatId",String.valueOf(session.activeChat)).put("title",ad.title).put("text",contentCaption(ad.content)).put("label",ad.isRecommended?"Recomendado":"Patrocinado").put("button",ad.buttonText).put("info",ad.additionalInfo==null?"":ad.additionalInfo);if(ad.sponsor!=null)value.put("sponsor",ad.sponsor.info==null?"":ad.sponsor.info);JSONObject file=contentMedia(ad.content);if(file!=null){media.protect(file.getInt("id"));value.put("media",file);}ads.put(value);}data.put("sponsored",ads).put("sponsoredError",session.sponsoredError);
        data.put("wallet",wallet()).put("access",accessStatus()).put("notifications",session.notificationStatus()).put("security",AppLock.status(session.context())).put("mediaReady",media.refreshReady()).put("mediaLoading",media.loadingIds()).put("mediaFailed",media.failedIds());return data;
    }
    /** Saldo y Premium llegan por UpdateOwnedStarCount/UpdateUser; aquí solo se reflejan, nunca se consultan. */
    JSONObject wallet()throws Exception{
        TdApi.StarAmount amount=session.starAmount;TdApi.User self=session.user(session.selfId);
        return new JSONObject().put("stars",amount==null?0:amount.starCount).put("nanostars",amount==null?0:amount.nanostarCount).put("premium",self!=null&&self.isPremium);
    }
    static JSONObject emojiStatus(TdApi.User user)throws Exception{
        if(user==null||!user.isPremium||user.emojiStatus==null)return null;
        TdApi.EmojiStatus status=user.emojiStatus;
        if(status.expirationDate!=0&&status.expirationDate<=System.currentTimeMillis()/1000)return null;
        long id;
        if(status.type instanceof TdApi.EmojiStatusTypeCustomEmoji)id=((TdApi.EmojiStatusTypeCustomEmoji)status.type).customEmojiId;
        else if(status.type instanceof TdApi.EmojiStatusTypeUpgradedGift)id=((TdApi.EmojiStatusTypeUpgradedGift)status.type).modelCustomEmojiId;
        else return null;
        return id>0?new JSONObject().put("customEmojiId",Long.toString(id)).put("expiration",status.expirationDate):null;
    }
    static String draftText(TdApi.DraftMessage draft){
        if(draft==null||!(draft.content instanceof TdApi.DraftMessageContentText))return "";
        TdApi.FormattedText text=((TdApi.DraftMessageContentText)draft.content).text;
        return text==null||text.text==null?"":limit(text.text,4096);
    }
    static JSONArray draftEmojis(TdApi.DraftMessage draft){
        if(draft==null||!(draft.content instanceof TdApi.DraftMessageContentText))return new JSONArray();
        TdApi.FormattedText formatted=((TdApi.DraftMessageContentText)draft.content).text;
        JSONArray all=entities(formatted),result=new JSONArray();
        for(int i=0;i<all.length();i++){
            JSONObject entity=all.optJSONObject(i);
            if(entity!=null&&"customEmoji".equals(entity.optString("type")))result.put(entity);
        }
        return result;
    }
    JSONObject accessStatus()throws Exception{return session.accessState();}
    JSONObject userPhoto(TdApi.User user)throws Exception{if(user==null||user.profilePhoto==null)return null;TdApi.ProfilePhoto photo=user.profilePhoto;return photoDto(photo.small,photo.big,photo.minithumbnail,user.firstName);}
    // Both variants are optional in different TDLib states; the minithumbnail keeps initials
    // from replacing a real photo while the small file is still being fetched.
    JSONObject photoDto(TdApi.File small,TdApi.File big,TdApi.Minithumbnail mini,String name)throws Exception{
        JSONObject photo=small!=null?preview(media.register(small,"image/jpeg","image",name),null,mini):big!=null?preview(media.register(big,"image/jpeg","image",name),null,mini):null;
        if(photo==null&&mini!=null&&mini.data!=null&&mini.data.length<=16384)photo=new JSONObject().put("id",0).put("ready",false).put("mime","image/jpeg").put("kind","image").put("name",name==null?"":name).put("size",0).put("minithumbnail","data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(mini.data));
        return photo;
    }
    boolean granted(String plugin){return session.selfId>0&&prefs.getBoolean("plugin."+session.selfId+"."+plugin,false);}
    JSONObject chat(TdApi.Chat chat)throws Exception{
        boolean pinned=false,archived=false;if(chat.positions!=null)for(TdApi.ChatPosition position:chat.positions){if(TdSession.sameList(position.list,session.selectedList()))pinned=position.isPinned;if(position.list instanceof TdApi.ChatListArchive&&position.order>0)archived=true;}
         JSONObject data=new JSONObject().put("id",String.valueOf(chat.id)).put("title",chat.title).put("preview",caption(chat.lastMessage)).put("date",chat.lastMessage==null?0:chat.lastMessage.date).put("unread",chat.unreadCount).put("marked",chat.isMarkedAsUnread).put("bot",session.bot(chat)).put("type",chat.type instanceof TdApi.ChatTypePrivate?"private":"group").put("pinned",pinned).put("archived",archived).put("readInbox",String.valueOf(chat.lastReadInboxMessageId)).put("muted",chat.notificationSettings!=null&&chat.notificationSettings.muteFor>0).put("supported",session.unsupported(chat).isEmpty()).put("activeStories",session.activeStoryCount(chat.id));
         String draft=draftText(chat.draftMessage);
         if(!draft.isEmpty()){
             data.put("draft",draft);
             JSONArray emojis=draftEmojis(chat.draftMessage);
             if(emojis.length()>0)data.put("draftEntities",emojis);
         }
         data.put("canSendExpressions",session.canSendExpressions(chat));
         if(chat.type instanceof TdApi.ChatTypePrivate){TdApi.User privateUser=session.user(((TdApi.ChatTypePrivate)chat.type).userId);data.put("isContact",privateUser!=null&&privateUser.isContact);addPremiumMark(data,privateUser,"premium","emojiStatus");}
         if(chat.type instanceof TdApi.ChatTypeSupergroup){data.put("supergroup",true);if(((TdApi.ChatTypeSupergroup)chat.type).isChannel)data.put("type","channel");TdApi.Supergroup group=session.supergroup(((TdApi.ChatTypeSupergroup)chat.type).supergroupId);if(group!=null){if(group.isForum)data.put("isForum",true);if(group.hasAutomaticTranslation)data.put("automaticTranslation",true);}}
         data.put("translatable",chat.isTranslatable);
        if(chat.type instanceof TdApi.ChatTypeSecret){
            data.put("type","secret");
            TdApi.SecretChat peer=session.secret(chat);
            if(peer!=null)addPremiumMark(data,session.user(peer.userId),"premium","emojiStatus");
        }
        if(chat.lastMessage!=null&&caption(chat.lastMessage).isEmpty()){
            TdApi.MessageContent content=chat.lastMessage.content;
            data.put("preview",content instanceof TdApi.MessagePhoto?"Foto":content instanceof TdApi.MessageAnimation?"GIF":content instanceof TdApi.MessageVideo?"Vídeo":content instanceof TdApi.MessageDocument?"Documento":content instanceof TdApi.MessageAudio?"Audio":content instanceof TdApi.MessagePaidMedia?"Contenido de pago":"Mensaje");
        }
        if(chat.messageSenderId!=null)data.put("senderKind",TdSession.senderKind(chat.messageSenderId)).put("senderId",String.valueOf(TdSession.senderId(chat.messageSenderId))).put("senderName",session.senderName(chat.messageSenderId));
        TdApi.SecretChat secret=session.secret(chat);if(secret!=null){data.put("secretState",secret.state instanceof TdApi.SecretChatStateReady?"ready":secret.state instanceof TdApi.SecretChatStatePending?"pending":"closed");if(secret.keyHash!=null&&secret.keyHash.length>=32){StringBuilder hash=new StringBuilder();for(int i=0;i<32;i++)hash.append(String.format(java.util.Locale.ROOT,"%02x",secret.keyHash[i]&255)).append(i%8==7?"\n":" ");data.put("fingerprint",hash.toString().trim());}}
        if(chat.photo!=null)try{JSONObject photo=photoDto(chat.photo.small,chat.photo.big,chat.photo.minithumbnail,chat.title);if(photo!=null)data.put("photo",photo);}catch(Exception ignored){}return data;
    }
    private static void addPremiumMark(JSONObject data,TdApi.User user,String premium,String status)throws Exception{
        if(user==null||!user.isPremium)return;
        data.put(premium,true).put(status,emojiStatus(user));
    }
    JSONObject searchMessage(TdApi.Message message)throws Exception{
        JSONObject data=message(message);TdApi.Chat chat=session.chat(message.chatId);
        data.put("chatTitle",chat==null?"":chat.title);
        return data;
    }
    JSONObject message(TdApi.Message message)throws Exception{
        TdApi.Chat chat=session.chat(message.chatId);String status=message.sendingState instanceof TdApi.MessageSendingStatePending?"pending":message.sendingState instanceof TdApi.MessageSendingStateFailed?"failed":!message.isOutgoing?"":chat!=null&&chat.type instanceof TdApi.ChatTypePrivate&&((TdApi.ChatTypePrivate)chat.type).userId!=session.selfId&&message.id<=chat.lastReadOutboxMessageId?"read":"sent";
         JSONObject data=new JSONObject().put("id",String.valueOf(message.id)).put("chatId",String.valueOf(message.chatId)).put("sender",session.senderName(message.senderId)).put("text",caption(message)).put("date",message.date).put("outgoing",message.isOutgoing).put("status",status).put("edited",message.editDate>0);
         if(message.senderId instanceof TdApi.MessageSenderUser){
             TdApi.User sender=session.user(((TdApi.MessageSenderUser)message.senderId).userId);
             addPremiumMark(data,sender,"senderPremium","senderEmojiStatus");
         }
         if(message.topicId instanceof TdApi.MessageTopicForum)data.put("forumTopicId",((TdApi.MessageTopicForum)message.topicId).forumTopicId);
         if(message.mediaAlbumId!=0)data.put("albumId",String.valueOf(message.mediaAlbumId));
         if(message.selfDestructType==null&&message.ephemeralContent==null){JSONArray formatted=entities(formatted(message.content));if(formatted.length()>0)data.put("entities",formatted);}
         if(message.schedulingState instanceof TdApi.MessageSchedulingStateSendAtDate){
             TdApi.MessageSchedulingStateSendAtDate scheduled=(TdApi.MessageSchedulingStateSendAtDate)message.schedulingState;
             data.put("scheduledAt",scheduled.sendDate);
             if(scheduled.repeatPeriod>0)data.put("scheduledRepeat",true).put("repeatPeriod",scheduled.repeatPeriod);
         }
         else if(message.schedulingState instanceof TdApi.MessageSchedulingStateSendWhenOnline)data.put("scheduledOnline",true);
         JSONObject service=ServiceMessages.dto(message,this);if(service!=null)data.put("service",service);
         if(message.content instanceof TdApi.MessageInvoice){TdApi.MessageInvoice invoice=(TdApi.MessageInvoice)message.content;TdApi.ProductInfo product=invoice.productInfo;data.put("invoice",new JSONObject().put("title",product==null||product.title==null?"Pago de Telegram":limit(product.title,180)).put("description",product==null||product.description==null||product.description.text==null?"":limit(product.description.text,600)).put("currency",invoice.currency==null?"":invoice.currency).put("amount",invoice.totalAmount).put("eligible","XTR".equals(invoice.currency)&&!invoice.needShippingAddress&&invoice.receiptMessageId==0).put("paid",invoice.receiptMessageId>0).put("test",invoice.isTest));}
        if(message.content instanceof TdApi.MessagePaidMedia){
            TdApi.MessagePaidMedia paid=(TdApi.MessagePaidMedia)message.content;
            JSONArray pieces=new JSONArray();boolean locked=paid.media==null||paid.media.length==0;
            if(paid.media!=null)for(TdApi.PaidMedia piece:paid.media){
                if(piece==null)continue;
                try{JSONObject row=paidMediaPiece(piece);if(row!=null)pieces.put(row);}catch(Exception ignored){pieces.put(new JSONObject().put("kind","unsupported"));}
                if(piece instanceof TdApi.PaidMediaPhoto||piece instanceof TdApi.PaidMediaVideo)locked=false;
            }
            data.put("paidMedia",new JSONObject().put("starCount",paid.starCount).put("locked",locked).put("media",pieces));
        }
        if(message.content instanceof TdApi.MessageGift){TdApi.MessageGift gift=(TdApi.MessageGift)message.content;TdApi.Gift value=gift.gift;JSONObject item=new JSONObject().put("stars",value==null?0:value.starCount).put("premium",value!=null&&value.isPremium).put("unique",gift.uniqueGiftNumber>0).put("saved",gift.isSaved).put("private",gift.isPrivate).put("upgraded",gift.wasUpgraded).put("converted",gift.wasConverted).put("refunded",gift.wasRefunded).put("canUpgrade",gift.canBeUpgraded);if(gift.uniqueGiftNumber>0)item.put("number",gift.uniqueGiftNumber);if(gift.text!=null&&gift.text.text!=null&&!gift.text.text.isEmpty())item.put("text",limit(gift.text.text,500));data.put("gift",item);}
        if(message.content instanceof TdApi.MessageChecklist){
            TdApi.Checklist list=((TdApi.MessageChecklist)message.content).list;
            if(list!=null){
                JSONObject value=new JSONObject().put("title",list.title==null||list.title.text==null?"":limit(list.title.text,2000))
                    .put("othersCanAdd",list.othersCanAddTasks).put("othersCanMark",list.othersCanMarkTasksAsDone)
                    .put("canAdd",list.canAddTasks).put("canMark",list.canMarkTasksAsDone);
                JSONArray tasks=new JSONArray();
                if(list.tasks!=null)for(TdApi.ChecklistTask task:list.tasks)tasks.put(new JSONObject().put("id",task.id).put("text",task.text==null||task.text.text==null?"":limit(task.text.text,2000)).put("done",task.completedBy!=null));
                value.put("tasks",tasks);data.put("checklist",value);
            }
        }
        if(message.content instanceof TdApi.MessagePoll){
            TdApi.MessagePoll container=(TdApi.MessagePoll)message.content;TdApi.Poll poll=container.poll;
            if(poll!=null){
                JSONObject value=new JSONObject().put("question",poll.question==null?"":limit(poll.question.text,300))
                    .put("description",container.description==null||container.description.text==null?"":limit(container.description.text,600))
                    .put("totalVoters",poll.totalVoterCount).put("anonymous",poll.isAnonymous).put("multiple",poll.allowsMultipleAnswers)
                    .put("revoting",poll.allowsRevoting).put("closed",poll.isClosed).put("canSeeResults",poll.canSeeResults)
                    .put("canGetVoters",poll.canGetVoters).put("canStop",message.isOutgoing&&!poll.isClosed)
                    .put("quiz",poll.type instanceof TdApi.PollTypeQuiz);
                if(poll.type instanceof TdApi.PollTypeQuiz&&((TdApi.PollTypeQuiz)poll.type).explanation!=null)value.put("explanation",limit(((TdApi.PollTypeQuiz)poll.type).explanation.text,300));
                if(poll.voteRestrictionReason!=null)value.put("restriction",pollRestriction(poll.voteRestrictionReason));
                TdApi.PollOption[] source=poll.options==null?new TdApi.PollOption[0]:poll.options;int[] order=poll.optionOrder!=null&&poll.optionOrder.length>0?poll.optionOrder:null;
                JSONArray options=new JSONArray();
                for(int i=0;i<source.length;i++){
                    int index=order!=null&&i<order.length?order[i]:i;if(index<0||index>=source.length)index=i;
                    TdApi.PollOption option=source[index];if(option==null)continue;
                    options.put(new JSONObject().put("index",index).put("text",option.text==null?"":limit(option.text.text,100))
                        .put("votes",option.voterCount).put("percentage",option.votePercentage).put("chosen",option.isChosen).put("choosing",option.isBeingChosen));
                }
                value.put("options",options);data.put("poll",value);
            }
        }
        if(message.content instanceof TdApi.MessageRichMessage){JSONObject rich=rich((TdApi.MessageRichMessage)message.content);if(rich!=null)data.put("rich",rich);}
        boolean temporary=message.selfDestructType!=null||message.ephemeralContent!=null;
        if(!temporary&&chat!=null&&!(chat.type instanceof TdApi.ChatTypeSecret)){
            if(message.content instanceof TdApi.MessageVoiceNote){TdApi.SpeechRecognitionResult speech=((TdApi.MessageVoiceNote)message.content).voiceNote.speechRecognitionResult;if(speech!=null)data.put("speech",speechDto(speech));data.put("transcribable",true);}
            else if(message.content instanceof TdApi.MessageVideoNote){TdApi.SpeechRecognitionResult speech=((TdApi.MessageVideoNote)message.content).videoNote.speechRecognitionResult;if(speech!=null)data.put("speech",speechDto(speech));data.put("transcribable",true);}
        }
        if(!temporary){JSONObject file=contentMedia(message.content);if(file!=null){if(chat!=null&&(chat.hasProtectedContent||chat.type instanceof TdApi.ChatTypeSecret)){protect(file);file.put("exportable",false);}data.put("media",file);}}
        if(!temporary){TdApi.File avatar=session.senderPhoto(message.senderId);if(avatar!=null)data.put("senderPhoto",media.register(avatar,"image/jpeg","image","Foto del remitente"));}
        if(!temporary&&message.content instanceof TdApi.MessageText&&(chat==null||!(chat.type instanceof TdApi.ChatTypeSecret))){TdApi.LinkPreview link=((TdApi.MessageText)message.content).linkPreview;if(link!=null){JSONObject card=new JSONObject().put("title",limit(link.title==null?"":link.title,240)).put("site",link.siteName==null?"":link.siteName).put("description",limit(link.description==null?"":link.description.text,700));JSONObject image=linkThumbnail(link.type);if(image!=null){if(chat!=null&&chat.hasProtectedContent){protect(image);image.put("exportable",false);}card.put("photo",image);}data.put("preview",card);}}
        if(message.replyTo instanceof TdApi.MessageReplyToMessage){TdApi.MessageReplyToMessage reply=(TdApi.MessageReplyToMessage)message.replyTo;TdApi.Message original=reply.chatId==0||reply.chatId==message.chatId?session.message(reply.messageId):null;data.put("reply",original==null?"Respuesta a otro mensaje":limit(caption(original),120));}
         JSONArray reactions=new JSONArray();if(!temporary&&message.interactionInfo!=null&&message.interactionInfo.reactions!=null)for(TdApi.MessageReaction reaction:message.interactionInfo.reactions.reactions){JSONObject item=new JSONObject().put("count",reaction.totalCount).put("chosen",reaction.isChosen);if(reaction.type instanceof TdApi.ReactionTypeEmoji)item.put("emoji",((TdApi.ReactionTypeEmoji)reaction.type).emoji);else if(reaction.type instanceof TdApi.ReactionTypePaid)item.put("emoji","⭐").put("kind","paid");else if(reaction.type instanceof TdApi.ReactionTypeCustomEmoji){item.put("emoji","✨").put("kind","custom").put("customEmojiId",String.valueOf(((TdApi.ReactionTypeCustomEmoji)reaction.type).customEmojiId));}else continue;reactions.put(item);}data.put("reactions",reactions);if(!temporary&&message.replyMarkup instanceof TdApi.ReplyMarkupInlineKeyboard)data.put("inlineKeyboard",inlineKeyboard(((TdApi.ReplyMarkupInlineKeyboard)message.replyMarkup).rows));return data;
    }
    JSONObject botKeyboard()throws Exception{TdApi.Chat chat=session.chat(session.activeChat);if(chat==null||chat.replyMarkupMessageId==0)return null;TdApi.Message source=session.message(chat.replyMarkupMessageId);if(source==null||source.replyMarkup==null||source.selfDestructType!=null||source.ephemeralContent!=null||chat.type instanceof TdApi.ChatTypeSecret||!(source.replyMarkup instanceof TdApi.ReplyMarkupShowKeyboard))return null;TdApi.ReplyMarkupShowKeyboard markup=(TdApi.ReplyMarkupShowKeyboard)source.replyMarkup;return new JSONObject().put("messageId",String.valueOf(source.id)).put("rows",keyboard(markup.rows));}
    static JSONObject speechDto(TdApi.SpeechRecognitionResult speech)throws Exception{
        if(speech instanceof TdApi.SpeechRecognitionResultText){String text=((TdApi.SpeechRecognitionResultText)speech).text;return new JSONObject().put("state","text").put("text",text==null?"":limit(text,4000));}
        if(speech instanceof TdApi.SpeechRecognitionResultError){TdApi.SpeechRecognitionResultError error=(TdApi.SpeechRecognitionResultError)speech;return new JSONObject().put("state","error").put("error",limit(error.error==null?"Error de Telegram":error.error.message,200));}
        if(speech instanceof TdApi.SpeechRecognitionResultPending){TdApi.SpeechRecognitionResultPending pending=(TdApi.SpeechRecognitionResultPending)speech;return new JSONObject().put("state","pending").put("partial",pending.partialText==null?"":limit(pending.partialText,600));}
        return new JSONObject().put("state","error").put("error","Telegram no devolvió una transcripción válida.");
    }
    JSONObject quickRepliesDto()throws Exception{
        JSONArray shortcuts=new JSONArray();java.util.Set<Integer> seen=new java.util.HashSet<>();
        for(int id:session.quickReplyOrder()){TdApi.QuickReplyShortcut shortcut=session.quickReply(id);if(shortcut==null)continue;seen.add(id);shortcuts.put(shortcutDto(shortcut));}
        for(TdApi.QuickReplyShortcut shortcut:session.quickReplies())if(!seen.contains(shortcut.id))shortcuts.put(shortcutDto(shortcut));
        JSONObject messages=new JSONObject();
        for(java.util.Map.Entry<Integer,TdApi.QuickReplyMessage[]> entry:session.quickReplyMessageMap().entrySet()){JSONArray texts=new JSONArray();if(entry.getValue()!=null)for(TdApi.QuickReplyMessage message:entry.getValue())texts.put(limit(contentCaption(message.content),1000));messages.put(String.valueOf(entry.getKey()),texts);}
        return new JSONObject().put("shortcuts",shortcuts).put("messages",messages);
    }
    private JSONObject shortcutDto(TdApi.QuickReplyShortcut shortcut)throws Exception{
        JSONObject item=new JSONObject().put("id",shortcut.id).put("name",limit(shortcut.name==null?"":shortcut.name,64)).put("count",shortcut.messageCount);
        if(shortcut.firstMessage!=null)item.put("first",limit(contentCaption(shortcut.firstMessage.content),400));
        return item;
    }
     static JSONArray inlineKeyboard(TdApi.InlineKeyboardButton[][] rows)throws Exception{JSONArray result=new JSONArray();if(rows==null)return result;for(int r=0;r<Math.min(rows.length,8);r++){JSONArray row=new JSONArray();TdApi.InlineKeyboardButton[] buttons=rows[r];if(buttons!=null)for(int c=0;c<Math.min(buttons.length,8);c++){TdApi.InlineKeyboardButton button=buttons[c];String kind="unsupported";boolean enabled=false;if(button.type instanceof TdApi.InlineKeyboardButtonTypeUrl){kind="url";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeLoginUrl){kind="login";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeWebApp){kind="webapp";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallback){kind="callback";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallbackWithPassword){kind="callbackPassword";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallbackGame){kind="game";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeCopyText){kind="copy";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeUser){kind="user";enabled=true;}else if(button.type instanceof TdApi.InlineKeyboardButtonTypeSwitchInline){TdApi.TargetChat target=((TdApi.InlineKeyboardButtonTypeSwitchInline)button.type).targetChat;if(target==null||target instanceof TdApi.TargetChatCurrent||target instanceof TdApi.TargetChatChosen||target instanceof TdApi.TargetChatInternalLink&&((TdApi.TargetChatInternalLink)target).link instanceof TdApi.InternalLinkTypePublicChat){kind="switch";enabled=true;}}row.put(buttonDto(button.text,kind,enabled,button.style));}result.put(row);}return result;}
    static JSONArray keyboard(TdApi.KeyboardButton[][] rows)throws Exception{JSONArray result=new JSONArray();if(rows==null)return result;for(int r=0;r<Math.min(rows.length,8);r++){JSONArray row=new JSONArray();TdApi.KeyboardButton[] buttons=rows[r];if(buttons!=null)for(int c=0;c<Math.min(buttons.length,8);c++){TdApi.KeyboardButton button=buttons[c];String kind="unsupported";boolean enabled=false;if(button.type instanceof TdApi.KeyboardButtonTypeText){kind="text";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeWebApp){kind="webapp";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestPhoneNumber){kind="sharePhone";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestLocation){kind="location";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestPoll){kind="poll";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestUsers){kind="users";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestChat){kind="requestChat";enabled=true;}else if(button.type instanceof TdApi.KeyboardButtonTypeRequestManagedBot){kind="managedBot";enabled=true;}row.put(buttonDto(button.text,kind,enabled,button.style));}result.put(row);}return result;}
    private static JSONObject buttonDto(String text,String kind,boolean enabled,TdApi.ButtonStyle style)throws Exception{String color=style instanceof TdApi.ButtonStylePrimary?"primary":style instanceof TdApi.ButtonStyleSuccess?"success":style instanceof TdApi.ButtonStyleDanger?"danger":style instanceof TdApi.ButtonStyleLink?"link":"";JSONObject value=new JSONObject().put("text",limit(text==null?"":text,128)).put("kind",kind).put("enabled",enabled);if(!color.isEmpty())value.put("style",color);return value;}
    JSONObject rich(TdApi.MessageRichMessage content)throws Exception{
        TdApi.RichMessage value=content.message;if(value==null||value.blocks==null)return null;
        JSONArray blocks=new JSONArray();for(TdApi.PageBlock block:value.blocks){JSONObject item=richBlock(block);if(item!=null)blocks.put(item);}
        if(blocks.length()==0)return null;
        return new JSONObject().put("rtl",value.isRtl).put("full",value.isFull).put("blocks",blocks);
    }
    private JSONObject richBlock(TdApi.PageBlock block)throws Exception{
        if(block==null)return null;
        if(block instanceof TdApi.PageBlockTitle)return richTextBlock("title",((TdApi.PageBlockTitle)block).title);
        if(block instanceof TdApi.PageBlockSubtitle)return richTextBlock("subtitle",((TdApi.PageBlockSubtitle)block).subtitle);
        if(block instanceof TdApi.PageBlockHeader)return richTextBlock("header",((TdApi.PageBlockHeader)block).header);
        if(block instanceof TdApi.PageBlockSubheader)return richTextBlock("subheader",((TdApi.PageBlockSubheader)block).subheader);
        if(block instanceof TdApi.PageBlockSectionHeading){TdApi.PageBlockSectionHeading value=(TdApi.PageBlockSectionHeading)block;return richTextBlock("sectionHeading",value.text).put("size",value.size);}
        if(block instanceof TdApi.PageBlockKicker)return richTextBlock("kicker",((TdApi.PageBlockKicker)block).kicker);
        if(block instanceof TdApi.PageBlockParagraph)return richTextBlock("paragraph",((TdApi.PageBlockParagraph)block).text);
        if(block instanceof TdApi.PageBlockPreformatted){TdApi.PageBlockPreformatted value=(TdApi.PageBlockPreformatted)block;JSONObject item=richTextBlock("pre",value.text);if(value.language!=null&&!value.language.isBlank())item.put("language",limit(value.language,32));return item;}
        if(block instanceof TdApi.PageBlockFooter)return richTextBlock("footer",((TdApi.PageBlockFooter)block).footer);
        if(block instanceof TdApi.PageBlockThinking)return richTextBlock("thinking",((TdApi.PageBlockThinking)block).text);
        if(block instanceof TdApi.PageBlockPullQuote)return richTextBlock("pullQuote",((TdApi.PageBlockPullQuote)block).text);
        if(block instanceof TdApi.PageBlockExpandableBlockQuote){TdApi.RichText credit=((TdApi.PageBlockExpandableBlockQuote)block).credit;JSONObject item=richTextBlock("expandableBlockquote",((TdApi.PageBlockExpandableBlockQuote)block).text);String value=RichMessages.plain(credit);if(!value.isBlank())item.put("credit",limit(value,200));return item;}
        if(block instanceof TdApi.PageBlockAuthorDate){TdApi.PageBlockAuthorDate value=(TdApi.PageBlockAuthorDate)block;return richTextBlock("authorDate",value.author).put("date",value.publishDate);}
        if(block instanceof TdApi.PageBlockDivider)return new JSONObject().put("type","divider");
        if(block instanceof TdApi.PageBlockMathematicalExpression)return new JSONObject().put("type","math").put("text",limit(((TdApi.PageBlockMathematicalExpression)block).expression,2000));
        if(block instanceof TdApi.PageBlockAnchor)return null;
        if(block instanceof TdApi.PageBlockList){TdApi.PageBlockListItem[] items=((TdApi.PageBlockList)block).items;JSONArray list=new JSONArray();if(items!=null)for(TdApi.PageBlockListItem item:items){if(item==null)continue;JSONObject row=new JSONObject().put("label",item.label==null?"":limit(item.label,80)).put("checkbox",item.hasCheckbox).put("checked",item.isChecked).put("blocks",richBlocks(item.blocks));list.put(row);}return new JSONObject().put("type","list").put("items",list);}
        if(block instanceof TdApi.PageBlockBlockQuote){TdApi.PageBlockBlockQuote value=(TdApi.PageBlockBlockQuote)block;JSONObject item=new JSONObject().put("type","blockquote").put("blocks",richBlocks(value.blocks));String credit=RichMessages.plain(value.credit);if(!credit.isBlank())item.put("credit",limit(credit,200));return item;}
        if(block instanceof TdApi.PageBlockPhoto){TdApi.PageBlockPhoto value=(TdApi.PageBlockPhoto)block;TdApi.MessagePhoto content=new TdApi.MessagePhoto();content.photo=value.photo;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("photo",content,value.caption,value.hasSpoiler,false,false);}
        if(block instanceof TdApi.PageBlockVideo){TdApi.PageBlockVideo value=(TdApi.PageBlockVideo)block;TdApi.MessageVideo content=new TdApi.MessageVideo();content.video=value.video;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("video",content,value.caption,value.hasSpoiler,value.needAutoplay,value.isLooped);}
        if(block instanceof TdApi.PageBlockAnimation){TdApi.PageBlockAnimation value=(TdApi.PageBlockAnimation)block;TdApi.MessageAnimation content=new TdApi.MessageAnimation();content.animation=value.animation;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("animation",content,value.caption,value.hasSpoiler,value.needAutoplay,false);}
        if(block instanceof TdApi.PageBlockAudio){TdApi.PageBlockAudio value=(TdApi.PageBlockAudio)block;TdApi.MessageAudio content=new TdApi.MessageAudio();content.audio=value.audio;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("audio",content,value.caption,false,false,false);}
        if(block instanceof TdApi.PageBlockDocument){TdApi.PageBlockDocument value=(TdApi.PageBlockDocument)block;TdApi.MessageDocument content=new TdApi.MessageDocument();content.document=value.document;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("document",content,value.caption,false,false,false);}
        if(block instanceof TdApi.PageBlockVoiceNote){TdApi.PageBlockVoiceNote value=(TdApi.PageBlockVoiceNote)block;TdApi.MessageVoiceNote content=new TdApi.MessageVoiceNote();content.voiceNote=value.voiceNote;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);return richMedia("voiceNote",content,value.caption,false,false,false);}
        if(block instanceof TdApi.PageBlockCover){JSONObject inner=richBlock(((TdApi.PageBlockCover)block).cover);return inner==null?null:new JSONObject().put("type","cover").put("block",inner);}
        if(block instanceof TdApi.PageBlockEmbedded){TdApi.PageBlockEmbedded value=(TdApi.PageBlockEmbedded)block;JSONObject item=new JSONObject().put("type","embedded").put("url",limit(value.url==null?"":value.url,2048));if(value.posterPhoto!=null){TdApi.MessagePhoto content=new TdApi.MessagePhoto();content.photo=value.posterPhoto;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);JSONObject poster=contentMedia(content);if(poster!=null)item.put("media",poster);}richCaption(item,value.caption);return item;}
        if(block instanceof TdApi.PageBlockEmbeddedPost){TdApi.PageBlockEmbeddedPost value=(TdApi.PageBlockEmbeddedPost)block;JSONObject item=new JSONObject().put("type","embeddedPost").put("url",limit(value.url==null?"":value.url,2048)).put("author",limit(value.author==null?"":value.author,200)).put("date",value.date).put("blocks",richBlocks(value.blocks));richCaption(item,value.caption);return item;}
        if(block instanceof TdApi.PageBlockCollage){TdApi.PageBlockCollage value=(TdApi.PageBlockCollage)block;JSONObject item=new JSONObject().put("type","collage").put("blocks",richBlocks(value.blocks));richCaption(item,value.caption);return item;}
        if(block instanceof TdApi.PageBlockSlideshow){TdApi.PageBlockSlideshow value=(TdApi.PageBlockSlideshow)block;JSONObject item=new JSONObject().put("type","slideshow").put("blocks",richBlocks(value.blocks));richCaption(item,value.caption);return item;}
        if(block instanceof TdApi.PageBlockChatLink){TdApi.PageBlockChatLink value=(TdApi.PageBlockChatLink)block;JSONObject item=new JSONObject().put("type","chatLink").put("title",limit(value.title==null?"":value.title,128));if(value.username!=null&&!value.username.isBlank())item.put("username",limit(value.username,64));if(value.photo!=null){JSONObject photo=photoDto(value.photo.small,value.photo.big,value.photo.minithumbnail,value.title);if(photo!=null)item.put("media",photo);}return item;}
        if(block instanceof TdApi.PageBlockTable){TdApi.PageBlockTable value=(TdApi.PageBlockTable)block;JSONArray rows=new JSONArray();if(value.cells!=null)for(TdApi.PageBlockTableCell[] source:value.cells){JSONArray row=new JSONArray();if(source!=null)for(TdApi.PageBlockTableCell cell:source){if(cell==null){row.put(JSONObject.NULL);continue;}JSONObject item=richText(cell.text).put("header",cell.isHeader).put("colspan",cell.colspan).put("rowspan",cell.rowspan);row.put(item);}rows.put(row);}JSONObject item=new JSONObject().put("type","table").put("cells",rows).put("bordered",value.isBordered).put("striped",value.isStriped).put("compact",value.isCompact);if(value.caption!=null){JSONObject caption=richText(value.caption);item.put("caption",caption.optString("text",""));}return item;}
        if(block instanceof TdApi.PageBlockDetails){TdApi.PageBlockDetails value=(TdApi.PageBlockDetails)block;JSONObject item=richTextBlock("details",value.header).put("blocks",richBlocks(value.blocks)).put("open",value.isOpen);return item;}
        if(block instanceof TdApi.PageBlockRelatedArticles){TdApi.PageBlockRelatedArticles value=(TdApi.PageBlockRelatedArticles)block;JSONArray articles=new JSONArray();if(value.articles!=null)for(TdApi.PageBlockRelatedArticle article:value.articles){if(article==null)continue;JSONObject row=new JSONObject().put("url",limit(article.url==null?"":article.url,2048)).put("title",limit(article.title==null?"":article.title,240)).put("description",limit(article.description==null?"":article.description,600)).put("author",limit(article.author==null?"":article.author,200)).put("date",article.publishDate);if(article.photo!=null){TdApi.MessagePhoto content=new TdApi.MessagePhoto();content.photo=article.photo;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);JSONObject photo=contentMedia(content);if(photo!=null)row.put("media",photo);}articles.put(row);}JSONObject item=new JSONObject().put("type","relatedArticles").put("articles",articles);if(value.header!=null){JSONObject header=richText(value.header);item.put("header",header.optString("text",""));}return item;}
        if(block instanceof TdApi.PageBlockMap){TdApi.PageBlockMap value=(TdApi.PageBlockMap)block;JSONObject item=new JSONObject().put("type","map");if(value.location!=null)item.put("latitude",value.location.latitude).put("longitude",value.location.longitude);richCaption(item,value.caption);return item;}
        if(block instanceof TdApi.PageBlockButtonRow){TdApi.InlineButton[] buttons=((TdApi.PageBlockButtonRow)block).buttons;JSONArray list=new JSONArray();if(buttons!=null)for(TdApi.InlineButton button:buttons){if(button==null)continue;JSONObject row=new JSONObject().put("text",limit(RichMessages.plain(button.text),128));if(button.type instanceof TdApi.InlineKeyboardButtonTypeUrl)row.put("url",limit(((TdApi.InlineKeyboardButtonTypeUrl)button.type).url,2048));list.put(row);}return new JSONObject().put("type","buttons").put("buttons",list);}
        return new JSONObject().put("type","unsupported");
    }
    private JSONArray richBlocks(TdApi.PageBlock[] blocks)throws Exception{JSONArray list=new JSONArray();if(blocks!=null)for(TdApi.PageBlock block:blocks){JSONObject item=richBlock(block);if(item!=null)list.put(item);}return list;}
    private JSONObject richTextBlock(String type,TdApi.RichText text)throws Exception{JSONObject item=richText(text);item.put("type",type);return item;}
    private void richCaption(JSONObject item,TdApi.PageBlockCaption caption)throws Exception{if(caption==null)return;JSONObject text=richText(caption.text);if(!text.optString("text","").isEmpty()){item.put("caption",text.optString("text"));item.put("captionEntities",text.optJSONArray("entities"));}String credit=RichMessages.plain(caption.credit);if(!credit.isBlank())item.put("credit",limit(credit,200));}
    private JSONObject richMedia(String type,TdApi.MessageContent content,TdApi.PageBlockCaption caption,boolean spoiler,boolean autoplay,boolean looped)throws Exception{JSONObject item=new JSONObject().put("type",type);JSONObject mediaDto=contentMedia(content);if(mediaDto!=null)item.put("media",mediaDto);richCaption(item,caption);if(spoiler)item.put("spoiler",true);if(autoplay)item.put("autoplay",true);if(looped)item.put("looped",true);return item;}
    static JSONObject richText(TdApi.RichText text)throws Exception{StringBuilder out=new StringBuilder();JSONArray entities=new JSONArray();flattenRich(text,out,entities);return new JSONObject().put("text",out.toString()).put("entities",entities);}
    private static void flattenRich(TdApi.RichText text,StringBuilder out,JSONArray entities)throws Exception{
        if(text==null)return;
        if(text instanceof TdApi.RichTextPlain){TdApi.RichTextPlain value=(TdApi.RichTextPlain)text;out.append(value.text==null?"":value.text);return;}
        if(text instanceof TdApi.RichTexts){TdApi.RichText[] parts=((TdApi.RichTexts)text).texts;if(parts!=null)for(TdApi.RichText part:parts)flattenRich(part,out,entities);return;}
        if(text instanceof TdApi.RichTextCustomEmoji){TdApi.RichTextCustomEmoji value=(TdApi.RichTextCustomEmoji)text;int start=out.length();out.append(value.alternativeText==null||value.alternativeText.isEmpty()?"✨":value.alternativeText);entities.put(new JSONObject().put("type","customEmoji").put("offset",start).put("length",out.length()-start).put("customEmojiId",String.valueOf(value.customEmojiId)));return;}
        if(text instanceof TdApi.RichTextIcon)return;
        if(text instanceof TdApi.RichTextAnchor)return;
        if(text instanceof TdApi.RichTextMathematicalExpression){out.append('$').append(limit(((TdApi.RichTextMathematicalExpression)text).expression,2000)).append('$');return;}
        if(text instanceof TdApi.RichTextButton){TdApi.InlineButton button=((TdApi.RichTextButton)text).button;if(button!=null)flattenRich(button.text,out,entities);return;}
        if(text instanceof TdApi.RichTextDiff){flattenRich(((TdApi.RichTextDiff)text).text,out,entities);return;}
        TdApi.RichText child=richChild(text);
        if(child==null)return;
        int start=out.length();flattenRich(child,out,entities);int length=out.length()-start;if(length<=0)return;
        JSONObject entity=new JSONObject().put("type",richType(text)).put("offset",start).put("length",length);
        if(entity.getString("type").isEmpty())return;
        if(text instanceof TdApi.RichTextUrl)entity.put("url",limit(((TdApi.RichTextUrl)text).url,2048));
        else if(text instanceof TdApi.RichTextMention)entity.put("url","https://t.me/"+((TdApi.RichTextMention)text).username);
        else if(text instanceof TdApi.RichTextMentionName)entity.put("userId",String.valueOf(((TdApi.RichTextMentionName)text).userId));
        else if(text instanceof TdApi.RichTextDateTime){TdApi.RichTextDateTime value=(TdApi.RichTextDateTime)text;entity.put("unixTime",value.unixTime);if(value.formattingType instanceof TdApi.DateTimeFormattingTypeRelative)entity.put("dateTimeType","relative");else if(value.formattingType instanceof TdApi.DateTimeFormattingTypeAbsolute)entity.put("dateTimeType","absolute");}
        else if(text instanceof TdApi.RichTextReferenceLink)entity.put("url",limit(((TdApi.RichTextReferenceLink)text).url,2048));
        else if(text instanceof TdApi.RichTextAnchorLink)entity.put("url",limit(((TdApi.RichTextAnchorLink)text).url,2048));
        entities.put(entity);
    }
    private static String richType(TdApi.RichText text){
        if(text instanceof TdApi.RichTextBold)return "bold";
        if(text instanceof TdApi.RichTextItalic)return "italic";
        if(text instanceof TdApi.RichTextUnderline)return "underline";
        if(text instanceof TdApi.RichTextStrikethrough)return "strikethrough";
        if(text instanceof TdApi.RichTextSpoiler)return "spoiler";
        if(text instanceof TdApi.RichTextFixed)return "code";
        if(text instanceof TdApi.RichTextDateTime)return "dateTime";
        if(text instanceof TdApi.RichTextMention)return "mention";
        if(text instanceof TdApi.RichTextHashtag)return "hashtag";
        if(text instanceof TdApi.RichTextCashtag)return "cashtag";
        if(text instanceof TdApi.RichTextBankCardNumber)return "bankCard";
        if(text instanceof TdApi.RichTextTonAddress)return "tonAddress";
        if(text instanceof TdApi.RichTextBotCommand)return "botCommand";
        if(text instanceof TdApi.RichTextMentionName)return "mentionName";
        if(text instanceof TdApi.RichTextUrl)return "link";
        if(text instanceof TdApi.RichTextEmailAddress)return "email";
        if(text instanceof TdApi.RichTextPhoneNumber)return "phone";
        if(text instanceof TdApi.RichTextReferenceLink||text instanceof TdApi.RichTextAnchorLink)return "link";
        return "";
    }
    private static TdApi.RichText richChild(TdApi.RichText text){
        if(text instanceof TdApi.RichTextBold)return ((TdApi.RichTextBold)text).text;
        if(text instanceof TdApi.RichTextItalic)return ((TdApi.RichTextItalic)text).text;
        if(text instanceof TdApi.RichTextUnderline)return ((TdApi.RichTextUnderline)text).text;
        if(text instanceof TdApi.RichTextStrikethrough)return ((TdApi.RichTextStrikethrough)text).text;
        if(text instanceof TdApi.RichTextSpoiler)return ((TdApi.RichTextSpoiler)text).text;
        if(text instanceof TdApi.RichTextSubscript)return ((TdApi.RichTextSubscript)text).text;
        if(text instanceof TdApi.RichTextSuperscript)return ((TdApi.RichTextSuperscript)text).text;
        if(text instanceof TdApi.RichTextMarked)return ((TdApi.RichTextMarked)text).text;
        if(text instanceof TdApi.RichTextFixed)return ((TdApi.RichTextFixed)text).text;
        if(text instanceof TdApi.RichTextDateTime)return ((TdApi.RichTextDateTime)text).text;
        if(text instanceof TdApi.RichTextMention)return ((TdApi.RichTextMention)text).text;
        if(text instanceof TdApi.RichTextHashtag)return ((TdApi.RichTextHashtag)text).text;
        if(text instanceof TdApi.RichTextCashtag)return ((TdApi.RichTextCashtag)text).text;
        if(text instanceof TdApi.RichTextBankCardNumber)return ((TdApi.RichTextBankCardNumber)text).text;
        if(text instanceof TdApi.RichTextTonAddress)return ((TdApi.RichTextTonAddress)text).text;
        if(text instanceof TdApi.RichTextBotCommand)return ((TdApi.RichTextBotCommand)text).text;
        if(text instanceof TdApi.RichTextMentionName)return ((TdApi.RichTextMentionName)text).text;
        if(text instanceof TdApi.RichTextUrl)return ((TdApi.RichTextUrl)text).text;
        if(text instanceof TdApi.RichTextEmailAddress)return ((TdApi.RichTextEmailAddress)text).text;
        if(text instanceof TdApi.RichTextPhoneNumber)return ((TdApi.RichTextPhoneNumber)text).text;
        if(text instanceof TdApi.RichTextReference)return ((TdApi.RichTextReference)text).text;
        if(text instanceof TdApi.RichTextReferenceLink)return ((TdApi.RichTextReferenceLink)text).text;
        if(text instanceof TdApi.RichTextAnchorLink)return ((TdApi.RichTextAnchorLink)text).text;
        return null;
    }
    private JSONObject paidMediaPiece(TdApi.PaidMedia piece)throws Exception{
        if(piece instanceof TdApi.PaidMediaPhoto){
            TdApi.MessagePhoto content=new TdApi.MessagePhoto();content.photo=((TdApi.PaidMediaPhoto)piece).photo;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);
            return contentMedia(content);
        }
        if(piece instanceof TdApi.PaidMediaVideo){
            TdApi.MessageVideo content=new TdApi.MessageVideo();content.video=((TdApi.PaidMediaVideo)piece).video;content.caption=new TdApi.FormattedText("",new TdApi.TextEntity[0]);
            return contentMedia(content);
        }
        if(piece instanceof TdApi.PaidMediaPreview){
            TdApi.PaidMediaPreview view=(TdApi.PaidMediaPreview)piece;
            JSONObject item=new JSONObject().put("kind","preview");
            if(view.width>0)item.put("width",view.width);
            if(view.height>0)item.put("height",view.height);
            if(view.duration>0)item.put("duration",view.duration);
            if(view.minithumbnail!=null&&view.minithumbnail.data!=null&&view.minithumbnail.data.length<=16384)item.put("minithumbnail","data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(view.minithumbnail.data));
            return item;
        }
        return new JSONObject().put("kind","unsupported");
    }
    JSONObject contentMedia(TdApi.MessageContent content)throws Exception{
         if(content instanceof TdApi.MessageGift){TdApi.Gift gift=((TdApi.MessageGift)content).gift;return gift==null||gift.sticker==null?null:sticker(gift.sticker);}
         if(content instanceof TdApi.MessagePhoto){TdApi.Photo photo=((TdApi.MessagePhoto)content).photo;TdApi.PhotoSize[] sizes=photo.sizes;TdApi.PhotoSize best=null,small=null;if(sizes!=null)for(TdApi.PhotoSize size:sizes)if(size!=null&&size.photo!=null){if(small==null||size.width>0&&(small.width<=0||size.width<small.width))small=size;if(size.width>0&&size.width<=1280&&(best==null||size.width>best.width))best=size;}if(best==null)best=small;if(best!=null){JSONObject result=preview(media.register(best.photo,"image/jpeg","image","Foto"),null,photo.minithumbnail);if(small!=null){JSONObject thumb=media.register(small.photo,"image/jpeg","image","Miniatura de foto");if(thumb!=null)result.put("thumbnail",thumb);}result.put("variants",photoVariants(photo));return result;}if(photo.minithumbnail!=null&&photo.minithumbnail.data!=null&&photo.minithumbnail.data.length<=16384)return new JSONObject().put("id",0).put("ready",false).put("mime","image/jpeg").put("kind","image").put("name","Foto de Telegram").put("size",0).put("minithumbnail","data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(photo.minithumbnail.data));}
        if(content instanceof TdApi.MessageSticker)return sticker(((TdApi.MessageSticker)content).sticker);
         if(content instanceof TdApi.MessageAnimation)return animation(((TdApi.MessageAnimation)content).animation);
         if(content instanceof TdApi.MessageVideo){TdApi.Video value=((TdApi.MessageVideo)content).video;String mime=mediaMime(value.mimeType,value.fileName);return preview(media.register(value.video,mime,"video",value.fileName),value.thumbnail,value.minithumbnail);}
        if(content instanceof TdApi.MessageVideoNote){TdApi.VideoNote value=((TdApi.MessageVideoNote)content).videoNote;return preview(media.register(value.video,"video/mp4","video","Videomensaje"),value.thumbnail,value.minithumbnail);}
         if(content instanceof TdApi.MessageDocument)return documentMedia(((TdApi.MessageDocument)content).document);
         if(content instanceof TdApi.MessageAudio){TdApi.Audio value=((TdApi.MessageAudio)content).audio;String mime=mediaMime(value.mimeType,value.fileName);return preview(media.register(value.audio,mime,"audio",value.fileName),value.albumCoverThumbnail,value.albumCoverMinithumbnail);}
         if(content instanceof TdApi.MessageVoiceNote){TdApi.VoiceNote value=((TdApi.MessageVoiceNote)content).voiceNote;return media.register(value.voice,mediaMime(value.mimeType,"voice.ogg"),"audio","Nota de voz");}return null;
    }
    /**
     * Every Telegram photo size is offered as a variant so the UI can request the one that
     * matches the rendered box instead of always downloading the 1280 px preview.
     */
    private JSONArray photoVariants(TdApi.Photo photo)throws Exception{
        JSONArray items=new JSONArray();if(photo==null||photo.sizes==null)return items;
        java.util.TreeMap<Integer,JSONObject> ordered=new java.util.TreeMap<>();
        for(TdApi.PhotoSize size:photo.sizes){
            if(size==null||size.photo==null||size.width<=0)continue;
            JSONObject file=media.register(size.photo,"image/jpeg","image","Foto");
            if(file==null||file.getInt("id")<=0)continue;
            ordered.put(size.width,new JSONObject().put("id",file.getInt("id")).put("width",size.width).put("height",Math.max(size.height,0)).put("size",file.optLong("size",0)));
        }
        for(JSONObject item:ordered.values())items.put(item);
        return items;
    }
    JSONObject storyMedia(TdApi.Story story)throws Exception{
        if(story==null||story.content==null)return null;JSONObject value=null;
        if(story.content instanceof TdApi.StoryContentPhoto){TdApi.Photo photo=((TdApi.StoryContentPhoto)story.content).photo;if(photo!=null&&photo.sizes!=null&&photo.sizes.length>0){TdApi.PhotoSize best=null;for(TdApi.PhotoSize size:photo.sizes)if(size!=null&&size.photo!=null&&(best==null||size.width>0&&size.width<=1280&&(best.width<=0||size.width>best.width)))best=size;if(best==null)best=photo.sizes[0];if(best!=null&&best.photo!=null)value=preview(media.register(best.photo,"image/jpeg","image","Historia"),null,photo.minithumbnail);}}
        else if(story.content instanceof TdApi.StoryContentVideo){TdApi.StoryVideo video=((TdApi.StoryContentVideo)story.content).video;if(video!=null&&video.video!=null)value=preview(media.register(video.video,"video/mp4","video","Video de historia"),video.thumbnail,video.minithumbnail);}
        if(value!=null){media.protect(value.getInt("id"));JSONObject thumb=value.optJSONObject("thumbnail");if(thumb!=null)media.protect(thumb.getInt("id"));}return value;
    }
    JSONObject documentMedia(TdApi.Document value)throws Exception{String mime=mediaMime(value.mimeType,value.fileName);return preview(media.register(value.document,mime,mediaKind(mime,"file"),value.fileName),value.thumbnail,null);}
    static String mediaMime(String mime,String name){if(mime!=null&&mime.matches("(?i)^(image|video|audio)/[a-z0-9.+-]+$"))return mime.toLowerCase(java.util.Locale.ROOT);String filename=name==null?"":name.toLowerCase(java.util.Locale.ROOT);if(filename.endsWith(".jpg")||filename.endsWith(".jpeg"))return "image/jpeg";if(filename.endsWith(".png"))return "image/png";if(filename.endsWith(".webp"))return "image/webp";if(filename.endsWith(".gif"))return "image/gif";if(filename.endsWith(".mp4")||filename.endsWith(".m4v"))return "video/mp4";if(filename.endsWith(".webm"))return "video/webm";if(filename.endsWith(".mov"))return "video/quicktime";if(filename.endsWith(".3gp"))return "video/3gpp";if(filename.endsWith(".mkv"))return "video/x-matroska";if(filename.endsWith(".avi"))return "video/x-msvideo";if(filename.endsWith(".mp3"))return "audio/mpeg";if(filename.endsWith(".ogg")||filename.endsWith(".opus"))return "audio/ogg";if(filename.endsWith(".m4a"))return "audio/mp4";if(filename.endsWith(".wav"))return "audio/wav";return mime==null||mime.isBlank()?"application/octet-stream":mime;}
    static String mediaKind(String mime,String fallback){return mime!=null&&(mime.startsWith("image/")||mime.startsWith("video/")||mime.startsWith("audio/"))?mime.startsWith("image/")?"image":mime.startsWith("audio/")?"audio":"video":fallback;}
    JSONObject sticker(TdApi.Sticker sticker)throws Exception{
        if(sticker.format instanceof TdApi.StickerFormatWebp)return media.register(sticker.sticker,"image/webp","image",sticker.emoji);
        if(sticker.format instanceof TdApi.StickerFormatTgs)return preview(media.register(sticker.sticker,"application/x-tgsticker","sticker",sticker.emoji),sticker.thumbnail,null);
        if(sticker.format instanceof TdApi.StickerFormatWebm){
            JSONObject video=preview(media.register(sticker.sticker,"video/webm","video",sticker.emoji),sticker.thumbnail,null);
            if(video!=null)return video.put("animated",true).put("width",sticker.width).put("height",sticker.height);
        }
        if(sticker.thumbnail!=null)return thumbnail(sticker.thumbnail,sticker.emoji);return null;
    }
    JSONObject animation(TdApi.Animation animation)throws Exception{
        String mime=mediaMime(animation.mimeType,animation.fileName);
        JSONObject file=preview(media.register(animation.animation,mime,mediaKind(mime,"video"),animation.fileName),animation.thumbnail,animation.minithumbnail);
        if(file!=null)return file.put("animated",true).put("width",animation.width).put("height",animation.height);
        return animation.thumbnail==null?null:thumbnail(animation.thumbnail,"GIF");
    }
     JSONObject thumbnail(TdApi.Thumbnail thumb,String name)throws Exception{String mime=thumb.format instanceof TdApi.ThumbnailFormatWebp?"image/webp":thumb.format instanceof TdApi.ThumbnailFormatPng?"image/png":thumb.format instanceof TdApi.ThumbnailFormatJpeg?"image/jpeg":thumb.format instanceof TdApi.ThumbnailFormatGif?"image/gif":thumb.format instanceof TdApi.ThumbnailFormatMpeg4?"video/mp4":thumb.format instanceof TdApi.ThumbnailFormatWebm?"video/webm":thumb.format instanceof TdApi.ThumbnailFormatTgs?"application/x-tgsticker":null;String kind=mime!=null&&mime.startsWith("video/")?"video":mime!=null&&mime.equals("application/x-tgsticker")?"sticker":"image";return mime==null?null:media.register(thumb.file,mime,kind,name);}
    private JSONObject linkThumbnail(TdApi.LinkPreviewType type)throws Exception{
        TdApi.Photo photo=type instanceof TdApi.LinkPreviewTypeArticle?((TdApi.LinkPreviewTypeArticle)type).photo:type instanceof TdApi.LinkPreviewTypePhoto?((TdApi.LinkPreviewTypePhoto)type).photo:type instanceof TdApi.LinkPreviewTypeEmbeddedVideoPlayer?((TdApi.LinkPreviewTypeEmbeddedVideoPlayer)type).thumbnail:null;
        if(photo!=null&&photo.sizes!=null&&photo.sizes.length>0){TdApi.PhotoSize best=photo.sizes[0];for(TdApi.PhotoSize size:photo.sizes)if(size.width>0&&size.width<=640&&size.width>best.width)best=size;return preview(media.register(best.photo,"image/jpeg","image","Vista previa del enlace"),null,photo.minithumbnail);}
        TdApi.Thumbnail thumb=type instanceof TdApi.LinkPreviewTypeVideo?((TdApi.LinkPreviewTypeVideo)type).video.thumbnail:type instanceof TdApi.LinkPreviewTypeAnimation?((TdApi.LinkPreviewTypeAnimation)type).animation.thumbnail:type instanceof TdApi.LinkPreviewTypeDocument?((TdApi.LinkPreviewTypeDocument)type).document.thumbnail:type instanceof TdApi.LinkPreviewTypeAudio?((TdApi.LinkPreviewTypeAudio)type).audio.albumCoverThumbnail:null;
        return thumb==null?null:thumbnail(thumb,"Vista previa del enlace");
    }
    JSONObject preview(JSONObject file,TdApi.Thumbnail thumb,TdApi.Minithumbnail mini)throws Exception{if(file==null)return null;if(thumb!=null){JSONObject image=thumbnail(thumb,"Miniatura");if(image!=null)file.put("thumbnail",image);}if(mini!=null&&mini.data!=null&&mini.data.length<=16384)file.put("minithumbnail","data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(mini.data));return file;}
    private void protect(JSONObject file)throws Exception{media.protect(file.getInt("id"));JSONObject thumb=file.optJSONObject("thumbnail");if(thumb!=null)media.protect(thumb.getInt("id"));}
    static String contentCaption(TdApi.MessageContent content){TdApi.Message message=new TdApi.Message();message.content=content;return TdSession.text(message,null);}
    String caption(TdApi.Message message){
        if(message==null)return "";if(message.selfDestructType!=null||message.ephemeralContent!=null)return "Contenido temporal · ábrelo en Telegram oficial";
        String service=ServiceMessages.text(message,session);if(service!=null)return service;
        TdApi.MessageContent c=message.content;if(c instanceof TdApi.MessageText)return ((TdApi.MessageText)c).text.text;
        if(c instanceof TdApi.MessagePhoto)return ((TdApi.MessagePhoto)c).caption.text;if(c instanceof TdApi.MessageVideo)return ((TdApi.MessageVideo)c).caption.text;if(c instanceof TdApi.MessageAnimation)return ((TdApi.MessageAnimation)c).caption.text;if(c instanceof TdApi.MessageDocument)return ((TdApi.MessageDocument)c).caption.text;if(c instanceof TdApi.MessageAudio)return ((TdApi.MessageAudio)c).caption.text;if(c instanceof TdApi.MessagePaidMedia)return ((TdApi.MessagePaidMedia)c).caption.text;if(c instanceof TdApi.MessageSticker)return ((TdApi.MessageSticker)c).sticker.emoji;if(c instanceof TdApi.MessageGift)return "Regalo de Telegram";if(c instanceof TdApi.MessageVoiceNote)return "Nota de voz";if(c instanceof TdApi.MessagePoll)return "Encuesta · "+limit(((TdApi.MessagePoll)c).poll==null||((TdApi.MessagePoll)c).poll.question==null?"":((TdApi.MessagePoll)c).poll.question.text,160);return TdSession.text(message,session);
    }
    static String pollRestriction(TdApi.PollVoteRestrictionReason reason){
        if(reason instanceof TdApi.PollVoteRestrictionReasonClosed)return "La encuesta está cerrada.";
        if(reason instanceof TdApi.PollVoteRestrictionReasonYetUnsent)return "La encuesta aún no se ha enviado.";
        if(reason instanceof TdApi.PollVoteRestrictionReasonScheduled)return "La encuesta está programada.";
        if(reason instanceof TdApi.PollVoteRestrictionReasonCountryRestricted)return "Tu país no puede participar en esta encuesta.";
        if(reason instanceof TdApi.PollVoteRestrictionReasonMembershipRequired)return "Debes llevar más de un día en el chat para votar.";
        return "No puedes votar en esta encuesta.";
    }
    static TdApi.FormattedText formatted(TdApi.MessageContent content){
        if(content instanceof TdApi.MessageText)return ((TdApi.MessageText)content).text;
        if(content instanceof TdApi.MessagePhoto)return ((TdApi.MessagePhoto)content).caption;
        if(content instanceof TdApi.MessageVideo)return ((TdApi.MessageVideo)content).caption;
        if(content instanceof TdApi.MessageAnimation)return ((TdApi.MessageAnimation)content).caption;
        if(content instanceof TdApi.MessageDocument)return ((TdApi.MessageDocument)content).caption;
        if(content instanceof TdApi.MessageAudio)return ((TdApi.MessageAudio)content).caption;
        if(content instanceof TdApi.MessagePaidMedia)return ((TdApi.MessagePaidMedia)content).caption;
        return null;
    }
    static JSONArray entities(TdApi.FormattedText formatted){
        JSONArray result=new JSONArray();if(formatted==null||formatted.entities==null)return result;
        for(TdApi.TextEntity entity:formatted.entities){
            if(entity==null||entity.offset<0||entity.length<=0)continue;
            TdApi.TextEntityType kind=entity.type;
            String type=kind instanceof TdApi.TextEntityTypeBold?"bold":kind instanceof TdApi.TextEntityTypeItalic?"italic":kind instanceof TdApi.TextEntityTypeUnderline?"underline":kind instanceof TdApi.TextEntityTypeStrikethrough?"strikethrough":kind instanceof TdApi.TextEntityTypeSpoiler?"spoiler":kind instanceof TdApi.TextEntityTypeCode?"code":kind instanceof TdApi.TextEntityTypePreCode?"preCode":kind instanceof TdApi.TextEntityTypePre?"pre":kind instanceof TdApi.TextEntityTypeExpandableBlockQuote?"expandableBlockquote":kind instanceof TdApi.TextEntityTypeBlockQuote?"blockquote":kind instanceof TdApi.TextEntityTypeTextUrl||kind instanceof TdApi.TextEntityTypeUrl?"link":kind instanceof TdApi.TextEntityTypeMention?"mention":kind instanceof TdApi.TextEntityTypeMentionName?"mentionName":kind instanceof TdApi.TextEntityTypeHashtag?"hashtag":kind instanceof TdApi.TextEntityTypeCashtag?"cashtag":kind instanceof TdApi.TextEntityTypeBotCommand?"botCommand":kind instanceof TdApi.TextEntityTypeEmailAddress?"email":kind instanceof TdApi.TextEntityTypePhoneNumber?"phone":kind instanceof TdApi.TextEntityTypeBankCardNumber?"bankCard":kind instanceof TdApi.TextEntityTypeTonAddress?"tonAddress":kind instanceof TdApi.TextEntityTypeCustomEmoji?"customEmoji":kind instanceof TdApi.TextEntityTypeMediaTimestamp?"mediaTimestamp":kind instanceof TdApi.TextEntityTypeDateTime?"dateTime":null;
            if(type==null)continue;
            try{JSONObject item=new JSONObject().put("type",type).put("offset",entity.offset).put("length",entity.length);
                if(kind instanceof TdApi.TextEntityTypeTextUrl)item.put("url",limit(((TdApi.TextEntityTypeTextUrl)kind).url,2048));
                else if(kind instanceof TdApi.TextEntityTypeUrl&&formatted.text!=null&&entity.offset+entity.length<=formatted.text.length())item.put("url",limit(formatted.text.substring(entity.offset,entity.offset+entity.length),2048));
                else if(kind instanceof TdApi.TextEntityTypeMentionName)item.put("userId",String.valueOf(((TdApi.TextEntityTypeMentionName)kind).userId));
                else if(kind instanceof TdApi.TextEntityTypeCustomEmoji)item.put("customEmojiId",String.valueOf(((TdApi.TextEntityTypeCustomEmoji)kind).customEmojiId));
                else if(kind instanceof TdApi.TextEntityTypeMediaTimestamp)item.put("mediaTimestamp",((TdApi.TextEntityTypeMediaTimestamp)kind).mediaTimestamp);
                else if(kind instanceof TdApi.TextEntityTypeDateTime){TdApi.TextEntityTypeDateTime date=(TdApi.TextEntityTypeDateTime)kind;item.put("unixTime",date.unixTime);if(date.formattingType instanceof TdApi.DateTimeFormattingTypeRelative)item.put("dateTimeType","relative");else if(date.formattingType instanceof TdApi.DateTimeFormattingTypeAbsolute)item.put("dateTimeType","absolute");}
                else if(kind instanceof TdApi.TextEntityTypePreCode&&((TdApi.TextEntityTypePreCode)kind).language!=null&&!((TdApi.TextEntityTypePreCode)kind).language.isBlank())item.put("language",limit(((TdApi.TextEntityTypePreCode)kind).language,32));
                result.put(item);
            }catch(Exception ignored){}
        }
        return result;
    }
    static JSONObject appearanceDto(SharedPreferences prefs,Context context)throws Exception{
        JSONObject value=new JSONObject().put("theme",prefs.getString("theme","gold")).put("font",prefs.getInt("font",16)).put("compact",prefs.getBoolean("compact",false)).put("typing",prefs.getBoolean("typing",true)).put("enter",prefs.getBoolean("enter",false)).put("fontFamily",prefs.getString("fontFamily","system")).put("wallpaper",prefs.getString("wallpaper","none")).put("auto",prefs.getBoolean("auto",false)).put("navigation","side".equals(prefs.getString("navigation","bar"))?"side":"bar").put("systemDark",Palette.systemDark(context));
        String gestures=prefs.getString("gestures","");
        if(gestures!=null&&!gestures.isEmpty())try{JSONObject parsed=new JSONObject(gestures);value.put("gestures",new JSONObject().put("left",parsed.optString("left","none")).put("right",parsed.optString("right","none")));}catch(Exception ignored){}
        String custom=prefs.getString("customTheme","");
        if(custom!=null&&!custom.isEmpty())try{value.put("custom",new JSONObject(custom));}catch(Exception ignored){}
        JSONArray themes=new JSONArray();
        try{themes=new JSONArray(prefs.getString("customThemes","[]"));}catch(Exception ignored){}
        JSONObject chats=new JSONObject();
        try{chats=new JSONObject(prefs.getString("chatThemes","{}"));}catch(Exception ignored){}
        return value.put("customThemes",themes).put("chatThemes",chats);
    }
    static String limit(String text,int size){return text.length()>size?text.substring(0,size)+"…":text;}
}
