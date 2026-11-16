import { useEffect, useRef, useState } from 'react';
import { Flag, LoaderCircle } from 'lucide-react';
import { snapshot } from './bridge';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function ReportAction({id,message=false,sponsored=false,chatId,run}:{id:string;message?:boolean;sponsored?:boolean;chatId?:string;run:Run}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),pending=useRef(false);
  const account=useRef(snapshot().selfId);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function report() {
    if(pending.current)return;
    const owner=account.current;
    if(snapshot().selfId!==owner){setError('La cuenta cambió. Vuelve a abrir el menú.');return;}
    pending.current=true;setBusy(true);setError('');setNotice('');
    try {
      const done=await run<boolean|{hidden:boolean;reported:boolean}>(sponsored?'sponsored.report':message?'message.report':'chat.report',{id,accountId:owner,...(message||sponsored?{chatId}:{})});
      if(!alive.current||snapshot().selfId!==owner)return;
      if(done===undefined)throw new Error('No se confirmó la denuncia. Comprueba su estado antes de repetirla.');
      if(done&&typeof done==='object'&&done.hidden)setNotice('Telegram confirmó que los mensajes patrocinados están ocultos.');
      else if(done===true||done&&typeof done==='object'&&done.reported)setNotice('Telegram confirmó la recepción de la denuncia.');
    } catch(reason) {
      if(alive.current)setError(reason instanceof Error?reason.message:'No se pudo tramitar la denuncia.');
    } finally {
      pending.current=false;if(alive.current)setBusy(false);
    }
  }
  return <><button type="button" className="menu-item text-danger" disabled={busy} onClick={()=>void report()}>{busy?<LoaderCircle className="spin" size={19}/>:<Flag size={19}/>}<span>{sponsored?'Opciones y denuncia del anuncio…':message?'Denunciar mensaje…':'Denunciar chat…'}</span></button>{notice&&<p className="settings-note" role="status">{notice}</p>}{error&&<p className="settings-note settings-error" role="alert">{error}</p>}</>;
}
