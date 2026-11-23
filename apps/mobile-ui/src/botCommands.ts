import type { TextEntity } from './contract';
import { applyEdit, MAX_ENTITIES, normalize } from './richDraft';

export interface BotCommand { name:string; description:string; botId:string; botName:string; username:string }
export interface BotCommandInfo { chatId:string; commands:BotCommand[]; menu?:{text:string;kind:'webapp'|'main'} }
export interface CommandQuery { start:number; end:number; command:string; username:string; addressed:boolean }

export function commandQuery(text:string, start:number, end=start, entities:TextEntity[]=[]):CommandQuery|undefined {
  if(start!==end||start<0||start>text.length)return;
  const match=/(?:^|\s)(\/([a-zA-Z0-9_]{0,32})(?:@([a-zA-Z0-9_]{0,32}))?)$/.exec(text.slice(0,start));
  if(!match)return;
  const from=start-match[1].length;
  if(entities.some(entity=>['code','pre','preCode','link'].includes(entity.type)&&entity.offset<start&&entity.offset+entity.length>from))return;
  const tail=/^[a-zA-Z0-9_@]*/.exec(text.slice(start))![0];
  return {start:from,end:start+tail.length,command:match[2].toLowerCase(),username:(match[3]||'').toLowerCase(),addressed:match[1].includes('@')};
}

export function commandText(command:BotCommand, group:boolean, addressed=false):string {
  return '/'+command.name+((group||addressed)&&command.username?'@'+command.username:'');
}

export function matchingCommands(commands:BotCommand[], query:CommandQuery|undefined, group:boolean):BotCommand[] {
  const seen=new Set<string>();
  return commands.filter(command=>{
    if(!/^[a-zA-Z0-9_]{1,32}$/.test(command.name)||group&&!command.username)return false;
    if(query&&(!command.name.toLowerCase().startsWith(query.command)||!command.username.toLowerCase().startsWith(query.username)))return false;
    const key=command.botId+':'+command.name;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

export function insertCommand(text:string, entities:TextEntity[], command:BotCommand, group:boolean, query?:CommandQuery, caret=text.length) {
  const start=query?.start??caret,end=query?.end??caret;
  const value=commandText(command,group,query?.addressed);
  const prefix=start>0&&!/\s/.test(text[start-1])?' ':'';
  const suffix=/^\s/.test(text.slice(end))?'':' ';
  const inserted=prefix+value+suffix;
  const next=text.slice(0,start)+inserted+text.slice(end);
  return {text:next,entities:normalize(next,applyEdit(entities,{start,end,inserted:inserted.length})),caret:start+inserted.length};
}

/** Las posiciones del modelo y de Telegram se miden en unidades UTF-16. */
export function botCommandEntities(text:string, entities:TextEntity[], enabled:boolean):TextEntity[] {
  const base=entities.filter(entity=>entity.type!=='botCommand');
  if(!enabled)return base;
  const result:TextEntity[]=[];
  for(const match of text.matchAll(/(?:^|\s)(\/[a-zA-Z0-9_]{1,32}(?:@[a-zA-Z0-9_]{5,32})?)(?=$|\s|[.,!?;:])/g)){
    const offset=match.index+match[0].length-match[1].length,length=match[1].length;
    const blocked=base.some(entity=>['code','pre','preCode','link'].includes(entity.type)&&entity.offset<offset+length&&entity.offset+entity.length>offset);
    if(!blocked)result.push({type:'botCommand',offset,length});
  }
  return normalize(text,base.concat(result.slice(0,Math.max(0,MAX_ENTITIES-base.length))));
}
