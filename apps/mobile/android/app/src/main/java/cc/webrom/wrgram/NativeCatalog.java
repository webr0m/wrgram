package cc.webrom.wrgram;

import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Real TDLib selectors. Only native-registered results can become a send operation. */
final class NativeCatalog {
    final TdSession session;final NativeSnapshot dto;
    private final LinkedHashMap<String,Selection> selections=new LinkedHashMap<>();
    static final class Selection { TdApi.InputMessageContent content;long chat,query;int topic;String result;boolean premium; }
    NativeCatalog(TdSession session,NativeSnapshot dto){this.session=session;this.dto=dto;}
    void list(String tab,String query,String set,Consumer<JSONObject> success,Consumer<String> failure){
        if(!session.ready()){failure.accept("Conecta tu cuenta para cargar el catálogo real.");return;}
        final long account=session.selfId,chat=session.activeChat;
        final int topic=session.activeTopic;
        if(tab.equals("sticker")){
            session.perform(new TdApi.GetInstalledStickerSets(new TdApi.StickerTypeRegular()),value->{
                if(session.selfId!=account)return;
                JSONArray packs=new JSONArray();
                Set<Long> installed=new HashSet<>();
                try{
                    for(TdApi.StickerSetInfo info:value.sets){
                        installed.add(info.id);
                        TdApi.Sticker cover=info.covers!=null&&info.covers.length>0?info.covers[0]:null;
                        JSONObject pack=new JSONObject().put("id",Long.toString(info.id)).put("title",info.title);
                        if(cover!=null)pack.put("emoji",cover.emoji);
                        JSONObject media=info.thumbnail==null?null:dto.thumbnail(info.thumbnail,info.title);
                        if(media==null&&cover!=null)media=dto.sticker(cover);
                        packs.put(pack.put("thumbnail",media));
                    }
                }catch(Exception ignored){failure.accept("No se pudieron preparar los packs de stickers.");return;}
                loadStickers(query,set,installed,stickers->stickerResults(stickers,account,chat,topic,packs,success,failure),failure);
            },error->loadStickers(query,set,java.util.Collections.emptySet(),stickers->stickerResults(stickers,account,chat,topic,new JSONArray(),success,failure),failure));
        }else if(tab.equals("gif")){
            if(query.isEmpty())session.perform(new TdApi.GetSavedAnimations(),value->{if(session.selfId!=account)return;try{JSONArray items=new JSONArray();for(TdApi.Animation animation:value.animations){if(items.length()>=100)break;Selection selection=new Selection();selection.chat=chat;selection.topic=topic;TdApi.InputAnimation input=new TdApi.InputAnimation();input.animation=new TdApi.InputFileId(animation.animation.id);input.width=animation.width;input.height=animation.height;input.duration=animation.duration;selection.content=new TdApi.InputMessageAnimation(input,new TdApi.FormattedText("",new TdApi.TextEntity[0]),false,false);items.put(item(selection,"GIF",dto.animation(animation)));}success.accept(new JSONObject().put("items",items));}catch(Exception ignored){failure.accept("No se pudieron preparar tus GIF.");}},failure);
            else session.perform(new TdApi.GetOption("animation_search_bot_username"),option->{
                if(!(option instanceof TdApi.OptionValueString)){failure.accept("Telegram no ha configurado un bot de GIF.");return;}
                TdApi.SearchPublicChat bot=new TdApi.SearchPublicChat();bot.username=((TdApi.OptionValueString)option).value;
                session.perform(bot,userChat->{
                    if(!(userChat.type instanceof TdApi.ChatTypePrivate)){failure.accept("Bot de GIF no disponible.");return;}
                    TdApi.GetInlineQueryResults search=new TdApi.GetInlineQueryResults();search.botUserId=((TdApi.ChatTypePrivate)userChat.type).userId;search.chatId=chat;search.query=query;search.offset="";
                    session.perform(search,result->{if(session.selfId!=account)return;try{JSONArray items=new JSONArray();for(TdApi.InlineQueryResult entry:result.results)if(entry instanceof TdApi.InlineQueryResultAnimation&&items.length()<60){TdApi.InlineQueryResultAnimation animation=(TdApi.InlineQueryResultAnimation)entry;Selection selection=new Selection();selection.chat=chat;selection.topic=topic;selection.query=result.inlineQueryId;selection.result=animation.id;items.put(item(selection,"GIF",dto.animation(animation.animation)));}success.accept(new JSONObject().put("items",items));}catch(Exception ignored){failure.accept("No se pudo preparar la búsqueda de GIF.");}},failure);
                },failure);
            },failure);
        }else failure.accept("Selector no disponible.");
    }
    private void stickerResults(TdApi.Stickers value,long account,long chat,int topic,JSONArray packs,Consumer<JSONObject> success,Consumer<String> failure){
        if(session.selfId!=account)return;
        try{
            JSONArray items=new JSONArray();
            for(TdApi.Sticker sticker:value.stickers){
                if(items.length()>=100)break;
                Selection selection=new Selection();
                selection.chat=chat;
                selection.topic=topic;
                selection.premium=sticker.fullType instanceof TdApi.StickerFullTypeRegular&&((TdApi.StickerFullTypeRegular)sticker.fullType).premiumAnimation!=null;
                TdApi.InputSticker input=new TdApi.InputSticker();
                input.sticker=new TdApi.InputFileId(sticker.sticker.id);
                input.width=sticker.width;
                input.height=sticker.height;
                selection.content=new TdApi.InputMessageSticker(input,sticker.emoji);
                String label=sticker.emoji.isEmpty()?"Sticker":"Sticker "+sticker.emoji;
                items.put(item(selection,label,dto.sticker(sticker)).put("emoji",sticker.emoji).put("premium",selection.premium));
            }
            success.accept(new JSONObject().put("items",items).put("sets",packs));
        }catch(Exception ignored){failure.accept("No se pudo preparar el catálogo de stickers.");}
    }
    private void loadStickers(String query,String set,Set<Long> installed,Consumer<TdApi.Stickers> stickers,Consumer<String> failure){
        if(!query.isEmpty()){
            TdApi.SearchStickers search=new TdApi.SearchStickers();search.stickerType=new TdApi.StickerTypeRegular();search.emojis="";search.query=query;search.inputLanguageCodes=new String[]{"es","en"};search.limit=60;session.perform(search,stickers,failure);
        }else if(set.equals("premium")){
            if(!hasPremium()){failure.accept("Este catálogo requiere Telegram Premium.");return;}
            session.perform(new TdApi.GetPremiumStickers(60),stickers,failure);
        }else if(set.equals("favorites"))session.perform(new TdApi.GetFavoriteStickers(),stickers,failure);
        else if(set.isEmpty())session.perform(new TdApi.GetRecentStickers(false),stickers,failure);
        else{
            long id;try{id=Long.parseLong(set);}catch(Exception ignored){failure.accept("Pack no válido.");return;}
            if(!installed.contains(id)){failure.accept("El pack debe estar instalado en tu cuenta.");return;}
            session.perform(new TdApi.GetStickerSet(id),value->{TdApi.Stickers result=new TdApi.Stickers();result.stickers=value.stickers;stickers.accept(result);},failure);
        }
    }
    private JSONObject item(Selection selection,String label,JSONObject media)throws Exception{String key=UUID.randomUUID().toString();selections.put(key,selection);while(selections.size()>500)selections.remove(selections.keySet().iterator().next());return new JSONObject().put("key",key).put("label",label).put("media",media);}
    void send(String key,long reply,Consumer<Boolean> completed,Consumer<String> failure){
        Selection selected=selections.get(key);TdApi.Chat chat=session.chat(session.activeChat);
        if(selected==null||selected.chat!=session.activeChat||selected.topic!=session.activeTopic||chat==null||!session.canSend()||!session.canSendExpressions(chat)){failure.accept("Selección caducada o envío no permitido en este chat.");return;}
        if(selected.premium&&!hasPremium()){failure.accept("Este sticker requiere Telegram Premium.");return;}
        if(session.uncertain(session.activeChat)){failure.accept("Comprueba el envío anterior en el historial antes de volver a enviar.");return;}
        if(selected.content!=null)session.sendContent(selected.content,reply,completed);else session.sendInline(selected.query,selected.result,reply,completed);
    }
    private boolean hasPremium(){TdApi.User user=session.user(session.selfId);return user!=null&&user.isPremium;}
    void clear(){selections.clear();}
}
