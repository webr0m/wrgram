import { useEffect, useRef, useState } from 'react';
import { Languages, ListChecks, LoaderCircle, LockKeyhole, Mic } from 'lucide-react';
import type { Message, SpeechInfo, TextEntity } from './contract';
import { MediaView } from './MediaView';
import { PollCard } from './BatchPanels';
import { FormattedText } from './formatting';
import { RichMessage } from './RichMessage';
import { LANGUAGES, useLanguage } from './language';
import { useShowMessageTranslation } from './messageTranslation';
import './message-preview.css';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

function SpeechBlock({message,run,speech=message.speech!}:{message:Message;run:Run;speech?:SpeechInfo}){
  const { t }=useLanguage();
  const [rated,setRated]=useState(false),[rating,setRating]=useState(false);
  async function rate(good:boolean){
    if(rating)return;
    setRating(true);
    try{if(await run<boolean>('message.transcribe.rate',{id:message.id,good}))setRated(true);}
    finally{setRating(false);}
  }
  if(speech.state==='pending')return <section className="speech-block speech-pending" role="status"><LoaderCircle size={14} className="spin"/><span>{speech.partial||t('Telegram está transcribiendo el mensaje…')}</span></section>;
  if(speech.state==='error')return <section className="speech-block speech-error" role="alert"><span>{speech.error||t('No se pudo transcribir este mensaje.')}</span></section>;
  return <section className="speech-block">{speech.text&&<p>{speech.text}</p>}{!rated?<div className="speech-rate"><small>{t('¿Es correcta la transcripción?')}</small><button aria-label={t('Transcripción correcta')} disabled={rating} onClick={()=>void rate(true)}>👍</button><button aria-label={t('Transcripción incorrecta')} disabled={rating} onClick={()=>void rate(false)}>👎</button></div>:<small className="speech-thanks">{t('Gracias por valorar la transcripción.')}</small>}</section>;
}

export type MessageLanguageAction = { kind: 'translate' | 'transcribe' };
type Translation = { text: string; entities?: TextEntity[] };
const translationLanguages = [
  ...LANGUAGES,
  ['uk', 'Українська'], ['ru', 'Русский'], ['ar', 'العربية'], ['ko', '한국어'],
] as const;

