import { describe, expect, it, vi } from 'vitest';
import { editDraftEmojis, replaceDraftEmojis } from './draftEmoji';
import { parseFormatting } from './formatting';
import type { TextEntity } from './contract';

vi.mock('./CustomEmoji', () => ({ CustomEmoji: () => null }));

const id='8765432109876543210';
const emoji=(offset:number):TextEntity=>({type:'customEmoji',offset,length:2,customEmojiId:id});

describe('custom emojis in a message draft',()=>{
  it('preserves the second emoji when deleting the first of two identical glyphs',()=>{
    expect(editDraftEmojis('🦆🦆','🦆',[emoji(2)],0)).toEqual([emoji(0)]);
    expect(editDraftEmojis('🦆🦆','🦆',[emoji(0)],0)).toEqual([]);
  });

  it('replaces a regular glyph with a selected Premium emoji',()=>{
    expect(replaceDraftEmojis([],1,3,2,id)).toEqual([emoji(1)]);
  });

  it('moves the exact Telegram ID to the formatted UTF-16 offset',()=>{
    expect(parseFormatting('**Hola 🦆**',[emoji(7)])).toEqual({
      text:'Hola 🦆',
      entities:[{type:'bold',offset:0,length:7},emoji(5)],
    });
  });

  it('keeps custom emojis inside links and emits plain glyphs inside code',()=>{
    expect(parseFormatting('[🦆](https://t.me) `🦆`',[emoji(1),emoji(20)])).toEqual({
      text:'🦆 🦆',
      entities:[{type:'link',offset:0,length:2,url:'https://t.me'},emoji(0),{type:'code',offset:3,length:2}],
    });
  });
});
