package cc.webrom.wrgram;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;

/** Keeps the microphone available when an accepted voice call leaves the screen. */
public final class CallAudioService extends Service {
    private static final String CHANNEL = "telegram_voice_active";
    private static final int NOTIFICATION_ID = 7141;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private int previousMode;
    private boolean previousSpeaker;
    private boolean configured;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        TelegramCalls calls = ((WrgramApplication)getApplication()).calls();
        if (!calls.active()) { stopSelf(); return START_NOT_STICKY; }
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Llamadas en curso", NotificationManager.IMPORTANCE_LOW));
            PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID, new Intent(this, CallActivity.class),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification notification = new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.brand_foreground)
                    .setContentTitle("Llamada de Telegram").setContentText("Toca para volver a la llamada")
                    .setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).build();
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTIFICATION_ID, notification);
            if (!configured) {
                audio = getSystemService(AudioManager.class);
                previousMode = audio.getMode();
                previousSpeaker = audio.isSpeakerphoneOn();
                configured = true;
                audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).build())
                        .setOnAudioFocusChangeListener(ignored -> {}).build();
                if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                    throw new IllegalStateException("Audio focus unavailable");
                }
            }
            calls.serviceStarted();
        } catch (RuntimeException error) {
            calls.audioUnavailable();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    static boolean route(Context context, boolean speaker) {
        AudioManager manager = context.getSystemService(AudioManager.class);
        if (manager == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                if (!speaker) { manager.clearCommunicationDevice(); return true; }
                for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                    if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return manager.setCommunicationDevice(device);
                }
                return false;
            }
            manager.setSpeakerphoneOn(speaker);
            return true;
        } catch (RuntimeException error) { return false; }
    }

    @Override public void onDestroy() {
        if (configured) {
            try {
                if (focus != null) audio.abandonAudioFocusRequest(focus);
                if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
                else audio.setSpeakerphoneOn(previousSpeaker);
                audio.setMode(previousMode);
            } catch (RuntimeException ignored) {}
        }
        ((WrgramApplication)getApplication()).calls().serviceStopped();
        super.onDestroy();
    }
}
