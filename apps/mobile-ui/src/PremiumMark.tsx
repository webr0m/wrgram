import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { snapshot, subscribe } from './bridge';
import { Star } from 'lucide-react';
import type { EmojiStatusMark } from './contract';
import { CustomEmoji } from './CustomEmoji';
import './emoji-status.css';

export function PremiumMark({premium,status,size=17}:{
  premium?:boolean; status?:EmojiStatusMark|null; size?:number;
}) {
  const expiration = status?.expiration ?? 0;
  const [,setExpired] = useState(0);

  useEffect(() => {
    if (!expiration) return;
    let timer:ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = expiration*1000-Date.now();
      if (remaining <= 0) setExpired(expiration);
      else timer = setTimeout(check,Math.min(remaining,2_147_000_000));
    };
    if (expiration*1000 > Date.now()) check();
    return () => clearTimeout(timer);
  },[expiration]);

  if (!premium) return null;
  const id = status?.customEmojiId;
  const active = id && id !== '0' && (!expiration || expiration*1000 > Date.now());
  return <span className="premium-mark" style={{width:size,height:size}}>
    {active ? <CustomEmoji id={id} size={size} alt="Estado emoji de Telegram Premium"/>
      : <Star size={size} fill="currentColor" role="img" aria-label="Telegram Premium"/>}
  </span>;
}

export function AccountAvatarStatus({children,size=16}:{children:ReactNode;size?:number}) {
  const status = useSyncExternalStore(subscribe,() => snapshot().emojiStatus);
  const premium = useSyncExternalStore(subscribe,() => snapshot().wallet?.premium);
  return <span className="account-avatar-status">{children}<PremiumMark premium={premium} status={status} size={size}/></span>;
}
