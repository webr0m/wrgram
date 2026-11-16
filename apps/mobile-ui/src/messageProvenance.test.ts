import { describe, expect, it } from 'vitest';
import { bubbleDate, forwardLabel, forwardTarget, replyTarget } from './messageProvenance';
import type { ForwardOrigin } from './contract';

const channel:ForwardOrigin = { kind:'channel', name:'WRGram · Comunidad', chatId:'9007199254740993', messageId:'9007199254740995', date:1_700_000_000 };

describe('procedencia de reenvíos y citas', () => {
  it('solo ofrece un salto cuando Telegram identifica una conversación real', () => {
    expect(forwardTarget(channel)).toEqual({ chatId:'9007199254740993', messageId:'9007199254740995' });
    expect(forwardTarget({ kind:'chat', name:'Grupo de soporte', chatId:'14' })).toEqual({ chatId:'14' });
  });
  it('conserva los identificadores como texto para no redondearlos en JavaScript', () => {
    const target = forwardTarget(channel)!;
    expect(target.messageId).toBe('9007199254740995');
    expect(Number.isSafeInteger(Number(target.chatId))).toBe(false);
    expect(Number.isSafeInteger(Number(target.messageId))).toBe(false);
  });
  it('no salta a un autor que Telegram no identifica con mensaje', () => {
    expect(forwardTarget({ kind:'user', name:'Ana Pérez', userId:'9007199254740993' })).toBeUndefined();
    expect(forwardTarget({ kind:'hidden', name:'Ana R.' })).toBeUndefined();
  });
  it('ignora los ceros de una proyección incompleta', () => {
    expect(forwardTarget({ kind:'channel', name:'Canal', chatId:'0', messageId:'12' })).toBeUndefined();
    expect(forwardTarget({ kind:'channel', name:'Canal', chatId:'14', messageId:'0' })).toEqual({ chatId:'14' });
  });
  it('nombra al autor original y su firma cuando Telegram las entrega', () => {
    expect(forwardLabel(channel)).toBe('Reenviado de WRGram · Comunidad');
    expect(forwardLabel({ ...channel, signature:'Equipo de diseño' })).toBe('Reenviado de WRGram · Comunidad · Equipo de diseño');
  });
  it('dice algo honesto cuando falta el nombre del origen', () => {
    expect(forwardLabel({ kind:'hidden', name:'  ' })).toBe('Reenviado de un usuario anónimo');
    expect(forwardLabel({ kind:'chat', name:'' })).toBe('Reenviado de un origen desconocido');
  });
  it('muestra la fecha original solo cuando existe', () => {
    expect(bubbleDate({ date:1_600_000_000, forward:channel })).toBe(1_700_000_000);
    expect(bubbleDate({ date:1_600_000_000, forward:{ ...channel, date:0 } })).toBe(1_600_000_000);
    expect(bubbleDate({ date:1_600_000_000 })).toBe(1_600_000_000);
  });
  it('una cita solo es navegable con chat y mensaje', () => {
    expect(replyTarget({ chatId:'11', messageId:'102' })).toEqual({ chatId:'11', messageId:'102' });
    expect(replyTarget({ chatId:'11', messageId:'0' })).toBeUndefined();
    expect(replyTarget({ chatId:'0', messageId:'102' })).toBeUndefined();
    expect(replyTarget()).toBeUndefined();
  });
});
