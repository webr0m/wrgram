package cc.webrom.wrgram;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import java.text.Collator;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Offline neutral declaration, without WebView, TDLib connection, location lookup or DOB storage. */
public final class AgeGateActivity extends ComponentActivity implements Dialogs.Host {
    private static final int GOLD = 0xfff0c65c, INK = 0xfff6f3ed, MUTED = 0xffb8b4ac;
    private final DialogTracker dialogs = new DialogTracker();
    private AgeAccessStore store;
    private LinearLayout body;
    private TextView error;
    private Spinner residence;
    private EditText day, month, year;
    private final List<String> countries = new ArrayList<>();
    private boolean leaving;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        store = ((WrgramApplication) getApplication()).ageAccess();
        ((WrgramApplication) getApplication()).telegram().pauseForAgeGate();
        ((WrgramApplication) getApplication()).assistant().clear();
    }
    @Override protected void onResume() { super.onResume(); if (store.allowed()) enter(); else show(); }

    private void show() {
        if (leaving) return;
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(0xff101113); scroll.setSaveEnabled(false);
        scroll.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(24), dp(32), dp(24), dp(32)); body.setSaveEnabled(false);
        scroll.addView(body);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) { android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()); view.setPadding(bars.left, bars.top, bars.right, bars.bottom); }
            else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        addText("WRGram", 17, GOLD); gap(24); TextView title = addText("Antes de continuar", 30, INK); title.setTypeface(null, Typeface.BOLD); gap(12);
        if (store.blocked()) {
            addText("Acceso no disponible", 21, GOLD); gap(12);
            addText("Los datos declarados no cumplen la edad requerida para tu país de residencia. No se conectó Telegram desde esta pantalla. Podrás volver a declarar tus datos cuando transcurran 24 horas desde la comprobación.", 16, INK);
            gap(12); addText("Esta espera no cambia el requisito de edad. Si ya tenías una sesión de Telegram, se conserva sin abrirla; no ha sido revocada. Puedes revocarla desde Dispositivos en el cliente oficial.", 14, MUTED);
        } else {
            addText("Indica tus datos para comprobar si puedes usar esta app en tu región. Es una autodeclaración, no una verificación de identidad.", 16, INK); gap(16);
            TextView label = addText("País o territorio de residencia habitual", 15, INK);
            residence = new Spinner(this); residence.setId(R.id.age_country); residence.setSaveEnabled(false); residence.setContentDescription("País o territorio de residencia habitual"); label.setLabelFor(residence.getId());
            countries.clear(); countries.add(""); List<String> sorted = new ArrayList<>(AgePolicy.COUNTRIES); Locale spanish = Locale.forLanguageTag("es"); Collator order = Collator.getInstance(spanish);
            sorted.sort((a, b) -> order.compare(new Locale("", a).getDisplayCountry(spanish), new Locale("", b).getDisplayCountry(spanish))); countries.addAll(sorted);
            List<String> names = new ArrayList<>(); names.add("Selecciona tu país o territorio");
            for (String code : sorted) names.add(new Locale("", code).getDisplayCountry(spanish));
            ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, names); adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); residence.setAdapter(adapter);
            body.addView(residence, new LinearLayout.LayoutParams(-1, dp(56))); gap(16);
            addText("Fecha de nacimiento", 15, INK); gap(8);
            LinearLayout date = new LinearLayout(this); date.setOrientation(LinearLayout.HORIZONTAL);
            day = dateField(date, "Día", 2, R.id.age_day); month = dateField(date, "Mes", 2, R.id.age_month); year = dateField(date, "Año", 4, R.id.age_year); body.addView(date); gap(12);
            addText("La fecha se usa solo en memoria: no se guarda ni se envía. Guardamos cifrados el país declarado, el resultado, la fecha de comprobación y la versión de la regla, sin asociarlos a tu cuenta de Telegram. La aprobación se renueva cada 30 días y debes actualizarla si cambia tu residencia. Un resultado no apto impide nuevos intentos durante 24 horas.", 13, MUTED); gap(16);
            error = addText("", 14, 0xffffb4ab); error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
            button("Continuar", this::confirm); gap(8);
        }
        button("Condiciones y reglas de edad", () -> Dialogs.builder(this).setTitle("Reglas regionales")
            .setMessage("El público previsto es 13+ donde esté permitido. En la Unión Europea, Reino Unido y Australia aplicamos 18+ según los términos de Telegram, incluidos los territorios de la UE recogidos en la regla local. Deben cumplirse además las normas locales. No inferimos tu residencia por idioma, teléfono, SIM, GPS ni dirección IP. Una declaración incorrecta puede eludir este control: no es verificación documental ni garantiza cumplimiento legal.")
            .setPositiveButton("Entendido", null).setNeutralButton("Términos de Telegram", (dialog, which) -> link("https://telegram.org/tos")).show()); gap(8);
        button("Privacidad de esta comprobación", () -> Dialogs.builder(this).setTitle("Datos de edad y residencia")
            .setMessage("Responsable: Rodrigo Olmos, Chile. Contacto: ridrogo@gmail.com. El control es local, sin llamadas de red. No guardamos fecha de nacimiento ni edad exacta. El resultado y país están cifrados con una clave propia de Android Keystore, fuera de las copias de seguridad. Una declaración nueva sustituye la anterior; borrar los datos de la app elimina el registro, pero también los datos locales de Telegram. No lo hagas para evitar requisitos. Desinstalar no revoca la sesión remota. Esta comprobación no verifica identidad.")
            .setPositiveButton("Cerrar", null).show()); gap(8);
        button("Salir", this::finishAndRemoveTask);
        setContentView(scroll); scroll.requestApplyInsets();
    }

    private void confirm() {
        try {
            String code = countries.get(residence.getSelectedItemPosition());
            LocalDate birth = LocalDate.of(Integer.parseInt(year.getText().toString()), Integer.parseInt(month.getText().toString()), Integer.parseInt(day.getText().toString()));
            AgePolicy.eligible(code, birth, LocalDate.now());
            String countryName = new Locale("", code).getDisplayCountry(Locale.forLanguageTag("es"));
            AlertDialog review = Dialogs.builder(this).setTitle("Revisa tus datos")
                .setMessage("Residencia: " + countryName + "\nFecha de nacimiento: " + birth + "\n\nConfirma que estos datos son correctos. Se aplicarán los requisitos regionales y las condiciones de Telegram.")
                .setNegativeButton("Corregir", null).setPositiveButton("Confirmar datos", (dialog, which) -> {
                    try { store.declare(code, birth); ((WrgramApplication) getApplication()).scheduleAgeExpiry(); clearDate(); if (store.allowed()) enter(); else show(); }
                    catch (Exception ignored) { clearDate(); if (error != null) error.setText(R.string.age_gate_save_error); }
                }).create();
            review.show(); if (review.getWindow() != null) review.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } catch (RuntimeException ignored) { error.setText(R.string.age_gate_invalid_input); }
    }
    private void clearDate() { if (day != null) { day.setText(""); month.setText(""); year.setText(""); } }
    private void enter() {
        if (leaving || !store.allowed()) return;
        leaving = true; clearDate();
        startActivity(new Intent(this, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK)); finish();
    }
    @Override protected void onStop() { clearDate(); super.onStop(); }
    @Override public void trackDialog(android.app.Dialog dialog) { dialogs.trackDialog(dialog); }
    @Override protected void onDestroy() { dialogs.closeAll(); super.onDestroy(); }
    private void link(String url) { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (android.content.ActivityNotFoundException ignored) { } }
    private EditText dateField(LinearLayout row, String hint, int maximum, int id) {
        EditText field = new EditText(this); field.setId(id); field.setHint(hint); field.setContentDescription(hint + " de nacimiento"); field.setTextColor(INK); field.setHintTextColor(MUTED);
        field.setInputType(InputType.TYPE_CLASS_NUMBER); field.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maximum)}); field.setSingleLine(true); field.setSaveEnabled(false); field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); field.setPrivateImeOptions("nm"); field.setImeOptions(android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(0, dp(60), 1); size.setMargins(0, 0, dp(8), 0); row.addView(field, size); return field;
    }
    private TextView addText(String content, int size, int color) { TextView text = new TextView(this); text.setText(content); text.setTextSize(size); text.setTextColor(color); text.setLineSpacing(dp(3), 1); text.setSaveEnabled(false); body.addView(text); return text; }
    private void button(String label, Runnable action) { Button button = new Button(this); button.setText(label); button.setAllCaps(false); button.setTextColor(GOLD); GradientDrawable shape = new GradientDrawable(); shape.setColor(0xff242320); shape.setCornerRadius(dp(12)); button.setBackground(shape); LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2); size.setMargins(0, dp(8), 0, 0); button.setMinHeight(dp(52)); body.addView(button, size); button.setOnClickListener(view -> action.run()); }
    private void gap(int height) { body.addView(new View(this), new LinearLayout.LayoutParams(1, dp(height))); }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + .5f); }
}
