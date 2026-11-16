import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { PasswordState } from './contract';
import { snapshot } from './bridge';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function RecoveryEmailSettings({run,ready}:{run:Run;ready:boolean}) {
  const [value,setValue]=useState<PasswordState>();
  const [password,setPassword]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cancelAsk,setCancelAsk]=useState(false);
  const generation=useRef(0),pending=useRef(false);
  const owner=useRef(snapshot().selfId);
  async function act(action:'state'|'set'|'check'|'resend'|'cancel'='state') {
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    const attempt=++generation.current;
    const params=action==='set'?{password,email:email.trim()}:action==='check'?{code:code.trim()}:{};
    // Secrets stay in the request only; neither success nor failure keeps them in the form.
    setPassword('');setCode('');
    try {
      const result=await run<PasswordState>(action==='state'?'password.state':'password.email.'+action,{...params,accountId:owner.current});
      if(attempt!==generation.current)return;
      if(!result)throw new Error('Telegram no confirmó el cambio. Actualiza el estado antes de repetirlo.');
      setValue(result);setCancelAsk(false);
      if(action==='set'){setEmail('');setNotice(result.recoveryEmailPattern?'Revisa tu correo e introduce el código para completar el cambio.':'Correo de recuperación confirmado por Telegram.');}
      if(action==='check')setNotice(result.recoveryEmailPattern?'El correo sigue pendiente de confirmar.':'Correo de recuperación confirmado por Telegram.');
      if(action==='resend')setNotice('Telegram confirmó la solicitud de un nuevo código.');
      if(action==='cancel')setNotice('Verificación pendiente cancelada. No se eliminó el correo de recuperación ya confirmado.');
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo administrar el correo.');
    } finally {
      if(attempt===generation.current){pending.current=false;setBusy(false);}
    }
  }
  useEffect(()=>{void act();return()=>{generation.current++;pending.current=false;};},[ready]);
  if(!ready)return <p className="settings-note">Inicia sesión para administrar el correo de recuperación.</p>;
  return <div className="recovery-email-settings">
    {value&&<p className="settings-note">{value.hasRecoveryEmail?'Tu cuenta tiene un correo de recuperación confirmado.':'Tu cuenta no tiene un correo de recuperación confirmado.'}{!value.hasPassword?' Establece primero una contraseña de dos pasos.':''}</p>}
    {value?.recoveryEmailPattern?<>
      <p className="settings-note">Código pendiente para {value.recoveryEmailPattern}{value.recoveryCodeLength?` · ${value.recoveryCodeLength} caracteres`:''}. El cambio no se completa hasta confirmar el código.</p>
      <form onSubmit={event=>{event.preventDefault();void act('check');}}><label className="field-label">Código del correo<input autoComplete="one-time-code" maxLength={64} value={code} disabled={busy} onChange={event=>setCode(event.target.value)}/></label><div className="settings-actions"><button type="submit" className="primary" disabled={busy||!code.trim()}>Confirmar correo</button><button type="button" className="secondary" disabled={busy} onClick={()=>void act('resend')}>Solicitar otro código</button></div></form>
      <div className="settings-actions">{cancelAsk?<><button type="button" className="danger" disabled={busy} onClick={()=>void act('cancel')}>Confirmar: cancelar verificación</button><button type="button" className="secondary" disabled={busy} onClick={()=>setCancelAsk(false)}>Conservar verificación</button></>:<button type="button" className="secondary" disabled={busy} onClick={()=>setCancelAsk(true)}>Cancelar verificación pendiente</button>}</div>
    </>:<form onSubmit={event=>{event.preventDefault();void act('set');}}>
      <label className="field-label">Contraseña de dos pasos actual<input type="password" autoComplete="current-password" maxLength={256} value={password} disabled={busy||!value?.hasPassword} onChange={event=>setPassword(event.target.value)}/></label>
      <label className="field-label">Nuevo correo de recuperación<input type="email" autoComplete="email" maxLength={254} value={email} disabled={busy||!value?.hasPassword} onChange={event=>setEmail(event.target.value)}/></label>
      <div className="settings-actions"><button type="submit" className="primary" disabled={busy||!value?.hasPassword||!password||!email.trim()}>Enviar código de verificación</button></div>
    </form>}
    <p className="settings-note">La contraseña y el código se envían directamente a Telegram y no se guardan en WRGram. Este panel no quita la contraseña ni elimina un correo ya confirmado.</p>
    {busy&&<p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/>Consultando Telegram…</p>}
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void act()}><RefreshCw size={15}/>Actualizar estado</button></div>
  </div>;
}
