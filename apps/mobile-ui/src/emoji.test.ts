import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, findEmojis, hasTone, tonedEmoji } from './emoji';
describe('selector de emojis',()=>{
  it('incluye el catálogo Unicode completo por categorías',()=>{expect(EMOJI_GROUPS.length).toBe(9);const all=EMOJI_GROUPS.flatMap(group=>group.items);expect(all.length).toBeGreaterThan(1500);expect(new Set(all).size).toBe(all.length);expect(EMOJI_GROUPS.every(group=>group.items.length>50)).toBe(true);});
  it('busca sin depender de acentos ni mayúsculas',()=>{expect(findEmojis('CAFÉ',0)).toContain('☕');expect(findEmojis('corazon',0)).toContain('💛');expect(findEmojis('chile',0)).toContain('🇨🇱');});
  it('selección desconocida no produce resultados inventados',()=>{expect(findEmojis('categoria-inexistente',0)).toEqual([]);});
  it('mantiene secuencias de bandera y emojis compuestos',()=>{expect(findEmojis('',8)).toContain('🇨🇱');expect(findEmojis('',0)).toContain('😮‍💨');});
  it('aplica tonos de piel solo a los emojis que los admiten',()=>{expect(tonedEmoji('👋',2)).toBe('👋🏼');expect(tonedEmoji('☝️',5)).toBe('☝🏿');expect(tonedEmoji('👋',0)).toBe('👋');expect(tonedEmoji('🫠',4)).toBe('🫠');expect(hasTone('👩‍💻')).toBe(true);expect(hasTone('🫠')).toBe(false);});
});
