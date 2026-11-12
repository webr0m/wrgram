import { describe, expect, it } from 'vitest';
import { extractContent, mapTdChat, mapTdMessage, safeTdlibError, type TdChatLookup } from './tdlib';

const lookup = (values: { user?: Record<string, unknown>; supergroup?: Record<string, unknown>; basicGroup?: Record<string, unknown> } = {}): TdChatLookup => ({
  user: (id) => values.user && String(values.user.id) === id ? values.user : undefined,
  supergroup: (id) => values.supergroup && String(values.supergroup.id) === id ? values.supergroup : undefined,
  basicGroup: (id) => values.basicGroup && String(values.basicGroup.id) === id ? values.basicGroup : undefined,
});

function privateChat(overrides: Record<string, unknown> = {}) {
  return {
    _: 'chat',
    id: '100',
    type: { _: 'chatTypePrivate', user_id: '9' },
    title: 'Ana',
    permissions: { _: 'chatPermissions', can_send_basic_messages: true },
    positions: [{ _: 'chatPosition', list: { _: 'chatListMain' }, order: '10', is_pinned: false }],
    last_message: {
      _: 'message', id: '7', chat_id: '100', date: 1_700_000_000, is_outgoing: false,
      sender_id: { _: 'messageSenderUser', user_id: '9' },
      content: { _: 'messageText', text: { _: 'formattedText', text: 'Hola desde Telegram' } },
    },
    unread_count: 2,
    last_read_inbox_message_id: '5',
    last_read_outbox_message_id: '0',
    ...overrides,
  };
}

describe('mapeo TDLib → contrato web', () => {
  it('extrae texto, medios y contenido temporal sin descargar adjuntos', () => {
    expect(extractContent({ _: 'messageText', text: { text: 'Hola' } })).toEqual({ text: 'Hola', kind: 'text' });
    expect(extractContent({ _: 'messagePhoto', caption: { text: { text: 'Pie' } } })).toEqual({ text: 'Pie\n[Foto]', kind: 'unsupported' });
    expect(extractContent({ _: 'messagePinMessage' })).toEqual({ text: 'Mensaje de servicio de Telegram.', kind: 'service' });
  });

  it('mapea un mensaje de texto con identidad aislada por cuenta y chat', () => {
    const message = mapTdMessage({
      _: 'message', id: '7', chat_id: '100', date: 1_700_000_000, edit_date: 1_700_000_100,
      is_outgoing: false, self_destruct_in: 0,
      sender_id: { _: 'messageSenderUser', user_id: '9' },
      content: { _: 'messageText', text: { text: 'Hola desde Telegram' } },
    }, '42', 'Ana');
    expect(message).toMatchObject({
      id: '42/100/7', accountId: '42', chatId: '100', messageId: 7, sender: 'Ana',
      outgoing: false, text: 'Hola desde Telegram', kind: 'text', sentAt: 1_700_000_000_000,
      editedAt: 1_700_000_100_000,
    });
    expect(message.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('oculta el contenido autodestructible', () => {
    const message = mapTdMessage({
      _: 'message', id: '8', chat_id: '100', date: 1_700_000_000, is_outgoing: false, self_destruct_in: 30,
      content: { _: 'messageText', text: { text: 'secreto' } },
    }, '42', 'Ana');
    expect(message.kind).toBe('temporary');
    expect(message.text).not.toContain('secreto');
  });

  it('marca un canal como solo lectura y con alcance por canal', () => {
    const chat = mapTdChat({
      ...privateChat(), id: '-100200', title: 'Canal WR',
      type: { _: 'chatTypeSupergroup', supergroup_id: '200', is_channel: true },
    }, '42', lookup({
      supergroup: { id: 200, is_channel: true, status: { _: 'chatMemberStatusMember' }, member_count: 1200 },
    }));
    expect(chat.kind).toBe('channel');
    expect(chat.canSendText).toBe(false);
    expect(chat.readOnlyReason).toContain('canales');
    expect(chat.messageScope).toBe('channel');
  });

  it('deshabilita foros y cuentas eliminadas', () => {
    const forum = mapTdChat({
      ...privateChat(), id: '-100201', title: 'Foro',
      type: { _: 'chatTypeSupergroup', supergroup_id: '201', is_channel: false },
    }, '42', lookup({ supergroup: { id: 201, is_channel: false, is_forum: true, status: { _: 'chatMemberStatusMember' } } }));
    expect(forum.canSendText).toBe(false);
    expect(forum.readOnlyReason).toContain('foro');

    const deleted = mapTdChat(privateChat(), '42', lookup({ user: { id: 9, first_name: 'Ana', type: { _: 'userTypeDeleted' } } }));
    expect(deleted.canSendText).toBe(false);
    expect(deleted.readOnlyReason).toContain('no está disponible');
  });

  it('usa la miniatura de TDLib sin descargar el archivo original', () => {
    const chat = mapTdChat(privateChat({
      photo: { _: 'chatPhotoInfo', small: { _: 'file', id: 77 }, big: { _: 'file', id: 78 }, minithumbnail: { data: 'AAECAw==' } },
    }), '42', lookup());
    expect(chat.photo).toBe('data:image/jpeg;base64,AAECAw==');
    expect(chat.photoKey).toBe('77');
    expect(mapTdChat(privateChat(), '42', lookup()).photo).toBeUndefined();
  });

  it('marca los mensajes guardados y detecta verificación', () => {
    const saved = mapTdChat(privateChat({ title: '' }), '9', lookup({
      user: { id: 9, first_name: 'Ana', verification_status: { is_verified: true }, type: { _: 'userTypeRegular' } },
    }));
    expect(saved.isSelf).toBe(true);
    expect(saved.title).toBe('Mensajes guardados');
    expect(saved.verified).toBe(true);
    expect(saved.canSendText).toBe(true);
  });
});

describe('errores seguros de TDLib', () => {
  it('traduce códigos conocidos sin exponer el objeto original', () => {
    expect(safeTdlibError({ code: 400, message: 'PHONE_CODE_INVALID' })).toMatchObject({ statusCode: 400 });
    expect(safeTdlibError({ code: 400, message: 'PHONE_CODE_INVALID' }).message).toContain('código');
  });

  it('respeta FLOOD_WAIT y no filtra mensajes internos', () => {
    expect(safeTdlibError({ code: 420, message: 'FLOOD_WAIT_30' })).toMatchObject({ statusCode: 429 });
    const unknown = safeTdlibError({ code: 500, message: 'SECRET_INTERNAL_TOKEN' });
    expect(unknown.statusCode).toBe(502);
    expect(unknown.message).not.toContain('SECRET_INTERNAL_TOKEN');
  });
});
