import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openArchive } from './ndk-archive.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Extract only the four pinned Android C++ runtimes, not the entire 728 MB NDK. */
export async function prepareRuntime(lock, directory, validateElf) {
  const missing = [];
  for (const [abi, info] of Object.entries(lock.files)) {
    const destination = path.join(directory, 'vendor/jni', abi, 'libc++_shared.so');
    try {
      const bytes = await readFile(destination);
      if (hash(bytes) === info.sha256) { validateElf(bytes, abi); continue; }
    } catch { /* Download and verify below. */ }
    missing.push({ abi, ...info, destination });
  }
  if (!missing.length) return;
  const archive = await openArchive(lock);
  for (const item of missing) {
    const bytes = await archive.read(`/sysroot/usr/lib/${item.triple}/libc++_shared.so`);
    if (hash(bytes) !== item.sha256) throw new Error(`NDK runtime SHA-256 mismatch: ${item.abi}`);
    validateElf(bytes, `${item.abi}/libc++_shared.so`);
    await mkdir(path.dirname(item.destination), { recursive: true });
    await writeFile(`${item.destination}.part`, bytes);
    await rename(`${item.destination}.part`, item.destination);
    console.log(`Verified ${item.abi}/libc++_shared.so (NDK r30)`);
  }
}

/**
 * The strip executable sits in the same pinned archive as the runtimes, so removing
 * symbols costs 2 MB instead of installing the whole NDK. An archive hash does not
 * vouch for one entry, so the executable is hashed on its own before it is ever run.
 */
export async function ensureStripTool(runtime, directory) {
  const { name, sha256 } = runtime.strip;
  const destination = path.join(directory, 'build', name);
  try {
    if (hash(await readFile(destination)) === sha256) return destination;
  } catch { /* Fetch below. */ }
  const bytes = await (await openArchive(runtime)).read(`bin/${name}`);
  if (hash(bytes) !== sha256) throw new Error(`NDK strip tool SHA-256 mismatch: ${name}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.part`, bytes);
  await rename(`${destination}.part`, destination);
  execFileSync(destination, ['--version'], { stdio: 'ignore' });
  console.log(`Verified ${name}`);
  return destination;
}

/** Remove DWARF and static symbols; the bytes the loader reads are left alone. */
export function stripLibrary(tool, source) {
  const temporary = `${source}.stripping`;
  try {
    writeFileSync(temporary, readFileSync(source));
    execFileSync(tool, ['--strip-unneeded', '-o', temporary, temporary]);
    return readFileSync(temporary);
  } finally {
    rmSync(temporary, { force: true });
  }
}
