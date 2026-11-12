import type { Message } from './contract';

const idOf=(value:string|number|undefined)=>{const id=Number(value);return Number.isFinite(id)&&id>0?id:0;};

/** Incoming messages newer than the read boundary, ascending. */
export function incomingAfter(messages:Message[],boundary:string|number|undefined):number[]{
  const floor=idOf(boundary);const ids:number[]=[];
  for(const message of messages){if(message.outgoing)continue;const id=idOf(message.id);if(id>floor)ids.push(id);}
  return ids.sort((left,right)=>left-right);
}

/**
 * Single source of truth for "where does the unread section start".
 * Uses the native anchor when present, then the read boundary, and only when the
 * read state is unknown (`readInbox == 0`) counts `unread` incoming messages from
 * the newest one — the same rule the Android session applies.
 */
export function unreadAnchor(input:{messages:Message[];anchor?:string|number;readInbox?:string|number;unread?:number}):number{
  const hint=idOf(input.anchor);
  const boundary=idOf(input.readInbox);
  if(hint>0&&!(boundary>0&&hint<=boundary))return hint;
  if(boundary>0){const after=incomingAfter(input.messages,boundary);return after.length?after[0]:0;}
  const unread=Math.floor(Number(input.unread)||0);
  if(unread<=0)return 0;
  const incoming=input.messages.filter(message=>!message.outgoing).map(message=>idOf(message.id)).filter(id=>id>0).sort((left,right)=>right-left);
  if(!incoming.length)return 0;
  return incoming[Math.min(unread,incoming.length)-1];
}

/** Index in `messages` of the first incoming message at or after the anchor, or -1. */
export function dividerIndex(messages:Message[],anchor:number):number{
  if(!(anchor>0))return -1;
  return messages.findIndex(message=>!message.outgoing&&idOf(message.id)>=anchor);
}

/** Newer-than-read styling: anchored chats highlight from the anchor, others above the boundary. */
export function isNewMessage(message:Message,anchor:number,readInbox:string|number|undefined):boolean{
  if(message.outgoing)return false;
  const id=idOf(message.id);if(!id)return false;
  if(anchor>0)return id>=anchor;
  const boundary=idOf(readInbox);
  return boundary>0&&id>boundary;
}

/**
 * Telegram marks a chat read only after every new message has been seen: the loaded
 * window must reach the newest message (`latest`), the view must sit at the bottom and
 * there must be incoming messages beyond the read boundary.
 */
export function shouldMarkRead(input:{latest:boolean;atBottom:boolean;newestIncoming:number;readInbox:number}):boolean{
  return input.latest&&input.atBottom&&input.newestIncoming>0&&input.newestIncoming>idOf(input.readInbox);
}

/** Newest incoming id in a page, ignoring outgoing messages. */
export function newestIncomingId(messages:Message[]):number{
  let newest=0;
  for(const message of messages){if(message.outgoing)continue;const id=idOf(message.id);if(id>newest)newest=id;}
  return newest;
}

/**
 * Scrolls a mark to the top of the message scroller without relying on
 * `scrollIntoView`, which is a no-op when the container animates with
 * `scroll-behavior: smooth`. Restores the previous inline behavior.
 */
export function scrollMarkToTop(host:HTMLElement|null,mark:Element|null){
  if(!host||!mark)return;
  const top=Math.max(0,mark.getBoundingClientRect().top-host.getBoundingClientRect().top+host.scrollTop);
  const previous=host.style.scrollBehavior;
  host.style.scrollBehavior='auto';
  host.scrollTop=top;
  host.style.scrollBehavior=previous;
}

export function scrollHistoryEnd(host:HTMLElement) {
  const previous=host.style.scrollBehavior;
  host.style.scrollBehavior='auto';
  host.scrollTop=host.scrollHeight;
  host.style.scrollBehavior=previous;
}

export function visibleReadBoundary(
  rows: {id:string;top:number;bottom:number}[], first:number, top:number, bottom:number,
): string | undefined {
  let last: string | undefined;
  for(const row of rows){
    const id=idOf(row.id);
    if(id<first)continue;
    // Require the first unread row on screen before advancing the read cursor.
    if(!last&&id!==first)return;
    if(Math.min(row.bottom,bottom)-Math.max(row.top,top)<Math.min(18,row.bottom-row.top))break;
    if(row.bottom<=row.top)break;
    last=row.id;
  }
  return last;
}
