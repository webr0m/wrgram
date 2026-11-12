import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeTopOverlay, isTopOverlay, overlayCount, registerOverlay } from './dialogs';

const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const allFiles = () => readdirSync(new URL('.', import.meta.url)).filter(name => /\.tsx?$/.test(name) && !name.includes('.test.'));
const components = () => allFiles().filter(name => name.endsWith('.tsx') && name !== 'dialogs.tsx');
const dialogs = () => components().filter(name => source(name).includes('role="dialog"'));

let open: (() => void)[] = [];
// Un montaje real desregistra al desmontarse; el fake imita ese ciclo de vida.
function mount(label: string, order: string[] = []) {
    const unregister = registerOverlay({ close: () => { order.push(label); unregister(); } });
    open.push(unregister);
    return unregister;
}
afterEach(() => { for (const close of open.splice(0).reverse()) close(); expect(overlayCount()).toBe(0); });

describe('pila de diálogos', () => {
    it('empieza vacía y avisa cuando no hay nada que cerrar', () => {
        expect(overlayCount()).toBe(0);
        expect(closeTopOverlay()).toBe(false);
    });

    it('cierra solo el último abierto, en orden inverso', () => {
        const order: string[] = [];
        mount('fondo', order);
        mount('arriba', order);
        expect(overlayCount()).toBe(2);
        expect(isTopOverlay({ close: () => {} })).toBe(false);
        expect(closeTopOverlay()).toBe(true);
        expect(closeTopOverlay()).toBe(true);
        expect(order).toEqual(['arriba', 'fondo']);
        expect(overlayCount()).toBe(0);
        expect(closeTopOverlay()).toBe(false);
    });

    it('desregistra al desmontar sin quitarle el turno a otro panel', () => {
        const fondo = { close: vi.fn() }, arriba = { close: vi.fn() };
        const offFondo = registerOverlay(fondo), offArriba = registerOverlay(arriba);
        offArriba(); offArriba();
        expect(overlayCount()).toBe(1);
        expect(isTopOverlay(fondo)).toBe(true);
        expect(closeTopOverlay()).toBe(true);
        expect(arriba.close).not.toHaveBeenCalled();
        expect(fondo.close).toHaveBeenCalledOnce();
        expect(overlayCount()).toBe(1);
        offFondo();
        expect(overlayCount()).toBe(0);
        open.push(offFondo, offArriba);
    });
});

describe('todos los paneles comparten el comportamiento', () => {
    it('cada archivo que pinta un diálogo usa la pila de diálogos', () => {
        const archivos = dialogs();
        expect(archivos.length).toBeGreaterThanOrEqual(4);
        for (const name of archivos) {
            expect(source(name), name).toMatch(/from '\.\/dialogs'/);
            expect(source(name), name).toMatch(/useDialog\(|<Modal |registerOverlay\(/);
            expect(source(name), name).toMatch(/role="dialog" aria-modal="true"/);
        }
    });

    it('solo la pila decide quién cierra con Escape', () => {
        expect(allFiles().filter(name => /addEventListener\(['"]keydown['"]/.test(source(name))).sort()).toEqual(['App.tsx', 'dialogs.tsx']);
        expect(source('App.tsx')).toMatch(/event\.key==='Escape'&&!\s*overlayCount\(\)/);
    });

    it('el botón atrás de Android cierra primero el panel abierto', () => {
        const back = source('App.tsx').split("window.addEventListener('wrgram:back'")[0].split('const back=').pop() || '';
        expect(back.startsWith('()=>{if(closeTopOverlay())return;'), back.slice(0, 90)).toBe(true);
    });

    it('la puerta de edad no se solapa con el panel de revisión', () => {
        const gate = source('AgeGate.tsx');
        expect(gate).toMatch(/const back=\(\)=>\{if\(overlayCount\(\)\)return;/);
        expect(gate).toMatch(/if\(!working\)back\(\)/);
    });

    it('el visor bloquea el contenedor que desplaza, no el body', () => {
        const viewer = source('MediaView.tsx');
        expect(viewer).not.toMatch(/document\.body\.style\.overflow/);
        expect(viewer).toMatch(/scrollParentOf\(ref\.current\)/);
        expect(viewer).toMatch(/host\.style\.overflow='hidden'/);
    });
});
