import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request, snapshot } = vi.hoisted(() => ({ request: vi.fn(), snapshot: vi.fn(() => ({ selfId: '1' })) }));
vi.mock('./bridge', () => ({ request, snapshot }));

const owner = (selfId: string) => snapshot.mockReturnValue({ selfId });
const deferred = () => {
  let resolve = (_: unknown) => {}, reject = (_: unknown) => {};
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
// La cola reacciona en microtareas (finally del request); un tick de eventos las agota todas.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const cargar = async () => { vi.resetModules(); return (await import('./mediaQueue')).loadMedia; };

beforeEach(() => {
  request.mockReset();
  snapshot.mockReturnValue({ selfId: '1' });
  vi.resetModules();
});

describe('cola de descargas de miniaturas', () => {
  it('une dos peticiones simultáneas del mismo identificador y cuenta', async () => {
    const loadMedia = await cargar();
    const job = deferred();
    request.mockReturnValue(job.promise);
    const first = loadMedia(7), second = loadMedia(7);
    expect(first).toBe(second);
    expect(request.mock.calls.filter(call => call[0] === 'media.load')).toHaveLength(1);
    job.resolve({ kind: 'done' });
    expect(await first).toEqual({ kind: 'done' });
  });

  it('no lanza más de cuatro peticiones a la vez y va liberando plazas', async () => {
    const loadMedia = await cargar();
    const jobs = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, deferred()]));
    request.mockImplementation((_method: string, args: { id: number }) => jobs.get(args.id)!.promise);
    const promises = [1, 2, 3, 4, 5, 6].map(id => loadMedia(id));
    expect(request).toHaveBeenCalledTimes(4);
    jobs.get(1)!.resolve('a');
    await flush();
    expect(request).toHaveBeenCalledTimes(5);
    jobs.get(2)!.resolve('b');
    await flush();
    expect(request).toHaveBeenCalledTimes(6);
    for (const id of [3, 4, 5, 6]) jobs.get(id)!.resolve('ok');
    expect(await Promise.all(promises)).toEqual(['a', 'b', 'ok', 'ok', 'ok', 'ok']);
  });

  it('separa la caché por cuenta y vuelve a pedir tras terminar', async () => {
    const loadMedia = await cargar();
    const job = deferred();
    request.mockReturnValue(job.promise);
    owner('1');
    const una = loadMedia(9);
    owner('2');
    const otra = loadMedia(9);
    expect(una).not.toBe(otra);
    expect(request).toHaveBeenCalledTimes(2);
    job.resolve('x');
    await Promise.all([una, otra]);
    loadMedia(9);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('descarta el trabajo encolado si la cuenta cambió antes de empezar', async () => {
    const loadMedia = await cargar();
    const jobs = new Map(Array.from({ length: 5 }, (_, i) => [i + 1, deferred()]));
    request.mockImplementation((_method: string, args: { id: number }) => jobs.get(args.id)!.promise);
    [1, 2, 3, 4].forEach(id => loadMedia(id));
    expect(request).toHaveBeenCalledTimes(4);
    const enCola = loadMedia(5);
    const rechazado = expect(enCola).rejects.toThrow('La cuenta cambió.');
    owner('otro-slot');
    jobs.get(1)!.resolve('libre');
    await flush();
    expect(request).toHaveBeenCalledTimes(4);
    await rechazado;
    jobs.get(2)!.resolve('ok'); jobs.get(3)!.resolve('ok'); jobs.get(4)!.resolve('ok');
  });

  it('propaga el fallo y deja la plaza libre para reintentar', async () => {
    const loadMedia = await cargar();
    request.mockRejectedValueOnce(new Error('TDLib rechazó el archivo.'));
    await expect(loadMedia(3)).rejects.toThrow('TDLib rechazó el archivo.');
    const retry = deferred();
    request.mockReturnValueOnce(retry.promise);
    const second = loadMedia(3);
    expect(request).toHaveBeenCalledTimes(2);
    retry.resolve('ok');
    expect(await second).toBe('ok');
  });

  it('no deja rechazos sin gestionar al fallar una descarga', async () => {
    const loadMedia = await cargar();
    const vistos: unknown[] = [];
    const listener = (reason: unknown) => vistos.push(reason);
    process.on('unhandledRejection', listener);
    request.mockRejectedValueOnce(new Error('SinPermited'));
    await expect(loadMedia(11)).rejects.toThrow('SinPermited');
    await flush();
    process.off('unhandledRejection', listener);
    expect(vistos).toEqual([]);
  });

  it('atiende la cola en el orden en que se pidieron las miniaturas', async () => {
    const loadMedia = await cargar();
    const jobs = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, deferred()]));
    const orden: number[] = [];
    request.mockImplementation((_method: string, args: { id: number }) => { orden.push(args.id); return jobs.get(args.id)!.promise; });
    [1, 2, 3, 4, 5, 6].forEach(id => loadMedia(id));
    jobs.get(1)!.resolve('a');
    await flush();
    jobs.get(2)!.resolve('b');
    await flush();
    expect(orden).toEqual([1, 2, 3, 4, 5, 6]);
    for (const id of [3, 4, 5, 6]) jobs.get(id)!.resolve('ok');
    await flush();
  });
});
