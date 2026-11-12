package cc.webrom.wrgram;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.app.AlertDialog;
import android.database.Cursor;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Origin-restricted UI commands. All account operations stay in native TDLib. */
final class NativeBridge implements TdSession.Listener {
    private final ShellActivity activity;
    private final TdSession session;
    private final AssistantController assistant;
    private final SharedPreferences prefs;
    private final NativeMediaStore media;
    private final NativeSnapshot dto;
    private final NativeCatalog catalog;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Runnable assistantChanged=this::schedule;
    private final Set<String> pending=new HashSet<>();
    private final Map<Long,TdApi.Message> searchResults=new HashMap<>();
    private long searchOwner,searchChat,searchNext;private String searchQuery="",searchFilterKey="";private int searchTopic,searchGeneration;
    private final Map<String,InlineBatch> inlineBatches=new HashMap<>();
    private final Map<String,InlineSelection> inlineSelections=new HashMap<>();
    private final Set<String> openStoryViews=new HashSet<>();
    private final Map<String,Attachment> attachments=new HashMap<>();
    private final Map<String,PendingStarsPayment> starsPayments=new HashMap<>();
    private JavaScriptReplyProxy events;
    private boolean attached,destroyed,scheduled;
    private boolean chatsDirty=true,messagesDirty=true;
    private long account;
    private Answer picking,exporting;
    private Answer albumPicking;
    private Answer profilePhotoPicking;
    private Answer storyPicking;
    private Answer contactsImportAnswer;
    private Answer contactSyncPending,contactSyncNowAnswer;
    private boolean contactSyncRunning;
    private long contactSyncOwner;
    private Runnable contactSyncTrigger;
    private Answer locationAnswer;
    private long locationChat;
    private TdApi.Message locationSource;
    private long locationReply;
    private boolean locationSilent;
    private Answer voiceAnswer;
    private android.media.MediaRecorder voiceRecorder;
    private File voiceFile;
    private long voiceStartedAt,voiceOwner,voiceChat;
    private boolean voiceAutoStopped;
    private final java.util.ArrayList<Integer> voiceLevels=new java.util.ArrayList<>();
    private final Runnable voiceSampler=new Runnable(){@Override public void run(){android.media.MediaRecorder recorder=voiceRecorder;if(recorder==null)return;if(SystemClock.elapsedRealtime()-voiceStartedAt>=60_000L){voiceAutoStopped=true;stopVoiceRecorder();schedule();return;}try{int amplitude=recorder.getMaxAmplitude();if(voiceLevels.size()<600)voiceLevels.add(amplitude);}catch(RuntimeException ignored){}main.postDelayed(this,100);}};
    private Answer videoNotePicking;
    private File exportFile;
    private File profilePhotoFile;
    private File storyPhotoFile;
    private Bitmap storyPhotoPreview;
    private File storyVideoFile;
    private Bitmap storyVideoPreview;
    private double storyVideoDuration;
    private boolean storyVideoSilent,storyVideoPicking;
    private static final class Attachment {File path;String name,mime;long size,account,chat;boolean voice,videoNote;int voiceDuration,videoLength;byte[] waveform;}
    private static final class PendingStarsPayment {final long owner,chatId,messageId,formId,amount,expiresAt;final String title,description,seller;final boolean test,subscription;final int period;PendingStarsPayment(long owner,long chatId,long messageId,long formId,long amount,String title,String description,String seller,boolean test,boolean subscription,int period){this.owner=owner;this.chatId=chatId;this.messageId=messageId;this.formId=formId;this.amount=amount;this.title=title;this.description=description;this.seller=seller;this.test=test;this.subscription=subscription;this.period=period;this.expiresAt=SystemClock.elapsedRealtime()+120_000;}}
    private static final class InlineBatch {final long owner,originChatId,chatId,botId;final TdApi.MessageTopic topic;final TdApi.TargetChatTypes allowedTypes;final String botName,targetChat,query;long queryId,expiresAt;String nextOffset;final ArrayList<TdApi.InlineQueryResult> results=new ArrayList<>();InlineBatch(long owner,long originChatId,long chatId,long botId,TdApi.MessageTopic topic,TdApi.TargetChatTypes allowedTypes,String botName,String targetChat,String query,TdApi.InlineQueryResults values){this.owner=owner;this.originChatId=originChatId;this.chatId=chatId;this.botId=botId;this.topic=topic;this.allowedTypes=allowedTypes;this.botName=botName;this.targetChat=targetChat;this.query=query;append(values);}void append(TdApi.InlineQueryResults values){queryId=values.inlineQueryId;nextOffset=values.nextOffset;expiresAt=SystemClock.elapsedRealtime()+60_000;if(values.results!=null)for(TdApi.InlineQueryResult item:values.results)if(results.size()<30)results.add(item);if(results.size()>=30)nextOffset="";}}
    private static final class InlineSelection {final long owner,originChatId,messageId,botId;final int row,column;final String query,botName;final TdApi.TargetChatTypes types;final TdApi.MessageTopic originTopic;final long expiresAt;InlineSelection(long owner,long originChatId,long messageId,int row,int column,long botId,String query,String botName,TdApi.TargetChatTypes types,TdApi.MessageTopic originTopic){this.owner=owner;this.originChatId=originChatId;this.messageId=messageId;this.row=row;this.column=column;this.botId=botId;this.query=query;this.botName=botName;this.types=types;this.originTopic=originTopic;this.expiresAt=SystemClock.elapsedRealtime()+60_000;}}
    private static final Set<String> ACCESS_METHODS=new HashSet<>(Arrays.asList("state","access.countries","access.declare","access.terms","access.privacy","app.background"));
    NativeBridge(ShellActivity activity,WebView ignored){this.activity=activity;WrgramApplication app=(WrgramApplication)activity.getApplication();session=app.telegram();assistant=app.assistant();prefs=activity.getSharedPreferences("appearance",0);media=new NativeMediaStore(activity,session);dto=new NativeSnapshot(session,media,prefs,assistant);catalog=new NativeCatalog(session,dto);account=session.selfId;contactSyncTrigger=()->{if(attached&&!destroyed&&currentAccount()&&session.ready()&&contactSyncEnabled(session.selfId)&&hasContactsPermission())syncContactsNow(error->{});};}
    boolean currentAccount(){return session==((WrgramApplication)activity.getApplication()).telegram();}
    void attach(){if(!currentAccount())return;attached=true;chatsDirty=true;messagesDirty=true;session.observe(this);assistant.observe(assistantChanged);if(((WrgramApplication)activity.getApplication()).ageAccess().allowed())session.onForeground();if(session.ready()&&contactSyncEnabled(session.selfId))armContactSync();schedule();}
    void detach(){if(!((WrgramApplication)activity.getApplication()).ageAccess().allowed())activity.clearSensitiveGateFields();attached=false;main.removeCallbacks(contactSyncTrigger);session.unobserve(this);assistant.unobserve(assistantChanged);session.stopTyping();cancelVoiceRecording();}
    private void armContactSync(){main.removeCallbacks(contactSyncTrigger);main.postDelayed(contactSyncTrigger,8000);}
    void destroy(){cancelVoiceRecording();if(videoNotePicking!=null)videoNotePicking.fail("La app se cerró; no se envió el videomensaje.");videoNotePicking=null;if(locationAnswer!=null)locationAnswer.fail("La app se cerró; no se compartió ninguna ubicación.");if(profilePhotoPicking!=null)profilePhotoPicking.fail("La app se cerró; no se cambió la foto.");locationAnswer=null;locationSource=null;profilePhotoPicking=null;if(storyPicking!=null)storyPicking.fail("La app se cerró; no se publicó ninguna historia.");storyPicking=null;if(albumPicking!=null)albumPicking.fail("La app se cerró; no se envió el álbum.");albumPicking=null;if(contactsImportAnswer!=null)contactsImportAnswer.fail("La app se cerró; no se importaron contactos.");contactsImportAnswer=null;if(contactSyncPending!=null)contactSyncPending.fail("La app se cerró; no se activó la sincronización de agenda.");contactSyncPending=null;if(contactSyncNowAnswer!=null)contactSyncNowAnswer.fail("La app se cerró; no se sincronizó la agenda.");contactSyncNowAnswer=null;discardStoryDraft();deleteProfilePhotoFile();starsPayments.clear();destroyed=true;main.removeCallbacksAndMessages(null);events=null;media.clear();catalog.clear();inlineBatches.clear();inlineSelections.clear();clearUnsent();}
    @Override public void changed(String kind){syncAccount();if(kind.equals("chats"))chatsDirty=true;if(kind.equals("messages")||kind.startsWith("history"))messagesDirty=true;if(kind.equals("selected")||kind.equals("auth")||kind.equals("account")){chatsDirty=true;messagesDirty=true;}if(kind.equals("auth")&&session.ready()&&contactSyncEnabled(session.selfId))armContactSync();schedule();}
    private void syncAccount(){if(account==session.selfId)return;account=session.selfId;chatsDirty=true;messagesDirty=true;media.clear();catalog.clear();searchResults.clear();inlineBatches.clear();inlineSelections.clear();openStoryViews.clear();starsPayments.clear();clearUnsent();if(account==0)assistant.clear();}
    private static void post(JavaScriptReplyProxy proxy,String value){if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))proxy.postMessage(value);}
    void refreshAccessGate(){chatsDirty=true;messagesDirty=true;schedule();}
    void updateChanged(){schedule();}
    private JSONObject bridgeState(boolean includeChats,boolean includeMessages)throws Exception{if(((WrgramApplication)activity.getApplication()).ageAccess().allowed()){JSONObject value=dto.state(includeChats,includeMessages);value.put("update",activity.playUpdateStatus());value.put("contactsSync",contactSyncStatus());value.put("voiceAutoStopped",voiceAutoStopped);return value;}return object("ready",false,"auth","age","consent",false,"busy",false,"connection","Sin conectar","online",false,"error","","notice","","version",BuildConfig.VERSION_NAME,"selfId","0","name","","active","0","canSend",false,"sending",false,"uncertain",false,"chatsBusy",false,"chats",new JSONArray(),"messages",new JSONArray(),"folders",new JSONArray(),"history",object("loading",false,"error","","end",false,"latest",true),"appearance",NativeSnapshot.appearanceDto(prefs,activity),"permissions",object("notes",false,"replies",false),"assistant",object("state","Sin comprobar","ready",false,"busy",false,"consent",false,"error","","turns",new JSONArray()),"security",AppLock.status(activity),"access",session.accessState(),"wallet",object("stars",0,"nanostars",0,"premium",false));}
    private void schedule(){
        if(scheduled||destroyed||!currentAccount())return;
        scheduled=true;
        main.postDelayed(()->{
            scheduled=false;
            if(!attached||events==null||!currentAccount())return;
            try{
                syncAccount();
                JSONObject state=bridgeState(chatsDirty,messagesDirty);
                post(events,object("event","state","state",state).toString());
                chatsDirty=false;
                messagesDirty=false;
            }catch(Exception error){
                android.util.Log.w("WRGram", "Estado de interfaz no entregado: "+error.getClass().getSimpleName());
            }
        },100);
    }
    private static JSONObject object(Object...pairs){try{JSONObject value=new JSONObject();for(int i=0;i<pairs.length;i+=2)value.put((String)pairs[i],pairs[i+1]);return value;}catch(Exception ignored){throw new IllegalArgumentException("Invalid DTO");}}
    private final class Answer {
        final String id;final JavaScriptReplyProxy proxy;boolean finished;final long owner;
        Answer(String id,JavaScriptReplyProxy proxy){this.id=id;this.proxy=proxy;owner=session.selfId;}
        void ok(Object result){finish(result,null);}
        void fail(String error){finish(null,error);}
        void finish(Object result,String error){if(finished)return;finished=true;pending.remove(id);if(destroyed||!currentAccount())return;try{post(proxy,object("id",id,"result",result==null?JSONObject.NULL:result,"error",error==null?JSONObject.NULL:error).toString());}catch(Exception ignored){}}
    }
    private interface LinkSink {void ok(JSONObject value);void fail(String error);}
    void receive(String raw,JavaScriptReplyProxy proxy){
        if(destroyed||!attached||!currentAccount()||raw==null||raw.length()>BridgePolicy.MAX_BYTES)return;
        if(!activity.requireAccess())return;
        Answer answer=null;
        try{
            JSONObject envelope=new JSONObject(raw);BridgePolicy.envelope(envelope);String id=envelope.getString("id");if(pending.contains(id))return;if(pending.size()>=32){new Answer(id,proxy).fail("Hay demasiadas solicitudes pendientes. Espera un momento y reintenta.");return;}pending.add(id);answer=new Answer(id,proxy);events=proxy;syncAccount();String method=envelope.getString("method");if(!((WrgramApplication)activity.getApplication()).ageAccess().allowed()&&!ACCESS_METHODS.contains(method)){answer.fail("Completa primero la comprobación regional de edad y residencia.");return;}dispatch(method,envelope.getJSONObject("params"),answer);
        }catch(Exception ignored){if(answer!=null)answer.fail("Solicitud no válida o función no disponible.");}
    }
    private void requireAccount(){if(!currentAccount()||!session.ready()||session.selfId<=0)throw new IllegalArgumentException("Account required");}
    private static TdApi.MessageSendOptions sendOptions(JSONObject p){
        boolean silent=p.optBoolean("silent");
        String raw=p.optString("schedule","");
        long schedule=raw.equals("online")?0:p.optLong("schedule",0);
        if(!silent&&schedule==0&&!raw.equals("online"))return null;
        TdApi.MessageSendOptions options=new TdApi.MessageSendOptions();options.disableNotification=silent;
        if(raw.equals("online"))options.schedulingState=new TdApi.MessageSchedulingStateSendWhenOnline();
        else if(schedule!=0){long now=System.currentTimeMillis()/1000;if(schedule<now+5||schedule>now+367L*86400L)throw new IllegalArgumentException("Elige una hora entre ahora y los próximos 367 días.");TdApi.MessageSchedulingStateSendAtDate at=new TdApi.MessageSchedulingStateSendAtDate();at.sendDate=(int)schedule;options.schedulingState=at;}
        return options;
    }
    private static TdApi.SearchMessagesFilter messageFilter(String key){
        switch(key){
            case "":return null;
            case "photos":return new TdApi.SearchMessagesFilterPhoto();
            case "videos":return new TdApi.SearchMessagesFilterVideo();
            case "photoVideo":return new TdApi.SearchMessagesFilterPhotoAndVideo();
            case "documents":return new TdApi.SearchMessagesFilterDocument();
            case "audio":return new TdApi.SearchMessagesFilterAudio();
            case "voice":return new TdApi.SearchMessagesFilterVoiceNote();
            case "videoNotes":return new TdApi.SearchMessagesFilterVideoNote();
            case "animations":return new TdApi.SearchMessagesFilterAnimation();
            case "links":return new TdApi.SearchMessagesFilterUrl();
            case "polls":return new TdApi.SearchMessagesFilterPoll();
            case "mentions":return new TdApi.SearchMessagesFilterMention();
            default:throw new IllegalArgumentException("Filtro de búsqueda no válido.");
        }
    }
    private void scheduledList(JSONObject p,Answer a){
        requireAccount();long chat=BridgePolicy.id(p,"id");
        perform(new TdApi.GetChatScheduledMessages(chat),a,result->{
            if(session.activeChat!=chat){a.fail("La conversación cambió.");return;}
            try{JSONArray values=new JSONArray();if(result.messages!=null)for(TdApi.Message message:result.messages)values.put(dto.message(message));a.ok(values);}catch(Exception ignored){a.fail("No se pudieron preparar los mensajes programados.");}
        });
    }
    private void scheduledSchedule(JSONObject p,Answer a,boolean now){
        requireAccount();long chat=BridgePolicy.id(p,"id"),messageId=BridgePolicy.id(p,"messageId");
        boolean online=p.optBoolean("online");
        long at=p.optLong("at",0),seconds=System.currentTimeMillis()/1000;
        if(!now&&!online&&(at<seconds+5||at>seconds+367L*86400L)){
            throw new IllegalArgumentException("Elige una hora entre ahora y los próximos 367 días.");
        }
        withScheduledMessage(chat,messageId,a,message->{
            if(message.schedulingState instanceof TdApi.MessageSchedulingStateSendAtDate
                    &&((TdApi.MessageSchedulingStateSendAtDate)message.schedulingState).repeatPeriod>0){
                a.fail("Gestiona la fecha o el envío inmediato de los mensajes recurrentes en Telegram.");
                return;
            }
            TdApi.MessageSchedulingState state=null;
            if(!now)state=online?new TdApi.MessageSchedulingStateSendWhenOnline():new TdApi.MessageSchedulingStateSendAtDate((int)at,0);
            perform(new TdApi.EditMessageSchedulingState(chat,messageId,state),a,ignored->{schedule();a.ok(true);});
        });
    }
    private void scheduledDelete(JSONObject p,Answer a){
        requireAccount();long chat=BridgePolicy.id(p,"id"),messageId=BridgePolicy.id(p,"messageId");
        withScheduledMessage(chat,messageId,a,message->
                perform(new TdApi.DeleteMessages(chat,new long[]{messageId},true),a,ignored->{schedule();a.ok(true);}));
    }
    private void withScheduledMessage(long chat,long messageId,Answer a,java.util.function.Consumer<TdApi.Message> action){
        if(session.activeChat!=chat){a.fail("La conversación cambió.");return;}
        perform(new TdApi.GetChatScheduledMessages(chat),a,result->{
            if(session.activeChat!=chat){a.fail("La conversación cambió.");return;}
            if(result.messages!=null)for(TdApi.Message message:result.messages){
                if(message!=null&&message.chatId==chat&&message.id==messageId&&message.schedulingState!=null){
                    action.accept(message);
                    return;
                }
            }
            a.fail("Ese mensaje ya no está programado. Actualiza la lista de envíos.");
        });
    }
    private static JSONObject passwordDto(TdApi.PasswordState state)throws Exception{
        return object("hasPassword",state.hasPassword,"hint",state.passwordHint==null?"":NativeSnapshot.limit(state.passwordHint,64),"hasRecoveryEmail",state.hasRecoveryEmailAddress,"hasPassport",state.hasPassportData,"pendingReset",state.pendingResetDate);
    }
    private void passwordState(Answer a){
        perform(new TdApi.GetPasswordState(),a,state->{try{a.ok(passwordDto(state));}catch(Exception ignored){a.fail("No se pudo leer la contraseña de dos pasos.");}});
    }
    private void passwordSet(JSONObject p,Answer a){
        String current=BridgePolicy.text(p,"current",256),next=BridgePolicy.text(p,"next",256),hint=BridgePolicy.text(p,"hint",64).trim();
        if(next.isEmpty()&&!p.optBoolean("confirmRemove")){a.fail("Confirma que quieres quitar la contraseña de dos pasos.");return;}
        perform(new TdApi.SetPassword(current,next,hint,false,""),a,state->{try{a.ok(passwordDto(state));}catch(Exception ignored){a.fail("Telegram cambió la contraseña, pero no se pudo leer el nuevo estado.");}});
    }
    private void storyReactions(Answer a){
        requireAccount();
        perform(new TdApi.GetStoryAvailableReactions(20),a,available->{
            try{
                JSONObject result=object("top",reactionList(available.topReactions),"recent",reactionList(available.recentReactions),"allowCustom",available.allowCustomEmoji);
                if(available.unavailabilityReason!=null)result.put("restriction",available.unavailabilityReason instanceof TdApi.ReactionUnavailabilityReasonAnonymousAdministrator?"Los administradores anónimos no pueden reaccionar.":available.unavailabilityReason instanceof TdApi.ReactionUnavailabilityReasonGuest?"Los invitados no pueden reaccionar.":available.unavailabilityReason instanceof TdApi.ReactionUnavailabilityReasonRestricted?"Telegram restringió las reacciones en esta historia.":"No se puede reaccionar a esta historia.");
                a.ok(result);
            }catch(Exception ignored){a.fail("No se pudieron preparar las reacciones de la historia.");}
        });
    }
    private static JSONArray reactionList(TdApi.AvailableReaction[] source)throws Exception{
        JSONArray result=new JSONArray();if(source==null)return result;
        for(TdApi.AvailableReaction reaction:source){
            if(reaction==null)continue;JSONObject item=reactionDto(reaction.type);if(item==null)continue;item.put("needsPremium",reaction.needsPremium);result.put(item);
        }
        return result;
    }
    private static JSONObject reactionDto(TdApi.ReactionType type)throws Exception{
        if(type instanceof TdApi.ReactionTypeEmoji)return object("kind","emoji","emoji",((TdApi.ReactionTypeEmoji)type).emoji);
        if(type instanceof TdApi.ReactionTypeCustomEmoji)return object("kind","custom","customEmojiId",String.valueOf(((TdApi.ReactionTypeCustomEmoji)type).customEmojiId));
        return null;
    }
    private void storyReact(JSONObject p,Answer a){
        requireAccount();long chatId=BridgePolicy.id(p,"id");int storyId=p.optInt("storyId");
        boolean remove=p.optBoolean("remove");String emoji=BridgePolicy.text(p,"emoji",32),custom=BridgePolicy.text(p,"customEmojiId",20);
        TdApi.ReactionType type=null;
        if(!remove){
            if(!custom.isEmpty()){if(!custom.matches("[0-9]{1,19}"))throw new IllegalArgumentException();type=new TdApi.ReactionTypeCustomEmoji(Long.parseLong(custom));}
            else if(!emoji.isEmpty())type=new TdApi.ReactionTypeEmoji(emoji);
            else throw new IllegalArgumentException("Elige una reacción.");
        }
        final TdApi.ReactionType reaction=type;
        perform(new TdApi.GetStory(chatId,storyId,false),a,story->perform(new TdApi.SetStoryReaction(story.posterChatId,storyId,reaction,true),a,ignored->{schedule();a.ok(true);}));
    }
    private void storyInteractions(JSONObject p,Answer a){
        requireAccount();long chatId=BridgePolicy.id(p,"id");int storyId=p.optInt("storyId");
        String query=p.has("query")?BridgePolicy.text(p,"query",80):"",offset=p.has("offset")?BridgePolicy.text(p,"offset",200):"";
        boolean contacts=p.optBoolean("contacts"),reactions=p.optBoolean("reactions");
        perform(new TdApi.GetStoryInteractions(storyId,query,contacts,false,reactions,offset,50),a,result->{
            try{
                JSONArray items=new JSONArray();if(result.interactions!=null)for(TdApi.StoryInteraction interaction:result.interactions){
                    JSONObject item=object("name",session.senderName(interaction.actorId),"date",interaction.interactionDate);
                    if(interaction.type instanceof TdApi.StoryInteractionTypeView){item.put("type","view");JSONObject reaction=reactionDto(((TdApi.StoryInteractionTypeView)interaction.type).chosenReactionType);if(reaction!=null){item.put("emoji",reaction.optString("emoji",""));item.put("customEmojiId",reaction.optString("customEmojiId",""));}}
                    else if(interaction.type instanceof TdApi.StoryInteractionTypeForward)item.put("type","forward");
                    else if(interaction.type instanceof TdApi.StoryInteractionTypeRepost)item.put("type","repost");
                    else item.put("type","view");
                    items.put(item);
                }
                a.ok(object("total",result.totalCount,"forwards",result.totalForwardCount,"reactions",result.totalReactionCount,"next",result.nextOffset==null?"":result.nextOffset,"items",items));
            }catch(Exception ignored){a.fail("No se pudieron preparar las interacciones de la historia.");}
        });
    }
    private void emojiStatusState(Answer a){
        requireAccount();
        perform(new TdApi.GetUser(session.selfId),a,user->{
            try{
                JSONObject value=object("premium",user.isPremium,"customEmojiId","0","expiration",0);
                JSONObject mark=NativeSnapshot.emojiStatus(user);
                if(mark!=null)value.put("customEmojiId",mark.getString("customEmojiId")).put("expiration",mark.getInt("expiration"));
                a.ok(value);
            }catch(Exception ignored){a.fail("No se pudo leer el estado emoji.");}
        });
    }
    private void emojiStatusOptions(Answer a){
        requireAccount();java.util.LinkedHashMap<Long,Integer> ids=new java.util.LinkedHashMap<>();
        loadEmojiStatuses(0,ids,()->emojiStatusMedia(ids,a),a);
    }
    private void loadEmojiStatuses(int step,java.util.LinkedHashMap<Long,Integer> ids,Runnable done,Answer a){
        if(step==0)session.perform(new TdApi.GetDefaultEmojiStatuses(),value->{addEmojiStatusIds(ids,value.customEmojiIds,null);loadEmojiStatuses(1,ids,done,a);},error->loadEmojiStatuses(1,ids,done,a));
        else if(step==1)session.perform(new TdApi.GetThemedEmojiStatuses(),value->{addEmojiStatusIds(ids,value.customEmojiIds,null);loadEmojiStatuses(2,ids,done,a);},error->loadEmojiStatuses(2,ids,done,a));
        else if(step==2)session.perform(new TdApi.GetRecentEmojiStatuses(),value->{if(value.emojiStatuses!=null)for(TdApi.EmojiStatus status:value.emojiStatuses)if(status.type instanceof TdApi.EmojiStatusTypeCustomEmoji)ids.put(((TdApi.EmojiStatusTypeCustomEmoji)status.type).customEmojiId,status.expirationDate);loadEmojiStatuses(3,ids,done,a);},error->loadEmojiStatuses(3,ids,done,a));
        else done.run();
    }
    private static void addEmojiStatusIds(java.util.LinkedHashMap<Long,Integer> ids,long[] source,Integer expiration){
        if(source==null)return;for(long id:source)if(id!=0&&ids.size()<200&&!ids.containsKey(id))ids.put(id,expiration==null?0:expiration);
    }
    private void emojiStatusMedia(java.util.LinkedHashMap<Long,Integer> ids,Answer a){
        if(ids.isEmpty()){a.ok(new JSONArray());return;}
        long[] list=new long[Math.min(ids.size(),200)];int index=0;for(long id:ids.keySet()){if(index==list.length)break;list[index++]=id;}
        session.perform(new TdApi.GetCustomEmojiStickers(list),sticks->{
            try{java.util.HashMap<Long,TdApi.Sticker> media=new java.util.HashMap<>();if(sticks.stickers!=null)for(TdApi.Sticker sticker:sticks.stickers)if(customEmojiId(sticker)>0)media.put(customEmojiId(sticker),sticker);a.ok(emojiStatusDtos(ids,media));}catch(Exception ignored){a.fail("No se pudieron preparar los estados emoji.");}
        },error->{try{a.ok(emojiStatusDtos(ids,new java.util.HashMap<>()));}catch(Exception ignored){a.fail("No se pudieron preparar los estados emoji.");}});
    }
    private JSONArray emojiStatusDtos(java.util.LinkedHashMap<Long,Integer> ids,java.util.Map<Long,TdApi.Sticker> media)throws Exception{
        JSONArray result=new JSONArray();
        for(java.util.Map.Entry<Long,Integer> entry:ids.entrySet()){
            JSONObject item=object("id",String.valueOf(entry.getKey()),"expiration",entry.getValue()==null?0:entry.getValue());
            TdApi.Sticker sticker=media.get(entry.getKey());if(sticker!=null){JSONObject file=dto.sticker(sticker);if(file!=null)item.put("media",file);item.put("emoji",sticker.emoji);}
            result.put(item);
        }
        return result;
    }
    private void emojiStatusSet(JSONObject p,Answer a){
        requireAccount();
        String id=BridgePolicy.text(p,"id",20);
        if(!id.matches("0|[1-9][0-9]{0,18}"))throw new IllegalArgumentException("Estado emoji no válido.");
        TdApi.EmojiStatus status=null;
        if(!"0".equals(id)){
            int expiration=p.optInt("expiration",0),now=(int)(System.currentTimeMillis()/1000);
            if(expiration!=0&&(expiration<now+60||expiration>now+367L*86400L))throw new IllegalArgumentException("La caducidad debe estar entre un minuto y 367 días.");
            status=new TdApi.EmojiStatus(new TdApi.EmojiStatusTypeCustomEmoji(Long.parseLong(id)),expiration);
        }
        TdApi.EmojiStatus selected=status;
        perform(new TdApi.GetUser(a.owner),a,user->{
            if(!user.isPremium){a.fail("Necesitas Telegram Premium para cambiar el estado emoji.");return;}
            perform(new TdApi.SetEmojiStatus(selected),a,ignored->{schedule();a.ok(true);});
        });
    }
    private TdApi.Chat target(JSONObject p){requireAccount();TdApi.Chat chat=session.chat(BridgePolicy.id(p,"id"));if(chat==null)throw new IllegalArgumentException("Unknown chat");return chat;}
    private TdApi.Message message(JSONObject p){requireAccount();long id=BridgePolicy.id(p,"id");TdApi.Message message=session.message(id);if(message==null)message=searchResults.get(id);if(message==null||message.chatId!=session.activeChat)throw new IllegalArgumentException("Unknown message");return message;}
    private static String storyKey(long chatId,int storyId){return chatId+":"+storyId;}
    private void chatStories(JSONObject p,Answer answer){TdApi.Chat chat=target(p);if(chat.type instanceof TdApi.ChatTypeSecret){answer.fail("Los chats secretos no tienen historias compartidas en esta versión.");return;}if(p.optBoolean("posted")){
        perform(new TdApi.GetChatPostedToChatPageStories(chat.id,0,30),answer,value->{
            JSONArray items=new JSONArray();
            if(value.stories!=null)for(TdApi.Story story:value.stories)items.put(object("id",story.id,"date",story.date));
            answer.ok(items);
        });return;
    }perform(new TdApi.GetChatActiveStories(chat.id),answer,value->{try{JSONArray items=new JSONArray();if(value.stories!=null)for(TdApi.StoryInfo info:value.stories)items.put(object("id",info.storyId,"date",info.date,"closeFriends",info.isForCloseFriends,"live",info.isLive));answer.ok(items);}catch(Exception ignored){answer.fail("No se pudieron preparar las historias.");}});}
    private void openStory(JSONObject p,Answer answer)throws Exception{requireAccount();long chatId=BridgePolicy.id(p,"id");int storyId=p.optInt("storyId");TdApi.Chat chat=session.chat(chatId);if(chat==null||chat.type instanceof TdApi.ChatTypeSecret)throw new IllegalArgumentException();perform(new TdApi.GetStory(chatId,storyId,false),answer,story->{try{JSONObject file=dto.storyMedia(story);if(file==null){answer.fail("Este formato de historia todavía no está disponible.");return;}String caption=story.caption==null||story.caption.text==null?"":NativeSnapshot.limit(story.caption.text,1000);perform(new TdApi.OpenStory(chatId,storyId),answer,ignored->{openStoryViews.add(storyKey(chatId,storyId));answer.ok(object("id",storyId,"chatId",Long.toString(chatId),"posterChatId",Long.toString(story.posterChatId),"caption",caption,"media",file,"canEdit",story.canBeEdited,"canDelete",story.canBeDeleted,"canToggleProfile",story.canToggleIsPostedToChatPage,"isPostedToChatPage",story.isPostedToChatPage,"canArchive",story.canBeAddedToAlbum));});}catch(Exception ignored){answer.fail("No se pudo abrir la historia.");}});}
    private void closeStory(JSONObject p,Answer answer){requireAccount();long chatId=BridgePolicy.id(p,"id");int storyId=p.optInt("storyId",-1);String key=storyKey(chatId,storyId);if(!openStoryViews.remove(key)){answer.ok(false);return;}perform(new TdApi.CloseStory(chatId,storyId),answer,ignored->answer.ok(true));}
    private void editStoryCaption(JSONObject params,Answer answer)throws Exception{requireAccount();long chatId=BridgePolicy.id(params,"id");int storyId=params.getInt("storyId");String caption=BridgePolicy.text(params,"caption",1024);perform(new TdApi.GetStory(chatId,storyId,false),answer,story->{if(!story.canBeEdited){answer.fail("Telegram no permite editar esta historia.");return;}perform(new TdApi.EditStory(story.posterChatId,storyId,null,null,new TdApi.FormattedText(caption,new TdApi.TextEntity[0])),answer,ignored->{schedule();answer.ok(true);});});}
    private void deleteStory(JSONObject params,Answer answer)throws Exception{requireAccount();long chatId=BridgePolicy.id(params,"id");int storyId=params.getInt("storyId");perform(new TdApi.GetStory(chatId,storyId,false),answer,story->{if(!story.canBeDeleted){answer.fail("Telegram no permite eliminar esta historia.");return;}perform(new TdApi.DeleteStory(story.posterChatId,storyId),answer,ignored->{openStoryViews.remove(storyKey(chatId,storyId));schedule();answer.ok(true);});});}
    private void toggleStoryProfile(JSONObject params,Answer answer)throws Exception{requireAccount();long chatId=BridgePolicy.id(params,"id");int storyId=params.getInt("storyId");boolean keep=params.getBoolean("keep");perform(new TdApi.GetStory(chatId,storyId,false),answer,story->{if(!story.canToggleIsPostedToChatPage){answer.fail("Telegram no permite cambiar la visibilidad de esta historia después de caducar.");return;}perform(new TdApi.ToggleStoryIsPostedToChatPage(story.posterChatId,storyId,keep),answer,ignored->{schedule();answer.ok(true);});});}
    private static int storyAlbumId(JSONObject params)throws Exception{int id=params.getInt("albumId");if(id<=0)throw new IllegalArgumentException("Álbum no válido.");return id;}
    private static String storyAlbumName(JSONObject params)throws Exception{String name=BridgePolicy.text(params,"name",12).trim();if(name.isEmpty())throw new IllegalArgumentException("El álbum necesita un nombre de 1 a 12 caracteres.");return name;}
    private static int[] storyIds(JSONObject params,String key,int maximum)throws Exception{JSONArray raw=params.getJSONArray(key);if(raw.length()<1||raw.length()>maximum)throw new IllegalArgumentException("Selección de historias no válida.");java.util.LinkedHashSet<Integer> unique=new java.util.LinkedHashSet<>();for(int i=0;i<raw.length();i++){int id=raw.getInt(i);if(id>0)unique.add(id);}if(unique.isEmpty())throw new IllegalArgumentException("Selección de historias no válida.");int[] ids=new int[unique.size()];int index=0;for(int id:unique)ids[index++]=id;return ids;}
    private static JSONObject storyAlbumDto(TdApi.StoryAlbum album){return object("id",album.id,"name",NativeSnapshot.limit(album.name==null?"":album.name,24));}
    private void storyAlbums(Answer answer){requireAccount();perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.GetChatStoryAlbums(saved.id),answer,albums->{try{JSONArray values=new JSONArray();if(albums.albums!=null)for(TdApi.StoryAlbum album:albums.albums)values.put(storyAlbumDto(album));answer.ok(values);}catch(Exception ignored){answer.fail("No se pudieron preparar los álbumes de historias.");}}));}
    private void createStoryAlbum(JSONObject params,Answer answer)throws Exception{requireAccount();String name=storyAlbumName(params);perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.CreateStoryAlbum(saved.id,name,new int[0]),answer,album->{schedule();answer.ok(storyAlbumDto(album));}));}
    private void renameStoryAlbum(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);String name=storyAlbumName(params);perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.SetStoryAlbumName(saved.id,albumId,name),answer,album->{schedule();answer.ok(storyAlbumDto(album));}));}
    private void deleteStoryAlbum(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.DeleteStoryAlbum(saved.id,albumId),answer,ignored->{schedule();answer.ok(true);}));}
    private void orderStoryAlbums(JSONObject params,Answer answer)throws Exception{requireAccount();JSONArray raw=params.getJSONArray("albumIds");if(raw.length()<1||raw.length()>50)throw new IllegalArgumentException("Orden de álbumes no válido.");java.util.LinkedHashSet<Integer> unique=new java.util.LinkedHashSet<>();for(int i=0;i<raw.length();i++){int id=raw.getInt(i);if(id>0)unique.add(id);}int[] ids=new int[unique.size()];int index=0;for(int id:unique)ids[index++]=id;if(ids.length<2)throw new IllegalArgumentException("Selecciona al menos dos álbumes.");perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.ReorderStoryAlbums(saved.id,ids),answer,ignored->{schedule();answer.ok(true);}));}
    private void storyAlbumStories(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);int requested=params.optInt("offset",0);int offset=requested<0||requested>5000?0:requested;perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.GetStoryAlbumStories(saved.id,albumId,offset,50),answer,stories->{try{JSONArray values=new JSONArray();if(stories.stories!=null)for(TdApi.Story story:stories.stories)values.put(object("id",story.id,"chatId",Long.toString(saved.id),"date",story.date,"caption",story.caption==null||story.caption.text==null?"":NativeSnapshot.limit(story.caption.text,1000)));int next=offset+values.length();answer.ok(object("stories",values,"nextOffset",next,"hasMore",next<stories.totalCount));}catch(Exception ignored){answer.fail("No se pudieron preparar las historias del álbum.");}}));}
    private void addStoryToAlbum(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);long chatId=BridgePolicy.id(params,"id");int storyId=params.getInt("storyId");if(storyId<=0)throw new IllegalArgumentException("Historia no válida.");perform(new TdApi.GetStory(chatId,storyId,false),answer,story->{if(story.posterChatId!=session.selfId){answer.fail("Solo puedes organizar historias publicadas por esta cuenta.");return;}if(!story.canBeAddedToAlbum){answer.fail("Telegram no permite guardar esta historia en un álbum.");return;}perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.AddStoryAlbumStories(saved.id,albumId,new int[]{storyId}),answer,album->{schedule();answer.ok(storyAlbumDto(album));}));});}
    private void removeStoryFromAlbum(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);int storyId=params.getInt("storyId");if(storyId<=0)throw new IllegalArgumentException("Historia no válida.");perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.RemoveStoryAlbumStories(saved.id,albumId,new int[]{storyId}),answer,album->{schedule();answer.ok(storyAlbumDto(album));}));}
    private void orderStoryAlbumStories(JSONObject params,Answer answer)throws Exception{requireAccount();int albumId=storyAlbumId(params);int[] ids=storyIds(params,"storyIds",200);perform(new TdApi.CreatePrivateChat(session.selfId,false),answer,saved->perform(new TdApi.ReorderStoryAlbumStories(saved.id,albumId,ids),answer,album->{schedule();answer.ok(storyAlbumDto(album));}));}
    private void createPhotoStory(Answer answer){requireAccount();if(storyPicking!=null||storyPhotoFile!=null||storyVideoFile!=null){answer.fail("Ya hay una historia en preparación.");return;}storyVideoPicking=false;storyPicking=answer;try{activity.picker.launch(new String[]{"image/*"});}catch(RuntimeException error){storyPicking=null;answer.fail("No hay un selector de archivos disponible.");}}
    private void createVideoStory(Answer answer){requireAccount();if(storyPicking!=null||storyPhotoFile!=null||storyVideoFile!=null){answer.fail("Ya hay una historia en preparación.");return;}storyVideoPicking=true;storyPicking=answer;try{activity.picker.launch(new String[]{"video/*"});}catch(RuntimeException error){storyPicking=null;storyVideoPicking=false;answer.fail("No hay un selector de archivos disponible.");}}
    private void pickedStoryPhoto(Uri uri,Answer answer){if(uri==null){finishStoryDraft(answer,false,null);return;}long owner=answer.owner;((WrgramApplication)activity.getApplication()).storage().execute(()->{StoryPhotoProcessor.Draft draft=null;try{draft=StoryPhotoProcessor.prepare(activity,uri,new File(session.filesDirectory(),"stories"));StoryPhotoProcessor.Draft ready=draft;draft=null;main.post(()->{if(destroyed||storyPicking!=answer||!currentAccount()||session.selfId!=owner){ready.clear();finishStoryDraft(answer,false,"La cuenta cambió. No se publicó ninguna historia.");return;}storyPhotoFile=ready.file;storyPhotoPreview=ready.preview;prepareStoryAudience(answer,owner);});}catch(Exception ignored){if(draft!=null)draft.clear();main.post(()->finishStoryDraft(answer,false,"No se pudo preparar la imagen de historia. Elige otra foto de hasta 20 MB."));}});}
    private void pickedStoryVideo(Uri uri,Answer answer){if(uri==null){finishStoryDraft(answer,false,null);return;}long owner=answer.owner;((WrgramApplication)activity.getApplication()).storage().execute(()->{VideoStoryProcessor.Draft draft=null;try{draft=VideoStoryProcessor.prepare(activity,uri,new File(session.filesDirectory(),"stories"));VideoStoryProcessor.Draft ready=draft;draft=null;main.post(()->{if(destroyed||storyPicking!=answer||!currentAccount()||session.selfId!=owner){ready.clear();finishStoryDraft(answer,false,"La cuenta cambió. No se publicó ninguna historia.");return;}storyVideoFile=ready.file;storyVideoPreview=ready.preview;storyVideoDuration=ready.duration;storyVideoSilent=ready.silent;prepareStoryAudience(answer,owner);});}catch(Exception ignored){if(draft!=null)draft.clear();main.post(()->finishStoryDraft(answer,false,"No se pudo preparar el vídeo. Elige un MP4 de 1 a 60 segundos y hasta 20 MB."));}});}
    private void prepareStoryAudience(Answer answer,long owner){session.perform(new TdApi.CreatePrivateChat(owner,false),saved->session.perform(new TdApi.CanPostStory(saved.id),allowed->{if(!(allowed instanceof TdApi.CanPostStoryResultOk)){finishStoryDraft(answer,false,storyPostLimit(allowed));return;}showStoryPublishDialog(answer,owner,saved.id);},error->finishStoryDraft(answer,false,error)),error->finishStoryDraft(answer,false,error));}
    private static String storyPostLimit(TdApi.CanPostStoryResult result){if(result instanceof TdApi.CanPostStoryResultPremiumNeeded)return "Telegram indica que hace falta Premium para publicar otra historia.";if(result instanceof TdApi.CanPostStoryResultBoostNeeded)return "Telegram indica que este chat necesita más boosts para publicar historias.";if(result instanceof TdApi.CanPostStoryResultActiveStoryLimitExceeded)return "Alcanzaste el límite de historias activas de Telegram.";if(result instanceof TdApi.CanPostStoryResultWeeklyLimitExceeded)return "Alcanzaste el límite semanal de historias de Telegram.";if(result instanceof TdApi.CanPostStoryResultMonthlyLimitExceeded)return "Alcanzaste el límite mensual de historias de Telegram.";if(result instanceof TdApi.CanPostStoryResultLiveStoryIsActive)return "Termina la historia en vivo antes de publicar otra.";return "Telegram no permite publicar una historia ahora.";}
    private void showStoryPublishDialog(Answer answer,long owner,long savedChatId){
        android.widget.LinearLayout form=new android.widget.LinearLayout(activity);form.setOrientation(android.widget.LinearLayout.VERTICAL);int pad=Math.round(16*activity.getResources().getDisplayMetrics().density);form.setPadding(pad,pad, pad,0);
        ImageView image=new ImageView(activity);image.setImageBitmap(storyVideoFile!=null?storyVideoPreview:storyPhotoPreview);image.setScaleType(ImageView.ScaleType.CENTER_CROP);form.addView(image,new android.widget.LinearLayout.LayoutParams(-1,Math.round(320*activity.getResources().getDisplayMetrics().density)));
        EditText caption=new EditText(activity);caption.setHint("Texto de la historia (opcional)");caption.setMinLines(2);caption.setMaxLines(4);caption.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(1024)});form.addView(caption);
        EditText link=new EditText(activity);link.setHint("Enlace del área (opcional)");link.setSingleLine(true);link.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);link.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});form.addView(link);
        android.widget.RadioGroup audiences=new android.widget.RadioGroup(activity);android.widget.RadioButton contacts=new android.widget.RadioButton(activity),everyone=new android.widget.RadioButton(activity),closeFriends=new android.widget.RadioButton(activity);contacts.setId(android.view.View.generateViewId());everyone.setId(android.view.View.generateViewId());closeFriends.setId(android.view.View.generateViewId());contacts.setText(activity.getString(R.string.story_privacy_contacts));everyone.setText(activity.getString(R.string.story_privacy_everyone));closeFriends.setText(activity.getString(R.string.story_privacy_close_friends));audiences.addView(contacts);audiences.addView(everyone);audiences.addView(closeFriends);audiences.check(contacts.getId());form.addView(audiences);
        boolean video=storyVideoFile!=null;
        String message="Se publicará en tu cuenta de Telegram durante 24 horas."+(video?" Duración: "+String.format(java.util.Locale.ROOT,"%.1f",storyVideoDuration)+" s. Telegram exige MP4 H.265 de 720 × 1280; si el archivo no cumple ese formato, puede rechazarse.":" La foto se ajustó localmente a 1080 × 1920.")+" El área de enlace es opcional y se coloca sobre el borde inferior. Nada se envía a servidores de WRGram.";
        AlertDialog dialog=Dialogs.builder(activity).setTitle(video?"Revisar historia de vídeo":"Revisar historia de foto").setMessage(message).setView(form).setNegativeButton("Cancelar",(d,w)->finishStoryDraft(answer,false,null)).setPositiveButton("Publicar historia",null).create();
        dialog.setOnCancelListener(ignored->finishStoryDraft(answer,false,null));
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            if(!currentAccount()||session.selfId!=owner||(video?storyVideoFile==null:storyPhotoFile==null)){dialog.dismiss();finishStoryDraft(answer,false,"La cuenta cambió. No se publicó ninguna historia.");return;}
            String text=caption.getText().toString().trim();
            String url=link.getText().toString().trim();
            if(!url.isEmpty()&&(url.length()>200||!url.matches("(?i)^(https?://|tg://).{3,}$"))){android.widget.Toast.makeText(activity,"El enlace debe empezar por http://, https:// o tg://.",android.widget.Toast.LENGTH_SHORT).show();link.requestFocus();return;}
            TdApi.StoryPrivacySettings privacy=audiences.getCheckedRadioButtonId()==everyone.getId()?new TdApi.StoryPrivacySettingsEveryone(new long[0]):audiences.getCheckedRadioButtonId()==closeFriends.getId()?new TdApi.StoryPrivacySettingsCloseFriends():new TdApi.StoryPrivacySettingsContacts(new long[0]);
            TdApi.InputStoryContent content=video?new TdApi.InputStoryContentVideo(new TdApi.InputFileLocal(storyVideoFile.getAbsolutePath()),new int[0],storyVideoDuration,0.5,storyVideoSilent):new TdApi.InputStoryContentPhoto(new TdApi.InputFileLocal(storyPhotoFile.getAbsolutePath()),new int[0]);
            TdApi.InputStoryAreas areas=null;
            if(!url.isEmpty())areas=new TdApi.InputStoryAreas(new TdApi.InputStoryArea[]{new TdApi.InputStoryArea(new TdApi.AreaPosition(50,84,72,8,0,2),new TdApi.InputStoryAreaTypeLink(url))});
            TdApi.PostStory post=new TdApi.PostStory(savedChatId,content,areas,new TdApi.FormattedText(text,new TdApi.TextEntity[0]),privacy,null,86400,null,false,false);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            session.perform(post,story->{
                if(!currentAccount()||session.selfId!=owner){dialog.setOnCancelListener(null);dialog.dismiss();deferStoryFiles();finishStoryDraft(answer,false,"La cuenta cambió. No se confirmó la publicación.");return;}
                dialog.setOnCancelListener(null);dialog.dismiss();schedule();deferStoryFiles();finishStoryDraft(answer,true,null);
            },error->{
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                Dialogs.builder(activity).setMessage(error).setPositiveButton("Cerrar",null).show();
            });
        }));
        dialog.show();
    }
    private void finishStoryDraft(Answer answer,boolean published,String error){if(storyPicking==answer)storyPicking=null;discardStoryDraft();if(error!=null)answer.fail(error);else answer.ok(published);}
    /** TDLib keeps reading the local path after PostStory returns, so the upload file outlives the request. */
    private void deferStoryFiles(){File photo=storyPhotoFile,video=storyVideoFile;storyPhotoFile=null;storyVideoFile=null;if(photo!=null||video!=null)main.postDelayed(()->{if(photo!=null)photo.delete();if(video!=null)video.delete();},15*60*1000);}
    private void discardStoryDraft(){File photo=storyPhotoFile,video=storyVideoFile;Bitmap photoPreview=storyPhotoPreview,videoPreview=storyVideoPreview;storyPhotoFile=null;storyPhotoPreview=null;storyVideoFile=null;storyVideoPreview=null;storyVideoDuration=0;storyVideoSilent=false;storyVideoPicking=false;if(photo!=null)photo.delete();if(video!=null)video.delete();if(photoPreview!=null&&!photoPreview.isRecycled())photoPreview.recycle();if(videoPreview!=null&&!videoPreview.isRecycled())videoPreview.recycle();}
    private <T extends TdApi.Object>void perform(TdApi.Function<T> function,Answer answer,Consumer<T> success){session.perform(function,value->{if(destroyed||!currentAccount()||answer.owner!=session.selfId){answer.fail("La cuenta cambió. Vuelve a abrir la conversación.");return;}try{success.accept(value);}catch(Exception ignored){answer.fail("No se pudo preparar el resultado.");}},answer::fail);}
    private <T extends TdApi.Object>void performSlow(TdApi.Function<T> function,Answer answer,Consumer<T> success){session.performSlow(function,value->{if(destroyed||!currentAccount()||answer.owner!=session.selfId){answer.fail("La cuenta cambió. Vuelve a abrir la conversación.");return;}try{success.accept(value);}catch(Exception ignored){answer.fail("No se pudo preparar el resultado.");}},answer::fail);}
    private void dispatch(String method,JSONObject p,Answer a)throws Exception{
        switch(method){
            case "state":
                try{a.ok(bridgeState(true,true));}
                catch(Exception error){
                    android.util.Log.w("WRGram", "Estado inicial no disponible: "+error.getClass().getSimpleName());
                    a.fail("No se pudo preparar el estado inicial de WRGram.");
                }
                break;
            case "access.countries":a.ok(session.accessCountries());break;
            case "access.declare":{String country=BridgePolicy.text(p,"country",2);int day=Integer.parseInt(BridgePolicy.text(p,"day",2)),month=Integer.parseInt(BridgePolicy.text(p,"month",2)),year=Integer.parseInt(BridgePolicy.text(p,"year",4));if(session.ageStore().blocked())throw new IllegalStateException("La espera de 24 horas aún no termina.");session.ageStore().declare(country,java.time.LocalDate.of(year,month,day));((WrgramApplication)activity.getApplication()).scheduleAgeExpiry();activity.checkPlayUpdate();a.ok(session.accessState());activity.accessGranted();schedule();break;}
            case "updates.check":activity.checkPlayUpdate();a.ok(activity.playUpdateStatus());break;
            case "updates.start":activity.startPlayUpdate();a.ok(true);break;
            case "updates.complete":activity.completePlayUpdate();a.ok(true);break;
            case "updates.open":activity.openPlayStore();a.ok(true);break;
            case "access.terms":ExternalLinks.open(activity,"https://telegram.org/tos",()->{},()->{});a.ok(true);break;
            case "access.privacy":ExternalLinks.open(activity,"https://wrgram.webrom.cc/android/privacy/",()->{},()->{});a.ok(true);break;
            case "accounts.list":{WrgramApplication app=(WrgramApplication)activity.getApplication();JSONArray items=new JSONArray();int i=0;for(TdSession s:app.accounts()){i++;items.put(object("slot",s.slot,"name",s.ready()?s.displayName:"Cuenta "+i,"ready",s.ready(),"active",s==session));}a.ok(items);break;}
            case "accounts.add":{WrgramApplication app=(WrgramApplication)activity.getApplication();changeAccount(app.addAccount(),a);break;}
            case "accounts.remove":{WrgramApplication app=(WrgramApplication)activity.getApplication();if(!app.removeAccount(BridgePolicy.text(p,"slot",32)))throw new IllegalStateException("Solo puedes quitar una cuenta que no tenga sesión iniciada y que no esté activa.");a.ok(true);schedule();break;}
            case "accounts.switch":changeAccount(BridgePolicy.text(p,"slot",32),a);break;
            case "chat.secret":requireAccount();session.createSecret(BridgePolicy.text(p,"username",33),chat->{session.open(chat.id);a.ok(true);},a::fail);break;
            case "apps.list":a.ok(BuiltInApps.json());break;
            case "apps.profile":{requireAccount();BuiltInApps.App app=BuiltInApps.require(BridgePolicy.text(p,"app",20));session.findPublic(app.username,chat->{try{if(a.owner!=session.selfId){a.fail("La cuenta cambió.");return;}a.ok(dto.chat(chat));}catch(Exception ignored){a.fail("No se pudo cargar la imagen del bot.");}},a::fail);break;}
            case "apps.open":openApp(BridgePolicy.text(p,"app",20),true,a);break;
            case "apps.chat":openApp(BridgePolicy.text(p,"app",20),false,a);break;
            case "sponsored.view":case "sponsored.open":sponsored(method,p,a);break;
            case "notifications.status":a.ok(PushNotifications.status(activity));break;
            case "notifications.enable":activity.enableNotifications();schedule();a.ok(true);break;
            case "notifications.disable":PushNotifications.disable((WrgramApplication)activity.getApplication());schedule();a.ok(true);break;
            case "app.background":activity.moveTaskToBack(true);a.ok(true);break;
            case "connect":session.setConsent(true);session.start();a.ok(true);break;
            case "authenticate":if(!session.consent())throw new IllegalArgumentException();session.authenticate(BridgePolicy.text(p,"value",256));a.ok(true);break;
            case "authenticate.qr":if(!session.consent())throw new IllegalArgumentException();session.requestQrAuthentication();a.ok(true);break;
            case "auth.register":if(!session.consent())throw new IllegalArgumentException();session.register(BridgePolicy.text(p,"firstName",64),BridgePolicy.text(p,"lastName",64));a.ok(true);break;
            case "auth.recover.request":if(!session.consent())throw new IllegalArgumentException();session.requestPasswordRecovery();a.ok(true);break;
            case "auth.recover.reset":if(!session.consent())throw new IllegalArgumentException();session.resetPassword(BridgePolicy.text(p,"code",64),BridgePolicy.text(p,"password",256),BridgePolicy.text(p,"hint",64));a.ok(true);break;
            case "auth.resend":if(!session.consent())throw new IllegalArgumentException();session.resendAuthenticationCode();a.ok(true);break;
            case "logout":session.logOut();assistant.clear();a.ok(true);break;
            case "account.profile":accountProfile(a);break;
            case "chat.profile":chatProfile(p,a);break;
            case "profile.related":profileRelated(p,a);break;
            case "profile.peer":{requireAccount();perform(new TdApi.GetChat(BridgePolicy.id(p,"id")),a,chat->respondProfilePeer(chat,a));break;}
            case "profile.block":profileBlock(p,a);break;
            case "profile.sender":senderProfile(p,a);break;
            case "profile.contact":{requireAccount();long userId=BridgePolicy.id(p,"id");perform(new TdApi.CreatePrivateChat(userId,false),a,chat->respondProfilePeer(chat,a));break;}
            case "clipboard.copy":{String text=BridgePolicy.text(p,"text",4096);ClipboardManager clipboard=(ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);if(clipboard==null){a.fail("El portapapeles no está disponible.");break;}clipboard.setPrimaryClip(ClipData.newPlainText("WRGram",text));a.ok(true);break;}
            case "account.photo.pick":{requireAccount();if(profilePhotoPicking!=null)throw new IllegalArgumentException("Ya hay un selector de imagen abierto.");profilePhotoPicking=a;activity.chooseProfilePhoto();break;}
            case "account.photo.delete":deleteAccountPhoto(a);break;
            case "account.name":{requireAccount();String first=BridgePolicy.text(p,"firstName",64).trim(),last=BridgePolicy.text(p,"lastName",64).trim();if(first.isEmpty())throw new IllegalArgumentException("El nombre no puede quedar vacío.");perform(new TdApi.SetName(first,last),a,result->{schedule();a.ok(true);});break;}
            case "account.bio":{requireAccount();String bio=BridgePolicy.text(p,"bio",140).replace('\n',' ').trim();perform(new TdApi.SetBio(bio),a,result->{schedule();a.ok(true);});break;}
            case "account.username":{requireAccount();String username=BridgePolicy.text(p,"username",32).trim();if(!username.isEmpty()&&!username.matches("[A-Za-z][A-Za-z0-9_]{4,31}"))throw new IllegalArgumentException("El nombre público debe tener de 5 a 32 caracteres y empezar con una letra.");perform(new TdApi.SetUsername(username),a,result->{schedule();a.ok(true);});break;}
            case "account.sessions":accountSessions(a);break;
            case "privacy.get":privacyGet(a);break;
            case "privacy.set":privacySet(p,a);break;
            case "password.state":passwordState(a);break;
            case "password.set":passwordSet(p,a);break;
            case "account.session.revoke":{requireAccount();long id=BridgePolicy.id(p,"id");perform(new TdApi.TerminateSession(id),a,result->{a.ok(true);});break;}
            case "security.lock":{boolean enabled=p.getBoolean("enabled");activity.changeAppLock(enabled,granted->{if(granted){schedule();a.ok(true);}else a.fail("No se cambió el bloqueo de la app.");});break;}
            case "security.timeout":{AppLock.setLockAfter(activity,p.optInt("seconds",-1));schedule();a.ok(true);break;}
            case "security.lockNow":{if(!AppLock.enabled(activity))throw new IllegalArgumentException("Activa el bloqueo de la app primero.");if(!AppLock.available(activity))throw new IllegalArgumentException("Configura un PIN, patrón o contraseña en Android.");activity.lockNow();schedule();a.ok(true);break;}
             case "contacts.list":contacts("list","",a);break;
             case "contacts.search":contacts("search",BridgePolicy.text(p,"query",80).trim(),a);break;
             case "contacts.import":importPhonebook(a);break;
             case "contacts.sync.status":requireAccount();a.ok(contactSyncStatus());break;
             case "contacts.sync.set":setContactSync(p,a);break;
             case "contacts.sync.now":requestContactSyncNow(a);break;
            case "contacts.add":case "contacts.remove":contactAction(method,p,a);break;
             case "contacts.open":{requireAccount();long userId=BridgePolicy.id(p,"id");perform(new TdApi.CreatePrivateChat(userId,false),a,chat->{session.open(chat.id);a.ok(Long.toString(chat.id));});break;}
              case "groups.create":createGroup(p,a);break;
             case "groups.createSuper":createSupergroup(p,a);break;
             case "groups.members":groupMembers(p,a);break;
             case "groups.members.page":groupMembersPage(p,a);break;
             case "groups.banned":bannedMembers(p,a);break;
             case "groups.member.ban":banGroupMember(p,a,false);break;
             case "groups.member.restrict":banGroupMember(p,a,true);break;
             case "groups.member.unban":unbanGroupMember(p,a);break;
             case "groups.member.promote":promoteGroupMember(p,a);break;
             case "groups.member.demote":demoteGroupMember(p,a);break;
             case "groups.permissions.get":groupPermissions(p,a);break;
            case "groups.permissions.set":setGroupPermissions(p,a);break;
            case "chat.paidMessages.get":paidMessagesGet(p,a);break;
            case "chat.paidMessages.set":paidMessagesSet(p,a);break;
            case "chat.senders.get":chatSenders(p,a);break;
            case "chat.senders.set":setChatSender(p,a);break;
            case "chat.username":chatUsername(p,a);break;
            case "chat.username.set":setChatUsername(p,a);break;
            case "groups.events":adminEvents(p,a);break;
            case "chat.transfer.check":transferOwnershipCheck(p,a);break;
            case "chat.transfer":transferOwnership(p,a);break;
            case "folders.list":foldersList(a);break;
            case "folders.get":foldersGet(p,a);break;
            case "folders.save":foldersSave(p,a);break;
            case "folders.delete":foldersDelete(p,a);break;
            case "folders.link":foldersLink(p,a);break;
            case "folders.links.list":folderLinks(p,a);break;
            case "folders.links.edit":folderLinkChange(p,a,false);break;
            case "folders.links.delete":folderLinkChange(p,a,true);break;
            case "folders.join":foldersJoin(p,a);break;
            case "chat.folderTags":folderTags(p,a);break;
            case "chat.folderCount":folderCount(p,a);break;
            case "saved.tags":savedTags(p,a);break;
            case "saved.tag.label":savedTagLabel(p,a);break;
            case "saved.search":savedSearch(p,a);break;
            case "saved.topics.pin":savedTopicPin(p,a);break;
            case "forum.topics":forumTopics(p,a);break;
            case "forum.open":openForumTopic(p,a);break;
            case "forum.close":requireAccount();session.closeTopic();a.ok(true);break;
            case "forum.create":createForumTopic(p,a);break;
            case "forum.rename":renameForumTopic(p,a);break;
            case "forum.closed":toggleForumTopic(p,a);break;
            case "forum.delete":deleteForumTopic(p,a);break;
            case "forum.pin":pinForumTopic(p,a);break;
            case "forum.order":orderForumTopics(p,a);break;
            case "downloads.status":requireAccount();a.ok(session.downloadsStatus());break;
            case "downloads.pause":requireAccount();session.toggleDownloads(p.getBoolean("value"),a::ok);break;
            case "downloads.queue":downloadsQueue(p,a);break;
            case "downloads.item.pause":requireAccount();downloadsItem(p,a);break;
            case "downloads.item.cancel":requireAccount();perform(new TdApi.CancelDownloadFile((int)BridgePolicy.id(p,"fileId"),false),a,value->a.ok(true));break;
            case "downloads.item.remove":requireAccount();perform(new TdApi.RemoveFileFromDownloads((int)BridgePolicy.id(p,"fileId"),false),a,value->a.ok(true));break;
            case "downloads.item.add":downloadsItemAdd(p,a);break;
            case "downloads.presets":requireAccount();perform(new TdApi.GetAutoDownloadSettingsPresets(),a,value->a.ok(DownloadsPolicy.presets(value)));break;
            case "downloads.rules":requireAccount();a.ok(object("networks",DownloadsPolicy.storedRules(downloadRules())));break;
            case "downloads.rules.set":downloadsRuleSet(p,a);break;
            case "business.quick.list":requireAccount();session.loadQuickReplies();a.ok(dto.quickRepliesDto());break;
            case "business.quick.messages":requireAccount();session.loadQuickReplyMessages((int)BridgePolicy.id(p,"id"));a.ok(quickMessages((int)BridgePolicy.id(p,"id")));break;
            case "business.quick.add":requireAccount();businessQuickAdd(p,a);break;
            case "business.quick.edit":businessQuickEdit(p,a);break;
            case "business.quick.name":requireAccount();perform(new TdApi.SetQuickReplyShortcutName((int)BridgePolicy.id(p,"id"),BusinessPolicy.name(p,"name")),a,value->a.ok(true));break;
            case "business.quick.delete":requireAccount();perform(new TdApi.DeleteQuickReplyShortcut((int)BridgePolicy.id(p,"id")),a,value->a.ok(true));break;
            case "business.quick.send":requireAccount();perform(new TdApi.SendQuickReplyShortcutMessages(session.activeChat,(int)BridgePolicy.id(p,"id"),0),a,value->a.ok(true));break;
            case "business.greeting":requireAccount();perform(new TdApi.SetBusinessGreetingMessageSettings(new TdApi.BusinessGreetingMessageSettings((int)BridgePolicy.id(p,"shortcutId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.inactivityDays(p))),a,value->a.ok(true));break;
            case "business.away":requireAccount();perform(new TdApi.SetBusinessAwayMessageSettings(new TdApi.BusinessAwayMessageSettings((int)BridgePolicy.id(p,"shortcutId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.schedule(p),p.optBoolean("offlineOnly",false))),a,value->a.ok(true));break;
            case "business.hours":requireAccount();perform(new TdApi.SetBusinessOpeningHours(new TdApi.BusinessOpeningHours(BusinessPolicy.text(p,"timeZoneId",BusinessPolicy.MAX_ZONE,"La zona horaria"),BusinessPolicy.intervals(p,"intervals"))),a,value->a.ok(true));break;
            case "business.location":requireAccount();perform(new TdApi.SetBusinessLocation(new TdApi.BusinessLocation(null,BusinessPolicy.text(p,"address",64,"La dirección"))),a,value->a.ok(true));break;
            case "business.start":requireAccount();perform(new TdApi.SetBusinessStartPage(new TdApi.InputBusinessStartPage(BusinessPolicy.text(p,"title",BusinessPolicy.MAX_TITLE,"El título"),BusinessPolicy.text(p,"message",BusinessPolicy.MAX_TEXT,"El mensaje"),null)),a,value->a.ok(true));break;
            case "business.links.list":requireAccount();perform(new TdApi.GetBusinessChatLinks(),a,value->{try{businessLinksDto(a,value);}catch(Exception ignored){a.fail("No se pudieron cargar los enlaces.");}});break;
            case "business.links.save":businessLinkSave(p,a);break;
            case "business.links.delete":requireAccount();perform(new TdApi.DeleteBusinessChatLink(BridgePolicy.text(p,"link",256)),a,value->a.ok(true));break;
            case "business.bot.get":requireAccount();perform(new TdApi.GetBusinessConnectedBot(),a,value->{try{businessBotDto(a,value);}catch(Exception ignored){a.fail("No se pudo cargar el bot de negocios.");}});break;
            case "business.bot.set":requireAccount();perform(new TdApi.SetBusinessConnectedBot(new TdApi.BusinessConnectedBot(BridgePolicy.id(p,"botUserId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.botRights(p,"rights"))),a,value->{try{businessBotDto(a,null);}catch(Exception ignored){a.fail("No se pudo aplicar el bot de negocios.");}});break;
            case "business.bot.delete":requireAccount();perform(new TdApi.DeleteBusinessConnectedBot(BridgePolicy.id(p,"botUserId")),a,value->a.ok(true));break;
            case "business.bot.pause":requireAccount();perform(new TdApi.ToggleBusinessConnectedBotChatIsPaused(BridgePolicy.id(p,"chatId"),p.getBoolean("value")),a,value->a.ok(true));break;
            case "business.bot.remove":requireAccount();perform(new TdApi.RemoveBusinessConnectedBotFromChat(BridgePolicy.id(p,"chatId")),a,value->a.ok(true));break;
            case "payments.stars.prepare":prepareStarsPayment(p,a);break;
            case "payments.stars.confirm":confirmStarsPayment(p,a);break;
            case "payments.stars.cancel":cancelStarsPayment(p,a);break;
            case "stars.paidMessageRevenue":paidMessageRevenue(p,a);break;
            case "stars.transactions":starsTransactions(p,a);break;
            case "stars.subscriptions":starsSubscriptions(p,a);break;
            case "stars.subscription.cancel":starsSubscriptionCancel(p,a);break;
            case "stars.subscription.resume":starsSubscriptionResume(p,a);break;
            case "stars.subscription.reuse":starsSubscriptionReuse(p,a);break;
            case "stars.options":starsOptions(a);break;
            case "stars.revenue":starsRevenue(p,a);break;
            case "stars.ads.url":starsAdsUrl(p,a);break;
            case "stars.withdraw":starsWithdraw(p,a);break;
            case "chat.boost.status":chatBoostStatus(p,a);break;
            case "chat.boost.slots":chatBoostSlots(a);break;
            case "chat.boost.features":chatBoostFeatures(p,a);break;
            case "chat.boost.level":chatBoostLevel(p,a);break;
            case "chat.boost.link":chatBoostLink(p,a);break;
            case "chat.boost.apply":chatBoostApply(p,a);break;
            case "gifts.catalog":giftsCatalog(a);break;
            case "gifts.received":giftsReceived(p,a);break;
            case "gifts.canSend":giftsCanSend(p,a);break;
            case "gifts.options":giftsOptions(p,a);break;
            case "gifts.send":giftsSend(p,a);break;
            case "gifts.save":giftsSave(p,a);break;
            case "gifts.pin":giftsPin(p,a);break;
            case "gifts.sell":giftsSell(p,a);break;
            case "gifts.delete":giftsDelete(p,a);break;
            case "gifts.upgrade.preview":giftsUpgradePreview(p,a);break;
            case "gifts.upgrade":giftsUpgrade(p,a);break;
            case "gifts.transfer":giftsTransfer(p,a);break;
            case "retry":session.retry();a.ok(true);break;
            case "error.clear":session.clearError();a.ok(true);break;
            case "appearance":appearance(p);schedule();a.ok(true);break;
            case "appearance.systemPalette":systemPalette(p,a);break;
            case "chat.open":openChat(p,a);break;
            case "call.open":openVoiceCall(p,a);break;
             case "chat.stories":chatStories(p,a);break;
             case "chat.invite":createInviteLink(p,a);break;
             case "chat.subscription.create":createSubscriptionInvite(p,a);break;
             case "story.open":openStory(p,a);break;
             case "story.close":closeStory(p,a);break;
             case "story.create.photo":createPhotoStory(a);break;
             case "story.create.video":createVideoStory(a);break;
             case "story.edit.caption":editStoryCaption(p,a);break;
             case "story.delete":deleteStory(p,a);break;
             case "story.profile.toggle":toggleStoryProfile(p,a);break;
             case "story.albums.list":storyAlbums(a);break;
             case "story.albums.create":createStoryAlbum(p,a);break;
             case "story.albums.rename":renameStoryAlbum(p,a);break;
             case "story.albums.delete":deleteStoryAlbum(p,a);break;
             case "story.albums.order":orderStoryAlbums(p,a);break;
             case "story.albums.stories":storyAlbumStories(p,a);break;
             case "story.albums.add":addStoryToAlbum(p,a);break;
             case "story.albums.remove":removeStoryFromAlbum(p,a);break;
             case "story.albums.story.order":orderStoryAlbumStories(p,a);break;
            case "story.reactions":storyReactions(a);break;
            case "story.react":storyReact(p,a);break;
            case "story.interactions":storyInteractions(p,a);break;
            case "chat.close":session.closeChat();searchResults.clear();chatsDirty=true;messagesDirty=true;schedule();a.ok(true);break;
            case "chat.saved":requireAccount();session.saved(chat->{session.open(chat.id);a.ok(true);},a::fail);break;
            case "chats.search":searchChats(p,a);break;
            case "saved.sources":savedSources(p,a);break;
            case "saved.history":savedHistory(p,a);break;
            case "gallery.list":gallery(p,a);break;
            case "chat.find":requireAccount();session.findPublic(BridgePolicy.text(p,"username",33),chat->{if(!session.unsupported(chat).isEmpty())a.fail(session.unsupported(chat));else{session.open(chat.id);a.ok(true);}},a::fail);break;
            case "telegram.link":openTelegramLink(p,a);break;
            case "chats.more":session.refreshChats();a.ok(true);break;
            case "chats.list":{requireAccount();String key=BridgePolicy.text(p,"list",40);TdApi.ChatList list=new TdApi.ChatListMain();if(key.equals("archive"))list=new TdApi.ChatListArchive();else if(key.startsWith("folder:")){int id=Integer.parseInt(key.substring(7));if(session.folders.stream().noneMatch(folder->folder.id==id))throw new IllegalArgumentException();list=new TdApi.ChatListFolder(id);}session.selectList(list);a.ok(true);break;}
            case "chat.pin":{TdApi.Chat chat=target(p);perform(new TdApi.ToggleChatIsPinned(session.selectedList(),chat.id,p.getBoolean("value")),a,value->a.ok(true));break;}
            case "chat.archive":{TdApi.Chat chat=target(p);TdApi.AddChatToList action=new TdApi.AddChatToList();action.chatId=chat.id;action.chatList=p.getBoolean("value")?new TdApi.ChatListArchive():new TdApi.ChatListMain();perform(action,a,value->a.ok(true));break;}
            case "chat.unread":{TdApi.Chat chat=target(p);TdApi.ToggleChatIsMarkedAsUnread action=new TdApi.ToggleChatIsMarkedAsUnread();action.chatId=chat.id;action.isMarkedAsUnread=p.getBoolean("value");perform(action,a,value->a.ok(true));break;}
            case "chat.mute":{TdApi.Chat chat=target(p);if(chat.notificationSettings==null)throw new IllegalArgumentException();TdApi.ChatNotificationSettings value=copySettings(chat.notificationSettings);value.useDefaultMuteFor=false;value.muteFor=p.getBoolean("value")?Integer.MAX_VALUE:0;perform(new TdApi.SetChatNotificationSettings(chat.id,value),a,result->a.ok(true));break;}
            case "chat.read":{
                if(!p.has("messageId")){session.markRead();a.ok(true);break;}
                requireAccount();
                if(BridgePolicy.id(p,"accountId")!=session.selfId||BridgePolicy.id(p,"chatId")!=session.activeChat||p.optInt("topicId",-1)!=session.activeTopic){a.ok(false);break;}
                a.ok(session.markVisibleRead(BridgePolicy.id(p,"messageId")));break;
            }
            case "chat.join":{TdApi.Chat chat=target(p);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException();perform(new TdApi.JoinChat(chat.id),a,result->{session.refreshChats();a.ok(true);});break;}
            case "chat.leave":{TdApi.Chat chat=target(p);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException();perform(new TdApi.LeaveChat(chat.id),a,result->{if(session.activeChat==chat.id)session.closeChat();session.refreshChats();a.ok(true);});break;}
            case "history.byDate":messageByDate(p,a);break;
            case "history.older":session.loadHistory();a.ok(true);break;
            case "history.newer":session.loadNewer();a.ok(true);break;
            case "history.refresh":session.refreshHistory();a.ok(true);break;
            case "typing":if(prefs.getBoolean("typing",true))session.typing(p.getBoolean("active"));a.ok(true);break;
            case "send.text":requireAccount();if(p.has("accountId")&&(BridgePolicy.id(p,"accountId")!=session.selfId||BridgePolicy.id(p,"chatId")!=session.activeChat||p.optInt("topicId",-1)!=session.activeTopic)){a.fail("La conversación cambió. No se envió el mensaje.");break;}if(session.uncertain(session.activeChat)&&!p.optBoolean("acknowledge")){a.fail("Comprueba el envío anterior antes de repetirlo.");break;}if(p.optBoolean("acknowledge"))session.acknowledgeUncertain(session.activeChat);String sendText=BridgePolicy.text(p,"text",4096);long sendSchedule=p.optLong("schedule",0);if("online".equals(p.optString("schedule","")))sendSchedule=-1;session.sendText(sendText,textEntities(p,sendText.length()),BridgePolicy.id(p,"reply"),sendSchedule,p.optInt("repeatPeriod",0),p.optBoolean("silent"),p.has("accountId"),a::ok);break;
            case "messages.forward":{requireAccount();long[] ids=BridgePolicy.ids(p,"ids",100);java.util.Arrays.sort(ids);long to=BridgePolicy.id(p,"to");TdApi.Chat target=session.chat(to);if(target==null||!session.unsupported(target).isEmpty())throw new IllegalArgumentException();session.forwardMessages(to,ids,sendOptions(p),p.optBoolean("sendCopy"),p.optBoolean("removeCaption"),a::ok);break;}
            case "messages.delete":{requireAccount();long[] ids=BridgePolicy.ids(p,"ids",100);session.deleteMessages(session.activeChat,ids,p.optBoolean("revoke"),a::ok);break;}
            case "messages.search":search(p,a);break;
            case "messages.search.more":searchMore(p,a);break;
            case "scheduled.list":scheduledList(p,a);break;
            case "scheduled.reschedule":scheduledSchedule(p,a,false);break;
            case "scheduled.sendNow":scheduledSchedule(p,a,true);break;
            case "scheduled.delete":scheduledDelete(p,a);break;
            case "chat.pinned":pinned(a);break;
            case "pinned.list":pinnedList(a);break;
            case "draft.set":setDraft(p,a);break;
            case "message.album":album(message(p),a);break;
            case "message.translate":translate(message(p),p,a);break;
            case "chat.translatable":{TdApi.Chat chat=target(p);perform(new TdApi.ToggleChatIsTranslatable(chat.id,p.getBoolean("value")),a,value->a.ok(true));break;}
            case "chat.autotranslate":{TdApi.Chat chat=target(p);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("La traducción automática de Telegram solo está disponible en canales y supergrupos.");perform(new TdApi.ToggleSupergroupHasAutomaticTranslation(((TdApi.ChatTypeSupergroup)chat.type).supergroupId,p.getBoolean("value")),a,value->a.ok(true));break;}
            case "message.transcribe":transcribe(message(p),a);break;
            case "message.transcribe.rate":{TdApi.Message rating=message(p);perform(new TdApi.RateSpeechRecognition(rating.chatId,rating.id,p.getBoolean("good")),a,value->a.ok(true));break;}
            case "checklist.send":checklistSend(p,a);break;
            case "checklist.add":checklistAdd(p,a);break;
            case "checklist.toggle":checklistToggle(p,a);break;
            case "checklist.edit":checklistEdit(p,a);break;
            case "message.properties":properties(message(p),a);break;
            case "message.link":{TdApi.Message message=message(p);if(message.selfDestructType!=null||message.ephemeralContent!=null||!(message.content instanceof TdApi.MessageText))throw new IllegalArgumentException();TdApi.LinkPreview link=((TdApi.MessageText)message.content).linkPreview;if(link==null)throw new IllegalArgumentException();openLinkOrTelegram(link.url,a);break;}
            case "link.open":{requireAccount();String url=BridgePolicy.text(p,"url",2048);if(TelegramLinks.normalize(url)==null&&TelegraphUrl.normalize(url)==null){try{MiniAppPolicy.origin(url);}catch(IllegalArgumentException invalid){a.fail("Solo se abren enlaces HTTPS públicos o enlaces de Telegram.");break;}}openLinkOrTelegram(url,a);break;}
            case "message.react":react(p,a);break;
            case "message.react.paid":reactPaid(p,a);break;
            case "message.react.custom":reactCustom(p,a);break;
            case "customEmoji.get":customEmoji(p,a);break;
            case "customEmoji.search":customEmojiSearch(p,a);break;
            case "premium.state":premiumState(a);break;
            case "premium.features":premiumFeatures(a);break;
            case "premium.limit":premiumLimit(p,a);break;
            case "premium.stickers":premiumStickers(a);break;
            case "premium.gift.options":premiumGiftOptions(a);break;
            case "premium.gift.check":premiumGiftCheck(p,a);break;
            case "premium.gift.apply":premiumGiftApply(p,a);break;
            case "emojiStatus.state":emojiStatusState(a);break;
            case "emojiStatus.options":emojiStatusOptions(a);break;
            case "emojiStatus.set":emojiStatusSet(p,a);break;
            case "emojiPacks.list":emojiPacks(p,a);break;
            case "emojiPacks.get":emojiPack(p,a);break;
            case "bot.button":botButton(p,a);break;
            case "bot.inline.more":inlineMore(p,a);break;
            case "bot.inline.send":inlineSend(p,a);break;
            case "bot.inline.choose":inlineChoose(p,a);break;
            case "bot.inline.cancel":inlineCancel(p,a);break;
            case "bot.inline.query":inlineQuery(p,a);break;
            case "bot.status":botStatus(a);break;
            case "bot.publish.available":botPublishAvailable(p,a);break;
            case "inbox.tabs":inboxTabs(p,a,false);break;
            case "inbox.tabs.set":inboxTabs(p,a,true);break;
            case "feed.channels":feedChannels(a);break;
            case "search.filters.list":searchFilters(p,a,false,false);break;
            case "search.filters.save":searchFilters(p,a,true,false);break;
            case "search.filters.delete":searchFilters(p,a,false,true);break;
            case "bot.father":openBotFather(a);break;
            case "bot.save":botTokenSet(p,a);break;
            case "bot.forget":botForget(a);break;
            case "bot.publish":botPublish(p,a);break;
            case "bot.posts":botPosts(p,a);break;
            case "bot.edit":botMessageAction(p,a,"editar");break;
            case "bot.delete":botMessageAction(p,a,"borrar");break;
            case "bot.pin":botMessageAction(p,a,"fijar");break;
            case "bot.unpin":botMessageAction(p,a,"desfijar");break;
            case "chat.bot.owned":ownedBots(a);break;
            case "chat.bot.defaults":botDefaultRights(p,a);break;
            case "chat.bot.add":addBotToChat(p,a);break;
            case "chat.bot.remove":removeBotFromChat(p,a);break;
            case "sponsored.retry":session.retrySponsoredMessages();a.ok(true);break;
            case "message.edit":case "message.edit.caption":case "message.delete":case "message.copy":case "message.forward":messageAction(method,p,a);break;
            case "message.pin":if(p.has("value")&&!p.getBoolean("value"))unpin(BridgePolicy.id(p,"id"),a);else messageAction(method,p,a);break;
            case "catalog":catalog.list(BridgePolicy.text(p,"tab",10),BridgePolicy.text(p,"query",100),BridgePolicy.text(p,"setId",40),a::ok,a::fail);break;
            case "send.catalog":catalog.send(BridgePolicy.text(p,"key",80),BridgePolicy.id(p,"reply"),a::ok,a::fail);break;
            case "media.load":requireAccount();media.load(p.getInt("id"),value->{schedule();a.ok(value);},failure->{schedule();a.fail(failure);});break;
            case "media.open":openDownloadedMedia(p.getInt("id"),a);break;
            case "media.text":previewDownloadedText(p.getInt("id"),a);break;
            case "media.archive":previewDownloadedArchive(p.getInt("id"),a);break;
            case "media.play":playDownloadedMedia(p,a);break;
            case "media.retry":requireAccount();JSONArray failedMedia=media.failedIds();int retriedMedia=0;for(int i=0;i<failedMedia.length();i++){int mediaId=failedMedia.getInt(i);media.load(mediaId,ignored->{},ignored->{});retriedMedia++;}schedule();a.ok(retriedMedia);break;
            case "media.export":requireAccount();if(exporting!=null)throw new IllegalArgumentException();if(media.protectedFile(p.getInt("id"))){a.fail("Telegram protege este contenido. No se puede guardar fuera del chat.");break;}exportFile=media.exportFile(p.getInt("id"));if(exportFile==null){a.fail("Descarga primero el archivo.");break;}exporting=a;activity.export.launch(exportFile.getName());break;
            case "attachment.pick":requireAccount();if(picking!=null)throw new IllegalArgumentException();clearUnsent();picking=a;try{activity.picker.launch(new String[]{"*/*"});}catch(RuntimeException error){picking=null;throw new IllegalArgumentException("No hay un selector de archivos disponible.");}break;
            case "attachment.camera":requireAccount();if(picking!=null)throw new IllegalArgumentException();clearUnsent();picking=a;if(!activity.capturePhoto()){picking=null;throw new IllegalArgumentException("No hay una aplicación de cámara disponible.");}break;
            case "attachment.discard":{Attachment item=attachments.remove(BridgePolicy.text(p,"token",80));if(item!=null)Files.deleteIfExists(item.path.toPath());a.ok(true);break;}
            case "send.attachment":sendAttachment(p,a);break;
            case "attachment.album":requireAccount();if(albumPicking!=null)throw new IllegalArgumentException("Ya hay un selector de álbum abierto.");clearUnsent();albumPicking=a;try{activity.chooseAlbum();}catch(RuntimeException error){albumPicking=null;throw new IllegalArgumentException("No hay un selector de fotos disponible.");}break;
            case "send.album":sendAlbum(p,a);break;
            case "send.paidMedia":sendPaidMedia(p,a);break;
            case "poll.send":sendPoll(p,a);break;
            case "poll.answer":answerPoll(p,a);break;
            case "poll.stop":stopPoll(p,a);break;
            case "poll.voters":pollVoters(p,a);break;
            case "share.contact":shareContact(p,a);break;
            case "share.location":shareLocation(p,a);break;
            case "voice.start":startVoice(a);break;
            case "voice.finish":finishVoice(a);break;
            case "voice.cancel":cancelVoice(a);break;
            case "attachment.videoNote":requireAccount();if(videoNotePicking!=null)throw new IllegalArgumentException("Ya hay un selector de videomensaje abierto.");videoNotePicking=a;try{activity.chooseVideoNote();}catch(RuntimeException error){videoNotePicking=null;throw new IllegalArgumentException("No hay un selector de vídeos disponible.");}break;
            case "attachment.videoNote.record":requireAccount();if(videoNotePicking!=null)throw new IllegalArgumentException("Ya hay un selector de videomensaje abierto.");videoNotePicking=a;try{if(!activity.recordVideoNote())throw new IllegalArgumentException("No hay una cámara disponible para grabar el videomensaje.");}catch(RuntimeException error){videoNotePicking=null;throw new IllegalArgumentException("No se pudo abrir la cámara para grabar el videomensaje.");}break;
            case "stickers.installed":installedStickers(a);break;
            case "stickers.search":searchStickers(p,a);break;
            case "stickers.get":stickerSet(p,a);break;
            case "stickers.install":changeStickerSet(p,a);break;
            case "proxy.list":listProxies(a);break;
            case "proxy.add":addProxy(p,a);break;
            case "proxy.enable":case "proxy.disable":case "proxy.remove":proxyAction(method,p,a);break;
            case "proxy.ping":pingProxy(p,a);break;
            case "storage.status":storageStatus(a);break;
            case "storage.details":storageDetails(a);break;
            case "storage.settings":requireAccount();a.ok(session.cache.save(p));break;
            case "storage.optimize":optimizeStorage(p,a);break;
            case "plugin.permission":requireAccount();String plugin=BridgePolicy.text(p,"plugin",20);if(!plugin.equals("notes")&&!plugin.equals("replies"))throw new IllegalArgumentException();prefs.edit().putBoolean("plugin."+session.selfId+"."+plugin,p.getBoolean("value")).apply();schedule();a.ok(true);break;
            case "notes.read":case "notes.write":case "notes.clear":notes(method,p,a);break;
            case "assistant.status":assistant.status();a.ok(true);break;
            case "assistant.consent":if(p.getBoolean("value"))assistant.consent=true;else assistant.revoke();schedule();a.ok(true);break;
            case "assistant.send":a.ok(assistant.send(BridgePolicy.text(p,"text",4000)));break;
             case "native.settings":activity.showSettingsSupport();a.ok(true);break;
             case "native.assistant":activity.startActivity(new Intent(activity,MainActivity.class).putExtra("page","assistant"));a.ok(true);break;
            default:throw new IllegalArgumentException();
        }
    }
    private void changeAccount(String slot,Answer answer){WrgramApplication app=(WrgramApplication)activity.getApplication();if(app.account(slot)==null)throw new IllegalArgumentException();session.closeChat();clearUnsent();discardStoryDraft();if(storyPicking!=null)storyPicking.fail("La cuenta cambió. No se publicó ninguna historia.");storyPicking=null;media.clear();catalog.clear();searchResults.clear();MiniAppLaunch.clear();answer.ok(true);app.switchAccount(slot);main.post(activity::recreate);}
    private void openTelegramLink(JSONObject params,Answer answer)throws Exception{requireAccount();String raw=BridgePolicy.text(params,"url",2048);openTelegramLink(raw,new LinkSink(){public void ok(JSONObject value){answer.ok(value);}public void fail(String error){answer.fail(error);}});}
    private void openLinkOrTelegram(String url,Answer answer){String article=TelegraphUrl.normalize(url);if(article!=null){activity.startActivity(new Intent(activity,TelegraphActivity.class).putExtra(TelegraphActivity.URL,article));answer.ok(true);return;}String link=TelegramLinks.normalize(url);if(link!=null){openTelegramLink(link,new LinkSink(){public void ok(JSONObject value){answer.ok(value);}public void fail(String error){answer.fail(error);}});return;}ExternalLinks.open(activity,url,()->answer.ok(true),()->answer.ok(false));}
    void openSystemLink(String raw){LinkSink sink=new LinkSink(){public void ok(JSONObject value){}public void fail(String error){if(!destroyed)Dialogs.builder(activity).setTitle("Enlace de Telegram").setMessage(error).setPositiveButton("Aceptar",null).show();}};try{requireAccount();}catch(RuntimeException ignored){sink.fail("Inicia sesión en WRGram antes de abrir este enlace.");return;}openTelegramLink(raw,sink);}
    private void openTelegramLink(String raw,LinkSink sink){String link=TelegramLinks.normalize(raw);if(link==null){sink.fail("Solo se admiten enlaces de Telegram (t.me, telegram.me, telegram.dog o tg://).");return;}long owner=session.selfId;session.perform(new TdApi.GetInternalLinkType(link),type->{if(!currentAccount()||session.selfId!=owner){sink.fail("La cuenta cambió. Vuelve a intentarlo.");return;}handleTelegramLink(type,sink);},sink::fail);}
    private void handleTelegramLink(TdApi.InternalLinkType type,LinkSink sink){
        if(type instanceof TdApi.InternalLinkTypePublicChat){TdApi.InternalLinkTypePublicChat value=(TdApi.InternalLinkTypePublicChat)type;if(value.unpaidMessagesToken!=null&&!value.unpaidMessagesToken.isEmpty()){sink.fail("Este enlace requiere un token de pago y no se abrirá desde aquí.");return;}if(value.draftText!=null&&!value.draftText.isEmpty()){sink.fail("Este enlace incluye un borrador. Ábrelo desde el selector de chats para revisarlo antes de enviarlo.");return;}openPublicChat(value.chatUsername,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeBotStart){openBotLink((TdApi.InternalLinkTypeBotStart)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeRequestManagedBot){openManagedBotLink((TdApi.InternalLinkTypeRequestManagedBot)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeChatInvite){openInviteLink((TdApi.InternalLinkTypeChatInvite)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeMessage){openMessageLink((TdApi.InternalLinkTypeMessage)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeStory){openStoryLink((TdApi.InternalLinkTypeStory)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeStickerSet){openStickerLink((TdApi.InternalLinkTypeStickerSet)type,sink);return;}
        if(type instanceof TdApi.InternalLinkTypeSettings){sink.ok(object("action","settings"));return;}
        if(type instanceof TdApi.InternalLinkTypeSavedMessages){session.saved(chat->{session.open(chat.id);sink.ok(object("action","saved","chatId",Long.toString(chat.id),"title",chat.title));});return;}
        if(type instanceof TdApi.InternalLinkTypeSearch){sink.ok(object("action","search"));return;}
        if(type instanceof TdApi.InternalLinkTypeChatBoost){openBoostLink(((TdApi.InternalLinkTypeChatBoost)type).url,sink);return;}
        sink.fail("Este enlace de Telegram no se puede abrir dentro de WRGram en esta versión. No se abrirá Telegram oficial.");
    }
    private void openPublicChat(String username,LinkSink sink){if(username==null||!username.matches("[A-Za-z0-9_]{3,32}")){sink.fail("El enlace no contiene un usuario válido.");return;}session.findPublic(username,chat->openChatLink(chat.id,"chat",0,sink),sink::fail);}
    private void openChatLink(long chatId,String action,long messageId,LinkSink sink){
        openChatLink(chatId,action,messageId,0,sink);
    }
    private void openChatLink(long chatId,String action,long messageId,int topicId,LinkSink sink){
        openChatDestination(chatId,messageId,topicId,session.selfId,chat->{
            JSONObject result=object("action",action,"chatId",Long.toString(chat.id),"title",chat.title);
            if(messageId!=0)result=object("action",action,"chatId",Long.toString(chat.id),"title",chat.title,"messageId",Long.toString(messageId));
            sink.ok(result);
        },sink::fail);
    }
    private void openMessageLink(TdApi.InternalLinkTypeMessage link,LinkSink sink){
        String url=TelegramLinks.normalize(link.url);
        if(url==null){sink.fail("El enlace de mensaje no es válido.");return;}
        long owner=session.selfId;
        session.perform(new TdApi.GetMessageLinkInfo(url),info->{
            if(destroyed||!currentAccount()||session.selfId!=owner){sink.fail("La cuenta cambió.");return;}
            if(info.chatId==0){sink.fail("No se encontró el mensaje o no tienes acceso a esa conversación.");return;}
            TdApi.Message message=info.message;
            TdApi.MessageTopic topic=info.topicId!=null?info.topicId:message==null?null:message.topicId;
            int topicId=topic instanceof TdApi.MessageTopicForum?((TdApi.MessageTopicForum)topic).forumTopicId:0;
            if(message!=null)session.putMessage(message);
            openChatLink(info.chatId,message==null?"chat":"message",message==null?0:message.id,topicId,sink);
        },sink::fail);
    }
    private void openBotLink(TdApi.InternalLinkTypeBotStart link,LinkSink sink){if(link.botUsername==null||!link.botUsername.matches("[A-Za-z0-9_]{3,32}")){sink.fail("El enlace no contiene un bot válido.");return;}session.findPublic(link.botUsername,chat->{if(!(chat.type instanceof TdApi.ChatTypePrivate)){sink.fail("El enlace no apunta a un bot.");return;}long userId=((TdApi.ChatTypePrivate)chat.type).userId;session.perform(new TdApi.GetUser(userId),user->{if(!(user.type instanceof TdApi.UserTypeBot)){sink.fail("El enlace no apunta a un bot.");return;}String parameter=link.startParameter==null?"":link.startParameter;String title=((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim();Dialogs.builder(activity).setTitle("Abrir bot").setMessage("Se abrirá el chat con "+(title.isEmpty()?"este bot":title)+" y se enviará /start"+(parameter.isEmpty()?".":" con su parámetro de enlace.")).setNegativeButton("Cancelar",(d,w)->sink.ok(null)).setPositiveButton("Abrir y enviar /start",(d,w)->session.perform(new TdApi.SendBotStartMessage(userId,chat.id,parameter),message->{session.putMessage(message);session.open(chat.id);sink.ok(object("action","bot","chatId",Long.toString(chat.id),"title",title.isEmpty()?chat.title:title));},sink::fail)).setOnCancelListener(d->sink.ok(null)).show();},sink::fail);},sink::fail);}
    private void openInviteLink(TdApi.InternalLinkTypeChatInvite link,LinkSink sink){
        long owner=session.selfId;
        session.perform(new TdApi.CheckChatInviteLink(link.inviteLink),info->{
            if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió.");return;}
            String title=info.title==null||info.title.isBlank()?"este chat":NativeSnapshot.limit(info.title,120);
            TdApi.ChatInviteLinkSubscriptionInfo sub=info.subscriptionInfo;
            if(sub!=null&&!sub.canReuse){
                if(sub.pricing==null||sub.pricing.starCount<=0||sub.formId==0){sink.fail("Telegram no permite pagar esta suscripción en este momento.");return;}
                long amount=sub.pricing.starCount;
                Dialogs.builder(activity).setTitle("Suscribirte con Telegram Stars")
                    .setMessage(title+"\n\nTelegram cobrará "+amount+" Stars cada "+StarsPolicy.period(sub.pricing.period)+" hasta que canceles la suscripción.")
                    .setNegativeButton("Cancelar",(d,w)->sink.ok(null)).setOnCancelListener(d->sink.ok(null))
                    .setPositiveButton("Suscribirme",(d,w)->{
                        if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió. No se envió el pago.");return;}
                        TdApi.InputInvoice invoice=new TdApi.InputInvoiceTelegram(new TdApi.TelegramPaymentPurposeJoinChat(link.inviteLink));
                        session.perform(new TdApi.SendPaymentForm(invoice,sub.formId,"","",null,0),result->{
                            if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió. Revisa la suscripción antes de reintentar.");return;}
                            if(!result.success){sink.fail("Telegram no confirmó la suscripción. Revisa el estado antes de reintentar.");return;}
                            schedule();
                            session.perform(new TdApi.CheckChatInviteLink(link.inviteLink),updated->{
                                if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió.");return;}
                                if(updated.chatId!=0)openChatLink(updated.chatId,"invite",0,sink);
                                else if(updated.subscriptionInfo!=null&&updated.subscriptionInfo.canReuse)joinConfirmedInvite(link.inviteLink,title,owner,sink);
                                else sink.ok(object("action","subscription_active","title",title));
                            },error->sink.ok(object("action","subscription_active","title",title)));
                        },sink::fail);
                    }).show();
                return;
            }
            String action=info.createsJoinRequest?"Solicitar unirme":"Unirme";
            Dialogs.builder(activity).setTitle("Invitación a Telegram")
                .setMessage(title+(info.memberCount>0?" · "+info.memberCount+" miembros":"")+"\n\n"+(sub!=null?"Tu suscripción vigente te permite volver a entrar sin otro cargo.":info.createsJoinRequest?"Se enviará una solicitud de ingreso; los administradores deben aprobarla.":"Telegram registrará tu ingreso al confirmar."))
                .setNegativeButton("Cancelar",(d,w)->sink.ok(null)).setOnCancelListener(d->sink.ok(null))
                .setPositiveButton(action,(d,w)->joinConfirmedInvite(link.inviteLink,title,owner,sink)).show();
        },sink::fail);
    }
    private void joinConfirmedInvite(String invite,String title,long owner,LinkSink sink){
        if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió.");return;}
        session.perform(new TdApi.JoinChatByInviteLink(invite),result->{
            if(!currentAccount()||owner!=session.selfId){sink.fail("La cuenta cambió.");return;}
            if(result instanceof TdApi.ChatJoinResultSuccess)openChatLink(((TdApi.ChatJoinResultSuccess)result).chatId,"invite",0,sink);
            else if(result instanceof TdApi.ChatJoinResultRequestSent)sink.ok(object("action","request_sent","title",title));
            else sink.fail("Telegram no permitió unirte a este chat.");
        },sink::fail);
    }
    private void openStoryLink(TdApi.InternalLinkTypeStory link,LinkSink sink){if(link.storyPosterUsername==null||!link.storyPosterUsername.matches("[A-Za-z0-9_]{3,32}")){sink.fail("El enlace no contiene una historia válida.");return;}session.findPublic(link.storyPosterUsername,chat->session.perform(new TdApi.GetStory(chat.id,link.storyId,false),story->{session.open(chat.id);sink.ok(object("action","story","chatId",Long.toString(chat.id),"title",chat.title,"storyId",link.storyId));},sink::fail),sink::fail);}
    private void openBoostLink(String raw,LinkSink sink){
        String url;try{url=BoostsPolicy.boostUrl(raw);}catch(Exception ignored){sink.fail("El enlace de impulso no es válido.");return;}
        session.perform(new TdApi.GetChatBoostLinkInfo(url),value->{
            if(value.chatId==0){sink.fail("Ese enlace de impulso no apunta a un chat accesible desde tu cuenta.");return;}
            session.loadChat(value.chatId,chat->{
                if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){sink.fail("Los impulsos solo existen en supergrupos y canales.");return;}
                session.open(chat.id);
                boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;
                try{sink.ok(object("action","boost","chatId",Long.toString(chat.id),"title",NativeSnapshot.limit(chat.title==null?"":chat.title,180),"channel",channel));}
                catch(Exception ignored){sink.fail("No se pudo preparar el chat del enlace de impulso.");}
            },sink::fail);
        },sink::fail);
    }
    private void openStickerLink(TdApi.InternalLinkTypeStickerSet link,LinkSink sink){session.perform(new TdApi.SearchStickerSet(link.stickerSetName,false),set->{String title=set.title==null||set.title.isBlank()?link.stickerSetName:set.title;if(set.isInstalled){sink.ok(object("action","sticker","title",title,"installed",true));return;}Dialogs.builder(activity).setTitle("Añadir stickers").setMessage("¿Añadir «"+title+"» a tus stickers de Telegram?").setNegativeButton("Cancelar",(d,w)->sink.ok(null)).setPositiveButton("Añadir",(d,w)->session.perform(new TdApi.ChangeStickerSet(set.id,true,false),ignored->sink.ok(object("action","sticker","title",title,"installed",true)),sink::fail)).setOnCancelListener(d->sink.ok(null)).show();},sink::fail);}
    private boolean managedBotContext(long owner){
        return !destroyed&&currentAccount()&&session.ready()&&session.selfId==owner;
    }

    private void openManagedBotLink(TdApi.InternalLinkTypeRequestManagedBot link,LinkSink sink){
        long owner=session.selfId;
        session.findPublic(link.managerBotUsername,chat->{
            if(!managedBotContext(owner)){sink.fail("La cuenta cambió.");return;}
            if(!(chat.type instanceof TdApi.ChatTypePrivate)){sink.fail("Telegram no encontró el bot administrador.");return;}
            long userId=((TdApi.ChatTypePrivate)chat.type).userId;
            session.perform(new TdApi.GetUser(userId),manager->{
                if(!managedBotContext(owner)){sink.fail("La cuenta cambió.");return;}
                if(!(manager.type instanceof TdApi.UserTypeBot)||!((TdApi.UserTypeBot)manager.type).canManageBots){
                    sink.fail("Este bot no puede administrar otros bots.");return;
                }
                ManagedBotDialog.show(activity,session,manager,link.suggestedBotName,link.suggestedBotUsername,true,
                        ()->managedBotContext(owner),bot->{
                            showManagedBotCreated(bot);
                            sink.ok(object("action","managed_bot_created","title",bot.firstName));
                        },()->sink.ok(null));
            },sink::fail);
        },sink::fail);
    }

    private void requestManagedBot(TdApi.Message message,TdApi.KeyboardButtonTypeRequestManagedBot button,Answer answer){
        if(!privateBotChat(message)||!(message.senderId instanceof TdApi.MessageSenderUser)){
            answer.fail("La solicitud solo funciona en el chat privado del bot administrador.");return;
        }
        TdApi.Chat source=session.chat(message.chatId);
        long managerId=((TdApi.ChatTypePrivate)source.type).userId;
        if(((TdApi.MessageSenderUser)message.senderId).userId!=managerId){answer.fail("Telegram no identificó al administrador.");return;}
        perform(new TdApi.GetUser(managerId),answer,manager->{
            if(!(manager.type instanceof TdApi.UserTypeBot)||!((TdApi.UserTypeBot)manager.type).canManageBots){
                answer.fail("Este bot no puede administrar otros bots.");return;
            }
            ManagedBotDialog.show(activity,session,manager,button.suggestedName,button.suggestedUsername,false,
                    ()->!answer.finished&&managedBotContext(answer.owner),bot->{
                        TdApi.KeyboardButtonSourceMessage origin=new TdApi.KeyboardButtonSourceMessage(message.chatId,message.id);
                        session.perform(new TdApi.ShareUsersWithBot(origin,button.id,new long[]{bot.id},false),shared->{
                            if(!managedBotContext(answer.owner))return;
                            showManagedBotCreated(bot);
                            answer.ok(object("text","Bot creado y compartido con el administrador.","showAlert",false));
                        },error->{
                            if(!managedBotContext(answer.owner))return;
                            showManagedBotCreated(bot);
                            answer.ok(object("text","El bot se creó, pero Telegram no confirmó el aviso al administrador.","showAlert",true));
                        });
                    },()->answer.ok(false));
        });
    }

    private void showManagedBotCreated(TdApi.User bot){
        String title=bot.firstName==null||bot.firstName.isBlank()?"Bot de Telegram":bot.firstName;
        Dialogs.builder(activity).setTitle("Bot creado").setMessage(title+" ya aparece en tus bots de Telegram.")
                .setPositiveButton("Aceptar",null).show();
    }

    private void openBotFather(Answer answer){
        requireAccount();
        session.findPublic("BotFather",chat->{
            if(answer.finished||!managedBotContext(answer.owner))return;
            if(!(chat.type instanceof TdApi.ChatTypePrivate)){answer.fail("Telegram no devolvió el bot oficial.");return;}
            long botId=((TdApi.ChatTypePrivate)chat.type).userId;
            perform(new TdApi.GetUser(botId),answer,user->{
                if(!(user.type instanceof TdApi.UserTypeBot)||user.verificationStatus==null||!user.verificationStatus.isVerified){
                    answer.fail("No se pudo verificar a @BotFather.");return;
                }
                Runnable openChat=()->{session.open(chat.id);answer.ok("chat");};
                if(!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)||!((TdApi.UserTypeBot)user.type).hasMainWebApp){openChat.run();return;}
                TdApi.WebAppOpenParameters parameters=new TdApi.WebAppOpenParameters(null,"WRGram",new TdApi.WebAppOpenModeFullSize());
                session.perform(new TdApi.GetMainWebApp(0,botId,"",parameters),result->{
                    if(!managedBotContext(answer.owner)||answer.finished)return;
                    if(result.url==null||result.url.url==null){openChat.run();return;}
                    launchMiniApp("BotFather",result.url.url,answer);
                },error->{if(managedBotContext(answer.owner)&&!answer.finished)openChat.run();});
            });
        },answer::fail);
    }

    private void botButton(JSONObject p,Answer answer)throws Exception{
        requireAccount();long messageId=BridgePolicy.id(p,"message");int row=p.getInt("row"),column=p.getInt("column");boolean keyboard=p.optBoolean("keyboard");if(row<0||row>=8||column<0||column>=8)throw new IllegalArgumentException();
        TdApi.Message message=session.message(messageId);if(message==null)message=searchResults.get(messageId);if(message==null||message.chatId!=session.activeChat||message.selfDestructType!=null||message.ephemeralContent!=null)throw new IllegalArgumentException("El botón del bot ya no está disponible.");
        if(keyboard){TdApi.Chat chat=session.chat(message.chatId);if(chat==null||chat.replyMarkupMessageId!=messageId||!(message.replyMarkup instanceof TdApi.ReplyMarkupShowKeyboard))throw new IllegalArgumentException("El teclado del bot cambió.");TdApi.KeyboardButton[][] rows=((TdApi.ReplyMarkupShowKeyboard)message.replyMarkup).rows;if(rows==null||row>=rows.length||rows[row]==null||column>=rows[row].length)throw new IllegalArgumentException();TdApi.KeyboardButton button=rows[row][column];if(button.type instanceof TdApi.KeyboardButtonTypeText){session.sendText(button.text,0,answer::ok);return;}if(button.type instanceof TdApi.KeyboardButtonTypeWebApp){openKeyboardWebApp(message,(TdApi.KeyboardButtonTypeWebApp)button.type,button.text,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestPhoneNumber){sharePhoneWithBot(message,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestLocation){requestLocationForBot(message,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestPoll){createPollForBot(message,(TdApi.KeyboardButtonTypeRequestPoll)button.type,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestUsers){shareUsersWithBot(message,row,column,(TdApi.KeyboardButtonTypeRequestUsers)button.type,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestChat){shareChatWithBot(message,row,column,(TdApi.KeyboardButtonTypeRequestChat)button.type,answer);return;}if(button.type instanceof TdApi.KeyboardButtonTypeRequestManagedBot){requestManagedBot(message,(TdApi.KeyboardButtonTypeRequestManagedBot)button.type,answer);return;}throw new IllegalArgumentException("Este tipo de botón no está disponible en esta beta.");}
        if(!(message.replyMarkup instanceof TdApi.ReplyMarkupInlineKeyboard))throw new IllegalArgumentException("Inline keyboard unavailable.");TdApi.InlineKeyboardButton[][] rows=((TdApi.ReplyMarkupInlineKeyboard)message.replyMarkup).rows;if(rows==null||row>=rows.length||rows[row]==null||column>=rows[row].length)throw new IllegalArgumentException();TdApi.InlineKeyboardButton button=rows[row][column];
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeUrl){openLinkOrTelegram(((TdApi.InlineKeyboardButtonTypeUrl)button.type).url,answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeLoginUrl){openLoginUrl(message,(TdApi.InlineKeyboardButtonTypeLoginUrl)button.type,answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallback){sendCallback(message,new TdApi.CallbackQueryPayloadData(((TdApi.InlineKeyboardButtonTypeCallback)button.type).data),answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallbackWithPassword){requestCallbackPassword(message,(TdApi.InlineKeyboardButtonTypeCallbackWithPassword)button.type,answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeCallbackGame){openInlineGame(message,answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeWebApp){openInlineWebApp(message,(TdApi.InlineKeyboardButtonTypeWebApp)button.type,answer);return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeCopyText){String text=((TdApi.InlineKeyboardButtonTypeCopyText)button.type).text;ClipboardManager clipboard=(ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);if(clipboard==null)throw new IllegalStateException("El portapapeles no está disponible.");clipboard.setPrimaryClip(ClipData.newPlainText("Telegram",text));answer.ok(object("text","Texto copiado al portapapeles.","showAlert",false));return;}
        if(button.type instanceof TdApi.InlineKeyboardButtonTypeUser){long userId=((TdApi.InlineKeyboardButtonTypeUser)button.type).userId;TdApi.CreatePrivateChat create=new TdApi.CreatePrivateChat();create.userId=userId;create.force=false;perform(create,answer,chat->{session.open(chat.id);answer.ok(true);});return;}
         if(button.type instanceof TdApi.InlineKeyboardButtonTypeSwitchInline){startInlineQuery(message,row,column,(TdApi.InlineKeyboardButtonTypeSwitchInline)button.type,answer);return;}
         throw new IllegalArgumentException("Este tipo de botón aún no está disponible.");
    }
    private void startInlineQuery(TdApi.Message message,int row,int column,TdApi.InlineKeyboardButtonTypeSwitchInline button,Answer answer){
        TdApi.Chat origin=session.chat(message.chatId);if(origin==null||origin.type instanceof TdApi.ChatTypeSecret){answer.fail("Inline mode no está disponible en chats secretos.");return;}
        long bot=message.viaBotUserId!=0?message.viaBotUserId:message.senderId instanceof TdApi.MessageSenderUser?((TdApi.MessageSenderUser)message.senderId).userId:0;if(bot<=0){answer.fail("Telegram no identificó el bot inline.");return;}
        String query=button.query==null?"":NativeSnapshot.limit(button.query,256);perform(new TdApi.GetUser(bot),answer,user->{
            if(!(user.type instanceof TdApi.UserTypeBot)||user.restrictionInfo!=null&&user.restrictionInfo.restrictionReason!=null&&!user.restrictionInfo.restrictionReason.isEmpty()){answer.fail("El bot inline no está disponible para esta cuenta o región.");return;}
            if(button.targetChat instanceof TdApi.TargetChatChosen){TdApi.TargetChatTypes types=((TdApi.TargetChatChosen)button.targetChat).types;if(!hasInlineTarget(types)){answer.fail("El bot no permite ningún tipo de chat compatible.");return;}String token=UUID.randomUUID().toString();InlineSelection selection=new InlineSelection(session.selfId,message.chatId,message.id,row,column,bot,query,session.senderName(message.senderId),types,message.topicId);inlineSelections.put(token,selection);while(inlineSelections.size()>16)inlineSelections.remove(inlineSelections.keySet().iterator().next());try{answer.ok(inlineSelectionDto(token,selection));}catch(Exception ignored){inlineSelections.remove(token);answer.fail("No se pudo abrir el selector de chat.");}return;}
            if(button.targetChat instanceof TdApi.TargetChatInternalLink){resolveInlineInternalLink(message,row,column,bot,query,((TdApi.TargetChatInternalLink)button.targetChat).link,answer);return;}
            if(button.targetChat!=null&&!(button.targetChat instanceof TdApi.TargetChatCurrent)){answer.fail("Este destino interno no está disponible en esta beta.");return;}
            requestInlineResults(answer.owner,message.chatId,message.chatId,bot,message.topicId,null,session.senderName(message.senderId),origin.title,query,answer);
        });
    }
    private boolean currentInternalSwitch(TdApi.Message source,int row,int column,TdApi.InternalLinkType link,String query){if(!currentAccount()||source==null||session.activeChat!=source.chatId)return false;TdApi.Message current=session.message(source.id);if(current==null||!(current.replyMarkup instanceof TdApi.ReplyMarkupInlineKeyboard))return false;TdApi.InlineKeyboardButton[][] rows=((TdApi.ReplyMarkupInlineKeyboard)current.replyMarkup).rows;if(rows==null||row<0||row>=rows.length||rows[row]==null||column<0||column>=rows[row].length||!(rows[row][column].type instanceof TdApi.InlineKeyboardButtonTypeSwitchInline))return false;TdApi.InlineKeyboardButtonTypeSwitchInline currentButton=(TdApi.InlineKeyboardButtonTypeSwitchInline)rows[row][column].type;if(!java.util.Objects.equals(currentButton.query==null?"":NativeSnapshot.limit(currentButton.query,256),query)||!(currentButton.targetChat instanceof TdApi.TargetChatInternalLink))return false;return sameInternalLink(link,((TdApi.TargetChatInternalLink)currentButton.targetChat).link);}
    private static boolean sameInternalLink(TdApi.InternalLinkType first,TdApi.InternalLinkType second){
        if(first==null||second==null||first.getClass()!=second.getClass())return false;
        if(first instanceof TdApi.InternalLinkTypePublicChat){TdApi.InternalLinkTypePublicChat a=(TdApi.InternalLinkTypePublicChat)first,b=(TdApi.InternalLinkTypePublicChat)second;return java.util.Objects.equals(a.chatUsername,b.chatUsername)&&a.openProfile==b.openProfile&&java.util.Objects.equals(a.unpaidMessagesToken,b.unpaidMessagesToken);}
        if(first instanceof TdApi.InternalLinkTypeBotStart){TdApi.InternalLinkTypeBotStart a=(TdApi.InternalLinkTypeBotStart)first,b=(TdApi.InternalLinkTypeBotStart)second;return java.util.Objects.equals(a.botUsername,b.botUsername)&&java.util.Objects.equals(a.startParameter,b.startParameter);}
        if(first instanceof TdApi.InternalLinkTypeMessage)return java.util.Objects.equals(((TdApi.InternalLinkTypeMessage)first).url,((TdApi.InternalLinkTypeMessage)second).url);
        if(first instanceof TdApi.InternalLinkTypeStory){TdApi.InternalLinkTypeStory a=(TdApi.InternalLinkTypeStory)first,b=(TdApi.InternalLinkTypeStory)second;return a.storyId==b.storyId&&java.util.Objects.equals(a.storyPosterUsername,b.storyPosterUsername);}
        if(first instanceof TdApi.InternalLinkTypeLiveStory)return java.util.Objects.equals(((TdApi.InternalLinkTypeLiveStory)first).storyPosterUsername,((TdApi.InternalLinkTypeLiveStory)second).storyPosterUsername);
        return true;
    }
    private void resolveInlineInternalLink(TdApi.Message message,int row,int column,long bot,String query,TdApi.InternalLinkType link,Answer answer){
        if(link instanceof TdApi.InternalLinkTypePublicChat){
            TdApi.InternalLinkTypePublicChat value=(TdApi.InternalLinkTypePublicChat)link;String username=value.chatUsername;
            if(value.openProfile||value.unpaidMessagesToken!=null&&!value.unpaidMessagesToken.isEmpty()||username==null||!username.matches("[A-Za-z0-9_]{3,32}")){answer.fail("Este destino abre un perfil o requiere un token de pago y no está disponible.");return;}
            session.findPublic(username,target->openInlineDestination(message,row,column,bot,query,link,target,answer),answer::fail);
            return;
        }
        if(link instanceof TdApi.InternalLinkTypeBotStart){
            TdApi.InternalLinkTypeBotStart value=(TdApi.InternalLinkTypeBotStart)link;
            if(value.botUsername==null||!value.botUsername.matches("[A-Za-z0-9_]{3,32}")){answer.fail("El destino no contiene un bot válido.");return;}
            session.findPublic(value.botUsername,target->{if(!(target.type instanceof TdApi.ChatTypePrivate)){answer.fail("El destino no apunta a un bot.");return;}session.perform(new TdApi.GetUser(((TdApi.ChatTypePrivate)target.type).userId),user->{if(!(user.type instanceof TdApi.UserTypeBot)){answer.fail("El destino no apunta a un bot.");return;}openInlineDestination(message,row,column,bot,query,link,target,answer);},answer::fail);},answer::fail);
            return;
        }
        if(link instanceof TdApi.InternalLinkTypeMessage){
            String url=TelegramLinks.normalize(((TdApi.InternalLinkTypeMessage)link).url);
            if(url==null){answer.fail("El enlace de mensaje no es válido.");return;}
            session.perform(new TdApi.GetMessageLinkInfo(url),info->{
                if(info.chatId==0){answer.fail("No se encontró el chat del mensaje enlazado.");return;}
                session.loadChat(info.chatId,target->openInlineDestination(message,row,column,bot,query,link,target,answer),answer::fail);
            },answer::fail);
            return;
        }
        if(link instanceof TdApi.InternalLinkTypeStory||link instanceof TdApi.InternalLinkTypeLiveStory){
            String username=link instanceof TdApi.InternalLinkTypeStory?((TdApi.InternalLinkTypeStory)link).storyPosterUsername:((TdApi.InternalLinkTypeLiveStory)link).storyPosterUsername;
            if(username==null||!username.matches("[A-Za-z0-9_]{3,32}")){answer.fail("El destino no contiene una historia válida.");return;}
            session.findPublic(username,target->openInlineDestination(message,row,column,bot,query,link,target,answer),answer::fail);
            return;
        }
        answer.fail("Este tipo de destino interno no está disponible en esta beta.");
    }
    private void openInlineDestination(TdApi.Message message,int row,int column,long bot,String query,TdApi.InternalLinkType link,TdApi.Chat target,Answer answer){
        if(!currentInternalSwitch(message,row,column,link,query)){answer.fail("El botón o la conversación cambió. Vuelve a pulsarlo.");return;}
        if(target.type instanceof TdApi.ChatTypeSecret||!session.unsupported(target).isEmpty()){answer.fail("El chat enlazado no admite resultados inline.");return;}
        Dialogs.builder(activity).setTitle("Abrir destino inline").setMessage("El botón dirige a "+target.title+". Telegram consultará el bot inline al continuar; no se enviará nada hasta que elijas un resultado.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Continuar",(d,w)->{if(!currentInternalSwitch(message,row,column,link,query)){answer.fail("El destino cambió. No se consultó el bot.");return;}requestInlineResults(answer.owner,message.chatId,target.id,bot,message.topicId,null,session.senderName(message.senderId),target.title,query,answer);}).setOnCancelListener(ignored->answer.ok(false)).show();
    }
    private boolean hasInlineTarget(TdApi.TargetChatTypes types){return types!=null&&(types.allowUserChats||types.allowBotChats||types.allowGroupChats||types.allowChannelChats);}
    private JSONObject inlineSelectionDto(String token,InlineSelection selection)throws Exception{return object("selectChat",true,"token",token,"bot",NativeSnapshot.limit(selection.botName==null?"bot":selection.botName,80),"allowUserChats",selection.types.allowUserChats,"allowBotChats",selection.types.allowBotChats,"allowGroupChats",selection.types.allowGroupChats,"allowChannelChats",selection.types.allowChannelChats);}
    private boolean inlineChatAllowed(TdApi.Chat chat,TdApi.TargetChatTypes types){return chat!=null&&inlineTargetTypeAllowed(chat.type,session.bot(chat),types);}
    static boolean inlineTargetTypeAllowed(TdApi.ChatType type,boolean bot,TdApi.TargetChatTypes types){if(type==null||types==null||type instanceof TdApi.ChatTypeSecret)return false;if(type instanceof TdApi.ChatTypePrivate)return bot?types.allowBotChats:types.allowUserChats;if(type instanceof TdApi.ChatTypeBasicGroup)return types.allowGroupChats;if(type instanceof TdApi.ChatTypeSupergroup)return ((TdApi.ChatTypeSupergroup)type).isChannel?types.allowChannelChats:types.allowGroupChats;return false;}
    private void requestInlineResults(long owner,long originChatId,long targetChatId,long botId,TdApi.MessageTopic topic,TdApi.TargetChatTypes types,String botName,String targetChat,String query,Answer answer){TdApi.Chat target=session.chat(targetChatId);if(target==null||target.type instanceof TdApi.ChatTypeSecret||types!=null&&!inlineChatAllowed(target,types)){answer.fail("El chat de destino ya no está disponible para este botón.");return;}session.perform(new TdApi.GetInlineQueryResults(botId,targetChatId,null,query,""),results->{if(!currentAccount()||owner!=session.selfId||originChatId!=session.activeChat){answer.fail("La conversación o la cuenta cambió. Vuelve a pulsar el botón.");return;}String token=UUID.randomUUID().toString();InlineBatch batch=new InlineBatch(owner,originChatId,targetChatId,botId,topic,types,botName,targetChat,query,results);inlineBatches.put(token,batch);while(inlineBatches.size()>16)inlineBatches.remove(inlineBatches.keySet().iterator().next());try{answer.ok(inlineBatchDto(token,batch));}catch(Exception ignored){inlineBatches.remove(token);answer.fail("No se pudieron preparar los resultados inline.");}},answer::fail);}
    private void inlineChoose(JSONObject params,Answer answer)throws Exception{requireAccount();String token=BridgePolicy.text(params,"token",64);InlineSelection selection=inlineSelections.get(token);if(selection==null||selection.expiresAt<SystemClock.elapsedRealtime()||selection.owner!=session.selfId||selection.originChatId!=session.activeChat){inlineSelections.remove(token);answer.fail("La selección de chat caducó. Vuelve a pulsar el botón del bot.");return;}long targetId=BridgePolicy.id(params,"chat");TdApi.Chat target=session.chat(targetId);if(!inlineChatAllowed(target,selection.types)){answer.fail("El bot no permite enviar resultados a este tipo de chat.");return;}TdApi.Message source=session.message(selection.messageId);if(source==null||source.chatId!=selection.originChatId||!(source.replyMarkup instanceof TdApi.ReplyMarkupInlineKeyboard)){inlineSelections.remove(token);answer.fail("El botón del bot cambió. Vuelve a pulsarlo.");return;}TdApi.InlineKeyboardButton[][] rows=((TdApi.ReplyMarkupInlineKeyboard)source.replyMarkup).rows;if(selection.row<0||rows==null||selection.row>=rows.length||rows[selection.row]==null||selection.column<0||selection.column>=rows[selection.row].length||!(rows[selection.row][selection.column].type instanceof TdApi.InlineKeyboardButtonTypeSwitchInline)){inlineSelections.remove(token);answer.fail("El botón del bot cambió. Vuelve a pulsarlo.");return;}TdApi.InlineKeyboardButtonTypeSwitchInline button=(TdApi.InlineKeyboardButtonTypeSwitchInline)rows[selection.row][selection.column].type;if(!(button.targetChat instanceof TdApi.TargetChatChosen)||!sameInlineTypes(((TdApi.TargetChatChosen)button.targetChat).types,selection.types)||!java.util.Objects.equals(button.query==null?"":NativeSnapshot.limit(button.query,256),selection.query)){inlineSelections.remove(token);answer.fail("El botón del bot cambió. Vuelve a pulsarlo.");return;}inlineSelections.remove(token);requestInlineResults(selection.owner,selection.originChatId,targetId,selection.botId,targetId==selection.originChatId?selection.originTopic:null,selection.types,selection.botName,target.title,selection.query,answer);}
    private boolean sameInlineTypes(TdApi.TargetChatTypes left,TdApi.TargetChatTypes right){return left!=null&&right!=null&&left.allowUserChats==right.allowUserChats&&left.allowBotChats==right.allowBotChats&&left.allowGroupChats==right.allowGroupChats&&left.allowChannelChats==right.allowChannelChats;}
    private void inlineCancel(JSONObject params,Answer answer)throws Exception{requireAccount();String token=BridgePolicy.text(params,"token",64);InlineSelection selection=inlineSelections.get(token);if(selection!=null&&selection.owner==session.selfId)inlineSelections.remove(token);answer.ok(true);}
    private void inlineQuery(JSONObject params,Answer answer)throws Exception{requireAccount();if(session.activeChat==0){answer.fail("Abre un chat para consultar a un bot.");return;}String username=BridgePolicy.text(params,"bot",34).trim().replaceFirst("^@","");if(!username.matches("[A-Za-z0-9_]{3,32}"))throw new IllegalArgumentException("Escribe un bot válido, por ejemplo @gif.");String query=BridgePolicy.text(params,"query",256);long owner=answer.owner;session.findPublic(username,target->{if(!(target.type instanceof TdApi.ChatTypePrivate)){answer.fail("Ese usuario no es un bot inline.");return;}long botId=((TdApi.ChatTypePrivate)target.type).userId;session.perform(new TdApi.GetUser(botId),user->{if(!(user.type instanceof TdApi.UserTypeBot)||user.restrictionInfo!=null&&user.restrictionInfo.restrictionReason!=null&&!user.restrictionInfo.restrictionReason.isEmpty()){answer.fail("Ese bot no está disponible para esta cuenta o región.");return;}requestInlineResults(owner,session.activeChat,session.activeChat,botId,null,null,username,target.title,query,answer);},answer::fail);},answer::fail);}
    private void inlineMore(JSONObject params,Answer answer)throws Exception{requireAccount();InlineBatch batch=inlineBatch(params,answer);if(batch==null)return;if(batch.nextOffset==null||batch.nextOffset.isEmpty()){answer.fail("No hay más resultados inline.");return;}String token=BridgePolicy.text(params,"token",64),offset=batch.nextOffset;session.perform(new TdApi.GetInlineQueryResults(batch.botId,batch.chatId,null,batch.query,offset),answerResults->{if(batch!=inlineBatches.get(token)||batch.owner!=session.selfId||batch.originChatId!=session.activeChat){answer.fail("La conversación cambió.");return;}batch.append(answerResults);try{answer.ok(inlineBatchDto(token,batch));}catch(Exception ignored){answer.fail("No se pudieron preparar más resultados.");}},answer::fail);}
    private void inlineSend(JSONObject params,Answer answer)throws Exception{requireAccount();String token=BridgePolicy.text(params,"token",64);InlineBatch batch=inlineBatch(params,answer);if(batch==null)return;int index=params.getInt("index");if(index<0||index>=batch.results.size())throw new IllegalArgumentException();String resultId=inlineResultId(batch.results.get(index));if(resultId==null)throw new IllegalArgumentException();TdApi.Chat target=session.chat(batch.chatId);if(target==null||target.type instanceof TdApi.ChatTypeSecret||batch.allowedTypes!=null&&!inlineChatAllowed(target,batch.allowedTypes)){answer.fail("El chat de destino ya no está disponible.");return;}inlineBatches.remove(token);perform(new TdApi.SendInlineQueryResultMessage(batch.chatId,batch.topic,null,null,batch.queryId,resultId,false),answer,sent->{if(batch.chatId!=batch.originChatId)session.open(batch.chatId);session.putMessage(sent);messagesDirty=true;schedule();answer.ok(true);});}
    private InlineBatch inlineBatch(JSONObject params,Answer answer)throws Exception{String token=BridgePolicy.text(params,"token",64);InlineBatch batch=inlineBatches.get(token);if(batch==null||batch.expiresAt<SystemClock.elapsedRealtime()||batch.owner!=session.selfId||batch.originChatId!=session.activeChat){inlineBatches.remove(token);answer.fail("Los resultados inline caducaron. Vuelve a pulsar el botón del bot.");return null;}return batch;}
    private JSONObject inlineBatchDto(String token,InlineBatch batch)throws Exception{JSONArray results=new JSONArray();for(int i=0;i<batch.results.size();i++)results.put(inlineResultDto(batch.results.get(i),i));return object("inline",true,"token",token,"bot",NativeSnapshot.limit(batch.botName==null?"bot":batch.botName,80),"query",batch.query,"target",NativeSnapshot.limit(batch.targetChat==null?"chat actual":batch.targetChat,120),"results",results,"hasMore",batch.nextOffset!=null&&!batch.nextOffset.isEmpty());}
    private JSONObject inlineResultDto(TdApi.InlineQueryResult result,int index)throws Exception{String title="Resultado inline",description="",kind="message";JSONObject mediaDto=null;
        if(result instanceof TdApi.InlineQueryResultArticle){TdApi.InlineQueryResultArticle v=(TdApi.InlineQueryResultArticle)result;title=v.title;description=v.description==null?"":v.description;if(v.thumbnail!=null)mediaDto=dto.thumbnail(v.thumbnail,title);kind="article";}
        else if(result instanceof TdApi.InlineQueryResultPhoto){TdApi.InlineQueryResultPhoto v=(TdApi.InlineQueryResultPhoto)result;title=v.title==null?"Foto":v.title;description=v.description==null?"":v.description;if(v.photo!=null&&v.photo.sizes!=null&&v.photo.sizes.length>0){TdApi.PhotoSize best=v.photo.sizes[0];for(TdApi.PhotoSize size:v.photo.sizes)if(size.width>0&&size.width<=640&&size.width>best.width)best=size;mediaDto=dto.preview(media.register(best.photo,"image/jpeg","image",title),null,v.photo.minithumbnail);}kind="photo";}
         else if(result instanceof TdApi.InlineQueryResultVideo){TdApi.InlineQueryResultVideo v=(TdApi.InlineQueryResultVideo)result;title=v.title;description=v.description==null?"":v.description;String mime=NativeSnapshot.mediaMime(v.video.mimeType,v.video.fileName);mediaDto=dto.preview(media.register(v.video.video,mime,"video",title),v.video.thumbnail,v.video.minithumbnail);kind="video";}
         else if(result instanceof TdApi.InlineQueryResultAnimation){TdApi.InlineQueryResultAnimation v=(TdApi.InlineQueryResultAnimation)result;title=v.title;String mime=NativeSnapshot.mediaMime(v.animation.mimeType,v.animation.fileName);mediaDto=dto.preview(media.register(v.animation.animation,mime,NativeSnapshot.mediaKind(mime,"video"),v.animation.fileName),v.animation.thumbnail,v.animation.minithumbnail);kind="animation";}
         else if(result instanceof TdApi.InlineQueryResultDocument){TdApi.InlineQueryResultDocument v=(TdApi.InlineQueryResultDocument)result;title=v.title;description=v.description==null?"":v.description;mediaDto=dto.documentMedia(v.document);kind="document";}
         else if(result instanceof TdApi.InlineQueryResultAudio){TdApi.InlineQueryResultAudio v=(TdApi.InlineQueryResultAudio)result;title=v.audio.title==null||v.audio.title.isEmpty()?v.audio.fileName:v.audio.title;description=v.audio.performer==null?"":v.audio.performer;String mime=NativeSnapshot.mediaMime(v.audio.mimeType,v.audio.fileName);mediaDto=dto.preview(media.register(v.audio.audio,mime,"audio",v.audio.fileName),v.audio.albumCoverThumbnail,v.audio.albumCoverMinithumbnail);kind="audio";}
        else if(result instanceof TdApi.InlineQueryResultSticker){TdApi.Sticker sticker=((TdApi.InlineQueryResultSticker)result).sticker;title=sticker.emoji==null||sticker.emoji.isEmpty()?"Sticker":sticker.emoji;mediaDto=media.register(sticker.sticker,"image/webp","image",title);kind="sticker";}
         else if(result instanceof TdApi.InlineQueryResultVoiceNote){TdApi.InlineQueryResultVoiceNote v=(TdApi.InlineQueryResultVoiceNote)result;title=v.title;mediaDto=media.register(v.voiceNote.voice,NativeSnapshot.mediaMime(v.voiceNote.mimeType,"voice.ogg"),"audio",title);kind="voice";}
        else if(result instanceof TdApi.InlineQueryResultContact){TdApi.Contact c=((TdApi.InlineQueryResultContact)result).contact;title=(c.firstName+" "+c.lastName).trim();kind="contact";}
        else if(result instanceof TdApi.InlineQueryResultLocation){TdApi.InlineQueryResultLocation v=(TdApi.InlineQueryResultLocation)result;title=v.title;kind="location";}
        else if(result instanceof TdApi.InlineQueryResultVenue){TdApi.Venue v=((TdApi.InlineQueryResultVenue)result).venue;title=v.title;description=v.address;kind="venue";}
        else if(result instanceof TdApi.InlineQueryResultGame){title=((TdApi.InlineQueryResultGame)result).game.title;kind="game";}
        JSONObject dto=object("index",index,"title",NativeSnapshot.limit(title==null||title.isEmpty()?"Resultado inline":title,160),"description",NativeSnapshot.limit(description==null?"":description,320),"kind",kind);if(mediaDto!=null)dto.put("media",mediaDto);return dto;
    }
    private String inlineResultId(TdApi.InlineQueryResult result){if(result instanceof TdApi.InlineQueryResultArticle)return ((TdApi.InlineQueryResultArticle)result).id;if(result instanceof TdApi.InlineQueryResultContact)return ((TdApi.InlineQueryResultContact)result).id;if(result instanceof TdApi.InlineQueryResultLocation)return ((TdApi.InlineQueryResultLocation)result).id;if(result instanceof TdApi.InlineQueryResultVenue)return ((TdApi.InlineQueryResultVenue)result).id;if(result instanceof TdApi.InlineQueryResultGame)return ((TdApi.InlineQueryResultGame)result).id;if(result instanceof TdApi.InlineQueryResultAnimation)return ((TdApi.InlineQueryResultAnimation)result).id;if(result instanceof TdApi.InlineQueryResultAudio)return ((TdApi.InlineQueryResultAudio)result).id;if(result instanceof TdApi.InlineQueryResultDocument)return ((TdApi.InlineQueryResultDocument)result).id;if(result instanceof TdApi.InlineQueryResultPhoto)return ((TdApi.InlineQueryResultPhoto)result).id;if(result instanceof TdApi.InlineQueryResultSticker)return ((TdApi.InlineQueryResultSticker)result).id;if(result instanceof TdApi.InlineQueryResultVideo)return ((TdApi.InlineQueryResultVideo)result).id;if(result instanceof TdApi.InlineQueryResultVoiceNote)return ((TdApi.InlineQueryResultVoiceNote)result).id;return null;}
    private void openLoginUrl(TdApi.Message message,TdApi.InlineKeyboardButtonTypeLoginUrl button,Answer answer){session.perform(new TdApi.GetLoginUrlInfo(message.chatId,message.id,button.id),info->{if(info instanceof TdApi.LoginUrlInfoOpen){openConfirmedLoginUrl(((TdApi.LoginUrlInfoOpen)info).url,answer);return;}if(info instanceof TdApi.LoginUrlInfoRequestConfirmation){TdApi.LoginUrlInfoRequestConfirmation request=(TdApi.LoginUrlInfoRequestConfirmation)info;String domain=request.domain==null?"este sitio":request.domain;AlertDialog.Builder dialog=Dialogs.builder(activity).setTitle("Iniciar sesión en "+domain).setMessage("El sitio solicita confirmar el inicio de sesión con tu cuenta de Telegram."+(request.requestWriteAccess?" También solicita permiso para que el bot pueda enviarte mensajes.":"" )).setNegativeButton("Cancelar",(d,w)->answer.ok(false));if(request.requestWriteAccess)dialog.setNeutralButton("Sin permiso de mensajes",(d,w)->fetchLoginUrl(message,button.id,false,answer)).setPositiveButton("Permitir mensajes",(d,w)->fetchLoginUrl(message,button.id,true,answer));else dialog.setPositiveButton("Continuar",(d,w)->fetchLoginUrl(message,button.id,false,answer));AlertDialog prompt=dialog.create();prompt.setOnCancelListener(ignored->answer.ok(false));prompt.show();return;}answer.fail("Telegram devolvió una confirmación de inicio no compatible.");},error->{try{ExternalLinks.open(activity,button.url,()->{},()->{});answer.ok(true);}catch(Exception ignored){answer.fail(error);}});}
    private void fetchLoginUrl(TdApi.Message message,long buttonId,boolean writeAccess,Answer answer){session.perform(new TdApi.GetLoginUrl(message.chatId,message.id,buttonId,writeAccess),url->openConfirmedLoginUrl(url.url,answer),answer::fail);}
    private void openConfirmedLoginUrl(String url,Answer answer){try{ExternalLinks.open(activity,url,()->{},()->{});answer.ok(true);}catch(Exception ignored){answer.fail("No se pudo abrir el sitio de inicio de sesión.");}}
    private void sendCallback(TdApi.Message message,TdApi.CallbackQueryPayload payload,Answer answer){perform(new TdApi.GetCallbackQueryAnswer(message.chatId,message.id,payload),answer,result->{try{if(result.url!=null&&!result.url.isBlank())ExternalLinks.open(activity,result.url,()->{},()->{});answer.ok(object("text",result.text==null?"":NativeSnapshot.limit(result.text,512),"showAlert",result.showAlert));}catch(Exception ignored){answer.fail("La respuesta del bot no se pudo mostrar.");}});}
    private void requestCallbackPassword(TdApi.Message message,TdApi.InlineKeyboardButtonTypeCallbackWithPassword button,Answer answer){EditText password=new EditText(activity);password.setSingleLine(true);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setHint("Contraseña de verificación en dos pasos");AlertDialog dialog=Dialogs.builder(activity).setTitle("Confirmar botón del bot").setMessage("Telegram necesita tu contraseña de verificación en dos pasos para procesar este botón. La contraseña se entrega a Telegram/TDLib y WRGram no la guarda. Continúa solo si confías en este bot.").setView(password).setNegativeButton("Cancelar",(d,w)->{password.setText("");answer.ok(false);}).setPositiveButton("Continuar",null).create();dialog.setOnCancelListener(ignored->{password.setText("");answer.ok(false);});dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{String secret=password.getText().toString();password.setText("");if(secret.isEmpty()){password.setError("Escribe la contraseña o cancela.");return;}dialog.dismiss();sendCallback(message,new TdApi.CallbackQueryPayloadDataWithPassword(secret,button.data),answer);}));dialog.show();}
    private void openInlineGame(TdApi.Message message,Answer answer){if(!(message.content instanceof TdApi.MessageGame)){answer.fail("Este botón de juego no está unido a un juego compatible.");return;}TdApi.Game game=((TdApi.MessageGame)message.content).game;sendCallback(message,new TdApi.CallbackQueryPayloadGame(game.shortName),answer);}
    private void openInlineWebApp(TdApi.Message message,TdApi.InlineKeyboardButtonTypeWebApp button,Answer answer){
        if(message.chatId==0||session.chat(message.chatId)==null||session.chat(message.chatId).type instanceof TdApi.ChatTypeSecret){answer.fail("Las Mini Apps no se pueden abrir en chats secretos.");return;}
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)||!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){answer.fail("Actualiza Android System WebView para abrir Mini Apps de forma aislada.");return;}
        if(!(message.senderId instanceof TdApi.MessageSenderUser)){answer.fail("Telegram no identificó al bot que publica esta Mini App.");return;}long bot=((TdApi.MessageSenderUser)message.senderId).userId;
        perform(new TdApi.GetUser(bot),answer,user->{if(!(user.type instanceof TdApi.UserTypeBot)){answer.fail("El autor de este botón ya no es un bot.");return;}TdApi.WebAppOpenParameters parameters=new TdApi.WebAppOpenParameters(null,"WRGram",new TdApi.WebAppOpenModeFullSize());perform(new TdApi.OpenWebApp(message.chatId,bot,button.url,message.topicId,null,parameters),answer,info->{if(info.url==null||info.url.url==null){answer.fail("Telegram no devolvió la dirección de la Mini App.");return;}launchMiniApp(NativeSnapshot.limit(session.senderName(message.senderId)+" · Mini App",80),info.url.url,info.launchId,answer);});});
    }
    private void openKeyboardWebApp(TdApi.Message message,TdApi.KeyboardButtonTypeWebApp button,String buttonText,Answer answer){
        if(!(message.senderId instanceof TdApi.MessageSenderUser)||session.chat(message.chatId)==null||session.chat(message.chatId).type instanceof TdApi.ChatTypeSecret){answer.fail("Telegram no identificó una conversación compatible con esta Mini App.");return;}long bot=((TdApi.MessageSenderUser)message.senderId).userId;TdApi.WebAppOpenParameters parameters=new TdApi.WebAppOpenParameters(null,"WRGram",new TdApi.WebAppOpenModeFullSize());perform(new TdApi.GetUser(bot),answer,user->{if(!(user.type instanceof TdApi.UserTypeBot)){answer.fail("El autor de este botón ya no es un bot.");return;}perform(new TdApi.GetWebAppUrl(bot,button.url,parameters),answer,result->launchKeyboardMiniApp(NativeSnapshot.limit(session.senderName(message.senderId)+" · Mini App",80),result.url,bot,buttonText,answer));});
    }
    private boolean privateBotChat(TdApi.Message message){TdApi.Chat chat=session.chat(message.chatId);return chat!=null&&chat.type instanceof TdApi.ChatTypePrivate&&session.bot(chat)&&chat.id==session.activeChat;}
    private boolean currentReplyButton(TdApi.Message source,int row,int column,int buttonId,boolean users){if(!currentAccount()||source==null||session.activeChat!=source.chatId)return false;TdApi.Chat chat=session.chat(source.chatId);TdApi.Message current=session.message(source.id);if(chat==null||current==null||chat.replyMarkupMessageId!=source.id||!(current.replyMarkup instanceof TdApi.ReplyMarkupShowKeyboard))return false;TdApi.KeyboardButton[][] rows=((TdApi.ReplyMarkupShowKeyboard)current.replyMarkup).rows;if(rows==null||row<0||row>=rows.length||rows[row]==null||column<0||column>=rows[row].length)return false;TdApi.KeyboardButtonType type=rows[row][column].type;if(users)return type instanceof TdApi.KeyboardButtonTypeRequestUsers&&((TdApi.KeyboardButtonTypeRequestUsers)type).id==buttonId;return type instanceof TdApi.KeyboardButtonTypeRequestChat&&((TdApi.KeyboardButtonTypeRequestChat)type).id==buttonId;}
    private void shareUsersWithBot(TdApi.Message message,int row,int column,TdApi.KeyboardButtonTypeRequestUsers button,Answer answer){if(!privateBotChat(message)){answer.fail("La solicitud de usuarios solo funciona en el chat privado del bot.");return;}java.util.ArrayList<TdApi.User> candidates=new java.util.ArrayList<>();java.util.ArrayList<String> labels=new java.util.ArrayList<>();for(TdApi.Chat chat:session.chatList("")){if(chat.id==message.chatId||!(chat.type instanceof TdApi.ChatTypePrivate))continue;long userId=((TdApi.ChatTypePrivate)chat.type).userId;if(userId==session.selfId)continue;TdApi.User user=session.user(userId);if(user==null)continue;boolean bot=user.type instanceof TdApi.UserTypeBot;if(button.restrictUserIsBot&&bot!=button.userIsBot||button.restrictUserIsPremium&&user.isPremium!=button.userIsPremium)continue;candidates.add(user);String name=((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim();String username=user.usernames==null||user.usernames.activeUsernames==null||user.usernames.activeUsernames.length==0?"":user.usernames.activeUsernames[0];labels.add((name.isEmpty()?chat.title:name)+(username.isEmpty()?"":" · @"+username));}if(candidates.isEmpty()){answer.fail("No hay usuarios cargados que coincidan con la solicitud del bot.");return;}int maximum=Math.max(1,Math.min(10,button.maxQuantity));boolean[] checked=new boolean[candidates.size()];java.util.LinkedHashSet<Integer> selected=new java.util.LinkedHashSet<>();AlertDialog dialog=Dialogs.builder(activity).setTitle("Elegir usuarios para compartir").setMessage("Elige hasta "+maximum+" usuarios. La lista incluye chats ya cargados en WRGram.").setMultiChoiceItems(labels.toArray(new String[0]),checked,(box,which,isChecked)->{if(isChecked&&selected.size()>=maximum){((android.app.AlertDialog)box).getListView().setItemChecked(which,false);android.widget.Toast.makeText(activity,"Máximo "+maximum+" usuarios.",android.widget.Toast.LENGTH_SHORT).show();return;}if(isChecked)selected.add(which);else selected.remove(which);((android.app.AlertDialog)box).getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!selected.isEmpty());}).setNegativeButton("Cancelar",(box,which)->answer.ok(false)).setPositiveButton("Continuar",null).create();dialog.setOnCancelListener(box->answer.ok(false));dialog.setOnShowListener(box->{android.widget.Button next=dialog.getButton(AlertDialog.BUTTON_POSITIVE);next.setEnabled(false);next.setOnClickListener(view->{if(selected.isEmpty()){answer.ok(false);dialog.dismiss();return;}long[] ids=new long[selected.size()];java.util.ArrayList<String> names=new java.util.ArrayList<>();int index=0;for(int selectedIndex:selected){TdApi.User user=candidates.get(selectedIndex);ids[index++]=user.id;names.add(labels.get(selectedIndex));}dialog.dismiss();if(!currentReplyButton(message,row,column,button.id,true)||!privateBotChat(message)){answer.fail("La conversación cambió. No se compartió ningún usuario.");return;}TdApi.KeyboardButtonSource source=new TdApi.KeyboardButtonSourceMessage(message.chatId,message.id);perform(new TdApi.ShareUsersWithBot(source,button.id,ids,true),answer,ignored->{String requested=(button.requestName?"nombre ":"")+(button.requestUsername?"usuario ":"")+(button.requestPhoto?"foto":"");String fields=requested.isEmpty()?"sus perfiles":requested.trim();Dialogs.builder(activity).setTitle("Confirmar datos para el bot").setMessage("Se compartirán con "+session.senderName(message.senderId)+" los usuarios seleccionados ("+String.join(", ",names)+") y "+fields+". No se enviará nada sin confirmar.").setNegativeButton("Cancelar",(confirm,which)->answer.ok(false)).setPositiveButton("Compartir",(confirm,which)->{if(!currentReplyButton(message,row,column,button.id,true)||!privateBotChat(message)){answer.fail("El teclado cambió. No se compartieron usuarios.");return;}perform(new TdApi.ShareUsersWithBot(source,button.id,ids,false),answer,result->answer.ok(true));}).setOnCancelListener(confirm->answer.ok(false)).show();});});});dialog.show();}
    private void shareChatWithBot(TdApi.Message message,int row,int column,TdApi.KeyboardButtonTypeRequestChat button,Answer answer){if(!privateBotChat(message)){answer.fail("La solicitud de chats solo funciona en el chat privado del bot.");return;}if(button.botIsMember||button.userAdministratorRights!=null||button.botAdministratorRights!=null){answer.fail("Esta solicitud requiere agregar el bot o conceder permisos administrativos. WRGram no realiza esos cambios automáticamente.");return;}java.util.ArrayList<TdApi.Chat> candidates=new java.util.ArrayList<>();java.util.ArrayList<String> labels=new java.util.ArrayList<>();for(TdApi.Chat chat:session.chatList("")){if(chat.id==message.chatId||chat.type instanceof TdApi.ChatTypeSecret||chat.type instanceof TdApi.ChatTypePrivate)continue;boolean channel=chat.type instanceof TdApi.ChatTypeSupergroup&&((TdApi.ChatTypeSupergroup)chat.type).isChannel;if(channel!=button.chatIsChannel)continue;candidates.add(chat);labels.add(chat.title+(channel?" · Canal":" · Grupo"));}if(candidates.isEmpty()){answer.fail("No hay chats cargados del tipo solicitado por el bot.");return;}AlertDialog dialog=Dialogs.builder(activity).setTitle("Elegir chat para compartir").setMessage("La lista incluye chats ya cargados. El bot no se agregará ni recibirá permisos administrativos.").setItems(labels.toArray(new String[0]),(box,which)->{TdApi.Chat selected=candidates.get(which);if(!currentReplyButton(message,row,column,button.id,false)||!privateBotChat(message)){answer.fail("La conversación cambió. No se compartió ningún chat.");return;}TdApi.KeyboardButtonSource source=new TdApi.KeyboardButtonSourceMessage(message.chatId,message.id);perform(new TdApi.ShareChatWithBot(source,button.id,selected.id,true),answer,ignored->{String requested=(button.requestTitle?"título ":"")+(button.requestUsername?"nombre de usuario ":"")+(button.requestPhoto?"foto":"");String fields=requested.isEmpty()?"información del chat":requested.trim();Dialogs.builder(activity).setTitle("Confirmar chat para el bot").setMessage("Se compartirá "+selected.title+" y "+fields+" con "+session.senderName(message.senderId)+". No se cambiarán membresías ni permisos.").setNegativeButton("Cancelar",(confirm,action)->answer.ok(false)).setPositiveButton("Compartir",(confirm,action)->{if(!currentReplyButton(message,row,column,button.id,false)||!privateBotChat(message)){answer.fail("El teclado cambió. No se compartió el chat.");return;}perform(new TdApi.ShareChatWithBot(source,button.id,selected.id,false),answer,result->answer.ok(true));}).setOnCancelListener(confirm->answer.ok(false)).show();});}).setNegativeButton("Cancelar",(box,which)->answer.ok(false)).create();dialog.setOnCancelListener(box->answer.ok(false));dialog.show();}
    private void sharePhoneWithBot(TdApi.Message message,Answer answer){if(!privateBotChat(message)){answer.fail("Solo puedes compartir el número con el bot en su chat privado.");return;}TdApi.User me=session.user(session.selfId);if(me==null||me.phoneNumber==null||me.phoneNumber.isEmpty()){answer.fail("Telegram no proporcionó un número que se pueda compartir.");return;}String phone=me.phoneNumber;String name=me.firstName==null||me.firstName.isEmpty()?"Contacto":me.firstName;Dialogs.builder(activity).setTitle("Compartir teléfono con el bot").setMessage("Se enviará este número de tu cuenta de Telegram al bot:\n\n"+phone+"\n\nNo se comparte sin tu confirmación.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Compartir",(d,w)->{if(!currentAccount()||session.activeChat!=message.chatId){answer.fail("La conversación cambió. No se envió el teléfono.");return;}TdApi.Contact contact=new TdApi.Contact(phone,NativeSnapshot.limit(name,64),NativeSnapshot.limit(me.lastName==null?"":me.lastName,64),"",me.id);sendBotContent(message,new TdApi.InputMessageContact(contact),answer);}).setOnCancelListener(d->answer.ok(false)).show();}
    private void requestLocationForBot(TdApi.Message message,Answer answer){if(!privateBotChat(message)){answer.fail("Solo puedes compartir una ubicación con el bot en su chat privado.");return;}if(locationAnswer!=null){answer.fail("Ya hay una solicitud de ubicación en curso.");return;}Dialogs.builder(activity).setTitle("Compartir ubicación").setMessage("El bot solicita tu ubicación actual. Android pedirá permiso y luego podrás revisar la ubicación antes de enviarla.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Continuar",(d,w)->{if(!currentAccount()||session.activeChat!=message.chatId){answer.fail("La conversación cambió. No se solicitó ubicación.");return;}locationAnswer=answer;locationChat=message.chatId;locationSource=message;activity.requestBotLocationPermission();}).setOnCancelListener(d->answer.ok(false)).show();}
    void botLocationPermissionResult(boolean granted){Answer answer=locationAnswer;long chatId=locationChat;TdApi.Message source=locationSource;long replyTo=locationReply;boolean silent=locationSilent;locationAnswer=null;locationChat=0;locationSource=null;locationReply=0;locationSilent=false;if(answer==null||answer.finished)return;if(!granted){answer.fail("No se concedió permiso. No se envió ninguna ubicación.");return;}if(!currentAccount()||!session.ready()||session.activeChat!=chatId){answer.fail("La conversación o la cuenta cambió. No se envió la ubicación.");return;}android.location.LocationManager manager=(android.location.LocationManager)activity.getSystemService(Context.LOCATION_SERVICE);android.location.Location latest=null;if(manager!=null){for(String provider:new String[]{android.location.LocationManager.NETWORK_PROVIDER,android.location.LocationManager.GPS_PROVIDER})try{android.location.Location candidate=manager.getLastKnownLocation(provider);if(candidate!=null&&(latest==null||candidate.getTime()>latest.getTime()))latest=candidate;}catch(SecurityException ignored){}}if(latest==null||System.currentTimeMillis()-latest.getTime()>5*60_000L){answer.fail("Android no tiene una ubicación reciente. No se envió nada; inténtalo cuando haya una señal disponible.");return;}float meters=latest.hasAccuracy()?latest.getAccuracy():0;String estimate=String.format(java.util.Locale.ROOT,"%.5f, %.5f (±%.0f m)",latest.getLatitude(),latest.getLongitude(),meters);android.location.Location location=latest;TdApi.Chat chat=session.chat(chatId);String destination=source!=null?"al bot":chat==null?"en esta conversación":"en “"+NativeSnapshot.limit(chat.title,80)+"”";Dialogs.builder(activity).setTitle("Confirmar ubicación").setMessage("Se enviará "+destination+" esta ubicación reciente:\n\n"+estimate).setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Enviar ubicación",(d,w)->{if(!currentAccount()||session.activeChat!=chatId){answer.fail("La conversación cambió. No se envió la ubicación.");return;}TdApi.InputMessageLocation content=new TdApi.InputMessageLocation(new TdApi.Location(location.getLatitude(),location.getLongitude(),meters));if(source!=null)sendBotContent(source,content,answer);else session.sendContent(content,replyTo,silent,answer::ok);}).setOnCancelListener(d->answer.ok(false)).show();}
    private void createPollForBot(TdApi.Message message,TdApi.KeyboardButtonTypeRequestPoll requested,Answer answer){if(!privateBotChat(message)){answer.fail("Este teclado solo permite crear una encuesta en el chat privado del bot.");return;}LinearLayout form=new LinearLayout(activity);form.setOrientation(LinearLayout.VERTICAL);int pad=Math.round(16*activity.getResources().getDisplayMetrics().density);form.setPadding(pad,pad,pad,0);EditText question=new EditText(activity);question.setSingleLine(true);question.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(255)});question.setHint("Pregunta de la encuesta");EditText options=new EditText(activity);options.setMinLines(3);options.setGravity(android.view.Gravity.TOP);options.setHint("Una opción por línea (mínimo 2)");form.addView(question);form.addView(options);EditText correct=new EditText(activity);if(requested.forceQuiz){correct.setSingleLine(true);correct.setInputType(InputType.TYPE_CLASS_NUMBER);correct.setHint("Número de la respuesta correcta (1, 2…)");form.addView(correct);}AlertDialog dialog=Dialogs.builder(activity).setTitle(requested.forceQuiz?"Crear cuestionario":"Crear encuesta").setMessage("Revisa la pregunta y opciones antes de enviarlas al bot.").setView(form).setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Crear y enviar",null).create();dialog.setOnCancelListener(ignored->answer.ok(false));dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{String q=question.getText().toString().trim();java.util.ArrayList<String> values=new java.util.ArrayList<>();for(String line:options.getText().toString().split("\\R")){String value=line.trim();if(!value.isEmpty())values.add(value);}if(q.isEmpty()||values.size()<2||values.size()>10||values.stream().anyMatch(value->value.length()>100)){options.setError("Escribe entre 2 y 10 opciones, de hasta 100 caracteres.");return;}TdApi.InputPollType pollType;if(requested.forceQuiz){int selected;try{selected=Integer.parseInt(correct.getText().toString().trim())-1;}catch(Exception ignoredParse){correct.setError("Indica el número de una opción correcta.");return;}if(selected<0||selected>=values.size()){correct.setError("El número debe corresponder a una opción.");return;}pollType=new TdApi.InputPollTypeQuiz(new int[]{selected},null,null);}else pollType=new TdApi.InputPollTypeRegular(false);TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();poll.question=new TdApi.FormattedText(q,new TdApi.TextEntity[0]);poll.options=new TdApi.InputPollOption[values.size()];for(int i=0;i<values.size();i++)poll.options[i]=new TdApi.InputPollOption(new TdApi.FormattedText(values.get(i),new TdApi.TextEntity[0]),null);poll.isAnonymous=true;poll.allowsMultipleAnswers=false;poll.type=pollType;dialog.dismiss();sendBotContent(message,poll,answer);}));dialog.show();}
    private void sendBotContent(TdApi.Message source,TdApi.InputMessageContent content,Answer answer){if(source==null||!currentAccount()||session.activeChat!=source.chatId||!privateBotChat(source)){answer.fail("La conversación ya no está disponible. No se envió el dato.");return;}TdApi.SendMessage send=new TdApi.SendMessage();send.chatId=source.chatId;send.topicId=source.topicId;send.inputMessageContent=content;perform(send,answer,message->{session.putMessage(message);messagesDirty=true;schedule();answer.ok(true);});}
    private void openApp(String id,boolean miniApp,Answer answer){
        requireAccount();BuiltInApps.App app=BuiltInApps.require(id);
        if(miniApp&&!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){answer.fail("Actualiza Android System WebView para abrir Mini Apps de forma aislada.");return;}
        session.findPublic(app.username,chat->{
            if(answer.finished||destroyed||!currentAccount()||answer.owner!=session.selfId)return;
            if(!(chat.type instanceof TdApi.ChatTypePrivate)){answer.fail("Telegram no devolvió el bot esperado.");return;}
            long bot=((TdApi.ChatTypePrivate)chat.type).userId;
            perform(new TdApi.GetUser(bot),answer,user->{
                if(!(user.type instanceof TdApi.UserTypeBot)||user.restrictionInfo!=null&&user.restrictionInfo.restrictionReason!=null&&!user.restrictionInfo.restrictionReason.isEmpty()){answer.fail("El bot no está disponible para esta cuenta o región.");return;}
                if(!miniApp){session.open(chat.id);answer.ok(true);return;}
                if(((TdApi.UserTypeBot)user.type).hasMainWebApp){TdApi.GetMainWebApp get=new TdApi.GetMainWebApp(0,bot,"",new TdApi.WebAppOpenParameters(null,"WRGram",new TdApi.WebAppOpenModeFullSize()));perform(get,answer,result->launchMiniApp(app.name,result.url.url,answer));return;}
                // User clients read the bot's published side-menu button from its public full info.
                perform(new TdApi.GetUserFullInfo(bot),answer,full->{TdApi.BotMenuButton menu=full.botInfo==null?null:full.botInfo.menuButton;if(menu==null||menu.url==null||menu.url.isBlank()){answer.fail("Este bot no publica una Mini App principal ni un botón de menú. Abre la Mini App desde uno de sus botones inline/de respuesta, si la ofrece.");return;}TdApi.WebAppOpenParameters parameters=new TdApi.WebAppOpenParameters(null,"WRGram",new TdApi.WebAppOpenModeFullSize());perform(new TdApi.OpenWebApp(chat.id,bot,menu.url,null,null,parameters),answer,result->{if(result.url==null||result.url.url==null){answer.fail("Telegram no devolvió la dirección de la Mini App.");return;}launchMiniApp(app.name,result.url.url,result.launchId,answer);});});
            });
        },answer::fail);
    }
    private void launchMiniApp(String title,String url,Answer answer){if(answer.finished||destroyed||!currentAccount()||answer.owner!=session.selfId)return;String handle=MiniAppLaunch.put(session,title,url);activity.startActivity(new Intent(activity,MiniAppActivity.class).putExtra("launch",handle));answer.ok(true);}
    private void launchMiniApp(String title,String url,long launchId,Answer answer){if(answer.finished||destroyed||!currentAccount()||answer.owner!=session.selfId)return;String handle=MiniAppLaunch.put(session,title,url,launchId);activity.startActivity(new Intent(activity,MiniAppActivity.class).putExtra("launch",handle));answer.ok(true);}
    private void launchKeyboardMiniApp(String title,String url,long botId,String buttonText,Answer answer){if(answer.finished||destroyed||!currentAccount()||answer.owner!=session.selfId)return;String handle=MiniAppLaunch.putKeyboard(session,title,url,botId,buttonText);activity.startActivity(new Intent(activity,MiniAppActivity.class).putExtra("launch",handle));answer.ok(true);}
    private void sponsored(String method,JSONObject p,Answer answer){requireAccount();if(BridgePolicy.id(p,"chat")!=session.activeChat)throw new IllegalArgumentException();long id=BridgePolicy.id(p,"id");TdApi.SponsoredMessage ad=session.sponsored.get(id);if(ad==null)throw new IllegalArgumentException();if(method.equals("sponsored.view")){TdApi.ViewMessages view=new TdApi.ViewMessages();view.chatId=session.activeChat;view.messageIds=new long[]{id};view.source=new TdApi.MessageSourceChatHistory();perform(view,answer,result->answer.ok(true));}else{if(ad.sponsor==null)throw new IllegalArgumentException();final long chat=session.activeChat;ExternalLinks.open(activity,ad.sponsor.url,()->session.perform(new TdApi.ClickChatSponsoredMessage(chat,id,false,false),result->{},failure->{}),()->{});answer.ok(true);}}
    private void chatProfile(JSONObject p,Answer answer){
        TdApi.Chat chat=target(p);
        if(chat.type instanceof TdApi.ChatTypePrivate){
            long userId=((TdApi.ChatTypePrivate)chat.type).userId;
            perform(new TdApi.GetUserFullInfo(userId),answer,info->{
                try{
                    TdApi.User user=session.user(userId);
                    String username="";JSONArray usernames=new JSONArray();
                    if(user!=null&&user.usernames!=null&&user.usernames.activeUsernames!=null)for(String value:user.usernames.activeUsernames)if(value!=null&&!value.isEmpty()){usernames.put(value);if(username.isEmpty())username=value;}
                    TdApi.FormattedText bio=info.bio;
                    if((bio==null||bio.text.isBlank())&&info.botInfo!=null)bio=new TdApi.FormattedText(info.botInfo.description,new TdApi.TextEntity[0]);
                    JSONObject profile=object("id",Long.toString(userId),"title",chat.title,"username",username,"usernames",usernames,
                            "bio",bio==null||bio.text==null?"":bio.text,"bioEntities",NativeSnapshot.entities(bio),
                            "bot",user!=null&&user.type instanceof TdApi.UserTypeBot,"groupCount",info.groupInCommonCount,
                            "hasStories",info.hasPostedToProfileStories,"photo",profilePhoto(info.photo,chat.title),
                            "blocked",info.blockList instanceof TdApi.BlockListMain);
                    if(user!=null){
                        profile.put("phone",user.phoneNumber==null?"":user.phoneNumber).put("premium",user.isPremium)
                                .put("verified",user.verificationStatus!=null&&user.verificationStatus.isVerified)
                                .put("presence",presence(user.status)).put("emojiStatus",NativeSnapshot.emojiStatus(user));
                    }
                    if(info.birthdate!=null)profile.put("birthday",object("day",info.birthdate.day,"month",info.birthdate.month,"year",info.birthdate.year));
                    if(info.botInfo!=null){
                        JSONArray commands=new JSONArray();
                        if(info.botInfo.commands!=null)for(TdApi.BotCommand command:info.botInfo.commands)
                            commands.put(object("name",command.command,"description",command.description));
                        profile.put("commands",commands).put("privacyUrl",info.botInfo.privacyPolicyUrl);
                    }
                    answer.ok(profile);
                }catch(Exception ignored){answer.fail("No se pudo cargar el perfil público.");}
            });
            return;
        }
        if(chat.type instanceof TdApi.ChatTypeSupergroup){
            long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
            TdApi.Supergroup group=session.supergroup(supergroupId);
            if(group!=null){sendPublicChatProfile(chat,group,answer);return;}
            perform(new TdApi.GetSupergroup(supergroupId),answer,loaded->sendPublicChatProfile(chat,loaded,answer));
            return;
        }
        if(chat.type instanceof TdApi.ChatTypeBasicGroup){
            long id=((TdApi.ChatTypeBasicGroup)chat.type).basicGroupId;
            perform(new TdApi.GetBasicGroupFullInfo(id),answer,info->answer.ok(object("id",Long.toString(chat.id),"title",chat.title,"username","","bio",info.description,
                    "memberCount",info.members==null?0:info.members.length,"canViewMembers",info.members!=null&&info.members.length>0)));
            return;
        }
        answer.ok(object("id",Long.toString(chat.id),"title",chat.title,"username","","bio",""));
    }
    private void sendPublicChatProfile(TdApi.Chat chat,TdApi.Supergroup group,Answer answer){
        try{
            String username="";JSONArray usernames=new JSONArray();
            if(group!=null&&group.usernames!=null&&group.usernames.activeUsernames!=null)for(String value:group.usernames.activeUsernames)if(value!=null&&!value.isEmpty()){usernames.put(value);if(username.isEmpty())username=value;}
            final String primary=username;
            long groupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
            perform(new TdApi.GetSupergroupFullInfo(groupId),answer,info->{
                boolean admin=group.status instanceof TdApi.ChatMemberStatusCreator;
                if(group.status instanceof TdApi.ChatMemberStatusAdministrator){
                    TdApi.ChatAdministratorRights rights=((TdApi.ChatMemberStatusAdministrator)group.status).rights;
                    admin=rights!=null&&(rights.canRestrictMembers||rights.canPromoteMembers);
                }
                answer.ok(object("id",Long.toString(chat.id),"title",chat.title,"username",primary,"usernames",usernames,
                        "bio",info.description,"memberCount",info.memberCount,"administratorCount",admin?info.administratorCount:0,
                        "canViewMembers",info.canGetMembers,"canManageMembers",admin,"linkedChatId",Long.toString(info.linkedChatId),
                        "hasStories",info.hasPinnedStories,"isForum",group.isForum,
                        "verified",group.verificationStatus!=null&&group.verificationStatus.isVerified,
                        "photo",profilePhoto(info.photo,chat.title)));
            });
        }catch(Exception ignored){answer.fail("No se pudo cargar el perfil público.");}
    }
    private JSONObject profilePhoto(TdApi.ChatPhoto photo,String title){
        if(photo==null)return null;
        TdApi.PhotoSize best=null;
        if(photo.sizes!=null)for(TdApi.PhotoSize size:photo.sizes)
            if(size!=null&&size.photo!=null&&(best==null||size.width>best.width))best=size;
        try{return dto.photoDto(null,best==null?null:best.photo,photo.minithumbnail,title);}
        catch(Exception ignored){return null;}
    }
    private void profileBlock(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypePrivate))throw new IllegalArgumentException("Esta acción solo está disponible para usuarios y bots.");
        long userId=((TdApi.ChatTypePrivate)chat.type).userId;
        if(userId==session.selfId)throw new IllegalArgumentException("Esta es tu propia cuenta.");
        boolean block=params.getBoolean("value");
        perform(new TdApi.SetMessageSenderBlockList(new TdApi.MessageSenderUser(userId),block?new TdApi.BlockListMain():null),answer,ignored->answer.ok(true));
    }
    private static String presence(TdApi.UserStatus status){
        if(status instanceof TdApi.UserStatusOnline&&((TdApi.UserStatusOnline)status).expires>System.currentTimeMillis()/1000)return "En línea";
        if(status instanceof TdApi.UserStatusOffline){
            int at=((TdApi.UserStatusOffline)status).wasOnline;
            if(at>0)return "Última vez "+java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.SHORT).format(new java.util.Date(at*1000L));
        }
        if(status instanceof TdApi.UserStatusRecently)return "Últ. vez recientemente";
        if(status instanceof TdApi.UserStatusLastWeek)return "Últ. vez esta semana";
        if(status instanceof TdApi.UserStatusLastMonth)return "Últ. vez este mes";
        return "";
    }
    private void profileRelated(JSONObject params,Answer answer){
        TdApi.Chat chat=target(params);
        int offset=Math.max(0,Math.min(5000,params.optInt("offset",0)));
        if(chat.type instanceof TdApi.ChatTypePrivate){
            long userId=((TdApi.ChatTypePrivate)chat.type).userId;
            long cursor=params.has("cursor")?BridgePolicy.id(params,"cursor"):0;
            perform(new TdApi.GetGroupsInCommon(userId,cursor,30),answer,result->{
                JSONArray rows=new JSONArray();
                for(long id:result.chatIds){
                    TdApi.Chat common=session.chat(id);
                    if(common!=null)try{rows.put(dto.chat(common));}catch(Exception ignored){}
                }
                int count=result.chatIds.length;
                answer.ok(object("chats",rows,"nextCursor",count==30?Long.toString(result.chatIds[count-1]):"0"));
            });
        }else if(chat.type instanceof TdApi.ChatTypeBasicGroup){
            long groupId=((TdApi.ChatTypeBasicGroup)chat.type).basicGroupId;
            perform(new TdApi.GetBasicGroupFullInfo(groupId),answer,result->profileMembers(result.members,offset,true,answer));
        }else if(chat.type instanceof TdApi.ChatTypeSupergroup){
            long groupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
            perform(new TdApi.GetSupergroupMembers(groupId,new TdApi.SupergroupMembersFilterRecent(),offset,30),answer,
                    result->profileMembers(result.members,offset,false,answer));
        }else answer.fail("No hay una lista de participantes para este chat.");
    }
    private void profileMembers(TdApi.ChatMember[] members,int offset,boolean local,Answer answer){
        JSONArray rows=new JSONArray();
        int length=members==null?0:members.length;
        int start=local?offset:0,end=Math.min(length,start+30);
        for(int i=start;i<end;i++){
            TdApi.ChatMember member=members[i];
            if(member.memberId instanceof TdApi.MessageSenderUser){
                long id=TdSession.senderId(member.memberId);
                TdApi.User user=session.user(id);
                String role=member.status instanceof TdApi.ChatMemberStatusCreator?"Creador":member.status instanceof TdApi.ChatMemberStatusAdministrator?"Administrador":"";
                try{rows.put(object("id",Long.toString(id),"name",session.senderName(member.memberId),"role",role,"photo",dto.userPhoto(user)));}
                catch(Exception ignored){}
            }
        }
        answer.ok(object("members",rows,"nextOffset",local?end:offset+end,"hasMore",local?end<length:length==30));
    }
    private void senderProfile(JSONObject params,Answer answer){
        requireAccount();
        long chatId=BridgePolicy.id(params,"chatId"), messageId=BridgePolicy.id(params,"id");
        TdApi.Message message=session.message(messageId);
        if(message==null||message.chatId!=chatId)message=searchResults.get(messageId);
        TdApi.Chat source=session.chat(chatId);
        if(message==null||message.chatId!=chatId||source==null||source.type instanceof TdApi.ChatTypeSecret||message.selfDestructType!=null||message.ephemeralContent!=null){
            answer.fail("Este perfil no está disponible.");return;
        }
        Consumer<TdApi.Chat> complete=chat->respondProfilePeer(chat,answer);
        if(message.senderId instanceof TdApi.MessageSenderUser){
            long user=((TdApi.MessageSenderUser)message.senderId).userId;
            perform(new TdApi.CreatePrivateChat(user,false),answer,complete);
        }else if(message.senderId instanceof TdApi.MessageSenderChat){
            long sender=((TdApi.MessageSenderChat)message.senderId).chatId;
            TdApi.Chat existing=session.chat(sender);
            if(existing!=null)complete.accept(existing);else perform(new TdApi.GetChat(sender),answer,complete);
        }else answer.fail("Telegram no identificó al remitente.");
    }
    private void respondProfilePeer(TdApi.Chat chat,Answer answer){
        session.rememberProfileChat(chat);
        try{answer.ok(dto.chat(chat));}catch(Exception ignored){answer.fail("No se pudo preparar el perfil.");}
    }
    private void accountProfile(Answer answer){
        requireAccount();
        perform(new TdApi.GetMe(),answer,user->perform(new TdApi.GetUserFullInfo(user.id),answer,info->{
            try{
                String username="";JSONArray usernames=new JSONArray();
                if(user.usernames!=null&&user.usernames.activeUsernames!=null)for(String value:user.usernames.activeUsernames)if(value!=null&&!value.isEmpty()){usernames.put(value);if(username.isEmpty())username=value;}
                JSONObject profile=object("id",Long.toString(user.id),"firstName",user.firstName==null?"":user.firstName,"lastName",user.lastName==null?"":user.lastName,"username",username,"bio",info.bio==null||info.bio.text==null?"":info.bio.text,"bioEntities",NativeSnapshot.entities(info.bio),"photoId",user.profilePhoto==null?"0":Long.toString(user.profilePhoto.id),"phoneNumber",user.phoneNumber==null?"":user.phoneNumber,"usernames",usernames,"editableUsername",user.usernames==null||user.usernames.editableUsername==null?"":user.usernames.editableUsername);
                if(info.birthdate!=null)profile.put("birthday",object("day",info.birthdate.day,"month",info.birthdate.month,"year",info.birthdate.year));
                TdApi.BusinessInfo business=info.businessInfo;
                if(business!=null){
                    JSONObject value=object("nextOpenIn",business.nextOpenIn,"nextCloseIn",business.nextCloseIn,"address",business.location==null||business.location.address==null?"":business.location.address);
                    TdApi.BusinessOpeningHours hours=business.openingHours!=null?business.openingHours:business.localOpeningHours;
                    if(hours!=null){value.put("timeZoneId",hours.timeZoneId==null?"":hours.timeZoneId);JSONArray intervals=new JSONArray();if(hours.openingHours!=null)for(TdApi.BusinessOpeningHoursInterval interval:hours.openingHours)intervals.put(object("startMinute",interval.startMinute,"endMinute",interval.endMinute));value.put("hours",intervals);}
                    if(business.greetingMessageSettings!=null)value.put("greeting",object("shortcutId",String.valueOf(business.greetingMessageSettings.shortcutId),"inactivityDays",business.greetingMessageSettings.inactivityDays,"recipients",recipientsDto(business.greetingMessageSettings.recipients)));
                    if(business.awayMessageSettings!=null){
                        TdApi.BusinessAwayMessageSettings away=business.awayMessageSettings;
                        JSONObject schedule=new JSONObject();
                        if(away.schedule instanceof TdApi.BusinessAwayMessageScheduleOutsideOfOpeningHours)schedule.put("type","outside");
                        else if(away.schedule instanceof TdApi.BusinessAwayMessageScheduleCustom){TdApi.BusinessAwayMessageScheduleCustom custom=(TdApi.BusinessAwayMessageScheduleCustom)away.schedule;schedule.put("type","custom").put("startDate",custom.startDate).put("endDate",custom.endDate);}
                        else schedule.put("type","always");
                        value.put("away",object("shortcutId",String.valueOf(away.shortcutId),"offlineOnly",away.offlineOnly,"schedule",schedule,"recipients",recipientsDto(away.recipients)));
                    }
                    if(business.startPage!=null&&(business.startPage.title!=null&&!business.startPage.title.isEmpty()||business.startPage.message!=null&&!business.startPage.message.isEmpty()))value.put("startPage",object("title",business.startPage.title==null?"":business.startPage.title,"message",business.startPage.message==null?"":business.startPage.message));
                    profile.put("business",value);
                }
                answer.ok(profile);
            }catch(Exception ignored){answer.fail("No se pudo cargar el perfil.");}
        }));
    }
    private void deleteAccountPhoto(Answer answer){requireAccount();perform(new TdApi.GetMe(),answer,user->{long photoId=user.profilePhoto==null?0:user.profilePhoto.id;if(photoId<=0){answer.ok(false);return;}Dialogs.builder(activity).setTitle("Eliminar foto de perfil").setMessage("La foto actual se quitará de tu perfil de Telegram. WRGram no conserva una copia.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Eliminar foto",(d,w)->perform(new TdApi.DeleteProfilePhoto(photoId),answer,ignored->{schedule();answer.ok(true);})).setOnCancelListener(ignored->answer.ok(false)).show();});}
    void cameraResult(boolean saved){
        Uri uri=activity.cameraOutput();activity.clearCameraOutput();
        Answer answer=picking;
        if(!saved){picking=null;if(answer!=null)answer.ok(null);return;}
        if(uri==null){picking=null;if(answer!=null)answer.fail("La cámara no devolvió ninguna foto.");return;}
        picked(uri);
    }
    void pickedProfilePhoto(Uri uri){
        Answer answer=profilePhotoPicking;if(answer==null)return;if(uri==null){profilePhotoPicking=null;answer.ok(false);return;}long owner=answer.owner;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            File output=null;Bitmap decoded=null,oriented=null,crop=null,scaled=null,preview=null;
            try{
                String mime=activity.getContentResolver().getType(uri);if(mime==null||!mime.startsWith("image/"))throw new IllegalArgumentException();
                try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0)&&cursor.getLong(0)>20L*1024*1024)throw new IllegalArgumentException();}
                BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;try(InputStream input=activity.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException();BitmapFactory.decodeStream(input,null,bounds);}if(bounds.outWidth<=0||bounds.outHeight<=0||bounds.outWidth>12000||bounds.outHeight>12000)throw new IllegalArgumentException();
                BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>2048)options.inSampleSize*=2;options.inPreferredConfig=Bitmap.Config.ARGB_8888;try(InputStream input=activity.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException();decoded=BitmapFactory.decodeStream(input,null,options);}if(decoded==null)throw new IllegalArgumentException();
                int rotation=0;boolean flip=false;try(InputStream input=activity.getContentResolver().openInputStream(uri)){if(input!=null){androidx.exifinterface.media.ExifInterface exif=new androidx.exifinterface.media.ExifInterface(input);int orientation=exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL);rotation=orientation==3||orientation==4?180:orientation==5||orientation==6?90:orientation==7||orientation==8?270:0;flip=orientation==2||orientation==4||orientation==5||orientation==7;}}
                Matrix matrix=new Matrix();if(rotation!=0)matrix.postRotate(rotation);if(flip)matrix.postScale(-1f,1f);oriented=rotation==0&&!flip?decoded:Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),matrix,true);int side=Math.min(oriented.getWidth(),oriented.getHeight());crop=Bitmap.createBitmap(oriented,(oriented.getWidth()-side)/2,(oriented.getHeight()-side)/2,side,side);scaled=Bitmap.createScaledBitmap(crop,640,640,true);
                File directory=new File(session.filesDirectory(),"profile");if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException();output=new File(directory,UUID.randomUUID()+".jpg");try(FileOutputStream stream=new FileOutputStream(output)){if(!scaled.compress(Bitmap.CompressFormat.JPEG,88,stream))throw new IllegalStateException();}preview=BitmapFactory.decodeFile(output.getAbsolutePath());if(preview==null)throw new IllegalStateException();
                File photo=output;Bitmap image=preview;main.post(()->{if(destroyed||!currentAccount()||session.selfId!=owner){photo.delete();image.recycle();profilePhotoPicking=null;answer.fail("La cuenta cambió. No se estableció la foto.");return;}profilePhotoFile=photo;showProfilePhotoConfirmation(photo,image,answer,owner);});output=null;preview=null;
            }catch(Exception failure){if(output!=null)output.delete();main.post(()->{profilePhotoPicking=null;answer.fail("No se pudo preparar la imagen. Elige una foto válida de hasta 20 MB.");});}
            finally{if(decoded!=null&&!decoded.isRecycled())decoded.recycle();if(oriented!=null&&oriented!=decoded&&!oriented.isRecycled())oriented.recycle();if(crop!=null&&crop!=oriented&&crop!=decoded&&!crop.isRecycled())crop.recycle();if(scaled!=null&&scaled!=crop&&scaled!=oriented&&scaled!=decoded&&!scaled.isRecycled())scaled.recycle();if(preview!=null&&!preview.isRecycled())preview.recycle();}
        });
    }
    private void showProfilePhotoConfirmation(File photo,Bitmap image,Answer answer,long owner){
        ImageView view=new ImageView(activity);view.setImageBitmap(image);view.setScaleType(ImageView.ScaleType.CENTER_CROP);int width=Math.round(240*activity.getResources().getDisplayMetrics().density);view.setLayoutParams(new android.view.ViewGroup.LayoutParams(width,width));
        AlertDialog dialog=Dialogs.builder(activity).setTitle("Confirmar foto de perfil").setMessage("Esta foto se establecerá en Telegram. No se cambiará su privacidad y WRGram no la enviará a sus servidores.").setView(view).setNegativeButton("Cancelar",(d,w)->finishProfilePhoto(photo,image,answer,false,null)).setPositiveButton("Establecer foto",null).create();
        dialog.setOnCancelListener(ignored->finishProfilePhoto(photo,image,answer,false,null));
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            if(!currentAccount()||session.selfId!=owner){dialog.setOnCancelListener(null);dialog.dismiss();finishProfilePhoto(photo,image,answer,false,"La cuenta cambió. No se estableció la foto.");return;}
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            session.perform(new TdApi.SetProfilePhoto(new TdApi.InputChatPhotoStatic(new TdApi.InputFileLocal(photo.getAbsolutePath())),false),result->{schedule();dialog.setOnCancelListener(null);dialog.dismiss();finishProfilePhoto(photo,image,answer,true,null);},error->{dialog.setOnCancelListener(null);dialog.dismiss();finishProfilePhoto(photo,image,answer,false,error);});
        }));
        dialog.show();
    }
    private void finishProfilePhoto(File photo,Bitmap image,Answer answer,boolean saved,String error){if(profilePhotoFile==photo)profilePhotoFile=null;if(profilePhotoPicking==answer)profilePhotoPicking=null;if(photo!=null)photo.delete();if(image!=null&&!image.isRecycled())image.recycle();if(error!=null)answer.fail(error);else answer.ok(saved);}
    private void deleteProfilePhotoFile(){File file=profilePhotoFile;profilePhotoFile=null;if(file!=null)file.delete();}
    private void accountSessions(Answer answer){requireAccount();perform(new TdApi.GetActiveSessions(),answer,result->{try{JSONArray items=new JSONArray();if(result.sessions!=null)for(TdApi.Session item:result.sessions)items.put(object("id",Long.toString(item.id),"current",item.isCurrent,"device",item.deviceModel==null?"Dispositivo":item.deviceModel,"platform",item.platform==null?"":item.platform,"version",item.applicationName==null?"":item.applicationName+" "+(item.applicationVersion==null?"":item.applicationVersion),"location",item.location==null?"":item.location,"ip",item.ipAddress==null?"":item.ipAddress,"lastActive",item.lastActiveDate));answer.ok(items);}catch(Exception ignored){answer.fail("No se pudieron consultar las sesiones.");}});}
    private void contacts(String mode,String query,Answer answer){requireAccount();TdApi.Function<TdApi.Users> request=mode.equals("search")?new TdApi.SearchContacts(query,50):new TdApi.GetContacts();perform(request,answer,result->{try{JSONArray values=new JSONArray();if(result.userIds!=null)for(long id:result.userIds){TdApi.User user=session.user(id);if(user==null)continue;String name=((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim();String username=user.usernames==null||user.usernames.activeUsernames==null||user.usernames.activeUsernames.length==0?"":user.usernames.activeUsernames[0];JSONObject contact=object("id",Long.toString(id),"name",name.isEmpty()?"Usuario":name,"username",username,"bot",user.type instanceof TdApi.UserTypeBot);JSONObject photo=dto.userPhoto(user);if(photo!=null)contact.put("photo",photo);values.put(contact);}answer.ok(values);}catch(Exception ignored){answer.fail("No se pudieron preparar los contactos.");}});}
    private void importPhonebook(Answer answer){requireAccount();if(contactsImportAnswer!=null){answer.fail("Ya hay una importación de contactos en curso.");return;}contactsImportAnswer=answer;Dialogs.builder(activity).setTitle("Importar agenda a Telegram").setMessage("WRGram leerá nombres y teléfonos solo después del permiso Android. Solo se incluirán números con prefijo internacional (+…). Nada se envía hasta que selecciones contactos y confirmes el envío a Telegram. WRGram no guardará una copia de la agenda.").setNegativeButton("Cancelar",(d,w)->finishContactsImport(answer,false,null)).setPositiveButton("Continuar",(d,w)->activity.requestContactsImportPermission()).setOnCancelListener(d->finishContactsImport(answer,false,null)).show();}
    void contactsImportPermissionResult(boolean granted){
        Answer sync=contactSyncPending;contactSyncPending=null;
        if(sync!=null&&!sync.finished){
            if(granted&&currentAccount()&&session.ready()&&session.selfId==sync.owner){long owner=sync.owner;ContactSync.setEnabled(activity,owner,true);prefs.edit().putString("contacts.sync."+owner+".error","").apply();ContactSync.refreshSchedule(activity);sync.ok(contactSyncStatus());syncContactsNow(error->{});}
            else if(!granted)sync.fail("No se concedió permiso para leer contactos. La sincronización automática sigue desactivada.");
            else sync.fail("La cuenta cambió. No se activó la sincronización de agenda.");
        }
        Answer now=contactSyncNowAnswer;contactSyncNowAnswer=null;
        if(now!=null&&!now.finished){
            if(granted&&currentAccount()&&session.selfId==now.owner)syncContactsNow(error->{if(now.finished)return;if(error==null)now.ok(contactSyncStatus());else now.fail(error);});
            else if(!granted)now.fail("No se concedió permiso para leer contactos.");
            else now.fail("La cuenta cambió. No se sincronizó la agenda.");
        }
        Answer answer=contactsImportAnswer;if(answer==null||answer.finished)return;if(!granted){finishContactsImport(answer,false,"No se concedió permiso para leer contactos. No se importó nada.");return;}long owner=answer.owner;((WrgramApplication)activity.getApplication()).storage().execute(()->{try{java.util.ArrayList<ContactSync.Contact> values=readPhonebook();main.post(()->{if(destroyed||!currentAccount()||session.selfId!=owner){finishContactsImport(answer,false,"La cuenta cambió. No se importaron contactos.");return;}if(values.isEmpty()){finishContactsImport(answer,false,"No se encontraron contactos con un número válido.");return;}showPhonebookSelection(answer,owner,values);});}catch(Exception ignored){main.post(()->finishContactsImport(answer,false,"No se pudo leer la agenda de Android."));}});}
    static String normalizePhonebookNumber(String raw){return ContactSync.normalize(raw);}
    private java.util.ArrayList<ContactSync.Contact> readPhonebook()throws Exception{return ContactSync.read(activity);}
    private void showPhonebookSelection(Answer answer,long owner,java.util.ArrayList<ContactSync.Contact> contacts){String[] labels=contacts.stream().map(ContactSync.Contact::label).toArray(String[]::new);boolean[] checked=new boolean[labels.length];java.util.LinkedHashSet<Integer> selected=new java.util.LinkedHashSet<>();AlertDialog dialog=Dialogs.builder(activity).setTitle("Selecciona contactos para Telegram").setMessage("Se muestran hasta 200 contactos con teléfono. Selecciona solo los que quieras importar.").setMultiChoiceItems(labels,checked,(box,which,isChecked)->{if(isChecked)selected.add(which);else selected.remove(which);}).setNegativeButton("Cancelar",(d,w)->finishContactsImport(answer,false,null)).setPositiveButton("Revisar selección",null).create();dialog.setOnCancelListener(ignored->finishContactsImport(answer,false,null));dialog.setOnShowListener(onShown->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{if(selected.isEmpty()){android.widget.Toast.makeText(activity,"Selecciona al menos un contacto.",android.widget.Toast.LENGTH_SHORT).show();return;}if(!currentAccount()||session.selfId!=owner){finishContactsImport(answer,false,"La cuenta cambió. No se importó ningún contacto.");dialog.dismiss();return;}java.util.ArrayList<TdApi.ImportedContact> imported=new java.util.ArrayList<>();StringBuilder preview=new StringBuilder();for(int index:selected){ContactSync.Contact contact=contacts.get(index);imported.add(new TdApi.ImportedContact(contact.phone,contact.first,contact.last,null));if(preview.length()<800)preview.append(contact.first).append(contact.last.isEmpty()?"":" "+contact.last).append(" · ").append(contact.phone).append('\n');}dialog.setOnCancelListener(null);dialog.dismiss();Dialogs.builder(activity).setTitle("Confirmar importación").setMessage("Se enviarán estos nombres y teléfonos a Telegram; no a los servidores de WRGram:\n\n"+preview+(selected.size()>12?"… y "+(selected.size()-12)+" más\n":"")+"\n¿Continuar?").setNegativeButton("Cancelar",(d,w)->finishContactsImport(answer,false,null)).setPositiveButton("Enviar a Telegram",(d,w)->session.perform(new TdApi.ImportContacts(imported.toArray(new TdApi.ImportedContact[0])),result->{int matched=0;if(result.userIds!=null)for(long id:result.userIds)if(id>0)matched++;schedule();finishContactsImport(answer,true,object("selected",imported.size(),"matched",matched));},error->finishContactsImport(answer,false,error))).setOnCancelListener(ignored->finishContactsImport(answer,false,null)).show();}));dialog.show();}
    private void finishContactsImport(Answer answer,boolean imported,Object result){if(contactsImportAnswer==answer)contactsImportAnswer=null;if(answer.finished)return;if(imported)answer.ok(result);else if(result instanceof String&&!((String)result).isEmpty())answer.fail((String)result);else answer.ok(false);}
    private boolean hasContactsPermission(){return androidx.core.content.ContextCompat.checkSelfPermission(activity,android.Manifest.permission.READ_CONTACTS)==android.content.pm.PackageManager.PERMISSION_GRANTED;}
    private boolean contactSyncEnabled(long owner){return owner>0&&prefs.getBoolean("contacts.sync."+owner,false);}
    private JSONObject contactSyncStatus(){long owner=session.selfId;boolean enabled=contactSyncEnabled(owner);return object("enabled",enabled,"background",true,"running",contactSyncRunning&&contactSyncOwner==owner,"last",owner>0?prefs.getLong("contacts.sync."+owner+".last",0):0,"matched",owner>0?prefs.getInt("contacts.sync."+owner+".matched",0):0,"imported",owner>0?prefs.getInt("contacts.sync."+owner+".imported",0):0,"skipped",owner>0&&prefs.getBoolean("contacts.sync."+owner+".skipped",false),"error",owner>0?prefs.getString("contacts.sync."+owner+".error",""):"");}
    private void setContactSync(JSONObject params,Answer answer)throws Exception{
        requireAccount();boolean enabled=params.getBoolean("value");long owner=session.selfId;
        if(!enabled){ContactSync.setEnabled(activity,owner,false);ContactSync.refreshSchedule(activity);prefs.edit().putBoolean("contacts.sync."+owner+".skipped",false).apply();main.removeCallbacks(contactSyncTrigger);schedule();answer.ok(contactSyncStatus());return;}
        if(contactSyncPending!=null&&!contactSyncPending.finished){answer.fail("Ya hay una solicitud de permiso de agenda en curso.");return;}
        contactSyncPending=answer;
        Dialogs.builder(activity).setTitle("Sincronizar la agenda automáticamente").setMessage("Al activarlo, WRGram leerá los nombres y teléfonos de tu agenda Android (hasta 200) y enviará automáticamente a Telegram los números con prefijo internacional, sin pedir confirmación por cada contacto. No se envía nada a servidores de WRGram ni se guarda una copia de la agenda: solo una huella local para evitar envíos repetidos. Puedes desactivarlo cuando quieras.").setNegativeButton("Cancelar",(d,w)->{Answer pending=contactSyncPending;contactSyncPending=null;if(pending!=null&&!pending.finished)pending.ok(contactSyncStatus());}).setPositiveButton("Permitir y activar",(d,w)->{
            if(contactSyncPending==null||contactSyncPending.finished)return;
            if(!hasContactsPermission()){activity.requestContactsImportPermission();return;}
            ContactSync.setEnabled(activity,owner,true);prefs.edit().putString("contacts.sync."+owner+".error","").apply();ContactSync.refreshSchedule(activity);
            Answer pending=contactSyncPending;contactSyncPending=null;schedule();pending.ok(contactSyncStatus());syncContactsNow(error->{});
        }).setOnCancelListener(d->{Answer pending=contactSyncPending;contactSyncPending=null;if(pending!=null&&!pending.finished)pending.ok(contactSyncStatus());}).show();
    }
    private void requestContactSyncNow(Answer answer)throws Exception{
        requireAccount();
        if(!contactSyncEnabled(session.selfId)){answer.fail("Activa primero la sincronización automática de la agenda.");return;}
        if(contactSyncRunning){answer.fail("Ya hay una sincronización de agenda en curso.");return;}
        if(!hasContactsPermission()){if(contactSyncNowAnswer!=null&&!contactSyncNowAnswer.finished){answer.fail("Ya hay una solicitud de permiso de agenda en curso.");return;}contactSyncNowAnswer=answer;activity.requestContactsImportPermission();return;}
        syncContactsNow(error->{if(answer.finished)return;if(error==null)answer.ok(contactSyncStatus());else answer.fail(error);});
    }
    private void finishContactSync(long owner,boolean skipped,String error,Consumer<String> completed){if(error!=null)prefs.edit().putString("contacts.sync."+owner+".error",error).apply();else prefs.edit().putLong("contacts.sync."+owner+".last",System.currentTimeMillis()/1000).putBoolean("contacts.sync."+owner+".skipped",skipped).putString("contacts.sync."+owner+".error","").apply();if(contactSyncOwner==owner){contactSyncRunning=false;contactSyncOwner=0;}schedule();completed.accept(error);}
    private static String contactFingerprint(java.util.List<ContactSync.Contact> contacts){return ContactSync.fingerprint(contacts);}
    private void syncContactsNow(Consumer<String> completed){
        if(contactSyncRunning){completed.accept("Ya hay una sincronización de agenda en curso.");return;}
        long owner=session.selfId;
        if(owner<=0||!session.ready()){completed.accept("La cuenta todavía no está lista.");return;}
        if(!contactSyncEnabled(owner)){completed.accept("Activa primero la sincronización automática de la agenda.");return;}
        if(!hasContactsPermission()){completed.accept("Falta el permiso de Android para leer contactos.");return;}
        contactSyncRunning=true;contactSyncOwner=owner;
        prefs.edit().putString("contacts.sync."+owner+".error","").putBoolean("contacts.sync."+owner+".skipped",false).apply();
        schedule();
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            java.util.ArrayList<ContactSync.Contact> values;
            try{values=readPhonebook();}catch(Exception error){main.post(()->finishContactSync(owner,false,"No se pudo leer la agenda de Android.",completed));return;}
            main.post(()->{
                if(!currentAccount()||session.selfId!=owner||!session.ready()){if(contactSyncOwner==owner){contactSyncRunning=false;contactSyncOwner=0;}completed.accept("La cuenta cambió. No se importaron contactos.");return;}
                if(values.isEmpty()){finishContactSync(owner,false,"No se encontraron contactos con un número válido.",completed);return;}
                String fingerprint=contactFingerprint(values);
                if(fingerprint.equals(prefs.getString("contacts.sync."+owner+".fingerprint",""))){finishContactSync(owner,true,null,completed);return;}
                java.util.ArrayList<TdApi.ImportedContact> imported=new java.util.ArrayList<>(values.size());
                for(ContactSync.Contact contact:values)imported.add(new TdApi.ImportedContact(contact.phone,contact.first,contact.last,null));
                session.perform(new TdApi.ImportContacts(imported.toArray(new TdApi.ImportedContact[0])),result->{
                    if(!currentAccount()||session.selfId!=owner){if(contactSyncOwner==owner){contactSyncRunning=false;contactSyncOwner=0;}completed.accept("La cuenta cambió. No se actualizó el estado.");return;}
                    int matched=0;if(result.userIds!=null)for(long id:result.userIds)if(id>0)matched++;
                    prefs.edit().putLong("contacts.sync."+owner+".last",System.currentTimeMillis()/1000).putInt("contacts.sync."+owner+".matched",matched).putInt("contacts.sync."+owner+".imported",imported.size()).putString("contacts.sync."+owner+".fingerprint",fingerprint).putBoolean("contacts.sync."+owner+".skipped",false).putString("contacts.sync."+owner+".error","").apply();
                    if(contactSyncOwner==owner){contactSyncRunning=false;contactSyncOwner=0;}schedule();completed.accept(null);
                },error->finishContactSync(owner,false,error==null||error.isEmpty()?"Telegram no pudo importar la agenda.":error,completed));
            });
        });
    }
    private void contactAction(String method,JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypePrivate)){answer.fail("Solo se pueden administrar contactos en conversaciones privadas.");return;}long userId=((TdApi.ChatTypePrivate)chat.type).userId;TdApi.User user=session.user(userId);if(user==null||user.type instanceof TdApi.UserTypeBot||userId==session.selfId){answer.fail("Esta cuenta no se puede agregar como contacto.");return;}if(method.equals("contacts.remove")){if(!user.isContact){answer.ok(false);return;}perform(new TdApi.RemoveContacts(new long[]{userId}),answer,ignored->{schedule();answer.ok(true);});return;}if(user.isContact){answer.ok(false);return;}String first=user.firstName==null||user.firstName.isBlank()?"Contacto":NativeSnapshot.limit(user.firstName,64);String last=NativeSnapshot.limit(user.lastName==null?"":user.lastName,64);Dialogs.builder(activity).setTitle("Añadir contacto").setMessage("Se añadirá "+(user.firstName==null?chat.title:user.firstName)+" a tus contactos de Telegram. No se compartirá tu número.").setNegativeButton("Cancelar",(dialog,which)->answer.ok(false)).setPositiveButton("Añadir",(dialog,which)->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió.");return;}perform(new TdApi.AddContact(userId,new TdApi.ImportedContact("",first,last,null),false),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(ignored->answer.ok(false)).show();}
    private void createGroup(JSONObject params,Answer answer)throws Exception{requireAccount();String title=BridgePolicy.text(params,"title",128).trim();if(title.isEmpty())throw new IllegalArgumentException("El grupo necesita un nombre.");JSONArray selected=params.getJSONArray("userIds");if(selected.length()<1||selected.length()>199)throw new IllegalArgumentException("Selecciona entre 1 y 199 contactos.");java.util.LinkedHashSet<Long> ids=new java.util.LinkedHashSet<>();for(int i=0;i<selected.length();i++){String raw=selected.getString(i);if(!raw.matches("[1-9][0-9]{0,18}"))throw new IllegalArgumentException("Contacto inválido.");long id=Long.parseLong(raw);if(id==session.selfId)throw new IllegalArgumentException("No puedes agregarte a ti mismo.");ids.add(id);}if(ids.size()!=selected.length())throw new IllegalArgumentException("Hay contactos repetidos.");perform(new TdApi.GetContacts(),answer,result->{java.util.HashSet<Long> contacts=new java.util.HashSet<>();if(result.userIds!=null)for(long id:result.userIds)contacts.add(id);if(!contacts.containsAll(ids)){answer.fail("Solo puedes agregar a un grupo contactos que ya estén en tu agenda de Telegram.");return;}for(long id:ids){TdApi.User user=session.user(id);if(user==null||user.type instanceof TdApi.UserTypeBot){answer.fail("Los grupos creados desde aquí solo admiten contactos personales cargados.");return;}}perform(new TdApi.CreateNewBasicGroupChat(ids.stream().mapToLong(Long::longValue).toArray(),title,0),answer,created->{int failed=created.failedToAddMembers==null||created.failedToAddMembers.failedToAddMembers==null?0:created.failedToAddMembers.failedToAddMembers.length;session.loadChat(created.chatId,chat->{session.open(chat.id);answer.ok(object("id",Long.toString(created.chatId),"failedMembers",failed));},answer::fail);});});}
    private void createSupergroup(JSONObject params,Answer answer)throws Exception{requireAccount();String title=BridgePolicy.text(params,"title",128).trim(),description=BridgePolicy.text(params,"description",255).trim(),kind=BridgePolicy.text(params,"kind",16);if(title.isEmpty())throw new IllegalArgumentException("El grupo necesita un nombre.");TdApi.CreateNewSupergroupChat request=communityCreation(kind,title,description);perform(request,answer,created->session.loadChat(created.id,chat->{session.open(chat.id);schedule();answer.ok(object("id",Long.toString(chat.id),"type",kind.equals("channel")?"channel":kind.equals("forum")?"forum":"supergroup"));},answer::fail));}
    static TdApi.CreateNewSupergroupChat communityCreation(String kind,String title,String description){if(!"supergroup".equals(kind)&&!"forum".equals(kind)&&!"channel".equals(kind))throw new IllegalArgumentException("Tipo de chat no permitido.");return new TdApi.CreateNewSupergroupChat(title,"forum".equals(kind),"channel".equals(kind),description,null,0,false);}
    private static boolean canInviteMembers(TdApi.ChatMember member){return member!=null&&(member.status instanceof TdApi.ChatMemberStatusCreator||administratorRights(member)!=null&&administratorRights(member).canInviteUsers);}
    private void createSubscriptionInvite(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel){
            answer.fail("Las suscripciones de pago por enlace están disponibles en canales.");return;
        }
        String name=BridgePolicy.text(params,"name",32).trim();
        long amount=StarsPolicy.stars(params,"amount",Integer.MAX_VALUE);
        perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(answer.owner)),answer,actor->{
            if(!canInviteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para crear enlaces.");return;}
            Dialogs.builder(activity).setTitle("Crear enlace de suscripción")
                .setMessage(NativeSnapshot.limit(chat.title,120)+"\n\nEl acceso costará "+amount+" Stars cada 30 días. El enlace no se compartirá automáticamente.")
                .setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setOnCancelListener(d->answer.ok(false))
                .setPositiveButton("Crear enlace",(d,w)->{
                    if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió.");return;}
                    perform(new TdApi.CreateChatSubscriptionInviteLink(chat.id,name,new TdApi.StarSubscriptionPricing(2_592_000,amount)),answer,
                        link->answer.ok(object("link",link.inviteLink)));
                }).show();
        });
    }
    private void createInviteLink(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeBasicGroup||chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Los enlaces de invitación solo se crean para grupos y canales.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canInviteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para crear enlaces de invitación.");return;}Dialogs.builder(activity).setTitle("Crear enlace de invitación").setMessage("Telegram creará un enlace que cualquiera podrá reenviar. Caduca en 7 días y no limita el número de participantes. El enlace solo se comparte si luego eliges una aplicación.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Crear enlace",(d,w)->{int expiration=(int)(System.currentTimeMillis()/1000L+7L*24*60*60);perform(new TdApi.CreateChatInviteLink(chat.id,"WRGram",expiration,0,false),answer,link->{Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,link.inviteLink);try{activity.startActivity(Intent.createChooser(share,"Compartir enlace de invitación"));answer.ok(true);}catch(RuntimeException failure){EditText text=new EditText(activity);text.setText(link.inviteLink);text.setTextIsSelectable(true);Dialogs.builder(activity).setTitle("Enlace creado").setMessage("Cópialo y compártelo solo con las personas que quieres invitar.").setView(text).setPositiveButton("Cerrar",null).show();answer.ok(true);}});}).setOnCancelListener(d->answer.ok(false)).show();});}
    private static boolean canRestrictMembers(TdApi.ChatMember member){return member!=null&&(member.status instanceof TdApi.ChatMemberStatusCreator||member.status instanceof TdApi.ChatMemberStatusAdministrator&&((TdApi.ChatMemberStatusAdministrator)member.status).rights!=null&&((TdApi.ChatMemberStatusAdministrator)member.status).rights.canRestrictMembers);}
    private static TdApi.ChatAdministratorRights administratorRights(TdApi.ChatMember member){return member!=null&&member.status instanceof TdApi.ChatMemberStatusAdministrator?((TdApi.ChatMemberStatusAdministrator)member.status).rights:null;}
    private static boolean canPromoteMembers(TdApi.ChatMember member){return member!=null&&(member.status instanceof TdApi.ChatMemberStatusCreator||administratorRights(member)!=null&&administratorRights(member).canPromoteMembers);}
    private JSONObject availableAdminRights(TdApi.ChatMember actor,boolean channel,boolean forum)throws Exception{return object("canChangeInfo",grantedAdminRight(actor,"canChangeInfo"),"canPostMessages",channel&&grantedAdminRight(actor,"canPostMessages"),"canEditMessages",channel&&grantedAdminRight(actor,"canEditMessages"),"canDeleteMessages",grantedAdminRight(actor,"canDeleteMessages"),"canInviteUsers",grantedAdminRight(actor,"canInviteUsers"),"canRestrictMembers",grantedAdminRight(actor,"canRestrictMembers"),"canPinMessages",!channel&&grantedAdminRight(actor,"canPinMessages"),"canManageTopics",forum&&grantedAdminRight(actor,"canManageTopics"),"canPromoteMembers",grantedAdminRight(actor,"canPromoteMembers"),"canManageVideoChats",grantedAdminRight(actor,"canManageVideoChats"),"canPostStories",grantedAdminRight(actor,"canPostStories"),"canEditStories",grantedAdminRight(actor,"canEditStories"),"canDeleteStories",grantedAdminRight(actor,"canDeleteStories"),"canManageDirectMessages",channel&&grantedAdminRight(actor,"canManageDirectMessages"),"canManageTags",!channel&&grantedAdminRight(actor,"canManageTags"),"canSendWelcomeMessages",grantedAdminRight(actor,"canSendWelcomeMessages"));}
    private void groupPermissions(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("La edición de permisos solo está disponible en supergrupos y canales.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canRestrictMembers(actor)){answer.fail("Telegram no concede a esta cuenta el permiso para cambiar permisos del grupo.");return;}TdApi.ChatPermissions value=chat.permissions;if(value==null){answer.fail("Telegram aún no cargó los permisos predeterminados.");return;}try{answer.ok(object("canSendBasicMessages",value.canSendBasicMessages,"canSendAudios",value.canSendAudios,"canSendDocuments",value.canSendDocuments,"canSendPhotos",value.canSendPhotos,"canSendVideos",value.canSendVideos,"canSendVideoNotes",value.canSendVideoNotes,"canSendVoiceNotes",value.canSendVoiceNotes,"canSendPolls",value.canSendPolls,"canSendOtherMessages",value.canSendOtherMessages,"canAddLinkPreviews",value.canAddLinkPreviews,"canReactToMessages",value.canReactToMessages,"canEditTag",value.canEditTag,"canChangeInfo",value.canChangeInfo,"canInviteUsers",value.canInviteUsers,"canPinMessages",value.canPinMessages,"canCreateTopics",value.canCreateTopics));}catch(Exception ignored){answer.fail("No se pudieron cargar los permisos actuales.");}});}
    private static TdApi.ChatEventLogFilters allEventFilters(){return new TdApi.ChatEventLogFilters(true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);}
    private void chatUsername(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Los nombres públicos solo están disponibles en supergrupos y canales.");return;}long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;TdApi.Supergroup group=session.supergroup(supergroupId);if(group!=null&&group.usernames!=null){sendChatUsername(group.usernames,answer);return;}perform(new TdApi.GetSupergroup(supergroupId),answer,loaded->sendChatUsername(loaded.usernames,answer));}
    private void sendChatUsername(TdApi.Usernames names,Answer answer){try{JSONArray active=new JSONArray();if(names!=null&&names.activeUsernames!=null)for(String name:names.activeUsernames)active.put(name);answer.ok(object("editable",names==null||names.editableUsername==null?"":names.editableUsername,"active",active));}catch(Exception ignored){answer.fail("No se pudo preparar el nombre público.");}}
    private void setChatUsername(JSONObject params,Answer answer)throws Exception{TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Los nombres públicos solo están disponibles en supergrupos y canales.");String username=BridgePolicy.text(params,"username",32).trim();if(!username.isEmpty()&&!username.matches("[A-Za-z][A-Za-z0-9_]{4,31}"))throw new IllegalArgumentException("El nombre público debe tener de 5 a 32 caracteres y empezar con una letra.");long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!grantedAdminRight(actor,"canChangeInfo")){answer.fail("Telegram no concede a esta cuenta permiso para cambiar el nombre público.");return;}perform(new TdApi.SetSupergroupUsername(supergroupId,username),answer,ignored->{schedule();answer.ok(true);});});}
    private void adminEvents(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("El registro de actividad solo está disponible en supergrupos y canales.");return;}perform(new TdApi.GetChatEventLog(chat.id,"",0,50,allEventFilters(),new long[0]),answer,result->{try{JSONArray values=new JSONArray();if(result.events!=null)for(TdApi.ChatEvent event:result.events){String actor=session.senderName(event.memberId);values.put(object("id",Long.toString(event.id),"date",event.date,"title",NativeSnapshot.limit(actor,80),"description",adminEventDescription(event.action)));}answer.ok(values);}catch(Exception ignored){answer.fail("No se pudo preparar el registro de actividad.");}});}
    private static String adminEventDescription(TdApi.ChatEventAction action){
        if(action instanceof TdApi.ChatEventMessageEdited)return "Editó un mensaje";
        if(action instanceof TdApi.ChatEventMessageDeleted)return "Eliminó un mensaje";
        if(action instanceof TdApi.ChatEventMessagePinned)return "Fijó un mensaje";
        if(action instanceof TdApi.ChatEventMessageUnpinned)return "Desfijó un mensaje";
        if(action instanceof TdApi.ChatEventPollStopped)return "Detuvo una encuesta";
        if(action instanceof TdApi.ChatEventMemberJoined)return "Se unió al chat";
        if(action instanceof TdApi.ChatEventMemberJoinedByInviteLink)return "Se unió mediante un enlace de invitación";
        if(action instanceof TdApi.ChatEventMemberJoinedByRequest)return "Se unió tras aprobar su solicitud";
        if(action instanceof TdApi.ChatEventMemberInvited)return "Invitó a un miembro";
        if(action instanceof TdApi.ChatEventMemberLeft)return "Salió del chat";
        if(action instanceof TdApi.ChatEventMemberPromoted)return "Cambió el rol de administrador de un miembro";
        if(action instanceof TdApi.ChatEventMemberRestricted)return "Restringió o readmitió a un miembro";
        if(action instanceof TdApi.ChatEventMemberTagChanged)return "Cambió la etiqueta de un miembro";
        if(action instanceof TdApi.ChatEventMemberSubscriptionExtended)return "Extendió una suscripción";
        if(action instanceof TdApi.ChatEventTitleChanged)return "Cambió el nombre del chat";
        if(action instanceof TdApi.ChatEventDescriptionChanged)return "Cambió la descripción";
        if(action instanceof TdApi.ChatEventPhotoChanged)return "Cambió la foto del chat";
        if(action instanceof TdApi.ChatEventUsernameChanged)return "Cambió el nombre público";
        if(action instanceof TdApi.ChatEventActiveUsernamesChanged)return "Cambió los nombres públicos activos";
        if(action instanceof TdApi.ChatEventPermissionsChanged)return "Cambió los permisos predeterminados";
        if(action instanceof TdApi.ChatEventSlowModeDelayChanged)return "Cambió el modo lento";
        if(action instanceof TdApi.ChatEventMessageAutoDeleteTimeChanged)return "Cambió el borrado automático";
        if(action instanceof TdApi.ChatEventInvitesToggled)return "Cambió la opción de invitaciones";
        if(action instanceof TdApi.ChatEventHasProtectedContentToggled)return "Cambió la protección de contenido";
        if(action instanceof TdApi.ChatEventLinkedChatChanged)return "Cambió el chat vinculado";
        if(action instanceof TdApi.ChatEventLocationChanged)return "Cambió la ubicación del chat";
        if(action instanceof TdApi.ChatEventStickerSetChanged)return "Cambió el set de stickers";
        if(action instanceof TdApi.ChatEventInviteLinkEdited)return "Editó un enlace de invitación";
        if(action instanceof TdApi.ChatEventInviteLinkRevoked)return "Revocó un enlace de invitación";
        if(action instanceof TdApi.ChatEventInviteLinkDeleted)return "Eliminó un enlace de invitación";
        if(action instanceof TdApi.ChatEventVideoChatCreated)return "Inició una videollamada";
        if(action instanceof TdApi.ChatEventVideoChatEnded)return "Finalizó una videollamada";
        if(action instanceof TdApi.ChatEventIsForumToggled)return "Cambió el modo foro";
        if(action instanceof TdApi.ChatEventForumTopicCreated)return "Creó un tema";
        if(action instanceof TdApi.ChatEventForumTopicEdited)return "Editó un tema";
        if(action instanceof TdApi.ChatEventForumTopicDeleted)return "Eliminó un tema";
        if(action instanceof TdApi.ChatEventForumTopicPinned)return "Fijó un tema";
        return "Acción administrativa";
    }
    private TdApi.Chat forumChat(JSONObject params)throws Exception{
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Los temas solo existen en foros de supergrupos.");
        TdApi.Supergroup group=session.supergroup(((TdApi.ChatTypeSupergroup)chat.type).supergroupId);
        if(group==null||!group.isForum)throw new IllegalArgumentException("Este chat no es un foro.");
        return chat;
    }
    private void forumTopics(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);
        perform(new TdApi.GetForumTopics(chat.id,"",0,0,0,50),answer,result->{
            try{JSONArray values=new JSONArray();if(result.topics!=null)for(TdApi.ForumTopic topic:result.topics){if(topic==null||topic.info==null||topic.info.isHidden)continue;JSONObject item=object("id",topic.info.forumTopicId,"name",topic.info.name==null||topic.info.name.isBlank()?"Tema general":topic.info.name,"closed",topic.info.isClosed,"general",topic.info.isGeneral,"pinned",topic.isPinned,"unread",topic.unreadCount,"readInbox",Long.toString(topic.lastReadInboxMessageId));if(topic.info.icon!=null){item.put("iconColor",topic.info.icon.color);if(topic.info.icon.customEmojiId!=0)item.put("iconEmoji",Long.toString(topic.info.icon.customEmojiId));}if(topic.lastMessage!=null){item.put("lastText",NativeSnapshot.limit(dto.caption(topic.lastMessage),120));item.put("date",topic.lastMessage.date);item.put("lastSender",topic.lastMessage.isOutgoing?"Tú":session.senderName(topic.lastMessage.senderId));}values.put(item);}answer.ok(values);}catch(Exception ignored){answer.fail("No se pudieron preparar los temas del foro.");}
        });
    }
    private void openForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);int topicId=params.getInt("topicId");if(topicId<=0)throw new IllegalArgumentException();
        if(session.activeChat!=chat.id)session.open(chat.id);
        perform(new TdApi.GetForumTopic(chat.id,topicId),answer,topic->{TdApi.ForumTopicInfo info=topic.info;if(info==null){answer.fail("Telegram no devolvió este tema.");return;}if(session.activeChat!=chat.id){answer.fail("La conversación cambió.");return;}session.openTopic(topic);answer.ok(object("id",info.forumTopicId,"name",info.name,"closed",info.isClosed));});
    }
    private void createForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);String name=BridgePolicy.text(params,"name",128).trim();if(name.isEmpty())throw new IllegalArgumentException("El tema necesita un nombre.");
        perform(new TdApi.CreateForumTopic(chat.id,name,false,new TdApi.ForumTopicIcon(0x6FB9F0,0)),answer,info->{schedule();answer.ok(object("id",info.forumTopicId,"name",info.name));});
    }
    private void renameForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);int topicId=params.getInt("topicId");String name=BridgePolicy.text(params,"name",128).trim();if(name.isEmpty())throw new IllegalArgumentException("El tema necesita un nombre.");
        perform(new TdApi.EditForumTopic(chat.id,topicId,name,false,0),answer,ignored->{session.topicRenamed(topicId,name);schedule();answer.ok(true);});
    }
    private void toggleForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);int topicId=params.getInt("topicId");boolean closed=params.getBoolean("value");
        perform(new TdApi.ToggleForumTopicIsClosed(chat.id,topicId,closed),answer,ignored->{session.topicClosed(topicId,closed);schedule();answer.ok(true);});
    }
    private void deleteForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);int topicId=params.getInt("topicId");
        perform(new TdApi.DeleteForumTopic(chat.id,topicId),answer,ignored->{session.topicDeleted(topicId);schedule();answer.ok(true);});
    }
    private void pinForumTopic(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);int topicId=params.getInt("topicId");boolean pinned=params.getBoolean("value");
        perform(new TdApi.ToggleForumTopicIsPinned(chat.id,topicId,pinned),answer,ignored->{schedule();answer.ok(true);});
    }
    private void orderForumTopics(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=forumChat(params);JSONArray values=params.getJSONArray("topicIds");
        java.util.LinkedHashSet<Integer> unique=new java.util.LinkedHashSet<>();
        for(int i=0;i<values.length()&&unique.size()<200;i++){int id=values.getInt(i);if(id>0)unique.add(id);}
        int[] ids=new int[unique.size()];int index=0;for(int id:unique)ids[index++]=id;
        perform(new TdApi.SetPinnedForumTopics(chat.id,ids),answer,ignored->{schedule();answer.ok(true);});
    }
    private void transferOwnershipCheck(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("La transferencia de propiedad solo está disponible en supergrupos y canales.");
        perform(new TdApi.CanTransferOwnership(),answer,result->{
            try{
                if(result instanceof TdApi.CanTransferOwnershipResultOk)answer.ok(object("state","ok","retryAfter",0));
                else if(result instanceof TdApi.CanTransferOwnershipResultPasswordNeeded)answer.ok(object("state","password","retryAfter",0));
                else if(result instanceof TdApi.CanTransferOwnershipResultPasswordTooFresh)answer.ok(object("state","passwordTooFresh","retryAfter",((TdApi.CanTransferOwnershipResultPasswordTooFresh)result).retryAfter));
                else if(result instanceof TdApi.CanTransferOwnershipResultSessionTooFresh)answer.ok(object("state","sessionTooFresh","retryAfter",((TdApi.CanTransferOwnershipResultSessionTooFresh)result).retryAfter));
                else answer.ok(object("state","unavailable","retryAfter",0));
            }catch(Exception ignored){answer.fail("No se pudo comprobar la transferencia de propiedad.");}
        });
    }
    private void transferOwnership(JSONObject params,Answer answer)throws Exception{
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("La transferencia de propiedad solo está disponible en supergrupos y canales.");
        long userId=BridgePolicy.id(params,"userId");
        if(userId<=0||userId==session.selfId)throw new IllegalArgumentException("Elige a otra persona para recibir la propiedad.");
        String password=BridgePolicy.text(params,"password",256);
        perform(new TdApi.CanTransferOwnership(),answer,result->{
            if(result instanceof TdApi.CanTransferOwnershipResultPasswordTooFresh||result instanceof TdApi.CanTransferOwnershipResultSessionTooFresh){answer.fail("Telegram todavía no permite transferir la propiedad desde esta sesión. Espera antes de reintentarlo.");return;}
            if(result instanceof TdApi.CanTransferOwnershipResultPasswordNeeded&&password.isEmpty()){answer.fail("Tu cuenta tiene verificación en dos pasos. Introduce la contraseña para transferir la propiedad.");return;}
            if(!(result instanceof TdApi.CanTransferOwnershipResultOk)&&!(result instanceof TdApi.CanTransferOwnershipResultPasswordNeeded)){answer.fail("Telegram no permite transferir la propiedad de este chat desde tu cuenta.");return;}
            String recipient=session.senderName(new TdApi.MessageSenderUser(userId));
            Dialogs.builder(activity).setTitle("Transferir propiedad").setMessage("Se transferirá la propiedad de “"+chat.title+"” a "+recipient+". Dejarás de ser propietario y no podrás recuperarla desde WRGram sin que la otra persona la devuelva.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Transferir propiedad",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id){answer.fail("La cuenta o conversación cambió. No se transfirió la propiedad.");return;}perform(new TdApi.TransferChatOwnership(chat.id,userId,password),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();
        });
    }
    private void setGroupPermissions(JSONObject params,Answer answer)throws Exception{TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Se requiere un supergrupo o canal.");JSONObject p=params.getJSONObject("permissions");TdApi.ChatPermissions value=new TdApi.ChatPermissions(requiredBool(p,"canSendBasicMessages"),requiredBool(p,"canSendAudios"),requiredBool(p,"canSendDocuments"),requiredBool(p,"canSendPhotos"),requiredBool(p,"canSendVideos"),requiredBool(p,"canSendVideoNotes"),requiredBool(p,"canSendVoiceNotes"),requiredBool(p,"canSendPolls"),requiredBool(p,"canSendOtherMessages"),requiredBool(p,"canAddLinkPreviews"),requiredBool(p,"canReactToMessages"),requiredBool(p,"canEditTag"),requiredBool(p,"canChangeInfo"),requiredBool(p,"canInviteUsers"),requiredBool(p,"canPinMessages"),requiredBool(p,"canCreateTopics"));perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canRestrictMembers(actor)){answer.fail("Telegram no concede a esta cuenta el permiso para cambiar permisos del grupo.");return;}Dialogs.builder(activity).setTitle("Cambiar permisos predeterminados").setMessage("Se aplicarán a los miembros del grupo. No cambian los permisos de administradores ni se enviarán mensajes.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Guardar permisos",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió. No se cambiaron permisos.");return;}perform(new TdApi.SetChatPermissions(chat.id,value),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();});}
    private void chatSenders(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(chat.messageSenderId==null){answer.ok(object("canChoose",false,"senders",new JSONArray()));return;}perform(new TdApi.GetChatAvailableMessageSenders(chat.id),answer,value->{try{JSONArray items=new JSONArray();JSONObject current=null;if(value.senders!=null)for(TdApi.ChatMessageSender sender:value.senders){if(sender==null||sender.sender==null)continue;JSONObject dto=senderDto(sender);items.put(dto);if(current==null&&sameSender(sender.sender,chat.messageSenderId))current=dto;}JSONObject out=object("canChoose",true,"senders",items);if(current!=null)out.put("current",current);answer.ok(out);}catch(Exception ignored){answer.fail("Telegram devolvió una lista de remitentes no reconocible.");}});}
    private JSONObject senderDto(TdApi.ChatMessageSender sender)throws Exception{String kind=TdSession.senderKind(sender.sender);if("other".equals(kind))throw new IllegalArgumentException("Remitente desconocido");return object("kind",kind,"id",Long.toString(TdSession.senderId(sender.sender)),"name",session.senderName(sender.sender),"premium",sender.needsPremium);}
    private static boolean sameSender(TdApi.MessageSender a,TdApi.MessageSender b){return a!=null&&b!=null&&TdSession.senderKind(a).equals(TdSession.senderKind(b))&&TdSession.senderId(a)==TdSession.senderId(b);}
    /** Only an identity TDLib itself offered for this chat may be selected, and the user slot may never be filled by another account. */
    static TdApi.ChatMessageSender allowedSender(TdApi.ChatMessageSender[] senders,long selfId,String kind,long senderId){
        if(senders==null||!("user".equals(kind)||"chat".equals(kind)))return null;
        if("user".equals(kind)&&senderId!=selfId)return null;
        for(TdApi.ChatMessageSender item:senders){if(item!=null&&item.sender!=null&&kind.equals(TdSession.senderKind(item.sender))&&senderId==TdSession.senderId(item.sender))return item;}
        return null;
    }
    private void setChatSender(JSONObject params,Answer answer)throws Exception{TdApi.Chat chat=target(params);String kind=BridgePolicy.text(params,"kind",8);long senderId=BridgePolicy.id(params,"senderId");if(chat.messageSenderId==null){answer.fail("Telegram no permite cambiar el remitente en este chat.");return;}perform(new TdApi.GetChatAvailableMessageSenders(chat.id),answer,value->{TdApi.ChatMessageSender chosen=allowedSender(value.senders,session.selfId,kind,senderId);if(chosen==null){answer.fail("Telegram no ofrece esa identidad para escribir en este chat.");return;}if(chosen.needsPremium){answer.fail("Telegram requiere Premium para escribir con ese canal.");return;}if(sameSender(chosen.sender,chat.messageSenderId)){answer.ok(true);return;}perform(new TdApi.SetChatMessageSender(chat.id,chosen.sender),answer,ignored->{schedule();answer.ok(true);});});}
    private void botStatus(Answer answer){requireAccount();long owner=session.selfId;String slot=session.slot;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{JSONObject out;try{JSONObject record=BotAccounts.read(activity,slot,owner);out=record==null?object("configured",false):botRecordDto(record);}catch(Exception ignored){out=null;}
            final JSONObject value=out;main.post(()->{if(!currentAccount()||session.selfId!=owner)answer.fail("La cuenta cambió.");else if(value==null)answer.fail("No se pudo leer el bot guardado en esta cuenta.");else answer.ok(value);});});
    }
    /** Nunca incluye el token: es la única forma en que un registro del bot puede salir por el puente. */
    static JSONObject botRecordDto(JSONObject record){return record.optLong("botUserId")<=0?object("configured",false):object("configured",true,"botUserId",Long.toString(record.optLong("botUserId")),"username",record.optString("username",""),"name",record.optString("name",""));}
    static final Set<String> TAB_ICON_KEYS=Set.of("hash","bookmark","star","megaphone","users","send","bot","lock","pin","archive","image","heart","globe","bell","flame");
    private static JSONArray readInboxTabs(SharedPreferences preferences, String key) {
        try { return new JSONArray(preferences.getString(key, "[]")); }
        catch (org.json.JSONException ignored) { return new JSONArray(); }
    }

    static JSONObject inboxTabEmoji(JSONObject choice, boolean premium, String previousPremiumId) throws org.json.JSONException {
        String kind = BridgePolicy.text(choice, "kind", 7);
        String id = BridgePolicy.text(choice, "id", 19);
        if ("preset".equals(kind) && TAB_ICON_KEYS.contains(id)) return object("kind", kind, "id", id);
        if ("premium".equals(kind) && BridgePolicy.id(choice, "id") > 0) {
            if (!premium && !id.equals(previousPremiumId)) {
                throw new IllegalArgumentException("Necesitas Telegram Premium para elegir este emoji.");
            }
            JSONObject value = object("kind", kind, "id", id);
            if (!choice.isNull("emoji")) value.put("emoji", BridgePolicy.text(choice, "emoji", 32));
            return value;
        }
        throw new IllegalArgumentException("El emoji de la pestaña no es válido.");
    }

    private void inboxTabs(JSONObject params,Answer answer,boolean save)throws Exception{
        requireAccount();
        SharedPreferences tabs=activity.getSharedPreferences("inbox_tabs",0);
        String key=session.slot+"."+session.selfId;
        if(!save){
            answer.ok(readInboxTabs(tabs,key));
            return;
        }
        JSONArray input=params.getJSONArray("tabs");
        if(input.length()>36)throw new IllegalArgumentException("Puedes guardar hasta 36 pestañas.");
        JSONArray clean=new JSONArray();
        Set<String> ids=new HashSet<>();
        TdApi.User self=session.user(session.selfId);
        boolean premium=self!=null&&self.isPremium;
        Map<String,String> previousPremiumIds=new HashMap<>();
        if(!premium){
            JSONArray previous=readInboxTabs(tabs,key);
            for(int i=0;i<previous.length();i++){
                JSONObject tab=previous.optJSONObject(i);
                JSONObject emoji=tab==null?null:tab.optJSONObject("emoji");
                if(emoji!=null&&"premium".equals(emoji.optString("kind"))){
                    previousPremiumIds.put(tab.optString("id"),emoji.optString("id"));
                }
            }
        }
        for(int i=0;i<input.length();i++){
            JSONObject tab=input.getJSONObject(i);
            String id=BridgePolicy.text(tab,"id",48);
            String name=BridgePolicy.text(tab,"name",28).trim();
            if(!id.matches("all|unread|channels|secret|groups|bots|folder:[1-9][0-9]{0,8}|custom:[a-z0-9-]{1,32}")
                    ||!ids.add(id)||name.isEmpty())throw new IllegalArgumentException("La pestaña no es válida.");
            JSONObject value=object("id",id,"name",name,"hidden",tab.optBoolean("hidden"));
            String icon=tab.optString("icon","");
            if(!icon.isEmpty()){
                if(!icon.matches("[a-z]{1,16}")||!TAB_ICON_KEYS.contains(icon))throw new IllegalArgumentException("El icono de la pestaña no es válido.");
                value.put("icon",icon);
            }
            if(!tab.isNull("emoji")){
                value.put("emoji",inboxTabEmoji(tab.getJSONObject("emoji"),premium,previousPremiumIds.get(id)));
            }
            if(id.startsWith("custom:")){
                JSONObject filters=tab.getJSONObject("rules");
                String source=filters.getString("source"),type=filters.getString("type"),read=filters.getString("read"),muted=filters.getString("muted");
                if(!source.matches("main|archive|folder:[1-9][0-9]{0,8}")||!type.matches("any|private|group|channel|bot|secret")
                        ||!read.matches("any|read|unread")||!muted.matches("any|muted|unmuted"))
                    throw new IllegalArgumentException("El filtro de la pestaña no es válido.");
                value.put("rules",object("source",source,"type",type,"read",read,"muted",muted,"pinned",filters.optBoolean("pinned")));
            }
            clean.put(value);
        }
        tabs.edit().putString(key,clean.toString()).apply();
        answer.ok(clean);
    }
    private void botPublishAvailable(JSONObject params,Answer answer){
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||session.activeChat!=chat.id||session.activeTopic!=0){
            answer.ok(object("publish",false,"configure",false,"invite",false));return;
        }
        long owner=session.selfId;
        String slot=session.slot;
        boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            JSONObject record=null;
            try{record=BotAccounts.read(activity,slot,owner);}catch(Exception ignored){}
            String token=record==null?"":record.optString("token");
            long bot=BotApi.validToken(token)?record.optLong("botUserId"):0;
            main.post(()->{
                if(destroyed||!currentAccount()||session.selfId!=owner||session.activeChat!=chat.id||session.activeTopic!=0){
                    answer.ok(object("publish",false,"configure",false,"invite",false));return;
                }
                Consumer<TdApi.ChatMember> withActor=actor->{
                    boolean configure=canRestrictMembers(actor)||canPromoteMembers(actor), invite=channel&&canInviteMembers(actor);
                    if(bot<=0){answer.ok(object("publish",false,"configure",configure,"invite",invite));return;}
                    session.perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(bot)),member->{
                        if(!canCheckBotInChat(chat.id,owner)||botPublishProblem(member.status,channel)!=null){
                            answer.ok(object("publish",false,"configure",configure,"invite",invite));return;
                        }
                        ((WrgramApplication)activity.getApplication()).botNetwork().execute(()->{
                            BotApi.Reply identity=BotApi.call(token,"getMe",new JSONObject());
                            boolean valid=identity.error==null&&identity.result!=null&&identity.result.optLong("id")==bot;
                            main.post(()->answer.ok(object("publish",valid&&canCheckBotInChat(chat.id,owner),"configure",configure,"invite",invite)));
                        });
                    },error->answer.ok(object("publish",false,"configure",configure,"invite",invite)));
                };
                session.perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(owner)),
                        withActor,error->withActor.accept(null));
            });
        });
    }
    private boolean canCheckBotInChat(long chatId,long owner){
        return !destroyed&&currentAccount()&&session.selfId==owner&&session.activeChat==chatId&&session.activeTopic==0;
    }
    private void botForget(Answer answer){requireAccount();long owner=session.selfId;String slot=session.slot;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{BotAccounts.clear(activity,slot);main.post(()->{if(currentAccount()&&session.selfId==owner)answer.ok(true);else answer.fail("La cuenta cambió.");});});
    }
    private void botTokenSet(JSONObject params,Answer answer)throws Exception{requireAccount();long botUserId=BridgePolicy.id(params,"botUserId"),owner=session.selfId;String slot=session.slot;String token=BridgePolicy.text(params,"token",128).trim();
        if(!BotApi.validToken(token)){answer.fail("El token no tiene el formato que entrega @BotFather.");return;}
        perform(new TdApi.GetUser(botUserId),answer,user->{
            if(!(user.type instanceof TdApi.UserTypeBot)){answer.fail("Ese usuario no es un bot de Telegram.");return;}
            String username=botUsername(user);
            if(username==null||username.isBlank()){answer.fail("Telegram no publicó el nombre de usuario de este bot.");return;}
            String name=NativeSnapshot.limit(((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim(),90);
            String displayName=name.isEmpty()?username:name;
            JSONObject record=object("botUserId",Long.toString(botUserId),"username",username,"name",displayName,"token",token);
            ((WrgramApplication)activity.getApplication()).botNetwork().execute(()->{BotApi.Reply me=BotApi.call(token,"getMe",null);
                main.post(()->{if(!currentAccount()||session.selfId!=owner){answer.fail("La cuenta cambió. No se guardó ningún token.");return;}
                    if(me.error!=null){answer.fail(me.error);return;}
                    if(!sameBot(me.result,botUserId,username)){answer.fail("Ese token pertenece a otro bot. No se guardó nada.");return;}
                    ((WrgramApplication)activity.getApplication()).storage().execute(()->{String failure=null;try{BotAccounts.write(activity,slot,owner,record);}catch(Exception ignored){failure="No se pudo cifrar el token en este teléfono.";}
                        final String error=failure;main.post(()->{if(!currentAccount()||session.selfId!=owner)answer.fail("La cuenta cambió. Comprueba en @BotFather que el token siga activo antes de repetirlo.");else if(error!=null)answer.fail(error);else answer.ok(botRecordDto(record));});});});});
        });
    }
    /** El token solo vale si @BotFather lo emitió para exactamente el bot elegido en la interfaz. */
    static boolean sameBot(JSONObject identity,long botUserId,String username){
        return identity!=null&&identity.optLong("id")==botUserId&&username!=null&&username.equalsIgnoreCase(identity.optString("username",""));
    }
    private void botPublish(JSONObject params,Answer answer){TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Un bot publica en grupos y canales, no en chats privados.");return;}
        if(session.activeTopic!=0){answer.fail("WRGram no publica dentro de un tema del foro con un bot: la Bot API pide un identificador de hilo que este binding de TDLib no expone.");return;}
        String text;JSONArray entities;try{text=BridgePolicy.text(params,"text",4096);entities=params.optJSONArray("entities");}catch(Exception invalid){answer.fail("El texto admite hasta 4096 caracteres.");return;}
        if(text.isBlank()){answer.fail("Escribe algo antes de publicar.");return;}
        boolean silent=params.optBoolean("silent",false),preview=params.optBoolean("preview",true);
        final boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;final long chatId=chat.id;
        final JSONObject payload;try{payload=botTextPayload(chatId,0,text,entities,silent,preview,false);}catch(Exception invalid){answer.fail(invalid instanceof IllegalArgumentException?invalid.getMessage():"No se pudo preparar la publicación con el bot.");return;}
        storedBot(chatId,answer,stored->perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(stored.optLong("botUserId"))),answer,member->{
            if(!canCheckBotInChat(chatId,answer.owner)){answer.fail("La conversación cambió. No se envió la publicación.");return;}
            String problem=botPublishProblem(member.status,channel);if(problem!=null){answer.fail(problem);return;}
            botApiCall(stored.optString("token",""),"sendMessage",payload,answer,sent->{
                schedule();answer.ok(object("messageId",Long.toString(sent==null?0:sent.optLong("message_id")),"username",stored.optString("username","")));});}));
    }
    /** Telegram solo deja publicar al bot que es administrador; en un canal necesita además el derecho de publicar. */
    static String botPublishProblem(TdApi.ChatMemberStatus status,boolean channel){
        if(status instanceof TdApi.ChatMemberStatusAdministrator){TdApi.ChatAdministratorRights rights=((TdApi.ChatMemberStatusAdministrator)status).rights;
            if(channel&&(rights==null||!rights.canPostMessages))return "El bot es administrador del canal pero sin permiso para publicar. Cambia sus permisos desde Miembros.";
            return null;}
        if(status instanceof TdApi.ChatMemberStatusCreator)return null;
        if(status instanceof TdApi.ChatMemberStatusLeft)return "El bot ya no es miembro de este chat. Vuelve a añadirlo y promuévelo a administrador.";
        if(status instanceof TdApi.ChatMemberStatusBanned)return "El bot está baneado en este chat. Quítale el baneo antes de publicar.";
        return "El bot todavía no es administrador de este chat. Promuévelo desde Miembros para poder publicar con él.";
    }
    /** Nombre publicado de un bot: el editable y, si Telegram no lo trae, el primer nombre activo. */
    static String botUsername(TdApi.User user){
        if(user==null||user.usernames==null)return null;
        String primary=user.usernames.editableUsername;
        if(primary!=null&&!primary.isBlank())return primary;
        if(user.usernames.activeUsernames!=null)for(String value:user.usernames.activeUsernames){if(value!=null&&!value.isBlank())return value;}
        return null;
    }
    private interface BotStep{void run(JSONObject stored)throws Exception;}
    private interface BotReply{void run(JSONObject result)throws Exception;}
    /** El registro cifrado solo se lee fuera del hilo de interfaz; al volver se comprueba cuenta, bot y chat. */
    private void storedBot(long chatId,Answer answer,BotStep next){
        final long owner=session.selfId;final String slot=session.slot;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{JSONObject record;String failure=null;
            try{record=BotAccounts.read(activity,slot,owner);}catch(Exception ignored){record=null;failure="No se pudo descifrar el bot de esta cuenta.";}
            final JSONObject stored=record;final String readError=failure;
            main.post(()->{if(!currentAccount()||session.selfId!=owner){answer.fail("La cuenta cambió. No se envió nada a la Bot API.");return;}
                if(stored==null){answer.fail(readError!=null?readError:"Configura primero un bot propio para este chat.");return;}
                if(stored.optLong("botUserId")<=0){answer.fail("El bot guardado en este teléfono ya no es válido. Vuelve a configurarlo.");return;}
                if(session.activeChat!=chatId){answer.fail("La conversación cambió. No se envió nada a la Bot API.");return;}
                try{next.run(stored);}catch(Exception invalid){answer.fail(invalid instanceof IllegalArgumentException?invalid.getMessage():"No se pudo preparar la operación del bot.");}});});
    }
    private void botApiCall(String token,String method,JSONObject payload,Answer answer,BotReply next){
        ((WrgramApplication)activity.getApplication()).botNetwork().execute(()->{BotApi.Reply reply=BotApi.call(token,method,payload);
            main.post(()->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió. Revisa el chat antes de repetir la operación.");return;}
                if(reply.error!=null){answer.fail(reply.error);return;}
                try{next.run(reply.result);}catch(Exception invalid){answer.fail(invalid instanceof IllegalArgumentException?invalid.getMessage():"No se pudo preparar el resultado de la Bot API.");}});});
    }
    /** Solo los nombres de entidad que la Bot API conoce; los desplazamientos ya vienen en unidades UTF-16. */
    static String botEntityType(String type){switch(type){case "bold":return "bold";case "italic":return "italic";case "underline":return "underline";case "strikethrough":return "strikethrough";case "spoiler":return "spoiler";case "blockquote":return "blockquote";case "code":return "code";case "pre":return "pre";case "mention":return "mention";case "link":return "text_link";case "url":return "url";case "email":return "email";case "phone":return "phone_number";case "hashtag":return "hashtag";case "cashtag":return "cashtag";case "botCommand":return "bot_command";default:return null;}}
    static JSONArray botEntities(JSONArray raw,String text)throws Exception{
        JSONArray out=new JSONArray();
        if(raw==null)return out;
        if(raw.length()>100)throw new IllegalArgumentException("La publicación admite como máximo 100 tramos con formato.");
        for(int index=0;index<raw.length();index++){
            Object item=raw.opt(index);
            if(!(item instanceof JSONObject))throw new IllegalArgumentException("Uno de los tramos con formato no es válido.");
            JSONObject entity=(JSONObject)item;String type=botEntityType(entity.optString("type",""));
            if(type==null)throw new IllegalArgumentException("Ese formato no está disponible al publicar con un bot.");
            int offset=entity.optInt("offset",-1),length=entity.optInt("length",-1);
            if(offset<0||length<1||offset+length>text.length())throw new IllegalArgumentException("Un tramo con formato no coincide con el texto publicado.");
            JSONObject value=new JSONObject();value.put("offset",offset);value.put("length",length);value.put("type",type);
            if("text_link".equals(type)){String url=entity.optString("url","");
                if(!url.matches("(?i)^https?://[^\\s]{1,248}$"))throw new IllegalArgumentException("Un enlace de la publicación no cumple lo que admite la Bot API: https o http y hasta 256 caracteres.");
                value.put("url",url);}
            out.put(value);
        }
        return out;
    }
    /** `disable_notification` solo existe al enviar; al editar, la Bot API lo rechazaría. */
    static JSONObject botTextPayload(long chatId,long messageId,String text,JSONArray rawEntities,boolean silent,boolean preview,boolean editing)throws Exception{
        JSONObject payload=new JSONObject();
        payload.put("chat_id",Long.toString(chatId));
        if(messageId>0)payload.put("message_id",messageId);
        payload.put("text",text);
        JSONArray entities=botEntities(rawEntities,text);
        if(entities.length()>0)payload.put("entities",entities);
        if(!editing&&silent)payload.put("disable_notification",true);
        if(!preview)payload.put("link_preview_options",new JSONObject().put("is_disabled",true));
        return payload;
    }
    static String failedToAddReason(TdApi.FailedToAddMembers result,long userId){
        if(result==null||result.failedToAddMembers==null)return null;
        for(TdApi.FailedToAddMember item:result.failedToAddMembers){
            if(item==null||item.userId!=userId)continue;
            if(item.premiumRequiredToSendMessages)return item.premiumWouldAllowInvite?"Telegram solo permite añadir a este bot con una cuenta con Telegram Premium.":"Este chat exige Telegram Premium para añadir a este bot.";
            return "Telegram rechazó añadir al bot a este chat.";}
        return null;
    }
    /** Se puede dar rol de administrador a un miembro normal, restringido o salido; nunca a propietario, baneado o administrador. */
    static boolean promotableBotStatus(TdApi.ChatMemberStatus status){return status instanceof TdApi.ChatMemberStatusMember||status instanceof TdApi.ChatMemberStatusRestricted||status instanceof TdApi.ChatMemberStatusLeft;}
    private void ownedBots(Answer answer){requireAccount();
        perform(new TdApi.GetOwnedBots(),answer,value->{long[] raw=value.userIds==null?new long[0]:value.userIds;ownedBotStep(answer,raw.length>20?java.util.Arrays.copyOf(raw,20):raw,0,new java.util.ArrayList<>());});
    }
    /** GetOwnedBots solo devuelve identificadores: cada bot se resuelve con la caché y, si falta, con GetUser. */
    private void ownedBotStep(Answer answer,long[] ids,int index,java.util.List<TdApi.User> found){
        if(index>=ids.length){try{JSONArray items=new JSONArray();for(TdApi.User user:found)items.put(ownedBotDto(user));answer.ok(items);}catch(Exception ignored){answer.fail("No se pudo preparar la lista de bots de esta cuenta.");}return;}
        final long id=ids[index];TdApi.User cached=session.user(id);
        if(cached!=null){if(cached.type instanceof TdApi.UserTypeBot)found.add(cached);ownedBotStep(answer,ids,index+1,found);return;}
        session.perform(new TdApi.GetUser(id),user->{if(user!=null&&user.type instanceof TdApi.UserTypeBot)found.add(user);ownedBotStep(answer,ids,index+1,found);},ignored->ownedBotStep(answer,ids,index+1,found));
    }
    private JSONObject ownedBotDto(TdApi.User user)throws Exception{
        TdApi.UserTypeBot type=(TdApi.UserTypeBot)user.type;String username=botUsername(user);
        String name=NativeSnapshot.limit(((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim(),90);
        return object("id",Long.toString(user.id),"name",name.isEmpty()?JSONObject.NULL:name,"username",username==null?JSONObject.NULL:username,"owned",type.canBeEdited,"canJoinGroups",type.canJoinGroups);
    }
    /** Permisos que el propio bot declara por defecto; los escribe su dueño en @BotFather, no WRGram. */
    private void botDefaultRights(JSONObject params,Answer answer){requireAccount();long botUserId=BridgePolicy.id(params,"botUserId");
        perform(new TdApi.GetUserFullInfo(botUserId),answer,full->{try{TdApi.BotInfo info=full.botInfo;
            Object group=info==null||info.defaultGroupAdministratorRights==null?JSONObject.NULL:administratorRightsDto(info.defaultGroupAdministratorRights);
            Object channel=info==null||info.defaultChannelAdministratorRights==null?JSONObject.NULL:administratorRightsDto(info.defaultChannelAdministratorRights);
            answer.ok(object("known",group!=JSONObject.NULL||channel!=JSONObject.NULL,"group",group,"channel",channel));
        }catch(Exception ignored){answer.fail("No se pudieron leer los permisos que declara este bot.");}});
    }
    private void addBotToChat(JSONObject params,Answer answer){TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Un bot solo puede administrar supergrupos y canales.");return;}
        final long botUserId;try{botUserId=BridgePolicy.id(params,"botUserId");}catch(Exception invalid){answer.fail("Elige un bot de la lista.");return;}
        if(botUserId==session.selfId){answer.fail("Elige un bot, no tu propia cuenta.");return;}
        final boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel,knownTopic=session.activeTopic!=0;
        if(knownTopic){answer.fail("WRGram administra al bot desde el chat, no dentro de un tema del foro.");return;}
        long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;TdApi.Supergroup info=session.supergroup(supergroupId);
        final boolean forum=info!=null&&info.isForum;final long owner=session.selfId,chatId=chat.id;
        perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{
            if(!canInviteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para añadir miembros a este chat.");return;}
            if(!canPromoteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para promover administradores.");return;}
            perform(new TdApi.GetUser(botUserId),answer,user->{
                if(!(user.type instanceof TdApi.UserTypeBot)){answer.fail("Ese usuario no es un bot de Telegram.");return;}
                if(!((TdApi.UserTypeBot)user.type).canJoinGroups){answer.fail("El bot tiene bloqueada la entrada en grupos y canales. Actívala con @BotFather y vuelve a intentarlo.");return;}
                perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(botUserId)),answer,member->{
                    if(member.status instanceof TdApi.ChatMemberStatusAdministrator){answer.fail("El bot ya es administrador. Edita sus permisos desde Miembros.");return;}
                    if(member.status instanceof TdApi.ChatMemberStatusCreator){answer.fail("Ese usuario es el propietario del chat.");return;}
                    if(member.status instanceof TdApi.ChatMemberStatusBanned){answer.fail("El bot está baneado en este chat. Quítale el baneo antes de añadirlo.");return;}
                    final TdApi.ChatAdministratorRights rights;
                    try{rights=requestedAdminRights(params,actor,channel,forum,null);}catch(Exception invalid){answer.fail(invalid.getMessage());return;}
                    final boolean inside=member.status instanceof TdApi.ChatMemberStatusMember||member.status instanceof TdApi.ChatMemberStatusRestricted;
                    String name=session.senderName(new TdApi.MessageSenderUser(botUserId));
                    Dialogs.builder(activity).setTitle(inside?"Dar permisos de administrador":"Añadir bot como administrador")
                        .setMessage((inside?"":name+" se añadirá a «"+NativeSnapshot.limit(chat.title,80)+"». ")+"Recibirá: "+adminRightsSummary(rights)+". Telegram vuelve a validar tu autoridad al aplicar el cambio.")
                        .setNegativeButton("Cancelar",(d,w)->answer.ok(false))
                        .setPositiveButton(inside?"Dar permisos":"Añadir y dar permisos",(d,w)->{
                            if(!currentAccount()||session.selfId!=owner||session.activeChat!=chatId){answer.fail("La conversación cambió. No se modificó el chat.");return;}
                            if(inside){promoteBot(chatId,botUserId,rights,answer);return;}
                            perform(new TdApi.AddChatMember(chatId,botUserId,0),answer,failed->{String rejection=failedToAddReason(failed,botUserId);
                                if(rejection!=null){answer.fail(rejection);return;}
                                perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(botUserId)),answer,added->{
                                    if(!promotableBotStatus(added.status)){answer.fail("Telegram añadió al bot pero no confirmó su membresía. Revisa el chat antes de repetir.");return;}
                                    promoteBot(chatId,botUserId,rights,answer);});});})
                        .setOnCancelListener(d->answer.ok(false)).show();});});});
    }
    private void promoteBot(long chatId,long botUserId,TdApi.ChatAdministratorRights rights,Answer answer){
        perform(new TdApi.SetChatMemberStatus(chatId,new TdApi.MessageSenderUser(botUserId),new TdApi.ChatMemberStatusAdministrator(false,rights)),answer,ignored->{schedule();answer.ok(true);});
    }
    /** Salir del chat no es banear: el bot conserva sus mensajes y puede volver a añadirse. */
    private void removeBotFromChat(JSONObject params,Answer answer){TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Un bot solo puede administrarse en supergrupos y canales.");return;}
        final long botUserId;try{botUserId=BridgePolicy.id(params,"botUserId");}catch(Exception invalid){answer.fail("Elige un bot de la lista.");return;}
        if(botUserId==session.selfId){answer.fail("No puedes quitarte el rol desde aquí.");return;}
        final long owner=session.selfId,chatId=chat.id;
        perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{
            if(!canRestrictMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para quitar miembros de este chat.");return;}
            perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(botUserId)),answer,member->{
                if(member.status instanceof TdApi.ChatMemberStatusCreator){answer.fail("El propietario del chat no se quita con esta acción.");return;}
                if(member.status instanceof TdApi.ChatMemberStatusLeft){answer.fail("El bot ya no es miembro de este chat.");return;}
                if(member.status instanceof TdApi.ChatMemberStatusBanned){answer.fail("El bot ya está baneado de este chat.");return;}
                final boolean admin=member.status instanceof TdApi.ChatMemberStatusAdministrator;
                if(admin&&(!((TdApi.ChatMemberStatusAdministrator)member.status).canBeEdited||!canPromoteMembers(actor))){answer.fail("Telegram no permite quitarle el rol a este bot desde esta cuenta.");return;}
                String name=session.senderName(new TdApi.MessageSenderUser(botUserId));
                Dialogs.builder(activity).setTitle("Quitar bot del chat")
                    .setMessage(name+" dejará de ser administrador y saldrá del chat. Conserva los mensajes ya publicados y podrá volver a añadirse; para borrarle todo su historial usa Banear en Miembros.")
                    .setNegativeButton("Cancelar",(d,w)->answer.ok(false))
                    .setPositiveButton("Quitar del chat",(d,w)->{
                        if(!currentAccount()||session.selfId!=owner||session.activeChat!=chatId){answer.fail("La conversación cambió. No se modificó el chat.");return;}
                        final TdApi.MessageSender sender=new TdApi.MessageSenderUser(botUserId);
                        if(!admin){leaveBot(chatId,sender,answer);return;}
                        perform(new TdApi.SetChatMemberStatus(chatId,sender,new TdApi.ChatMemberStatusMember(0)),answer,ignored->{
                            perform(new TdApi.GetChatMember(chatId,sender),answer,checked->{
                                if(!(checked.status instanceof TdApi.ChatMemberStatusMember)){answer.fail("Telegram degradó al bot pero no confirmó el cambio. Repite la acción desde Miembros.");return;}
                                leaveBot(chatId,sender,answer);});});})
                    .setOnCancelListener(d->answer.ok(false)).show();});});}
    private void leaveBot(long chatId,TdApi.MessageSender sender,Answer answer){
        perform(new TdApi.SetChatMemberStatus(chatId,sender,new TdApi.ChatMemberStatusLeft()),answer,ignored->{schedule();answer.ok(true);});
    }
    private void botPosts(JSONObject params,Answer answer){TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Las publicaciones de un bot solo se listan en grupos y canales.");return;}
        final long chatId=chat.id;
        storedBot(chatId,answer,stored->perform(new TdApi.SearchChatMessages(chatId,null,"",new TdApi.MessageSenderUser(stored.optLong("botUserId")),0,0,20,new TdApi.SearchMessagesFilterEmpty()),answer,value->{try{JSONArray items=new JSONArray();long bot=stored.optLong("botUserId");
            if(value.messages!=null)for(TdApi.Message message:value.messages){
                if(!(message.senderId instanceof TdApi.MessageSenderUser)||((TdApi.MessageSenderUser)message.senderId).userId!=bot||message.isOutgoing||message.selfDestructType!=null||!(message.content instanceof TdApi.MessageText))continue;
                items.put(object("id",Long.toString(message.id),"text",NativeSnapshot.limit(((TdApi.MessageText)message.content).text.text,4096),"entities",NativeSnapshot.entities(((TdApi.MessageText)message.content).text),"pinned",message.isPinned,"date",message.date));}
            answer.ok(items);}catch(Exception ignored){answer.fail("No se pudo preparar la lista de publicaciones del bot.");}}));
    }
    /** La autoría la decide Telegram con `GetMessage`; la interfaz solo ofrece el mensaje que el bot escribió. */
    private void botMessageAction(JSONObject params,Answer answer,String kind){TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Estas acciones solo existen en grupos y canales.");return;}
        final long messageId;try{messageId=BridgePolicy.id(params,"messageId");}catch(Exception invalid){answer.fail("Elige una publicación del bot.");return;}
        if(messageId<=0){answer.fail("Elige una publicación del bot.");return;}
        String newText=null;JSONArray marks=null;boolean preview=true,quiet=false;
        if("editar".equals(kind)){try{newText=BridgePolicy.text(params,"text",4096);marks=params.optJSONArray("entities");}catch(Exception invalid){answer.fail("El texto admite hasta 4096 caracteres.");return;}
            preview=params.optBoolean("preview",true);if(newText.isBlank()){answer.fail("Escribe el texto nuevo antes de editar.");return;}}
        if("fijar".equals(kind))quiet=params.optBoolean("silent",false);
        final String text=newText;final JSONArray entities=marks;final boolean showPreview=preview,silent=quiet;
        final long chatId=chat.id;final boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;
        final String method;final JSONObject payload;
        try{
            if("editar".equals(kind)){method="editMessageText";payload=botTextPayload(chatId,messageId,text,entities,false,showPreview,true);}
            else if("borrar".equals(kind)){method="deleteMessage";payload=object("chat_id",Long.toString(chatId),"message_id",messageId);}
            else if("fijar".equals(kind)){method="pinChatMessage";payload=object("chat_id",Long.toString(chatId),"message_id",messageId);if(silent)payload.put("disable_notification",true);}
            else{method="unpinChatMessage";payload=object("chat_id",Long.toString(chatId),"message_id",messageId);}
        }catch(Exception invalid){answer.fail(invalid instanceof IllegalArgumentException?invalid.getMessage():"No se pudo preparar la acción sobre la publicación del bot.");return;}
        storedBot(chatId,answer,stored->perform(new TdApi.GetMessage(chatId,messageId),answer,message->{
            long bot=stored.optLong("botUserId");
            if(!(message.senderId instanceof TdApi.MessageSenderUser)||((TdApi.MessageSenderUser)message.senderId).userId!=bot||message.isOutgoing){answer.fail("Ese mensaje no lo publicó el bot guardado en este teléfono. WRGram solo actúa sobre sus propias publicaciones.");return;}
            if(message.selfDestructType!=null||message.ephemeralContent!=null){answer.fail("Telegram no permite modificar mensajes con autodestrucción.");return;}
            if("editar".equals(kind)&&!(message.content instanceof TdApi.MessageText)){answer.fail("El bot solo puede editar mensajes de texto; los pies de foto se editan desde el chat.");return;}
            perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(bot)),answer,member->{String problem=botPublishProblem(member.status,channel);
                if(problem!=null){answer.fail(problem);return;}
                if("borrar".equals(kind)){Dialogs.builder(activity).setTitle("Borrar publicación del bot").setMessage("La Bot API borrará este mensaje del chat. La acción no se puede deshacer desde WRGram.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Borrar",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chatId){answer.fail("La conversación cambió. No se borró nada.");return;}publishWithBot(stored,method,payload,answer);}).setOnCancelListener(d->answer.ok(false)).show();return;}
                publishWithBot(stored,method,payload,answer);});}));
    }
    private void publishWithBot(JSONObject stored,String method,JSONObject payload,Answer answer){
        botApiCall(stored.optString("token",""),method,payload,answer,ignored->{schedule();answer.ok(true);});
    }
    private static boolean requiredBool(JSONObject value,String key)throws Exception{Object raw=value.opt(key);if(!(raw instanceof Boolean))throw new IllegalArgumentException("Missing permission: "+key);return (Boolean)raw;}
    private static TdApi.SupergroupMembersFilter supergroupMembersFilter(String key){switch(key){case "recent":return null;case "administrators":return new TdApi.SupergroupMembersFilterAdministrators();case "restricted":return new TdApi.SupergroupMembersFilterRestricted();case "banned":return new TdApi.SupergroupMembersFilterBanned();case "bots":return new TdApi.SupergroupMembersFilterBots();case "contacts":return new TdApi.SupergroupMembersFilterContacts("");default:throw new IllegalArgumentException("Filtro de miembros no válido.");}}
    private static TdApi.ChatMembersFilter chatMembersFilter(String key){switch(key){case "recent":return new TdApi.ChatMembersFilterMembers();case "administrators":return new TdApi.ChatMembersFilterAdministrators();case "restricted":return new TdApi.ChatMembersFilterRestricted();case "banned":return new TdApi.ChatMembersFilterBanned();case "bots":return new TdApi.ChatMembersFilterBots();case "contacts":return new TdApi.ChatMembersFilterContacts();default:throw new IllegalArgumentException("Filtro de miembros no válido.");}}
    private static JSONObject administratorRightsDto(TdApi.ChatAdministratorRights rights)throws Exception{return object("canChangeInfo",rights.canChangeInfo,"canPostMessages",rights.canPostMessages,"canEditMessages",rights.canEditMessages,"canDeleteMessages",rights.canDeleteMessages,"canInviteUsers",rights.canInviteUsers,"canRestrictMembers",rights.canRestrictMembers,"canPinMessages",rights.canPinMessages,"canManageTopics",rights.canManageTopics,"canPromoteMembers",rights.canPromoteMembers,"canManageVideoChats",rights.canManageVideoChats,"canPostStories",rights.canPostStories,"canEditStories",rights.canEditStories,"canDeleteStories",rights.canDeleteStories,"canManageDirectMessages",rights.canManageDirectMessages,"canManageTags",rights.canManageTags,"canSendWelcomeMessages",rights.canSendWelcomeMessages);}
    private JSONObject memberDto(TdApi.ChatMember member,TdApi.ChatMember actor,boolean channel,boolean forum,boolean canRestrict,boolean canPromote)throws Exception{
        long userId=((TdApi.MessageSenderUser)member.memberId).userId;
        TdApi.User user=session.user(userId);
        String name=user==null?"Usuario de Telegram":NativeSnapshot.limit(((user.firstName==null?"":user.firstName)+" "+(user.lastName==null?"":user.lastName)).trim(),90);
        if(name.isEmpty())name=user==null?"Usuario de Telegram":NativeSnapshot.limit(user.usernames==null||user.usernames.editableUsername==null?"Usuario de Telegram":"@"+user.usernames.editableUsername,90);
        boolean normal=member.status instanceof TdApi.ChatMemberStatusMember,restricted=member.status instanceof TdApi.ChatMemberStatusRestricted,banned=member.status instanceof TdApi.ChatMemberStatusBanned,editableAdmin=member.status instanceof TdApi.ChatMemberStatusAdministrator&&((TdApi.ChatMemberStatusAdministrator)member.status).canBeEdited;
        String status=member.status instanceof TdApi.ChatMemberStatusAdministrator?"Administrador":member.status instanceof TdApi.ChatMemberStatusCreator?"Propietario":restricted?"Restringido":banned?"Baneado":"Miembro";
        int until=banned?((TdApi.ChatMemberStatusBanned)member.status).bannedUntilDate:restricted?((TdApi.ChatMemberStatusRestricted)member.status).restrictedUntilDate:0;
        TdApi.ChatAdministratorRights current=administratorRights(member);
        return object("id",Long.toString(userId),"name",name,"status",status,"admin",member.status instanceof TdApi.ChatMemberStatusAdministrator,"bot",user!=null&&user.type instanceof TdApi.UserTypeBot,"canBan",canRestrict&&(normal||restricted),"canUnban",canRestrict&&(banned||restricted),"canRestrict",canRestrict&&!channel&&(normal||restricted),"canPromote",canPromote&&normal,"canDemote",canPromote&&editableAdmin,"canEditRights",canPromote&&editableAdmin,"restricted",restricted,"banned",banned,"until",until,"currentRights",current==null?JSONObject.NULL:administratorRightsDto(current),"adminRights",canPromote?availableAdminRights(actor,channel,forum):JSONObject.NULL);
    }
    private void groupMembers(JSONObject params,Answer answer){groupMembers(params,answer,false);}
    private void groupMembersPage(JSONObject params,Answer answer){groupMembers(params,answer,true);}
    private void groupMembers(JSONObject params,Answer answer,boolean page){
        TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("La administración solo está disponible en supergrupos y canales.");return;}
        long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;TdApi.Supergroup info=session.supergroup(supergroupId);boolean forum=info!=null&&info.isForum;
        String query=params.optString("query","");if(query.length()>80){answer.fail("La búsqueda de miembros admite hasta 80 caracteres.");return;}
        String filterKey=params.optString("filter","recent");int offset=Math.max(0,Math.min(5000,params.optInt("offset",0)));int limit=Math.max(1,Math.min(50,params.optInt("limit",50)));
        perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{
            boolean canRestrict=canRestrictMembers(actor),canPromote=canPromoteMembers(actor);if(!canRestrict&&!canPromote){answer.fail("Telegram no concede a esta cuenta permisos para administrar miembros.");return;}
            final TdApi.Function<TdApi.ChatMembers> request;
            try{request=query.trim().isEmpty()?new TdApi.GetSupergroupMembers(supergroupId,supergroupMembersFilter(filterKey),offset,limit):new TdApi.SearchChatMembers(chat.id,query.trim(),limit,chatMembersFilter(filterKey));}catch(Exception invalid){answer.fail(invalid.getMessage());return;}
            perform(request,answer,result->{
                try{JSONArray members=new JSONArray();if(result.members!=null)for(TdApi.ChatMember member:result.members){if(!(member.memberId instanceof TdApi.MessageSenderUser))continue;long userId=((TdApi.MessageSenderUser)member.memberId).userId;if(userId==session.selfId)continue;members.put(memberDto(member,actor,channel,forum,canRestrict,canPromote));}
                    if(page){int received=result.members==null?0:result.members.length;int next=query.trim().isEmpty()?offset+received:0;answer.ok(object("members",members,"nextOffset",next,"hasMore",query.trim().isEmpty()&&next<result.totalCount));}
                    else answer.ok(members);
                }catch(Exception ignored){answer.fail("No se pudo preparar la lista de miembros.");}
            });
        });
    }
    private void bannedMembers(JSONObject params,Answer answer)throws Exception{TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("La lista de baneos solo está disponible en supergrupos y canales.");return;}String query=BridgePolicy.text(params,"query",80).trim();long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;TdApi.Supergroup info=session.supergroup(supergroupId);boolean forum=info!=null&&info.isForum;perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canRestrictMembers(actor)){answer.fail("Telegram no concede permiso para consultar baneos.");return;}TdApi.Function<TdApi.ChatMembers> request=query.isEmpty()?new TdApi.GetSupergroupMembers(supergroupId,new TdApi.SupergroupMembersFilterBanned(),0,50):new TdApi.SearchChatMembers(chat.id,query,50,new TdApi.ChatMembersFilterBanned());perform(request,answer,result->{try{JSONArray values=new JSONArray();if(result.members!=null)for(TdApi.ChatMember member:result.members){if(!(member.memberId instanceof TdApi.MessageSenderUser))continue;values.put(memberDto(member,actor,channel,forum,true,false));}answer.ok(values);}catch(Exception ignored){answer.fail("No se pudo preparar la lista de baneos.");}});});}
    private void unbanGroupMember(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Esta acción requiere un supergrupo o canal.");return;}long userId=BridgePolicy.id(params,"userId");if(userId==session.selfId){answer.fail("No puedes cambiar tu propio estado desde esta lista.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canRestrictMembers(actor)){answer.fail("Telegram no concede permiso para quitar restricciones.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(userId)),answer,target->{boolean banned=target.status instanceof TdApi.ChatMemberStatusBanned,restricted=target.status instanceof TdApi.ChatMemberStatusRestricted;if(!banned&&!restricted){answer.fail("Este usuario ya no figura como baneado o restringido.");return;}boolean left=restricted&&!((TdApi.ChatMemberStatusRestricted)target.status).isMember;TdApi.ChatMemberStatus restored=left?new TdApi.ChatMemberStatusLeft():new TdApi.ChatMemberStatusMember(0);String name=session.senderName(new TdApi.MessageSenderUser(userId));Dialogs.builder(activity).setTitle(banned?"Quitar baneo":"Quitar restricción").setMessage(left?"Se quitará la restricción de "+name+". Como no es miembro, no se le añadirá al chat; podrá volver a unirse si el chat lo permite.":"Se restaurará el acceso completo de "+name+" a este grupo o canal. No se enviará una invitación.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton(banned?"Quitar baneo":"Quitar restricción",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id){answer.fail("La conversación cambió. No se cambió el estado del usuario.");return;}perform(new TdApi.SetChatMemberStatus(chat.id,new TdApi.MessageSenderUser(userId),restored),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();});});}
    private static boolean grantedAdminRight(TdApi.ChatMember actor,String name){if(actor.status instanceof TdApi.ChatMemberStatusCreator)return true;TdApi.ChatAdministratorRights rights=administratorRights(actor);if(rights==null)return false;switch(name){case "canChangeInfo":return rights.canChangeInfo;case "canPostMessages":return rights.canPostMessages;case "canEditMessages":return rights.canEditMessages;case "canDeleteMessages":return rights.canDeleteMessages;case "canInviteUsers":return rights.canInviteUsers;case "canRestrictMembers":return rights.canRestrictMembers;case "canPinMessages":return rights.canPinMessages;case "canManageTopics":return rights.canManageTopics;case "canPromoteMembers":return rights.canPromoteMembers;case "canManageVideoChats":return rights.canManageVideoChats;case "canPostStories":return rights.canPostStories;case "canEditStories":return rights.canEditStories;case "canDeleteStories":return rights.canDeleteStories;case "canManageDirectMessages":return rights.canManageDirectMessages;case "canManageTags":return rights.canManageTags;case "canSendWelcomeMessages":return rights.canSendWelcomeMessages;default:return false;}}
    private static boolean adminRightValue(TdApi.ChatAdministratorRights rights,String name){switch(name){case "canChangeInfo":return rights.canChangeInfo;case "canPostMessages":return rights.canPostMessages;case "canEditMessages":return rights.canEditMessages;case "canDeleteMessages":return rights.canDeleteMessages;case "canInviteUsers":return rights.canInviteUsers;case "canRestrictMembers":return rights.canRestrictMembers;case "canPinMessages":return rights.canPinMessages;case "canManageTopics":return rights.canManageTopics;case "canPromoteMembers":return rights.canPromoteMembers;case "canManageVideoChats":return rights.canManageVideoChats;case "canPostStories":return rights.canPostStories;case "canEditStories":return rights.canEditStories;case "canDeleteStories":return rights.canDeleteStories;case "canManageDirectMessages":return rights.canManageDirectMessages;case "canManageTags":return rights.canManageTags;case "canSendWelcomeMessages":return rights.canSendWelcomeMessages;default:return false;}}
    private TdApi.ChatAdministratorRights requestedAdminRights(JSONObject params,TdApi.ChatMember actor,boolean channel,boolean forum,TdApi.ChatAdministratorRights current)throws Exception{String[] fields={"canChangeInfo","canPostMessages","canEditMessages","canDeleteMessages","canInviteUsers","canRestrictMembers","canPinMessages","canManageTopics","canPromoteMembers","canManageVideoChats","canPostStories","canEditStories","canDeleteStories","canManageDirectMessages","canManageTags","canSendWelcomeMessages"};boolean[] values=new boolean[fields.length];boolean any=false;for(int i=0;i<fields.length;i++){boolean requested=requiredBool(params,fields[i]);if(grantedAdminRight(actor,fields[i]))values[i]=requested;else if(current!=null)values[i]=adminRightValue(current,fields[i]);else if(requested)throw new IllegalArgumentException("No puedes delegar un permiso que no tienes en Telegram.");any|=values[i];}if(channel&&(values[6]||values[7]||values[14])||!channel&&(values[1]||values[2]||values[13])||!forum&&values[7])throw new IllegalArgumentException("Uno de los permisos no es compatible con este tipo de chat.");if(!any)throw new IllegalArgumentException("Selecciona al menos un permiso administrativo.");return new TdApi.ChatAdministratorRights(true,values[0],values[1],values[2],values[3],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11],values[12],values[13],values[14],values[15],current!=null&&!channel&&current.isAnonymous);}
    private static String adminRightsSummary(TdApi.ChatAdministratorRights rights){java.util.ArrayList<String> labels=new java.util.ArrayList<>();if(rights.canChangeInfo)labels.add("editar información");if(rights.canPostMessages)labels.add("publicar en canales");if(rights.canEditMessages)labels.add("editar mensajes");if(rights.canDeleteMessages)labels.add("borrar mensajes");if(rights.canInviteUsers)labels.add("invitar miembros");if(rights.canRestrictMembers)labels.add("restringir miembros");if(rights.canPinMessages)labels.add("fijar mensajes");if(rights.canManageTopics)labels.add("gestionar temas");if(rights.canPromoteMembers)labels.add("promover administradores");if(rights.canManageVideoChats)labels.add("gestionar videollamadas");if(rights.canPostStories)labels.add("publicar historias");if(rights.canEditStories)labels.add("editar historias");if(rights.canDeleteStories)labels.add("eliminar historias");if(rights.canManageDirectMessages)labels.add("gestionar mensajes directos");if(rights.canManageTags)labels.add("gestionar etiquetas");if(rights.canSendWelcomeMessages)labels.add("enviar bienvenidas");return String.join(", ",labels);}
    private void promoteGroupMember(JSONObject params,Answer answer)throws Exception{TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Esta acción requiere un supergrupo o canal.");long userId=BridgePolicy.id(params,"userId");if(userId==session.selfId)throw new IllegalArgumentException("No puedes cambiar tu propio rol desde aquí.");boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel,forum=!channel&&session.supergroup(((TdApi.ChatTypeSupergroup)chat.type).supergroupId)!=null&&session.supergroup(((TdApi.ChatTypeSupergroup)chat.type).supergroupId).isForum;perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canPromoteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para administrar roles.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(userId)),answer,target->{boolean normal=target.status instanceof TdApi.ChatMemberStatusMember,editable=target.status instanceof TdApi.ChatMemberStatusAdministrator&&((TdApi.ChatMemberStatusAdministrator)target.status).canBeEdited;if(!normal&&!editable){answer.fail("Telegram solo permite promover a un miembro normal o editar un administrador que puedas modificar.");return;}final TdApi.ChatAdministratorRights rights;try{rights=requestedAdminRights(params,actor,channel,forum,editable?administratorRights(target):null);}catch(Exception invalid){answer.fail(invalid.getMessage());return;}String name=session.senderName(new TdApi.MessageSenderUser(userId));boolean editing=editable;Dialogs.builder(activity).setTitle(editing?"Editar permisos de administrador":"Promover a administrador").setMessage((editing?"Se actualizarán los permisos de ":"Se otorgarán a ")+name+": "+adminRightsSummary(rights)+". Telegram volverá a validar tu autoridad.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton(editing?"Guardar permisos":"Promover",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id){answer.fail("La cuenta cambió. No se cambió el rol.");return;}perform(new TdApi.SetChatMemberStatus(chat.id,new TdApi.MessageSenderUser(userId),new TdApi.ChatMemberStatusAdministrator(editing,rights)),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();});});}
    private void demoteGroupMember(JSONObject params,Answer answer){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Esta acción requiere un supergrupo o canal.");long userId=BridgePolicy.id(params,"userId");if(userId==session.selfId)throw new IllegalArgumentException("No puedes quitarte el rol desde este menú.");perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canPromoteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para quitar roles de administrador.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(userId)),answer,target->{if(!(target.status instanceof TdApi.ChatMemberStatusAdministrator)||!((TdApi.ChatMemberStatusAdministrator)target.status).canBeEdited){answer.fail("Telegram no permite editar este rol de administrador.");return;}String name=session.senderName(new TdApi.MessageSenderUser(userId));Dialogs.builder(activity).setTitle("Quitar administración").setMessage(""+name+" dejará de ser administrador y conservará su membresía normal.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Quitar rol",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id){answer.fail("La conversación cambió. No se quitó el rol.");return;}perform(new TdApi.SetChatMemberStatus(chat.id,new TdApi.MessageSenderUser(userId),new TdApi.ChatMemberStatusMember(0)),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();});});}
    private static String banDurationLabel(long seconds){if(seconds==0)return "de forma permanente";if(seconds%86400==0)return "durante "+(seconds/86400)+" día(s)";if(seconds%3600==0)return "durante "+(seconds/3600)+" hora(s)";return "durante "+(seconds/60)+" minuto(s)";}
    private void banGroupMember(JSONObject params,Answer answer,boolean restrict){TdApi.Chat chat=target(params);if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Esta acción requiere un supergrupo o canal.");return;}long userId=BridgePolicy.id(params,"userId");if(userId==session.selfId){answer.fail("No puedes cambiar tu propio estado desde este menú.");return;}long duration=params.optLong("duration",3600);if(duration!=0&&(duration<60||duration>366L*86400)){answer.fail("La duración debe ser permanente o estar entre 1 minuto y 366 días.");return;}boolean deleteMessages=params.optBoolean("deleteMessages",false);boolean channel=((TdApi.ChatTypeSupergroup)chat.type).isChannel;if(restrict&&channel){answer.fail("Los canales no admiten restricciones de miembros; usa Banear para expulsar del canal.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->{if(!canRestrictMembers(actor)){answer.fail("Telegram no concede permiso para restringir miembros.");return;}if(deleteMessages&&(!grantedAdminRight(actor,"canDeleteMessages")||channel)){answer.fail("Telegram no permite borrar mensajes de un miembro desde este tipo de chat o tu cuenta no tiene ese permiso.");return;}perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(userId)),answer,target->{boolean normal=target.status instanceof TdApi.ChatMemberStatusMember,restricted=target.status instanceof TdApi.ChatMemberStatusRestricted;if(!normal&&!restricted){answer.fail("Telegram solo permite aplicar esta acción a un miembro normal o ya restringido. Los administradores deben perder su rol primero.");return;}String name=session.senderName(new TdApi.MessageSenderUser(userId));int until=duration==0?0:(int)Math.min(Integer.MAX_VALUE,System.currentTimeMillis()/1000L+duration);String action=restrict?"Restringir":"Banear";Dialogs.builder(activity).setTitle(action+" a "+name).setMessage((restrict?"Se quitarán los permisos de envío a ":"Se expulsará a ")+name+" "+banDurationLabel(duration)+". "+(deleteMessages?"También se borrarán todos los mensajes que envió en este chat. ":"No se borrarán mensajes. ")+"Telegram validará el cambio en la cuenta.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton(action,(d,w)->{if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id){answer.fail("La conversación cambió. No se aplicó la restricción.");return;}TdApi.ChatMemberStatus status=restrict?new TdApi.ChatMemberStatusRestricted(true,until,new TdApi.ChatPermissions(false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false)):new TdApi.ChatMemberStatusBanned(until);perform(new TdApi.SetChatMemberStatus(chat.id,new TdApi.MessageSenderUser(userId),status),answer,ignored->{if(!deleteMessages){schedule();answer.ok(true);return;}session.perform(new TdApi.DeleteChatMessagesBySender(chat.id,new TdApi.MessageSenderUser(userId)),deleted->{schedule();answer.ok(true);},error->{schedule();answer.fail("La restricción se aplicó, pero Telegram no permitió borrar los mensajes: "+error);});});}).setOnCancelListener(d->answer.ok(false)).show();});});}
    private void prepareStarsPayment(JSONObject params,Answer answer)throws Exception{
        TdApi.Message source=message(params);
        TdApi.MessagePaidMedia paid=source.content instanceof TdApi.MessagePaidMedia?(TdApi.MessagePaidMedia)source.content:null;
        TdApi.MessageInvoice invoice=paid==null&&source.content instanceof TdApi.MessageInvoice?(TdApi.MessageInvoice)source.content:null;
        if(paid==null&&invoice==null){answer.fail("Este mensaje no contiene una compra de Telegram Stars.");return;}
        if(invoice!=null&&(!"XTR".equals(invoice.currency)||invoice.needShippingAddress||invoice.receiptMessageId!=0)){answer.fail("WRGram solo admite facturas de Telegram Stars. Los pagos con tarjeta u otras monedas necesitan la tokenización del proveedor y no están disponibles.");return;}
        if(paid!=null&&starsPurchaseDone(source.content)){answer.fail("Ya compraste este contenido o Telegram ya no lo ofrece a la venta.");return;}
        TdApi.InputInvoice input=new TdApi.InputInvoiceMessage(source.chatId,source.id);
        perform(new TdApi.GetPaymentForm(input,null),answer,form->{
            long amount;
            boolean subscription=false;
            int period=0;
            if(form.type instanceof TdApi.PaymentFormTypeStars)amount=((TdApi.PaymentFormTypeStars)form.type).starCount;
            else if(form.type instanceof TdApi.PaymentFormTypeStarSubscription){
                TdApi.StarSubscriptionPricing pricing=((TdApi.PaymentFormTypeStarSubscription)form.type).pricing;
                if(pricing==null||pricing.starCount<=0){answer.fail("Telegram devolvió un plan de suscripción no válido.");return;}
                amount=pricing.starCount;subscription=true;period=pricing.period;
            }else{answer.fail("Esta compra no se puede pagar con Telegram Stars.");return;}
            if(amount<=0){answer.fail("Telegram devolvió un importe de Stars no válido.");return;}
            String title;String description;boolean test;
            if(paid!=null){
                title=form.productInfo!=null&&form.productInfo.title!=null?form.productInfo.title:"Contenido multimedia de pago";
                description=paid.caption==null||paid.caption.text==null?"":paid.caption.text;
                test=false;
            }else{
                title=form.productInfo==null||form.productInfo.title==null?invoice.productInfo==null||invoice.productInfo.title==null?"Producto de Telegram":invoice.productInfo.title:form.productInfo.title;
                description=form.productInfo==null||form.productInfo.description==null||form.productInfo.description.text==null?"":form.productInfo.description.text;
                test=invoice.isTest;
            }
            String token=UUID.randomUUID().toString();
            starsPayments.put(token,new PendingStarsPayment(answer.owner,source.chatId,source.id,form.id,amount,NativeSnapshot.limit(title,180),NativeSnapshot.limit(description,600),NativeSnapshot.limit(session.senderName(source.senderId),80),test,subscription,period));
            while(starsPayments.size()>12)starsPayments.remove(starsPayments.keySet().iterator().next());
            answer.ok(object("token",token,"title",NativeSnapshot.limit(title,180),"description",NativeSnapshot.limit(description,600),"amount",amount,"seller",NativeSnapshot.limit(session.senderName(source.senderId),80),"test",test,"subscription",subscription,"period",period,"balance",StarsPolicy.wholeStars(session.starAmount)));
        });
    }
    /** Verdadero cuando la compra ya no se puede repetir: factura pagada o contenido de pago ya revelado. */
    private static boolean starsPurchaseDone(TdApi.MessageContent content){
        if(content instanceof TdApi.MessagePaidMedia){
            TdApi.MessagePaidMedia paid=(TdApi.MessagePaidMedia)content;
            if(paid.media!=null)for(TdApi.PaidMedia piece:paid.media)if(piece!=null&&!(piece instanceof TdApi.PaidMediaPreview))return true;
            return false;
        }
        if(content instanceof TdApi.MessageInvoice){TdApi.MessageInvoice invoice=(TdApi.MessageInvoice)content;return invoice.receiptMessageId!=0||!"XTR".equals(invoice.currency);}
        return true;
    }
    private boolean confirmingStarsPayment;
    private void confirmStarsPayment(JSONObject params,Answer answer){
        requireAccount();
        String token;
        try{token=BridgePolicy.text(params,"token",80);}
        catch(Exception ignored){answer.fail("Solicitud de pago inválida.");return;}
        if(confirmingStarsPayment){answer.fail("Ya tienes una confirmación de pago abierta.");return;}
        PendingStarsPayment payment=starsPayments.remove(token);
        if(payment==null||payment.owner!=session.selfId||payment.expiresAt<SystemClock.elapsedRealtime()){
            answer.fail("La confirmación de pago venció. Vuelve a abrir la factura.");return;
        }
        TdApi.Message message=session.message(payment.messageId);
        if(session.activeChat!=payment.chatId||message==null||starsPurchaseDone(message.content)){
            answer.fail("La factura cambió o ya se pagó. No se envió ningún pago.");return;
        }
        String renewal=payment.subscription?"\n\nSuscripción: Telegram renovará "+payment.amount+" Stars cada "+StarsPolicy.period(payment.period)+" hasta que la canceles en Telegram.":"";
        AlertDialog dialog=Dialogs.builder(activity)
                .setTitle(payment.subscription?"Confirmar suscripción con Telegram Stars":"Confirmar pago con Telegram Stars")
                .setMessage("Vas a pagar "+payment.amount+" Stars a través de Telegram por:\n\n"+payment.title+"\nVendedor: "+payment.seller+(payment.test?" (factura de prueba)":"")+(payment.description.isEmpty()?"":"\n\n"+payment.description)+renewal)
                .setNegativeButton("Cancelar",(d,w)->answer.ok(false))
                .setPositiveButton("Pagar "+payment.amount+" ⭐",null).create();
        dialog.setOnCancelListener(ignored->answer.ok(false));
        dialog.setOnDismissListener(ignored->confirmingStarsPayment=false);
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            TdApi.Message current=session.message(payment.messageId);
            if(destroyed||!currentAccount()||session.selfId!=payment.owner||session.activeChat!=payment.chatId||current==null||starsPurchaseDone(current.content)){
                dialog.dismiss();answer.fail("La cuenta, conversación o compra cambió. No se envió el pago.");return;
            }
            if(payment.expiresAt<SystemClock.elapsedRealtime()){
                dialog.dismiss();answer.fail("La confirmación de pago venció. Vuelve a abrir la factura.");return;
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);
            dialog.setCancelable(false);
            session.perform(new TdApi.SendPaymentForm(new TdApi.InputInvoiceMessage(payment.chatId,payment.messageId),payment.formId,"","",null,0),result->{
                dialog.dismiss();
                if(!currentAccount()||session.selfId!=payment.owner){answer.fail("La cuenta cambió durante el pago. Revisa la factura antes de reintentar.");return;}
                if(result.success){schedule();answer.ok(true);}
                else answer.fail("Telegram no confirmó el pago. Revisa el estado de la factura antes de reintentar.");
            },error->{dialog.dismiss();answer.fail(error);});
        }));
        dialog.show();
        confirmingStarsPayment=true;
    }
    private void cancelStarsPayment(JSONObject params,Answer answer){try{starsPayments.remove(BridgePolicy.text(params,"token",80));answer.ok(true);}catch(Exception ignored){answer.ok(false);}}
    private void paidMessagesGet(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Los mensajes de pago solo existen en supergrupos y canales.");return;}
        long groupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
        perform(new TdApi.GetSupergroupFullInfo(groupId),answer,info->perform(new TdApi.GetChatHistory(chat.id,0,0,100,false),answer,recent->{
            long price=0;
            if(recent.messages!=null)for(TdApi.Message item:recent.messages){if(item!=null&&item.content instanceof TdApi.MessagePaidMessagePriceChanged){price=((TdApi.MessagePaidMessagePriceChanged)item.content).paidMessageStarCount;break;}}
            if(price==0&&info.outgoingPaidMessageStarCount>0)price=info.outgoingPaidMessageStarCount;
            answer.ok(object("starCount",price,"canEnable",info.canEnablePaidMessages));
        }));
    }
    private void paidMessagesSet(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Los mensajes de pago solo existen en supergrupos y canales.");return;}
        long ownerId=session.selfId;
        perform(new TdApi.GetOption("paid_message_star_count_max"),answer,option->{
            long max=option instanceof TdApi.OptionValueInteger?((TdApi.OptionValueInteger)option).value:2500;
            long price=params.optLong("starCount",-1);
            if(price<0||price>max){answer.fail("El precio debe estar entre 0 (desactivado) y "+max+" Stars.");return;}
            Dialogs.builder(activity).setTitle("Mensajes de pago").setMessage(price==0?"Se desactivará el cobro por enviar mensajes a este chat: cualquiera podrá volver a escribir sin pagar."
                    :"Cada mensaje que envíe un miembro que no sea administrador costará "+price+" Stars. Telegram procesa el cobro y el chat recibe la parte que le corresponde. El cambio se aplica en Telegram.")
                .setNegativeButton("Cancelar",(d,w)->answer.ok(false))
                .setPositiveButton(price==0?"Desactivar":"Cobrar "+price+" ⭐",(d,w)->{
                    if(!currentAccount()||session.selfId!=ownerId){answer.fail("La cuenta cambió. No se cambió el precio.");return;}
                    perform(new TdApi.SetChatPaidMessageStarCount(chat.id,price),answer,ignored->{schedule();answer.ok(true);});
                }).setOnCancelListener(d->answer.ok(false)).show();
        });
    }
    private void paidMessageRevenue(JSONObject params,Answer answer)throws Exception{
        requireAccount();long userId=BridgePolicy.id(params,"userId");
        if(userId<=0)throw new IllegalArgumentException("Usuario no válido.");
        perform(new TdApi.GetPaidMessageRevenue(userId),answer,value->answer.ok(object("starCount",value.starCount)));
    }
    /** Sin id la cartera es la de la cuenta; con id debe ser un canal, el único otro titular de Stars. */
    private TdApi.MessageSender starsOwner(JSONObject params)throws Exception{
        if(!params.has("id"))return new TdApi.MessageSenderUser(session.selfId);
        TdApi.Chat chat=target(params);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException("Solo tu cuenta o un canal pueden tener cartera de Stars.");
        return new TdApi.MessageSenderChat(chat.id);
    }
    private void starsTransactions(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.MessageSender owner=starsOwner(params);int limit=StarsPolicy.page(params);String offset=StarsPolicy.offset(params);
        TdApi.TransactionDirection direction=StarsPolicy.direction(params.optString("direction",""));
        String subscription=params.has("subscriptionId")?StarsPolicy.subscriptionId(params,"subscriptionId"):"";
        perform(new TdApi.GetStarTransactions(owner,subscription,direction,offset,limit),answer,value->{
            if(sameSender(owner,new TdApi.MessageSenderUser(session.selfId)))session.rememberStars(value.starAmount);
            try{answer.ok(object("starCount",StarsPolicy.wholeStars(value.starAmount),"transactions",StarsPolicy.transactions(value.transactions),"nextOffset",value.nextOffset==null?"":NativeSnapshot.limit(value.nextOffset,512)));}
            catch(Exception ignored){answer.fail("No se pudo leer el historial de Stars.");}
        });
    }
    private void starsSubscriptions(JSONObject params,Answer answer)throws Exception{
        requireAccount();String offset=StarsPolicy.offset(params);boolean expiring=params.optBoolean("expiring",false);
        perform(new TdApi.GetStarSubscriptions(expiring,offset),answer,value->{
            session.rememberStars(value.starAmount);
            subscriptionPage(value,value.subscriptions==null?0:value.subscriptions.length,0,new JSONArray(),answer);
        });
    }
    private void subscriptionPage(TdApi.StarSubscriptions value,int total,int index,JSONArray list,Answer answer){
        if(answer.finished||destroyed||!currentAccount()||answer.owner!=session.selfId)return;
        if(index>=total){
            try{answer.ok(object("starCount",StarsPolicy.wholeStars(value.starAmount),"requiredStarCount",value.requiredStarCount,"subscriptions",list,"nextOffset",value.nextOffset==null?"":NativeSnapshot.limit(value.nextOffset,512)));}
            catch(Exception ignored){answer.fail("No se pudieron leer las suscripciones de Stars.");}
            return;
        }
        TdApi.StarSubscription item=value.subscriptions[index];
        if(item==null){subscriptionPage(value,total,index+1,list,answer);return;}
        TdApi.Chat known=session.chat(item.chatId);
        if(known!=null){putSubscription(item,known.title,list,answer);subscriptionPage(value,total,index+1,list,answer);return;}
        session.loadChat(item.chatId,chat->{putSubscription(item,chat.title,list,answer);subscriptionPage(value,total,index+1,list,answer);},error->{putSubscription(item,"",list,answer);subscriptionPage(value,total,index+1,list,answer);});
    }
    private void putSubscription(TdApi.StarSubscription item,String title,JSONArray list,Answer answer){try{list.put(StarsPolicy.subscription(item,title));}catch(Exception ignored){answer.fail("No se pudieron leer las suscripciones de Stars.");}}
    private void starsSubscriptionCancel(JSONObject params,Answer answer)throws Exception{
        requireAccount();String id=StarsPolicy.subscriptionId(params,"id");
        Dialogs.builder(activity).setTitle("Cancelar suscripción de Stars").setMessage("Telegram dejará de renovar esta suscripción. Conservarás el acceso hasta la fecha ya pagada y el periodo en curso no se reembolsa.").setNegativeButton("Mantener",(d,w)->answer.ok(false)).setPositiveButton("Cancelar suscripción",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió. No se canceló la suscripción.");return;}perform(new TdApi.EditStarSubscription(id,true),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();
    }
    private void starsSubscriptionResume(JSONObject params,Answer answer)throws Exception{
        requireAccount();String id=StarsPolicy.subscriptionId(params,"id");
        Dialogs.builder(activity).setTitle("Reanudar renovación").setMessage("Telegram volverá a cobrar el importe de esta suscripción con tu saldo de Stars en cada renovación. Si el saldo no alcanza, Telegram la cancelará.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Reanudar",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió. No se reanudó la suscripción.");return;}perform(new TdApi.EditStarSubscription(id,false),answer,ignored->{schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();
    }
    private void starsSubscriptionReuse(JSONObject params,Answer answer)throws Exception{
        requireAccount();String id=StarsPolicy.subscriptionId(params,"id");
        Dialogs.builder(activity).setTitle("Volver a unirte al canal").setMessage("Telegram reutiliza la suscripción de Stars que ya pagaste para volver a unirte a este canal. No se cobra un importe nuevo ni se reinicia el periodo.").setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Unirme",(d,w)->{if(!currentAccount()||session.selfId!=answer.owner){answer.fail("La cuenta cambió. No se abrió el canal.");return;}perform(new TdApi.ReuseStarSubscription(id),answer,ignored->{session.refreshChats();schedule();answer.ok(true);});}).setOnCancelListener(d->answer.ok(false)).show();
    }
    private void starsOptions(Answer answer){
        requireAccount();
        perform(new TdApi.GetStarPaymentOptions(),answer,value->{
            try{JSONArray options=new JSONArray();if(value.options!=null)for(TdApi.StarPaymentOption option:value.options){if(option!=null)options.put(StarsPolicy.paymentOption(option));}answer.ok(object("options",options,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE));}
            catch(Exception ignored){answer.fail("No se pudieron leer las opciones de recarga de Stars.");}
        });
    }
    private void starsRevenue(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.MessageSender owner=starsOwner(params);
        perform(new TdApi.GetStarRevenueStatistics(owner,false),answer,value->{try{answer.ok(StarsPolicy.revenue(value));}catch(Exception ignored){answer.fail("No se pudieron leer los ingresos de Stars.");}});
    }
    private void starsAdsUrl(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.MessageSender owner=starsOwner(params);
        perform(new TdApi.GetStarAdAccountUrl(owner),answer,value->openLinkOrTelegram(value.url,answer));
    }
    private void starsWithdraw(JSONObject params,Answer answer)throws Exception{
        requireAccount();TdApi.MessageSender owner=starsOwner(params);long amount=StarsPolicy.stars(params,"amount",StarsPolicy.MAX_STARS);
        EditText password=new EditText(activity);password.setSingleLine(true);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setHint("Contraseña de verificación en dos pasos");password.setSaveEnabled(false);password.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO);password.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(256)});
        AlertDialog dialog=Dialogs.builder(activity).setTitle("Retirar Stars a Fragment").setMessage("Vas a retirar "+amount+" Stars de "+(owner instanceof TdApi.MessageSenderChat?"el saldo del canal":"tu saldo de Telegram")+" hacia Fragment. Telegram exige la contraseña de verificación en dos pasos de tu cuenta: se entrega a TDLib y WRGram no la guarda. La conversión y el cobro los hace Fragment, no WRGram.").setView(password).setNegativeButton("Cancelar",(d,w)->{password.setText("");answer.ok(false);}).setPositiveButton("Continuar",null).create();
        dialog.setOnCancelListener(ignored->{password.setText("");answer.ok(false);});
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            String secret=password.getText().toString();password.setText("");
            if(secret.isEmpty()){password.setError("Escribe la contraseña o cancela.");return;}
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            if(!currentAccount()||session.selfId!=answer.owner){dialog.dismiss();answer.fail("La cuenta cambió. No se solicitó la retirada.");return;}
            session.perform(new TdApi.GetStarWithdrawalUrl(owner,amount,secret),value->{dialog.dismiss();openLinkOrTelegram(value.url,answer);},error->{dialog.dismiss();answer.fail(error);});
        }));
        dialog.show();
    }
    private void appearance(JSONObject p)throws Exception{
        SharedPreferences.Editor edit=prefs.edit();
        if(p.has("theme")){String theme=BridgePolicy.text(p,"theme",20);if(!Arrays.asList(Palette.IDS).contains(theme))throw new IllegalArgumentException();edit.putString("theme",theme);}
        if(p.has("font")){int font=p.getInt("font");if(font<12||font>24)throw new IllegalArgumentException();edit.putInt("font",font);}
        if(p.has("fontFamily")){String family=BridgePolicy.text(p,"fontFamily",12);if(!Arrays.asList("system","serif","mono","rounded").contains(family))throw new IllegalArgumentException();edit.putString("fontFamily",family);}
        if(p.has("wallpaper")){String wallpaper=BridgePolicy.text(p,"wallpaper",12);if(!Arrays.asList("none","dots","grid","aurora").contains(wallpaper))throw new IllegalArgumentException();edit.putString("wallpaper",wallpaper);}
        if(p.has("navigation")){String navigation=BridgePolicy.text(p,"navigation",4);if(!navigation.matches("bar|side"))throw new IllegalArgumentException("Navegación no válida.");edit.putString("navigation",navigation);}
        for(String key:new String[]{"compact","typing","enter","auto"})if(p.has(key))edit.putBoolean(key,p.getBoolean(key));
        if(p.has("gestures")){
            Object raw=p.opt("gestures");
            if(raw==null||raw==JSONObject.NULL)edit.remove("gestures");
            else{
                JSONObject gestures=new JSONObject(raw.toString());
                if(gestures.length()>2)throw new IllegalArgumentException();
                java.util.Iterator<String> keys=gestures.keys();
                while(keys.hasNext()){String side=keys.next();if(!side.matches("left|right")||!gestures.optString(side,"").matches("none|reply|copy|forward|select"))throw new IllegalArgumentException();}
                edit.putString("gestures",gestures.toString());
            }
        }
        if(p.has("chatThemes")){
            Object map=p.opt("chatThemes");
            if(map==null||map==JSONObject.NULL)edit.remove("chatThemes");
            else{
                JSONObject chats=new JSONObject(map.toString());
                if(chats.length()>100||chats.toString().length()>8192)throw new IllegalArgumentException();
                java.util.Iterator<String> keys=chats.keys();
                while(keys.hasNext()){
                    String chat=keys.next();String theme=chats.optString(chat,"");
                    if(chat.isEmpty()||chat.length()>24||theme.isEmpty()||theme.length()>64)throw new IllegalArgumentException();
                }
                edit.putString("chatThemes",chats.toString());
            }
        }
        if(p.has("custom")){
            Object custom=p.opt("custom");
            if(custom==null||custom==JSONObject.NULL)edit.remove("customTheme");
            else{String json=custom.toString();if(!Palette.valid(json))throw new IllegalArgumentException();edit.putString("customTheme",json);}
        }
        if(p.has("customThemes")){
            Object list=p.opt("customThemes");
            if(list==null||list==JSONObject.NULL)edit.remove("customThemes");
            else{
                JSONArray themes=new JSONArray(list.toString());
                if(themes.length()>20||themes.toString().length()>32768)throw new IllegalArgumentException();
                for(int i=0;i<themes.length();i++){JSONObject item=themes.optJSONObject(i);if(item==null||!Palette.valid(item.toString()))throw new IllegalArgumentException();}
                edit.putString("customThemes",themes.toString());
            }
        }
        edit.apply();
        if(!prefs.getBoolean("typing",true))session.stopTyping();
        if(p.has("theme")||p.has("custom")||p.has("auto"))activity.applyThemeBars();
    }
    private void systemPalette(JSONObject p,Answer a){
        if(android.os.Build.VERSION.SDK_INT<31){a.fail("El color dinámico del sistema necesita Android 12 o superior.");return;}
        android.content.res.Resources resources=activity.getResources();
        boolean night=(resources.getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;
        a.ok(object("scheme",night?"dark":"light",
            "accent",systemHex(resources.getColor(night?android.R.color.system_accent1_300:android.R.color.system_accent1_600)),
            "canvas",systemHex(resources.getColor(night?android.R.color.system_neutral1_900:android.R.color.system_neutral1_50)),
            "text",systemHex(resources.getColor(night?android.R.color.system_neutral1_50:android.R.color.system_neutral1_900)),
            "outgoing",systemHex(resources.getColor(night?android.R.color.system_accent2_700:android.R.color.system_accent1_100))));
    }
    private static String systemHex(int color){return String.format("#%06X",color&0xFFFFFF);}
    private static TdApi.ChatNotificationSettings copySettings(TdApi.ChatNotificationSettings s){return new TdApi.ChatNotificationSettings(s.useDefaultMuteFor,s.muteFor,s.useDefaultSound,s.soundId,s.useDefaultShowPreview,s.showPreview,s.useDefaultMuteStories,s.muteStories,s.useDefaultStorySound,s.storySoundId,s.useDefaultShowStoryPoster,s.showStoryPoster,s.useDefaultDisablePinnedMessageNotifications,s.disablePinnedMessageNotifications,s.useDefaultDisableMentionNotifications,s.disableMentionNotifications);}
    private void openChat(JSONObject params, Answer answer) {
        requireAccount();
        long id = BridgePolicy.id(params, "id"), messageId = params.optLong("messageId", 0);
        int topicId = params.optInt("topicId", 0);
        searchResults.clear();
        openChatDestination(id,messageId,topicId,answer.owner,chat->answer.ok(true),answer::fail);
    }

    private void openChatDestination(long id,long messageId,int topicId,long owner,Consumer<TdApi.Chat> success,Consumer<String> fail){
        Consumer<TdApi.Chat> open = chat -> {
            if (destroyed||!currentAccount()||owner!=session.selfId) {fail.accept("La cuenta cambió.");return;}
            String unsupported = session.unsupported(chat);
            if (!unsupported.isEmpty()) {fail.accept(unsupported);return;}
            if (topicId>0&&(session.activeChat!=id||session.activeTopic!=topicId)) {
                session.perform(new TdApi.GetForumTopic(id,topicId),topic->{
                    if(destroyed||!currentAccount()||owner!=session.selfId){fail.accept("La cuenta cambió.");return;}
                    if(topic.info==null){fail.accept("Este tema ya no está disponible.");return;}
                    session.open(id);
                    session.openTopic(topic);
                    if(messageId!=0)session.open(id,messageId);
                    success.accept(chat);
                },fail);
            } else {
                if(topicId==0&&messageId!=0&&session.activeChat==id&&session.activeTopic!=0)session.closeTopic();
                if(topicId==0||messageId!=0)session.open(id,messageId);
                success.accept(chat);
            }
        };
        TdApi.Chat chat = session.chat(id);
        if (chat == null) session.loadChat(id, open, fail);
        else open.accept(chat);
    }

    private void searchChats(JSONObject params, Answer answer) {
        requireAccount();
        String query = BridgePolicy.text(params, "query", 80).trim();
        String scope = BridgePolicy.text(params, "scope", 8);
        boolean publicSearch = scope.equals("public");
        if (!publicSearch && !scope.equals("account")) throw new IllegalArgumentException("Búsqueda no válida.");
        if (query.length() < (publicSearch ? 3 : 2)) { answer.ok(new JSONArray()); return; }
        TdApi.Function<TdApi.Chats> lookup;
        if (publicSearch) lookup = new TdApi.SearchPublicChats(query, null);
        else if (session.connected()) lookup = new TdApi.SearchChatsOnServer(query, null, 30);
        else lookup = new TdApi.SearchChats(query, null, 30);
        perform(lookup, answer, result -> {
            JSONArray items = new JSONArray();
            try {
                if (result.chatIds != null) for (long id : result.chatIds) {
                    TdApi.Chat chat = session.chat(id);
                    if (chat != null && session.unsupported(chat).isEmpty()) items.put(dto.chat(chat));
                    if (items.length() == 30) break;
                }
                answer.ok(items);
            } catch (Exception ignored) { answer.fail("No se pudieron preparar las conversaciones."); }
        });
    }

    private static long collectionCursor(JSONObject params) {
        return params.optString("cursor", "").isEmpty() ? 0 : BridgePolicy.id(params, "cursor");
    }

    private static JSONObject collectionPage(JSONArray items, long next) {
        return object("items", items, "next", next == 0 ? "" : Long.toString(next));
    }

    private void savedSources(JSONObject params, Answer answer) {
        requireAccount();
        long after = collectionCursor(params);
        List<TdApi.SavedMessagesTopic> topics = session.savedTopics();
        int start = savedSourceStart(topics, after);
        if (start < 0) { answer.fail("La lista cambió. Vuelve a abrir Mensajes guardados."); return; }
        if (topics.size() - start >= 30 || session.savedTopicsEnd()) { savedSourcesPage(topics, start, answer); return; }
        session.loadSavedTopics(() -> {
            if (!currentAccount() || answer.owner != session.selfId) { answer.fail("La cuenta cambió."); return; }
            List<TdApi.SavedMessagesTopic> updated = session.savedTopics();
            int offset = savedSourceStart(updated, after);
            if (offset < 0) answer.fail("La lista cambió. Vuelve a abrir Mensajes guardados.");
            else savedSourcesPage(updated, offset, answer);
        }, answer::fail);
    }

    private static int savedSourceStart(List<TdApi.SavedMessagesTopic> topics, long after) {
        if (after == 0) return 0;
        for (int i = 0; i < topics.size(); i++) if (topics.get(i).id == after) return i + 1;
        return -1;
    }

    private void savedSourcesPage(List<TdApi.SavedMessagesTopic> topics, int start, Answer answer) {
        JSONArray items = new JSONArray();
        int end = Math.min(start + 30, topics.size());
        for (int i = start; i < end; i++) {
            TdApi.SavedMessagesTopic topic = topics.get(i);
            String title = "Conversación de Telegram";
            if (topic.type instanceof TdApi.SavedMessagesTopicTypeMyNotes) title = "Mis notas";
            else if (topic.type instanceof TdApi.SavedMessagesTopicTypeAuthorHidden) title = "Autor oculto";
            else if (topic.type instanceof TdApi.SavedMessagesTopicTypeSavedFromChat) {
                TdApi.Chat chat = session.chat(((TdApi.SavedMessagesTopicTypeSavedFromChat) topic.type).chatId);
                if (chat != null) title = chat.title;
            }
            items.put(object("id", Long.toString(topic.id), "title", title, "preview", NativeSnapshot.limit(TdSession.text(topic.lastMessage), 180),
                    "date", topic.lastMessage == null ? 0 : topic.lastMessage.date, "pinned", topic.isPinned));
        }
        long next = end > start && (end < topics.size() || !session.savedTopicsEnd()) ? topics.get(end - 1).id : 0;
        answer.ok(collectionPage(items, next));
    }

    private void savedHistory(JSONObject params, Answer answer) {
        requireAccount();
        long id = BridgePolicy.id(params, "id"), cursor = collectionCursor(params);
        if (!session.hasSavedTopic(id) || cursor < 0) { answer.fail("Este origen ya no está disponible."); return; }
        perform(new TdApi.GetSavedMessagesTopicHistory(id, cursor, 0, 31), answer, result -> {
            JSONArray items = new JSONArray();
            long last = 0;
            try {
                if (result.messages != null) for (TdApi.Message message : result.messages) {
                    if (message == null || message.id == cursor) continue;
                    last = message.id;
                    items.put(dto.message(message));
                }
                answer.ok(collectionPage(items, last));
            } catch (Exception ignored) { answer.fail("No se pudieron preparar los mensajes guardados."); }
        });
    }

    private void folderTags(JSONObject p,Answer a){
        requireAccount();
        if(!p.has("enabled")){a.ok(object("enabled",session.folderTagsEnabled()));return;}
        boolean enabled=p.optBoolean("enabled");
        perform(new TdApi.ToggleChatFolderTags(enabled),a,ok->a.ok(object("enabled",enabled)));
    }
    private void folderCount(JSONObject p,Answer a){
        requireAccount();
        perform(new TdApi.GetChatFolder(folderId(p)),a,folder->perform(new TdApi.GetChatFolderChatCount(folder),a,count->a.ok(object("count",count.count))));
    }
    private static TdApi.ReactionType savedTagType(JSONObject p)throws Exception{
        JSONObject tag=p.optJSONObject("tag");
        if(tag==null)throw new IllegalArgumentException("Etiqueta no válida.");
        String kind=BridgePolicy.text(tag,"kind",10);
        if("custom".equals(kind))return new TdApi.ReactionTypeCustomEmoji(BridgePolicy.id(tag,"customEmojiId"));
        return new TdApi.ReactionTypeEmoji(BridgePolicy.text(tag,"emoji",32));
    }
    private void savedTags(JSONObject p,Answer a){
        requireAccount();
        perform(new TdApi.GetSavedMessagesTags(BridgePolicy.id(p,"topic")),a,tags->{
            try{
                JSONArray items=new JSONArray();
                if(tags.tags!=null)for(TdApi.SavedMessagesTag tag:tags.tags){
                    JSONObject item=reactionDto(tag.tag);
                    if(item==null)continue;
                    item.put("label",tag.label==null?"":tag.label).put("count",tag.count);
                    items.put(item);
                }
                a.ok(items);
            }catch(Exception ignored){a.fail("No se pudieron leer las etiquetas de Guardados.");}
        });
    }
    private void savedTagLabel(JSONObject p,Answer a)throws Exception{
        requireAccount();
        perform(new TdApi.SetSavedMessagesTagLabel(savedTagType(p),BridgePolicy.text(p,"label",12)),a,ok->a.ok(true));
    }
    private void savedSearch(JSONObject p,Answer a)throws Exception{
        requireAccount();
        long topic=BridgePolicy.id(p,"topic"),cursor=collectionCursor(p);
        TdApi.ReactionType tag=savedTagType(p);
        perform(new TdApi.SearchSavedMessages(topic,tag,BridgePolicy.text(p,"query",128),cursor,0,31),a,result->{
            try{
                JSONArray items=new JSONArray();
                if(result.messages!=null)for(TdApi.Message message:result.messages){
                    if(message==null||message.id==cursor)continue;
                    items.put(dto.message(message));
                }
                a.ok(collectionPage(items,result.nextFromMessageId));
            }catch(Exception ignored){a.fail("No se pudo buscar en Guardados.");}
        });
    }
    private void savedTopicPin(JSONObject p,Answer a){
        requireAccount();
        long id=BridgePolicy.id(p,"id");
        if(!session.hasSavedTopic(id))throw new IllegalArgumentException("Este origen ya no está disponible.");
        perform(new TdApi.ToggleSavedMessagesTopicIsPinned(id,p.optBoolean("pin")),a,ok->a.ok(true));
    }

    private void gallery(JSONObject params, Answer answer) {
        requireAccount();
        long chatId = BridgePolicy.id(params, "id"), cursor = collectionCursor(params);
        TdApi.Chat chat = session.chat(chatId);
        if (chatId != session.activeChat || chat == null || chat.type instanceof TdApi.ChatTypeSecret || cursor < 0) {
            answer.fail("No se puede abrir la galería de esta conversación."); return;
        }
        String kind = BridgePolicy.text(params, "filter", 16);
        if (!Arrays.asList("photoVideo", "photos", "videos", "documents", "links", "audio", "voice").contains(kind)) {
            answer.fail("El filtro de multimedia no es válido."); return;
        }
        TdApi.SearchMessagesFilter filter = messageFilter(kind);
        long from = params.optLong("from", 0), until = params.optLong("until", 0);
        if ((from != 0 || until != 0) && (from < 0 || until <= from || until - from > 172800 || until > Integer.MAX_VALUE)) {
            answer.fail("La fecha no es válida."); return;
        }
        if (cursor != 0 || until == 0) { galleryPage(chatId, filter, cursor, from, until, answer); return; }
        session.messageByDate(chatId, (int) until - 1, message -> {
            if (!currentAccount() || answer.owner != session.selfId || session.activeChat != chatId) { answer.fail("La conversación cambió."); return; }
            if (message == null || message.date < from) answer.ok(collectionPage(new JSONArray(), 0));
            else galleryPage(chatId, filter, message.id, from, until, answer);
        }, answer::fail);
    }

    private void galleryPage(long chatId, TdApi.SearchMessagesFilter filter, long cursor, long from, long until, Answer answer) {
        TdApi.SearchChatMessages search = new TdApi.SearchChatMessages(chatId, null, "", null, cursor, 0, 30, filter);
        perform(search, answer, result -> {
            if (session.activeChat != chatId) { answer.fail("La conversación cambió."); return; }
            JSONArray items = new JSONArray();
            long next = result.nextFromMessageId;
            try {
                if (result.messages != null) for (TdApi.Message message : result.messages) {
                    if (message == null) continue;
                    if (message.date < from) { next = 0; break; }
                    if ((until == 0 || message.date < until) && message.selfDestructType == null && message.ephemeralContent == null) items.put(dto.message(message));
                }
                answer.ok(collectionPage(items, next == cursor ? 0 : next));
            } catch (Exception ignored) { answer.fail("No se pudo preparar la galería."); }
        });
    }

    private void messageByDate(JSONObject params,Answer answer){
        requireAccount();
        long chatId=BridgePolicy.id(params,"id"),at=params.optLong("at",0);
        TdApi.Chat chat=session.chat(chatId);
        if(chat==null||chatId!=session.activeChat||session.activeTopic!=0||chat.type instanceof TdApi.ChatTypeSecret){
            answer.fail("Este historial no admite saltos por fecha.");return;
        }
        if(at<=0||at>Integer.MAX_VALUE||at>System.currentTimeMillis()/1000){answer.fail("Fecha fuera de rango.");return;}
        session.messageByDate(chatId,(int)at,message->{
            if(answer.owner!=session.selfId||session.activeChat!=chatId||session.activeTopic!=0){answer.fail("La conversación cambió.");return;}
            answer.ok(message==null?null:Long.toString(message.id));
        },answer::fail);
    }
    private void search(JSONObject p,Answer a){
        requireAccount();
        String query=BridgePolicy.text(p,"query",100);
        String filter=p.has("filter")?BridgePolicy.text(p,"filter",16):p.optBoolean("media")?"photoVideo":"";
        if(p.optBoolean("global")){globalSearch(query,p.optString("offset",""),filter,a);return;}
        long chat=session.activeChat;int topic=session.activeTopic;
        int generation=++searchGeneration;
        searchNext=0;
        if(query.trim().isEmpty()&&filter.isEmpty()){try{a.ok(p.optBoolean("page")?new JSONObject().put("messages",new JSONArray()).put("next",false):new JSONArray());}catch(Exception ignored){a.fail("No se pudo preparar la búsqueda.");}return;}
        TdApi.SearchChatMessages search=new TdApi.SearchChatMessages();search.chatId=chat;search.topicId=topic==0?null:new TdApi.MessageTopicForum(topic);search.query=query;search.limit=50;search.filter=messageFilter(filter);
        perform(search,a,result->{if(generation!=searchGeneration||session.activeChat!=chat||session.activeTopic!=topic){a.fail("La búsqueda cambió.");return;}try{searchResults.clear();JSONArray messages=new JSONArray();for(TdApi.Message message:result.messages){searchResults.put(message.id,message);messages.put(dto.message(message));}searchOwner=session.selfId;searchChat=chat;searchQuery=query;searchFilterKey=filter;searchTopic=topic;searchNext=result.nextFromMessageId;if(p.optBoolean("page"))a.ok(new JSONObject().put("messages",messages).put("next",searchNext!=0&&result.messages!=null&&result.messages.length>0));else a.ok(messages);}catch(Exception ignored){a.fail("No se pudieron preparar los resultados.");}});
    }
    private void searchMore(JSONObject p,Answer a){
        requireAccount();
        long chat=session.activeChat;
        if(searchOwner!=session.selfId||searchChat!=chat||session.activeTopic!=searchTopic||searchNext==0||
                !searchQuery.equals(p.optString("query"))||!searchFilterKey.equals(p.optString("filter"))){a.fail("Vuelve a buscar para continuar.");return;}
        int generation=searchGeneration;
        long cursor=searchNext;
        TdApi.SearchChatMessages search=new TdApi.SearchChatMessages();search.chatId=chat;search.topicId=searchTopic==0?null:new TdApi.MessageTopicForum(searchTopic);search.query=searchQuery;search.fromMessageId=cursor;search.limit=50;search.filter=messageFilter(searchFilterKey);
        perform(search,a,result->{if(generation!=searchGeneration||searchNext!=cursor||session.activeChat!=chat||session.activeTopic!=searchTopic||searchOwner!=session.selfId){a.fail("La conversación cambió.");return;}try{JSONArray messages=new JSONArray();for(TdApi.Message message:result.messages){searchResults.put(message.id,message);messages.put(dto.message(message));}searchNext=result.nextFromMessageId==cursor?0:result.nextFromMessageId;a.ok(new JSONObject().put("messages",messages).put("next",searchNext!=0&&result.messages!=null&&result.messages.length>0));}catch(Exception ignored){a.fail("No se pudieron preparar más resultados.");}});
    }
    private void pinned(Answer a){
        requireAccount();
        long chat=session.activeChat;int topic=session.activeTopic;
        if(topic!=0){TdApi.SearchChatMessages search=new TdApi.SearchChatMessages();search.chatId=chat;search.topicId=new TdApi.MessageTopicForum(topic);search.query="";search.limit=1;search.filter=new TdApi.SearchMessagesFilterPinned();session.perform(search,result->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}try{TdApi.Message message=result.messages==null||result.messages.length==0?null:result.messages[0];a.ok(message==null?JSONObject.NULL:dto.message(message));}catch(Exception ignored){a.fail("No se pudo preparar el mensaje fijado.");}},failure->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}a.fail(failure==null?"No se pudo consultar el mensaje fijado.":failure);});return;}
        session.perform(new TdApi.GetChatPinnedMessage(chat),message->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}try{a.ok(message==null||message.id==0?JSONObject.NULL:dto.message(message));}catch(Exception ignored){a.fail("No se pudo preparar el mensaje fijado.");}},failure->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}a.fail(failure==null?"No se pudo consultar el mensaje fijado.":failure);});
    }
    private void pinnedList(Answer a){
        requireAccount();
        long chat=session.activeChat;int topic=session.activeTopic;
        TdApi.SearchChatMessages search=new TdApi.SearchChatMessages();
        search.chatId=chat;search.topicId=topic==0?null:new TdApi.MessageTopicForum(topic);
        search.query="";search.limit=100;search.filter=new TdApi.SearchMessagesFilterPinned();
        session.perform(search,result->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}try{JSONArray messages=new JSONArray();if(result.messages!=null)for(TdApi.Message message:result.messages){session.putMessage(message);messages.put(dto.message(message));}a.ok(messages);}catch(Exception ignored){a.fail("No se pudieron preparar los mensajes fijados.");}},failure->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}a.fail(failure==null?"No se pudieron consultar los mensajes fijados.":failure);});
    }
    private void setDraft(JSONObject p,Answer a)throws Exception{
        requireAccount();
        String text=BridgePolicy.text(p,"text",4096);
        long chat=p.has("chatId")?BridgePolicy.id(p,"chatId"):session.activeChat;
        int topic=p.optInt("topicId",session.activeTopic);
        if(p.has("accountId")&&BridgePolicy.id(p,"accountId")!=session.selfId){a.ok(false);return;}
        TdApi.Chat target=session.chat(chat);
        if(target==null||target.type instanceof TdApi.ChatTypeSecret){a.ok(false);return;}
        TdApi.DraftMessage draft=text.isEmpty()?null:new TdApi.DraftMessage(null,0,new TdApi.DraftMessageContentText(new TdApi.FormattedText(text,textEntities(p,text.length())),null),0,null);
        session.perform(new TdApi.SetChatDraftMessage(chat,topic==0?null:new TdApi.MessageTopicForum(topic),draft),result->a.ok(true),failure->a.fail(failure==null?"No se pudo guardar el borrador en Telegram.":failure));
    }
    private void unpin(long id,Answer a){
        requireAccount();
        long chat=session.activeChat;int topic=session.activeTopic;
        if(topic!=0){TdApi.SearchChatMessages search=new TdApi.SearchChatMessages();search.chatId=chat;search.topicId=new TdApi.MessageTopicForum(topic);search.query="";search.limit=1;search.filter=new TdApi.SearchMessagesFilterPinned();session.perform(search,result->{if(session.activeChat!=chat||session.activeTopic!=topic){a.fail("La conversación cambió.");return;}TdApi.Message current=result.messages==null||result.messages.length==0?null:result.messages[0];if(current==null||current.id!=id){a.fail("Ese mensaje ya no está fijado.");return;}perform(new TdApi.UnpinAllForumTopicMessages(chat,topic),a,value->a.ok(true));},failure->a.fail(failure==null?"No se pudo desfijar el mensaje.":failure));return;}
        perform(new TdApi.UnpinChatMessage(chat,id),a,value->a.ok(true));
    }
    private static final String[] PRIVACY_KEYS={"status","profilePhoto","phone","bio","birthdate","forwards","calls","voiceMessages","invites","findPhone"};
    private static TdApi.UserPrivacySetting privacySetting(String key){
        switch(key){
            case "status":return new TdApi.UserPrivacySettingShowStatus();
            case "profilePhoto":return new TdApi.UserPrivacySettingShowProfilePhoto();
            case "bio":return new TdApi.UserPrivacySettingShowBio();
            case "birthdate":return new TdApi.UserPrivacySettingShowBirthdate();
            case "phone":return new TdApi.UserPrivacySettingShowPhoneNumber();
            case "forwards":return new TdApi.UserPrivacySettingShowLinkInForwardedMessages();
            case "calls":return new TdApi.UserPrivacySettingAllowCalls();
            case "voiceMessages":return new TdApi.UserPrivacySettingAllowPrivateVoiceAndVideoNoteMessages();
            case "invites":return new TdApi.UserPrivacySettingAllowChatInvites();
            case "findPhone":return new TdApi.UserPrivacySettingAllowFindingByPhoneNumber();
            default:throw new IllegalArgumentException("Ajuste de privacidad no válido.");
        }
    }
    private static JSONObject privacyRules(TdApi.UserPrivacySettingRule[] rules)throws Exception{
        boolean everyone=false,nobody=false,contacts=false;JSONArray allow=new JSONArray(),restrict=new JSONArray();
        if(rules!=null)for(TdApi.UserPrivacySettingRule rule:rules){
            if(rule instanceof TdApi.UserPrivacySettingRuleAllowAll)everyone=true;
            else if(rule instanceof TdApi.UserPrivacySettingRuleRestrictAll)nobody=true;
            else if(rule instanceof TdApi.UserPrivacySettingRuleAllowContacts)contacts=true;
            else if(rule instanceof TdApi.UserPrivacySettingRuleAllowUsers)for(long id:((TdApi.UserPrivacySettingRuleAllowUsers)rule).userIds)allow.put(String.valueOf(id));
            else if(rule instanceof TdApi.UserPrivacySettingRuleRestrictUsers)for(long id:((TdApi.UserPrivacySettingRuleRestrictUsers)rule).userIds)restrict.put(String.valueOf(id));
            else return object("value","custom","allowUsers",allow,"restrictUsers",restrict);
        }
        return object("value",everyone?"everyone":nobody?"nobody":contacts?"contacts":"custom","allowUsers",allow,"restrictUsers",restrict);
    }
    private void privacyGet(Answer a){
        requireAccount();
        privacyGet(new JSONArray(),0,a);
    }
    private void privacyGet(JSONArray result,int index,Answer a){
        if(index>=PRIVACY_KEYS.length){a.ok(result);return;}
        String key=PRIVACY_KEYS[index];
        perform(new TdApi.GetUserPrivacySettingRules(privacySetting(key)),a,rules->{
            try{JSONObject item=privacyRules(rules.rules);item.put("key",key);result.put(item);}catch(Exception ignored){}
            privacyGet(result,index+1,a);
        });
    }
    private void privacySet(JSONObject p,Answer a){
        requireAccount();
        String key=BridgePolicy.text(p,"key",20),value=BridgePolicy.text(p,"value",12);
        long[] allow=optionalIds(p,"allowUsers",100),restrict=optionalIds(p,"restrictUsers",100);
        if(allow.length+restrict.length>200)throw new IllegalArgumentException("Máximo 200 excepciones por ajuste.");
        java.util.Set<Long> seen=new java.util.HashSet<>();for(long id:allow)if(!seen.add(id))throw new IllegalArgumentException("Hay usuarios duplicados en las excepciones.");
        for(long id:restrict)if(!seen.add(id))throw new IllegalArgumentException("Un usuario no puede estar permitido y restringido a la vez.");
        java.util.List<TdApi.UserPrivacySettingRule> rules=new java.util.ArrayList<>();
        if(value.equals("everyone")){rules.add(new TdApi.UserPrivacySettingRuleAllowAll());if(restrict.length>0)rules.add(new TdApi.UserPrivacySettingRuleRestrictUsers(restrict));}
        else if(value.equals("contacts")){rules.add(new TdApi.UserPrivacySettingRuleAllowContacts());if(allow.length>0)rules.add(new TdApi.UserPrivacySettingRuleAllowUsers(allow));if(restrict.length>0)rules.add(new TdApi.UserPrivacySettingRuleRestrictUsers(restrict));}
        else if(value.equals("nobody")){rules.add(new TdApi.UserPrivacySettingRuleRestrictAll());if(allow.length>0)rules.add(new TdApi.UserPrivacySettingRuleAllowUsers(allow));}
        else throw new IllegalArgumentException("Valor de privacidad no válido.");
        perform(new TdApi.SetUserPrivacySettingRules(privacySetting(key),new TdApi.UserPrivacySettingRules(rules.toArray(new TdApi.UserPrivacySettingRule[0]))),a,ok->a.ok(true));
    }
    private static long[] optionalIds(JSONObject p,String key,int maximum){JSONArray value=p.optJSONArray(key);return value==null||value.length()==0?new long[0]:BridgePolicy.ids(p,key,maximum);}
    private static JSONArray idList(long[] values){JSONArray array=new JSONArray();if(values!=null)for(long value:values)array.put(String.valueOf(value));return array;}
    private static int folderId(JSONObject p){return Math.toIntExact(BridgePolicy.id(p,"id"));}
    private void foldersList(Answer a){
        requireAccount();
        try{JSONArray result=new JSONArray();for(TdApi.ChatFolderInfo folder:session.folders)result.put(object("id",folder.id,"title",folder.name==null||folder.name.text==null?"":folder.name.text.text,"shareable",folder.isShareable,"hasLinks",folder.hasMyInviteLinks));a.ok(result);}catch(Exception ignored){a.fail("No se pudieron leer las carpetas.");}
    }
    private void foldersGet(JSONObject p,Answer a){
        requireAccount();
        int id=folderId(p);
        perform(new TdApi.GetChatFolder(id),a,folder->{try{a.ok(folderDto(id,folder));}catch(Exception ignored){a.fail("No se pudo leer la carpeta.");}});
    }
    private static JSONObject folderDto(int id,TdApi.ChatFolder folder)throws Exception{
        JSONObject value=object("id",id,"title",folder.name==null||folder.name.text==null?"":folder.name.text.text,"shareable",folder.isShareable,"colorId",folder.colorId,"includeContacts",folder.includeContacts,"includeNonContacts",folder.includeNonContacts,"includeBots",folder.includeBots,"includeGroups",folder.includeGroups,"includeChannels",folder.includeChannels,"excludeMuted",folder.excludeMuted,"excludeRead",folder.excludeRead,"excludeArchived",folder.excludeArchived);
        value.put("included",idList(folder.includedChatIds)).put("excluded",idList(folder.excludedChatIds)).put("pinned",idList(folder.pinnedChatIds));
        return value;
    }
    private void foldersSave(JSONObject p,Answer a){
        requireAccount();
        int id=folderId(p);
        String title=BridgePolicy.text(p,"title",12).trim();
        if(title.isEmpty())throw new IllegalArgumentException("El nombre de la carpeta no puede estar vacío.");
        boolean contacts=p.optBoolean("includeContacts"),nonContacts=p.optBoolean("includeNonContacts"),bots=p.optBoolean("includeBots"),groups=p.optBoolean("includeGroups"),channels=p.optBoolean("includeChannels");
        boolean excludeMuted=p.optBoolean("excludeMuted"),excludeRead=p.optBoolean("excludeRead"),excludeArchived=p.optBoolean("excludeArchived");
        long[] included=optionalIds(p,"included",200);
        long[] excluded=optionalIds(p,"excluded",200);
        long[] pinned=optionalIds(p,"pinned",200);
        Consumer<TdApi.ChatFolder> submit=folder->{
            if(folder.name==null||folder.name.text==null||!title.equals(folder.name.text.text)){
                boolean animateEmoji=folder.name!=null&&folder.name.animateCustomEmoji;
                folder.name=new TdApi.ChatFolderName(new TdApi.FormattedText(title,new TdApi.TextEntity[0]),animateEmoji);
            }
            folder.includedChatIds=included;
            folder.excludedChatIds=excluded;
            folder.pinnedChatIds=pinned;
            folder.excludeMuted=excludeMuted;folder.excludeRead=excludeRead;folder.excludeArchived=excludeArchived;
            folder.includeContacts=contacts;folder.includeNonContacts=nonContacts;folder.includeBots=bots;folder.includeGroups=groups;folder.includeChannels=channels;
            if(id==0)perform(new TdApi.CreateChatFolder(folder),a,info->{try{a.ok(object("id",info.id));}catch(Exception ignored){a.fail("No se pudo crear la carpeta.");}});
            else perform(new TdApi.EditChatFolder(id,folder),a,info->a.ok(true));
        };
        if(id>0)perform(new TdApi.GetChatFolder(id),a,submit);
        else {
            TdApi.ChatFolder folder=new TdApi.ChatFolder();
            folder.colorId=-1;
            folder.pinnedChatIds=new long[0];
            folder.excludedChatIds=new long[0];
            submit.accept(folder);
        }
    }
    private void foldersDelete(JSONObject p,Answer a){
        requireAccount();
        perform(new TdApi.DeleteChatFolder(folderId(p),optionalIds(p,"leave",200)),a,ok->a.ok(true));
    }
    private void foldersLink(JSONObject params,Answer answer){
        requireAccount();
        int id=folderId(params);
        String name=BridgePolicy.text(params,"name",32).trim();
        perform(new TdApi.GetChatsForChatFolderInviteLink(id),answer,chats->
            chooseFolderChats("Chats del enlace","Selecciona los chats que podrán añadirse con el enlace. Telegram puede convertir un grupo básico seleccionado en supergrupo.","Crear enlace",chats.chatIds,answer,selected->
                perform(new TdApi.CreateChatFolderInviteLink(id,name,selected),answer,link->answer.ok(object("link",link.inviteLink,"name",link.name)))));
    }
    private void folderLinks(JSONObject params,Answer answer){
        requireAccount();
        int id=folderId(params);
        perform(new TdApi.GetChatFolderInviteLinks(id),answer,result->{
            JSONArray links=new JSONArray();
            if(result.inviteLinks!=null)for(TdApi.ChatFolderInviteLink link:result.inviteLinks){
                links.put(object("link",link.inviteLink,"name",link.name,"chatIds",idList(link.chatIds)));
            }
            answer.ok(links);
        });
    }
    private void folderLinkChange(JSONObject params,Answer answer,boolean delete){
        requireAccount();
        int id=folderId(params);
        String url=BridgePolicy.text(params,"link",512).trim();
        String name=delete?"":BridgePolicy.text(params,"name",32).trim();
        perform(new TdApi.GetChatFolderInviteLinks(id),answer,result->{
            if(result.inviteLinks!=null)for(TdApi.ChatFolderInviteLink link:result.inviteLinks){
                if(!url.equals(link.inviteLink))continue;
                if(delete)perform(new TdApi.DeleteChatFolderInviteLink(id,url),answer,ok->answer.ok(true));
                else if(params.optBoolean("chooseChats")){
                    perform(new TdApi.GetChatsForChatFolderInviteLink(id),answer,chats->
                        chooseFolderChats("Editar enlace","Selecciona los chats que estarán disponibles en el enlace.",
                            "Guardar enlace",chats.chatIds,link.chatIds,answer,selected->
                                perform(new TdApi.EditChatFolderInviteLink(id,url,name,selected),answer,edited->answer.ok(true))));
                }else perform(new TdApi.EditChatFolderInviteLink(id,url,name,link.chatIds),answer,edited->answer.ok(true));
                return;
            }
            answer.fail("Este enlace ya no pertenece a la carpeta.");
        });
    }
    private void foldersJoin(JSONObject params,Answer answer){
        requireAccount();
        String supplied=BridgePolicy.text(params,"link",512).trim()
            .replaceFirst("(?i)^http://","https://")
            .replaceFirst("(?i)^(?=(t\\.me|telegram\\.me|telegram\\.dog)/)","https://");
        String link=TelegramLinks.normalize(supplied);
        if(link==null||!java.net.URI.create(link).getPath().matches("/addlist/[A-Za-z0-9_-]+/?")){
            throw new IllegalArgumentException("Enlace de carpeta no válido.");
        }
        perform(new TdApi.CheckChatFolderInviteLink(link),answer,info->{
            TdApi.ChatFolderInfo folder=info.chatFolderInfo;
            String title=folder==null||folder.name==null||folder.name.text==null?"Carpeta de Telegram":folder.name.text.text;
            chooseFolderChats(title,"Telegram añadirá la carpeta y te unirá a los chats seleccionados.","Añadir carpeta",info.missingChatIds,answer,selected->
                perform(new TdApi.AddChatFolderByInviteLink(link,selected),answer,ok->answer.ok(true)));
        });
    }
    private void chooseFolderChats(String title,String description,String action,long[] ids,Answer answer,Consumer<long[]> confirm){
        chooseFolderChats(title,description,action,ids,new long[0],answer,confirm);
    }
    private void chooseFolderChats(String title,String description,String action,long[] ids,long[] included,Answer answer,Consumer<long[]> confirm){
        if(ids==null||ids.length==0){answer.fail("Telegram no devolvió chats disponibles para esta operación.");return;}
        String[] names=new String[ids.length];
        boolean[] selected=new boolean[ids.length];
        for(int index=0;index<ids.length;index++){
            long id=ids[index];
            selected[index]=included!=null&&Arrays.stream(included).anyMatch(item->item==id);
            TdApi.Chat chat=session.chat(ids[index]);
            names[index]=chat==null||chat.title==null?"Chat de Telegram "+ids[index]:NativeSnapshot.limit(chat.title,120);
        }
        AlertDialog picker=Dialogs.builder(activity)
            .setTitle(title+"\n"+description)
            .setMultiChoiceItems(names,selected,(dialog,index,checked)->selected[index]=checked)
            .setNegativeButton("Cancelar",(dialog,which)->answer.ok(false))
            .setOnCancelListener(dialog->answer.ok(false))
            .setPositiveButton(action,null).create();
        picker.setOnShowListener(dialog->picker.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            if(!currentAccount()||session.selfId!=answer.owner){picker.dismiss();answer.fail("La cuenta cambió.");return;}
            long[] chosen=new long[ids.length];
            int count=0;
            for(int index=0;index<ids.length;index++)if(selected[index])chosen[count++]=ids[index];
            if(count==0){android.widget.Toast.makeText(activity,"Selecciona al menos un chat.",android.widget.Toast.LENGTH_SHORT).show();return;}
            picker.dismiss();
            confirm.accept(Arrays.copyOf(chosen,count));
        }));
        picker.show();
    }
    private void album(TdApi.Message message,Answer a){
        if(message==null){a.fail("El mensaje ya no está disponible.");return;}
        if(message.mediaAlbumId==0){a.fail("Este mensaje no pertenece a un álbum.");return;}
        long chat=message.chatId,album=message.mediaAlbumId;
        session.perform(new TdApi.GetChatHistory(chat,message.id,-9,10,false),newer->session.perform(new TdApi.GetChatHistory(chat,message.id,0,10,false),older->{try{Map<Long,TdApi.Message> found=new java.util.TreeMap<>();addAlbum(found,newer.messages,album);addAlbum(found,older.messages,album);JSONArray items=new JSONArray();for(TdApi.Message item:found.values())items.put(object("id",String.valueOf(item.id),"text",dto.caption(item)));if(items.length()<2){a.fail("No se encontraron los elementos del álbum.");return;}a.ok(items);}catch(Exception ignored){a.fail("No se pudo consultar el álbum.");}},a::fail),a::fail);
    }
    private static void addAlbum(Map<Long,TdApi.Message> found,TdApi.Message[] messages,long album){if(messages==null)return;for(TdApi.Message item:messages)if(item!=null&&item.mediaAlbumId==album)found.put(item.id,item);}
    private void translate(TdApi.Message message,JSONObject p,Answer a)throws Exception{
        if(message==null){a.fail("El mensaje ya no está disponible.");return;}
        TdApi.Chat chat=session.chat(message.chatId);
        if(chat==null||chat.type instanceof TdApi.ChatTypeSecret||message.selfDestructType!=null||message.ephemeralContent!=null){
            a.fail("La traducción no está disponible para este mensaje.");return;
        }
        String language=BridgePolicy.text(p,"language",12);
        if(!language.matches("[A-Za-z]{2,3}(-[A-Za-z]{2,4})?"))throw new IllegalArgumentException("Idioma no válido.");
        TdApi.FormattedText text=NativeSnapshot.formatted(message.content);
        if(text==null||text.text==null||text.text.isBlank()){a.fail("Este mensaje no tiene texto para traducir.");return;}
        perform(new TdApi.TranslateMessageText(message.chatId,message.id,language,""),a,result->{try{JSONObject value=new JSONObject().put("text",result.text==null?"":result.text);JSONArray entities=NativeSnapshot.entities(result);if(entities.length()>0)value.put("entities",entities);a.ok(value);}catch(Exception ignored){a.fail("No se pudo preparar la traducción.");}});
    }
    private void transcribe(TdApi.Message message,Answer answer){
        TdApi.Chat chat=session.chat(message.chatId);
        if(chat==null||chat.type instanceof TdApi.ChatTypeSecret||message.selfDestructType!=null||message.ephemeralContent!=null
                ||!(message.content instanceof TdApi.MessageVoiceNote||message.content instanceof TdApi.MessageVideoNote)){
            answer.fail("La transcripción no está disponible para este mensaje.");return;
        }
        perform(new TdApi.GetMessageProperties(message.chatId,message.id),answer,properties->{
            if(session.activeChat!=message.chatId){answer.fail("La conversación cambió.");return;}
            if(!properties.canRecognizeSpeech){answer.fail("Telegram no permite transcribir este mensaje con tu cuenta.");return;}
            perform(new TdApi.RecognizeSpeech(message.chatId,message.id),answer,value->answer.ok(true));
        });
    }
    private void openVoiceCall(JSONObject params,Answer answer){
        TdApi.Chat chat=target(params);
        if(chat.id!=session.activeChat||!(chat.type instanceof TdApi.ChatTypePrivate)){
            answer.fail("Abre un chat privado para llamar.");return;
        }
        long userId=((TdApi.ChatTypePrivate)chat.type).userId;
        TdApi.User user=session.user(userId);
        if(userId==session.selfId||user==null||!(user.type instanceof TdApi.UserTypeRegular)){
            answer.fail("Este contacto no admite llamadas.");return;
        }
        TelegramCalls calls=((WrgramApplication)activity.getApplication()).calls();
        if(calls.active()&&calls.peer()!=userId){
            answer.fail("Ya tienes una llamada en curso.");return;
        }
        activity.startActivity(new Intent(activity,CallActivity.class).putExtra(CallActivity.USER,calls.active()?0L:userId));
        answer.ok(true);
    }
    private void downloadsQueue(JSONObject p,Answer a)throws Exception{
        requireAccount();
        TdApi.SearchFileDownloads search=new TdApi.SearchFileDownloads();
        search.query=DownloadsPolicy.query(p);
        search.onlyActive=DownloadsPolicy.onlyActive(p);
        search.onlyCompleted=DownloadsPolicy.onlyCompleted(p);
        search.offset=DownloadsPolicy.offset(p);
        search.limit=DownloadsPolicy.MAX_LIMIT;
        perform(search,a,found->{
            try{a.ok(DownloadsPolicy.queue(found,fileId->{
                TdApi.FileDownload download=null;
                if(found.files!=null)for(TdApi.FileDownload item:found.files)if(item!=null&&item.fileId==fileId){download=item;break;}
                return download!=null&&download.message!=null&&session.chat(download.message.chatId)!=null?session.chat(download.message.chatId).title:null;
            },fileId->session.cachedFile(fileId)));}
            catch(Exception ignored){a.fail("No se pudo preparar la cola de descargas.");}
        });
    }
    private void downloadsItem(JSONObject p,Answer a)throws Exception{
        int fileId=(int)BridgePolicy.id(p,"fileId");
        boolean paused=p.getBoolean("value");
        perform(new TdApi.ToggleDownloadIsPaused(fileId,paused),a,value->a.ok(true));
    }
    private void downloadsItemAdd(JSONObject p,Answer a)throws Exception{
        int fileId=(int)BridgePolicy.id(p,"fileId");
        long chatId=BridgePolicy.id(p,"chatId"),messageId=BridgePolicy.id(p,"messageId");
        if(chatId==0||messageId==0){a.fail("No se pudo volver a poner el archivo en cola.");return;}
        perform(new TdApi.AddFileToDownloads(fileId,chatId,messageId,0),a,value->a.ok(true));
    }
    private String downloadRules(){return prefs.getString("downloads.rules."+session.selfId,"");}
    private void downloadsRuleSet(JSONObject p,Answer a)throws Exception{
        requireAccount();
        String network=DownloadsPolicy.network(p),level=DownloadsPolicy.level(p);
        perform(new TdApi.GetAutoDownloadSettingsPresets(),a,presets->{
            TdApi.AutoDownloadSettings value;
            try{value=DownloadsPolicy.settings(p,presets);}catch(Exception invalid){a.fail("No se pudo preparar la regla de descarga.");return;}
            perform(new TdApi.SetAutoDownloadSettings(value,DownloadsPolicy.networkType(network)),a,ok->{
                StringBuilder raw=new StringBuilder(downloadRules());
                DownloadsPolicy.rememberRule(raw,network,level);
                prefs.edit().putString("downloads.rules."+session.selfId,raw.toString()).apply();
                a.ok(object("networks",DownloadsPolicy.storedRules(raw.toString())));
            });
        });
    }
    private JSONObject quickMessages(int shortcutId)throws Exception{
        JSONArray texts=new JSONArray();
        TdApi.QuickReplyMessage[] items=session.quickReplyMessages(shortcutId);
        if(items!=null)for(TdApi.QuickReplyMessage item:items){
            TdApi.FormattedText text=item.content instanceof TdApi.MessageText?((TdApi.MessageText)item.content).text:null;
            texts.put(object("id",String.valueOf(item.id),"text",text==null?"Contenido no textual":text.text,"editable",editableQuickText(item)));
        }
        return new JSONObject().put("messages",texts);
    }
    private void businessQuickAdd(JSONObject p,Answer a)throws Exception{
        requireAccount();
        String name=BusinessPolicy.name(p,"name");
        String text=BridgePolicy.text(p,"text",BusinessPolicy.MAX_TEXT);
        if(text.isBlank()){a.fail("La respuesta rápida necesita un texto.");return;}
        perform(new TdApi.AddQuickReplyShortcutMessage(name,0,new TdApi.InputMessageText(new TdApi.FormattedText(text,new TdApi.TextEntity[0]),null,false)),a,value->a.ok(true));
    }
    private static boolean editableQuickText(TdApi.QuickReplyMessage item){
        if(!item.canBeEdited||!(item.content instanceof TdApi.MessageText))return false;
        TdApi.MessageText text=(TdApi.MessageText)item.content;
        return text.linkPreview==null&&(text.text.entities==null||text.text.entities.length==0);
    }
    private void businessQuickEdit(JSONObject params,Answer answer){
        requireAccount();
        int shortcutId=(int)BridgePolicy.id(params,"id");
        long messageId=BridgePolicy.id(params,"messageId");
        String text=BridgePolicy.text(params,"text",BusinessPolicy.MAX_TEXT);
        TdApi.QuickReplyMessage[] messages=session.quickReplyMessages(shortcutId);
        if(text.isBlank()||messages==null){answer.fail("Actualiza la respuesta rápida y escribe un mensaje.");return;}
        for(TdApi.QuickReplyMessage message:messages){
            if(message.id!=messageId||!editableQuickText(message))continue;
            TdApi.InputMessageText content=new TdApi.InputMessageText(new TdApi.FormattedText(text,new TdApi.TextEntity[0]),null,false);
            perform(new TdApi.EditQuickReplyMessage(shortcutId,messageId,content),answer,ok->answer.ok(true));
            return;
        }
        answer.fail("Este mensaje de la respuesta rápida no se puede editar aquí.");
    }
    private void businessLinksDto(Answer a,TdApi.BusinessChatLinks links)throws Exception{
        JSONArray items=new JSONArray();
        if(links.links!=null)for(TdApi.BusinessChatLink link:links.links)items.put(linkDto(link));
        a.ok(new JSONObject().put("links",items));
    }
    private JSONObject linkDto(TdApi.BusinessChatLink link)throws Exception{
        return new JSONObject().put("link",link.link==null?"":link.link).put("title",NativeSnapshot.limit(link.title==null?"":link.title,BusinessPolicy.MAX_TITLE)).put("text",NativeSnapshot.limit(link.text==null||link.text.text==null?"":link.text.text,BusinessPolicy.MAX_TEXT)).put("views",link.viewCount);
    }
    private void businessLinkSave(JSONObject p,Answer a)throws Exception{
        requireAccount();
        String link=BridgePolicy.text(p,"link",256);
        TdApi.InputBusinessChatLink info=new TdApi.InputBusinessChatLink(new TdApi.FormattedText(BridgePolicy.text(p,"text",BusinessPolicy.MAX_TEXT),new TdApi.TextEntity[0]),NativeSnapshot.limit(BridgePolicy.text(p,"title",BusinessPolicy.MAX_TITLE),BusinessPolicy.MAX_TITLE));
        if(link.isEmpty())perform(new TdApi.CreateBusinessChatLink(info),a,value->{try{a.ok(linkDto(value));}catch(Exception ignored){a.fail("No se pudo guardar el enlace.");}});
        else perform(new TdApi.EditBusinessChatLink(link,info),a,value->{try{a.ok(linkDto(value));}catch(Exception ignored){a.fail("No se pudo guardar el enlace.");}});
    }
    private static JSONObject recipientsDto(TdApi.BusinessRecipients recipients)throws Exception{
        if(recipients==null)return new JSONObject();
        return new JSONObject().put("existing",recipients.selectExistingChats).put("newChats",recipients.selectNewChats).put("contacts",recipients.selectContacts).put("nonContacts",recipients.selectNonContacts);
    }
    private void businessBotDto(Answer a,TdApi.BusinessConnectedBotInfo info)throws Exception{
        requireAccount();
        if(info==null){perform(new TdApi.GetBusinessConnectedBot(),a,value->{try{businessBotDto(a,value);}catch(Exception ignored){a.fail("No se pudo cargar el bot de negocios.");}});return;}
        TdApi.BusinessConnectedBot bot=info.bot;
        JSONObject value=bot==null?new JSONObject().put("configured",false):new JSONObject().put("configured",true).put("botUserId",String.valueOf(bot.botUserId));
        if(bot!=null){
            TdApi.User botUser=session.user(bot.botUserId);
            if(botUser!=null)value.put("name",NativeSnapshot.limit(botUser.firstName+(botUser.lastName==null||botUser.lastName.isEmpty()?"":" "+botUser.lastName),96));
            TdApi.BusinessRecipients recipients=bot.recipients;
            value.put("recipients",recipientsDto(recipients));
            TdApi.BusinessBotRights r=bot.rights;
            JSONObject rights=new JSONObject();
            if(r!=null)for(String key:BusinessPolicy.rightKeys()){
                boolean granted=switch(key){case "canReply"->r.canReply;case "canReadMessages"->r.canReadMessages;case "canDeleteSentMessages"->r.canDeleteSentMessages;case "canDeleteAllMessages"->r.canDeleteAllMessages;case "canEditName"->r.canEditName;case "canEditBio"->r.canEditBio;case "canEditProfilePhoto"->r.canEditProfilePhoto;case "canEditUsername"->r.canEditUsername;case "canViewGiftsAndStars"->r.canViewGiftsAndStars;case "canSellGifts"->r.canSellGifts;case "canChangeGiftSettings"->r.canChangeGiftSettings;case "canTransferAndUpgradeGifts"->r.canTransferAndUpgradeGifts;case "canTransferStars"->r.canTransferStars;default->r.canManageStories;};
                rights.put(key,granted);
            }
            value.put("rights",rights);
        }
        value.put("connectionDate",info.connectionDate).put("deviceModel",info.deviceModel==null?"":info.deviceModel).put("location",info.location==null?"":info.location);
        a.ok(value);
    }
    private void globalSearch(String query,String offset,String filter,Answer answer){
        if(filter.equals("mentions"))throw new IllegalArgumentException("El filtro de menciones solo está disponible dentro de un chat.");
        if(query.trim().isEmpty()&&filter.isEmpty()){try{answer.ok(new JSONObject().put("messages",new JSONArray()).put("nextOffset","").put("total",0));}catch(Exception ignored){answer.fail("No se pudo preparar la búsqueda.");}return;}
        TdApi.SearchMessages search=new TdApi.SearchMessages();search.chatList=null;search.query=query;search.offset=offset==null?"":offset;search.limit=50;search.filter=messageFilter(filter);
        long owner=session.selfId;
        session.perform(search,result->{
            if(!currentAccount()||session.selfId!=owner){answer.fail("La cuenta cambió.");return;}
            java.util.List<TdApi.Message> messages=result.messages==null?new ArrayList<>():new ArrayList<>(java.util.Arrays.asList(result.messages));
            java.util.List<Long> missing=new ArrayList<>();
            for(TdApi.Message message:messages)if(session.chat(message.chatId)==null&&!missing.contains(message.chatId)&&missing.size()<20)missing.add(message.chatId);
            loadSearchChats(missing,0,()->{
                if(!currentAccount()||session.selfId!=owner){answer.fail("La cuenta cambió.");return;}
                try{JSONArray items=new JSONArray();for(TdApi.Message message:messages)items.put(dto.searchMessage(message));answer.ok(new JSONObject().put("messages",items).put("nextOffset",result.nextOffset==null?"":result.nextOffset).put("total",result.totalCount));}catch(Exception ignored){answer.fail("No se pudieron preparar los resultados.");}
            });
        },answer::fail);
    }
    private void loadSearchChats(java.util.List<Long> ids,int index,Runnable done){if(index>=ids.size()){done.run();return;}session.loadChat(ids.get(index),chat->loadSearchChats(ids,index+1,done),failure->loadSearchChats(ids,index+1,done));}
    private void feedChannels(Answer answer){
        requireAccount();
        java.util.List<TdApi.Chat> channels=new ArrayList<>();
        for(TdApi.Chat chat:session.chatList("")){
            if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)continue;
            channels.add(chat);
            if(channels.size()>=25)break;
        }
        if(channels.isEmpty()){answer.ok(new JSONArray());return;}
        feedChannelStep(channels,0,new ArrayList<>(),session.selfId,answer);
    }
    private void feedChannelStep(java.util.List<TdApi.Chat> channels,int index,java.util.List<TdApi.Message> merged,long owner,Answer answer){
        if(!currentAccount()||session.selfId!=owner){answer.fail("La cuenta cambió.");return;}
        if(index>=channels.size()){
            merged.sort((a,b)->Long.compare(b.date,a.date));
            if(merged.size()>80)merged.subList(80,merged.size()).clear();
            try{
                JSONArray rows=new JSONArray();
                for(TdApi.Message message:merged){
                    TdApi.Chat chat=session.chat(message.chatId);
                    if(chat==null)continue;
                    rows.put(object("chatId",Long.toString(message.chatId),"messageId",Long.toString(message.id),"title",chat.title,
                            "text",NativeSnapshot.limit(TdSession.text(message),300),"date",message.date));
                }
                answer.ok(rows);
            }catch(Exception ignored){answer.fail("No se pudo preparar el feed.");}
            return;
        }
        TdApi.SearchChatMessages search=new TdApi.SearchChatMessages(channels.get(index).id,null,"",null,0,0,3,new TdApi.SearchMessagesFilterEmpty());
        session.perform(search,result->{
            if(result.messages!=null)for(TdApi.Message message:result.messages)if(message!=null)merged.add(message);
            feedChannelStep(channels,index+1,merged,owner,answer);
        },failure->feedChannelStep(channels,index+1,merged,owner,answer));
    }
    private void searchFilters(JSONObject params,Answer answer,boolean save,boolean delete)throws Exception{
        requireAccount();
        SharedPreferences store=activity.getSharedPreferences("search_filters",0);
        String key=session.slot+"."+session.selfId;
        JSONArray list;
        try{list=new JSONArray(store.getString(key,"[]"));}
        catch(org.json.JSONException ignored){list=new JSONArray();}
        if(delete){
            String id=BridgePolicy.text(params,"id",24);
            JSONArray remaining=new JSONArray();
            for(int i=0;i<list.length();i++){
                JSONObject item=list.optJSONObject(i);
                if(item==null||!id.equals(item.optString("id")))remaining.put(item);
            }
            list=remaining;
        }else if(save){
            if(list.length()>=20)throw new IllegalArgumentException("Puedes guardar hasta 20 filtros de búsqueda.");
            String name=BridgePolicy.text(params,"name",32).trim();
            if(name.isEmpty())throw new IllegalArgumentException("Escribe un nombre para el filtro.");
            String query=BridgePolicy.text(params,"query",100).trim();
            String filter=BridgePolicy.text(params,"filter",16);
            messageFilter(filter);
            String mode=BridgePolicy.text(params,"mode",8);
            if(!mode.equals("chat")&&!mode.equals("global"))throw new IllegalArgumentException("El modo del filtro no es válido.");
            if(query.length()<2&&filter.isEmpty())throw new IllegalArgumentException("La búsqueda necesita texto o un filtro.");
            String chatId=params.optString("chatId","");
            if(!chatId.isEmpty())chatId=Long.toString(BridgePolicy.id(params,"chatId"));
            int max=0;
            for(int i=0;i<list.length();i++){
                JSONObject item=list.optJSONObject(i);
                String id=item==null?"":item.optString("id");
                if(id.matches("f[0-9]{1,6}"))max=Math.max(max,Integer.parseInt(id.substring(1)));
            }
            JSONObject item=object("id","f"+(max+1),"name",name,"query",query,"filter",filter,"mode",mode);
            if(!chatId.isEmpty())item.put("chatId",chatId);
            list.put(item);
        }
        store.edit().putString(key,list.toString()).apply();
        answer.ok(list);
    }
    private void checklistSend(JSONObject p,Answer a){
        requireAccount();
        TdApi.InputMessageChecklist content=new TdApi.InputMessageChecklist();
        content.checklist=ChecklistPolicy.input(p,1);
        session.sendContent(content,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),a::ok);
    }
    private void checklistAdd(JSONObject p,Answer a){
        requireAccount();
        TdApi.Message message=message(p);
        TdApi.Checklist list=checklistOf(message);
        int max=0;if(list.tasks!=null)for(TdApi.ChecklistTask task:list.tasks)max=Math.max(max,task.id);
        TdApi.InputChecklistTask[] added=ChecklistPolicy.tasks(p.optJSONArray("tasks"),max+1);
        perform(new TdApi.AddChecklistTasks(message.chatId,message.id,added),a,value->a.ok(true));
    }
    private void checklistEdit(JSONObject p,Answer a){
        requireAccount();
        TdApi.Message message=message(p);
        TdApi.Checklist list=checklistOf(message);
        int max=0;if(list.tasks!=null)for(TdApi.ChecklistTask task:list.tasks)max=Math.max(max,task.id);
        TdApi.InputChecklist input=ChecklistPolicy.input(p,max+1);
        perform(new TdApi.EditMessageChecklist(message.chatId,message.id,null,input),a,value->a.ok(true));
    }
    private void checklistToggle(JSONObject p,Answer a){
        requireAccount();
        TdApi.Message message=message(p);
        checklistOf(message);
        int[] done=ChecklistPolicy.taskIds(p,"done"),notDone=ChecklistPolicy.taskIds(p,"notDone");
        if(done.length==0&&notDone.length==0){a.ok(true);return;}
        perform(new TdApi.MarkChecklistTasksAsDone(message.chatId,message.id,done,notDone),a,value->a.ok(true));
    }
    private static TdApi.Checklist checklistOf(TdApi.Message message){
        if(!(message.content instanceof TdApi.MessageChecklist)||((TdApi.MessageChecklist)message.content).list==null)throw new IllegalArgumentException("Este mensaje ya no es una lista de tareas.");
        return ((TdApi.MessageChecklist)message.content).list;
    }
    private void properties(TdApi.Message message,Answer a){
        perform(new TdApi.GetMessageProperties(message.chatId,message.id),a,props->{
            JSONObject result=object("reply",props.canBeReplied,"copy",props.canBeCopied&&message.content instanceof TdApi.MessageText&&message.selfDestructType==null&&message.ephemeralContent==null,"copyContent",props.canBeCopied,"edit",props.canBeEdited&&message.content instanceof TdApi.MessageText,"editChecklist",props.canBeEdited&&message.content instanceof TdApi.MessageChecklist,"deleteSelf",props.canBeDeletedOnlyForSelf||props.canBeDeletedForAllUsers,"deleteAll",props.canBeDeletedForAllUsers,"forward",props.canBeForwarded,"pin",props.canBePinned,"editCaption",props.canBeEdited&&hasCaption(message),"caption",dto.caption(message),"canBePaid",props.canBePaid,"transcribe",props.canRecognizeSpeech&&(message.content instanceof TdApi.MessageVoiceNote||message.content instanceof TdApi.MessageVideoNote));
            TdApi.GetMessageAvailableReactions reactions=new TdApi.GetMessageAvailableReactions();reactions.chatId=message.chatId;reactions.messageId=message.id;reactions.rowSize=8;
            session.perform(reactions,value->{try{result.put("reactions",emojis(value));result.put("paid",hasPaidReaction(value));result.put("allowCustom",value.allowCustomEmoji);a.ok(result);}catch(Exception ignored){a.fail("No se pudieron preparar las reacciones.");}},failure->{try{result.put("reactions",new JSONArray());a.ok(result);}catch(Exception ignored){a.fail("No se pudo preparar el menú.");}});
        });
    }
    private static boolean hasPaidReaction(TdApi.AvailableReactions available){for(TdApi.AvailableReaction[] group:new TdApi.AvailableReaction[][]{available.topReactions,available.recentReactions,available.popularReactions})if(group!=null)for(TdApi.AvailableReaction reaction:group)if(reaction.type instanceof TdApi.ReactionTypePaid)return true;return false;}
    private JSONArray emojis(TdApi.AvailableReactions available){JSONArray result=new JSONArray();Set<String> seen=new HashSet<>();for(TdApi.AvailableReaction[] group:new TdApi.AvailableReaction[][]{available.topReactions,available.recentReactions,available.popularReactions})if(group!=null)for(TdApi.AvailableReaction reaction:group)if(!reaction.needsPremium&&reaction.type instanceof TdApi.ReactionTypeEmoji){String emoji=((TdApi.ReactionTypeEmoji)reaction.type).emoji;if(seen.add(emoji)&&result.length()<16)result.put(emoji);}return result;}
    private void react(JSONObject p,Answer a){TdApi.Message message=message(p);String emoji=BridgePolicy.text(p,"emoji",32).trim();if(emoji.isEmpty())throw new IllegalArgumentException("Elige un emoji para reaccionar.");TdApi.ReactionTypeEmoji reaction=new TdApi.ReactionTypeEmoji(emoji);if(p.optBoolean("remove"))perform(new TdApi.RemoveMessageReaction(message.chatId,message.id,reaction),a,value->a.ok(true));else perform(new TdApi.AddMessageReaction(message.chatId,message.id,reaction,false,true),a,value->a.ok(true));}
    private void reactPaid(JSONObject p,Answer a)throws Exception{TdApi.Message message=message(p);long count=BridgePolicy.id(p,"count");long ownerId=session.selfId;if(count<1||count>100000)throw new IllegalArgumentException("Cantidad de Stars no válida.");perform(new TdApi.GetOption("paid_reaction_star_count_max"),a,option->{long max=option instanceof TdApi.OptionValueInteger?((TdApi.OptionValueInteger)option).value:100;if(count>max){a.fail("Telegram permite hasta "+max+" Stars por reacción.");return;}Dialogs.builder(activity).setTitle("Reacción de pago").setMessage("Se usarán "+count+" Stars de tu saldo de Telegram para reaccionar a este mensaje. El cargo lo procesa Telegram y no se puede deshacer.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Enviar "+count+" ⭐",(d,w)->{
            if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se gastaron Stars.");return;}
            perform(new TdApi.AddPendingPaidMessageReaction(message.chatId,message.id,count,null),a,ok->perform(new TdApi.CommitPendingPaidMessageReactions(message.chatId,message.id),a,ignored->{schedule();a.ok(true);}));
        }).setOnCancelListener(ignored->a.ok(false)).show();});}
    private void reactCustom(JSONObject p,Answer a)throws Exception{TdApi.Message message=message(p);long custom=BridgePolicy.id(p,"emoji");if(custom<=0)throw new IllegalArgumentException("Emoji personalizado no válido.");perform(new TdApi.GetUser(session.selfId),a,user->{if(!user.isPremium){a.fail("Necesitas Telegram Premium para reaccionar con emojis personalizados.");return;}TdApi.ReactionTypeCustomEmoji reaction=new TdApi.ReactionTypeCustomEmoji(custom);if(p.optBoolean("remove"))perform(new TdApi.RemoveMessageReaction(message.chatId,message.id,reaction),a,value->a.ok(true));else perform(new TdApi.AddMessageReaction(message.chatId,message.id,reaction,false,true),a,value->a.ok(true));});}
    private void customEmoji(JSONObject p,Answer a)throws Exception{long id=BridgePolicy.id(p,"id");if(id<=0)throw new IllegalArgumentException("Emoji personalizado no válido.");perform(new TdApi.GetCustomEmojiStickers(new long[]{id}),a,sticks->{try{if(sticks.stickers==null||sticks.stickers.length==0){a.fail("Ese emoji personalizado no está disponible.");return;}JSONObject media=dto.sticker(sticks.stickers[0]);if(media==null){a.fail("No se pudo cargar el emoji personalizado.");return;}a.ok(object("id",String.valueOf(id),"media",media,"emoji",sticks.stickers[0].emoji));}catch(Exception ignored){a.fail("No se pudo cargar el emoji personalizado.");}});}
    private void customEmojiSearch(JSONObject p,Answer a)throws Exception{String query=BridgePolicy.text(p,"query",64).trim();perform(new TdApi.SearchStickers(new TdApi.StickerTypeCustomEmoji(),"",query,new String[0],0,48),a,sticks->{try{JSONArray result=new JSONArray();if(sticks.stickers!=null)for(TdApi.Sticker sticker:sticks.stickers){long id=customEmojiId(sticker);if(id<=0)continue;JSONObject item=object("id",Long.toString(id),"emoji",sticker.emoji==null?"":sticker.emoji);JSONObject media=dto.sticker(sticker);if(media!=null)item.put("media",media);result.put(item);}a.ok(result);}catch(Exception ignored){a.fail("No se pudieron cargar emojis personalizados.");}});}
    private void premiumState(Answer a){requireAccount();perform(new TdApi.GetUser(session.selfId),a,user->{JSONObject result=object("premium",user.isPremium,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE,"state","","paymentOptions",new JSONArray());session.perform(new TdApi.GetPremiumState(),state->{try{result.put("state",state.state==null||state.state.text==null?"":NativeSnapshot.limit(state.state.text,600));JSONArray plans=new JSONArray();if(state.paymentOptions!=null)for(TdApi.PremiumStatePaymentOption option:state.paymentOptions){if(option!=null)plans.put(StarsPolicy.premiumPaymentOption(option));}result.put("paymentOptions",plans);a.ok(result);}catch(Exception ignored){a.fail("No se pudo leer el estado Premium.");}},failure->{try{a.ok(result);}catch(Exception ignored){a.fail("No se pudo leer el estado Premium.");}});});}
    private void premiumFeatures(Answer a){requireAccount();perform(new TdApi.GetPremiumFeatures(new TdApi.PremiumSourceSettings()),a,value->{try{a.ok(StarsPolicy.features(value));}catch(Exception ignored){a.fail("No se pudieron leer las ventajas de Premium.");}});}
    private void premiumLimit(JSONObject p,Answer a)throws Exception{requireAccount();TdApi.PremiumLimitType type=StarsPolicy.limitType(BridgePolicy.text(p,"key",64));perform(new TdApi.GetPremiumLimit(type),a,value->{try{a.ok(StarsPolicy.limit(value));}catch(Exception ignored){a.fail("No se pudo leer el límite de Premium.");}});}
    private void premiumStickers(Answer a){requireAccount();perform(new TdApi.GetPremiumStickers(24),a,value->{try{JSONArray items=new JSONArray();if(value.stickers!=null)for(TdApi.Sticker sticker:value.stickers){if(sticker==null)continue;JSONObject media=dto.sticker(sticker);if(media!=null)items.put(media);}a.ok(object("stickers",items));}catch(Exception ignored){a.fail("No se pudieron cargar los stickers de Premium.");}});}
    private void premiumGiftOptions(Answer a){requireAccount();perform(new TdApi.GetPremiumGiftPaymentOptions(),a,value->{try{JSONArray items=new JSONArray();if(value.options!=null)for(TdApi.PremiumGiftPaymentOption option:value.options){if(option!=null)items.put(StarsPolicy.premiumGiftOption(option));}a.ok(object("options",items,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE));}catch(Exception ignored){a.fail("No se pudieron leer las opciones de regalo de Premium.");}});}
    private void premiumGiftCheck(JSONObject p,Answer a)throws Exception{requireAccount();String code=StarsPolicy.giftCode(BridgePolicy.text(p,"code",2048));perform(new TdApi.CheckPremiumGiftCode(code),a,value->{
        if(value.creatorId instanceof TdApi.MessageSenderUser){session.perform(new TdApi.GetUser(((TdApi.MessageSenderUser)value.creatorId).userId),user->answerGiftCode(value,(user.firstName+" "+user.lastName).trim(),a),error->answerGiftCode(value,"",a));return;}
        answerGiftCode(value,value.creatorId instanceof TdApi.MessageSenderChat?session.senderName(value.creatorId):"Telegram",a);
    });}
    private void answerGiftCode(TdApi.PremiumGiftCodeInfo value,String creator,Answer a){try{a.ok(StarsPolicy.giftCodeInfo(value,creator));}catch(Exception ignored){a.fail("No se pudo comprobar el código de regalo.");}}
    private void premiumGiftApply(JSONObject p,Answer a)throws Exception{requireAccount();String code=StarsPolicy.giftCode(BridgePolicy.text(p,"code",2048));
        Dialogs.builder(activity).setTitle("Canjear código de Premium").setMessage("Se activará Telegram Premium en esta cuenta con el código indicado. Es de un solo uso: al confirmarlo queda vinculado a tu cuenta y ya no podrás cedérselo a otra persona.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Canjear",(d,w)->{if(!currentAccount()||session.selfId!=a.owner){a.fail("La cuenta cambió. No se canjeó el código.");return;}perform(new TdApi.ApplyPremiumGiftCode(code),a,ignored->{schedule();a.ok(true);});}).setOnCancelListener(d->a.ok(false)).show();}
    private TdApi.Chat boostChat(JSONObject p)throws Exception{
        TdApi.Chat chat=target(p);
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Los impulsos solo existen en supergrupos y canales.");
        return chat;
    }
    private void chatBoostStatus(JSONObject p,Answer a)throws Exception{TdApi.Chat chat=boostChat(p);perform(new TdApi.GetChatBoostStatus(chat.id),a,value->{try{a.ok(BoostsPolicy.status(value,(int)(System.currentTimeMillis()/1000)));}catch(Exception ignored){a.fail("No se pudo leer el estado de impulsos del chat.");}});}
    private void chatBoostSlots(Answer a){requireAccount();perform(new TdApi.GetAvailableChatBoostSlots(),a,value->{try{a.ok(BoostsPolicy.slots(value,(int)(System.currentTimeMillis()/1000)));}catch(Exception ignored){a.fail("No se pudieron leer tus espacios de impulso.");}});}
    private void chatBoostFeatures(JSONObject p,Answer a)throws Exception{requireAccount();boolean channel=BoostsPolicy.channel(p);perform(new TdApi.GetChatBoostFeatures(channel),a,value->{try{a.ok(BoostsPolicy.features(value));}catch(Exception ignored){a.fail("No se pudieron leer las ventajas por nivel de impulso.");}});}
    private void chatBoostLevel(JSONObject p,Answer a)throws Exception{requireAccount();boolean channel=BoostsPolicy.channel(p);int level=BoostsPolicy.level(p,"level");perform(new TdApi.GetChatBoostLevelFeatures(channel,level),a,value->{try{a.ok(BoostsPolicy.levelFeatures(value));}catch(Exception ignored){a.fail("No se pudieron leer las ventajas de ese nivel.");}});}
    private void chatBoostLink(JSONObject p,Answer a)throws Exception{TdApi.Chat chat=boostChat(p);perform(new TdApi.GetChatBoostLink(chat.id),a,value->{try{a.ok(BoostsPolicy.link(value));}catch(Exception ignored){a.fail("No se pudo generar el enlace de impulso del chat.");}});}
    private void chatBoostApply(JSONObject p,Answer a)throws Exception{
        TdApi.Chat chat=boostChat(p);int[] slots=BoostsPolicy.slotIds(p,"slots");
        String title=NativeSnapshot.limit(chat.title==null?"":chat.title,120);
        Dialogs.builder(activity).setTitle("Impulsar este chat").setMessage("Se usarán "+slots.length+(slots.length==1?" espacio de impulso":" espacios de impulso")+" de tu Telegram Premium en "+(title.isEmpty()?"este chat":"«"+title+"»")+". Telegram mantiene el impulso durante un mes y no podrás retirarlo antes de que expire; después podrás volver a usarlo en otro chat.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Impulsar",(d,w)->{if(!currentAccount()||session.selfId!=a.owner){a.fail("La cuenta cambió. No se aplicó ningún impulso.");return;}perform(new TdApi.BoostChat(chat.id,slots),a,value->{try{a.ok(BoostsPolicy.slots(value,(int)(System.currentTimeMillis()/1000)));}catch(Exception ignored){a.fail("Telegram no confirmó los espacios de impulso.");}});}).setOnCancelListener(d->a.ok(false)).show();
    }
    private TdApi.Chat giftChat(JSONObject p,String key)throws Exception{
        requireAccount();TdApi.Chat chat=session.chat(BridgePolicy.id(p,key));
        if(chat==null)throw new IllegalArgumentException("Desconocido");
        return chat;
    }
    private TdApi.MessageSender giftOwner(JSONObject p)throws Exception{
        if(!p.has("id"))return new TdApi.MessageSenderUser(session.selfId);
        TdApi.Chat chat=giftChat(p,"id");
        if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException("Solo tu cuenta y tus canales guardan regalos.");
        return new TdApi.MessageSenderChat(chat.id);
    }
    private TdApi.MessageSender giftRecipient(JSONObject p,String key)throws Exception{
        TdApi.Chat chat=giftChat(p,key);
        if(chat.type instanceof TdApi.ChatTypePrivate)return new TdApi.MessageSenderUser(chat.id);
        if(chat.type instanceof TdApi.ChatTypeSupergroup&&((TdApi.ChatTypeSupergroup)chat.type).isChannel)return new TdApi.MessageSenderChat(chat.id);
        throw new IllegalArgumentException("Los regalos se envían a una persona o a un canal.");
    }
    private JSONObject giftSticker(TdApi.Sticker sticker){try{return sticker==null?null:dto.sticker(sticker);}catch(Exception ignored){return null;}}
    private static String giftDate(int at){return java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(new java.util.Date(at*1000L));}
    private static TdApi.Sticker giftModelSticker(TdApi.SentGift gift){
        if(gift instanceof TdApi.SentGiftRegular)return ((TdApi.SentGiftRegular)gift).gift==null?null:((TdApi.SentGiftRegular)gift).gift.sticker;
        if(gift instanceof TdApi.SentGiftUpgraded){TdApi.UpgradedGift up=((TdApi.SentGiftUpgraded)gift).gift;return up==null||up.model==null?null:up.model.sticker;}
        return null;
    }
    private void giftsCatalog(Answer a){requireAccount();
        perform(new TdApi.GetAvailableGifts(),a,value->{try{List<JSONObject> items=new ArrayList<>();
            if(value.gifts!=null)for(TdApi.AvailableGift gift:value.gifts){if(gift==null||gift.gift==null)continue;items.add(GiftsPolicy.available(gift,giftSticker(gift.gift.sticker)));}
            a.ok(GiftsPolicy.catalog(items));}catch(Exception ignored){a.fail("No se pudieron leer los regalos disponibles.");}});
    }
    private void giftsReceived(JSONObject p,Answer a)throws Exception{
        requireAccount();TdApi.MessageSender owner=giftOwner(p);
        TdApi.GetReceivedGifts request=GiftsPolicy.filters(p,owner,GiftsPolicy.page(p),GiftsPolicy.offset(p));
        perform(request,a,value->{try{List<JSONObject> items=new ArrayList<>();
            if(value.gifts!=null)for(TdApi.ReceivedGift gift:value.gifts){
                if(gift==null)continue;
                String sender=gift.senderId==null?"":session.senderName(gift.senderId);
                items.add(GiftsPolicy.received(gift,sender,giftSticker(giftModelSticker(gift.gift))));}
            a.ok(GiftsPolicy.received(value,items));}catch(Exception ignored){a.fail("No se pudieron leer tus regalos.");}});
    }
    private void giftsCanSend(JSONObject p,Answer a)throws Exception{requireAccount();long giftId=BridgePolicy.id(p,"gift");
        perform(new TdApi.CanSendGift(giftId),a,value->{try{a.ok(GiftsPolicy.canSend(value));}catch(Exception ignored){a.fail("Telegram no pudo comprobar ese regalo.");}});
    }
    private void giftsOptions(JSONObject p,Answer a)throws Exception{
        requireAccount();long userId=0;
        if(p.has("id")){TdApi.Chat chat=target(p);if(chat.type instanceof TdApi.ChatTypePrivate)userId=chat.id;}
        perform(new TdApi.GetStarGiftPaymentOptions(userId),a,value->{try{JSONArray options=new JSONArray();
            if(value.options!=null)for(TdApi.StarPaymentOption option:value.options){if(option!=null)options.put(StarsPolicy.paymentOption(option));}
            a.ok(object("options",options,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE));}catch(Exception ignored){a.fail("No se pudieron leer las opciones de pago del regalo.");}});
    }
    private void giftsSend(JSONObject p,Answer a)throws Exception{
        requireAccount();long giftId=BridgePolicy.id(p,"gift");TdApi.MessageSender recipient=giftRecipient(p,"id");
        String text=GiftsPolicy.message(p,"text");boolean isPrivate=GiftsPolicy.flag(p,"private");boolean payForUpgrade=GiftsPolicy.flag(p,"upgrade");
        long ownerId=session.selfId;
        session.perform(new TdApi.GetAvailableGifts(),value->{
            TdApi.Gift chosen=null;
            if(value.gifts!=null)for(TdApi.AvailableGift gift:value.gifts)if(gift!=null&&gift.gift!=null&&gift.gift.id==giftId)chosen=gift.gift;
            if(chosen==null){a.fail("Telegram ya no ofrece ese regalo.");return;}
            confirmGiftSend(chosen,recipient,text,isPrivate,payForUpgrade,ownerId,a);
        },error->a.fail("Telegram no confirmó el precio del regalo."));
    }
    private void confirmGiftSend(TdApi.Gift gift,TdApi.MessageSender recipient,String text,boolean isPrivate,boolean payForUpgrade,long ownerId,Answer a){
        long cost=gift.starCount+(payForUpgrade?gift.upgradeStarCount:0);
        String emoji=gift.sticker==null||gift.sticker.emoji==null||gift.sticker.emoji.isEmpty()?"un regalo":"el regalo "+gift.sticker.emoji;
        String who=NativeSnapshot.limit(session.senderName(recipient),120);
        Dialogs.builder(activity).setTitle("Enviar regalo").setMessage("Vas a enviar "+emoji+" a "+who+" por "+cost+" Stars"+(payForUpgrade?", incluida la mejora que pagas tú":"")+". "+(isPrivate?"El texto y tu nombre solo los verá quien lo reciba.":"El texto y tu nombre serán visibles para todo el mundo.")+" Telegram descuenta los Stars ahora y un regalo enviado no se puede devolver.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Enviar "+cost+" ⭐",(d,w)->{
            if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se envió ningún regalo.");return;}
            perform(new TdApi.SendGift(gift.id,recipient,new TdApi.FormattedText(text,new TdApi.TextEntity[0]),isPrivate,payForUpgrade),a,ignored->{schedule();a.ok(true);});
        }).setOnCancelListener(d->a.ok(false)).show();
    }
    private void giftsSave(JSONObject p,Answer a)throws Exception{requireAccount();
        perform(new TdApi.ToggleGiftIsSaved(GiftsPolicy.receivedId(p,"id"),GiftsPolicy.flag(p,"value")),a,ignored->a.ok(true));
    }
    private void giftsPin(JSONObject p,Answer a)throws Exception{requireAccount();
        perform(new TdApi.SetPinnedGifts(giftOwner(p),GiftsPolicy.receivedIds(p,"ids")),a,ignored->a.ok(true));
    }
    private void giftsSell(JSONObject p,Answer a)throws Exception{
        requireAccount();String id=GiftsPolicy.receivedId(p,"id");long ownerId=session.selfId;
        session.perform(new TdApi.GetReceivedGift(id),value->{
            if(value.sellStarCount<=0){a.fail("Este regalo no puede cambiarse por Stars.");return;}
            Dialogs.builder(activity).setTitle("Cambiar regalo por Stars").setMessage("Telegram convertirá este regalo en "+value.sellStarCount+" Stars para siempre. Dejará de estar en tus regalos y no podrás mostrarlo, mejorarlo ni enviarlo.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Cambiar",(d,w)->{
                if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se cambió el regalo.");return;}
                perform(new TdApi.SellGift("",id),a,ignored->{schedule();a.ok(true);});
            }).setOnCancelListener(d->a.ok(false)).show();
        },error->a.fail("Telegram no confirmó el valor del regalo."));
    }
    private void giftsDelete(JSONObject p,Answer a)throws Exception{
        requireAccount();String id=GiftsPolicy.receivedId(p,"id");long ownerId=session.selfId;
        Dialogs.builder(activity).setTitle("Eliminar regalo").setMessage("WRGram borrará este regalo de tu lista en Telegram. No se recuperará y no devuelve los Stars que costó.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Eliminar",(d,w)->{
            if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se eliminó el regalo.");return;}
            perform(new TdApi.DeleteGift("",id),a,ignored->a.ok(true));
        }).setOnCancelListener(d->a.ok(false)).show();
    }
    private void giftsUpgradePreview(JSONObject p,Answer a)throws Exception{requireAccount();long giftId=BridgePolicy.id(p,"gift");
        perform(new TdApi.GetGiftUpgradePreview(giftId),a,value->{try{
            JSONArray models=new JSONArray();
            if(value.models!=null)for(TdApi.UpgradedGiftModel model:value.models){
                if(model==null)continue;
                JSONObject item=GiftsPolicy.models(new TdApi.UpgradedGiftModel[]{model}).getJSONObject(0);
                JSONObject sticker=giftSticker(model.sticker);
                if(sticker!=null)item.put("sticker",sticker);
                models.put(item);
            }
            JSONArray symbols=new JSONArray();
            if(value.symbols!=null)for(TdApi.UpgradedGiftSymbol symbol:value.symbols){
                if(symbol==null)continue;
                JSONObject item=GiftsPolicy.symbols(new TdApi.UpgradedGiftSymbol[]{symbol}).getJSONObject(0);
                JSONObject sticker=giftSticker(symbol.sticker);
                if(sticker!=null)item.put("sticker",sticker);
                symbols.put(item);
            }
            a.ok(GiftsPolicy.preview(value,models,symbols));}catch(Exception ignored){a.fail("No se pudo leer la vista previa de la mejora.");}});
    }
    private void giftsUpgrade(JSONObject p,Answer a)throws Exception{
        requireAccount();String id=GiftsPolicy.receivedId(p,"id");boolean keep=GiftsPolicy.flag(p,"keepOriginal");long ownerId=session.selfId;
        session.perform(new TdApi.GetReceivedGift(id),value->{
            if(!(value.gift instanceof TdApi.SentGiftRegular)||((TdApi.SentGiftRegular)value.gift).gift==null){a.fail("Este regalo ya está mejorado y no puede volver a mejorarse.");return;}
            if(!value.canBeUpgraded){a.fail("Telegram no permite mejorar este regalo.");return;}
            TdApi.Gift gift=((TdApi.SentGiftRegular)value.gift).gift;
            boolean prepaid=value.prepaidUpgradeStarCount>0;
            long cost=prepaid?0:gift.upgradeStarCount;
            Dialogs.builder(activity).setTitle("Mejorar regalo").setMessage("Telegram convertirá este regalo en una versión única e irrepetible con número de serie."+(prepaid?" El remitente ya pagó la mejora, así que no gastarás Stars.":" Costará "+cost+" Stars adicionales.")+(keep?" Se conservarán el texto y el remitente originales.":" Se ocultarán el texto y el remitente originales.")+" La mejora no se puede deshacer.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Mejorar",(d,w)->{
                if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se mejoró el regalo.");return;}
                perform(new TdApi.UpgradeGift("",id,keep,cost),a,result->{try{
                    schedule();a.ok(GiftsPolicy.upgrade(result,result.gift==null||result.gift.model==null?null:giftSticker(result.gift.model.sticker)));}catch(Exception ignored){a.fail("Telegram no devolvió el regalo mejorado.");}});
            }).setOnCancelListener(d->a.ok(false)).show();
        },error->a.fail("Telegram no pudo comprobar si el regalo puede mejorarse."));
    }
    private void giftsTransfer(JSONObject p,Answer a)throws Exception{
        requireAccount();String id=GiftsPolicy.receivedId(p,"id");TdApi.MessageSender recipient=giftRecipient(p,"to");long ownerId=session.selfId;
        session.perform(new TdApi.GetReceivedGift(id),value->{
            if(!value.canBeTransferred){a.fail("Este regalo no se puede transferir; solo las versiones mejoradas cambian de dueño.");return;}
            int now=(int)(System.currentTimeMillis()/1000);
            if(value.nextTransferDate>now){a.fail("Telegram permitirá transferir este regalo el "+giftDate(value.nextTransferDate)+".");return;}
            confirmGiftTransfer(id,value.transferStarCount,recipient,ownerId,a);
        },error->a.fail("Telegram no pudo comprobar si el regalo puede transferirse."));
    }
    private void confirmGiftTransfer(String id,long stars,TdApi.MessageSender recipient,long ownerId,Answer a){
        String who=NativeSnapshot.limit(session.senderName(recipient),120);
        Dialogs.builder(activity).setTitle("Transferir regalo").setMessage("El regalo único pasará a ser de "+who+(stars>0?". Telegram cobrará "+stars+" Stars por la transferencia":"? La transferencia no cuesta Stars")+" y no se puede deshacer.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Transferir",(d,w)->{
            if(!currentAccount()||session.selfId!=ownerId){a.fail("La cuenta cambió. No se transfirió el regalo.");return;}
            perform(new TdApi.TransferGift("",id,recipient,stars),a,ignored->{schedule();a.ok(true);});
        }).setOnCancelListener(d->a.ok(false)).show();
    }
    private static boolean hasCaption(TdApi.Message message){TdApi.MessageContent content=message.content;return content instanceof TdApi.MessagePhoto||content instanceof TdApi.MessageVideo||content instanceof TdApi.MessageAnimation||content instanceof TdApi.MessageDocument||content instanceof TdApi.MessageAudio;}
    private static TdApi.TextEntity[] textEntities(JSONObject params,int length)throws Exception{
        if(!params.has("entities"))return new TdApi.TextEntity[0];
        JSONArray values=params.getJSONArray("entities");
        if(values.length()>100)throw new IllegalArgumentException();
        java.util.ArrayList<TdApi.TextEntity> entities=new java.util.ArrayList<>();
        for(int index=0;index<values.length();index++){
            JSONObject value=values.getJSONObject(index);
            String type=BridgePolicy.text(value,"type",16);
            int offset=value.getInt("offset"),size=value.getInt("length");
            if(offset<0||offset>length||size<1||size>length-offset)throw new IllegalArgumentException();
            TdApi.TextEntityType kind;
            switch(type){
                case "bold":kind=new TdApi.TextEntityTypeBold();break;
                case "italic":kind=new TdApi.TextEntityTypeItalic();break;
                case "underline":kind=new TdApi.TextEntityTypeUnderline();break;
                case "strikethrough":kind=new TdApi.TextEntityTypeStrikethrough();break;
                case "spoiler":kind=new TdApi.TextEntityTypeSpoiler();break;
                case "code":kind=new TdApi.TextEntityTypeCode();break;
                case "pre":kind=new TdApi.TextEntityTypePre();break;
                case "blockquote":kind=new TdApi.TextEntityTypeBlockQuote();break;
                case "customEmoji":{
                    long id=BridgePolicy.id(value,"customEmojiId");
                    if(id<=0)throw new IllegalArgumentException("Emoji personalizado no válido.");
                    kind=new TdApi.TextEntityTypeCustomEmoji(id);
                    break;
                }
                case "link":{String url=BridgePolicy.text(value,"url",2048);if(!url.matches("(?i)^(https?://|tg://).+"))throw new IllegalArgumentException();kind=new TdApi.TextEntityTypeTextUrl(url);break;}
                default:throw new IllegalArgumentException();
            }
            entities.add(new TdApi.TextEntity(offset,size,kind));
        }
        entities.sort(java.util.Comparator.comparingInt(entity->entity.offset));
        return entities.toArray(new TdApi.TextEntity[0]);
    }
    private void messageAction(String method,JSONObject p,Answer a){TdApi.Message message=message(p);perform(new TdApi.GetMessageProperties(message.chatId,message.id),a,props->{try{
        if(method.equals("message.edit")&&props.canBeEdited&&message.content instanceof TdApi.MessageText){String text=BridgePolicy.text(p,"text",4096);session.edit(message,text,textEntities(p,text.length()));a.ok(true);}
        else if(method.equals("message.edit.caption")&&props.canBeEdited&&hasCaption(message)){String caption=BridgePolicy.text(p,"caption",1024);session.editCaption(message,caption,textEntities(p,caption.length()));a.ok(true);}
        else if(method.equals("message.delete")){boolean revoke=p.optBoolean("revoke");if(revoke?!props.canBeDeletedForAllUsers:!(props.canBeDeletedOnlyForSelf||props.canBeDeletedForAllUsers))throw new IllegalArgumentException();session.delete(message,revoke);a.ok(true);}
        else if(method.equals("message.copy")&&props.canBeCopied&&message.content instanceof TdApi.MessageText&&message.selfDestructType==null&&message.ephemeralContent==null){ClipboardManager clipboard=(ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);ClipData clip=ClipData.newPlainText("WRGram",dto.caption(message));PersistableBundle extra=new PersistableBundle();extra.putBoolean("android.content.extra.IS_SENSITIVE",true);clip.getDescription().setExtras(extra);if(clipboard!=null)clipboard.setPrimaryClip(clip);a.ok(true);}
        else if(method.equals("message.pin")&&props.canBePinned)perform(new TdApi.PinChatMessage(message.chatId,message.id,true,true),a,value->a.ok(true));
        else if(method.equals("message.forward")){boolean sendCopy=p.optBoolean("sendCopy"),removeCaption=p.optBoolean("removeCaption")&&sendCopy;if(sendCopy?!props.canBeCopied:!props.canBeForwarded)throw new IllegalArgumentException();long to=BridgePolicy.id(p,"to");TdApi.Chat chat=session.chat(to);if(chat==null||!session.unsupported(chat).isEmpty())throw new IllegalArgumentException();TdApi.ForwardMessages forward=new TdApi.ForwardMessages();forward.chatId=to;forward.fromChatId=message.chatId;forward.messageIds=new long[]{message.id};forward.options=sendOptions(p);forward.sendCopy=sendCopy;forward.removeCaption=removeCaption;perform(forward,a,value->a.ok(true));}
        else a.fail("Telegram no permite esta acción sobre el mensaje.");
    }catch(Exception ignored){a.fail("No se pudo preparar la acción.");}});}
    private void notes(String method,JSONObject p,Answer a){requireAccount();long user=session.selfId,chat=session.activeChat;if(!method.equals("notes.clear")&&(!dto.granted("notes")||chat==0)){a.fail("Activa notes:read y notes:write en Complementos antes de usar esta nota.");return;}String text=method.equals("notes.write")?BridgePolicy.text(p,"text",10000):"";((WrgramApplication)activity.getApplication()).storage().execute(()->{try{Object value;if(method.equals("notes.read"))value=object("text",PrivateNotes.read(activity,user,chat));else if(method.equals("notes.clear"))value=PrivateNotes.clearAccount(activity,user);else{if(!prefs.getBoolean("plugin."+user+".notes",false))throw new IllegalArgumentException();PrivateNotes.write(activity,user,chat,text);value=true;}main.post(()->{if(session.selfId==user)a.ok(value);else a.fail("La cuenta cambió.");});}catch(Exception ignored){main.post(()->a.fail("No se pudo abrir o guardar la nota cifrada."));}});}
    void picked(Uri uri){if(storyPicking!=null){if(storyVideoPicking)pickedStoryVideo(uri,storyPicking);else pickedStoryPhoto(uri,storyPicking);return;}Answer answer=picking;picking=null;if(answer==null)return;if(uri==null){answer.ok(null);return;}long user=session.selfId,chat=session.activeChat;((WrgramApplication)activity.getApplication()).storage().execute(()->{File output=null;try{String name="archivo";try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}name=name.replaceAll("[^\\p{L}\\p{N}._ -]","_");if(name.length()>90)name=name.substring(name.length()-90);if(name.isBlank()||name.startsWith("."))name="archivo";File folder=new File(activity.getNoBackupFilesDir(),"outbox/"+UUID.randomUUID());if(!folder.mkdirs())throw new IllegalStateException();output=new File(folder,name);long size=0;try(InputStream input=activity.getContentResolver().openInputStream(uri);OutputStream stream=Files.newOutputStream(output.toPath())){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1){size+=count;if(size>32L*1024*1024)throw new IllegalArgumentException();stream.write(buffer,0,count);}}Attachment item=new Attachment();item.path=output;item.name=name;item.size=size;item.mime=activity.getContentResolver().getType(uri);item.account=user;item.chat=chat;main.post(()->{if(session.selfId!=user||session.activeChat!=chat){try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}answer.fail("La cuenta o conversación cambió.");return;}String token=UUID.randomUUID().toString();attachments.put(token,item);answer.ok(object("token",token,"name",item.name,"size",item.size));});}catch(Exception ignored){if(output!=null)try{Files.deleteIfExists(output.toPath());}catch(Exception skipped){}main.post(()->answer.fail("No se pudo importar el archivo. Límite: 32 MB."));}});}
    private void sendPoll(JSONObject p,Answer a)throws Exception{
        requireAccount();if(!session.canSend())throw new IllegalArgumentException("No puedes enviar mensajes en este chat.");
        TdApi.Chat chat=session.chat(session.activeChat);if(chat==null)throw new IllegalArgumentException();
        if(chat.type instanceof TdApi.ChatTypeSecret)throw new IllegalArgumentException("Telegram no permite encuestas en chats secretos.");
        if(chat.type instanceof TdApi.ChatTypePrivate){long userId=((TdApi.ChatTypePrivate)chat.type).userId;TdApi.User user=session.user(userId);boolean bot=user!=null&&user.type instanceof TdApi.UserTypeBot;if(userId!=session.selfId&&!bot)throw new IllegalArgumentException("Las encuestas solo pueden enviarse a bots o a Mensajes guardados en chats privados.");}
        if(chat.permissions!=null&&!chat.permissions.canSendPolls)throw new IllegalArgumentException("Este chat no permite encuestas.");
        String question=BridgePolicy.text(p,"question",255).trim();if(question.isEmpty())throw new IllegalArgumentException("Escribe una pregunta.");
        JSONArray values=p.getJSONArray("options");if(values.length()<2||values.length()>10)throw new IllegalArgumentException("Escribe entre 2 y 10 opciones.");
        TdApi.InputPollOption[] options=new TdApi.InputPollOption[values.length()];java.util.HashSet<String> unique=new java.util.HashSet<>();
        for(int i=0;i<values.length();i++){String text=values.getString(i).trim();if(text.isEmpty()||text.length()>100)throw new IllegalArgumentException("Cada opción debe tener entre 1 y 100 caracteres.");if(!unique.add(text.toLowerCase(java.util.Locale.ROOT)))throw new IllegalArgumentException("Las opciones no pueden repetirse.");options[i]=new TdApi.InputPollOption(new TdApi.FormattedText(text,new TdApi.TextEntity[0]),null);}
        boolean quiz=p.optBoolean("quiz");boolean multiple=!quiz&&p.optBoolean("multiple");
        TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();poll.question=new TdApi.FormattedText(question,new TdApi.TextEntity[0]);poll.options=options;poll.isAnonymous=p.optBoolean("anonymous",true);poll.allowsMultipleAnswers=multiple;poll.allowsRevoting=p.optBoolean("revoting");poll.shuffleOptions=p.optBoolean("shuffle");poll.hideResultsUntilCloses=p.optBoolean("hide");poll.countryCodes=new String[0];
        if(quiz){String explanation=p.optString("explanation","").trim();int correct=p.optInt("correct",-1);if(correct<0||correct>=options.length)throw new IllegalArgumentException("Elige una respuesta correcta.");poll.type=new TdApi.InputPollTypeQuiz(new int[]{correct},explanation.isEmpty()?null:new TdApi.FormattedText(NativeSnapshot.limit(explanation,200),new TdApi.TextEntity[0]),null);}
        else poll.type=new TdApi.InputPollTypeRegular();
        session.sendContent(poll,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),a::ok);
    }
    private void answerPoll(JSONObject p,Answer a)throws Exception{
        TdApi.Message message=message(p);if(!(message.content instanceof TdApi.MessagePoll))throw new IllegalArgumentException("Este mensaje no contiene una encuesta.");
        JSONArray values=p.getJSONArray("options");if(values.length()<1||values.length()>10)throw new IllegalArgumentException();
        int[] ids=new int[values.length()];for(int i=0;i<values.length();i++){ids[i]=values.getInt(i);if(ids[i]<0)throw new IllegalArgumentException();}
        perform(new TdApi.SetPollAnswer(message.chatId,message.id,ids),a,ignored->{schedule();a.ok(true);});
    }
    private void stopPoll(JSONObject p,Answer a)throws Exception{
        TdApi.Message message=message(p);if(!(message.content instanceof TdApi.MessagePoll))throw new IllegalArgumentException("Este mensaje no contiene una encuesta.");
        perform(new TdApi.GetMessageProperties(message.chatId,message.id),a,props->{if(!props.canBeEdited){a.fail("Telegram no permite cerrar esta encuesta.");return;}perform(new TdApi.StopPoll(message.chatId,message.id,null),a,ignored->{schedule();a.ok(true);});});
    }
    private void pollVoters(JSONObject p,Answer a)throws Exception{
        TdApi.Message message=message(p);if(!(message.content instanceof TdApi.MessagePoll))throw new IllegalArgumentException("Este mensaje no contiene una encuesta.");
        int option=p.optInt("option",-1);if(option<0)throw new IllegalArgumentException();
        int offset=Math.max(0,p.optInt("offset",0));int limit=Math.max(1,Math.min(50,p.optInt("limit",50)));
        perform(new TdApi.GetPollVoters(message.chatId,message.id,option,offset,limit),a,result->{try{JSONArray items=new JSONArray();if(result.voters!=null)for(TdApi.PollVoter voter:result.voters)items.put(object("name",session.senderName(voter.voterId),"date",voter.date));a.ok(object("total",result.totalCount,"items",items));}catch(Exception ignored){a.fail("No se pudo preparar la lista de votantes.");}});
    }
    private void shareContact(JSONObject p,Answer a)throws Exception{
        requireAccount();if(!session.canSend())throw new IllegalArgumentException("No puedes enviar mensajes en este chat.");
        TdApi.Chat chat=session.chat(session.activeChat);if(chat==null)throw new IllegalArgumentException();
        if(chat.permissions!=null&&!chat.permissions.canSendOtherMessages)throw new IllegalArgumentException("Este chat no permite compartir contactos.");
        perform(new TdApi.GetUser(BridgePolicy.id(p,"id")),a,user->{String phone=user.phoneNumber==null?"":user.phoneNumber.trim();if(phone.isEmpty()){a.fail("Telegram no comparte el número de teléfono de este usuario. Solo puedes compartir contactos cuyo número ya está visible.");return;}String first=user.firstName==null?"":user.firstName,last=user.lastName==null?"":user.lastName;if(first.isEmpty()&&last.isEmpty())first="Contacto";TdApi.Contact contact=new TdApi.Contact(phone,NativeSnapshot.limit(first,64),NativeSnapshot.limit(last,64),"",user.id);session.sendContent(new TdApi.InputMessageContact(contact),BridgePolicy.id(p,"reply"),p.optBoolean("silent"),a::ok);});
    }
    private void shareLocation(JSONObject p,Answer a)throws Exception{
        requireAccount();if(!session.canSend())throw new IllegalArgumentException("No puedes enviar mensajes en este chat.");
        TdApi.Chat chat=session.chat(session.activeChat);if(chat==null)throw new IllegalArgumentException();
        if(chat.permissions!=null&&!chat.permissions.canSendOtherMessages)throw new IllegalArgumentException("Este chat no permite compartir ubicaciones.");
        if(locationAnswer!=null){a.fail("Ya hay una solicitud de ubicación en curso.");return;}
        long chatId=session.activeChat;locationAnswer=a;locationChat=chatId;locationSource=null;locationReply=BridgePolicy.id(p,"reply");locationSilent=p.optBoolean("silent");
        Dialogs.builder(activity).setTitle("Compartir ubicación").setMessage("Android pedirá permiso y luego podrás revisar la ubicación antes de enviarla a esta conversación.").setNegativeButton("Cancelar",(d,w)->{if(locationAnswer==a){locationAnswer=null;locationChat=0;locationReply=0;locationSilent=false;}a.ok(false);}).setPositiveButton("Continuar",(d,w)->{if(!currentAccount()||session.activeChat!=chatId){locationAnswer=null;locationChat=0;locationReply=0;locationSilent=false;a.fail("La conversación cambió. No se solicitó ubicación.");return;}activity.requestBotLocationPermission();}).setOnCancelListener(d->{if(locationAnswer==a){locationAnswer=null;locationChat=0;locationReply=0;locationSilent=false;}a.ok(false);}).show();
    }
    private void startVoice(Answer a)throws Exception{
        requireAccount();if(!session.canSend())throw new IllegalArgumentException("No puedes enviar mensajes en este chat.");
        if(voiceRecorder!=null||voiceFile!=null){a.fail("Ya hay una nota de voz en preparación.");return;}
        TdApi.Chat chat=session.chat(session.activeChat);if(chat==null)throw new IllegalArgumentException();
        if(chat.permissions!=null&&!chat.permissions.canSendVoiceNotes)throw new IllegalArgumentException("Este chat no permite notas de voz.");
        if(androidx.core.content.ContextCompat.checkSelfPermission(activity,android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED){voiceAnswer=a;voiceOwner=session.selfId;voiceChat=session.activeChat;activity.requestVoicePermission();return;}
        beginVoiceRecording(a);
    }
    void voicePermissionResult(boolean granted){Answer answer=voiceAnswer;voiceAnswer=null;if(answer==null||answer.finished)return;if(!granted){answer.fail("No se concedió permiso al micrófono. No se grabó ninguna nota.");return;}if(!currentAccount()||session.selfId!=voiceOwner||session.activeChat!=voiceChat){answer.fail("La cuenta o la conversación cambió. No se grabó nada.");return;}beginVoiceRecording(answer);}
    private void beginVoiceRecording(Answer a){
        File folder=null;
        try{
            folder=new File(activity.getNoBackupFilesDir(),"outbox/"+UUID.randomUUID());if(!folder.mkdirs())throw new IllegalStateException();
            voiceFile=new File(folder,"voice-"+System.currentTimeMillis()+".m4a");
            android.media.MediaRecorder recorder=new android.media.MediaRecorder();recorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);recorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);recorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(44100);recorder.setAudioChannels(1);recorder.setAudioEncodingBitRate(64000);recorder.setOutputFile(voiceFile.getAbsolutePath());recorder.prepare();recorder.start();
            voiceRecorder=recorder;voiceStartedAt=SystemClock.elapsedRealtime();voiceAutoStopped=false;voiceLevels.clear();voiceOwner=session.selfId;voiceChat=session.activeChat;main.postDelayed(voiceSampler,100);schedule();a.ok(true);
        }catch(Exception error){File file=voiceFile;voiceFile=null;voiceAutoStopped=false;voiceLevels.clear();if(file!=null)file.delete();if(folder!=null){File[] left=folder.listFiles();if(left!=null)for(File child:left)child.delete();folder.delete();}a.fail("No se pudo iniciar la grabación de voz.");}
    }
    private void stopVoiceRecorder(){android.media.MediaRecorder recorder=voiceRecorder;voiceRecorder=null;main.removeCallbacks(voiceSampler);if(recorder==null)return;try{recorder.stop();}catch(RuntimeException ignored){}try{recorder.release();}catch(RuntimeException ignored){}}
    private byte[] voiceWaveform(){if(voiceLevels.isEmpty())return new byte[0];int size=Math.min(100,voiceLevels.size());byte[] waveform=new byte[size];for(int i=0;i<size;i++){int from=i*voiceLevels.size()/size,to=Math.max(from+1,(i+1)*voiceLevels.size()/size),peak=0;for(int j=from;j<to&&j<voiceLevels.size();j++)peak=Math.max(peak,voiceLevels.get(j));waveform[i]=(byte)Math.max(0,Math.min(31,(int)Math.round(Math.sqrt(peak/32767.0)*31)));}return waveform;}
    private void finishVoice(Answer a)throws Exception{
        if(voiceFile==null&&voiceRecorder==null){a.fail("No hay una nota de voz en curso.");return;}
        if(!currentAccount()||session.selfId!=voiceOwner||session.activeChat!=voiceChat){cancelVoiceRecording();a.fail("La conversación cambió. No se envió la nota de voz.");return;}
        long elapsed=SystemClock.elapsedRealtime()-voiceStartedAt;stopVoiceRecorder();File file=voiceFile;voiceFile=null;voiceAutoStopped=false;
        if(file==null||!file.isFile()||file.length()<1024){if(file!=null){File parent=file.getParentFile();file.delete();if(parent!=null)parent.delete();}a.fail("La grabación quedó vacía. Inténtalo de nuevo.");return;}
        int duration=(int)Math.max(1,Math.min(60,Math.round(Math.min(60_000L,elapsed)/1000.0)));byte[] waveform=voiceWaveform();if(waveform.length==0)waveform=new byte[]{0};
        Attachment item=new Attachment();item.path=file;item.name="Nota de voz.m4a";item.size=file.length();item.mime="audio/mp4";item.voice=true;item.voiceDuration=duration;item.waveform=waveform;item.account=voiceOwner;item.chat=voiceChat;
        String token=UUID.randomUUID().toString();attachments.put(token,item);schedule();a.ok(object("token",token,"duration",duration,"size",item.size));
    }
    private void cancelVoice(Answer a){if(voiceRecorder==null&&voiceFile==null){a.ok(false);return;}cancelVoiceRecording();a.ok(true);}
    private void cancelVoiceRecording(){voiceAnswer=null;stopVoiceRecorder();File file=voiceFile;voiceFile=null;voiceAutoStopped=false;voiceLevels.clear();voiceStartedAt=0;voiceOwner=0;voiceChat=0;if(file!=null){File parent=file.getParentFile();file.delete();if(parent!=null){String[] left=parent.list();if(left!=null&&left.length==0)parent.delete();}}schedule();}
    static boolean validProxyServer(String server){if(server==null)return false;String value=server.trim();if(value.isEmpty()||value.length()>255)return false;if(value.contains("://")||value.contains("/")||value.contains("@")||value.contains(" "))return false;return value.matches("[A-Za-z0-9._:-]+");}
    static int storageDays(int days){return days==7||days==30||days==90?days:30;}
    private TdApi.Proxy proxyFrom(JSONObject p)throws Exception{
        String type=BridgePolicy.text(p,"type",10),server=BridgePolicy.text(p,"server",255).trim();int port=p.optInt("port",0);
        if(!validProxyServer(server))throw new IllegalArgumentException("El servidor del proxy no es válido.");
        if(port<1||port>65535)throw new IllegalArgumentException("El puerto debe estar entre 1 y 65535.");
        TdApi.ProxyType proxyType;
        if(type.equals("socks5"))proxyType=new TdApi.ProxyTypeSocks5(BridgePolicy.text(p,"username",128),BridgePolicy.text(p,"password",128));
        else if(type.equals("mtproto")){String secret=BridgePolicy.text(p,"secret",256).trim();if(!secret.matches("[0-9A-Fa-f]{32,256}"))throw new IllegalArgumentException("El secreto MTProto no es válido.");proxyType=new TdApi.ProxyTypeMtproto(secret);}
        else if(type.equals("http"))proxyType=new TdApi.ProxyTypeHttp(BridgePolicy.text(p,"username",128),BridgePolicy.text(p,"password",128),false);
        else if(type.equals("web"))proxyType=new TdApi.ProxyTypeWeb();
        else throw new IllegalArgumentException("Tipo de proxy no compatible.");
        return new TdApi.Proxy(server,port,proxyType);
    }
    private JSONObject proxyDto(TdApi.AddedProxy added)throws Exception{String type=added.proxy==null?"":added.proxy.type instanceof TdApi.ProxyTypeSocks5?"socks5":added.proxy.type instanceof TdApi.ProxyTypeMtproto?"mtproto":added.proxy.type instanceof TdApi.ProxyTypeHttp?"http":added.proxy.type instanceof TdApi.ProxyTypeWeb?"web":"";return object("id",added.id,"server",added.proxy==null?"":added.proxy.server,"port",added.proxy==null?0:added.proxy.port,"type",type,"enabled",added.isEnabled,"comment",NativeSnapshot.limit(added.comment==null?"":added.comment,64),"lastUsed",added.lastUsedDate);}
    private void listProxies(Answer a){requireAccount();perform(new TdApi.GetProxies(),a,result->{try{JSONArray items=new JSONArray();if(result.proxies!=null)for(TdApi.AddedProxy proxy:result.proxies)items.put(proxyDto(proxy));a.ok(items);}catch(Exception ignored){a.fail("No se pudo preparar la lista de proxies.");}});}
    private void addProxy(JSONObject p,Answer a)throws Exception{requireAccount();TdApi.Proxy proxy=proxyFrom(p);String comment=NativeSnapshot.limit(BridgePolicy.text(p,"comment",64).trim(),64);perform(new TdApi.AddProxy(proxy,p.optBoolean("enable",true),comment),a,added->{try{a.ok(proxyDto(added));}catch(Exception ignored){a.fail("El proxy se añadió, pero no se pudo mostrar su estado.");}});}
    private void proxyAction(String method,JSONObject p,Answer a)throws Exception{requireAccount();int id=p.getInt("id");if(id<=0)throw new IllegalArgumentException();TdApi.Function<TdApi.Ok> request;if(method.equals("proxy.enable"))request=new TdApi.EnableProxy(id);else if(method.equals("proxy.disable"))request=new TdApi.DisableProxy();else request=new TdApi.RemoveProxy(id);perform(request,a,ignored->{schedule();a.ok(true);});}
    private void pingProxy(JSONObject p,Answer a)throws Exception{requireAccount();int id=p.getInt("id");perform(new TdApi.GetProxies(),a,result->{TdApi.Proxy proxy=null;if(result.proxies!=null)for(TdApi.AddedProxy added:result.proxies)if(added.id==id)proxy=added.proxy;if(proxy==null){a.fail("Este proxy ya no está en la lista.");return;}performSlow(new TdApi.PingProxy(proxy),a,seconds->a.ok(seconds.seconds));});}
    private void storageStatus(Answer a){requireAccount();perform(new TdApi.GetStorageStatisticsFast(),a,result->{try{a.ok(storageDto(result).put("policy",session.cache.settings()));}catch(Exception ignored){a.fail("No se pudo consultar el almacenamiento.");}});}
    private void storageDetails(Answer a){
        requireAccount();
        session.cache.details(a::ok,a::fail);
    }
    private static JSONObject storageDto(TdApi.StorageStatisticsFast value)throws Exception{return object("filesSize",value.filesSize,"fileCount",value.fileCount,"databaseSize",value.databaseSize,"languagePackDatabaseSize",value.languagePackDatabaseSize,"logSize",value.logSize,"total",value.filesSize+value.databaseSize+value.languagePackDatabaseSize+value.logSize);}
    private void optimizeStorage(JSONObject p,Answer a)throws Exception{
        requireAccount();
        int days=p.has("days")?storageDays(p.optInt("days",30)):0;
        String category=p.has("category")?BridgePolicy.text(p,"category",10):"all";
        long chatId=p.has("chatId")?BridgePolicy.id(p,"chatId"):0;
        session.cache.clear(category,chatId,days,result->{
            try{a.ok(object("size",result.size,"count",result.count,"days",days));}
            catch(Exception ignored){a.fail("No se pudo preparar el resultado de la limpieza.");}
        },a::fail);
    }
    private JSONObject stickerInfo(TdApi.StickerSetInfo set)throws Exception{JSONObject value=object("id",Long.toString(set.id),"title",set.title==null?"":NativeSnapshot.limit(set.title,128),"name",set.name==null?"":set.name,"size",set.size,"installed",set.isInstalled,"archived",set.isArchived,"official",set.isOfficial);if(set.thumbnail!=null){JSONObject media=dto.thumbnail(set.thumbnail,"Miniatura del pack");if(media!=null)value.put("thumbnail",media);}return value;}
    private JSONObject stickerInfo(TdApi.StickerSet set)throws Exception{JSONObject value=object("id",Long.toString(set.id),"title",set.title==null?"":NativeSnapshot.limit(set.title,128),"name",set.name==null?"":set.name,"size",set.stickers==null?0:set.stickers.length,"installed",set.isInstalled,"archived",set.isArchived,"official",set.isOfficial);if(set.thumbnail!=null){JSONObject media=dto.thumbnail(set.thumbnail,"Miniatura del pack");if(media!=null)value.put("thumbnail",media);}return value;}
    private static long customEmojiId(TdApi.Sticker sticker){
        return sticker!=null&&sticker.fullType instanceof TdApi.StickerFullTypeCustomEmoji
            ?((TdApi.StickerFullTypeCustomEmoji)sticker.fullType).customEmojiId:0;
    }
    private JSONObject emojiPackList(TdApi.StickerSetInfo[] sets,int nextOffset)throws Exception{
        JSONArray items=new JSONArray();
        if(sets!=null)for(TdApi.StickerSetInfo set:sets){
            JSONObject pack=stickerInfo(set);
            if(!pack.has("thumbnail")&&set.covers!=null&&set.covers.length>0){
                TdApi.Sticker sample=set.covers[0];
                if(sample!=null){
                    JSONObject cover=dto.sticker(sample);
                    if(cover!=null)pack.put("thumbnail",cover);
                    pack.put("emoji",sample.emoji);
                }
            }
            items.put(pack);
        }
        return object("items",items,"nextOffset",nextOffset);
    }
    private void emojiPacks(JSONObject p,Answer a)throws Exception{
        requireAccount();
        TdApi.StickerTypeCustomEmoji type=new TdApi.StickerTypeCustomEmoji();
        String kind=BridgePolicy.text(p,"kind",10);
        switch(kind){
            case "installed":
                perform(new TdApi.GetInstalledStickerSets(type),a,result->{
                    try{a.ok(emojiPackList(result.sets,0));}catch(Exception e){a.fail("No se pudieron leer los packs guardados.");}
                });
                break;
            case "search":
                String query=BridgePolicy.text(p,"query",64).trim();
                if(query.isEmpty()){a.fail("Escribe el nombre de un pack.");return;}
                perform(new TdApi.SearchStickerSets(type,query),a,result->{
                    try{a.ok(emojiPackList(result.sets,0));}catch(Exception e){a.fail("No se pudieron leer los resultados.");}
                });
                break;
            case "featured":
                int offset=p.optInt("offset",0);
                if(offset<0||offset>10000)throw new IllegalArgumentException("Página no válida.");
                perform(new TdApi.GetTrendingStickerSets(type,offset,24),a,result->{
                    try{
                        int count=result.sets==null?0:result.sets.length;
                        int next=offset+count;
                        a.ok(emojiPackList(result.sets,count>0&&next<result.totalCount&&next<=10000?next:0));
                    }catch(Exception e){a.fail("No se pudieron leer los packs destacados.");}
                });
                break;
            default:throw new IllegalArgumentException("Sección de emojis no válida.");
        }
    }
    private void emojiPack(JSONObject p,Answer a){
        requireAccount();
        long id=BridgePolicy.id(p,"id");
        perform(new TdApi.GetStickerSet(id),a,set->{
            if(!(set.stickerType instanceof TdApi.StickerTypeCustomEmoji)){a.fail("Este pack no contiene emojis personalizados.");return;}
            try{
                JSONArray items=new JSONArray();
                if(set.stickers!=null)for(TdApi.Sticker sticker:set.stickers){
                    long emojiId=customEmojiId(sticker);
                    if(emojiId<=0)continue;
                    JSONObject item=object("id",Long.toString(emojiId),"emoji",sticker.emoji);
                    JSONObject file=dto.sticker(sticker);
                    if(file!=null)item.put("media",file);
                    items.put(item);
                }
                a.ok(stickerInfo(set).put("items",items));
            }catch(Exception e){a.fail("No se pudo abrir el pack de emojis.");}
        });
    }
    private void installedStickers(Answer a){requireAccount();perform(new TdApi.GetInstalledStickerSets(new TdApi.StickerTypeRegular()),a,result->{try{JSONArray items=new JSONArray();if(result.sets!=null)for(TdApi.StickerSetInfo set:result.sets)items.put(stickerInfo(set));a.ok(items);}catch(Exception ignored){a.fail("No se pudieron preparar los packs de stickers.");}});}
    private void searchStickers(JSONObject p,Answer a)throws Exception{requireAccount();String name=BridgePolicy.text(p,"name",80).trim();if(name.contains("/"))name=name.substring(name.lastIndexOf('/')+1);if(!name.matches("[A-Za-z0-9_]{1,64}"))throw new IllegalArgumentException("Escribe el nombre corto del pack (por ejemplo, Animals).");perform(new TdApi.SearchStickerSet(name,false),a,set->{try{a.ok(stickerInfo(set));}catch(Exception ignored){a.fail("No se pudo preparar el pack.");}});}
    private void stickerSet(JSONObject p,Answer a)throws Exception{requireAccount();long id=BridgePolicy.id(p,"id");perform(new TdApi.GetStickerSet(id),a,set->{try{JSONObject value=stickerInfo(set);JSONArray stickers=new JSONArray();if(set.stickers!=null)for(int i=0;i<set.stickers.length&&i<24;i++){JSONObject media=dto.sticker(set.stickers[i]);if(media!=null)stickers.put(media);}value.put("stickers",stickers);a.ok(value);}catch(Exception ignored){a.fail("No se pudo cargar el pack de stickers.");}});}
    private void changeStickerSet(JSONObject p,Answer a)throws Exception{requireAccount();long id=BridgePolicy.id(p,"id");boolean installed=p.getBoolean("installed");perform(new TdApi.ChangeStickerSet(id,installed,false),a,ignored->{schedule();a.ok(true);});}
    private TdApi.InputMessageContent photoContent(Attachment item){BitmapFactory.Options dimensions=new BitmapFactory.Options();dimensions.inJustDecodeBounds=true;BitmapFactory.decodeFile(item.path.getPath(),dimensions);if(dimensions.outWidth<=0||dimensions.outHeight<=0)throw new IllegalArgumentException("No se pudo leer la imagen.");TdApi.InputPhoto photo=new TdApi.InputPhoto();photo.photo=new TdApi.InputFileLocal(item.path.getPath());photo.width=dimensions.outWidth;photo.height=dimensions.outHeight;return new TdApi.InputMessagePhoto(photo,new TdApi.FormattedText("",new TdApi.TextEntity[0]),false,null,false);}
    private void sendAttachment(JSONObject p,Answer a){requireAccount();String token=BridgePolicy.text(p,"token",80);Attachment item=attachments.get(token);if(item==null||item.account!=session.selfId||item.chat!=session.activeChat||!session.canSend())throw new IllegalArgumentException();if(session.uncertain(session.activeChat)){a.fail("Revisa el envío anterior en el historial antes de enviar otro archivo.");return;}TdApi.ChatPermissions permissions=session.chat(session.activeChat).permissions;TdApi.InputMessageContent content;
        if(item.voice){if(permissions!=null&&!permissions.canSendVoiceNotes)throw new IllegalArgumentException("Este chat no permite notas de voz.");content=new TdApi.InputMessageVoiceNote(new TdApi.InputVoiceNote(new TdApi.InputFileLocal(item.path.getPath()),item.voiceDuration,item.waveform),new TdApi.FormattedText("",new TdApi.TextEntity[0]),null);}
        else if(item.videoNote){if(permissions!=null&&!permissions.canSendVideoNotes)throw new IllegalArgumentException("Este chat no permite videomensajes.");content=new TdApi.InputMessageVideoNote(new TdApi.InputVideoNote(new TdApi.InputFileLocal(item.path.getPath()),null,item.voiceDuration,item.videoLength),null);}
        else if(item.mime!=null&&(item.mime.equals("image/jpeg")||item.mime.equals("image/png")||item.mime.equals("image/webp"))){if(permissions!=null&&!permissions.canSendPhotos)throw new IllegalArgumentException();content=photoContent(item);}
        else {if(permissions!=null&&!permissions.canSendDocuments)throw new IllegalArgumentException();TdApi.InputDocument document=new TdApi.InputDocument();document.document=new TdApi.InputFileLocal(item.path.getPath());content=new TdApi.InputMessageDocument(document,new TdApi.FormattedText("",new TdApi.TextEntity[0]));}
        session.sendContent(content,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),sent->{if(sent){attachments.remove(token);try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}}a.ok(sent);});
    }
    private void sendAlbum(JSONObject p,Answer a)throws Exception{requireAccount();JSONArray values=p.getJSONArray("tokens");if(values.length()<2||values.length()>10)throw new IllegalArgumentException("Elige entre 2 y 10 fotos.");if(session.uncertain(session.activeChat)){a.fail("Revisa el envío anterior en el historial antes de enviar un álbum.");return;}TdApi.ChatPermissions permissions=session.chat(session.activeChat).permissions;if(permissions!=null&&!permissions.canSendPhotos)throw new IllegalArgumentException();ArrayList<Attachment> items=new ArrayList<>();ArrayList<TdApi.InputMessageContent> contents=new ArrayList<>();
        for(int i=0;i<values.length();i++){String token=values.getString(i);Attachment item=attachments.get(token);if(item==null||item.account!=session.selfId||item.chat!=session.activeChat)throw new IllegalArgumentException("El álbum cambió de conversación.");items.add(item);contents.add(photoContent(item));}
        session.sendAlbum(contents,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),0,sent->{if(sent)for(int i=0;i<items.size();i++){attachments.remove(values.optString(i));try{Files.deleteIfExists(items.get(i).path.toPath());}catch(Exception ignored){}}a.ok(sent);});
    }
    private void sendPaidMedia(JSONObject p,Answer a)throws Exception{
        requireAccount();
        TdApi.Chat chat=session.chat(session.activeChat);
        if(chat==null||!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException("La multimedia de pago solo se puede publicar en un canal.");
        if(session.uncertain(session.activeChat)){a.fail("Revisa el envío anterior en el historial antes de publicar multimedia de pago.");return;}
        JSONArray values=p.getJSONArray("tokens");if(values.length()<1||values.length()>10)throw new IllegalArgumentException("Publica entre 1 y 10 fotos o vídeos de pago.");
        String[] tokens=new String[values.length()];
        TdApi.InputPaidMedia[] media=new TdApi.InputPaidMedia[values.length()];
        ArrayList<Attachment> items=new ArrayList<>();
        for(int i=0;i<values.length();i++){
            String token=values.getString(i);tokens[i]=token;
            Attachment item=attachments.get(token);
            if(item==null||item.account!=session.selfId||item.chat!=session.activeChat)throw new IllegalArgumentException("La selección de archivos cambió o expiró.");
            boolean video=item.mime!=null&&item.mime.startsWith("video/");
            boolean photo=item.mime!=null&&(item.mime.equals("image/jpeg")||item.mime.equals("image/png")||item.mime.equals("image/webp"));
            if(!video&&!photo)throw new IllegalArgumentException("La multimedia de pago solo admite fotos JPEG, PNG o WebP y vídeos.");
            TdApi.InputPaidMedia piece=new TdApi.InputPaidMedia();
            piece.media=new TdApi.InputFileLocal(item.path.getPath());
            if(video){TdApi.InputPaidMediaTypeVideo type=new TdApi.InputPaidMediaTypeVideo();type.supportsStreaming=true;piece.type=type;}
            else piece.type=new TdApi.InputPaidMediaTypePhoto();
            media[i]=piece;items.add(item);
        }
        String caption=BridgePolicy.text(p,"text",1024);
        TdApi.FormattedText formatted=new TdApi.FormattedText(caption,textEntities(p,caption.length()));
        long ownerId=session.selfId;
        long chatId=chat.id;
        long groupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
        perform(new TdApi.GetSupergroupFullInfo(groupId),a,info->{
            if(!info.hasPaidMediaAllowed){a.fail("Este canal no tiene activada la función de contenido de pago en Telegram.");return;}
            perform(new TdApi.GetOption("paid_media_message_star_count_max"),a,option->{
                long max=option instanceof TdApi.OptionValueInteger?((TdApi.OptionValueInteger)option).value:2500;
                long price;
                try{price=StarsPolicy.stars(p,"starCount",max);}catch(Exception invalid){a.fail(invalid.getMessage());return;}
                Dialogs.builder(activity).setTitle("Publicar contenido de pago").setMessage("Se publicará "+(items.size()==1?"1 archivo":items.size()+" archivos")+" en este canal con un precio de "+price+" Stars por desbloquear. Cada persona que quiera verlo paga con Telegram Stars; el cobro lo procesa Telegram y el contenido queda guardado en el canal.").setNegativeButton("Cancelar",(d,w)->a.ok(false)).setPositiveButton("Publicar por "+price+" ⭐",(d,w)->{
                    if(!currentAccount()||session.selfId!=ownerId||session.activeChat!=chatId){a.fail("La cuenta o conversación cambió. No se publicó nada.");return;}
                    TdApi.InputMessagePaidMedia content=new TdApi.InputMessagePaidMedia();
                    content.starCount=price;content.paidMedia=media;content.caption=formatted;content.payload="";
                    session.sendContent(content,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),sent->{if(sent)for(String token:tokens){Attachment item=attachments.remove(token);if(item!=null)try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}}a.ok(sent);});
                }).setOnCancelListener(d->a.ok(false)).show();
            });
        });
    }
    void pickedAlbum(java.util.List<Uri> uris){
        Answer answer=albumPicking;albumPicking=null;if(answer==null)return;
        if(uris==null||uris.isEmpty()){answer.ok(null);return;}
        if(uris.size()<2){answer.fail("Elige al menos 2 fotos para crear un álbum.");return;}
        if(uris.size()>10){answer.fail("Puedes elegir hasta 10 fotos por álbum.");return;}
        long owner=answer.owner,chat=session.activeChat;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            ArrayList<Attachment> items=new ArrayList<>();File folder=null;
            try{
                folder=new File(activity.getNoBackupFilesDir(),"outbox/"+UUID.randomUUID());if(!folder.mkdirs())throw new IllegalStateException();
                for(Uri uri:uris)items.add(importPhoto(uri,owner,chat,folder));
                File created=folder;
                main.post(()->{
                    if(destroyed||!currentAccount()||session.selfId!=owner||session.activeChat!=chat){for(Attachment item:items)try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}answer.fail("La cuenta o conversación cambió.");return;}
                    try{JSONArray result=new JSONArray();for(Attachment item:items){String token=UUID.randomUUID().toString();attachments.put(token,item);result.put(object("token",token,"name",item.name,"size",item.size));}answer.ok(result);}catch(Exception ignored){answer.fail("No se pudo preparar el álbum.");}
                });
            }catch(Exception ignored){for(Attachment item:items)try{Files.deleteIfExists(item.path.toPath());}catch(Exception skipped){}if(folder!=null){File[] left=folder.listFiles();if(left!=null)for(File file:left)file.delete();folder.delete();}main.post(()->answer.fail("No se pudieron importar las fotos. Límite: 10 imágenes de 32 MB."));}
        });
    }
    private Attachment importPhoto(Uri uri,long owner,long chat,File folder)throws Exception{
        String mime=activity.getContentResolver().getType(uri);String name="foto";
        try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}
        name=name==null?"foto":name.replaceAll("[^\\p{L}\\p{N}._ -]","_");if(name.length()>90)name=name.substring(name.length()-90);if(name.isBlank()||name.startsWith("."))name="foto";
        if(mime==null||!mime.startsWith("image/"))throw new IllegalArgumentException();
        File output=new File(folder,UUID.randomUUID().toString().replace("-","")+"-"+name);long size=0;
        try(InputStream input=activity.getContentResolver().openInputStream(uri);OutputStream stream=Files.newOutputStream(output.toPath())){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1){size+=count;if(size>32L*1024*1024)throw new IllegalArgumentException();stream.write(buffer,0,count);}}
        Attachment item=new Attachment();item.path=output;item.name=name;item.size=size;item.mime=mime;item.account=owner;item.chat=chat;return item;
    }
    void recordedVideoNote(Uri uri){
        if(uri==null){Answer answer=videoNotePicking;videoNotePicking=null;if(answer!=null)answer.fail("No se grabó ningún videomensaje.");return;}
        pickedVideoNote(uri);
    }
    void pickedVideoNote(Uri uri){
        Answer answer=videoNotePicking;videoNotePicking=null;if(answer==null)return;
        if(uri==null){answer.ok(null);return;}        long owner=session.selfId,chat=session.activeChat;
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            File output=null;
            try{
                String mime=activity.getContentResolver().getType(uri);
                if(mime==null||!mime.startsWith("video/"))throw new IllegalArgumentException("Elige un archivo de vídeo MP4.");
                File folder=new File(activity.getNoBackupFilesDir(),"outbox/"+UUID.randomUUID());if(!folder.mkdirs())throw new IllegalStateException();
                output=new File(folder,"videomensaje.mp4");
                long size=0;
                try(InputStream input=activity.getContentResolver().openInputStream(uri);OutputStream stream=Files.newOutputStream(output.toPath())){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1){size+=count;if(size>20L*1024*1024)throw new IllegalArgumentException("El videomensaje supera los 20 MB.");stream.write(buffer,0,count);}}
                int duration,width,height;
                android.media.MediaMetadataRetriever retriever=new android.media.MediaMetadataRetriever();
                try{
                    retriever.setDataSource(output.getAbsolutePath());
                    String durationValue=retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
                    String widthValue=retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                    String heightValue=retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                    duration=(int)Math.round(Integer.parseInt(durationValue==null?"0":durationValue)/1000.0);
                    width=Integer.parseInt(widthValue==null?"0":widthValue);
                    height=Integer.parseInt(heightValue==null?"0":heightValue);
                }finally{retriever.release();}
                if(duration<1||duration>60)throw new IllegalArgumentException("El videomensaje debe durar entre 1 y 60 segundos.");
                if(width<=0||height<=0||Math.max(width,height)>640)throw new IllegalArgumentException("El vídeo debe ser de 640 px como máximo por lado. Graba con la cámara de la app o reduce su resolución.");
                Attachment item=new Attachment();item.path=output;item.name="videomensaje.mp4";item.size=size;item.mime=mime;item.account=owner;item.chat=chat;item.videoNote=true;item.voiceDuration=duration;item.videoLength=Math.max(width,height);
                main.post(()->{
                    if(destroyed||!currentAccount()||session.selfId!=owner||session.activeChat!=chat){try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}answer.fail("La cuenta o conversación cambió.");return;}
                    try{String token=UUID.randomUUID().toString();attachments.put(token,item);answer.ok(object("token",token,"name",item.name,"size",item.size,"duration",item.voiceDuration,"length",item.videoLength));}catch(Exception ignored){answer.fail("No se pudo preparar el videomensaje.");}
                });
            }catch(IllegalArgumentException error){if(output!=null)try{Files.deleteIfExists(output.toPath());}catch(Exception skipped){}String message=error.getMessage();main.post(()->answer.fail(message==null||message.isBlank()?"No se pudo preparar el videomensaje.":message));}
            catch(Exception ignored){if(output!=null)try{Files.deleteIfExists(output.toPath());}catch(Exception skipped){}main.post(()->answer.fail("No se pudo preparar el videomensaje."));}
        });
    }
    private void playDownloadedMedia(JSONObject params,Answer answer)throws Exception{
        requireAccount();
        int id=params.getInt("id");
        File file=media.displayFile(id);
        if(file==null){answer.fail("Descarga primero el vídeo.");return;}
        String mime=FileViewers.mime(media.mimeType(id),file);
        if(!mime.startsWith("video/")&&!FileViewers.extension(file).matches("mp4|m4v|mkv|webm|mov|avi|3gp|mpg|mpeg|mts|m2ts|ts|ogv|flv")){
            answer.fail("Este archivo no es un vídeo compatible.");return;
        }
        activity.startActivity(new Intent(activity,PlayerActivity.class).putExtra(PlayerActivity.EXTRA_FILE,file.getAbsolutePath())
                .putExtra(PlayerActivity.EXTRA_TITLE,NativeSnapshot.limit(params.optString("title",file.getName()),200))
                .putExtra(PlayerActivity.EXTRA_POSITION,Math.max(0,params.optLong("position",0)))
                .putExtra(PlayerActivity.EXTRA_MIME,mime).putExtra(PlayerActivity.EXTRA_EXTERNAL,!media.protectedFile(id)));
        answer.ok(true);
    }

    private void openDownloadedMedia(int id,Answer answer){
        requireAccount();
        if(media.protectedFile(id)){answer.fail("Telegram protege este archivo. Puedes verlo dentro de WRGram cuando hay un visor compatible.");return;}
        File file=media.exportFile(id);
        if(file==null||!file.isFile()){answer.fail("Descarga primero el archivo.");return;}
        String mime=FileViewers.mime(media.mimeType(id),file);
        if(mime.equals("application/vnd.android.package-archive")){answer.fail("Puedes guardar este APK desde el menú del archivo.");return;}
        try{FileViewers.open(activity,file,mime);answer.ok(true);}
        catch(android.content.ActivityNotFoundException|SecurityException ignored){answer.fail("Android no tiene un visor para este formato. Puedes guardar el archivo.");}
    }

    private void previewDownloadedText(int id,Answer answer){
        requireAccount();
        File file=media.displayFile(id);
        if(file==null||!file.isFile()){answer.fail("Descarga primero el archivo.");return;}
        String mime=FileViewers.mime(media.mimeType(id),file);
        if(!FileViewers.readableText(mime,file)){
            answer.fail("Este archivo no es un documento de texto.");return;
        }
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            try(InputStream input=new java.io.FileInputStream(file)){
                byte[] data=new byte[256*1024];
                int size=0;
                for(int n;(size<data.length&&(n=input.read(data,size,data.length-size))!=-1);)size+=n;
                boolean truncated=input.read()!=-1;
                java.nio.charset.Charset charset=java.nio.charset.StandardCharsets.UTF_8;
                if(size>=2&&((data[0]==(byte)0xff&&data[1]==(byte)0xfe)||(data[0]==(byte)0xfe&&data[1]==(byte)0xff)))
                    charset=java.nio.charset.StandardCharsets.UTF_16;
                String text=new String(data,0,size,charset).replaceFirst("^\ufeff","");
                main.post(()->{if(currentAccount()&&answer.owner==session.selfId)answer.ok(object("text",text,"truncated",truncated));else answer.fail("La cuenta cambió.");});
            }catch(java.io.IOException ignored){main.post(()->answer.fail("No se pudo leer el archivo."));}
        });
    }

    private void previewDownloadedArchive(int id,Answer answer){
        requireAccount();
        File file=media.displayFile(id);
        if(file==null||!file.isFile()){answer.fail("Descarga primero el archivo.");return;}
        if(file.length()>64L*1024*1024){answer.fail("El archivo es demasiado grande para mostrar su índice.");return;}
        if(!FileViewers.extension(file).matches("zip|epub|cbz|jar")&&!FileViewers.mime(media.mimeType(id),file).equals("application/zip")){
            answer.fail("Este archivo no usa el formato ZIP.");return;
        }
        ((WrgramApplication)activity.getApplication()).storage().execute(()->{
            try(java.util.zip.ZipFile zip=new java.util.zip.ZipFile(file)){
                JSONArray entries=new JSONArray();
                java.util.Enumeration<? extends java.util.zip.ZipEntry> iterator=zip.entries();
                while(iterator.hasMoreElements()&&entries.length()<200){
                    java.util.zip.ZipEntry entry=iterator.nextElement();
                    entries.put(object("name",NativeSnapshot.limit(entry.getName(),512),"size",Math.max(0,entry.getSize()),"directory",entry.isDirectory()));
                }
                JSONObject result=object("entries",entries,"total",zip.size());
                main.post(()->{if(currentAccount()&&answer.owner==session.selfId)answer.ok(result);else answer.fail("La cuenta cambió.");});
            }catch(java.io.IOException ignored){main.post(()->answer.fail("No se pudo leer el índice del archivo."));}
        });
    }

    void exported(Uri uri){Answer a=exporting;File source=exportFile;exporting=null;exportFile=null;if(a==null)return;if(uri==null||source==null){a.ok(false);return;}if(!currentAccount()||a.owner!=session.selfId){a.fail("La cuenta cambió. No se guardó el archivo.");return;}((WrgramApplication)activity.getApplication()).storage().execute(()->{try(InputStream input=Files.newInputStream(source.toPath());OutputStream output=activity.getContentResolver().openOutputStream(uri)){if(output==null)throw new IllegalArgumentException();byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);main.post(()->a.ok(true));}catch(Exception ignored){main.post(()->a.fail("No se pudo guardar el archivo seleccionado."));}});}
    private void clearUnsent(){for(Attachment item:attachments.values())try{Files.deleteIfExists(item.path.toPath());}catch(Exception ignored){}attachments.clear();}
    WebResourceResponse mediaResponse(String path){return mediaResponse(path,null);}
    WebResourceResponse mediaResponse(String path,String range){return currentAccount()&&((WrgramApplication)activity.getApplication()).ageAccess().allowed()?media.response(path,range):ShellActivity.blocked();}
}