function InlineTranslation({ message, run, action, render }: {
  message: Message; run: Run; action?: MessageLanguageAction; render(value?: Translation): React.ReactNode;
}) {
  const { language, t } = useLanguage();
  const [target, setTarget] = useState<string>();
  const [value, setValue] = useState<Translation>();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const seen = useRef<MessageLanguageAction | undefined>(undefined);
  const code = target ?? language;

  useEffect(() => () => { generation.current++; }, []);

  async function translate(next: string) {
    const attempt = ++generation.current;
    setTarget(next);
    setBusy(true);
    setExpanded(true);
    setFailed(false);
    setValue(undefined);
    try {
      const result = await run<Translation>('message.translate', { id: message.id, language: next === 'nb' ? 'no' : next });
      if (attempt !== generation.current) return;
      if (result?.text) setValue(result);
      else setFailed(true);
    } catch { if (attempt === generation.current) setFailed(true); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  useEffect(() => {
    if (action?.kind !== 'translate' || seen.current === action) return;
    seen.current = action;
    if (value) setExpanded(true);
    else if (!busy) void translate(code);
  }, [action]);

  return <>{render(expanded ? value : undefined)}
    <div className="message-language">
      <button type="button" className="text-button" disabled={busy} onClick={() => {
        if (value) setExpanded(!expanded);
        else void translate(code);
      }}><Languages size={15}/>{t(expanded && value ? 'Mostrar original' : 'Traducir mensaje')}</button>
      {expanded && <select aria-label={t('Idioma de traducción')} value={code} onChange={event => void translate(event.target.value)}>
        {translationLanguages.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>}
      {expanded && value && <span className="message-language-status">{t('Traducción')}</span>}
      {busy && <span className="message-language-status" role="status">{t('Traduciendo…')}</span>}
      {failed && <span className="message-language-status" role="alert">{t('Telegram no pudo traducir este mensaje.')}</span>}
    </div>
  </>;
}

function InlineSpeech({ message, run, action }: { message: Message; run: Run; action?: MessageLanguageAction }) {
  const { t } = useLanguage();
  const [local, setLocal] = useState<SpeechInfo>();
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const seen = useRef<MessageLanguageAction | undefined>(undefined);
  const speech = message.speech ?? local;
  async function transcribe() {
    if (pending.current) return;
    setShown(true);
    if (speech?.state === 'text') return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await run<true | { text?: string; pending?: boolean }>('message.transcribe', { id: message.id });
      if (!result) setLocal({ state: 'error' });
      else if (result === true) setLocal({ state: 'pending' });
      else if (result.pending) setLocal({ state: 'pending', partial: result.text });
      else setLocal(result.text ? { state: 'text', text: result.text } : { state: 'error' });
    } catch { setLocal({ state: 'error' }); }
    finally { pending.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (action?.kind !== 'transcribe' || seen.current === action) return;
    seen.current = action;
    void transcribe();
  }, [action]);

  return <>{shown && speech && <SpeechBlock message={message} run={run} speech={speech}/>}
    <div className="message-language">
      <button type="button" className="text-button" disabled={busy} onClick={() => {
        if (speech?.state === 'text') setShown(!shown);
        else void transcribe();
      }}><Mic size={15}/>{t(busy ? 'Telegram está transcribiendo el mensaje…' : speech?.state === 'text' && shown ? 'Ocultar transcripción' : speech ? 'Reintentar' : 'Transcribir mensaje')}</button>
    </div>
  </>;
}

function ChecklistCard({message,run}:{message:Message;run:Run}){
  const list=message.checklist!;
  const toggle=(task:{id:number;done:boolean})=>{void run<boolean>('checklist.toggle',{id:message.id,done:task.done?[]:[task.id],notDone:task.done?[task.id]:[]});};
  return <section className="checklist-card">
    <strong className="checklist-title"><ListChecks size={16}/><span>{list.title}</span></strong>
    <ul className="checklist-tasks">{list.tasks.map(task=><li key={task.id} className={task.done?'done':''}><button type="button" className="checklist-box" aria-label={task.done?`Marcar como pendiente: ${task.text}`:`Marcar como hecha: ${task.text}`} disabled={!list.canMark} onClick={()=>toggle(task)}>{task.done?'✓':''}</button><span>{task.text}</span></li>)}</ul>
    {!list.canMark&&<small className="settings-note">Necesitas Telegram Premium para cambiar el estado de las tareas.</small>}
    {list.othersCanMark&&<small className="settings-note">Cualquier miembro con Premium puede marcar tareas.</small>}
  </section>;
}

function PaidMediaCard({message,payStars}:{message:Message;payStars():void}){
  const paid=message.paidMedia!;
  if(paid.locked)return <section className="paid-media-card is-locked">
    <div className="paid-media-lock"><LockKeyhole size={22}/><strong>Contenido de pago</strong><small>{paid.starCount} Stars por desbloquear · Telegram procesa el cobro</small><button className="primary" onClick={payStars}>Desbloquear por {paid.starCount} ⭐</button></div>
    {paid.media.some(piece=>piece.minithumbnail)&&<div className="paid-media-previews" aria-hidden="true">{paid.media.map((piece,index)=>piece.minithumbnail?<img key={index} src={piece.minithumbnail} alt=""/>:null)}</div>}
  </section>;
  return <section className="paid-media-card">{paid.media.map((piece,index)=>piece.kind==='unsupported'?<small key={index}>Pieza no compatible con esta versión</small>:piece.media?<MediaView key={index} media={piece.media} auto={piece.kind==='photo'}/>:null)}</section>;
}

export function MessageContent({message,openLink,openUrl,openUser,openTag,openCommand,payStars,run,languageAction,allowTranslation=false}:{message:Message;languageAction?:MessageLanguageAction;allowTranslation?:boolean;openLink():void;openUrl?(url:string):void;openUser?(userId:string):void;openTag?(tag:string):void;openCommand?(command:string):void;payStars:()=>void;run?:Run}){
  const renderText = (translated?: Translation) => <p dir="auto"><FormattedText text={translated?.text ?? message.text} entities={translated ? translated.entities : message.entities} openUrl={openUrl} openUser={openUser} openTag={openTag} openCommand={openCommand}/></p>;
  const showTranslation = useShowMessageTranslation(message, !!run && allowTranslation);
  const text = run && showTranslation ? <InlineTranslation key={message.text} message={message} run={run} action={languageAction} render={renderText}/> : renderText();
  return <>{message.poll&&run&&<PollCard messageId={message.id} poll={message.poll} run={run}/>}{message.checklist&&run&&<ChecklistCard message={message} run={run}/>}{message.paidMedia&&<PaidMediaCard message={message} payStars={payStars}/>}{message.media&&<MediaView media={message.media} fileControls auto={message.media.animated||message.media.kind==='image'||message.media.kind==='sticker'}/>}{(message.transcribable||message.speech)&&run&&<InlineSpeech message={message} run={run} action={languageAction}/>}{message.gift&&<section className={`gift-card ${message.gift.premium?'is-premium':''}`}><span className="gift-ribbon">{message.gift.unique?'Único':message.gift.premium?'Premium':'Regalo'}</span><strong>{message.gift.unique?`Regalo único${message.gift.number?` #${message.gift.number}`:''}`:message.gift.premium?'Regalo Premium de Telegram':'Regalo de Telegram'}</strong><div className="gift-meta">{message.gift.stars>0&&<span>{message.gift.stars} ⭐</span>}{message.gift.saved&&<span>Guardado</span>}{message.gift.upgraded&&<span>Mejorado</span>}{message.gift.converted&&<span>Convertido a Stars</span>}{message.gift.refunded&&<span>Reembolsado</span>}{message.gift.private&&<span>Privado</span>}</div>{message.gift.text&&<p>{message.gift.text}</p>}</section>}{message.rich?<RichMessage rich={message.rich} openUrl={openUrl} openUser={openUser} openTag={openTag} openCommand={openCommand}/>:!message.checklist&&text}{message.invoice&&<section className="invoice-card"><small>{message.invoice.test?'Factura de prueba':'Factura de Telegram'}</small><strong>{message.invoice.title}</strong>{message.invoice.description&&<p>{message.invoice.description}</p>}<div>{message.invoice.currency==='XTR'?`${message.invoice.amount} ⭐ Telegram Stars`:'Pago con esta moneda no disponible'}</div>{message.invoice.paid?<span>Pago completado</span>:message.invoice.eligible?<button className="primary" onClick={payStars}>Revisar pago con Stars</button>:<small>Este tipo de pago no está disponible en esta beta.</small>}</section>}{message.preview&&<section className="link-preview">{message.preview.photo&&<MediaView media={message.preview.photo} auto/>}<small>{message.preview.site}</small><strong>{message.preview.title}</strong><p>{message.preview.description}</p><button className="text-button" onClick={openLink}>Abrir enlace externo</button></section>}</>;
}
