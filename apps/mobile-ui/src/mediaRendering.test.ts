import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY, type Media } from './contract';

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('./bridge', () => ({
  native: true,
  mediaUrl: (id: number) => `https://media.wrgram.test/media/${id}`,
  request: vi.fn(),
  subscribe: vi.fn(),
  snapshot: () => ({ ...EMPTY, selfId: '1', platform: 'desktop', mediaReady: [7] }),
}));
vi.mock('./TgsSticker', () => ({ TgsSticker: () => 'TGS animation' }));

const { MediaView } = await import('./MediaView');

describe('presentación de stickers recibidos en Windows', () => {
  it.each(['image/webp', 'image/png'])('muestra el sticker %s con el lector de imágenes', mime => {
    const media: Media = { id: 7, ready: true, kind: 'sticker', mime, name: 'Sticker', size: 1200 };
    const html = renderToStaticMarkup(createElement(MediaView, { media, eager: true }));
    expect(html).toContain('<img');
    expect(html).toContain('https://media.wrgram.test/media/7');
    expect(html).not.toContain('TGS animation');
  });

  it('conserva el reproductor de animación para los stickers TGS', () => {
    const media: Media = { id: 7, ready: true, kind: 'sticker', mime: 'application/x-tgsticker', name: 'Sticker', size: 1200 };
    const html = renderToStaticMarkup(createElement(MediaView, { media, eager: true }));
    expect(html).toContain('TGS animation');
    expect(html).not.toContain('<img');
  });
});
