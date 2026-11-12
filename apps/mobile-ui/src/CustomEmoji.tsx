import { useEffect, useState, useSyncExternalStore } from 'react';
import { request, snapshot, subscribe } from './bridge';
import type { Media } from './contract';
import { MediaView } from './MediaView';

type EmojiMedia = { media:Media; emoji?:string };
const cache = new Map<string, EmojiMedia>();
const pending = new Map<string, Promise<EmojiMedia>>();

function resolveEmoji(key:string,id:string) {
  const existing = pending.get(key);
  if (existing) return existing;
  const task = request<EmojiMedia>('customEmoji.get', {id}).then(result => {
    if (result?.media) {
      cache.set(key,result);
      if (cache.size > 512) cache.delete(cache.keys().next().value!);
    }
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key,task);
  return task;
}

export function CustomEmoji({id,size=16,alt='Emoji personalizado',media,emoji,playInView=false}:{
  id:string; size?:number; alt?:string; media?:Media; emoji?:string; playInView?:boolean;
}) {
  const owner = useSyncExternalStore(subscribe,() => snapshot().selfId);
  const key = owner+':'+id;
  const [loaded,setLoaded] = useState<{key:string;value:EmojiMedia}>();
  const resolved = media ? {media,emoji} : cache.get(key) ?? (loaded?.key === key ? loaded.value : undefined);
  useEffect(() => {
    if (media || cache.has(key)) return;
    let active = true;
    void resolveEmoji(key,id).then(value => {
      if (active && value?.media) setLoaded({key,value});
    }).catch(() => {});
    return () => { active=false; };
  },[id,key,media]);
  const fallback = <span aria-hidden="true">{resolved?.emoji || emoji || '✨'}</span>;
  return <span className="custom-emoji" role="img" aria-label={alt} style={{width:size,height:size,fontSize:Math.round(size*.8)}}>
    {resolved ? <MediaView media={resolved.media} auto passive playInView={playInView} fallback={fallback}/> : fallback}
  </span>;
}
