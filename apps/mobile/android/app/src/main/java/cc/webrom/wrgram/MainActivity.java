package cc.webrom.wrgram;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.lifecycle.ViewModel;
import androidx.lifecycle.ViewModelProvider;
import androidx.lifecycle.MutableLiveData;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;

/** Native client: recycled lists, cache-first history, scoped tools and an independent assistant. */
public final class MainActivity extends AccessActivity implements TdSession.Listener {
    public static final class ScreenState extends ViewModel {
        String page = "home", returnPage = "home", query = "", filter = "all", messageQuery = "", assistantDraft = "";
        boolean alphabetic, messageSearch;
        long account;
        final Map<Long, String> drafts = new HashMap<>();
        final Map<Long, Long> replies = new HashMap<>();
        final MutableLiveData<Long> completedSends = new MutableLiveData<>();
        void clear() { drafts.clear(); replies.clear(); query = ""; messageQuery = ""; messageSearch = false; assistantDraft = ""; account = 0; page = "home"; }
    }
    interface IoTask<T> { T run() throws Exception; }
    Palette palette;
    ScreenState screen;
    private SharedPreferences preferences;
    private TdSession telegram;
    private NativeMediaStore mediaStore;
    private AssistantController assistant;
    private AssistantScreen assistantScreen;
    private final Runnable assistantChanged = () -> { if (assistantScreen != null && screen != null && screen.page.equals("assistant")) assistantScreen.update(); };
    private final Handler main = new Handler(Looper.getMainLooper());
    private final DateFormat messageDates = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT);
    private LinearLayout root, errorBox, historyBox, replyBox;
    private FrameLayout host;
    private AppLockScreen lockScreen;
    private TextView status, alert, empty, historyStatus, replyText, typingLabel, searchCount;
    private EditText authInput, composer, searchInput;
    private Button authButton, sendButton, moreChats, older, refresh, jump;
    private RecyclerView chatList, timeline;
    private ConversationAdapter chatAdapter, messageAdapter;
    private long composerChat, shownChat, renderToken, readAnchor;
    private int renderedAuthorization, messageGeneration;
    private boolean visible;
    private final Runnable searchChats = this::fillChats;
    private final Runnable searchMessages = () -> fillMessages("search");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (!requireAccess()) return;
        if(!AppLock.enabled(this))AppLock.setUnlocked(true);
        host = new FrameLayout(this);
        lockScreen = new AppLockScreen(this, this::onAppUnlocked);
        preferences = getSharedPreferences("appearance", MODE_PRIVATE);
        screen = new ViewModelProvider(this).get(ScreenState.class);
        if ("assistant".equals(getIntent().getStringExtra("page"))) screen.page = "assistant";
        else if ("settings".equals(getIntent().getStringExtra("page"))) screen.page = "settings";
        WrgramApplication app = (WrgramApplication) getApplication(); telegram = app.telegram(); assistant = app.assistant();mediaStore=new NativeMediaStore(this,telegram);
        screen.completedSends.observe(this, id -> {
            if (composer != null && composerChat == id && telegram.selfId == screen.account) {
                String draft = screen.drafts.getOrDefault(id, "");
                if (!composer.getText().toString().equals(draft)) composer.setText(draft);
                updateReply(); refreshSend();
            }
        });
        if (telegram.activeChat != 0 && screen.page.equals("home")) screen.page = "chat";
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { back(); } });
        telegram.observe(this);
        if (telegram.consent()) telegram.onForeground();
        render();
    }
    @Override protected void onStart() {
        super.onStart(); AppLock.activityStarted(this);
        if(lockScreen!=null&&AppLock.disableIfUnavailable(this)){Toast.makeText(this,R.string.app_lock_removed,Toast.LENGTH_LONG).show();}
        if(lockScreen!=null){if(AppLock.isUnlocked())lockScreen.hide();else lockScreen.show(false);}
        if (telegram == null || !requireAccess()) return;
        if(telegram!=((WrgramApplication)getApplication()).telegram()){telegram.unobserve(this);composer=null;screen.clear();recreate();return;}
        visible = true; telegram.observe(this); telegram.onForeground();
        if (telegram.authorization instanceof TdApi.AuthorizationStateClosed) { composer = null; screen.clear(); assistant.clear(); }
        boolean accountChanged = telegram.selfId > 0 && screen.account != telegram.selfId;
        if (accountChanged) { composer = null; screen.drafts.clear(); screen.replies.clear(); screen.account = telegram.selfId; }
        assistant.observe(assistantChanged);
        int current = telegram.authorization == null ? 0 : telegram.authorization.getConstructor();
        if (current != renderedAuthorization || accountChanged) render();
        else { if (screen.page.equals("home")) fillChats(); if (screen.page.equals("chat")) fillMessages("resume"); refreshStatus(); }
    }
    @Override protected void onResume() {
        super.onResume();
        if(lockScreen!=null){if(AppLock.isUnlocked())lockScreen.hide();else lockScreen.show(true);}
    }
    @Override protected void onStop() {
        AppLock.activityStopped(!isChangingConfigurations()&&(lockScreen==null||!lockScreen.authenticating()));
        if (telegram != null) { telegram.stopTyping(); telegram.unobserve(this); assistant.unobserve(assistantChanged); } visible = false; super.onStop();
    }
    private void onAppUnlocked(){if(telegram!=null)telegram.onForeground();}
    @Override protected void onDestroy() { main.removeCallbacks(searchChats); main.removeCallbacks(searchMessages);if(mediaStore!=null)mediaStore.clear(); super.onDestroy(); }
    @Override public boolean onKeyUp(int key, KeyEvent event) {
        if (event.isCtrlPressed() && key == KeyEvent.KEYCODE_K && telegram.ready()) { showPage("home"); if (searchInput != null) searchInput.requestFocus(); return true; }
        if (key == KeyEvent.KEYCODE_ESCAPE) { back(); return true; }
        return super.onKeyUp(key, event);
    }
    private void back() {
        if(!AppLock.isUnlocked()){moveTaskToBack(true);return;}
        if (screen.page.equals("chat") && screen.messageSearch) { screen.messageSearch = false; screen.messageQuery = ""; render(); return; }
        if (screen.page.equals("chat")) { telegram.closeChat(); screen.page = "home"; render(); }
        else if (!screen.page.equals("home")) {
            screen.page = screen.returnPage.equals("chat") && telegram.activeChat != 0 ? "chat" : "home"; screen.returnPage = "home";
            if (screen.page.equals("home")) telegram.closeChat(); render();
        } else moveTaskToBack(true);
    }
    private void showPage(String page) {
        telegram.stopTyping();
        screen.returnPage = screen.page.equals("chat") ? "chat" : "home";
        if (page.equals("home")) { telegram.closeChat(); screen.returnPage = "home"; }
        screen.page = page; render();
        if (page.equals("assistant")) assistant.status();
    }
    @Override public void changed(String kind) {
        if (!visible || isFinishing() || isDestroyed()) return;
        if (kind.equals("auth")) {
            if (telegram.authorization instanceof TdApi.AuthorizationStateClosed) { composer = null; screen.clear(); assistant.clear();if(mediaStore!=null)mediaStore.clear(); }
            int current = telegram.authorization == null ? 0 : telegram.authorization.getConstructor();
            if (current != renderedAuthorization) render();
        } else if (kind.equals("account")) {
            if (screen.account != telegram.selfId) { screen.drafts.clear(); screen.replies.clear(); screen.account = telegram.selfId; }
            if (screen.page.equals("plugins") || screen.page.equals("settings")) render();
        } else if (kind.equals("notice")) showToast(telegram.notice);
        else if(kind.equals("media")){if(chatAdapter!=null)chatAdapter.notifyItemRangeChanged(0,chatAdapter.getItemCount());if(messageAdapter!=null)messageAdapter.notifyItemRangeChanged(0,messageAdapter.getItemCount());refreshStatus();}
        else {
            if (screen.page.equals("home") && kind.equals("chats")) fillChats();
            if (screen.page.equals("chat") && (kind.equals("messages") || kind.startsWith("history"))) fillMessages(kind);
        }
        refreshStatus();
    }

    int dp(float value) { return (int) (value * getResources().getDisplayMetrics().density + .5f); }
    private int font() { int value = preferences.getInt("font", 16); return value == 14 || value == 18 ? value : 16; }
    private boolean compact() { return preferences.getBoolean("compact", false); }
    GradientDrawable shape(int color, int radius) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable; }
    TextView text(String content, float size, int color) { TextView view = new TextView(this); view.setText(content); view.setTextSize(size); view.setTextColor(color); view.setLineSpacing(dp(3), 1f); return view; }
    LinearLayout column() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    LinearLayout row() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.HORIZONTAL); view.setGravity(Gravity.CENTER_VERTICAL); return view; }
    void padded(View view, int horizontal, int vertical) { view.setPadding(dp(horizontal), dp(vertical), dp(horizontal), dp(vertical)); }
    void gap(LinearLayout layout, int height) { layout.addView(new View(this), new LinearLayout.LayoutParams(1, dp(height))); }
    Button button(String label, boolean primary, Runnable action) {
        Button button = new Button(this); button.setText(label); button.setAllCaps(false); button.setTextSize(13); button.setMinHeight(dp(48));
        button.setTextColor(primary ? palette.onAccent : palette.accent); button.setBackground(shape(primary ? palette.accent : palette.soft, 11));
        padded(button, 12, 9); button.setOnClickListener(view -> action.run()); return button;
    }
    EditText input(String hint, int type, int maximum) {
        EditText input = new EditText(this); input.setTextSize(font()); input.setTextColor(palette.ink); input.setHintTextColor(palette.muted);
        input.setHint(hint); input.setContentDescription(hint); input.setInputType(type); input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maximum)});
        input.setBackground(shape(palette.surface, 12)); padded(input, 14, 12); input.setMinHeight(dp(50)); input.setSaveEnabled(false);
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS); input.setImeOptions(input.getImeOptions() | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING); return input;
    }
    static TextWatcher watcher(Consumer<String> changed) { return new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence value, int start, int before, int count) { changed.accept(value.toString()); }
        @Override public void afterTextChanged(Editable editable) {}
    }; }

    private void render() {
        ++renderToken;
        palette = Palette.get(this);
        getWindow().setStatusBarColor(palette.canvas);getWindow().setNavigationBarColor(palette.canvas);
        root = column(); root.setBackgroundColor(palette.canvas);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime()); view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        host.removeAllViews();host.addView(root,new FrameLayout.LayoutParams(-1,-1));if(lockScreen!=null)lockScreen.install(host);setContentView(host); root.requestApplyInsets();
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getDecorView().getWindowInsetsController() != null) getWindow().getDecorView().getWindowInsetsController().setSystemBarsAppearance(
            palette.dark ? 0 : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        composer = null; authInput = null; authButton = null; chatList = null; timeline = null; chatAdapter = null; messageAdapter = null;
        historyBox = null; typingLabel = null; assistantScreen = null; searchInput = null; empty = null; moreChats = null; sendButton = null;
        renderedAuthorization = telegram.authorization == null ? 0 : telegram.authorization.getConstructor();
        if (screen.page.equals("settings")) settings();
        else if (screen.page.equals("plugins")) plugins();
        else if (screen.page.equals("assistant")) { assistantScreen = new AssistantScreen(this, assistant); assistantScreen.build(); }
        else if (!telegram.ready()) authentication();
        else if (screen.page.equals("chat") && telegram.activeChat != 0) conversation();
        else { screen.page = "home"; home(); }
        navigation(); refreshStatus();
    }
    void header(String title, boolean back) {
        LinearLayout bar = row(); padded(bar, 12, 8); bar.setBackgroundColor(palette.surface);
        if (back) { Button previous = button("‹", false, this::back); previous.setContentDescription("Volver"); bar.addView(previous, new LinearLayout.LayoutParams(dp(48), dp(48))); }
        else { ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.brand_foreground); logo.setBackground(shape(0xff111214, 12)); logo.setContentDescription("Icono de WRGram"); bar.addView(logo, new LinearLayout.LayoutParams(dp(42), dp(42))); }
        TextView heading = text(title, 21, palette.ink); heading.setTypeface(null, Typeface.BOLD); heading.setSingleLine(true); heading.setEllipsize(android.text.TextUtils.TruncateAt.END); padded(heading, 12, 0); bar.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
        if (screen.page.equals("chat")) heading.setOnClickListener(view -> info());
        Button menu = button("⋮", false, () -> { if (screen.page.equals("chat")) chatMenu(); else mainMenu(); }); menu.setContentDescription(screen.page.equals("chat") ? "Herramientas del chat" : "Más opciones"); bar.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(48))); root.addView(bar);
        status = text("", 11, palette.muted); padded(status, 16, 5); root.addView(status);
        errorBox = column(); padded(errorBox, 12, 5); errorBox.setBackgroundColor(palette.soft); alert = text("", 13, palette.ink); alert.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); errorBox.addView(alert);
        LinearLayout actions = row(); actions.addView(button("Reintentar", false, () -> { if (telegram.ready()) telegram.retry(); else telegram.start(); })); actions.addView(button("Cerrar aviso", false, telegram::clearError)); errorBox.addView(actions); root.addView(errorBox);
    }
    LinearLayout scrollBody() { ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); LinearLayout body = column(); padded(body, 20, 14); scroll.addView(body); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); return body; }
    private void navigation() {
        LinearLayout bar = row(); padded(bar, 4, 5); bar.setBackgroundColor(palette.surface);
        String[] labels = {"Mensajes", "Guardados", "Extras", "WR IA", "Ajustes"};
        Runnable[] actions = {() -> showPage("home"), this::saved, () -> showPage("plugins"), () -> showPage("assistant"), () -> showPage("settings")};
        for (int i = 0; i < labels.length; i++) {
            Button item = button(labels[i], false, actions[i]); item.setTextSize(10); item.setMinWidth(0); item.setMinimumWidth(0); padded(item, 2, 8); item.setContentDescription(i == 2 ? "Complementos" : labels[i]);
            String page = new String[]{"home", "saved", "plugins", "assistant", "settings"}[i];
            if (screen.page.equals(page)) { item.setBackground(shape(palette.accent, 10)); item.setTextColor(palette.onAccent); }
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1); params.setMargins(dp(2), 0, dp(2), 0); bar.addView(item, params);
        }
        root.addView(bar);
    }
    private RecyclerView recycler(ConversationAdapter adapter) {
        RecyclerView list = new RecyclerView(this); list.setLayoutManager(new LinearLayoutManager(this)); list.setAdapter(adapter); list.setItemAnimator(null); list.setClipToPadding(false); list.setPadding(0, dp(4), 0, dp(8)); root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1)); return list;
    }

    private void authentication() {
        header("WRGram", false); LinearLayout body = scrollBody(); gap(body, 12);
        body.addView(text("ANDROID · BETA CERRADA", 11, palette.accent)); gap(body, 14);
        TextView title = text("Tu espacio.\nConectado de verdad.", 30, palette.ink); title.setTypeface(null, Typeface.BOLD); body.addView(title); gap(body, 14);
        body.addView(text("Cliente no oficial e independiente de Telegram. TDLib y mensajes reales, sin chats de demostración.", 14, palette.muted)); gap(body, 16);
        if (!telegram.consent() || telegram.authorization instanceof TdApi.AuthorizationStateClosed) {
            body.addView(text("La sesión se cifra en este dispositivo con una clave protegida por Android Keystore. Los códigos y la contraseña se envían directamente a Telegram; no se registran ni se comparten con WR IA.", 14, palette.muted)); gap(body, 12);
            CheckBox consent = checkbox("Entiendo que es una beta y acepto iniciar una sesión real.", false, null); body.addView(consent); gap(body, 12);
            Button connect = button("Conectar Telegram", true, () -> { telegram.setConsent(true);telegram.start();render(); }); connect.setEnabled(false); consent.setOnCheckedChangeListener((button, checked) -> connect.setEnabled(checked)); body.addView(connect);
        } else {
            TdApi.AuthorizationState state = telegram.authorization; String label = null; int type = InputType.TYPE_CLASS_TEXT;
            if (state instanceof TdApi.AuthorizationStateWaitPhoneNumber) { label = "Teléfono con prefijo internacional"; type = InputType.TYPE_CLASS_PHONE; }
            else if (state instanceof TdApi.AuthorizationStateWaitCode) { label = "Código de acceso de Telegram"; type = InputType.TYPE_CLASS_NUMBER; }
            else if (state instanceof TdApi.AuthorizationStateWaitPassword) { label = "Contraseña de verificación en dos pasos"; type |= InputType.TYPE_TEXT_VARIATION_PASSWORD; }
            if (label != null) {
                body.addView(text(label, 15, palette.ink)); gap(body, 8); authInput = input(label, type, state instanceof TdApi.AuthorizationStateWaitPassword ? 256 : 32); body.addView(authInput); gap(body, 12);
                body.addView(text("El código puede llegar a Telegram oficial, no necesariamente por SMS. Introduce el dato solo aquí: nunca lo compartas con el agente o el desarrollador.", 12, palette.muted)); gap(body, 14);
                authButton = button(state instanceof TdApi.AuthorizationStateWaitPhoneNumber ? "Solicitar código" : "Verificar y continuar", true, () -> { String value = authInput.getText().toString(); authInput.setText(""); telegram.authenticate(value); refreshStatus(); }); body.addView(authButton);
            } else body.addView(text(state == null || state instanceof TdApi.AuthorizationStateWaitTdlibParameters ? "Preparando conexión segura…" : state instanceof TdApi.AuthorizationStateClosing || state instanceof TdApi.AuthorizationStateLoggingOut ? "Cerrando sesión…" : "Telegram pide un paso aún no soportado (correo, registro o condiciones). Complétalo en el cliente oficial.", 14, palette.accent));
            gap(body, 14); body.addView(button("Cancelar acceso / cerrar sesión", false, this::confirmLogout));
        }
        gap(body, 16); body.addView(button("Privacidad y límites", false, this::privacy));
    }

    private void home() {
        header("Mensajes", false);
        LinearLayout searchBox = column(); padded(searchBox, 12, 8); searchInput = input("Buscar chats cargados", InputType.TYPE_CLASS_TEXT, 100); searchInput.setText(screen.query);
        searchInput.addTextChangedListener(watcher(value -> { screen.query = value; main.removeCallbacks(searchChats); main.postDelayed(searchChats, 140); })); searchBox.addView(searchInput);
        LinearLayout filters = row(); String[] names = {"Todos", "No leídos", "Bots", screen.alphabetic ? "A–Z ✓" : "A–Z"}; String[] ids = {"all", "unread", "bots"};
        for (int i = 0; i < names.length; i++) { final int choice = i; Button filter = button(names[i], i < 3 && screen.filter.equals(ids[i]), () -> { if (choice == 3) screen.alphabetic = !screen.alphabetic; else screen.filter = ids[choice]; render(); }); filter.setTextSize(11); filter.setMinWidth(0); filter.setMinimumWidth(0); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1); params.setMargins(dp(2), dp(6), dp(2), 0); filters.addView(filter, params); }
        searchBox.addView(filters); root.addView(searchBox);
        empty = text("", 13, palette.muted); padded(empty, 18, 10); root.addView(empty);
        chatAdapter = new ConversationAdapter(palette,font(),compact(),this::openChat,this,mediaStore); chatList = recycler(chatAdapter); chatList.setContentDescription("Conversaciones reales de Telegram");
        moreChats = button("Cargar más conversaciones", false, () -> { telegram.refreshChats(); refreshStatus(); }); LinearLayout bottom = column(); padded(bottom, 12, 5); bottom.addView(moreChats); root.addView(bottom);
        fillChats();
    }
    private void fillChats() {
        if (chatAdapter == null || !screen.page.equals("home")) return;
        List<ConversationAdapter.Row> rows = new ArrayList<>();
        for (TdApi.Chat chat : telegram.chatList(screen.query, screen.filter, screen.alphabetic)) {
            String initials = chat.title.isEmpty() ? "W" : chat.title.substring(0, chat.title.offsetByCodePoints(0, 1)).toUpperCase(Locale.ROOT);
            rows.add(new ConversationAdapter.Row(chat.id,chat.title,TdSession.text(chat.lastMessage,telegram),telegram.bot(chat)?"Bot":"",initials,true,false,chat.unreadCount,chat.photo==null?null:chat.photo.small,null,"image/jpeg"));
        }
        chatAdapter.submitList(rows);
        if (empty != null) { empty.setText(rows.isEmpty() ? telegram.chatsBusy ? "Cargando chats sin bloquear la interfaz…" : "Sin coincidencias en los chats cargados. Cambia el filtro o carga más." : ""); empty.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE); }
        refreshStatus();
    }
    private void openChat(long id) {
        TdApi.Chat chat = telegram.chat(id); String unsupported = telegram.unsupported(chat);
        if(chat!=null&&(chat.type instanceof TdApi.ChatTypeSecret||chat.type instanceof TdApi.ChatTypeSupergroup&&((TdApi.ChatTypeSupergroup)chat.type).isChannel)){showInfo("Canales y chats secretos requieren la nueva interfaz con Android System WebView actualizado. Esta vista de compatibilidad no los abre.");return;}
        if (!unsupported.isEmpty()) { showInfo(unsupported); return; }
        screen.messageQuery = ""; screen.messageSearch = false; shownChat = 0; telegram.open(id); screen.page = "chat"; screen.returnPage = "home"; render();
    }
    private void saved() {
        if (!telegram.ready()) { showPage("home"); showToast("Inicia sesión para abrir tus Mensajes guardados reales."); return; }
        telegram.saved(chat -> { if (!isDestroyed()) openChat(chat.id); });
    }
    private void newChat() {
        if (!telegram.ready()) { showInfo("Inicia sesión antes de buscar una conversación real."); return; }
        EditText username = input("@usuario de Telegram", InputType.TYPE_CLASS_TEXT, 33);
        Dialogs.builder(this).setTitle("Abrir por nombre de usuario").setMessage("Solo busca y abre una conversación real. No envía mensajes ni invitaciones.")
            .setView(username).setNegativeButton("Cancelar", null).setPositiveButton("Buscar", (dialog, which) -> telegram.findPublic(username.getText().toString(), chat -> { if (!isDestroyed()) openChat(chat.id); })).show();
    }

    private void conversation() {
        TdApi.Chat chat = telegram.chat(telegram.activeChat); header(chat == null ? "Conversación" : chat.title, true);
        LinearLayout actions = row(); actions.addView(button("↻", false, telegram::refreshHistory)); actions.addView(button("Buscar", false, () -> { screen.messageSearch = !screen.messageSearch; screen.messageQuery = ""; render(); })); actions.addView(button("Herramientas", false, this::tools)); actions.addView(button("Info", false, this::info)); HorizontalScrollView toolbar = new HorizontalScrollView(this); toolbar.setHorizontalScrollBarEnabled(false); toolbar.addView(actions); root.addView(toolbar);
        if (screen.messageSearch) {
            EditText search = input("Buscar en mensajes cargados", InputType.TYPE_CLASS_TEXT, 100); search.setText(screen.messageQuery);
            search.addTextChangedListener(watcher(value -> { screen.messageQuery = value; main.removeCallbacks(searchMessages); main.postDelayed(searchMessages, 140); })); root.addView(search); searchCount = text("", 12, palette.muted); padded(searchCount, 14, 4); root.addView(searchCount);
        } else searchCount = null;
        historyBox = column(); padded(historyBox, 12, 4); historyStatus = text("", 12, palette.muted); historyStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); historyBox.addView(historyStatus);
        LinearLayout controls = row(); older = button("Mensajes anteriores", false, telegram::loadHistory); refresh = button("Actualizar / Reintentar", false, telegram::refreshHistory); controls.addView(older); controls.addView(refresh); historyBox.addView(controls); root.addView(historyBox);
         messageAdapter = new ConversationAdapter(palette,font(),compact(),this::messageMenu,this,mediaStore); timeline = recycler(messageAdapter); timeline.setContentDescription("Mensajes reales de Telegram");
        timeline.addOnScrollListener(new RecyclerView.OnScrollListener() { @Override public void onScrolled(RecyclerView view, int dx, int dy) {
            if (jump != null) jump.setVisibility(view.canScrollVertically(1) ? View.VISIBLE : View.GONE);
            HistoryWindow window = telegram.currentWindow();
            if (view.canScrollVertically(1) || window == null || window.loading) return;
            if (!window.latest) { telegram.loadNewer(); return; }
            if (window.anchor > 0 && readAnchor != window.anchor) { readAnchor = window.anchor; telegram.markRead(); }
        } });
        jump = button("↓ Ir al último mensaje", false, () -> {
            HistoryWindow window = telegram.currentWindow();
            if (window != null && !window.latest) { shownChat = 0; telegram.refreshHistory(); }
            else if (messageAdapter != null && messageAdapter.getItemCount() > 0) timeline.scrollToPosition(messageAdapter.getItemCount() - 1);
        }); root.addView(jump); jump.setVisibility(View.GONE);
        typingLabel = text("", 11, palette.muted); padded(typingLabel, 14, 3); root.addView(typingLabel);
        replyBox = row(); padded(replyBox, 12, 4); replyText = text("", 12, palette.accent); replyBox.addView(replyText, new LinearLayout.LayoutParams(0, -2, 1)); replyBox.addView(button("×", false, () -> { screen.replies.remove(telegram.activeChat); updateReply(); })); root.addView(replyBox);
        LinearLayout compose = row(); padded(compose, 10, 6); compose.setBackgroundColor(palette.surface); composerChat = telegram.activeChat;
        Button emoji = button("☺", false, this::emoji); emoji.setContentDescription("Insertar emoji"); emoji.setMinWidth(0); emoji.setMinimumWidth(0); padded(emoji, 4, 6); compose.addView(emoji, new LinearLayout.LayoutParams(dp(40), dp(48)));
        composer = input("Escribe un mensaje real…", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, 4096); composer.setMaxLines(5); composer.setText(screen.drafts.getOrDefault(composerChat, ""));
        final long owner = composerChat; composer.addTextChangedListener(watcher(value -> { screen.drafts.put(owner, value); if (preferences.getBoolean("typing", true)) telegram.typing(!value.trim().isEmpty()); refreshSend(); }));
        composer.setOnFocusChangeListener((view, focus) -> { if (!focus) telegram.stopTyping(); });
        composer.setOnKeyListener((view, key, event) -> { if (preferences.getBoolean("enter", false) && key == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN && !event.isShiftPressed() && event.getDeviceId() != KeyCharacterMap.VIRTUAL_KEYBOARD) { send(); return true; } return false; });
        compose.addView(composer, new LinearLayout.LayoutParams(0, -2, 1)); sendButton = button("Enviar", true, this::send); compose.addView(sendButton); root.addView(compose);
        updateReply(); fillMessages("open");
    }
    private void fillMessages(String kind) {
        if (messageAdapter == null || timeline == null || !screen.page.equals("chat")) return;
        final long chatId = telegram.activeChat, token = renderToken; final int generation = ++messageGeneration;
        final ConversationAdapter adapter = messageAdapter; final RecyclerView list = timeline;
        LinearLayoutManager manager = (LinearLayoutManager) list.getLayoutManager();
        boolean firstChat = shownChat != chatId; boolean nearBottom = !list.canScrollVertically(1);
        int position = manager == null ? -1 : manager.findFirstVisibleItemPosition();
        long anchorId = position >= 0 && position < adapter.getItemCount() ? adapter.row(position).id : 0;
        View anchor = manager == null || position < 0 ? null : manager.findViewByPosition(position); int offset = anchor == null ? 0 : anchor.getTop();
        List<ConversationAdapter.Row> rows = new ArrayList<>(); String query = screen.messageQuery.trim().toLowerCase(Locale.ROOT); TdApi.Chat chat = telegram.chat(chatId);
        for (TdApi.Message message : telegram.history()) {
            String body = TdSession.text(message,telegram); if (!query.isEmpty() && !body.toLowerCase(Locale.ROOT).contains(query)) continue;
            if (message.replyTo instanceof TdApi.MessageReplyToMessage) {
                TdApi.MessageReplyToMessage reply = (TdApi.MessageReplyToMessage) message.replyTo; TdApi.Message original = reply.chatId == 0 || reply.chatId == chatId ? telegram.message(reply.messageId) : null;
                body = "↪ " + (original == null ? "Respuesta a otro mensaje" : excerpt(TdSession.text(original,telegram), 90)) + "\n" + body;
            }
            String delivery = message.sendingState instanceof TdApi.MessageSendingStatePending ? " · Enviando…" : message.sendingState instanceof TdApi.MessageSendingStateFailed ? " · Fallido" : message.isOutgoing ?
                chat != null && chat.type instanceof TdApi.ChatTypePrivate && ((TdApi.ChatTypePrivate) chat.type).userId != telegram.selfId && message.id <= chat.lastReadOutboxMessageId ? " · Leído ✓✓" : " · Confirmado ✓" : "";
            String metadata = messageDates.format(new Date(message.date * 1000L)) + (message.editDate > 0 ? " · Editado" : "") + delivery;
            Preview preview=preview(message.content);rows.add(new ConversationAdapter.Row(message.id,telegram.senderName(message.senderId),body,metadata,"",false,message.isOutgoing,0,null,preview==null?null:preview.file,preview==null?null:preview.mime));
        }
        shownChat = chatId;
        if (firstChat) readAnchor = 0;
        HistoryWindow opened = telegram.currentWindow();
        long unreadAnchor = firstChat && opened != null ? opened.anchor : 0;
        boolean bottom = unreadAnchor == 0 && !screen.messageSearch && !kind.equals("history-older") && !kind.equals("search") && (firstChat || nearBottom);
        adapter.submitList(rows, () -> {
            if (renderToken != token || generation != messageGeneration || telegram.activeChat != chatId || timeline != list) return;
            if (unreadAnchor != 0) { for (int i = 0; i < rows.size(); i++) if (rows.get(i).id >= unreadAnchor) { list.scrollToPosition(Math.max(0, i - 1)); break; } }
            else if (bottom && !rows.isEmpty()) list.scrollToPosition(rows.size() - 1);
            else if (anchorId != 0 && manager != null) for (int i = 0; i < rows.size(); i++) if (rows.get(i).id == anchorId) { manager.scrollToPositionWithOffset(i, offset); break; }
            if (jump != null) jump.setVisibility(list.canScrollVertically(1) || (telegram.currentWindow() != null && !telegram.currentWindow().latest) ? View.VISIBLE : View.GONE);
        });
        if (searchCount != null) searchCount.setText(getResources().getQuantityString(R.plurals.search_count, rows.size(), rows.size(), telegram.history().size()));
        updateHistoryState(); refreshSend();
    }
    private static String excerpt(String value, int maximum) { return value.length() <= maximum ? value : value.substring(0, maximum) + "…"; }
    private static final class Preview{final TdApi.File file;final String mime;Preview(TdApi.File file,String mime){this.file=file;this.mime=mime;}}
    private static Preview preview(TdApi.MessageContent content){
        if(content instanceof TdApi.MessagePhoto){TdApi.Photo photo=((TdApi.MessagePhoto)content).photo;if(photo.sizes==null)return null;TdApi.PhotoSize chosen=null;for(TdApi.PhotoSize size:photo.sizes)if(size!=null&&size.photo!=null&&size.width>0&&size.width<=320&&(chosen==null||size.width>chosen.width))chosen=size;if(chosen==null)for(TdApi.PhotoSize size:photo.sizes)if(size!=null&&size.photo!=null&&(chosen==null||size.width<chosen.width))chosen=size;return chosen==null?null:new Preview(chosen.photo,"image/jpeg");}
        if(content instanceof TdApi.MessageAnimation)return preview(((TdApi.MessageAnimation)content).animation.thumbnail);
        if(content instanceof TdApi.MessageVideo)return preview(((TdApi.MessageVideo)content).video.thumbnail);
        if(content instanceof TdApi.MessageVideoNote)return preview(((TdApi.MessageVideoNote)content).videoNote.thumbnail);
        if(content instanceof TdApi.MessageDocument)return preview(((TdApi.MessageDocument)content).document.thumbnail);
        if(content instanceof TdApi.MessageSticker)return preview(((TdApi.MessageSticker)content).sticker.thumbnail);
        if(content instanceof TdApi.MessageAudio)return preview(((TdApi.MessageAudio)content).audio.albumCoverThumbnail);
        return null;
    }
    private static Preview preview(TdApi.Thumbnail thumbnail){if(thumbnail==null||thumbnail.file==null)return null;String mime=thumbnail.format instanceof TdApi.ThumbnailFormatWebp?"image/webp":thumbnail.format instanceof TdApi.ThumbnailFormatPng?"image/png":thumbnail.format instanceof TdApi.ThumbnailFormatJpeg?"image/jpeg":thumbnail.format instanceof TdApi.ThumbnailFormatGif?"image/gif":thumbnail.format instanceof TdApi.ThumbnailFormatMpeg4?"video/mp4":thumbnail.format instanceof TdApi.ThumbnailFormatWebm?"video/webm":null;return mime==null?null:new Preview(thumbnail.file,mime);}
    private void updateHistoryState() {
        HistoryWindow window = telegram.currentWindow(); if (historyBox == null || window == null) return;
        historyStatus.setText(window.loading ? (window.size() == 0 ? "Cargando caché e historial… Máximo 12 s de espera." : window.size() + " mensajes disponibles · Actualizando sin bloquear…") : !window.error.isEmpty() ? window.error : window.size() == 0 ? "No hay mensajes cargados. Puedes reintentar." :
            window.size() + " mensajes cargados" + (window.stale ? " · Caché pendiente de actualizar" : "") + (window.size() >= HistoryWindow.LIMIT ? " · Ventana móvil de memoria; puedes cargar anteriores" : ""));
        older.setEnabled(!window.loading && !window.end); refresh.setEnabled(!window.loading); older.setText(window.loading ? "Cargando…" : "Mensajes anteriores");
    }
    private void refreshSend() { if (sendButton != null && composer != null) sendButton.setEnabled(telegram.canSend() && !telegram.sending(composerChat) && !composer.getText().toString().trim().isEmpty()); }
    private void send() {
        if (composer == null || !telegram.canSend() || telegram.sending(composerChat) || composer.getText().toString().trim().isEmpty()) return;
        if (telegram.uncertain(composerChat)) {
            Dialogs.builder(this).setTitle("Comprueba el envío anterior").setMessage("El mensaje anterior podría haber llegado aunque venciera la espera. Revisa el historial para evitar duplicados. ¿Quieres preparar este nuevo envío de todas formas?")
                .setNegativeButton("Revisar historial", (dialog, which) -> telegram.refreshHistory()).setPositiveButton("Enviar de todas formas", (dialog, which) -> { telegram.acknowledgeUncertain(composerChat); performSend(); }).show();
        } else performSend();
    }
    private void performSend() {
        final long id = composerChat, account = telegram.selfId; final String value = composer.getText().toString(); final long reply = screen.replies.getOrDefault(id, 0L);
        telegram.sendText(value, reply, accepted -> {
            if (telegram.selfId != account) return;
            if (accepted) {
                if (value.equals(screen.drafts.get(id))) screen.drafts.remove(id);
                if (screen.replies.getOrDefault(id, 0L) == reply) screen.replies.remove(id);
                screen.completedSends.setValue(id);
            }
            if (!isDestroyed()) refreshSend();
        }); refreshSend();
    }
    private void updateReply() {
        if (replyBox == null || !screen.page.equals("chat")) return;
        long id = screen.replies.getOrDefault(telegram.activeChat, 0L); replyBox.setVisibility(id == 0 ? View.GONE : View.VISIBLE);
        TdApi.Message message = telegram.message(id); replyText.setText(message == null ? "Respondiendo a un mensaje" : "Responder a " + telegram.senderName(message.senderId) + ": " + excerpt(TdSession.text(message,telegram), 90));
    }
    private void insert(String text) {
        if (composer == null) return; int start = Math.max(0, composer.getSelectionStart()), end = Math.max(start, composer.getSelectionEnd());
        composer.getText().replace(start, end, text); composer.requestFocus();
    }
    private void emoji() { String[] emojis = {"😊", "✨", "💛", "👍", "🎉", "☀️", "🚀", "☕", "❤️", "👏", "🙏", "✅"}; Dialogs.builder(this).setTitle("Insertar emoji, sin enviar").setItems(emojis, (dialog, which) -> insert(emojis[which])).show(); }
    private void messageMenu(long id) {
        TdApi.Message message = telegram.message(id); if (message == null || message.sendingState != null) { showInfo("Este mensaje aún no está confirmado o ya no está cargado."); return; }
        long chat = telegram.activeChat;
        telegram.properties(message, properties -> {
            if (isDestroyed() || !visible || !screen.page.equals("chat") || telegram.activeChat != chat) return;
            List<String> labels = new ArrayList<>(); List<Runnable> actions = new ArrayList<>();
            if (properties.canBeReplied && telegram.canSend()) { labels.add("Responder"); actions.add(() -> { screen.replies.put(chat, id); updateReply(); composer.requestFocus(); }); }
            if (properties.canBeCopied && message.content instanceof TdApi.MessageText && message.selfDestructType == null) { labels.add("Copiar texto"); actions.add(() -> copyMessage(TdSession.text(message))); }
            if (properties.canBeEdited && message.content instanceof TdApi.MessageText) { labels.add("Editar texto"); actions.add(() -> {
                EditText edit = input("Nuevo texto", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, 4096); edit.setText(TdSession.text(message));
                Dialogs.builder(this).setTitle("Editar en Telegram").setView(edit).setNegativeButton("Cancelar", null).setPositiveButton("Guardar cambio real", (d, w) -> telegram.edit(message, edit.getText().toString())).show();
            }); }
            if (properties.canBeDeletedOnlyForSelf || properties.canBeDeletedForAllUsers) { labels.add("Eliminar solo para mí"); actions.add(() -> Dialogs.builder(this).setTitle("¿Eliminar para ti?").setMessage("El cambio se enviará a Telegram. No se elimina para la otra persona.").setNegativeButton("Cancelar", null).setPositiveButton("Eliminar", (d, w) -> telegram.delete(message)).show()); }
            labels.add("Información del mensaje"); actions.add(() -> showInfo("Identificador: " + message.id + "\nFecha: " + DateFormat.getDateTimeInstance().format(new Date(message.date * 1000L)) + (message.editDate > 0 ? "\nTelegram informa una edición." : "")));
            Dialogs.builder(this).setTitle("Mensaje real").setItems(labels.toArray(new String[0]), (dialog, which) -> actions.get(which).run()).show();
        });
    }
    private void copyMessage(String text) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE); if (clipboard == null) return;
        ClipData clip = ClipData.newPlainText("Mensaje de WRGram", text); PersistableBundle flags = new PersistableBundle(); flags.putBoolean("android.content.extra.IS_SENSITIVE", true); clip.getDescription().setExtras(flags); clipboard.setPrimaryClip(clip); showToast("Texto copiado al portapapeles del dispositivo.");
    }

    private void chatMenu() {
        Dialogs.builder(this).setTitle("Tu conversación").setItems(new String[]{"Herramientas y notas", "Respuestas rápidas", "Buscar mensajes cargados", "Información del chat", "Marcar como leído en Telegram", "Actualizar historial", "Ajustes"}, (dialog, which) -> {
            switch (which) { case 0: tools(); break; case 1: quickReply(); break; case 2: screen.messageSearch = true; render(); break; case 3: info(); break; case 4: telegram.markRead(); break; case 5: telegram.refreshHistory(); break; default: showPage("settings"); }
        }).show();
    }
    private void mainMenu() {
        Dialogs.builder(this).setTitle("WRGram").setItems(new String[]{"Nueva conversación por @usuario", "Mensajes guardados", "Actualizar conexión y chats", "Mi perfil", "Complementos", "Día / Noche", "Acerca de y privacidad"}, (dialog, which) -> {
            switch (which) { case 0: newChat(); break; case 1: saved(); break; case 2: telegram.retry(); break; case 3: showInfo(telegram.ready() ? "Cuenta real: " + telegram.displayName + "\nUna sola cuenta por instalación. Puedes cerrar sesión desde Ajustes." : "No hay una cuenta de Telegram conectada."); break; case 4: showPage("plugins"); break; case 5: preferences.edit().putString("theme", palette.dark ? "day" : "night").apply(); render(); break; default: privacy(); }
        }).show();
    }
    private void info() {
        TdApi.Chat chat = telegram.chat(telegram.activeChat); if (chat == null) return;
        String type = telegram.bot(chat) ? "Bot" : chat.type instanceof TdApi.ChatTypePrivate ? "Privada" : "Grupo";
        Dialogs.builder(this).setTitle(chat.title).setMessage("Conversación real de Telegram\nTipo: " + type + "\nIdentificador: " + chat.id + "\nSin leer: " + chat.unreadCount +
            "\nPermiso de escritura: " + (telegram.canSend() ? "disponible" : "no disponible ahora") + "\nCopia de contenido: " + (chat.hasProtectedContent ? "protegida por Telegram" : "sujeta a los permisos de cada mensaje") +
            "\n\nLos complementos y WR IA no reciben el historial. La búsqueda del cliente se limita a los mensajes cargados.")
            .setPositiveButton("Cerrar", null).setNeutralButton("Herramientas", (dialog, which) -> tools()).show();
    }
    private String grantKey(String plugin, long account) { return "plugin." + account + "." + plugin; }
    private boolean granted(String plugin) { return telegram.selfId > 0 && preferences.getBoolean(grantKey(plugin, telegram.selfId), false); }
    private void permission(String plugin, Runnable completed) {
        long account = telegram.selfId; if (account <= 0) { showInfo("Espera a que tu cuenta termine de conectar para conceder permisos."); return; }
        String description = plugin.equals("notes") ? "Leer y escribir tus notas locales para esta cuenta/chat. Se guardan cifradas, no se sincronizan y no se envían a nadie. El complemento no lee mensajes de Telegram." : "Preparar texto en el borrador. Nunca pulsa Enviar, no lee el historial y no transmite datos a servicios externos.";
        Dialogs.builder(this).setTitle("Activar " + (plugin.equals("notes") ? "notas privadas" : "respuestas rápidas")).setMessage(description + "\n\nPuedes revocar el permiso en Complementos. Revocarlo conserva los datos; borrarlos es una acción aparte.")
            .setNegativeButton("Ahora no", null).setPositiveButton("Permitir y activar", (dialog, which) -> { if (telegram.selfId != account) return; preferences.edit().putBoolean(grantKey(plugin, account), true).apply(); completed.run(); }).show();
    }
    private void plugins() {
        header("Complementos", false); LinearLayout body = scrollBody(); body.addView(text("Pequeños extras. Tu control.", 25, palette.ink)); gap(body, 12);
        body.addView(text("Solo complementos propios. No se ejecuta código descargado ni se da acceso al historial. Los permisos son independientes por cuenta.", 14, palette.muted)); gap(body, 18);
        pluginCard(body, "Notas privadas", "Notas locales cifradas por cuenta y conversación. Permisos: notes:read y notes:write.", "notes");
        pluginCard(body, "Respuestas rápidas", "Tus frases preparan borradores. Permiso: composer:write. Tú eliges cuándo enviar.", "replies");
        body.addView(button("Abrir WR IA independiente", false, () -> showPage("assistant"))); gap(body, 12);
        body.addView(text("En preparación: SDK y complementos de terceros. No hay marketplace ejecutable, conectores ni traducción automática disponibles.", 13, palette.muted));
    }
    private void pluginCard(LinearLayout body, String name, String description, String id) {
        body.addView(text(name + (granted(id) ? " · Activo" : " · Inactivo"), 20, palette.ink)); gap(body, 8); body.addView(text(description, 14, palette.muted)); gap(body, 10);
        body.addView(button(granted(id) ? "Revocar acceso" : "Activar con permisos", !granted(id), () -> {
            if (granted(id)) { preferences.edit().putBoolean(grantKey(id, telegram.selfId), false).apply(); showToast("Permiso revocado. Los datos locales se conservan."); render(); }
            else permission(id, this::render);
        })); gap(body, 24);
    }
    private void tools() {
        Dialogs.builder(this).setTitle("Tu espacio, ampliado").setItems(new String[]{"Nota privada de este chat", "Respuestas rápidas", "Información del chat", "Gestionar complementos"}, (dialog, which) -> {
            if (which == 0) note(); else if (which == 1) quickReply(); else if (which == 2) info(); else showPage("plugins");
        }).show();
    }
    private void note() {
        if (!granted("notes")) { permission("notes", this::note); return; }
        long user = telegram.selfId, chat = telegram.activeChat;
        storageTask(() -> PrivateNotes.read(this, user, chat), saved -> {
            if (telegram.selfId != user || telegram.activeChat != chat || !granted("notes")) return;
            EditText note = input("Nota privada: nunca se envía al chat", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, 10_000); note.setMinLines(5); note.setText(saved);
            Dialogs.builder(this).setTitle("Solo en este dispositivo").setMessage("Cifrada y separada por cuenta/chat. Guardar no envía mensajes ni comparte el texto con WR IA.").setView(note)
                .setNegativeButton("Cancelar", null).setNeutralButton("Borrar nota", (dialog, which) -> saveNote(user, chat, "")).setPositiveButton("Guardar localmente", (dialog, which) -> saveNote(user, chat, note.getText().toString())).show();
        }, "No se pudo abrir la nota cifrada.");
    }
    private void saveNote(long user, long chat, String value) {
        storageTask(() -> {
            if (!preferences.getBoolean(grantKey("notes", user), false)) throw new IllegalStateException("Permission revoked");
            PrivateNotes.write(this, user, chat, value); return true;
        }, ignored -> { if (telegram.selfId == user) showToast(value.trim().isEmpty() ? "Nota local eliminada." : "Nota cifrada guardada solo aquí."); }, "No se pudo guardar la nota. Comprueba el permiso y el almacenamiento.");
    }
    private void quickReply() {
        if (!granted("replies")) { permission("replies", this::quickReply); return; }
        String[] replies = {"¡Gracias! Lo reviso y te cuento.", "Perfecto, seguimos en contacto.", "¿Lo vemos con más calma?"};
        Dialogs.builder(this).setTitle("Preparar borrador, sin enviar").setItems(replies, (dialog, which) -> { if (granted("replies") && composer != null) insert(replies[which]); }).show();
    }

    private CheckBox checkbox(String label, boolean checked, Consumer<Boolean> changed) {
        CheckBox checkbox = new CheckBox(this); checkbox.setText(label); checkbox.setTextColor(palette.ink); checkbox.setTextSize(14); checkbox.setButtonTintList(ColorStateList.valueOf(palette.accent)); checkbox.setChecked(checked);
        if (changed != null) checkbox.setOnCheckedChangeListener((button, value) -> changed.accept(value)); return checkbox;
    }
    private void settings() {
        header("Ajustes", true); LinearLayout body = scrollBody(); body.addView(text("Tu estilo, tu espacio", 25, palette.ink)); gap(body, 12);
        for (int i = 0; i < Palette.IDS.length; i++) { final String id = Palette.IDS[i]; if ("custom".equals(id)) continue; body.addView(button(Palette.NAMES[i] + (id.equals(preferences.getString("theme", "gold")) ? " ✓" : ""), false, () -> { preferences.edit().putString("theme", id).apply(); render(); })); gap(body, 6); }
        body.addView(button(palette.dark ? "Cambiar a Día" : "Cambiar a Noche", true, () -> { preferences.edit().putString("theme", palette.dark ? "day" : "night").apply(); render(); })); gap(body, 18);
        body.addView(text("Lectura y escritura", 21, palette.ink)); gap(body, 10);
        body.addView(button("Tamaño del texto: " + font(), false, () -> Dialogs.builder(this).setTitle("Tamaño del texto").setItems(new String[]{"Pequeño · 14", "Normal · 16", "Grande · 18"}, (dialog, which) -> { preferences.edit().putInt("font", new int[]{14, 16, 18}[which]).apply(); render(); }).show())); gap(body, 8);
        body.addView(checkbox("Listas compactas", compact(), checked -> { preferences.edit().putBoolean("compact", checked).apply(); render(); }));
        body.addView(checkbox("Enviar estado de escritura a Telegram", preferences.getBoolean("typing", true), checked -> { preferences.edit().putBoolean("typing", checked).apply(); if (!checked) telegram.stopTyping(); }));
        body.addView(checkbox("Enter envía (teclado físico); Shift+Enter nueva línea", preferences.getBoolean("enter", false), checked -> preferences.edit().putBoolean("enter", checked).apply())); gap(body, 14);
        body.addView(button("Gestionar permisos de complementos", false, () -> showPage("plugins"))); gap(body, 10);
        body.addView(button("Borrar todas las notas de esta cuenta", false, () -> {
            long account = telegram.selfId; if (account <= 0) { showInfo("Conecta la cuenta antes de borrar sus notas locales."); return; }
            Dialogs.builder(this).setTitle("¿Borrar las notas de esta cuenta?").setMessage("Solo afecta a las notas locales por chat de esta cuenta. No borra mensajes de Telegram ni las notas personales de WR IA. No se puede deshacer.")
                .setNegativeButton("Cancelar", null).setPositiveButton("Borrar notas de la cuenta", (dialog, which) -> storageTask(() -> PrivateNotes.clearAccount(this, account), count -> showToast("Notas locales eliminadas: " + count), "No se pudieron borrar todas las notas.")).show();
        })); gap(body, 14);
        body.addView(button("Estado y ayuda de conexión", false, this::diagnostics)); gap(body, 10);
        body.addView(button("Privacidad, límites y licencias", false, this::privacy)); gap(body, 10);
        body.addView(button("Actualizar edad o residencia", false, () -> Dialogs.builder(this).setTitle("Actualizar edad o residencia").setMessage("Se pausará Telegram sin revocar la sesión. Tendrás que declarar tus datos de nuevo.").setNegativeButton("Cancelar", null).setPositiveButton("Volver a comprobar", (dialog, which) -> {
            try { ((WrgramApplication) getApplication()).ageAccess().forgetApproval(); ((WrgramApplication) getApplication()).scheduleAgeExpiry(); requireAccess(); }
            catch (Exception ignored) { showInfo("No se pudo actualizar la comprobación local."); }
        }).show())); gap(body, 10);
        body.addView(button("Contactar con @webrom_bot", false, () -> openLink("https://t.me/webrom_bot"))); gap(body, 10);
        if (telegram.ready()) body.addView(button("Cerrar sesión de Telegram", false, this::confirmLogout));
        gap(body, 18); body.addView(text("WRGram " + BuildConfig.VERSION_NAME + "\nCliente independiente, no afiliado ni avalado por Telegram.", 12, palette.muted));
    }
    private void diagnostics() {
        HistoryWindow current = telegram.currentWindow();
        showInfo("WRGram " + BuildConfig.VERSION_NAME + "\n" + telegram.connection + "\nSesión: " + (telegram.ready() ? "autenticada" : "sin autenticar") + "\nHistorial visible: " + (current == null ? "ninguno" : current.size() + " mensajes") +
            "\n\nLas lecturas de historial y listas tienen un máximo de 12 segundos. Se muestra primero la caché local y puedes reintentar sin reiniciar la aplicación. No se reenvían mensajes automáticamente.\n\nSi el estado sigue sincronizando, revisa tu red o cambia entre Wi-Fi y datos. Evita borrar los datos de la app: eso elimina el acceso a la sesión local. No compartas códigos, contraseñas ni conversaciones con soporte.");
    }
    private void privacy() {
        Dialogs.builder(this).setTitle("Privacidad y l\u00edmites")
            .setMessage("WRGram " + BuildConfig.VERSION_NAME + ": TDLib conecta directamente con Telegram. No registramos c\u00f3digos de acceso ni contrase\u00f1as 2FA. Hasta tres cuentas tienen bases cifradas separadas y claves protegidas por Android Keystore; no se incluyen en copias de seguridad. Las capturas y las grabaciones de pantalla est\u00e1n deshabilitadas en las conversaciones, la declaraci\u00f3n de edad, el bloqueo, las Mini Apps y el reproductor de v\u00eddeo."
                + "\n\nLos chats en la nube de Telegram no son E2EE. Los chats secretos s\u00ed usan el cifrado de Telegram; compara la huella con la otra persona. Algunos contenidos temporales no se abren. Puedes cambiar o eliminar tu foto de perfil y editar el nombre, la biograf\u00eda y el username. La agenda del tel\u00e9fono solo se importa si lo activas: hasta 200 contactos y un repaso cada 24 horas. Las herramientas de moderaci\u00f3n \u2014restricciones, baneos y ascensos\u2014 requieren permiso de Telegram."
                + "\n\nLas Mini Apps reciben datos de lanzamiento de Telegram y pueden recibir tu IP. No reciben tu historial de chats ni tus notas. Cada solicitud compatible requiere consentimiento: el tel\u00e9fono se env\u00eda al bot como contacto; la ubicaci\u00f3n puede compartirse con el sitio tras permiso local por bot y permiso Android; el portapapeles requiere bot a\u00f1adido al men\u00fa, gesto reciente y confirmaci\u00f3n con vista previa. DeviceStorage es local y separado por cuenta y bot. La c\u00e1mara y el micr\u00f3fono para una Mini App se piden aparte, con el permiso de Android."
                + "\n\nAlgunas facturas digitales Telegram Stars XTR admiten un solo pago tras dos confirmaciones y las suscripciones de Stars usan el mismo formulario; no se guardan tarjetas. Hay stickers WebP, WebM y TGS. Las historias de foto y de v\u00eddeo de hasta 60 segundos se publican y sus \u00e1lbumes se gestionan. "
                + (BuildConfig.FCM_CONFIGURED ? "Las notificaciones push son opcionales y usan Firebase Cloud Messaging: solo se activan si las habilitas y concedes el permiso de Android. No se ha verificado la entrega real en esta beta." : "Las notificaciones push no est\u00e1n configuradas en esta compilaci\u00f3n.")
                + " Las notas son locales y cifradas. WR IA est\u00e1 separada y su generaci\u00f3n p\u00fablica sigue deshabilitada."
                + "\n\nFaltan llamadas de voz y video y otras funciones del cliente oficial. Cerrar sesi\u00f3n solicita revocar el acceso en Telegram; desinstalar no garantiza esa revocaci\u00f3n. Si no se confirma, revisa Dispositivos en Telegram oficial.")
            .setPositiveButton("Entendido", null).setNeutralButton("Licencias", (dialog, which) -> licenses()).setNegativeButton("Privacidad de Telegram", (dialog, which) -> openLink("https://telegram.org/privacy")).show();
    }
    private void licenses() {
        storageTask(() -> {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
            for (String file : new String[]{"THIRD_PARTY_NOTICES.txt", "LICENSE-APACHE-2.0.txt"}) try (java.io.InputStream input = getAssets().open(file)) { while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count); bytes.write(10); }
            return bytes.toString("UTF-8");
        }, content -> Dialogs.builder(this).setTitle("Licencias de terceros").setMessage(content).setPositiveButton("Cerrar", null).show(), "No se pudieron abrir las licencias incluidas.");
    }
    private void confirmLogout() {
        Dialogs.builder(this).setTitle("¿Cerrar esta sesión real?").setMessage("Telegram revocará este acceso. No elimina tu cuenta ni tus mensajes. Tus notas locales se conservan hasta que las borres. Si no hay red, revoca la sesión desde Dispositivos en Telegram oficial.")
            .setNegativeButton("Cancelar", null).setPositiveButton("Cerrar sesión", (dialog, which) -> { composer = null; screen.clear(); assistant.clear(); telegram.logOut(); render(); }).show();
    }
    private void openLink(String url) { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (android.content.ActivityNotFoundException ignored) { showInfo("No hay una aplicación para abrir este enlace."); } }
    void showInfo(String message) { if (!isDestroyed() && !isFinishing()) Dialogs.builder(this).setMessage(message).setPositiveButton("Cerrar", null).show(); }
    void showToast(String message) { if (!isDestroyed() && visible) Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    <T> void storageTask(IoTask<T> task, Consumer<T> success, String failure) {
        ((WrgramApplication) getApplication()).storage().execute(() -> {
            try { T result = task.run(); main.post(() -> { if (!isDestroyed() && visible) success.accept(result); }); }
            catch (Exception ignored) { main.post(() -> { if (!isDestroyed() && visible) showInfo(failure); }); }
        });
    }
    private void refreshStatus() {
        if (status != null) status.setText(getString(telegram.chatsBusy ? R.string.connection_loading : R.string.connection_plain, telegram.connection));
        if (alert != null) { alert.setText(telegram.error); errorBox.setVisibility(telegram.error.isEmpty() ? View.GONE : View.VISIBLE); }
        if (authButton != null) authButton.setEnabled(!telegram.busy);
        if (authInput != null) authInput.setEnabled(!telegram.busy);
        if (moreChats != null) { moreChats.setEnabled(!telegram.chatsBusy); moreChats.setText(telegram.chatsBusy ? "Cargando…" : telegram.chatsEnd ? "Actualizar conversaciones" : "Cargar más conversaciones"); }
        if (typingLabel != null) { String value = telegram.typingLabel(); typingLabel.setText(value); typingLabel.setVisibility(value.isEmpty() ? View.GONE : View.VISIBLE); }
        if (historyBox != null) updateHistoryState(); refreshSend();
    }
}
