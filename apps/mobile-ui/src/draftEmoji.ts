import type { TextEntity } from './contract';

export function editDraftEmojis(before:string,after:string,emojis:TextEntity[],caret=after.length) {
  if(before===after||!emojis.length)return emojis;
  let start=0;
  let oldEnd=before.length;
  let newEnd=after.length;
  // The caret disambiguates repeated characters, including two identical emoji.
  while(oldEnd>0&&newEnd>caret&&before[oldEnd-1]===after[newEnd-1]){
    oldEnd--;
    newEnd--;
  }
  while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){
    oldEnd--;
    newEnd--;
  }
  return replaceDraftEmojis(emojis,start,oldEnd,newEnd-start);
}

export function replaceDraftEmojis(emojis:TextEntity[],start:number,end:number,length:number,customEmojiId?:string) {
  const retained=emojis.flatMap(entity=>{
    if(entity.offset+entity.length<=start)return [entity];
    if(entity.offset>=end)return [{...entity,offset:entity.offset+length-(end-start)}];
    return [];
  });
  if(customEmojiId)retained.push({type:'customEmoji',customEmojiId,offset:start,length});
  return retained.sort((a,b)=>a.offset-b.offset);
}
