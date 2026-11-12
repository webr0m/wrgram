package cc.webrom.wrgram;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;

/**
 * Fábrica de diálogos que ata cada ventana a su actividad. Sin este enlace, destruir la actividad
 * con un diálogo abierto deja la ventana huérfana (WindowLeaked) y retiene toda la vista.
 */
final class Dialogs {
    /** Implementada por toda actividad que quiera sus diálogos cerrados al desaparecer. */
    interface Host {
        void trackDialog(Dialog dialog);
    }

    private Dialogs() {}

    static Builder builder(Activity activity) {
        return new Builder(activity);
    }

    static final class Builder extends AlertDialog.Builder {
        private final Activity activity;

        Builder(Activity context) {
            super(context);
            activity = context;
        }

        @Override public AlertDialog create() {
            return tracked(super.create());
        }

        // Builder.show() llama a create() de forma virtual, así que el rastreo ya ocurrió ahí;
        // volver a rastrear dejaría una referencia al diálogo ya cerrado hasta destruir la actividad.
        @Override public AlertDialog show() {
            AlertDialog dialog = create();
            dialog.show();
            return dialog;
        }

        private AlertDialog tracked(AlertDialog dialog) {
            if (activity instanceof Host) ((Host) activity).trackDialog(dialog);
            return dialog;
        }
    }
}
