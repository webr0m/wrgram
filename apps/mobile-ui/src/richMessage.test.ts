import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = readFileSync(new URL('./RichMessage.tsx', import.meta.url), 'utf8');
const native = readFileSync(new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java', import.meta.url), 'utf8');
const mapCase = ui.split("case 'map'").pop()?.split('case ')[0] || '';
const mapBranch = native.split('TdApi.PageBlockMap value').pop()?.split('return item')[0] || '';

describe('bloque de mapa de un mensaje enriquecido', () => {
    it('acepta coordenadas reales en 0 en lugar de ocultar el botón', () => {
        expect(mapCase).toMatch(/Number\.isFinite\(block\.latitude\)&&Number\.isFinite\(block\.longitude\)/);
        expect(mapCase).not.toMatch(/!!block\.(latitude|longitude)/);
    });

    it('el nativo no convierte la ausencia de ubicación en un 0 legítimo', () => {
        expect(mapBranch).toContain('if(value.location!=null)');
        expect(mapBranch).not.toMatch(/location==null\?0/);
    });

    it('el enlace del mapa lleva las dos coordenadas', () => {
        expect(mapCase).toMatch(/mlat=\$\{block\.latitude}&mlon=\$\{block\.longitude}/);
    });
});
