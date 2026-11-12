package cc.webrom.wrgram;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.io.File;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.drinkless.tdlib.Client;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** One real account. UI state is main-thread confined; TDLib owns encrypted disk/network IO. */
final class TdSession {
    interface Listener { void changed(String kind); }
    private final Context context;
    final String slot;
    private final Map<Integer,TdApi.SecretChat> secretChats=new HashMap<>();
    private final Map<Long,TdApi.Supergroup> supergroups=new HashMap<>();
    final Map<Long,TdApi.SponsoredMessage> sponsored=new LinkedHashMap<>();
    String sponsoredError="";
    private final java.util.ArrayDeque<PendingPush> pendingPushes=new java.util.ArrayDeque<>();
    private static final class PendingPush {final String payload;final Consumer<Boolean> done;PendingPush(String payload,Consumer<Boolean> done){this.payload=payload;this.done=done;}}
    private long notificationChat, notificationMessage;
    private final Map<Long, long[]> notificationTargets = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    final TelegramCache cache;
    private final RequestTracker requests = new RequestTracker((delay, runnable) -> {
        main.postDelayed(runnable, delay); return () -> main.removeCallbacks(runnable);
    });
    private Client client;
    private Listener listener;
    private final Map<Long, TdApi.Chat> chats = new HashMap<>();
    private final Map<Long, TdApi.SavedMessagesTopic> savedTopics = new HashMap<>();
    private boolean savedTopicsEnd;
    private boolean folderTagsEnabled;
    private final Map<Long, Long> orders = new HashMap<>();
    private final Map<Long,TdApi.ChatActiveStories> activeStories=new HashMap<>();
    private TdApi.ChatList selectedList = new TdApi.ChatListMain();
    final List<TdApi.ChatFolderInfo> folders = new ArrayList<>();
    private final LinkedHashMap<Integer, TdApi.File> files = new LinkedHashMap<>(32, .75f, true);
    private final LinkedHashMap<Long, TdApi.User> users = new LinkedHashMap<>(32, .75f, true);
    private final LinkedHashMap<Long,TdApi.Message> replyMarkupMessages=new LinkedHashMap<>(16,.75f,true);
    private final LinkedHashMap<Long, HistoryWindow> windows = new LinkedHashMap<>(8, .75f, true);
    private final LinkedHashMap<String, HistoryWindow> topicWindows = new LinkedHashMap<>(4, .75f, true);
    private final Set<Long> sending = new HashSet<>();
    private final Map<Long, Long> uncertainSends = new HashMap<>();
    private long downloadsTotal, downloadsDone;
    private int downloadsCount;
    private boolean downloadsPaused;
    private int downloadActive, downloadPaused, downloadCompleted;
    private final java.util.Map<Integer,TdApi.QuickReplyShortcut> quickReplies=new java.util.TreeMap<>();
    private final java.util.Map<Integer,TdApi.QuickReplyMessage[]> quickReplyMessages=new java.util.HashMap<>();
    private int[] quickReplyOrder=new int[0];
    private boolean quickRepliesLoaded;
    private final Set<String> changes = new HashSet<>();
    private final Map<String, Long> typingUsers = new HashMap<>();
    private boolean flushScheduled, starting, connected, transportAvailable, ageClosing, backgroundClose;
    private long requestSerial, typingChat, lastTyping, sponsoredGeneration;
    private int typingTopic;
    int activeTopic;
    String activeTopicName = "";
    boolean activeTopicClosed;
    long activeTopicRead;
    private long activeTopicNewest;
    private int activeTopicUnread;
    private final Runnable typingStop = this::stopTyping;
    private final Runnable networkRefresh = this::reportNetwork;
    // El callback registrado vive en el sistema: sin guardarlo y desregistrarlo en discard(), la sesión
    // descartada queda referenciada por sus propios métodos y nunca se libera.
    private ConnectivityManager.NetworkCallback networkCallback;
    TdApi.AuthorizationState authorization;
    TdApi.StarAmount starAmount;
    String connection = "Sin conectar", error = "", notice = "";
    boolean busy, chatsBusy, chatsEnd;
    long activeChat, selfId;
    String displayName = "";

