import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InboxTabBar } from './InboxTabBar';
import { InboxTabDisplayPicker, InboxTabIcon } from './InboxTabs';
import type { InboxTab } from './chatFilters';

vi.mock('./language', () => ({ useLanguage: () => ({ t: (text: string) => text }) }));
vi.mock('./bridge', () => ({ native: false, request: vi.fn(), snapshot: () => ({}), subscribe: vi.fn() }));

const renderBar = (tabs: InboxTab[], unread = 0) => renderToStaticMarkup(h(InboxTabBar, {
  tabs, active: tabs[0]?.id ?? '', unread, choose: () => {}, manage: () => {},
}));
const buttonBody = (html: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<button\\b[^>]*aria-label="${escaped}"[^>]*>([\\s\\S]*?)<\\/button>`));
  if (!match) throw new Error('No se encontró el botón accesible ' + label);
  return match[1];
};

describe('presentación de pestañas', () => {
  it('oculta el nombre visualmente en modo icono sin perder el nombre accesible ni el contador', () => {
    const html = renderBar([{ id: 'unread', name: 'No leídos', icon: 'plus', display: 'icon' }], 3);
    const body = buttonBody(html, 'No leídos · 3');
    expect(html).toContain('inbox-tab-icon-only');
    expect(body).toContain('lucide-plus');
    expect(body).toContain('>3</span>');
    expect(body).not.toContain('>No leídos<');
  });

  it('pinta el icono antes del nombre en modo icono y nombre', () => {
    const html = renderBar([{ id: 'all', name: 'Trabajo', icon: 'hash', display: 'iconName' }]);
    expect(html.indexOf('lucide-hash')).toBeLessThan(html.indexOf('>Trabajo<'));
    expect(html).not.toContain('inbox-tab-icon-only');
  });

  it('ofrece Plus, WRGram y los iconos normales como pictogramas reales', () => {
    const html = renderBar([
      { id: 'all', name: 'Plus', icon: 'plus', display: 'icon' },
      { id: 'unread', name: 'Marca', icon: 'wrgram', display: 'icon' },
      { id: 'groups', name: 'Grupos', icon: 'users', display: 'icon' },
    ]);
    expect(buttonBody(html, 'Plus')).toContain('lucide-plus');
    expect(buttonBody(html, 'Marca')).toContain('inbox-tab-brand');
    expect(buttonBody(html, 'Grupos')).toContain('lucide-users');
  });

  it('usa la inicial cuando se elige solo icono sin seleccionar un pictograma', () => {
    const body = buttonBody(renderBar([{ id: 'all', name: 'Sin icono', display: 'icon' }]), 'Sin icono');
    expect(body).toContain('class="inbox-tab-initial"');
    expect(body).toContain('>S</span>');
  });

  it('mantiene los emojis existentes como etiquetas de solo icono', () => {
    const body = buttonBody(renderBar([{ id: 'all', name: 'Favoritos', emoji: { kind: 'preset', id: 'star' } }]), 'Favoritos');
    expect(body).toContain('inbox-tab-emoji');
    expect(body).toContain('⭐');
    expect(body).not.toContain('>Favoritos<');
  });

  it('el selector marca un único modo y conserva el orden icono y nombre', () => {
    const html = renderToStaticMarkup(h(InboxTabDisplayPicker, { value: 'icon', change: () => {} }));
    expect(html).toContain('aria-label="Presentación del icono"');
    expect(html).toContain('aria-pressed="false">Icono y nombre</button>');
    expect(html).toContain('aria-pressed="true">Solo icono</button>');
  });

  it('reserva 40 px para una pestaña nombrada de un carácter sin icono', () => {
    const html = renderBar([{ id: 'all', name: 'A' }]);
    expect(html).toContain('<span class="inbox-tab-name">A</span>');
    expect(html).not.toContain('inbox-tab-icon-only');
    const css = readFileSync(new URL('./inbox.css', import.meta.url), 'utf8');
    const rule = css.match(/\.inbox-tab\s*\{([^}]*)\}/)?.[1];
    expect(rule).toMatch(/min-width:\s*40px/);
  });

  it('conecta Lectores con la política de plataforma en escritorio y Android', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app.includes('canShowMessageReaders(message.outgoing,active,desktop)')).toBe(true);
    expect(app.includes('canShowMessageReaders(message.outgoing,active,false)')).toBe(true);
  });

  it('conecta el cierre tardío con la identidad del gestor sin bloquear las preferencias', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app.includes("const managerDialog:Dialog={title:'Administrar pestañas'")).toBe(true);
    expect(app.includes('setDialog(managerDialog);')).toBe(true);
    expect(app.includes('completeInboxTabsSave(dialogRef.current,managerDialog,snapshot().selfId===owner,()=>setTabPrefs({owner,tabs:saved}),()=>setDialog(undefined))')).toBe(true);
    expect(app.includes("if(snapshot().selfId!==owner)return false;")).toBe(true);
  });

  it('el icono WRGram reutiliza la marca compartida y es decorativo', () => {
    const html = renderToStaticMarkup(h(InboxTabIcon, { icon: 'wrgram' }));
    expect(html).toContain('inbox-tab-brand');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<svg');
  });
});
