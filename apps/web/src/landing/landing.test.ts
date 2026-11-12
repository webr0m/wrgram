import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';
import { THEMES } from '@wrgram/design-tokens';

const html = renderToStaticMarkup(createElement(LandingPage));
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('landing y nueva identidad', () => {
  it('separa la landing indexable de la demo en /app/', () => {
    const landing = read('../../index.html');
    const app = read('../../app/index.html');
    expect(landing).toContain('/src/landing.tsx');
    expect(landing).toContain('content="index, follow"');
    expect(app).toContain('/src/main.tsx');
    expect(app).toContain('content="noindex, nofollow"');
    expect(html).toContain('href="/app/"');
    expect(html).not.toContain('href="/src/');
  });

  it('anuncia Android en prueba cerrada, iOS próximo y todos los contactos en el bot', () => {
    const stores = html.match(/<button class="lp-store-badge"[^>]*>/g) ?? [];
    expect(stores).toHaveLength(4);
    expect(stores.every((button) => button.includes('disabled=""'))).toBe(true);
    expect(html).toContain('PRÓXIMAMENTE EN</small><strong>App Store');
    expect(html).toContain('PRUEBA CERRADA EN</small><strong>Google Play');
    expect(html).not.toContain('PRÓXIMAMENTE EN</small><strong>Google Play');
    const telegramLinks = html.match(/href="https:\/\/t\.me\/[^\"]+"/g) ?? [];
    expect(telegramLinks.length).toBeGreaterThanOrEqual(4);
    expect(telegramLinks.every((href) => href === 'href="https://t.me/webrom_bot"')).toBe(true);
  });

  it('ofrece los ocho temas y la vista previa negra/dorada por defecto', () => {
    for (const theme of THEMES) expect(html).toContain(`lp-swatch-${theme.id}`);
    expect(html).toContain('data-theme-choice="gold"');
    expect(html).toContain('lp-swatch-gold lp-theme-selected');
    expect(html).toContain('Día y noche. Tú eliges.');
    expect(html).toContain('/brand/wrgram-icon.svg');
  });

  it('declara los límites públicos y resuelve los enlaces internos', () => {
    expect(html).toContain('Sin conexión a Telegram');
    expect(html).toContain('Generación aún deshabilitada');
    expect(html).toContain('no afiliado ni avalado por Telegram');
    const ids = new Set([...html.matchAll(/\sid="([^\"]+)"/g)].map((match) => match[1]));
    for (const match of html.matchAll(/href="#([^\"]+)"/g)) expect(ids.has(match[1])).toBe(true);
  });
});
