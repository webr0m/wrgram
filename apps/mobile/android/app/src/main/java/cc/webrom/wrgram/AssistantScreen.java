package cc.webrom.wrgram;

import android.app.AlertDialog;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/** Small independent screen: only its own text fields can become an assistant prompt. */
final class AssistantScreen {
    private final MainActivity ui;
    private final AssistantController assistant;
    private TextView status, error;
    private EditText prompt;
    private Button send;
    private CheckBox consent;
    private LinearLayout history, proposals;
    private int renderedTurns = -1;
    private boolean renderedBusy;

    AssistantScreen(MainActivity ui, AssistantController assistant) { this.ui = ui; this.assistant = assistant; }
    void build() {
        ui.header("WR IA", false);
        LinearLayout body = ui.scrollBody();
        body.addView(ui.text("Un impulso para tus propias ideas.", 25, ui.palette.ink)); ui.gap(body, 12);
        body.addView(ui.text("Este asistente es independiente de Telegram. No recibe tus chats, tus notas privadas ni datos de tu cuenta. Solo se envía el texto que escribas aquí tras aceptar el consentimiento.", 14, ui.palette.muted)); ui.gap(body, 14);
        status = ui.text("", 14, ui.palette.accent); body.addView(status);
        body.addView(ui.button("Actualizar estado del proveedor", false, assistant::status)); ui.gap(body, 10);
        body.addView(ui.text("Groq online, sujeto a cuotas y condiciones. No se incluye una clave en Android ni se activa un plan de pago. Ollama es una alternativa de la API local web; no está conectado a este servidor público.", 12, ui.palette.muted)); ui.gap(body, 14);
        consent = new CheckBox(ui); consent.setText(R.string.assistant_consent); consent.setTextColor(ui.palette.ink); consent.setChecked(assistant.consent);
        consent.setOnCheckedChangeListener((button, checked) -> { if (!checked) assistant.revoke(); else assistant.consent = true; update(); }); body.addView(consent);
        prompt = ui.input("Escribe tu propia instrucción, sin contenido privado", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, 4000);
        prompt.setMinLines(3); prompt.setText(ui.screen.assistantDraft); prompt.addTextChangedListener(MainActivity.watcher(text -> { ui.screen.assistantDraft = text; refreshSend(); })); body.addView(prompt); ui.gap(body, 10);
        LinearLayout suggestions = ui.row();
        suggestions.addView(ui.button("Organizar una idea", false, () -> prompt.setText(R.string.assistant_suggestion_prompt)));
        body.addView(suggestions); ui.gap(body, 10);
        send = ui.button("Consultar WR IA", true, () -> {
            if (assistant.send(prompt.getText().toString())) ui.showToast("Se envió solo tu instrucción propia. No se añadieron chats.");
        }); body.addView(send);
        error = ui.text("", 13, ui.palette.muted); body.addView(error); ui.gap(body, 16);
        history = ui.column(); body.addView(history); proposals = ui.column(); body.addView(proposals);
        body.addView(ui.button("Revocar consentimiento y vaciar conversación", false, () -> {
            assistant.clear(); ui.screen.assistantDraft = ""; prompt.setText("");
        })); ui.gap(body, 10);
        body.addView(ui.button("Mis notas personales de WR IA", false, this::notes)); ui.gap(body, 10);
        body.addView(ui.button("Crear una nota personal sin IA", false, () -> {
            EditText title = ui.input("Título de tu nota", InputType.TYPE_CLASS_TEXT, 80);
            EditText text = ui.input("Contenido local de la nota", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, 5000); text.setMinLines(4);
            LinearLayout fields = ui.column(); ui.padded(fields, 18, 10); fields.addView(title); fields.addView(text);
            Dialogs.builder(ui).setTitle("Nota personal cifrada · solo aquí").setView(fields).setNegativeButton("Cancelar", null)
                .setPositiveButton("Guardar localmente", (dialog, which) -> save(title.getText().toString(), text.getText().toString())).show();
        }));
        ui.gap(body, 14); body.addView(ui.text("Las notas personales son locales a este dispositivo, separadas de las notas por chat. No se incorporan automáticamente a una consulta de IA.", 12, ui.palette.muted));
        update();
    }
    void update() {
        if (status == null) return;
        String label = assistant.state;
        if (!assistant.model.isEmpty()) label = ui.getString(R.string.assistant_status_model, label, assistant.model);
        if (assistant.busy) label = ui.getString(R.string.assistant_status_busy, label);
        status.setText(label);
        error.setText(assistant.error); error.setVisibility(assistant.error.isEmpty() ? View.GONE : View.VISIBLE);
        if (consent.isChecked() != assistant.consent) consent.setChecked(assistant.consent);
        if (assistant.history().size() != renderedTurns || renderedBusy != assistant.busy) {
            renderedTurns = assistant.history().size(); renderedBusy = assistant.busy; history.removeAllViews();
            for (AssistantPayload.Turn turn : assistant.history()) {
                TextView item = ui.text((turn.role.equals("user") ? "Tú" : "WR IA") + "\n" + turn.content, 15, ui.palette.ink); ui.padded(item, 12, 12); history.addView(item);
            }
            proposals.removeAllViews();
            for (JSONObject proposal : assistant.proposals()) {
                proposals.addView(ui.button("Revisar nota propuesta: " + proposal.optString("title"), false, () ->
                    Dialogs.builder(ui).setTitle(proposal.optString("title")).setMessage(proposal.optString("text") + "\n\nSolo se guardará aquí si confirmas.")
                        .setNegativeButton("Cancelar", null).setPositiveButton("Guardar nota cifrada", (dialog, which) -> save(proposal.optString("title"), proposal.optString("text"))).show()));
            }
        }
        refreshSend();
    }
    private void refreshSend() { if (send != null && prompt != null) send.setEnabled(assistant.ready && assistant.consent && !assistant.busy && !prompt.getText().toString().trim().isEmpty()); }
    private void save(String title, String text) {
        ui.storageTask(() -> { AssistantNotes.add(ui, title, text); return true; }, ignored -> ui.showToast("Nota personal guardada cifrada. No se envió a Telegram."), "No se pudo guardar la nota. Revisa título, texto y el límite de 50 notas.");
    }
    private void notes() {
        ui.storageTask(() -> AssistantNotes.read(ui), notes -> {
            LinearLayout list = ui.column(); ui.padded(list, 18, 12);
            if (notes.length() == 0) list.addView(ui.text("No hay notas personales guardadas.", 15, ui.palette.muted));
            for (int i = 0; i < notes.length(); i++) {
                JSONObject note = notes.optJSONObject(i); if (note == null) continue;
                list.addView(ui.text(note.optString("title") + "\n" + note.optString("text"), 15, ui.palette.ink)); ui.gap(list, 18);
            }
            android.widget.ScrollView scroll = new android.widget.ScrollView(ui); scroll.addView(list);
            Dialogs.builder(ui).setTitle("Notas personales de WR IA").setView(scroll).setPositiveButton("Cerrar", null)
                .setNeutralButton("Borrar todas", (dialog, which) -> Dialogs.builder(ui).setTitle("¿Borrar todas las notas personales de WR IA?")
                    .setMessage("No afecta a las notas por chat ni a Telegram. No se puede deshacer.").setNegativeButton("Cancelar", null)
                    .setPositiveButton("Borrar notas personales", (d, w) -> ui.storageTask(() -> { AssistantNotes.clear(ui); return true; }, ignored -> ui.showToast("Notas personales eliminadas."), "No se pudieron borrar las notas personales.")).show()).show();
        }, "No se pudieron abrir las notas personales cifradas.");
    }
}
