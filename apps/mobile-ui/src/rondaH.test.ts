import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const allowed = java('BridgePolicy');
const snapshot = java('NativeSnapshot');
const appearance = ui('AppearanceSettings.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const polish = ui('visual-polish.css');

describe('Ronda H en el puente', () => {
  it('appearance.systemPalette está en la lista de permitidos y en el despachador', () => {
    expect(allowed).toContain('"appearance.systemPalette"');
    expect(bridge).toContain('case "appearance.systemPalette":systemPalette(p,a);break;');
  });

  it('la paleta dinámica exige Android 12 y lee los tonos Material You del sistema', () => {
    expect(bridge).toContain('android.os.Build.VERSION.SDK_INT<31');
    expect(bridge).toContain('El color dinámico del sistema necesita Android 12 o superior.');
    expect(bridge).toContain('UI_MODE_NIGHT_MASK');
    expect(bridge).toContain('android.R.color.system_accent1_300');
    expect(bridge).toContain('android.R.color.system_accent1_600');
    expect(bridge).toContain('android.R.color.system_accent1_100');
    expect(bridge).toContain('android.R.color.system_accent2_700');
    expect(bridge).toContain('android.R.color.system_neutral1_900');
    expect(bridge).toContain('android.R.color.system_neutral1_50');
    expect(bridge).toContain('String.format("#%06X",color&0xFFFFFF)');
  });

  it('appearance valida y persiste la navegación bar|side', () => {
    expect(bridge).toContain('BridgePolicy.text(p,"navigation",4)');
    expect(bridge).toContain('navigation.matches("bar|side")');
    expect(bridge).toContain('edit.putString("navigation",navigation)');
  });

  it('el snapshot serializa la navegación', () => {
    expect(snapshot).toContain('"side".equals(prefs.getString("navigation","bar"))?"side":"bar"');
  });
});

describe('Ronda H en la interfaz', () => {
  it('el contrato expone navigation bar|side', () => {
    expect(contract).toContain("navigation?: 'bar'|'side'");
  });

  it('la apariencia aplica la paleta del sistema como tema personalizado', () => {
    expect(appearance).toContain("'appearance.systemPalette'");
    expect(appearance).toContain("'Sistema · Material You'");
    expect(appearance).toContain("base: palette.scheme === 'dark' ? 'night' : 'day'");
    expect(appearance).toContain('Color dinámico del sistema');
    expect(appearance).toContain('Material You');
  });

  it('la apariencia ofrece navegación inferior o lateral sin cambiar de tema', () => {
    expect(appearance).toContain('aria-label="Navegación"');
    expect(appearance).toContain("'Barra inferior'");
    expect(appearance).toContain("'Lateral'");
    expect(appearance).toContain("{ navigation: id }");
  });

  it('App cambia el layout de la barra de navegación al modo lateral', () => {
    expect(app).toContain("state.appearance.navigation==='side'?'nav-side':''");
    expect(app).toContain("state.appearance.navigation==='side'?'mobile-nav mobile-nav-side':'mobile-nav'");
  });

  it('el CSS coloca la navegación lateral y libera el contenido', () => {
    expect(polish).toContain('.workspace.nav-side{padding-bottom:0;padding-left:66px}');
    expect(polish).toContain('.mobile-nav.mobile-nav-side{top:0;bottom:0;right:auto;width:66px;height:auto;flex-direction:column;border-top:none;border-right:1px solid var(--line);padding:8px 3px 6px}');
  });
});
