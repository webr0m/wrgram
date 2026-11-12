import { Fragment, type ReactNode } from 'react';
import type { TextEntity, TextEntityType } from './contract';
import { CustomEmoji } from './CustomEmoji';

const MARKERS: [string, TextEntityType][] = [['```','pre'],['**','bold'],['__','italic'],['~~','strikethrough'],['||','spoiler'],['`','code']];
const SAFE_LINK = /^(https?:\/\/|tg:\/\/)/i;
const MENTION = /^@[A-Za-z0-9_]{3,32}$/;

function safeUrl(raw: string): string | undefined {
  const url = raw.trim();
  return url.length > 0 && url.length <= 2048 && SAFE_LINK.test(url) ? url : undefined;
}

export function parseFormatting(input: string, customEmojis: readonly TextEntity[]=[]): { text: string; entities: TextEntity[] } {
  const custom=new Map(customEmojis.filter(item=>item.type==='customEmoji'&&item.customEmojiId&&item.offset>=0&&item.length>0&&item.offset+item.length<=input.length).map(item=>[item.offset,item]));
  return walk(input,custom,0);
}

// Types whose content is literal: nothing inside them is formatted.
const LITERAL = new Set<TextEntityType>(['code', 'pre']);

function walk(input: string, custom: ReadonlyMap<number,TextEntity>, base:number): { text: string; entities: TextEntity[] } {
  let text = '';
  const entities: TextEntity[] = [];
  let i = 0;
  while (i < input.length) {
    const emoji=custom.get(base+i);
    if(emoji&&i+emoji.length<=input.length){
      entities.push({...emoji,offset:text.length});
      text+=input.slice(i,i+emoji.length);
      i+=emoji.length;
      continue;
    }
    if (input[i] === '\\' && i + 1 < input.length) { text += input[i + 1]; i += 2; continue; }
    if (input[i] === '[') {
      const close = input.indexOf('](', i + 1);
      const end = close < 0 ? -1 : input.indexOf(')', close + 2);
      const url = end < 0 ? undefined : safeUrl(input.slice(close + 2, end));
      const label = close < 0 ? '' : input.slice(i + 1, close);
      if (url && label.trim()) {
        entities.push({ type: 'link', offset: text.length, length: label.length, url });
        for(let pos=0;pos<label.length;pos++){
          const item=custom.get(base+i+1+pos);
          if(item&&pos+item.length<=label.length)entities.push({...item,offset:text.length+pos});
        }
        text += label; i = end + 1; continue;
      }
    }
    const marker = MARKERS.find(([value]) => input.startsWith(value, i));
    if (marker) {
      const [open, type] = marker;
      const close = input.indexOf(open, i + open.length);
      const body = close < 0 ? '' : input.slice(i + open.length, close);
      const multiline = type === 'pre';
      if (body && (multiline || !/[\r\n]/.test(body))) {
        if (LITERAL.has(type)) {
          entities.push({ type, offset: text.length, length: body.length });
          text += body;
        } else {
          const inner = walk(body,custom,base+i+open.length);
          entities.push({ type, offset: text.length, length: inner.text.length });
          for (const item of inner.entities) entities.push({ ...item, offset: text.length + item.offset });
          text += inner.text;
        }
        i = close + open.length; continue;
      }
    }
    text += input[i]; i += 1;
  }
  return { text, entities };
}

// Outermost first: each wrapper is applied over the previous one.
const ORDER: TextEntityType[] = ['link','mention','bold','italic','underline','strikethrough','spoiler','code','preCode','pre','blockquote','expandableBlockquote','dateTime','mediaTimestamp','hashtag','cashtag','botCommand','email','phone','bankCard','tonAddress','mentionName','customEmoji'];

function clock(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return `${hours?`${hours}:`:''}${String(minutes).padStart(hours?2:1,'0')}:${String(rest).padStart(2,'0')}`;
}

