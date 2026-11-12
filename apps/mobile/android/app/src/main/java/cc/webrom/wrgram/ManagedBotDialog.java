package cc.webrom.wrgram;

import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;

/** The same creation form serves Telegram links and requests in a bot keyboard. */
final class ManagedBotDialog {
    private ManagedBotDialog() {}

    static void show(ShellActivity activity, TdSession session, TdApi.User manager, String suggestedName,
                     String suggestedUsername, boolean viaLink, BooleanSupplier current,
                     Consumer<TdApi.User> created, Runnable cancelled) {
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        form.setPadding(padding, 0, padding, padding / 2);
        EditText name = field(activity, "Nombre del bot", suggestedName, 64, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        EditText username = field(activity, "Nombre de usuario", suggestedUsername, 32, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        TextView status = new TextView(activity);
        status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(name);
        form.addView(username);
        form.addView(status);
        String managerName = (manager.firstName + " " + manager.lastName).trim();
        AlertDialog dialog = Dialogs.builder(activity).setTitle("Crear bot administrado")
                .setMessage("El bot será tuyo. " + managerName + " podrá administrarlo.")
                .setView(form).setNegativeButton("Cancelar", null).setPositiveButton("Crear bot", null).show();
        Handler main = new Handler(Looper.getMainLooper());
        class Form implements TextWatcher {
            String available;
            boolean creating;
            int generation;
            Runnable check;

            String handle() { return username.getText().toString().trim(); }
            void render() {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!creating && !name.getText().toString().isBlank() && handle().equals(available));
            }
            void validateUsername() {
                if(check!=null)main.removeCallbacks(check);
                int attempt=++generation;
                String value=handle();
                available=null;
                render();
                if(!value.matches("[A-Za-z0-9_]{5,32}")){
                    status.setText("Usa 5 a 32 letras, números o guiones bajos. El nombre suele terminar en bot.");return;
                }
                status.setText("Comprobando disponibilidad…");
                boolean secondary=!value.toLowerCase(Locale.ROOT).endsWith("bot");
                check=()->{
                    if(!dialog.isShowing()||!current.getAsBoolean())return;
                    session.perform(new TdApi.CheckBotUsername(value,secondary),result->{
                        if(attempt!=generation||!dialog.isShowing()||!current.getAsBoolean())return;
                        if(result instanceof TdApi.CheckChatUsernameResultOk){available=value;status.setText("Nombre de usuario disponible.");}
                        else if(result instanceof TdApi.CheckChatUsernameResultUsernameOccupied||result instanceof TdApi.CheckChatUsernameResultUsernamePurchasable)status.setText("Este nombre de usuario no está disponible.");
                        else status.setText("Telegram no admite este nombre. Prueba con uno que termine en bot.");
                        render();
                    },error->{if(attempt==generation&&dialog.isShowing())status.setText("No se pudo comprobar el nombre. "+error);});
                };
                main.postDelayed(check,200);
            }
            void submit(){
                if(creating||!current.getAsBoolean()||!handle().equals(available)||name.getText().toString().isBlank())return;
                creating=true;
                dialog.setCancelable(false);
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);
                name.setEnabled(false);username.setEnabled(false);render();
                status.setText("Creando el bot en Telegram…");
                session.perform(new TdApi.CreateBot(manager.id,name.getText().toString().trim(),handle(),viaLink),bot->{
                    if(!dialog.isShowing()||!current.getAsBoolean())return;
                    dialog.dismiss();created.accept(bot);
                },error->{
                    if(!dialog.isShowing()||!current.getAsBoolean())return;
                    creating=false;
                    dialog.setCancelable(true);
                    dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                    name.setEnabled(true);username.setEnabled(true);
                    if(error.contains("USERNAME_OCCUPIED"))available=null;
                    status.setText(error.contains("BOT_CREATE_LIMIT_EXCEEDED")?"Alcanzaste el límite de bots de tu cuenta. Puedes administrarlos en @BotFather.":error);
                    render();
                });
            }
            @Override public void beforeTextChanged(CharSequence text,int start,int count,int after) {}
            @Override public void onTextChanged(CharSequence text,int start,int before,int count) {}
            @Override public void afterTextChanged(Editable text) { if(text==username.getText())validateUsername();else render(); }
        }
        Form state=new Form();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->state.submit());
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(view->{dialog.dismiss();cancelled.run();});
        dialog.setOnCancelListener(ignored->cancelled.run());
        name.addTextChangedListener(state);username.addTextChangedListener(state);
        state.validateUsername();
    }

    private static EditText field(ShellActivity activity,String hint,String value,int maximum,int inputType){
        EditText field=new EditText(activity);
        field.setSingleLine(true);
        field.setInputType(inputType);
        field.setHint(hint);
        field.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maximum)});
        field.setText(value==null?"":value);
        return field;
    }
}
