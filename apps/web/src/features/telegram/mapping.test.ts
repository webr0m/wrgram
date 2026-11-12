import { describe, expect, it } from 'vitest';
import type { Message, Peer } from '@mtcute/web';
import { mapMessage, mapPeer } from './mapping';

const peer = { id: 123, type: 'user', displayName: 'Persona ficticia', isSelf: false, isBot: false, isDeleted: false, isVerified: false, raw: { _: 'user' } } as unknown as Peer;
function fixture(overrides: Record<string, unknown> = {}): Message {
  return { id: 1, chat: peer, sender: peer, text: 'Texto de prueba', isOutgoing: false, isService: false, ttlPeriod: null,
    raw: { _: 'message' }, date: new Date('2026-11-05T10:00:00Z'), editDate: null, ...overrides } as unknown as Message;
}

describe('mapeo MTProto sin persistencia ni acceso de IA', () => {
  it('aísla el identificador por cuenta, chat y mensaje', () => {
    expect(mapMessage(fixture(), 'account').id).toBe('account/123/1');
    expect(mapMessage(fixture(), 'other').id).not.toBe(mapMessage(fixture(), 'account').id);
  });
  it('no guarda texto de contenido temporal en el modelo de interfaz', () => {
    const mapped = mapMessage(fixture({ ttlPeriod: 60, text: 'Contenido que no debe conservarse' }), 'account');
    expect(mapped.kind).toBe('temporary');
    expect(mapped.text).not.toContain('Contenido que no debe conservarse');
    expect(mapPeer(peer, 'account', fixture({ ttlPeriod: 60 })).preview).toContain('Contenido temporal');
  });
  it('oculta también medios con TTL y señala adjuntos no compatibles', () => {
    expect(mapMessage(fixture({ raw: { _: 'message', media: { _: 'messageMediaPhoto', ttlSeconds: 10 } } }), 'account').kind).toBe('temporary');
    expect(mapMessage(fixture({ raw: { _: 'message', media: { _: 'messageMediaDocument' } } }), 'account').text).toContain('Adjunto');
  });
  it('no transforma un servicio vacío en texto normal ni oculta ediciones', () => {
    expect(mapMessage(fixture({ isService: true }), 'account').kind).toBe('service');
    expect(mapMessage(fixture({ editDate: new Date('2026-11-05T10:01:00Z') }), 'account').editedAt).toBeGreaterThan(0);
  });
  it('deja canales, temas de foro y conversaciones no disponibles en solo lectura', () => {
    const channel = { id: -100123, type: 'chat', displayName: 'Canal ficticio', chatType: 'channel', isForum: false, isLikelyUnavailable: false, isMember: true, isAdmin: false, isCreator: false, isVerified: false, permissions: null, defaultPermissions: null, raw: { _: 'channel' } } as unknown as Peer;
    expect(mapPeer(channel, 'account').canSendText).toBe(false);
    expect(mapPeer(channel, 'account').messageScope).toBe('channel');
    expect(mapPeer({ ...channel, chatType: 'supergroup', isForum: true } as Peer, 'account').canSendText).toBe(false);
    expect(mapPeer(peer, 'account').canSendText).toBe(true);
  });
});
