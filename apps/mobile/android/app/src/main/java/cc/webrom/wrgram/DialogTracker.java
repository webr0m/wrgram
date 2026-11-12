package cc.webrom.wrgram;

import android.app.Dialog;
import java.util.ArrayList;
import java.util.List;

/** Lista corta de diálogos abiertos de una actividad, para poder cerrarlos al destruirla. */
final class DialogTracker implements Dialogs.Host {
    private final List<Dialog> open = new ArrayList<>();

    @Override public void trackDialog(Dialog dialog) {
        synchronized (open) { open.add(dialog); }
        dialog.setOnDismissListener(ignored -> { synchronized (open) { open.remove(dialog); } });
    }

    void closeAll() {
        List<Dialog> copy;
        synchronized (open) { copy = new ArrayList<>(open); open.clear(); }
        for (Dialog dialog : copy) {
            try { if (dialog.isShowing()) dialog.dismiss(); } catch (RuntimeException ignored) { /* ventana ya desligada */ }
        }
    }
}
