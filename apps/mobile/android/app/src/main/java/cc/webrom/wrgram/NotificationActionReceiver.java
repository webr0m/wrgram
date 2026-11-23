package cc.webrom.wrgram;

import android.app.NotificationManager;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;
import org.drinkless.tdlib.TdApi;

/**
 * Ronda CQ · N03: ejecuta las acciones de la notificación. No exportado: solo lo alcanzan
 * los PendingIntent que construye PushNotifications. Cada puerta se re-verifica aquí porque
 * entre publicar la notificación y pulsarla pueden cambiar el bloqueo, la edad o la cuenta.
 */
public final class NotificationActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!NotificationActions.REPLY.equals(action) && !NotificationActions.MARK_READ.equals(action)) return;
        WrgramApplication app = (WrgramApplication) context.getApplicationContext();
        String tag = intent.getStringExtra("tag");
        if (!PushNotifications.enabled(app) || !app.ageAccess().allowed()) { cancel(app, tag); return; }
        TdSession session = app.account(intent.getStringExtra("slot"));
        long chat = intent.getLongExtra("chat", 0);
        long message = intent.getLongExtra("message", 0);
        int topic = intent.getIntExtra("topic", 0);
        if (session == null || !session.ready()) { toast(context, NotificationActions.NOT_READY); return; }
        if (AppLock.enabled(context)) { toast(context, NotificationActions.LOCKED); return; }
        TdApi.Chat known = session.chat(chat);
        if (known != null && known.type instanceof TdApi.ChatTypeSecret) { toast(context, NotificationActions.SECRET); return; }
        if (NotificationActions.MARK_READ.equals(action)) {
            session.markReadFromNotification(chat, topic, message);
            cancel(app, tag);
            return;
        }
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence raw = results == null ? null : results.getCharSequence(NotificationActions.EXTRA_TEXT);
        String text = raw == null ? null : raw.toString();
        String problem = NotificationActions.replyProblem(text);
        if (problem != null) { toast(context, problem); return; }
        // El envío puede tardar hasta 25 s: el receptor no debe morir antes de la confirmación.
        final PendingResult pending = goAsync();
        session.replyFromNotification(chat, topic, text, ok -> {
            if (ok) cancel(app, tag);
            else toast(context, NotificationActions.SEND_FAILED);
            pending.finish();
        });
    }

    private static void cancel(Context context, String tag) {
        if (tag == null) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(tag, 1);
    }

    private static void toast(Context context, String phrase) {
        Toast.makeText(context.getApplicationContext(), phrase, Toast.LENGTH_LONG).show();
    }
}