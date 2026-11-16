import type { BlockedSender } from './contract';

export const blockedSenderKey = (sender:Pick<BlockedSender,'kind'|'id'>) => sender.kind+':'+sender.id;
export function mergeBlockedSenders(previous:BlockedSender[],next:BlockedSender[]) {
  return [...new Map([...previous,...next].map(sender=>[blockedSenderKey(sender),sender])).values()];
}

export const MUTE_OPTIONS = [
  {seconds:3600,label:'Durante 1 hora'},
  {seconds:28800,label:'Durante 8 horas'},
  {seconds:172800,label:'Durante 2 días'},
  {seconds:2147483647,label:'Hasta que lo active de nuevo'},
] as const;
