import { Reply } from 'lucide-react';
import { replyTarget, type JumpTarget } from './messageProvenance';

export function ReplyQuote({author,text,group,to,jump}:{author?:string;text:string;group:boolean;to?:{chatId:string;messageId:string};jump(target:JumpTarget):void}){
  const target=replyTarget(to);
  const quote=<><Reply size={13} aria-hidden="true"/><span className="reply-preview-copy">
    {group&&author&&<strong className="reply-preview-author" dir="auto" title={author}>{author}</strong>}
    <span className="reply-preview-text" dir="auto">{text}</span>
  </span></>;
  return target?<button type="button" className="reply-preview is-navigable" onClick={()=>jump(target)} title="Ver el mensaje citado">{quote}</button>:<div className="reply-preview">{quote}</div>;
}
