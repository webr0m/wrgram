import { inflateRawSync } from 'node:zlib';

/**
 * Reads single entries from a remote ZIP with HTTP range requests, so the 728 MB NDK
 * archive never lands on disk just to take one runtime out of it.
 */
export async function openArchive({ url, archiveSize }) {
  async function range(start, end) {
    if (start < 0 || end >= archiveSize || end < start || end - start > 50_000_000) throw new Error('Invalid NDK range');
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${archiveSize}`) {
      throw new Error('NDK server did not honor the requested byte range');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== end - start + 1) throw new Error('Incomplete NDK range');
    return bytes;
  }
  const tail = await range(archiveSize - 65557, archiveSize - 1);
  let at = tail.length - 22;
  while (at >= 0 && tail.readUInt32LE(at) !== 0x06054b50) at--;
  if (at < 0) throw new Error('Missing ZIP directory');
  const length = tail.readUInt32LE(at + 12), offset = tail.readUInt32LE(at + 16);
  const central = await range(offset, offset + length - 1);
  const entries = [];
  for (let p = 0; p < central.length;) {
    if (central.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP record');
    const nameSize = central.readUInt16LE(p + 28), extra = central.readUInt16LE(p + 30), comment = central.readUInt16LE(p + 32);
    entries.push({
      name: central.subarray(p + 46, p + 46 + nameSize).toString('utf8'),
      method: central.readUInt16LE(p + 10),
      compressed: central.readUInt32LE(p + 20),
      local: central.readUInt32LE(p + 42),
    });
    p += 46 + nameSize + extra + comment;
  }
  return {
    async read(suffix, limit = 20_000_000) {
      const found = entries.filter((entry) => entry.name.endsWith(suffix));
      if (found.length !== 1) throw new Error(`Expected one ${suffix} in the pinned archive, found ${found.length}`);
      const entry = found[0];
      if (![0, 8].includes(entry.method)) throw new Error('Unsupported ZIP compression');
      const header = await range(entry.local, entry.local + 29);
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid local ZIP header');
      const start = entry.local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const packed = await range(start, start + entry.compressed - 1);
      return entry.method === 8 ? inflateRawSync(packed, { maxOutputLength: limit }) : packed;
    },
  };
}
