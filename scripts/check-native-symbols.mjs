import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { elfSections, symbolBytes } from './elf-symbols.mjs';

/** Every .so inside an APK or AAB, inflated straight from the archive. */
function libraries(bytes) {
  let at = bytes.length - 22;
  while (at >= 0 && bytes.readUInt32LE(at) !== 0x06054b50) at--;
  if (at < 0) throw new Error('Missing ZIP directory');
  const length = bytes.readUInt32LE(at + 12), dir = bytes.readUInt32LE(at + 16), count = bytes.readUInt16LE(at + 10);
  const out = [];
  let p = dir;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP record');
    const nameSize = bytes.readUInt16LE(p + 28), extra = bytes.readUInt16LE(p + 30), comment = bytes.readUInt16LE(p + 32);
    const name = bytes.subarray(p + 46, p + 46 + nameSize).toString('utf8');
    const method = bytes.readUInt16LE(p + 10), compressed = bytes.readUInt32LE(p + 20), local = bytes.readUInt32LE(p + 42);
    if (name.endsWith('.so')) {
      const header = bytes.subarray(local, local + 30);
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`Invalid local header for ${name}`);
      const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const packed = bytes.subarray(start, start + compressed);
      out.push({ name, bytes: method === 8 ? inflateRawSync(packed, { maxOutputLength: 500_000_000 }) : packed });
    }
    p += 46 + nameSize + extra + comment;
  }
  return out;
}

let failed = false;
for (const archive of process.argv.slice(2)) {
  const libs = archive.endsWith('.so') ? [{ name: path.basename(archive), bytes: readFileSync(archive) }] : libraries(readFileSync(archive));
  const what = archive.endsWith('.apk') || archive.endsWith('.aab') ? archive : path.dirname(archive);
  let symbols = 0;
  for (const lib of libs) {
    const found = symbolBytes(lib.bytes);
    if (!found.total) continue;
    failed = true;
    symbols += found.total;
    console.error(`${what}: ${lib.name} conserva ${(found.total / 1048576).toFixed(2)} MB de símbolos (${found.names.join(', ')}).`);
  }
  console.log(`${libs.length} bibliotecas en ${archive}${symbols ? `: ${(symbols / 1048576).toFixed(1)} MB sin despojar` : ', todas despojadas'}.`);
}
if (failed) console.error('AGP solo despoja si hay un NDK instalado; lo que se empaqueta debe salir de vendor/jni-stripped.');
process.exit(failed ? 1 : 0);
