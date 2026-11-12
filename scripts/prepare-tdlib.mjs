import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRuntime, ensureStripTool, stripLibrary } from './ndk-runtime.mjs';
import { symbolBytes } from './elf-symbols.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'apps/mobile/android/tdlib');
const lock = JSON.parse(await readFile(path.join(directory, 'native-lock.json'), 'utf8'));
const raw = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/`;
const media = `https://media.githubusercontent.com/media/${lock.repository}/${lock.commit}/`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function obtain(relative, url, expected, native = false) {
  const destination = path.join(directory, 'vendor', relative);
  try {
    const existing = await readFile(destination);
    if (hash(existing) === expected) { if (native) validateElf(existing, relative); return; }
  } catch { /* Re-download absent or corrupt build inputs; never trust a mutable release alias. */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${relative}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error(`SHA-256 mismatch: ${relative}`);
  if (native) validateElf(bytes, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.part`, bytes);
  await rename(`${destination}.part`, destination);
  console.log(`Verified ${relative}`);
}

function validateElf(bytes, name) {
  if (bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[5] !== 1) throw new Error(`Invalid ELF: ${name}`);
  const is64 = bytes[4] === 2;
  const offset = is64 ? Number(bytes.readBigUInt64LE(32)) : bytes.readUInt32LE(28);
  const size = bytes.readUInt16LE(is64 ? 54 : 42);
  const count = bytes.readUInt16LE(is64 ? 56 : 44);
  let loads = 0;
  for (let i = 0; i < count; i++) {
    const at = offset + i * size;
    if (bytes.readUInt32LE(at) !== 1) continue;
    loads++;
    const alignment = is64 ? Number(bytes.readBigUInt64LE(at + 48)) : bytes.readUInt32LE(at + 28);
    if (is64 && alignment < 16384) throw new Error(`Missing 16 KB ELF alignment: ${name}`);
  }
  if (!loads) throw new Error(`Missing ELF load segments: ${name}`);
}

for (const [name, expected] of Object.entries(lock.java)) {
  await obtain(`java/org/drinkless/tdlib/${name}`, `${raw}src/main/java/org/drinkless/tdlib/${name}`, expected);
}
for (const [abi, files] of Object.entries(lock.abis)) {
  await Promise.all(Object.entries(files).map(([name, expected]) => {
    const source = name === 'libtdjni.so' ? `src/main/libs/${lock.ndk}/android-${lock.androidApi}/${abi}/${name}`
      : `openssl/${lock.ndk}/android-${lock.androidApi}/${abi}/lib/${name}`;
    return obtain(`jni/${abi}/${name}`, media + source, expected, true);
  }));
}
await prepareRuntime(lock.runtime, directory, validateElf);

// AGP only strips when an NDK is installed, so `vendor/jni` ships its debug info to the
// device otherwise. The pristine bytes stay pinned; Gradle packages `vendor/jni-stripped`.
const shippedRoot = path.join(directory, 'vendor/jni-stripped');
const tool = await ensureStripTool(lock.runtime, directory);
const pristine = await readdir(path.join(directory, 'vendor/jni'));
const missing = [];
for (const abi of pristine) {
  for (const name of await readdir(path.join(directory, 'vendor/jni', abi))) {
    if (!lock.shipped[abi] || !lock.shipped[abi][name]) missing.push(`${abi}/${name}`);
  }
}
if (missing.length) throw new Error(`Falta el SHA-256 despojado en native-lock.json: ${missing.join(', ')}`);
for (const [abi, files] of Object.entries(lock.shipped)) {
  await Promise.all(Object.entries(files).map(async ([name, expected]) => {
    const destination = path.join(shippedRoot, abi, name);
    try {
      const current = await readFile(destination);
      if (hash(current) === expected) { validateElf(current, `jni-stripped/${abi}/${name}`); return; }
    } catch { /* Regenerar abajo. */ }
    const bytes = stripLibrary(tool, path.join(directory, 'vendor/jni', abi, name));
    validateElf(bytes, `jni-stripped/${abi}/${name}`);
    const leftover = symbolBytes(bytes);
    if (leftover.total) throw new Error(`llvm-strip dejó ${leftover.total} bytes de símbolos en ${abi}/${name}`);
    if (hash(bytes) !== expected) throw new Error(`El SHA-256 despojado de ${abi}/${name} es ${hash(bytes)}; la biblioteca original cambió y hay que volver a fijarlo.`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(`${destination}.part`, bytes);
    await rename(`${destination}.part`, destination);
    console.log(`Stripped ${abi}/${name} (${(bytes.length / 1048576).toFixed(2)} MB)`);
  }));
}
console.log(`TDLib verified at ${lock.commit}; OpenSSL ${lock.opensslVersion}; C++ runtime r30; 4 ABIs.`);
