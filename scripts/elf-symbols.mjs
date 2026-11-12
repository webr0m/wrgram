const ELF_MAGIC = 0x7f454c46;

/** Section headers with the names resolved, for a 32 or 64 bit ELF image. */
export function elfSections(bytes) {
  if (bytes.length < 64 || bytes.readUInt32BE(0) !== ELF_MAGIC) throw new Error('Invalid ELF');
  const is64 = bytes[4] === 2;
  if (!is64 && bytes.length < 52) throw new Error('Invalid ELF');
  const u16 = (o) => bytes.readUInt16LE(o), u32 = (o) => bytes.readUInt32LE(o);
  const word = (o) => (is64 ? Number(bytes.readBigUInt64LE(o)) : u32(o));
  const shoff = word(is64 ? 0x28 : 0x20);
  const entsize = u16(is64 ? 0x3a : 0x2e);
  const count = u16(is64 ? 0x3c : 0x30);
  const strndx = u16(is64 ? 0x3e : 0x32);
  if (!entsize || !count || shoff + entsize * count > bytes.length) throw new Error('Truncated ELF section table');
  const field = (index, name) => {
    const table = { name: 0, type: 4, flags: 8, offset: is64 ? 0x18 : 0x10, size: is64 ? 0x20 : 0x14, link: is64 ? 0x28 : 0x1c };
    const at = shoff + index * entsize;
    return table[name] === undefined ? 0 : (name === 'flags' || name === 'size' || name === 'offset' ? word(at + table[name]) : u32(at + table[name]));
  };
  const strings = { offset: field(strndx, 'offset'), size: field(strndx, 'size') };
  if (strings.offset + strings.size > bytes.length) throw new Error('Truncated ELF section name table');
  const name = (start) => {
    let end = strings.offset + start;
    while (end < strings.offset + strings.size && bytes[end] !== 0) end++;
    return bytes.subarray(strings.offset + start, end).toString('latin1');
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const flags = field(i, 'flags');
    out.push({ name: name(field(i, 'name')), type: field(i, 'type'), flags, offset: field(i, 'offset'), size: field(i, 'size'), alloc: (flags & 0x2) === 0x2 });
  }
  return out;
}

/** DWARF and static symbol tables: bytes that never reach the linker at runtime. */
export function symbolBytes(bytes) {
  let debug = 0, symbols = 0, names = [];
  for (const section of elfSections(bytes)) {
    if (section.alloc) continue;
    if (section.name.startsWith('.debug')) debug += section.size;
    else if (section.name === '.symtab' || section.name === '.strtab') symbols += section.size;
    else continue;
    names.push(section.name);
  }
  return { debug, symbols, total: debug + symbols, names };
}
