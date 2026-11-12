import { describe, expect, it, vi } from 'vitest';

// formatting.tsx importa CustomEmoji, que arranca bridge.ts y su `window`; aquí solo se prueba el analizador.
vi.mock('./CustomEmoji', () => ({ CustomEmoji: () => null }));
const { parseFormatting } = await import('./formatting');

describe('parseFormatting: texto e entidades para Telegram', () => {
  it('levanta cada marcador y lo quita del texto enviado', () => {
    expect(parseFormatting('**n** __i__ ~~s~~ ||p|| `c`')).toEqual({
      text: 'n i s p c',
      entities: [
        { type: 'bold', offset: 0, length: 1 },
        { type: 'italic', offset: 2, length: 1 },
        { type: 'strikethrough', offset: 4, length: 1 },
        { type: 'spoiler', offset: 6, length: 1 },
        { type: 'code', offset: 8, length: 1 },
      ],
    });
  });

  it('el bloque de tres acentos permite saltos de línea y guarda el idioma', () => {
    const { text, entities } = parseFormatting('```uno\ndos```');
    expect(text).toBe('uno\ndos');
    expect(entities).toEqual([{ type: 'pre', offset: 0, length: 7 }]);
  });

  it('el código en línea rechaza contenido multilínea y lo deja literal', () => {
    expect(parseFormatting('a `b\nc` d')).toEqual({ text: 'a `b\nc` d', entities: [] });
  });

  it('la barra invertida escapa el carácter siguiente y no levanta entidad', () => {
    expect(parseFormatting('\\**literal** \\_x\\_')).toEqual({ text: '**literal** _x_', entities: [] });
    expect(parseFormatting('\\*no\\*')).toEqual({ text: '*no*', entities: [] });
    expect(parseFormatting('\\`c\\`')).toEqual({ text: '`c`', entities: [] });
  });

  it('convierte el enlace markdown en entidad link con su url', () => {
    expect(parseFormatting('mira [WRGram](https://webrom.cc) hoy')).toEqual({
      text: 'mira WRGram hoy',
      entities: [{ type: 'link', offset: 5, length: 6, url: 'https://webrom.cc' }],
    });
  });

  it('acepta tg:// y descarta esquemas que no sean http, https o tg', () => {
    expect(parseFormatting('[a](tg://proxy?x=1)').entities).toEqual([{ type: 'link', offset: 0, length: 1, url: 'tg://proxy?x=1' }]);
    expect(parseFormatting('[a](javascript:alert(1))')).toEqual({ text: '[a](javascript:alert(1))', entities: [] });
    expect(parseFormatting('[a](data:text/html,x)')).toEqual({ text: '[a](data:text/html,x)', entities: [] });
    expect(parseFormatting('[a](//webrom.cc)')).toEqual({ text: '[a](//webrom.cc)', entities: [] });
  });

  it('descarta enlaces vacíos, sin etiqueta o con url de más de 2048 caracteres', () => {
    expect(parseFormatting('[a]()')).toEqual({ text: '[a]()', entities: [] });
    expect(parseFormatting('[  ](https://webrom.cc)')).toEqual({ text: '[  ](https://webrom.cc)', entities: [] });
    expect(parseFormatting(`[a](https://webrom.cc/${'x'.repeat(2100)})`).entities).toEqual([]);
  });

  it('mide offset y longitud en unidades UTF-16, como TDLib', () => {
    const { text, entities } = parseFormatting('👀 **hola**');
    expect(text).toBe('👀 hola');
    expect([...text].length).toBe(6);
    expect(text.length).toBe(7);
    expect(entities).toEqual([{ type: 'bold', offset: 3, length: 4 }]);
  });

  it('deja literales los marcadores sin cerrar y los pares vacíos', () => {
    expect(parseFormatting('**sin cerrar')).toEqual({ text: '**sin cerrar', entities: [] });
    expect(parseFormatting('****')).toEqual({ text: '****', entities: [] });
  });

  // Límite conocido, fijado aquí: el analizador es plano, la entidad de fuera absorbe el texto de dentro
  // y FormattedText ya soporta solapamientos, así que anidar sería un arreglo acotado.
  it('anida solapando: la entidad exterior manda y la interior conserva su trozo', () => {
    expect(parseFormatting('**fuera __dentro__**')).toEqual({ text: 'fuera dentro', entities: [{ type: 'bold', offset: 0, length: 12 }, { type: 'italic', offset: 6, length: 6 }] });
    expect(parseFormatting('**[a](https://webrom.cc)**')).toEqual({ text: 'a', entities: [{ type: 'bold', offset: 0, length: 1 }, { type: 'link', offset: 0, length: 1, url: 'https://webrom.cc' }] });
    expect(parseFormatting('~~**a** b~~')).toEqual({ text: 'a b', entities: [{ type: 'strikethrough', offset: 0, length: 3 }, { type: 'bold', offset: 0, length: 1 }] });
  });

  it('dentro de código o bloque pre nada se formatea', () => {
    expect(parseFormatting('**`a __b__`**')).toEqual({ text: 'a __b__', entities: [{ type: 'bold', offset: 0, length: 7 }, { type: 'code', offset: 0, length: 7 }] });
    expect(parseFormatting('```\n**x**\n```')).toEqual({ text: '\n**x**\n', entities: [{ type: 'pre', offset: 0, length: 7 }] });
  });
});
