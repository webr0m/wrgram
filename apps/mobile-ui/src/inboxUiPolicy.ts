import type { Chat } from './contract';

export function canShowMessageReaders(
  outgoing: boolean,
  chat: Pick<Chat, 'type' | 'supergroup'> | undefined,
  desktop: boolean,
): boolean {
  return outgoing && chat?.type === 'group' && (!desktop || chat.supergroup !== true);
}

export function completeInboxTabsSave<T>(
  currentDialog: T | undefined,
  managerDialog: T,
  sameAccount: boolean,
  applyPreferences: () => void,
  closeDialog: () => void,
): boolean {
  if (!sameAccount) return false;
  applyPreferences();
  if (currentDialog === managerDialog) closeDialog();
  return true;
}
