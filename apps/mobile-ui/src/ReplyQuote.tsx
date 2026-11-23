import { Reply } from 'lucide-react';
import { replyTarget, type JumpTarget } from './messageProvenance';
import { FormattedText } from './formatting';
import type { TextEntity } from './contract';

export function ReplyQuote({author,text,group,to,quote,jump}:{author?:string;text:string;group:boolean;to?:{chatId:string;messageId:string};quote?:{text:string;position:number;entities?:TextEntity[]};jump(target:JumpTarget):void}){
  const target=replyTarget(to);
  const body=<><Reply size={13} aria-hidden="true"/><span className="reply-preview-copy">
    {group&&author&&<strong className="reply-preview-author" dir="auto" title={author}>{author}</strong>}
    <span className="reply-preview-text" dir="auto">{quote?<FormattedText text={quote.text} entities={quote.entities}/>:text}</span>
  </span></>;
  return target?<button type="button" className="reply-preview is-navigable" onClick={()=>jump(target)} title="Ver el mensaje citado">{body}</button>:<div className="reply-preview">{body}</div>;
}