    TdSession(Context context) {
        this(context,AccountSlot.LEGACY);
    }
    TdSession(Context context,String slot) {
        this.slot=AccountSlot.validate(slot);
        this.context = context.getApplicationContext();
        cache = new TelegramCache(this);
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager != null) {
            try {
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override public void onAvailable(Network network) { main.post(TdSession.this::queueNetworkRefresh); }
                    @Override public void onLost(Network network) { main.post(TdSession.this::queueNetworkRefresh); }
                    @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { main.post(TdSession.this::queueNetworkRefresh); }
                };
                manager.registerDefaultNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) { networkCallback = null; /* TDLib will still reconnect on its own. */ }
        }
    }

    void observe(Listener value) { listener = value; }
    org.json.JSONObject notificationStatus()throws Exception{return PushNotifications.status(context);}
    void notificationStatusChanged(){emit("notifications");}
    boolean consent(){return AccountSlot.LEGACY.equals(slot)?context.getSharedPreferences("appearance",0).getBoolean("consent",false):context.getSharedPreferences("accounts",0).getBoolean("consent."+slot,false);}
    org.json.JSONObject accessState()throws org.json.JSONException{WrgramApplication app=(WrgramApplication)context;AgePolicy.Receipt receipt=app.ageAccess().receipt();return new org.json.JSONObject().put("checked",true).put("allowed",app.ageAccess().allowed()).put("blocked",app.ageAccess().blocked()).put("expiresAt",receipt==null?0:receipt.expiresAt());}
    JSONArray accessCountries()throws Exception{java.util.ArrayList<String> codes=new java.util.ArrayList<>(AgePolicy.COUNTRIES);java.util.Locale spanish=java.util.Locale.forLanguageTag("es");java.text.Collator collator=java.text.Collator.getInstance(spanish);codes.sort((a,b)->collator.compare(new java.util.Locale("",a).getDisplayCountry(spanish),new java.util.Locale("",b).getDisplayCountry(spanish)));JSONArray values=new JSONArray();for(String code:codes)values.put(new JSONObject().put("code",code).put("name",new java.util.Locale("",code).getDisplayCountry(spanish)));return values;}
    AgeAccessStore ageStore(){return ((WrgramApplication)context).ageAccess();}
    void setConsent(boolean value){if(AccountSlot.LEGACY.equals(slot))context.getSharedPreferences("appearance",0).edit().putBoolean("consent",value).apply();else context.getSharedPreferences("accounts",0).edit().putBoolean("consent."+slot,value).apply();}
    void unobserve(Listener value) { if (listener == value) listener = null; }
    boolean clientActive() { return client != null; }
    boolean observed() { return listener != null; }
    /** Closes a client opened only by the periodic contact job; a foreground screen keeps it alive. */
    void closeBackground() {
        if (client == null || listener != null || ageClosing) return;
        backgroundClose = true;
        try { client.send(new TdApi.Close(), ignored -> {}); }
        catch (RuntimeException ignored) { backgroundClose = false; }
    }
    /** Drops an unauthenticated slot: closes TDLib, forgets its preferences and deletes its data. */
    void discard() {
        cache.stop();
        requests.clear();
        main.removeCallbacks(typingStop);
        main.removeCallbacks(networkRefresh);
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        ConnectivityManager.NetworkCallback callback = networkCallback;
        networkCallback = null;
        if (manager != null && callback != null) { try { manager.unregisterNetworkCallback(callback); } catch (RuntimeException ignored) {} }
        if (client != null) { try { client.send(new TdApi.Close(), ignored -> {}); } catch (RuntimeException ignored) {} client = null; }
        listener = null;
        PushNotifications.clearReceiver(context, slot);
        context.getSharedPreferences("accounts", 0).edit().remove("user." + slot).remove("consent." + slot).apply();
        BotAccounts.clear(context, slot);
        deleteTree(new File(context.getNoBackupFilesDir(), AccountSlot.directory(slot)));
    }
    private static void deleteTree(File file) { File[] children = file.listFiles(); if (children != null) for (File child : children) deleteTree(child); file.delete(); }
    boolean ready() { return authorization instanceof TdApi.AuthorizationStateReady; }
    boolean connected() { return connected; }
    boolean sending(long chat) { return sending.contains(chat); }
    boolean uncertain(long chat) { return uncertainSends.containsKey(chat); }
    int activeStoryCount(long chatId){TdApi.ChatActiveStories value=activeStories.get(chatId);return value==null||value.stories==null?0:value.stories.length;}
    void acknowledgeUncertain(long chat) { uncertainSends.remove(chat); }
    void rememberStars(TdApi.StarAmount value) { if (value == null) return; starAmount = value; emit("stars"); }

    private void emit(String kind) {
        if (kind.equals("auth") || kind.equals("error") || kind.equals("notice")) {
            if (listener != null) listener.changed(kind);
            return;
        }
        changes.add(kind);
        if (flushScheduled) return;
        flushScheduled = true;
        main.postDelayed(() -> {
            flushScheduled = false;
            Set<String> batch = new HashSet<>(changes); changes.clear();
            if (listener != null) for (String item : batch) listener.changed(item);
        }, 80);
    }

    void start() {
        if (!ageAllowed()) { pauseForAgeGate(); return; }
        if (ageClosing) return;
        if (client != null || starting) return;
        starting = true; error = "";
        try {
            System.loadLibrary("c++_shared"); System.loadLibrary("cryptox"); System.loadLibrary("sslx"); System.loadLibrary("tdjni");
            Client.execute(new TdApi.SetLogVerbosityLevel(0));
            Client.execute(new TdApi.SetLogStream(new TdApi.LogStreamEmpty()));
            client = Client.create(update -> main.post(() -> update(update)),
                ignored -> main.post(() -> fail("El motor de Telegram encontró un error. Reinicia la aplicación.")),
                ignored -> main.post(() -> fail("La conexión se interrumpió. Revisa tu red.")));
            queueNetworkRefresh();
        } catch (Throwable ignored) {
            starting = false;
            fail("No se pudo cargar el motor nativo de Telegram en este dispositivo.");
        }
    }

    /** Refresh TDLib's network type after Android resumes or a default-network transition. */
    void onForeground() {
        if (!ageAllowed() || ageClosing) { pauseForAgeGate(); return; }
        if (!consent()) return;
        if (client == null) start();
        else queueNetworkRefresh();
    }

    private void queueNetworkRefresh() {
        if (client == null || ageClosing) return;
        main.removeCallbacks(networkRefresh);
        main.postDelayed(networkRefresh, 250);
    }

    private boolean ageAllowed() { return ((WrgramApplication) context).ageAccess().allowed(); }
    void pauseForAgeGate() {
        while(!pendingPushes.isEmpty())pendingPushes.removeFirst().done.accept(true);
        if (client == null || ageClosing) return;
        ageClosing = true; requests.clear(); main.removeCallbacks(typingStop); main.removeCallbacks(networkRefresh); typingChat = 0;
        connected = false; transportAvailable = false;
        // Close, NOT LogOut: preserve the encrypted database and remote authorization on upgrade.
        try { client.send(new TdApi.Close(), ignored -> {}); }
        catch (RuntimeException ignored) { fail("No se pudo pausar Telegram. Cierra la app antes de continuar."); }
    }

    private <T extends TdApi.Object> void request(TdApi.Function<T> function, Consumer<T> success) {
        request("operation:" + (++requestSerial), 25_000, function, success, value -> fail(safeError(value)), null);
    }
    <T extends TdApi.Object> void perform(TdApi.Function<T> function, Consumer<T> success, Consumer<String> failure) {
        if (!ready()) { failure.accept("Inicia sesión antes de usar esta función."); return; }
        request("ui:" + (++requestSerial), 25_000, function, success, value -> failure.accept(safeError(value)), null);
    }
    <T extends TdApi.Object> void performSlow(TdApi.Function<T> function, Consumer<T> success, Consumer<String> failure) {
        if (!ready()) { failure.accept("Inicia sesión antes de usar esta función."); return; }
        request("slow:" + (++requestSerial), 120_000, function, success, value -> failure.accept(safeError(value)), null);
    }
    TdApi.File mediaFile(TdApi.File file) {
        if (file == null) return null;
        TdApi.File cached = files.get(file.id);
        if (cached != null) {
            if(cached!=file){if(file.size>cached.size||cached.size==0)cached.size=file.size;if(file.expectedSize>cached.expectedSize||cached.expectedSize==0)cached.expectedSize=file.expectedSize;if(preferLocalFile(file.local,cached.local))cached.local=file.local;if(file.remote!=null)cached.remote=file.remote;}
            return cached;
        }
        files.put(file.id, file); trimFiles(); return file;
    }
    private void trimFiles(){while(files.size()>2000)files.remove(files.keySet().iterator().next());}
    private static boolean preferLocalFile(TdApi.LocalFile incoming,TdApi.LocalFile current){if(incoming==null)return false;if(current==null)return true;if(incoming.isDownloadingCompleted!=current.isDownloadingCompleted)return incoming.isDownloadingCompleted&&incoming.path!=null&&!incoming.path.isEmpty()&&new File(incoming.path).isFile();if(incoming.downloadedPrefixSize!=current.downloadedPrefixSize)return incoming.downloadedPrefixSize>current.downloadedPrefixSize;if(incoming.downloadedSize!=current.downloadedSize)return incoming.downloadedSize>current.downloadedSize;if(incoming.isDownloadingActive!=current.isDownloadingActive)return incoming.isDownloadingActive;return incoming.path!=null&&!incoming.path.isEmpty()&&(current.path==null||current.path.isEmpty());}
    void updateFile(TdApi.File update){
        if(update==null)return;
        TdApi.File current=files.get(update.id);
        // TDLib may report progress for a file whose id was already evicted from this cache.
        // Keeping the latest snapshot avoids a stale File freezing a thumbnail in "downloading".
        if(current==null){files.put(update.id,update);trimFiles();}
        else if(current!=update){current.size=update.size;current.expectedSize=update.expectedSize;if(update.local!=null)current.local=update.local;if(update.remote!=null)current.remote=update.remote;}
        emit("media");
    }

    void cacheChanged() { emit("media"); }

    @SuppressWarnings("unchecked")
    private <T extends TdApi.Object> void request(String key, long timeout, TdApi.Function<T> function,
        Consumer<T> success, Consumer<TdApi.Error> failure, Consumer<T> late) {
        if (!ageAllowed() || ageClosing) { pauseForAgeGate(); failure.accept(new TdApi.Error(403, "WRGRAM_AGE_GATE")); return; }
        Client current = client;
        if (current == null) { failure.accept(new TdApi.Error(503, "WRGRAM_OFFLINE")); return; }
        RequestTracker.Ticket ticket = requests.start(key, timeout, () -> {
            failure.accept(new TdApi.Error(408, "WRGRAM_TIMEOUT"));
        });
        try {
            current.send(function, result -> main.post(() -> {
                if (client != current) { ticket.complete(); return; }
                if (!ageAllowed() || ageClosing) { ticket.complete(); return; }
                if (!ticket.complete()) {
                    if (late != null && !(result instanceof TdApi.Error)) late.accept((T) result);
                    return;
                }
                if (result instanceof TdApi.Error) failure.accept((TdApi.Error) result);
                else success.accept((T) result);
            }));
        } catch (RuntimeException ignored) {
            if (ticket.complete()) failure.accept(new TdApi.Error(503, "WRGRAM_SEND_REQUEST_FAILED"));
        }
    }

    static String safeError(TdApi.Error value) {
        String name = value.message == null ? "" : value.message;
        if (name.startsWith("FLOOD_WAIT") || value.code == 429) return "Telegram solicita una pausa. Espera antes de volver a intentarlo; no se reintentará automáticamente.";
        if (name.contains("PHONE_CODE_INVALID")) return "El código no es válido. Revísalo en Telegram.";
        if (name.contains("PHONE_CODE_EXPIRED")) return "El código ha caducado. Reinicia el acceso.";
        if (name.contains("PASSWORD_HASH_INVALID")) return "La contraseña de verificación en dos pasos no es correcta.";
        if (name.contains("PHONE_NUMBER_INVALID")) return "Revisa el teléfono y su prefijo internacional.";
        if (name.contains("PHONE_NUMBER_BANNED")) return "Telegram no permite acceder con este número. Consulta al soporte oficial.";
        if (name.contains("CHAT_WRITE_FORBIDDEN") || name.contains("USER_BANNED_IN_CHANNEL")) return "No puedes enviar mensajes a esta conversación.";
        if (name.contains("MESSAGE_TOO_LONG")) return "El mensaje supera el límite admitido por Telegram.";
        if (value.code == 408) return "Telegram no confirmó la operación antes del límite. Puede seguir procesándola: revisa el chat o actualiza el estado antes de volver a intentarlo.";
        if (value.code == 401) return "La sesión ya no es válida. Vuelve a iniciar sesión.";
        if (value.code == 404) return "No hay más resultados disponibles.";
        return "Telegram no pudo completar la operación (" + value.code + "). Inténtalo más tarde.";
    }

    private void fail(String message) { error = message; emit("error"); }
    void clearError() { error = ""; emit("connection"); }
    private void tell(String message) { notice = message; emit("notice"); }

    private void update(TdApi.Object object) {
        boolean closed = object instanceof TdApi.UpdateAuthorizationState && ((TdApi.UpdateAuthorizationState) object).authorizationState instanceof TdApi.AuthorizationStateClosed;
        if ((!ageAllowed() || ageClosing) && !closed) { pauseForAgeGate(); return; }
        if(object instanceof TdApi.UpdateCall){((WrgramApplication)context).calls().changed(this,((TdApi.UpdateCall)object).call);return;}
        if(object instanceof TdApi.UpdateNewCallSignalingData){((WrgramApplication)context).calls().signal(this,(TdApi.UpdateNewCallSignalingData)object);return;}
        if(object instanceof TdApi.UpdateNotificationGroup){TdApi.UpdateNotificationGroup group=(TdApi.UpdateNotificationGroup)object;rememberNotificationTarget(group);PushNotifications.update(context,this,group);return;}
        if(object instanceof TdApi.UpdateSupergroup){TdApi.Supergroup group=((TdApi.UpdateSupergroup)object).supergroup;supergroups.put(group.id,group);emit("chats");}
        else if(object instanceof TdApi.UpdateFileDownloads){TdApi.UpdateFileDownloads status=(TdApi.UpdateFileDownloads)object;downloadsTotal=status.totalSize;downloadsDone=status.downloadedSize;downloadsCount=status.totalCount;}
        else if(object instanceof TdApi.UpdateFileAddedToDownloads){TdApi.UpdateFileAddedToDownloads added=(TdApi.UpdateFileAddedToDownloads)object;storeDownloadCounts(added.counts);emit("downloads");}
        else if(object instanceof TdApi.UpdateFileDownload){TdApi.UpdateFileDownload download=(TdApi.UpdateFileDownload)object;storeDownloadCounts(download.counts);emit("downloads");}
        else if(object instanceof TdApi.UpdateFileRemovedFromDownloads){TdApi.UpdateFileRemovedFromDownloads removed=(TdApi.UpdateFileRemovedFromDownloads)object;storeDownloadCounts(removed.counts);emit("downloads");}
        else if(object instanceof TdApi.UpdateSecretChat){TdApi.SecretChat secret=((TdApi.UpdateSecretChat)object).secretChat;secretChats.put(secret.id,secret);emit("chats");emit("messages");}
        else if (object instanceof TdApi.UpdateAuthorizationState) {
            authorization = ((TdApi.UpdateAuthorizationState) object).authorizationState; busy = false; error = "";
            if(!ready()){
                cache.stop();
                ((WrgramApplication)context).calls().sessionEnded(this);
            }
            if (authorization instanceof TdApi.AuthorizationStateWaitTdlibParameters) configure();
            if (ready()) {
                request("account", 12_000, new TdApi.GetMe(), me -> {
                    selfId = me.id; displayName = (me.firstName + " " + me.lastName).trim(); users.put(me.id, me);
                    cache.start();
                    context.getSharedPreferences("accounts",0).edit().putLong("user."+slot,selfId).apply();emit("account");PushNotifications.authorized(this,context);
                    while(!pendingPushes.isEmpty()){PendingPush push=pendingPushes.removeFirst();if(!PushNotifications.enabled(context)||!consent())push.done.accept(true);else perform(new TdApi.ProcessPushNotification(push.payload),ignored->push.done.accept(true),failure->push.done.accept(false));}
                    if(notificationChat!=0){long target=notificationChat,targetMessage=notificationMessage;notificationChat=0;notificationMessage=0;perform(new TdApi.GetChat(target),value->openNotification(value,targetMessage),failure->{});}
                }, value -> fail(safeError(value)), null);
                refreshChats();
            }
            if (authorization instanceof TdApi.AuthorizationStateClosed) {
                if(!ageClosing){PushNotifications.clearReceiver(context,slot);while(!pendingPushes.isEmpty())pendingPushes.removeFirst().done.accept(false);}
                boolean resumeAfterCheck = ageClosing, background = backgroundClose; ageClosing = false; backgroundClose = false;
                client = null; starting = false; connected = false; transportAvailable = false; busy = false; chatsBusy = false;
                requests.clear(); stopTyping(); chats.clear(); savedTopics.clear(); savedTopicsEnd=false; folderTagsEnabled=false; orders.clear();activeStories.clear(); users.clear(); windows.clear();topicWindows.clear();supergroups.clear();secretChats.clear();sponsored.clear();sponsoredError="";notificationChat=0;notificationMessage=0;notificationTargets.clear();quickReplies.clear();quickReplyMessages.clear();quickReplyOrder=new int[0];quickRepliesLoaded=false;
                sending.clear(); uncertainSends.clear(); typingUsers.clear(); activeChat = 0; activeTopic = 0; activeTopicName = ""; activeTopicClosed = false; activeTopicRead = 0; selfId = 0; displayName = ""; starAmount = null;
                connection = "Sin conectar"; chatsEnd = false;
                folders.clear(); files.clear(); selectedList = new TdApi.ChatListMain();
                if (!resumeAfterCheck && !background) setConsent(false);
                if ((resumeAfterCheck || listener != null) && ageAllowed() && consent()) main.post(this::start);
            }
            emit("auth");
        } else if (object instanceof TdApi.UpdateConnectionState) {
            boolean previouslyConnected = connected;
            TdApi.ConnectionState state = ((TdApi.UpdateConnectionState) object).state;
            connected = state instanceof TdApi.ConnectionStateReady;
            transportAvailable = connected || state instanceof TdApi.ConnectionStateUpdating;
            connection = connected ? "Conectado a Telegram" : state instanceof TdApi.ConnectionStateUpdating ?
                "Sincronizando en segundo plano · Puedes usar lo ya cargado" : state instanceof TdApi.ConnectionStateWaitingForNetwork ?
                "Sin red · Mensajes cargados disponibles" : "Conectando con Telegram…";
            if (!connected) { for (HistoryWindow window : windows.values()) window.stale = true; for (HistoryWindow window : topicWindows.values()) window.stale = true; }
            emit("connection");
            if (state instanceof TdApi.ConnectionStateWaitingForNetwork) main.postDelayed(networkRefresh, 1000);
            HistoryWindow current = currentWindow();
            if (connected && !previouslyConnected && ready() && current != null && !current.loading && current.stale) fetchHistory(false);
        } else if (object instanceof TdApi.UpdateUser) {
            TdApi.User user = ((TdApi.UpdateUser) object).user; users.put(user.id, user);
            while (users.size() > 2000) users.remove(users.keySet().iterator().next());
            emit("chats"); emit("messages");
        } else if (object instanceof TdApi.UpdateSavedMessagesTopic) {
            TdApi.SavedMessagesTopic topic = ((TdApi.UpdateSavedMessagesTopic) object).topic;
            if (topic.order == 0) savedTopics.remove(topic.id);
            else savedTopics.put(topic.id, topic);
        } else if (object instanceof TdApi.UpdateNewChat) {
            TdApi.Chat chat = ((TdApi.UpdateNewChat) object).chat; chats.put(chat.id, chat); updateOrder(chat.id, chat.positions); emit("chats");
        } else if (object instanceof TdApi.UpdateChatPosition) {
            TdApi.UpdateChatPosition value = (TdApi.UpdateChatPosition) object;
            TdApi.Chat chat = chats.get(value.chatId);
            if (chat != null) {
                List<TdApi.ChatPosition> positions = new ArrayList<>();
                if (chat.positions != null) for (TdApi.ChatPosition position : chat.positions) if (!sameList(position.list, value.position.list)) positions.add(position);
                positions.add(value.position); chat.positions = positions.toArray(new TdApi.ChatPosition[0]);
            }
            if (sameList(value.position.list, selectedList)) orders.put(value.chatId, value.position.order);
            emit("chats");
        } else if (object instanceof TdApi.UpdateChatLastMessage) {
            TdApi.UpdateChatLastMessage value = (TdApi.UpdateChatLastMessage) object;
            TdApi.Chat chat = chats.get(value.chatId); if (chat != null) chat.lastMessage = value.lastMessage;
            updateOrder(value.chatId, value.positions); emit("chats");
        } else if (object instanceof TdApi.UpdateChatPhoto) {
            TdApi.UpdateChatPhoto value = (TdApi.UpdateChatPhoto) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).photo = value.photo;
            emit("chats"); emit("messages");
        } else if(object instanceof TdApi.UpdateChatActiveStories){TdApi.ChatActiveStories value=((TdApi.UpdateChatActiveStories)object).activeStories;if(value!=null)activeStories.put(value.chatId,value);emit("chats");
        } else if (object instanceof TdApi.UpdateChatTitle) {
            TdApi.UpdateChatTitle value = (TdApi.UpdateChatTitle) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).title = value.title; emit("chats");
        } else if (object instanceof TdApi.UpdateChatDraftMessage) {
            TdApi.UpdateChatDraftMessage value = (TdApi.UpdateChatDraftMessage) object;
            TdApi.Chat draftChat = chats.get(value.chatId); if (draftChat != null) draftChat.draftMessage = value.draftMessage;
            updateOrder(value.chatId, value.positions); emit("chats");
        } else if (object instanceof TdApi.UpdateChatReadInbox) {
            TdApi.UpdateChatReadInbox value = (TdApi.UpdateChatReadInbox) object;
            if (chats.containsKey(value.chatId)) { TdApi.Chat changed = chats.get(value.chatId); changed.unreadCount = value.unreadCount; changed.lastReadInboxMessageId = value.lastReadInboxMessageId; } emit("chats");
            HistoryWindow readWindow = windows.get(value.chatId);
            if (readWindow != null && readWindow.anchor > 0) { readWindow.clearAnchor(value.lastReadInboxMessageId); if (readWindow.anchor == 0) emit("messages"); }
        } else if (object instanceof TdApi.UpdateForumTopic) {
            TdApi.UpdateForumTopic value = (TdApi.UpdateForumTopic) object;
            if (value.chatId == activeChat && value.forumTopicId == activeTopic) { activeTopicRead = Math.max(activeTopicRead, value.lastReadInboxMessageId); if(activeTopicRead>=activeTopicNewest)activeTopicUnread=0; emit("selected"); }
            HistoryWindow topicRead = topicWindows.get(topicKey(value.chatId, value.forumTopicId));
            if (topicRead != null && topicRead.anchor > 0) { topicRead.clearAnchor(value.lastReadInboxMessageId); if (topicRead.anchor == 0) emit("messages"); }
        } else if (object instanceof TdApi.UpdateChatReadOutbox) {
            TdApi.UpdateChatReadOutbox value = (TdApi.UpdateChatReadOutbox) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).lastReadOutboxMessageId = value.lastReadOutboxMessageId; emit("messages");
        } else if (object instanceof TdApi.UpdateChatPermissions) {
            TdApi.UpdateChatPermissions value = (TdApi.UpdateChatPermissions) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).permissions = value.permissions; emit("connection");
        } else if (object instanceof TdApi.UpdateChatMessageSender) {
            TdApi.UpdateChatMessageSender value = (TdApi.UpdateChatMessageSender) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).messageSenderId = value.messageSenderId; emit("chats");
        } else if (object instanceof TdApi.UpdateChatNotificationSettings) {
            TdApi.UpdateChatNotificationSettings value = (TdApi.UpdateChatNotificationSettings) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).notificationSettings = value.notificationSettings; emit("chats");
        } else if (object instanceof TdApi.UpdateChatIsMarkedAsUnread) {
            TdApi.UpdateChatIsMarkedAsUnread value = (TdApi.UpdateChatIsMarkedAsUnread) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).isMarkedAsUnread = value.isMarkedAsUnread; emit("chats");
        } else if (object instanceof TdApi.UpdateChatIsTranslatable) {
            TdApi.UpdateChatIsTranslatable value = (TdApi.UpdateChatIsTranslatable) object;
            if (chats.containsKey(value.chatId)) chats.get(value.chatId).isTranslatable = value.isTranslatable; emit("chats");
        } else if (object instanceof TdApi.UpdateChatReplyMarkup) {
            TdApi.UpdateChatReplyMarkup value = (TdApi.UpdateChatReplyMarkup) object;
            TdApi.Chat chat=chats.get(value.chatId);TdApi.Message source=value.replyMarkupMessage;if(chat!=null)chat.replyMarkupMessageId=source==null?0:source.id;if(source==null)replyMarkupMessages.remove(value.chatId);else{replyMarkupMessages.put(value.chatId,source);while(replyMarkupMessages.size()>200)replyMarkupMessages.remove(replyMarkupMessages.keySet().iterator().next());}emit("messages");
        } else if (object instanceof TdApi.UpdateChatFolders) {
            TdApi.UpdateChatFolders update = (TdApi.UpdateChatFolders) object;
            folders.clear(); folders.addAll(java.util.Arrays.asList(update.chatFolders));
            folderTagsEnabled = update.areTagsEnabled; emit("chats");
        } else if (object instanceof TdApi.UpdateQuickReplyShortcuts) {
            quickReplyOrder = ((TdApi.UpdateQuickReplyShortcuts) object).shortcutIds; quickRepliesLoaded = true; emit("quick");
        } else if (object instanceof TdApi.UpdateQuickReplyShortcut) {
            TdApi.QuickReplyShortcut value = ((TdApi.UpdateQuickReplyShortcut) object).shortcut;
            if (value != null) quickReplies.put(value.id, value); emit("quick");
        } else if (object instanceof TdApi.UpdateQuickReplyShortcutDeleted) {
            int removed = ((TdApi.UpdateQuickReplyShortcutDeleted) object).shortcutId;
            quickReplies.remove(removed); quickReplyMessages.remove(removed);
            java.util.List<Integer> kept = new java.util.ArrayList<>();
            for (int id : quickReplyOrder) if (id != removed) kept.add(id);
            quickReplyOrder = kept.stream().mapToInt(Integer::intValue).toArray(); emit("quick");
        } else if (object instanceof TdApi.UpdateQuickReplyShortcutMessages) {
            TdApi.UpdateQuickReplyShortcutMessages value = (TdApi.UpdateQuickReplyShortcutMessages) object;
            quickReplyMessages.put(value.shortcutId, value.messages); emit("quick");
        } else if (object instanceof TdApi.UpdateFile) {
            updateFile(((TdApi.UpdateFile) object).file);
        } else if (object instanceof TdApi.UpdateMessageIsPinned) {
            TdApi.UpdateMessageIsPinned value = (TdApi.UpdateMessageIsPinned) object;
            if (value.chatId == activeChat) emit("messages");
        } else if (object instanceof TdApi.UpdateMessageInteractionInfo) {
            TdApi.UpdateMessageInteractionInfo value = (TdApi.UpdateMessageInteractionInfo) object;
            HistoryWindow window = messageWindow(value.chatId,value.messageId); TdApi.Message message = window == null ? null : window.find(value.messageId);
            if (message != null) { message.interactionInfo = value.interactionInfo; window.put(message); emit("messages"); }
        } else if (object instanceof TdApi.UpdateNewMessage) {
            TdApi.Message message = ((TdApi.UpdateNewMessage) object).message; putMessage(message);
        } else if (object instanceof TdApi.UpdateMessageSendSucceeded) {
            TdApi.UpdateMessageSendSucceeded value = (TdApi.UpdateMessageSendSucceeded) object;
            HistoryWindow window = messageWindow(value.message.chatId,value.oldMessageId);
            if (window != null) { window.remove(value.oldMessageId); emit("messages"); }
            putMessage(value.message);
        } else if (object instanceof TdApi.UpdateMessageSendFailed) {
            TdApi.UpdateMessageSendFailed value = (TdApi.UpdateMessageSendFailed) object;
            HistoryWindow window = messageWindow(value.message.chatId,value.oldMessageId);
            if (window != null) { window.remove(value.oldMessageId); emit("messages"); }
            putMessage(value.message);
            fail("Telegram no confirmó un envío. Revisa su estado en el chat antes de volver a enviarlo.");
        } else if (object instanceof TdApi.UpdateMessageContent) {
            TdApi.UpdateMessageContent value = (TdApi.UpdateMessageContent) object;
            HistoryWindow window = messageWindow(value.chatId,value.messageId);
            if (window != null) { window.content(value.messageId, value.newContent); emit("messages"); }
        } else if (object instanceof TdApi.UpdateMessageEdited) {
            TdApi.UpdateMessageEdited value = (TdApi.UpdateMessageEdited) object;
            HistoryWindow window = messageWindow(value.chatId,value.messageId);
            TdApi.Message message = window == null ? null : window.find(value.messageId);
            if (message != null) { message.editDate = value.editDate;message.replyMarkup=value.replyMarkup; window.put(message); emit("messages"); }
        } else if (object instanceof TdApi.UpdateDeleteMessages) {
            TdApi.UpdateDeleteMessages value = (TdApi.UpdateDeleteMessages) object;
            if (value.isPermanent) { boolean changed=false; for (long id : value.messageIds) { HistoryWindow window = messageWindow(value.chatId,id); if (window != null) { window.remove(id); changed = true; } } if (changed) emit("messages"); }
        } else if (object instanceof TdApi.UpdateOwnedStarCount) {
            starAmount = ((TdApi.UpdateOwnedStarCount) object).starAmount; emit("stars");
        } else if (object instanceof TdApi.UpdateChatAction) {
            TdApi.UpdateChatAction value = (TdApi.UpdateChatAction) object;
            if (value.chatId != activeChat) return;
            String key = senderName(value.senderId);
            if (value.action instanceof TdApi.ChatActionCancel) typingUsers.remove(key);
            else { long until = SystemClock.elapsedRealtime() + 6000; typingUsers.put(key, until); main.postDelayed(() -> { if (typingUsers.getOrDefault(key, 0L) <= SystemClock.elapsedRealtime()) { typingUsers.remove(key); emit("typing"); } }, 6100); }
            emit("typing");
        }
    }

    private void configure() {
        try {
            File directory = new File(context.getNoBackupFilesDir(), AccountSlot.directory(slot));
            TdApi.SetTdlibParameters parameters = new TdApi.SetTdlibParameters();
            parameters.databaseDirectory = directory.getAbsolutePath(); parameters.filesDirectory = new File(directory, "files").getAbsolutePath();
            parameters.databaseEncryptionKey = SessionKey.load(context,slot);
            parameters.useMessageDatabase = true; parameters.useChatInfoDatabase = true; parameters.useFileDatabase = true; parameters.useSecretChats = true;
            parameters.apiId = BuildConfig.TELEGRAM_API_ID; parameters.apiHash = BuildConfig.TELEGRAM_API_HASH;
            parameters.systemLanguageCode = "es"; parameters.deviceModel = android.os.Build.MODEL;
            parameters.systemVersion = android.os.Build.VERSION.RELEASE; parameters.applicationVersion = BuildConfig.VERSION_NAME;
            request("configure", 20_000, parameters, ignored -> {}, value -> fail(safeError(value)), null);
        } catch (Exception ignored) { fail("No se pudo abrir el almacenamiento seguro. No borres los datos sin revocar antes la sesión desde Telegram oficial."); }
    }

    void authenticate(String value) {
        if (busy) return;
        error = ""; busy = true;
        Consumer<TdApi.Ok> success = ignored -> { busy = false; emit("auth-result"); };
        Consumer<TdApi.Error> failure = result -> { busy = false; fail(result.code == 408 ? "Telegram no confirmó el acceso a tiempo. Revisa el cliente oficial antes de solicitar otro código." : safeError(result)); };
        if (authorization instanceof TdApi.AuthorizationStateWaitPhoneNumber) {
            String number = value.replaceAll("[\\s()-]", "");
            if (!number.matches("\\+[1-9][0-9]{6,14}")) { busy = false; fail("Usa el prefijo internacional, por ejemplo +34 seguido de tu número."); return; }
            TdApi.SetAuthenticationPhoneNumber request = new TdApi.SetAuthenticationPhoneNumber(); request.phoneNumber = number;
            request("auth", 45_000, request, success, failure, null);
        } else if (authorization instanceof TdApi.AuthorizationStateWaitCode) {
            TdApi.CheckAuthenticationCode request = new TdApi.CheckAuthenticationCode(); request.code = value.trim(); request("auth", 30_000, request, success, failure, null);
        } else if (authorization instanceof TdApi.AuthorizationStateWaitEmailAddress) {
            String email = value.trim().toLowerCase(java.util.Locale.ROOT);
            if (!email.matches("[^@\\s]{1,64}@[^@\\s]{1,189}\\.[A-Za-z]{2,24}")) { busy = false; fail("Escribe una dirección de correo válida."); return; }
            request("auth", 45_000, new TdApi.SetAuthenticationEmailAddress(email), success, failure, null);
        } else if (authorization instanceof TdApi.AuthorizationStateWaitEmailCode) {
            if (value.trim().isEmpty()) { busy = false; fail("Escribe el código que recibiste por correo."); return; }
            TdApi.EmailAddressAuthenticationCode code = new TdApi.EmailAddressAuthenticationCode(); code.code = value.trim();
            request("auth", 30_000, new TdApi.CheckAuthenticationEmailCode(code), success, failure, null);
        } else if (authorization instanceof TdApi.AuthorizationStateWaitPassword) {
            TdApi.CheckAuthenticationPassword request = new TdApi.CheckAuthenticationPassword(); request.password = value; request("auth", 30_000, request, success, failure, null);
        } else if (authorization instanceof TdApi.AuthorizationStateWaitRegistration) {
            busy = false; fail("Completa tu nombre para terminar el registro.");
        } else { busy = false; fail("Este paso de autenticación aún no está disponible. Usa Telegram oficial."); }
    }

    void register(String firstName, String lastName) {
        if (busy) return;
        if (!(authorization instanceof TdApi.AuthorizationStateWaitRegistration)) { fail("El registro ya no está pendiente."); return; }
        String first = firstName == null ? "" : firstName.trim(), last = lastName == null ? "" : lastName.trim();
        if (first.isEmpty() || first.length() > 64 || last.length() > 64) { fail("Escribe tu nombre (obligatorio) y tu apellido (opcional)."); return; }
        error = ""; busy = true;
        request("auth", 30_000, new TdApi.RegisterUser(first, last, false), ignored -> { busy = false; emit("auth-result"); }, result -> { busy = false; fail(safeError(result)); }, null);
    }

    void requestPasswordRecovery() {
        if (busy) return;
        if (!(authorization instanceof TdApi.AuthorizationStateWaitPassword)) { fail("La recuperación solo está disponible cuando Telegram pide la contraseña."); return; }
        error = ""; busy = true;
        request("auth", 45_000, new TdApi.RequestAuthenticationPasswordRecovery(), ignored -> { busy = false; emit("auth-result"); }, result -> { busy = false; fail(safeError(result)); }, null);
    }

    void resetPassword(String code, String password, String hint) {
        if (busy) return;
        if (!(authorization instanceof TdApi.AuthorizationStateWaitPassword)) { fail("La recuperación solo está disponible cuando Telegram pide la contraseña."); return; }
        if (code == null || code.trim().isEmpty()) { fail("Falta el código de recuperación."); return; }
        if (password == null || password.isEmpty()) { fail("Escribe la nueva contraseña o déjala vacía solo si quieres quitarla."); return; }
        error = ""; busy = true;
        request("auth", 30_000, new TdApi.RecoverAuthenticationPassword(code.trim(), password, hint == null ? "" : hint.trim()), ignored -> { busy = false; emit("auth-result"); }, result -> { busy = false; fail(safeError(result)); }, null);
    }

    void resendAuthenticationCode() {
        if (busy) return;
        if (!(authorization instanceof TdApi.AuthorizationStateWaitCode || authorization instanceof TdApi.AuthorizationStateWaitEmailCode)) { fail("Ahora mismo no se puede reenviar un código."); return; }
        error = ""; busy = true;
        request("auth", 30_000, new TdApi.ResendAuthenticationCode(null), ignored -> { busy = false; notice = "Código reenviado."; emit("auth-result"); }, result -> { busy = false; fail(safeError(result)); }, null);
    }

    void requestQrAuthentication(){
        if(busy)return;
        if(!(authorization instanceof TdApi.AuthorizationStateWaitPhoneNumber||authorization instanceof TdApi.AuthorizationStateWaitCode||authorization instanceof TdApi.AuthorizationStateWaitPassword)){fail("El QR solo se puede solicitar durante el inicio de sesión.");return;}
        java.util.ArrayList<Long> ids=new java.util.ArrayList<>();for(TdSession other:((WrgramApplication)context).accounts())if(other!=this){long id=other.ready()?other.selfId:context.getSharedPreferences("accounts",0).getLong("user."+other.slot,0);if(id>0&&!ids.contains(id))ids.add(id);}
        long[] otherIds=new long[ids.size()];for(int i=0;i<ids.size();i++)otherIds[i]=ids.get(i);busy=true;emit("auth-result");
        request("auth-qr",25_000,new TdApi.RequestQrCodeAuthentication(otherIds),ignored->{busy=false;emit("auth-result");},failure->{busy=false;fail(failure.code==408?"Telegram no confirmó la solicitud QR. Puedes seguir con teléfono y código.":safeError(failure));emit("auth-result");},null);
    }

    void logOut() {
        if (client == null || authorization instanceof TdApi.AuthorizationStateLoggingOut || authorization instanceof TdApi.AuthorizationStateClosing) return;
        busy = true; stopTyping();context.getSharedPreferences("accounts",0).edit().remove("user."+slot).apply();
        BotAccounts.clear(context, slot);
        requests.cancelPrefix("auth");
        TdApi.Function<TdApi.Ok> operation = ready() ? new TdApi.LogOut() : new TdApi.Close();
        request("logout", 20_000, operation, ignored -> {}, value -> { busy = false; fail("No se confirmó el cierre. Revoca esta sesión desde Dispositivos en Telegram oficial."); }, null);
        emit("auth-result");
    }

    private void updateOrder(long id, TdApi.ChatPosition[] positions) {
        if (positions == null) return;
        TdApi.Chat chat = chats.get(id); if (chat != null) chat.positions = positions;
        for (TdApi.ChatPosition position : positions) if (sameList(position.list, selectedList)) { orders.put(id, position.order); return; }
        orders.remove(id);
    }
    static boolean sameList(TdApi.ChatList a, TdApi.ChatList b) {
        return a != null && b != null && a.getConstructor() == b.getConstructor() &&
            (!(a instanceof TdApi.ChatListFolder) || ((TdApi.ChatListFolder) a).chatFolderId == ((TdApi.ChatListFolder) b).chatFolderId);
    }
    void selectList(TdApi.ChatList list) {
        selectedList = list; requests.cancelPrefix("chat-load"); requests.cancelPrefix("chat-index"); chatsBusy = false; chatsEnd = false; orders.clear();
        for (TdApi.Chat chat : chats.values()) updateOrder(chat.id, chat.positions);
        refreshChats(); emit("chats");
    }
    TdApi.ChatList selectedList() { return selectedList; }
    String selectedListKey() {
        if (selectedList instanceof TdApi.ChatListArchive) return "archive";
        if (selectedList instanceof TdApi.ChatListFolder) return "folder:" + ((TdApi.ChatListFolder) selectedList).chatFolderId;
        return "main";
    }
    TdApi.Chat chat(long id) { return chats.get(id); }
    void rememberProfileChat(TdApi.Chat chat) { chats.putIfAbsent(chat.id, chat); }
    TdApi.User user(long id) { return users.get(id); }
    Context context(){return context;}
    TdApi.Supergroup supergroup(long id){return supergroups.get(id);}
    JSONObject downloadsStatus(){try{return new JSONObject().put("paused",downloadsPaused).put("totalCount",downloadsCount).put("totalSize",downloadsTotal).put("downloadedSize",downloadsDone);}catch(Exception ignored){return new JSONObject();}}
    private void storeDownloadCounts(TdApi.DownloadedFileCounts counts){if(counts==null)return;downloadActive=counts.activeCount;downloadPaused=counts.pausedCount;downloadCompleted=counts.completedCount;}
    JSONObject downloadCounts(){try{return new JSONObject().put("active",downloadActive).put("paused",downloadPaused).put("completed",downloadCompleted);}catch(Exception ignored){return new JSONObject();}}
    TdApi.File cachedFile(int fileId){return files.get(fileId);}
    int[] quickReplyOrder(){return quickReplyOrder;}
    java.util.Collection<TdApi.QuickReplyShortcut> quickReplies(){return quickReplies.values();}
    TdApi.QuickReplyShortcut quickReply(int id){return quickReplies.get(id);}
    TdApi.QuickReplyMessage[] quickReplyMessages(int shortcutId){return quickReplyMessages.get(shortcutId);}
    java.util.Map<Integer,TdApi.QuickReplyMessage[]> quickReplyMessageMap(){return quickReplyMessages;}
    void loadQuickReplies(){if(!quickRepliesLoaded&&ready())request("quick",8000,new TdApi.LoadQuickReplyShortcuts(),value->{},ignored->{},null);}
    void loadQuickReplyMessages(int shortcutId){if(!quickReplyMessages.containsKey(shortcutId)&&ready())request("quickM:"+shortcutId,8000,new TdApi.LoadQuickReplyShortcutMessages(shortcutId),value->{},ignored->{},null);}
    void toggleDownloads(boolean paused,Consumer<Boolean> completed){perform(new TdApi.ToggleAllDownloadsArePaused(paused),ignored->{downloadsPaused=paused;completed.accept(true);},error->{fail(error);completed.accept(false);});}
    void openNotification(TdApi.Chat chat,long messageId){
        if(chat==null)return;
        chats.put(chat.id,chat);
        if(messageId==0){open(chat.id);return;}
        final long target=messageId;
        request("notification:"+chat.id,10_000,new TdApi.GetMessage(chat.id,target),message->{
            int topic=message!=null&&message.topicId instanceof TdApi.MessageTopicForum?((TdApi.MessageTopicForum)message.topicId).forumTopicId:0;
            if(topic==0){open(chat.id,target);return;}
            perform(new TdApi.GetForumTopic(chat.id,topic),value->{
                if(activeChat==chat.id&&activeTopic==topic){open(chat.id,target);return;}
                open(chat.id);
                if(value.info!=null)openTopic(value);
                open(chat.id,target);
            },failure->open(chat.id,target));
        },failure->open(chat.id),null);
    }
    void openFromNotification(long chat,long messageId){
        if(!ageAllowed()||chat==0)return;
        long[] remembered=notificationTargets.get(chat);
        if(messageId==0&&remembered!=null)messageId=remembered[0];
        final long target=messageId;
        if(ready())perform(new TdApi.GetChat(chat),value->openNotification(value,target),failure->{});
        else{notificationChat=chat;notificationMessage=target;start();}
    }
    private void rememberNotificationTarget(TdApi.UpdateNotificationGroup group){
        if(group==null||group.addedNotifications==null)return;
        for(TdApi.Notification notification:group.addedNotifications){
            if(notification==null||!(notification.type instanceof TdApi.NotificationTypeNewMessage))continue;
            TdApi.Message message=((TdApi.NotificationTypeNewMessage)notification.type).message;
            if(message==null)continue;
            int topic=message.topicId instanceof TdApi.MessageTopicForum?((TdApi.MessageTopicForum)message.topicId).forumTopicId:0;
            if(notificationTargets.size()>200)notificationTargets.clear();
            notificationTargets.put(group.chatId,new long[]{message.id,topic});
        }
    }
    void receivePush(String payload,Consumer<Boolean> done){if(!ageAllowed()){done.accept(true);return;}if(ready())perform(new TdApi.ProcessPushNotification(payload),ignored->done.accept(true),failure->done.accept(false));else{if(pendingPushes.size()>=16){done.accept(false);return;}pendingPushes.addLast(new PendingPush(payload,done));start();}}
    boolean bot(TdApi.Chat chat) {
        if (!(chat.type instanceof TdApi.ChatTypePrivate)) return false;
        TdApi.User user = users.get(((TdApi.ChatTypePrivate) chat.type).userId); return user != null && user.type instanceof TdApi.UserTypeBot;
    }
    List<TdApi.Chat> chatList(String filter) { return chatList(filter, "all", false); }
    List<TdApi.Chat> chatList(String query, String filter, boolean alphabetic) {
        String search = query.trim().toLowerCase(Locale.ROOT);
        List<TdApi.Chat> result = new ArrayList<>();
        for (TdApi.Chat chat : chats.values()) {
            if (orders.getOrDefault(chat.id, 0L) <= 0) continue;
            if (filter.equals("unread") && chat.unreadCount == 0 && !chat.isMarkedAsUnread) continue;
            if (filter.equals("bots") && !bot(chat)) continue;
            if (chat.title.toLowerCase(Locale.ROOT).contains(search) || text(chat.lastMessage).toLowerCase(Locale.ROOT).contains(search)) result.add(chat);
        }
        if (alphabetic) { Collator collator = Collator.getInstance(new Locale("es")); result.sort((a, b) -> collator.compare(a.title, b.title)); }
        else result.sort(Comparator.<TdApi.Chat>comparingLong(chat -> orders.getOrDefault(chat.id, 0L)).reversed());
        return result;
    }

    void refreshChats() {
        if (!ready() || chatsBusy || chatsEnd) return;
        chatsBusy = true; error = ""; emit("chats");
        // Serve TDLib's indexed local chat list immediately, independently of network loading.
        fetchChats();
        TdApi.LoadChats load = new TdApi.LoadChats(); load.chatList = selectedList; load.limit = 50;
        request("chat-load", 25_000, load, ignored -> { chatsBusy = false; fetchChats(); emit("chats"); }, value -> {
            chatsBusy = false; if (value.code == 404) chatsEnd = true; else fail(safeError(value)); emit("chats");
        }, null);
    }
    private void fetchChats() {
        TdApi.GetChats get = new TdApi.GetChats(); get.chatList = selectedList; get.limit = 1000;
        request("chat-index", 5000, get, result -> {
            int missing = 0;
            for (long id : result.chatIds) if (!chats.containsKey(id) && missing++ < 8) {
                TdApi.GetChat getChat = new TdApi.GetChat(); getChat.chatId = id;
                request(getChat, chat -> { chats.put(chat.id, chat); updateOrder(chat.id, chat.positions); emit("chats"); });
            }
            emit("chats");
        }, ignored -> {}, null);
    }

    String unsupported(TdApi.Chat chat) {
        if (chat == null) return "La conversación todavía no está cargada.";
        return "";
    }
    void loadChat(long id,Consumer<TdApi.Chat> success,Consumer<String> failure){perform(new TdApi.GetChat(id),chat->{chats.put(chat.id,chat);updateOrder(chat.id,chat.positions);emit("chats");success.accept(chat);},failure);}
    File filesDirectory(){return new File(context.getNoBackupFilesDir(),AccountSlot.directory(slot)+"/files");}
    TdApi.SecretChat secret(TdApi.Chat chat){return chat!=null&&chat.type instanceof TdApi.ChatTypeSecret?secretChats.get(((TdApi.ChatTypeSecret)chat.type).secretChatId):null;}
    void createSecret(String username,Consumer<TdApi.Chat> completed,Consumer<String> failure){findPublic(username,chat->{if(!(chat.type instanceof TdApi.ChatTypePrivate)||((TdApi.ChatTypePrivate)chat.type).userId==selfId){failure.accept("Elige una persona, no un canal o tu propia cuenta.");return;}long userId=((TdApi.ChatTypePrivate)chat.type).userId;perform(new TdApi.GetUser(userId),user->{if(!(user.type instanceof TdApi.UserTypeRegular)){failure.accept("Los chats secretos solo pueden crearse con personas, no con bots.");return;}perform(new TdApi.CreateNewSecretChat(userId),created->{chats.put(created.id,created);completed.accept(created);},failure);},failure);},failure);}
    boolean canSend() {
        TdApi.Chat chat = chat(activeChat);
        if (chat == null || !ready() || selfId <= 0 || !transportAvailable || !unsupported(chat).isEmpty()) return false;
        if (chat.type instanceof TdApi.ChatTypeSecret) return ChatAccessPolicy.secretReady(secret(chat));
        boolean memberPermissions = chat.permissions == null || chat.permissions.canSendBasicMessages;
        if (chat.type instanceof TdApi.ChatTypeSupergroup) {
            TdApi.ChatTypeSupergroup type = (TdApi.ChatTypeSupergroup) chat.type;
            TdApi.Supergroup group = supergroups.get(type.supergroupId);
            // Chat.permissions describes regular members; owners and administrators may post
            // in their channels and groups even when members cannot.
            if (type.isChannel) return group != null ? ChatAccessPolicy.canPost(group) : memberPermissions;
            if (group != null && ChatAccessPolicy.isAdmin(group)) return true;
        }
        return memberPermissions;
    }
    boolean canSendExpressions(TdApi.Chat chat) {
        if(chat==null)return false;
        if(chat.type instanceof TdApi.ChatTypeSupergroup){
            TdApi.ChatTypeSupergroup type=(TdApi.ChatTypeSupergroup)chat.type;
            TdApi.Supergroup group=supergroups.get(type.supergroupId);
            if(group!=null&&(type.isChannel?ChatAccessPolicy.canPost(group):ChatAccessPolicy.isAdmin(group)))return true;
        }
        return chat.permissions==null||chat.permissions.canSendOtherMessages;
    }
    void open(long id) { open(id, 0); }
    private void ensureSupergroup(TdApi.Chat chat){
        if(chat==null||!(chat.type instanceof TdApi.ChatTypeSupergroup))return;
        final long supergroupId=((TdApi.ChatTypeSupergroup)chat.type).supergroupId;
        if(supergroupId<=0||supergroups.containsKey(supergroupId)||!ready())return;
        request("supergroup:"+supergroupId,8000,new TdApi.GetSupergroup(supergroupId),group->{supergroups.put(group.id,group);emit("chats");},ignored->{},null);
    }
    void open(long id,long messageId) {
        String unsupported = unsupported(chats.get(id)); if (!unsupported.isEmpty()) { fail(unsupported); return; }
        // UpdateSupergroup is the only source of isForum; fetch it when opening a chat so
        // the topic UI is available even if the update has not arrived in this session.
        ensureSupergroup(chats.get(id));
        if (activeChat == id) {
            if (messageId != 0) loadAround(id, messageId);
            else if (activeTopic != 0) closeTopic();
            else {
                TdApi.Chat existing = chats.get(id);
                HistoryWindow loaded = currentWindow();
                if (openAtUnread(existing)) loadUnread(id, existing);
                else if (loaded == null || !loaded.canReuseLatest(SystemClock.elapsedRealtime())) fetchHistory(false);
                else { loaded.resetAnchor(); emit("history-state"); }
            }
            return;
        }
        closeChat(); activeChat = id; activeTopic = 0; activeTopicName = ""; activeTopicClosed = false; activeTopicRead = 0; typingUsers.clear(); error = "";sponsored.clear();sponsoredError="";
        HistoryWindow window = window(id);
        TdApi.OpenChat open = new TdApi.OpenChat(); open.chatId = id;TdApi.Chat chat=chats.get(id);boolean supportsSponsored=bot(chat)||(chat.type instanceof TdApi.ChatTypeSupergroup&&((TdApi.ChatTypeSupergroup)chat.type).isChannel);long generation=++sponsoredGeneration;
        request("chat-open:" + id, 8000, open, ignored -> {if(activeChat==id&&supportsSponsored)fetchSponsoredMessages(id,0,generation);}, failure -> {if(activeChat==id&&supportsSponsored)fetchSponsoredMessages(id,0,generation);}, null);
        if (messageId != 0) loadAround(id, messageId);
        else if (openAtUnread(chat)) loadUnread(id, chat);
        else if (!window.canReuseLatest(SystemClock.elapsedRealtime())) fetchHistory(false);
        else window.resetAnchor();
        emit("selected");
    }
    private static boolean openAtUnread(TdApi.Chat chat) {
        // A private chat whose read state is still unknown reports readInbox == 0 together
        // with its unread count; refusing that case left exactly those chats opening at the bottom.
        return chat != null && chat.unreadCount > 0 && chat.lastMessage != null
                && (chat.lastReadInboxMessageId <= 0 || chat.lastReadInboxMessageId < chat.lastMessage.id);
    }
    /** Starts at the first unread message and keeps the newer messages loadable downwards. */
    private void loadUnread(long chatId, TdApi.Chat chat) {
        loadUnread(chatId, activeTopic, chat.lastReadInboxMessageId, chat.lastMessage == null ? 0 : chat.lastMessage.id, chat.unreadCount);
    }
    private void loadUnread(long chatId, int topic, long boundary, long newest, int unread) {
        final HistoryWindow window = topic == 0 ? window(chatId) : topicWindow(chatId, topic);
        final HistoryWindow.Read read = window.begin(false);
        emit("history-state");
        fetchUnreadPage(chatId, topic, boundary, newest, unread, window, read, 0);
    }
    private void fetchUnreadPage(long chatId, int topic, long boundary, long newest, int unread,
                                 HistoryWindow window, HistoryWindow.Read read, int attempt) {
        if (!window.current(read) || activeChat != chatId || activeTopic != topic) return;
        // A negative offset also returns newer messages, so asking for exactly the unread
        // ones leaves older context above the divider instead of a page that starts at it.
        final boolean hasBoundary = boundary > 0;
        final int offset = unreadOffset(unread, hasBoundary);
        TdApi.Function<TdApi.Messages> get = topic == 0
                ? historyQuery(chatId, boundary, offset, 100)
                : new TdApi.GetForumTopicHistory(chatId, topic, boundary, offset, 100);
        request("history:" + chatId + (topic == 0 ? ":unread" : ":t" + topic + ":unread"), 25_000, get, result -> {
            if (!isWindow(chatId, topic, window) || !window.current(read)) return;
            TdApi.Message[] messages = result.messages == null ? new TdApi.Message[0] : result.messages;
            if (messages.length <= 1 && unread > 1 && attempt < 2) {
                main.postDelayed(() -> fetchUnreadPage(chatId, topic, boundary, newest, unread, window, read, attempt + 1),
                        attempt == 0 ? 300 : 800);
                return;
            }
            if (!hasBoundary && messages.length > 0) {
                locateUnreadFromEnd(chatId, topic, window, read, messages, unread, true);
                return;
            }
            boolean reached = !hasBoundary || (newest > 0 && newestId(result.messages) >= newest);
            // Keep the first unread page. loadNewer() advances from this window without skipping messages.
            if (window.jump(read, messages, connected, SystemClock.elapsedRealtime(), reached, firstAfter(messages, boundary)))
                emit("history-jump");
        }, value -> { if (isWindow(chatId, topic, window) && window.failed(read, safeError(value))) emit("history-state"); }, null);
    }

    private void locateUnreadFromEnd(long chatId, int topic, HistoryWindow window, HistoryWindow.Read read,
                                     TdApi.Message[] page, int remaining, boolean atLatest) {
        if (!window.current(read) || activeChat != chatId || activeTopic != topic) return;
        int incoming = 0;
        long oldest = Long.MAX_VALUE;
        for (TdApi.Message message : page) {
            oldest = Math.min(oldest, message.id);
            if (!message.isOutgoing) incoming++;
        }
        if (incoming >= remaining || oldest == Long.MAX_VALUE) {
            if (window.jump(read, page, connected, SystemClock.elapsedRealtime(), atLatest, firstUnreadFromEnd(page, remaining)))
                emit("history-jump");
            return;
        }
        final long cursor = oldest;
        TdApi.Function<TdApi.Messages> older = topic == 0
                ? historyQuery(chatId, cursor, 0, 100)
                : new TdApi.GetForumTopicHistory(chatId, topic, cursor, 0, 100);
        final int left = remaining - incoming;
        request("history:" + chatId + (topic == 0 ? ":unread-scan" : ":t" + topic + ":unread-scan"), 25_000, older, result -> {
            if (!window.current(read)) return;
            TdApi.Message[] olderPage = result.messages == null ? new TdApi.Message[0] : java.util.Arrays.stream(result.messages)
                    .filter(message -> message != null && message.id < cursor).toArray(TdApi.Message[]::new);
            if (olderPage.length > 0) locateUnreadFromEnd(chatId, topic, window, read, olderPage, left, false);
            else if (window.jump(read, page, connected, SystemClock.elapsedRealtime(), atLatest, firstUnreadFromEnd(page, remaining)))
                emit("history-jump");
        }, error -> {
            if (window.failed(read, safeError(error))) emit("history-state");
        }, null);
    }
    /**
     * TDLib counts the boundary message itself in a negative offset, so -unread only reaches
     * the second-newest unread message. One extra message is needed to include the newest one.
     */
    static int unreadOffset(int unread, boolean hasBoundary) {
        if (!hasBoundary) return 0;
        return -Math.min(Math.max(unread, 0) + 1, 99);
    }
    private static long firstAfter(TdApi.Message[] page, long boundary) {
        long anchor = 0;
        if (page != null) for (TdApi.Message message : page) if (message != null && !message.isOutgoing && message.id > boundary && (anchor == 0 || message.id < anchor)) anchor = message.id;
        return anchor;
    }
    /** Without a read boundary the first unread is the unreadCount-th incoming message from the newest one. */
    static long firstUnreadFromEnd(TdApi.Message[] page, int unread) {
        if (page == null || page.length == 0) return 0;
        // TDLib does not guarantee the order of the page, so collect incoming ids first.
        java.util.TreeSet<Long> incoming = new java.util.TreeSet<>();
        long oldest = 0;
        for (TdApi.Message message : page) {
            if (message == null) continue;
            if (oldest == 0 || message.id < oldest) oldest = message.id;
            if (!message.isOutgoing) incoming.add(message.id);
        }
        if (incoming.isEmpty()) return oldest;
        int skip = Math.max(unread, 1) - 1;
        while (skip-- > 0 && incoming.size() > 1) incoming.pollLast();
        return incoming.last();
    }
    private static long newestId(TdApi.Message[] page) {
        long newest = 0;
        if (page != null) for (TdApi.Message message : page) if (message != null) newest = Math.max(newest, message.id);
        return newest;
    }
    private void loadAround(long chatId,long messageId){
        final int topic=activeTopic;
        final HistoryWindow window=topic==0?window(chatId):topicWindow(chatId,topic);
        final boolean firstLoad=window.size()==0;
        final HistoryWindow.Read read=window.begin(false);
        emit("history-state");
        TdApi.Function<TdApi.Messages> get=topic==0?new TdApi.GetChatHistory(chatId,messageId,0,40,false):new TdApi.GetForumTopicHistory(chatId,topic,messageId,0,40);
        request("history:"+chatId+":around",25_000,get,result->{
            boolean applied=isWindow(chatId,topic,window)&&window.jump(read,result.messages,connected,SystemClock.elapsedRealtime(),false);
            if(applied){
                if(firstLoad||window.coldRetries>0)retryShortHistory(chatId,topic,window,read,result.messages,()->loadAround(chatId,messageId));
                emit("history-jump");
            }
        },value->{if(isWindow(chatId,topic,window)&&window.failed(read,safeError(value)))emit("history-state");},null);
    }
    private void fetchSponsoredMessages(long chatId,int retry,long generation){if(activeChat!=chatId||generation!=sponsoredGeneration||!ready())return;request("sponsored:"+chatId,12_000,new TdApi.GetChatSponsoredMessages(chatId),result->{if(activeChat!=chatId||generation!=sponsoredGeneration)return;sponsored.clear();if(result.messages!=null)for(TdApi.SponsoredMessage ad:result.messages)sponsored.put(ad.messageId,ad);sponsoredError="";emit("messages");},failure->{if(activeChat!=chatId||generation!=sponsoredGeneration)return;if((failure.code==408||failure.code==429||failure.code>=500)&&retry==0){main.postDelayed(()->{if(activeChat==chatId&&generation==sponsoredGeneration&&ready())fetchSponsoredMessages(chatId,1,generation);},1800);return;}sponsored.clear();sponsoredError=failure.code==408||failure.code==429||failure.code>=500?"Los anuncios patrocinados no están disponibles ahora.":"";emit("messages");},null);}
    void retrySponsoredMessages(){TdApi.Chat chat=chats.get(activeChat);if(chat==null||!(bot(chat)||chat.type instanceof TdApi.ChatTypeSupergroup&&((TdApi.ChatTypeSupergroup)chat.type).isChannel))return;sponsoredError="";emit("messages");fetchSponsoredMessages(activeChat,0,++sponsoredGeneration);}
    void closeChat() {
        stopTyping();
        long closing = activeChat;
        sponsoredGeneration++;
        if (closing != 0 && ready()) {
            HistoryWindow window = windows.get(closing);
            if (window != null && (window.loading||window.waitingRetry)) window.invalidate();
            for (HistoryWindow topic : topicWindows.values()) if (topic.chatId == closing && (topic.loading||topic.waitingRetry)) topic.invalidate();
            requests.cancelPrefix("history:" + closing + ":");
            TdApi.CloseChat close = new TdApi.CloseChat(); close.chatId = closing;
            request("chat-close:" + closing, 8000, close, ignored -> {}, ignored -> {}, null);
        }
        activeChat = 0; activeTopic = 0; activeTopicName = ""; activeTopicClosed = false; activeTopicRead = 0; typingUsers.clear();sponsored.clear();sponsoredError="";
    }
    private HistoryWindow window(long id) {
        HistoryWindow value = windows.get(id);
        if (value == null) {
            value = new HistoryWindow(id); windows.put(id, value);
            while (windows.size() > 4) { long evicted = windows.keySet().iterator().next(); HistoryWindow removed = windows.remove(evicted); removed.invalidate(); requests.cancelPrefix("history:" + evicted + ":"); }
        }
        return value;
    }
    private static String topicKey(long chatId,int topic){return chatId+":"+topic;}
    private static int messageTopic(TdApi.Message message){return message!=null&&message.topicId instanceof TdApi.MessageTopicForum?((TdApi.MessageTopicForum)message.topicId).forumTopicId:0;}
    private HistoryWindow topicWindow(long chatId,int topic){
        String key=topicKey(chatId,topic);HistoryWindow value=topicWindows.get(key);
        if(value==null){value=new HistoryWindow(chatId);topicWindows.put(key,value);while(topicWindows.size()>6){String evicted=topicWindows.keySet().iterator().next();HistoryWindow removed=topicWindows.remove(evicted);removed.invalidate();requests.cancelPrefix("history:"+removed.chatId+":t"+evicted.substring(evicted.indexOf(':')+1)+":");}}
        return value;
    }
    private HistoryWindow messageWindow(long chatId,long messageId){
        HistoryWindow main=windows.get(chatId);if(main!=null&&main.find(messageId)!=null)return main;
        for(HistoryWindow window:topicWindows.values())if(window.chatId==chatId&&window.find(messageId)!=null)return window;
        return null;
    }
    HistoryWindow currentWindow() { if(activeChat==0)return null; return activeTopic==0?windows.get(activeChat):topicWindow(activeChat,activeTopic); }
    List<TdApi.Message> history() { HistoryWindow window = currentWindow(); return window == null ? new ArrayList<>() : window.snapshot(); }
    JSONObject topicState(){try{return new JSONObject().put("id",activeTopic).put("name",activeTopicName).put("closed",activeTopicClosed).put("readInbox",String.valueOf(activeTopicRead)).put("unread",activeTopic==0?0:activeTopicUnread).put("draft",activeTopic==0?"":activeTopicDraft).put("draftEntities",activeTopic==0?new JSONArray():activeTopicDraftEmojis);}catch(Exception ignored){return new JSONObject();}}
    TdApi.Message message(long id) { HistoryWindow window = currentWindow();TdApi.Message found=window==null?null:window.find(id);if(found!=null)return found;TdApi.Chat chat=chats.get(activeChat);if(chat!=null&&chat.lastMessage!=null&&chat.lastMessage.id==id)return chat.lastMessage;TdApi.Message markup=replyMarkupMessages.get(activeChat);return markup!=null&&markup.id==id?markup:null; }
    boolean loadingHistory() { HistoryWindow window = currentWindow(); return window != null && window.loading; }
    void loadHistory() { fetchHistory(true); }
    void refreshHistory() { fetchHistory(false); }
    void messageByDate(long chatId,int date,Consumer<TdApi.Message> found,Consumer<String> failure){
        request("history-date:"+(++requestSerial),25_000,new TdApi.GetChatMessageByDate(chatId,date),found,
                error->{if(error.code==404)found.accept(null);else failure.accept(safeError(error));},null);
    }
    private String activeTopicDraft="";
    private JSONArray activeTopicDraftEmojis=new JSONArray();
    void openTopic(TdApi.ForumTopic topic){
        TdApi.ForumTopicInfo info=topic.info;
        long lastReadInboxMessageId=topic.lastReadInboxMessageId;
        int unreadCount=topic.unreadCount;
        long newestMessageId=topic.lastMessage==null?0:topic.lastMessage.id;
        if(info==null||activeChat==0||info.chatId!=activeChat)return;
        if(activeTopic!=info.forumTopicId)invalidateTopicRead();
        activeTopicDraft=NativeSnapshot.draftText(topic.draftMessage);
        activeTopicDraftEmojis=NativeSnapshot.draftEmojis(topic.draftMessage);
        activeTopic=info.forumTopicId;activeTopicName=info.name==null||info.name.isBlank()?"Tema":info.name;activeTopicClosed=info.isClosed;activeTopicRead=lastReadInboxMessageId;
        activeTopicNewest=newestMessageId;activeTopicUnread=unreadCount;
        HistoryWindow window=topicWindow(activeChat,activeTopic);
        emit("selected");
        if(unreadCount>0&&(lastReadInboxMessageId<=0||newestMessageId>lastReadInboxMessageId))loadUnread(activeChat,activeTopic,lastReadInboxMessageId,newestMessageId,unreadCount);
        else if(window.canReuseLatest(SystemClock.elapsedRealtime())){window.resetAnchor();emit("history-jump");}
        else fetchHistory(false);
    }
    void closeTopic(){
        if(activeTopic==0){emit("selected");return;}
        invalidateTopicRead();
        activeTopic=0;activeTopicName="";activeTopicClosed=false;activeTopicRead=0;emit("selected");
        HistoryWindow window=windows.get(activeChat);
        if(window==null||!window.loaded||window.stale||window.waitingRetry)fetchHistory(false);else emit("history-jump");
    }
    private void invalidateTopicRead(){
        if(activeTopic==0)return;
        HistoryWindow window=topicWindows.get(topicKey(activeChat,activeTopic));
        if(window!=null&&(window.loading||window.waitingRetry))window.invalidate();
        requests.cancelPrefix("history:"+activeChat+":t"+activeTopic+":");
    }
    void topicClosed(int topic,boolean closed){if(activeTopic==topic){activeTopicClosed=closed;emit("selected");}}
    void topicRenamed(int topic,String name){if(activeTopic==topic&&name!=null&&!name.isBlank()){activeTopicName=name;emit("selected");}}
    void topicDeleted(int topic){
        if(activeChat==0)return;
        HistoryWindow removed=topicWindows.remove(topicKey(activeChat,topic));if(removed!=null){removed.invalidate();requests.cancelPrefix("history:"+activeChat+":t"+topic+":");}
        if(activeTopic==topic){activeTopic=0;activeTopicName="";activeTopicClosed=false;activeTopicRead=0;emit("selected");fetchHistory(false);}
    }
    private boolean isWindow(long chatId,int topic,HistoryWindow window){
        return topic==0?windows.get(chatId)==window:topicWindows.get(topicKey(chatId,topic))==window;
    }
    private void fetchHistory(boolean older) {
        if (!ready() || activeChat == 0) return;
        final int topic=activeTopic;
        final HistoryWindow window = currentWindow();
        if (window == null || window.loading || (older && window.end)) {
            return;
        }
        final boolean firstLoad = !window.loaded;
        final HistoryWindow.Read read = window.begin(older);
        final long id = activeChat;
        emit("history-state");
        if(topic==0){
            TdApi.GetChatHistory local = historyQuery(id, read.cursor, true);
            request("history:" + id + ":local", 1500, local, result -> {
                boolean same = isWindow(id,topic,window);
                boolean applied = same && window.local(read, result.messages);
                if (applied) emit("history-local");
            }, value -> {}, null);
        }
        TdApi.Function<TdApi.Messages> remote = topic==0?historyQuery(id, read.cursor, false):new TdApi.GetForumTopicHistory(id,topic,read.cursor,0,40);
         request("history:" + id + (topic==0?":remote":":t"+topic+":remote"), 25_000, remote, result -> {
            boolean same = isWindow(id,topic,window);
            boolean applied = same && window.remote(read, result.messages, connected, SystemClock.elapsedRealtime());
            if (applied) {
                if (!older && (firstLoad || window.coldRetries > 0)) {
                    retryShortHistory(id, topic, window, read, result.messages, () -> fetchHistory(false));
                }
                emit(older ? "history-older" : "history-latest");
            }
        }, value -> {
            boolean same = isWindow(id,topic,window);
            boolean applied = same && window.failed(read, safeError(value));
            if (applied) emit("history-state");
        }, null);
    }
    /**
     * TDLib opens each chat's message database lazily, and a history query issued at the same
     * time as the first open can return only the newest message. Such a page looks complete
     * (it is the live tail), so nothing would ever request the missing history again. Retry
     * briefly while the window is still empty or holding that single message.
     */
    private void retryShortHistory(long chatId, int topic, HistoryWindow window, HistoryWindow.Read read, TdApi.Message[] page, Runnable reload) {
        if (page != null && page.length > 1) return;
        if (window.coldRetries >= 3) return;
        long delay = window.coldRetries == 0 ? 300 : window.coldRetries == 1 ? 800 : 1_600;
        window.coldRetries++;
        window.waitingRetry=true;
        main.postDelayed(() -> {
            if (!isWindow(chatId, topic, window) || !window.current(read)) return;
            if(activeChat==chatId&&activeTopic==topic)reload.run();
            else window.invalidate();
        }, delay);
    }
    private static TdApi.GetChatHistory historyQuery(long id, long cursor, boolean local) {
        TdApi.GetChatHistory get = historyQuery(id, cursor, 0, 40); get.onlyLocal = local; return get;
    }
    private static TdApi.GetChatHistory historyQuery(long id, long cursor, int offset, int limit) {
        TdApi.GetChatHistory get = new TdApi.GetChatHistory(); get.chatId = id; get.fromMessageId = cursor; get.offset = offset; get.limit = limit; return get;
    }
    /** Loads the next chunk below a window that was opened at the unread boundary. */
    void loadNewer() {
        if (!ready() || activeChat == 0) return;
        final int topic = activeTopic;
        final HistoryWindow window = currentWindow();
        if (window == null || window.loading || window.latest || window.newerEnd) return;
        final HistoryWindow.Read read = window.beginNewer();
        final long id = activeChat;
        final TdApi.Chat chat = chats.get(id);
        final long newest = topic != 0 ? activeTopicNewest : chat != null && chat.lastMessage != null ? chat.lastMessage.id : 0;
        emit("history-state");
        TdApi.Function<TdApi.Messages> remote = topic == 0
                ? historyQuery(id, read.cursor, -40, 40)
                : new TdApi.GetForumTopicHistory(id, topic, read.cursor, -40, 40);
        request("history:" + id + (topic == 0 ? ":newer" : ":t" + topic + ":newer"), 25_000, remote, result -> {
            if (!isWindow(id, topic, window)) return;
            boolean reached = newest > 0 && newestId(result.messages) >= newest;
            if (window.newer(read, result.messages, connected, SystemClock.elapsedRealtime(), reached, newest > read.cursor)) emit("history-newer");
        }, value -> {
            if (isWindow(id, topic, window) && window.failed(read, safeError(value))) emit("history-state");
        }, null);
    }
    void putMessage(TdApi.Message message) {
        int topic=messageTopic(message);
        if(topic!=0&&message.chatId==activeChat&&topic==activeTopic&&message.id>activeTopicNewest){
            activeTopicNewest=message.id;
            if(!message.isOutgoing)activeTopicUnread++;
        }
        HistoryWindow window = topic==0?windows.get(message.chatId):topicWindows.get(topicKey(message.chatId,topic));
        if (window != null) { window.put(message); emit("messages"); }
    }

    void sendText(String text, long replyTo, Consumer<Boolean> completed) { sendText(text, replyTo, 0, false, completed); }

    void sendText(String text, long replyTo, long scheduleAt, Consumer<Boolean> completed) { sendText(text, replyTo, scheduleAt, false, completed); }

    void sendText(String text, long replyTo, long scheduleAt, boolean silent, Consumer<Boolean> completed) { sendText(text, new TdApi.TextEntity[0], replyTo, scheduleAt, silent, false, completed); }

    void sendText(String text, TdApi.TextEntity[] entities, long replyTo, long scheduleAt, boolean silent, boolean clearDraft, Consumer<Boolean> completed) {
        sendText(text,entities,replyTo,scheduleAt,0,silent,clearDraft,completed);
    }

    void sendText(String text, TdApi.TextEntity[] entities, long replyTo, long scheduleAt, int repeatPeriod, boolean silent, boolean clearDraft, Consumer<Boolean> completed) {
        if (entities == null) entities = new TdApi.TextEntity[0];
        if (!canSend() || text.trim().isEmpty() || text.length() > 4096 || sending.contains(activeChat)) { fail("Revisa el texto, los permisos y el estado del envío."); completed.accept(false); return; }
        TdApi.Chat current = chats.get(activeChat);
        long now = System.currentTimeMillis() / 1000;
        if(repeatPeriod!=0){
            TdApi.User self=user(selfId);
            if(scheduleAt<=0||self==null||!self.isPremium||!Set.of(86400,604800,1209600,2592000,7862400,15724800,31536000).contains(repeatPeriod)){
                fail("Elige una fecha y un intervalo admitido con Telegram Premium.");completed.accept(false);return;
            }
        }
        if (scheduleAt != 0) {
            if (current != null && current.type instanceof TdApi.ChatTypeSecret) { fail("Los chats secretos no admiten mensajes programados."); completed.accept(false); return; }
            if (scheduleAt > 0 && (scheduleAt < now + 5 || scheduleAt > now + 367L * 86400L)) { fail("Elige una hora entre ahora y los próximos 367 días."); completed.accept(false); return; }
        }
        final long chat = activeChat, attempt = ++requestSerial; sending.add(chat); stopTyping(); emit("sending");
        TdApi.InputMessageText content = new TdApi.InputMessageText(); content.text = new TdApi.FormattedText(text, entities);content.clearDraft=clearDraft;
        if(current!=null&&current.type instanceof TdApi.ChatTypeSecret){content.linkPreviewOptions=new TdApi.LinkPreviewOptions();content.linkPreviewOptions.isDisabled=true;}
        TdApi.SendMessage send = new TdApi.SendMessage(); send.chatId = chat; send.inputMessageContent = content;
        if (activeTopic != 0) send.topicId = new TdApi.MessageTopicForum(activeTopic);
        if (scheduleAt != 0 || silent) {
            send.options = new TdApi.MessageSendOptions();
            send.options.disableNotification = silent;
            if (scheduleAt < 0) send.options.schedulingState = new TdApi.MessageSchedulingStateSendWhenOnline();
            else if (scheduleAt != 0) send.options.schedulingState = new TdApi.MessageSchedulingStateSendAtDate((int)scheduleAt,repeatPeriod);
        }
        if (replyTo != 0) { TdApi.InputMessageReplyToMessage reply = new TdApi.InputMessageReplyToMessage(); reply.messageId = replyTo; send.replyTo = reply; }
        request("send:" + chat, 25_000, send, message -> {
            sending.remove(chat); uncertainSends.remove(chat, attempt); putMessage(message); emit("sending"); completed.accept(true);
        }, value -> {
            sending.remove(chat);
            if (value.code == 408) { uncertainSends.put(chat, attempt); fail("El envío no se confirmó a tiempo. Puede llegar todavía: revisa el historial antes de reenviar. No se reintentó automáticamente."); }
            else fail(safeError(value));
            emit("sending"); completed.accept(false);
        }, message -> { putMessage(message); uncertainSends.remove(chat, attempt); emit("sending"); });
    }
    void sendText(String text, Consumer<Boolean> completed) { sendText(text, 0, 0, completed); }

    void sendContent(TdApi.InputMessageContent content, long replyTo, Consumer<Boolean> completed) { sendContent(content, replyTo, false, completed); }

    void sendContent(TdApi.InputMessageContent content, long replyTo, boolean silent, Consumer<Boolean> completed) {
        if (!canSend() || sending.contains(activeChat)) { fail("Comprueba la conexión y los permisos de envío."); completed.accept(false); return; }
        final long chat = activeChat, attempt = ++requestSerial; sending.add(chat); stopTyping(); emit("sending");
        TdApi.SendMessage send = new TdApi.SendMessage(); send.chatId = chat; send.inputMessageContent = content;
        if (activeTopic != 0) send.topicId = new TdApi.MessageTopicForum(activeTopic);
        if (silent) { send.options = new TdApi.MessageSendOptions(); send.options.disableNotification = true; }
        if (replyTo != 0) { TdApi.InputMessageReplyToMessage reply = new TdApi.InputMessageReplyToMessage(); reply.messageId = replyTo; send.replyTo = reply; }
        request("send:" + chat, 25_000, send, message -> {
            sending.remove(chat); uncertainSends.remove(chat, attempt); putMessage(message); emit("sending"); completed.accept(true);
        }, value -> {
            sending.remove(chat); if (value.code == 408) uncertainSends.put(chat, attempt);
            fail(value.code == 408 ? "Envío sin confirmar. Puede llegar todavía; comprueba el historial antes de repetirlo." : safeError(value)); emit("sending"); completed.accept(false);
        }, message -> { putMessage(message); uncertainSends.remove(chat, attempt); emit("sending"); });
    }

    void sendAlbum(java.util.List<TdApi.InputMessageContent> contents, long replyTo, boolean silent, long scheduleAt, Consumer<Boolean> completed) {
        if (!canSend() || contents == null || contents.size() < 2 || contents.size() > 10 || sending.contains(activeChat)) { fail("Elige entre 2 y 10 fotos y revisa el estado del envío."); completed.accept(false); return; }
        TdApi.Chat current = chats.get(activeChat);
        long now = System.currentTimeMillis() / 1000;
        if (scheduleAt != 0) {
            if (current != null && current.type instanceof TdApi.ChatTypeSecret) { fail("Los chats secretos no admiten mensajes programados."); completed.accept(false); return; }
            if (scheduleAt > 0 && (scheduleAt < now + 5 || scheduleAt > now + 367L * 86400L)) { fail("Elige una hora entre ahora y los próximos 367 días."); completed.accept(false); return; }
        }
        final long chat = activeChat, attempt = ++requestSerial; sending.add(chat); stopTyping(); emit("sending");
        TdApi.SendMessageAlbum send = new TdApi.SendMessageAlbum(); send.chatId = chat; send.inputMessageContents = contents.toArray(new TdApi.InputMessageContent[0]);
        if (activeTopic != 0) send.topicId = new TdApi.MessageTopicForum(activeTopic);
        if (silent || scheduleAt != 0) {
            send.options = new TdApi.MessageSendOptions(); send.options.disableNotification = silent;
            if (scheduleAt < 0) send.options.schedulingState = new TdApi.MessageSchedulingStateSendWhenOnline();
            else if (scheduleAt != 0) { TdApi.MessageSchedulingStateSendAtDate at = new TdApi.MessageSchedulingStateSendAtDate(); at.sendDate = (int) scheduleAt; send.options.schedulingState = at; }
        }
        if (replyTo != 0) { TdApi.InputMessageReplyToMessage reply = new TdApi.InputMessageReplyToMessage(); reply.messageId = replyTo; send.replyTo = reply; }
        request("send:" + chat, 60_000, send, messages -> {
            sending.remove(chat); uncertainSends.remove(chat, attempt);
            if (messages.messages != null) for (TdApi.Message message : messages.messages) putMessage(message);
            emit("sending"); completed.accept(true);
        }, value -> {
            sending.remove(chat); if (value.code == 408) uncertainSends.put(chat, attempt);
            fail(value.code == 408 ? "Envío sin confirmar. Puede llegar todavía; comprueba el historial antes de repetirlo." : safeError(value)); emit("sending"); completed.accept(false);
        }, messages -> {
            if (messages.messages != null) for (TdApi.Message message : messages.messages) putMessage(message);
            uncertainSends.remove(chat, attempt); emit("sending");
        });
    }

    void sendInline(long queryId,String resultId,long replyId,Consumer<Boolean> completed) {
        if(!canSend()||sending.contains(activeChat)){completed.accept(false);return;}
        long chat=activeChat,attempt=++requestSerial;sending.add(chat);emit("sending");
        TdApi.SendInlineQueryResultMessage send=new TdApi.SendInlineQueryResultMessage();send.chatId=chat;send.queryId=queryId;send.resultId=resultId;if(activeTopic!=0)send.topicId=new TdApi.MessageTopicForum(activeTopic);
        if(replyId!=0){TdApi.InputMessageReplyToMessage reply=new TdApi.InputMessageReplyToMessage();reply.messageId=replyId;send.replyTo=reply;}
        request("send:"+chat,25_000,send,message->{sending.remove(chat);uncertainSends.remove(chat,attempt);putMessage(message);emit("sending");completed.accept(true);},value->{sending.remove(chat);if(value.code==408)uncertainSends.put(chat,attempt);fail(value.code==408?"Envío sin confirmar: comprueba el historial antes de repetirlo.":safeError(value));emit("sending");completed.accept(false);},message->{putMessage(message);uncertainSends.remove(chat,attempt);emit("sending");});
    }

    void markRead() {
        HistoryWindow window = currentWindow(); long id = window == null ? 0 : window.newestConfirmedId();
        if (!ready() || activeChat == 0 || id == 0) return;
        markReadThrough(id);
    }
    boolean markVisibleRead(long id) {
        HistoryWindow window=currentWindow();
        TdApi.Message message=window==null?null:window.find(id);
        if(!ready()||message==null||message.isOutgoing||message.sendingState!=null)return false;
        markReadThrough(id);
        return true;
    }
    private void markReadThrough(long id) {
        TdApi.ViewMessages view = new TdApi.ViewMessages(); view.chatId = activeChat; view.messageIds = new long[]{id}; view.forceRead = true; view.source = activeTopic==0?new TdApi.MessageSourceChatHistory():new TdApi.MessageSourceForumTopicHistory();
        final long readChat=activeChat,finalId=id;final int readTopic=activeTopic;
        request(view, ignored -> {if(activeChat==readChat&&activeTopic==readTopic&&readTopic!=0&&finalId>activeTopicRead){activeTopicRead=finalId;if(finalId>=activeTopicNewest)activeTopicUnread=0;emit("selected");}});
    }
    void properties(TdApi.Message message, Consumer<TdApi.MessageProperties> result) {
        TdApi.GetMessageProperties get = new TdApi.GetMessageProperties(); get.chatId = message.chatId; get.messageId = message.id; request(get, result);
    }
    void edit(TdApi.Message message, String text) { edit(message, text, new TdApi.TextEntity[0]); }

    void edit(TdApi.Message message, String text, TdApi.TextEntity[] entities) {
        if (text.trim().isEmpty() || text.length() > 4096) { fail("Texto no válido."); return; }
        TdApi.EditMessageText edit = new TdApi.EditMessageText(); TdApi.InputMessageText content = new TdApi.InputMessageText();
        content.text = new TdApi.FormattedText(text, entities == null ? new TdApi.TextEntity[0] : entities); edit.chatId = message.chatId; edit.messageId = message.id; edit.inputMessageContent = content;
        request(edit, updated -> { putMessage(updated); tell("Telegram confirmó la edición."); });
    }
    void editCaption(TdApi.Message message, String caption) { editCaption(message, caption, new TdApi.TextEntity[0]); }

    void editCaption(TdApi.Message message, String caption, TdApi.TextEntity[] entities) {
        if (caption.length() > 1024) { fail("El texto del archivo no puede superar 1024 caracteres."); return; }
        TdApi.EditMessageCaption edit = new TdApi.EditMessageCaption(); edit.chatId = message.chatId; edit.messageId = message.id;
        edit.caption = new TdApi.FormattedText(caption, entities == null ? new TdApi.TextEntity[0] : entities);
        request(edit, updated -> { putMessage(updated); tell("Telegram confirmó el texto del archivo."); });
    }
    void delete(TdApi.Message message) { delete(message, false); }
    void delete(TdApi.Message message, boolean revoke) {
        TdApi.DeleteMessages delete = new TdApi.DeleteMessages(); delete.chatId = message.chatId; delete.messageIds = new long[]{message.id}; delete.revoke = revoke;
        request(delete, ignored -> { HistoryWindow window = messageWindow(message.chatId,message.id); if (window != null) window.remove(message.id); emit("messages"); tell(revoke ? "Mensaje eliminado para todos." : "Mensaje eliminado para ti."); });
    }
    void deleteMessages(long chatId, long[] ids, boolean revoke, Consumer<Boolean> completed) {
        if (!ready() || ids == null || ids.length == 0 || ids.length > 100) { fail("Selecciona entre 1 y 100 mensajes."); completed.accept(false); return; }
        TdApi.DeleteMessages delete = new TdApi.DeleteMessages(); delete.chatId = chatId; delete.messageIds = ids; delete.revoke = revoke;
        request("delete:" + ids.length + ":" + (++requestSerial), 30_000, delete, ignored -> {
            for (long id : ids) { HistoryWindow window = messageWindow(chatId,id); if (window != null) window.remove(id); }
            emit("messages"); tell(revoke ? "Mensajes eliminados para todos." : "Mensajes eliminados para ti."); completed.accept(true);
        }, value -> { fail(safeError(value)); completed.accept(false); }, null);
    }
    void forwardMessages(long to, long[] ids, Consumer<Boolean> completed) {
        forwardMessages(to, ids, null, false, false, completed);
    }
    void forwardMessages(long to, long[] ids, TdApi.MessageSendOptions options, boolean sendCopy, boolean removeCaption, Consumer<Boolean> completed) {
        if (!ready() || activeChat == 0 || ids == null || ids.length == 0 || ids.length > 100) { fail("Selecciona entre 1 y 100 mensajes."); completed.accept(false); return; }
        TdApi.ForwardMessages forward = new TdApi.ForwardMessages(); forward.chatId = to; forward.fromChatId = activeChat; forward.messageIds = ids;
        forward.options = options; forward.sendCopy = sendCopy; forward.removeCaption = removeCaption && sendCopy;
        request("forward:" + to + ":" + (++requestSerial), 40_000, forward, messages -> {
            int failed = messages.messages == null ? 0 : (int) java.util.Arrays.stream(messages.messages).filter(message -> message == null).count();
            if (failed > 0) fail("Telegram no pudo reenviar " + failed + " mensaje(s). Comprueba el destino antes de repetirlo.");
            emit("messages"); completed.accept(failed == 0);
        }, value -> { fail(safeError(value)); completed.accept(false); }, null);
    }
    void saved(Consumer<TdApi.Chat> completed) {
        saved(completed, this::fail);
    }
    List<TdApi.SavedMessagesTopic> savedTopics() {
        List<TdApi.SavedMessagesTopic> topics = new ArrayList<>(savedTopics.values());
        topics.sort(Comparator.comparingLong((TdApi.SavedMessagesTopic topic) -> topic.order).reversed()
                .thenComparing(Comparator.comparingLong((TdApi.SavedMessagesTopic topic) -> topic.id).reversed()));
        return topics;
    }
    boolean savedTopicsEnd() { return savedTopicsEnd; }
    boolean folderTagsEnabled() { return folderTagsEnabled; }
    boolean hasSavedTopic(long id) { return savedTopics.containsKey(id); }
    void loadSavedTopics(Runnable complete, Consumer<String> failure) {
        if (savedTopicsEnd) { complete.run(); return; }
        request("saved-topics:" + (++requestSerial), 25_000, new TdApi.LoadSavedMessagesTopics(40), value -> complete.run(), error -> {
            if (error.code == 404) { savedTopicsEnd = true; complete.run(); }
            else failure.accept(safeError(error));
        }, null);
    }
    void saved(Consumer<TdApi.Chat> completed, Consumer<String> failure) {
        if (!ready() || selfId == 0) { failure.accept("La cuenta todavía está cargando. Reintenta en unos segundos."); return; }
        TdApi.CreatePrivateChat create = new TdApi.CreatePrivateChat(); create.userId = selfId;
        request("saved:" + (++requestSerial), 25_000, create, chat -> { chats.put(chat.id, chat); completed.accept(chat); }, value -> failure.accept(safeError(value)), null);
    }
    void findPublic(String username, Consumer<TdApi.Chat> completed) {
        findPublic(username,completed,this::fail);
    }
    void findPublic(String username, Consumer<TdApi.Chat> completed,Consumer<String> failure) {
        String value = username.trim().replaceFirst("^@", "");
        if (!value.matches("[A-Za-z0-9_]{3,32}")) { failure.accept("Introduce un @usuario válido, sin enlaces ni teléfono."); return; }
        TdApi.SearchPublicChat search = new TdApi.SearchPublicChat(); search.username = value;
         request("public-search:"+value+":"+(++requestSerial), 25_000, search, chat -> { chats.put(chat.id, chat); completed.accept(chat); }, valueError -> failure.accept(safeError(valueError)), null);
    }
    static String senderKind(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) return "user";
        if (sender instanceof TdApi.MessageSenderChat) return "chat";
        return "other";
    }
    static long senderId(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) return ((TdApi.MessageSenderUser) sender).userId;
        if (sender instanceof TdApi.MessageSenderChat) return ((TdApi.MessageSenderChat) sender).chatId;
        return 0;
    }
    String senderName(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) {
            long id = ((TdApi.MessageSenderUser) sender).userId; if (id == selfId) return "Tú";
            TdApi.User user = users.get(id); return user == null ? "Usuario de Telegram" : (user.firstName + " " + user.lastName).trim();
        }
        if (sender instanceof TdApi.MessageSenderChat) { TdApi.Chat chat = chats.get(((TdApi.MessageSenderChat) sender).chatId); return chat == null ? "Conversación" : chat.title; }
        return "Telegram";
    }
    TdApi.File senderPhoto(TdApi.MessageSender sender){if(sender instanceof TdApi.MessageSenderUser){TdApi.User user=users.get(((TdApi.MessageSenderUser)sender).userId);return user!=null&&user.profilePhoto!=null?user.profilePhoto.small:null;}if(sender instanceof TdApi.MessageSenderChat){TdApi.Chat chat=chats.get(((TdApi.MessageSenderChat)sender).chatId);return chat!=null&&chat.photo!=null?chat.photo.small:null;}return null;}
    String typingLabel() { return typingUsers.isEmpty() ? "" : String.join(", ", typingUsers.keySet()) + " escribiendo…"; }
    void typing(boolean active) {
        if (!active || !canSend()) { stopTyping(); return; }
        main.removeCallbacks(typingStop); main.postDelayed(typingStop, 5000);
        long now = SystemClock.elapsedRealtime(); if (typingChat == activeChat && now - lastTyping < 4000) return;
        typingChat = activeChat; typingTopic = activeTopic; lastTyping = now; sendAction(typingChat, typingTopic, new TdApi.ChatActionTyping());
    }
    void stopTyping() {
        main.removeCallbacks(typingStop); long previous = typingChat; int topic = typingTopic; typingChat = 0; typingTopic = 0; lastTyping = 0;
        if (previous != 0 && client != null && ready()) sendAction(previous, topic, new TdApi.ChatActionCancel());
    }
    private void sendAction(long chat, int topic, TdApi.ChatAction action) {
        TdApi.SendChatAction request = new TdApi.SendChatAction(); request.chatId = chat; request.action = action;
        if (topic != 0) request.topicId = new TdApi.MessageTopicForum(topic);
        request("typing:" + chat, 5000, request, ignored -> {}, ignored -> {}, null);
    }
    void retry() { error = ""; queueNetworkRefresh(); refreshChats(); refreshHistory(); emit("connection"); }
    static TdApi.NetworkType networkType(boolean hasActiveNetwork,boolean hasInternet,boolean wifi,boolean mobile) {
        if (!hasActiveNetwork || !hasInternet) return new TdApi.NetworkTypeNone();
        if (wifi) return new TdApi.NetworkTypeWiFi();
        if (mobile) return new TdApi.NetworkTypeMobile();
        return new TdApi.NetworkTypeOther();
    }
    private void reportNetwork() {
        if (client == null) return;
        TdApi.NetworkType type;
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network network = manager == null ? null : manager.getActiveNetwork();
            NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
            type = networkType(network != null, capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
                capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
                capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
        } catch (RuntimeException ignored) { type = new TdApi.NetworkTypeOther(); /* Leave transport detection to TDLib. */ }
        TdApi.SetNetworkType set = new TdApi.SetNetworkType(); set.type = type;
        request("network", 5000, set, ignored -> {}, ignored -> {}, null);
    }

    static String text(TdApi.Message message) {
        return text(message, null);
    }

    static String text(TdApi.Message message, TdSession session) {
        if (message == null) return "Sin mensajes";
        String service = ServiceMessages.text(message, session); if (service != null) return service;
        if (message.selfDestructType != null || message.ephemeralContent != null) return "Contenido temporal · ábrelo en Telegram oficial";
        if (message.content instanceof TdApi.MessageText) return ((TdApi.MessageText) message.content).text.text;
        if (message.content instanceof TdApi.MessagePhoto) return ((TdApi.MessagePhoto)message.content).caption==null||((TdApi.MessagePhoto)message.content).caption.text.isEmpty()?"Foto":((TdApi.MessagePhoto)message.content).caption.text;
        if (message.content instanceof TdApi.MessageVideo) return ((TdApi.MessageVideo)message.content).caption==null||((TdApi.MessageVideo)message.content).caption.text.isEmpty()?"Vídeo":((TdApi.MessageVideo)message.content).caption.text;
        if (message.content instanceof TdApi.MessageDocument) return ((TdApi.MessageDocument)message.content).document.fileName==null||((TdApi.MessageDocument)message.content).document.fileName.isEmpty()?"Documento":((TdApi.MessageDocument)message.content).document.fileName;
        if (message.content instanceof TdApi.MessageAnimation) return ((TdApi.MessageAnimation)message.content).caption==null||((TdApi.MessageAnimation)message.content).caption.text.isEmpty()?"GIF":((TdApi.MessageAnimation)message.content).caption.text;
        if (message.content instanceof TdApi.MessageVoiceNote) return "Nota de voz";
        if (message.content instanceof TdApi.MessageSticker) return ((TdApi.MessageSticker)message.content).sticker.emoji==null?"Sticker":((TdApi.MessageSticker)message.content).sticker.emoji;
        if (message.content instanceof TdApi.MessageGift) { TdApi.MessageGift gift=(TdApi.MessageGift)message.content; return gift.text==null||gift.text.text==null||gift.text.text.isEmpty()?"Regalo de Telegram":gift.text.text; }
        if (message.content instanceof TdApi.MessageRichMessage) { String summary=RichMessages.summary((TdApi.MessageRichMessage)message.content); return summary.isEmpty()?"Mensaje con formato de Telegram":summary; }
        if (message.content instanceof TdApi.MessageChecklist) {
            TdApi.Checklist list = ((TdApi.MessageChecklist) message.content).list;
            String title = list == null || list.title == null || list.title.text == null ? "" : list.title.text.trim();
            return title.isEmpty() ? "Lista de tareas" : "Lista de tareas · " + title;
        }
        return "Mensaje no compatible todavía · ábrelo en Telegram oficial";
    }
}
