import { describe, expect, it } from 'vitest';
import { createReadReceiptFlow, type ReadReceiptScope } from './readReceipts';

type Dialog = { title: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness(initial: ReadReceiptScope = { account: '1', chat: '10', topic: 0 }) {
  let scope = initial;
  let current: Dialog | undefined;
  const flow = createReadReceiptFlow<string, Dialog>({
    scope: () => scope,
    current: () => current,
    show: next => { current = next; },
    clear: () => { current = undefined; },
  });
  return {
    flow,
    get current() { return current; },
    show: (next: Dialog | undefined) => { current = next; },
    move: (next: ReadReceiptScope) => { scope = next; },
  };
}

const loading: Dialog = { title: 'Consultando' };
const loaded = (value: string): Dialog => ({ title: value });
const failed = (_retry: () => void): void => {};

describe('flujo de lectura · una respuesta no reabre ni sustituye por su cuenta', () => {
  it('cerrar la consulta impide que su respuesta tardía vuelva a abrir el diálogo', async () => {
    const ui = harness();
    const response = deferred<string | undefined>();
    ui.flow(() => response.promise, loading, loaded, failed);
    expect(ui.current).toBe(loading);

    ui.show(undefined);
    response.resolve('Leído');
    await response.promise;

    expect(ui.current).toBeUndefined();
  });

  it('una consulta posterior gana aunque la primera termine después', async () => {
    const ui = harness();
    const first = deferred<string | undefined>();
    const second = deferred<string | undefined>();
    ui.flow(() => first.promise, loading, loaded, failed);
    ui.flow(() => second.promise, loading, loaded, failed);

    first.resolve('Primera');
    await first.promise;
    expect(ui.current).toBe(loading);

    second.resolve('Segunda');
    await second.promise;
    expect(ui.current).toEqual({ title: 'Segunda' });
  });

  it('al cambiar de cuenta, chat o tema se limpia solo el diálogo de carga propio', async () => {
    for (const next of [
      { account: '2', chat: '10', topic: 0 },
      { account: '1', chat: '11', topic: 0 },
      { account: '1', chat: '10', topic: 7 },
    ]) {
      const ui = harness();
      const response = deferred<string | undefined>();
      ui.flow(() => response.promise, loading, loaded, failed);
      ui.move(next);

      response.resolve('Leído');
      await response.promise;
      expect(ui.current).toBeUndefined();
    }
  });

  it('una respuesta caducada no cierra un diálogo ajeno que ya está abierto', async () => {
    const ui = harness();
    const response = deferred<string | undefined>();
    const other: Dialog = { title: 'Otro diálogo' };
    ui.flow(() => response.promise, loading, loaded, failed);
    ui.move({ account: '2', chat: '10', topic: 0 });
    ui.show(other);

    response.resolve('Leído');
    await response.promise;
    expect(ui.current).toBe(other);
  });

  it('el reintento vuelve a cargar y su respuesta sí actualiza el diálogo', async () => {
    const ui = harness();
    const first = deferred<string | undefined>();
    const second = deferred<string | undefined>();
    let attempts = 0;
    let retry: (() => void) | undefined;
    ui.flow(() => ++attempts === 1 ? first.promise : second.promise, loading, loaded, next => {
      retry = next;
      ui.show({ title: 'Fallo' });
    });

    first.resolve(undefined);
    await first.promise;
    expect(ui.current).toEqual({ title: 'Fallo' });

    retry!();
    expect(ui.current).toBe(loading);
    second.resolve('Reintento leído');
    await second.promise;
    expect(ui.current).toEqual({ title: 'Reintento leído' });
  });

  it('un reintento después de cambiar de conversación no consulta el id antiguo en la nueva', async () => {
    const ui = harness();
    let attempts = 0;
    let retry: (() => void) | undefined;
    ui.flow(() => { attempts++; return Promise.resolve(undefined); }, loading, loaded, next => {
      retry = next;
      ui.show({ title: 'Fallo' });
    });
    await Promise.resolve();
    expect(attempts).toBe(1);

    ui.move({ account: '1', chat: '11', topic: 0 });
    retry!();

    expect(attempts).toBe(1);
    expect(ui.current).toBeUndefined();
  });

  it('una promesa rechazada abre el diálogo de fallo y permite reintentar', async () => {
    const ui = harness();
    const response = deferred<string | undefined>();
    let retry: (() => void) | undefined;
    ui.flow(() => response.promise, loading, loaded, next => {
      retry = next;
      ui.show({ title: 'Fallo' });
    });

    response.reject(new Error('red caída'));
    await response.promise.catch(() => {});

    expect(ui.current).toEqual({ title: 'Fallo' });
    expect(retry).toBeTypeOf('function');
  });

  it('invalidar el flujo cierra su diálogo resuelto sin cerrar uno ajeno', async () => {
    const ui = harness();
    ui.flow(() => Promise.resolve('Leído'), loading, loaded, failed);
    await Promise.resolve();
    expect(ui.current).toEqual({ title: 'Leído' });

    ui.flow.invalidate();
    expect(ui.current).toBeUndefined();

    ui.flow(() => Promise.resolve('Leído'), loading, loaded, failed);
    await Promise.resolve();
    const other: Dialog = { title: 'Otro diálogo' };
    ui.show(other);
    ui.flow.invalidate();
    expect(ui.current).toBe(other);
  });
});
