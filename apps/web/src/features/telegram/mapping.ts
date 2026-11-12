import type { Dialog, Message, Peer } from '@mtcute/web';
import { messageKey, type LiveChat, type LiveMessage } from '@wrgram/telegram';

function temporary(message: Message): boolean {
  if (message.ttlPeriod && message.ttlPeriod > 0) return true;
  const media = message.raw._ === 'message' ? message.raw.media : null;
  return Boolean(media && 'ttlSeconds' in media && media.ttlSeconds);
}

export function mapMessage(message: Message, accountId: string): LiveMessage {
  const chatId = String(message.chat.id);
  const temporal = temporary(message);
  const rawMedia = message.raw._ === 'message' ? message.raw.media : null;
  const hasUnsupportedMedia = Boolean(rawMedia && !['messageMediaEmpty', 'messageMediaWebPage'].includes(rawMedia._));
  const text = temporal ? 'Contenido temporal: ábrelo en el cliente oficial.' : message.isService ? 'Mensaje de servicio de Telegram.' :
    message.text || (hasUnsupportedMedia ? 'Archivo multimedia: visualización pendiente.' : 'Contenido no compatible todavía.');
  const sender = message.sender;
  return {
    id: messageKey(accountId, chatId, message.id), accountId, chatId, messageId: message.id,
    sender: sender.displayName, outgoing: message.isOutgoing || String(sender.id) === accountId,
    text: hasUnsupportedMedia && !temporal && message.text ? `${text}\n[Adjunto: ábrelo en el cliente oficial]` : text,
    time: message.date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    sentAt: message.date.getTime(), editedAt: message.editDate?.getTime() ?? 0,
    kind: temporal ? 'temporary' : message.isService ? 'service' : hasUnsupportedMedia || !message.text ? 'unsupported' : 'text',
  };
}

export function mapPeer(peer: Peer, accountId: string, lastMessage?: Message | null): LiveChat {
  const isUser = peer.type === 'user';
  const isSelf = isUser && peer.isSelf;
  const photo = peer.photo;
  const kind = isUser ? peer.isBot ? 'bot' : 'private' : peer.chatType === 'channel' ? 'channel' : 'group';
  const specialChat = !isUser && ['monoforum', 'community', 'gigagroup'].includes(peer.chatType);
  const channel = !isUser && peer.chatType === 'channel';
  const unavailable = isUser ? peer.isDeleted : peer.isLikelyUnavailable || !peer.isMember;
  const forum = !isUser && peer.isForum;
  const denied = !isUser && !peer.isAdmin && !peer.isCreator && (peer.permissions?.canSendText === false || peer.defaultPermissions?.canSendText === false);
  const canSendText = !unavailable && !channel && !forum && !specialChat && !denied;
  const readOnlyReason = unavailable ? 'Esta conversación no está disponible para tu cuenta.' : channel ? 'Los canales son de solo lectura en esta etapa.' :
    forum || specialChat ? 'Envío a temas o conversaciones especiales pendiente de implementar.' : denied ? 'Telegram no permite escribir en esta conversación.' : undefined;
  return {
    id: String(peer.id), accountId, title: isSelf ? 'Mensajes guardados' : peer.displayName,
    photoKey: photo ? photo.small.uniqueFileId : undefined,
    initials: isSelf ? 'MG' : peer.displayName.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase(),
    color: kind === 'bot' ? 'amber' : kind === 'group' ? 'mint' : kind === 'channel' ? 'violet' : 'blue',
    kind, preview: lastMessage ? mapMessage(lastMessage, accountId).text : '',
    time: lastMessage ? lastMessage.date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '',
    unread: 0, verified: peer.isVerified, members: isSelf ? 'Tu espacio personal en Telegram' : kind === 'group' ? 'Grupo de Telegram' : kind === 'channel' ? 'Canal de Telegram · solo lectura' : kind === 'bot' ? 'Bot de Telegram' : 'Conversación privada de Telegram',
    messageScope: !isUser && peer.raw._ !== 'chat' && peer.raw._ !== 'chatForbidden' ? 'channel' : 'global',
    lastMessageAt: lastMessage?.date.getTime() ?? 0, lastMessageId: lastMessage?.id ?? 0,
    isSelf, canSendText, readOnlyReason, readOutgoingId: 0,
  };
}

export function mapDialog(dialog: Dialog, accountId: string): LiveChat {
  return { ...mapPeer(dialog.peer, accountId, dialog.lastMessage), unread: dialog.unreadCount, pinned: dialog.isPinned, readOutgoingId: dialog.lastReadOutgoing };
}
