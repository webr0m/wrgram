import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { elfSections, symbolBytes } from './elf-symbols.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tdlib = path.join(root, 'apps/mobile/android/tdlib');
const lock = JSON.parse(readFileSync(path.join(tdlib, 'native-lock.json'), 'utf8'));

/** ELF image made of section metadata only: enough for the counters, nothing else. */
function elf({ bits = 64, sections }) {
  const is64 = bits === 64;
  const header = is64 ? 64 : 52;
  const entry = is64 ? 64 : 40;
  const table = header + (sections.length + 1) * entry;
  const shstrtab = Buffer.from(`\0${sections.map((s) => s.name).join('\0')}\0`, 'latin1');
  const bytes = Buffer.alloc(table + shstrtab.length);
  bytes.writeUInt32BE(0x7f454c46, 0);
  bytes[4] = is64 ? 2 : 1;
  const word = (at, value) => (is64 ? bytes.writeBigUInt64LE(BigInt(value), at) : bytes.writeUInt32LE(value, at));
  word(is64 ? 0x28 : 0x20, header);
  bytes.writeUInt16LE(entry, is64 ? 0x3a : 0x2e);
  bytes.writeUInt16LE(sections.length + 1, is64 ? 0x3c : 0x30);
  bytes.writeUInt16LE(sections.findIndex((s) => s.name === '.shstrtab') + 1, is64 ? 0x3e : 0x32);
  sections.forEach((section, i) => {
    const at = header + (i + 1) * entry;
    bytes.writeUInt32LE(1 + sections.slice(0, i).reduce((n, s) => n + s.name.length + 1, 0), at);
    bytes.writeUInt32LE(section.name === '.symtab' ? 2 : 1, at + 4);
    word(at + 8, section.flags ?? 0);
    word(at + (is64 ? 0x20 : 0x14), section.size);
  });
  const strtab = header + (sections.findIndex((s) => s.name === '.shstrtab') + 1) * entry;
  word(strtab + (is64 ? 0x18 : 0x10), table);
  word(strtab + (is64 ? 0x20 : 0x14), shstrtab.length);
  shstrtab.copy(bytes, table);
  return bytes;
}

describe('medida de símbolos ELF', () => {
  const mixed = elf({
    bits: 64,
    sections: [
      { name: '.text', size: 4096, flags: 0x6 },
      { name: '.debug_info', size: 1000 },
      { name: '.debug_line', size: 500 },
      { name: '.symtab', size: 300 },
      { name: '.strtab', size: 200 },
      { name: '.comment', size: 90 },
      { name: '.shstrtab', size: 256 },
    ],
  });

  it('cuenta DWARF y tablas estáticas y solo esas', () => {
    expect(symbolBytes(mixed)).toMatchObject({ debug: 1500, symbols: 500, total: 2000 });
    expect(symbolBytes(mixed).names).toEqual(['.debug_info', '.debug_line', '.symtab', '.strtab']);
  });

  it('ignora lo que el cargador sí lee', () => {
    const clean = elf({ bits: 64, sections: [{ name: '.text', size: 4096, flags: 0x6 }, { name: '.dynsym', size: 300, flags: 0x2 }, { name: '.shstrtab', size: 128 }] });
    expect(symbolBytes(clean).total).toBe(0);
    expect(elfSections(clean)[1]).toMatchObject({ name: '.text', alloc: true });
  });

  it('lee un ELF de 32 bits con los mismos criterios', () => {
    const arm32 = elf({ bits: 32, sections: [{ name: '.text', size: 2048, flags: 0x6 }, { name: '.debug_info', size: 700 }, { name: '.symtab', size: 60 }, { name: '.shstrtab', size: 128 }] });
    expect(symbolBytes(arm32)).toMatchObject({ debug: 700, symbols: 60, total: 760 });
  });

  it('rechaza un ELF truncado en vez de contar ceros', () => {
    expect(() => elfSections(mixed.subarray(0, headerOf(mixed) - 1))).toThrow(/ELF/);
    expect(() => elfSections(Buffer.from('esto no es ELF'))).toThrow(/ELF/);
  });
});

function headerOf(bytes) {
  return Number(bytes[4] === 2 ? bytes.readBigUInt64LE(0x28) : BigInt(bytes.readUInt32LE(0x20)));
}

describe('bibliotecas despojadas que se empaquetan', () => {
  it('fija un SHA-256 por biblioteca empaquetada, incluidas las descargadas del NDK', () => {
    const expected = [];
    for (const [abi, files] of Object.entries(lock.abis)) for (const name of Object.keys(files)) expected.push(`${abi}/${name}`);
    for (const abi of Object.keys(lock.runtime.files)) expected.push(`${abi}/libc++_shared.so`);
    const shipped = [];
    for (const [abi, files] of Object.entries(lock.shipped)) for (const name of Object.keys(files)) shipped.push(`${abi}/${name}`);
    expect(shipped.sort()).toEqual(expected.sort());
    for (const files of Object.values(lock.shipped)) for (const hash of Object.values(files)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pinta llvm-strip con su propio hash, sacado de la fijación del NDK', () => {
    expect(lock.runtime.strip.name).toBe('llvm-strip.exe');
    expect(lock.runtime.strip.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empaqueta el árbol despojado, nunca vendor/jni', () => {
    const gradle = readFileSync(path.join(tdlib, 'build.gradle'), 'utf8');
    expect(gradle).toContain("jniLibs.srcDirs = ['vendor/jni-stripped']");
    expect(gradle).not.toContain("['vendor/jni']");
  });

  it('no deja símbolos ni rompe la fijación cuando el árbol ya está generado', () => {
    for (const [abi, files] of Object.entries(lock.shipped)) {
      for (const [name, hash] of Object.entries(files)) {
        const file = path.join(tdlib, 'vendor/jni-stripped', abi, name);
        if (!existsSync(file)) continue;
        const bytes = readFileSync(file);
        expect(symbolBytes(bytes).total, `${abi}/${name} conserva símbolos`).toBe(0);
        expect(createHash('sha256').update(bytes).digest('hex'), `${abi}/${name} difiere de la fijación`).toBe(hash);
      }
    }
  });
});
