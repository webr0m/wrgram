import { useEffect, useState } from 'react';
import { Bookmark, Bot } from 'lucide-react';
import type { Chat } from '@wrgram/core';

export function Avatar({ chat, small = false }: { chat: Chat; small?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { setPhotoFailed(false); }, [chat.photo]);
  const photo = chat.photo && !photoFailed ? chat.photo : null;
  return <span aria-hidden="true" className={`avatar avatar-${chat.color} ${small ? 'avatar-small' : ''} ${chat.id === 'design' ? 'avatar-studio' : ''}`}>
    <span className="avatar-fallback">{chat.id === 'saved' ? <Bookmark size={21} /> : chat.kind === 'bot' ? <Bot size={22} /> : chat.initials}</span>
    {photo && <img className="avatar-photo" src={photo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setPhotoFailed(true)} />}
  </span>;
}
