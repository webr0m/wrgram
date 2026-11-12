import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { releaseNotesFor } from './releaseNotes';

const version=readFileSync(new URL('../../mobile/android/version.properties',import.meta.url),'utf8');
const current=Number(version.match(/versionCode=(\d+)/)?.[1]);

describe('notas de versión embebidas para el aviso de actualización',()=>{
  it('cubre cada código publicado desde el primero hasta el empaquetado',()=>{
    expect(Number.isInteger(current)).toBe(true);
    for(let code=1;code<=current;code++)expect(releaseNotesFor(code),`falta la nota del código ${code}`).not.toBe('');
  });
  it('no adelanta notas a versiones todavía sin artefacto',()=>{
    expect(releaseNotesFor(current+1)).toBe('');
    expect(releaseNotesFor(0)).toBe('');
    expect(releaseNotesFor(-1)).toBe('');
  });
  it('mantiene cada nota dentro del límite de 500 caracteres de Play y cita su versión',()=>{
    for(let code=1;code<=current;code++){
      const notes=releaseNotesFor(code);
      expect(notes.length,`el código ${code} pasa de 500 caracteres`).toBeLessThanOrEqual(500);
      expect(/^[A-ZÁÉÍÓÚÑ]/.test(notes),`el código ${code} no empieza en mayúscula`).toBe(true);
      expect(notes.endsWith('.'),`el código ${code} no termina en punto`).toBe(true);
    }
  });
  it('distingue la serie 1.0.0 de la 0.5.0 en el primer código de cada una',()=>{
    expect(releaseNotesFor(28)).not.toMatch(/^WRGram 1\.0\.0/);
    expect(releaseNotesFor(29)).toMatch(/^WRGram 1\.0\.0 beta01:/);
    expect(releaseNotesFor(current)).toMatch(/^WRGram 1\.0\.0/);
  });
});
