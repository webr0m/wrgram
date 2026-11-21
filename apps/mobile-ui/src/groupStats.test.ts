import { describe, expect, it } from 'vitest';
import { CHANNEL_STAT_IDS, GROUP_STAT_IDS, isPercent, readableStats, statDate, statGrowth, statGrowthLabel, statValue } from './groupStats';
import type { ChatStatCard } from './contract';

/**
 * Lo que la pantalla calcula por su cuenta sobre las estadísticas de una comunidad (ronda CA): elegir las fichas que
 * sabe nombrar, darles formato, deducir el crecimiento y fechar el periodo. Son funciones puras, así que se comprueban
 * aquí en vez de esperar a verlas dibujadas —y la tabla de quien más escribe pasa por el mismo tamiz que las fichas:
 * el filtro de `id` desconocidos es lo que impide que un número sin nombre se enseñe con una etiqueta adivinada—.
 */
const card = (id: string, value: number, previous?: number): ChatStatCard =>
  previous === undefined ? { id, value } : { id, value, previous };

describe('las fichas que la pantalla sabe nombrar', () => {
  it('descarta la id que no está en el catálogo y la que no es un número', () => {
    const leidas = readableStats([card('members', 10), card('nadieSabeQueEs', 99), card('viewers', Number.NaN)], 'group');
    expect(leidas.map(item => item.id)).toEqual(['members']);
  });

  it('conserva el orden en que la biblioteca mandó las fichas y solo deja las del tipo que toca', () => {
    const revueltas = [...CHANNEL_STAT_IDS].reverse().map(id => card(id, 5));
    expect(readableStats(revueltas, 'channel').map(item => item.id)).toEqual([...CHANNEL_STAT_IDS].reverse());
    // `members` es la única ficha que las dos listas comparten, y viaja al final cuando la biblioteca la manda al final.
    expect(readableStats(revueltas, 'group').map(item => item.id)).toEqual(['members']);
    const deGrupo = [...GROUP_STAT_IDS].reverse().map(id => card(id, 5));
    expect(readableStats(deGrupo, 'group').map(item => item.id)).toEqual([...GROUP_STAT_IDS].reverse());
    expect(readableStats(deGrupo, 'channel').map(item => item.id)).toEqual(['members']);
  });
});

describe('el formato de una cifra', () => {
  it('agrupa las cuentas sin decimales y deja el porcentaje con uno y su espacio', () => {
    expect(statValue(card('members', 1200)).replace(/\D/g, '')).toBe('1200');
    expect(statValue(card('notifications', 64.5))).toBe('64,5 %');
    expect(isPercent(card('members', 1200))).toBe(false);
    expect(isPercent(card('notifications', 64.5))).toBe(true);
  });

  it('no redondea una cuenta a fracción, aunque la biblioteca mande un quebrado', () => {
    expect(statValue(card('messages', 1400.4)).replace(/\D/g, '')).toBe('1400');
  });
});

describe('el crecimiento', () => {
  it('sale de la cifra actual y la anterior, y se queda sin flecha si la anterior no está', () => {
    expect(statGrowth(card('members', 1200, 1000))).toBeCloseTo(20, 6);
    expect(statGrowth(card('members', 1000, 1200))).toBeCloseTo(-16.6667, 3);
    expect(statGrowth(card('members', 1000))).toBeUndefined();
    expect(statGrowth(card('members', 1000, 0))).toBeUndefined();
    expect(statGrowth(card('members', 1000, -5))).toBeUndefined();
    expect(statGrowth(card('members', 1000, Number.NaN))).toBeUndefined();
  });

  it('dice la subida, la bajada y el casi igual con la misma coma decimal', () => {
    expect(statGrowthLabel(20)).toBe('▲ 20,0 %');
    expect(statGrowthLabel(-0.5)).toBe('▼ 0,5 %');
    expect(statGrowthLabel(0.04)).toBe('sin cambio');
    expect(statGrowthLabel(-0.04)).toBe('sin cambio');
    expect(statGrowthLabel(0)).toBe('sin cambio');
  });
});

describe('el periodo', () => {
  it('pasa de fecha ISO a fecha española y calla cuando el puente no mandó nada válido', () => {
    expect(statDate('2026-10-20')).toBe('20/10/2026');
    expect(statDate('2026-1-20')).toBe('');
    expect(statDate('2026-10-20T00:00:00Z')).toBe('');
    expect(statDate(undefined)).toBe('');
    expect(statDate('')).toBe('');
  });
});
