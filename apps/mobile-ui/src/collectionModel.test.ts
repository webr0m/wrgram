import { describe, expect, it } from 'vitest';
import { appendCollection, calendarDays, dayBounds } from './collectionModel';

describe('paginación de colecciones', () => {
  it('une páginas solapadas sin redondear identificadores largos', () => {
    const first = { id: '9007199254740992', title: 'Primero' };
    const second = { id: '9007199254740993', title: 'Segundo' };
    const updated = { ...second, title: 'Actualizado' };
    expect(appendCollection([first, second], [updated])).toEqual([first, updated]);
  });
});

describe('calendario multimedia', () => {
  it('muestra el 29 en febrero bisiesto y empieza la semana en lunes', () => {
    const result = calendarDays(new Date(2024, 1, 1));
    expect(result.padding).toBe(3);
    expect(result.days.at(-1)).toBe('2024-02-29');
    expect(dayBounds('2025-02-29')).toBeUndefined();
  });

  it('consulta desde la medianoche local hasta la siguiente sin suponer 24 horas', () => {
    expect(dayBounds('2024-04-06')).toEqual({
      from: new Date(2024, 3, 6).getTime() / 1000,
      until: new Date(2024, 3, 7).getTime() / 1000,
    });
  });
});
