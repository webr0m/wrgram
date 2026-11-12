import { describe, expect, it } from 'vitest';
import type { Chat } from './contract';
import { endOfLocalDate, filterChats, visibleRows } from './inboxModel';

function chat(id: string, title: string, overrides: Partial<Chat> = {}): Chat {
  return { id, title, date: 0, preview: '', unread: 0, marked: false, bot: false, type: 'private', pinned: false, muted: false, archived: false, supported: true, ...overrides };
}

describe('bandeja de conversaciones', () => {
  it('encuentra nombres sin tildes y combina términos con el nombre de usuario', () => {
    const maria = chat('1', 'María Fernández', { username: 'maria_fdz' });
    const chats = [chat('2', 'Mariana'), maria];
    expect(filterChats(chats, 'all', 'FERNANDEZ  @maria_fdz', false)).toEqual([maria]);
  });

  it('respeta la pertenencia de un chat archivado a una carpeta de Telegram', () => {
    const archived = chat('1', 'Archivo', { archived: true, unread: 2 });
    const marked = chat('2', 'Pendiente', { marked: true });
    expect(filterChats([archived, marked], 'unread', '', false)).toEqual([marked]);
    expect(filterChats([archived, marked], 'archive', '', false)).toEqual([archived]);
    expect(filterChats([archived, marked], 'folder:12', '', false)).toEqual([archived, marked]);
  });

  it('cubre el alto real de la ventana y ajusta el rango al reducir resultados', () => {
    expect(visibleRows(100, 2100, 0, 70)).toEqual({ start: 0, end: 33 });
    expect(visibleRows(4, 700, 3000, 70)).toEqual({ start: 0, end: 4 });
    expect(visibleRows(100, 700, 3500, 70)).toEqual({ start: 47, end: 63 });
  });
});

describe('salto por fecha', () => {
  const now = new Date(2026, 10, 10, 11, 45);

  it('consulta el final del día en la zona horaria local', () => {
    expect(endOfLocalDate('2026-11-09', now)).toBe(new Date(2026, 10, 9, 23, 59, 59).getTime() / 1000);
    expect(endOfLocalDate('2026-11-10', now)).toBe(now.getTime() / 1000);
  });

  it('rechaza fechas inexistentes, futuras y fuera del rango de TDLib', () => {
    expect(endOfLocalDate('2026-02-31', now)).toBe(0);
    expect(endOfLocalDate('2026-11-11', now)).toBe(0);
    expect(endOfLocalDate('1960-01-01', now)).toBe(0);
    expect(endOfLocalDate('2040-01-01', new Date(2041, 0, 1))).toBe(0);
  });
});
