import { describe, expect, it, vi } from 'vitest';
import { canShowMessageReaders, completeInboxTabsSave } from './inboxUiPolicy';

describe('política de Lectores', () => {
  it.each([
    ['Windows rechaza supergrupos', true, { type: 'group', supergroup: true }, true, false],
    ['Windows conserva grupos básicos', true, { type: 'group' }, true, true],
    ['Android conserva supergrupos', true, { type: 'group', supergroup: true }, false, true],
    ['Android conserva grupos básicos', true, { type: 'group' }, false, true],
    ['un mensaje entrante no muestra lectores', false, { type: 'group' }, false, false],
    ['un canal no muestra lectores', true, { type: 'channel' }, false, false],
    ['un chat privado no muestra lectores', true, { type: 'private' }, false, false],
    ['sin conversación no muestra lectores', true, undefined, false, false],
  ] as const)('%s', (_label, outgoing, chat, desktop, expected) => {
    expect(canShowMessageReaders(outgoing, chat, desktop)).toBe(expected);
  });
});

describe('cierre del guardado tardío de pestañas', () => {
  it('aplica preferencias sin cerrar un diálogo posterior', () => {
    const manager = { title: 'Administrar pestañas' };
    const later = { title: 'Ajustes' };
    const apply = vi.fn();
    const close = vi.fn();

    expect(completeInboxTabsSave(later, manager, true, apply, close)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('aplica preferencias y cierra el diálogo del gestor', () => {
    const manager = { title: 'Administrar pestañas' };
    const apply = vi.fn();
    const close = vi.fn();

    expect(completeInboxTabsSave(manager, manager, true, apply, close)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(apply.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
  });

  it('aplica preferencias aunque el gestor ya esté cerrado', () => {
    const manager = { title: 'Administrar pestañas' };
    const apply = vi.fn();
    const close = vi.fn();

    expect(completeInboxTabsSave(undefined, manager, true, apply, close)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('no aplica preferencias ni cierra si cambió la cuenta', () => {
    const manager = { title: 'Administrar pestañas' };
    const apply = vi.fn();
    const close = vi.fn();

    expect(completeInboxTabsSave(manager, manager, false, apply, close)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
