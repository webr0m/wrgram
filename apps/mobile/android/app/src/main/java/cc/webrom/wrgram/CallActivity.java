package cc.webrom.wrgram;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

public final class CallActivity extends AccessActivity {
    static final String USER = "voice_call_user";
    private TelegramCalls calls;
    private TextView name, status, fingerprint;
    private Button accept, mute, speaker, finishCall;
    private long outgoing;
    private boolean requestingMicrophone;
    private boolean autoAsked;
    private boolean observed;
    private final Runnable observer = this::render;
    private final ActivityResultLauncher<String> microphone = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), granted -> {
                requestingMicrophone = false;
                if (granted && mayShow()) begin();
                else if (status != null) status.setText(R.string.call_microphone_denied);
            });

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (!requireAccess()) return;
        calls = ((WrgramApplication)getApplication()).calls();
        outgoing = state == null ? getIntent().getLongExtra(USER, 0) : state.getLong(USER);
        if (state != null) {
            requestingMicrophone = state.getBoolean("requestingMicrophone");
            autoAsked = state.getBoolean("autoAsked");
        }
        if (!calls.active() && outgoing == 0) { finish(); return; }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { finish(); }
        });
        Palette palette = Palette.get(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        content.setPadding(padding,padding,padding,padding);
        content.setBackgroundColor(palette.canvas);
        name = label(content, palette.ink, 26);
        status = label(content, palette.muted, 16);
        fingerprint = label(content, palette.ink, 23);
        accept = button(content, R.string.call_accept, this::askToBegin);
        mute = button(content, R.string.call_mute, calls::toggleMute);
        speaker = button(content, R.string.call_speaker, calls::toggleSpeaker);
        finishCall = button(content, R.string.call_end, () -> { calls.hangUp(); finish(); });
        setContentView(content);
    }

    @Override protected void onStart() {
        super.onStart();
        AppLock.activityStarted(this);
        if (calls != null && name != null) { calls.addObserver(observer); observed = true; }
    }
    @Override protected void onResume() {
        super.onResume();
        if (calls == null || name == null) return;
        if (!mayShow()) {
            if (AppLock.enabled(this) && !AppLock.isUnlocked()) {
                startActivity(new Intent(this, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
            }
            finish();
            return;
        }
        render();
        if (outgoing > 0 && !calls.active() && !requestingMicrophone && !autoAsked) {
            autoAsked = true;
            askToBegin();
        }
    }
    @Override protected void onStop() {
        if (observed) { calls.removeObserver(observer); observed = false; }
        AppLock.activityStopped(!isChangingConfigurations() && !requestingMicrophone);
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putLong(USER, outgoing);
        out.putBoolean("requestingMicrophone", requestingMicrophone);
        out.putBoolean("autoAsked", autoAsked);
    }

    private boolean mayShow() {
        return requireAccess() && (!AppLock.enabled(this) || AppLock.isUnlocked());
    }
    private void askToBegin() {
        if (requestingMicrophone || !mayShow()) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) begin();
        else {
            requestingMicrophone = true;
            microphone.launch(Manifest.permission.RECORD_AUDIO);
        }
    }
    private void begin() {
        if (calls.ringing()) calls.accept();
        else if (outgoing > 0 && !calls.active()) {
            long peer = outgoing;
            outgoing = 0;
            calls.start(peer);
        }
    }
    private void render() {
        if (name == null || !mayShow()) return;
        name.setText(calls.active() ? calls.name() : getString(R.string.call_title));
        status.setText(calls.status());
        String key = calls.fingerprint();
        fingerprint.setText(key);
        fingerprint.setVisibility(key.isEmpty() ? View.GONE : View.VISIBLE);
        accept.setText(calls.ringing() ? R.string.call_accept : R.string.call_start);
        accept.setVisibility(calls.ringing() || (!calls.active() && outgoing > 0) ? View.VISIBLE : View.GONE);
        mute.setVisibility(calls.connected() ? View.VISIBLE : View.GONE);
        mute.setText(calls.muted() ? R.string.call_unmute : R.string.call_mute);
        speaker.setVisibility(calls.connected() ? View.VISIBLE : View.GONE);
        speaker.setText(calls.speaker() ? R.string.call_earpiece : R.string.call_speaker);
        finishCall.setText(calls.ringing() ? R.string.call_decline : calls.active() ? R.string.call_end : R.string.call_close);
    }
    private TextView label(LinearLayout content,int color,int size) {
        TextView text = new TextView(this);
        text.setTextColor(color);text.setTextSize(size);text.setGravity(Gravity.CENTER);
        content.addView(text,new LinearLayout.LayoutParams(-1,-2));
        return text;
    }
    private Button button(LinearLayout content,int label,Runnable action) {
        Button button = new Button(this);
        button.setText(label);button.setOnClickListener(view -> action.run());
        content.addView(button,new LinearLayout.LayoutParams(-1,-2));
        return button;
    }
}