function dateLabel(entity: TextEntity): string | undefined {
  if (!entity.unixTime) return undefined;
  const date = new Date(entity.unixTime * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  if (entity.dateTimeType === 'relative') {
    const minutes = Math.round((date.getTime() - Date.now()) / 60000);
    const format = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, 'hour');
    return format.format(Math.round(hours / 24), 'day');
  }
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function FormattedText({text,entities,openUrl,openUser,openTag,openCommand}:{text:string;entities?:TextEntity[];openUrl?(url:string):void;openUser?(userId:string):void;openTag?(tag:string):void;openCommand?(command:string):void}) {
  const valid = (entities || []).filter(item => item && Number.isInteger(item.offset) && Number.isInteger(item.length) && item.offset >= 0 && item.length > 0 && item.offset + item.length <= text.length);
  if (!valid.length) return <>{text}</>;
  const bounds = new Set<number>([0, text.length]);
  for (const item of valid) { bounds.add(item.offset); bounds.add(item.offset + item.length); }
  const points = [...bounds].sort((a, b) => a - b);
  return <>{points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const active = new Set(valid.filter(item => item.offset <= start && item.offset + item.length >= end).map(item => item.type));
    const segment = text.slice(start, end);
    const entityOf = (type: TextEntityType) => valid.find(item => item.type === type && item.offset <= start && item.offset + item.length >= end);
    let node: ReactNode = segment;
    for (const type of ORDER) {
      if (!active.has(type)) continue;
      if (type === 'link') {
        const url = entityOf('link')?.url;
        const safe = url ? safeUrl(url) : undefined;
        node = safe ? <a className="text-link" href={safe} onClick={event => { event.preventDefault(); openUrl?.(safe); }}>{node}</a> : <span className="text-link">{node}</span>;
      } else if (type === 'mention') {
        const handle = MENTION.test(segment) ? segment : undefined;
        const url = handle ? `https://t.me/${handle.slice(1)}` : undefined;
        node = url ? <a className="text-link text-mention" href={url} onClick={event => { event.preventDefault(); openUrl?.(url); }}>{node}</a> : <span className="text-mention">{node}</span>;
      } else if (type === 'mentionName') {
        const id = entityOf('mentionName')?.userId;
        node = id && openUser ? <a className="text-link text-mention" href={`tg://user?id=${id}`} onClick={event => { event.preventDefault(); openUser(id); }}>{node}</a> : <span className="text-mentionName">{node}</span>;
      } else if (type === 'customEmoji') {
        const id = entityOf('customEmoji')?.customEmojiId;
        if (id) node = <CustomEmoji id={id} size={20} alt={segment} emoji={segment} playInView/>;
        else node = <span className="custom-emoji-fallback">{node}</span>;
      } else if (type === 'dateTime') {
        const label = dateLabel(entityOf('dateTime') ?? { type, offset: start, length: end - start });
        node = <span className="text-dateTime" title={label}>{node}</span>;
      } else if (type === 'mediaTimestamp') {
        const seconds = entityOf('mediaTimestamp')?.mediaTimestamp;
        node = <span className="text-mediaTimestamp" title={seconds === undefined ? undefined : `Reproducir desde ${clock(seconds)}`}>{node}</span>;
      } else if (type === 'email') {
        node = <span className="text-email" title="Dirección de correo">{node}</span>;
      } else if (type === 'phone') {
        node = <span className="text-phone" title="Número de teléfono">{node}</span>;
      } else if (type === 'hashtag' || type === 'cashtag') {
        node = openTag ? <button type="button" className={`text-link text-${type}`} onClick={event => { event.preventDefault(); openTag(segment); }}>{node}</button> : <span className={`text-${type}`}>{node}</span>;
      } else if (type === 'botCommand') {
        node = openCommand ? <button type="button" className="text-link text-botCommand" onClick={event => { event.preventDefault(); openCommand(segment); }}>{node}</button> : <span className="text-botCommand">{node}</span>;
      } else {
        node = <span className={`text-${type}`}>{node}</span>;
      }
    }
    return <Fragment key={start}>{node}</Fragment>;
  })}</>;
}
