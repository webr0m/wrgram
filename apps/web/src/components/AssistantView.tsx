import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Check, CircleStop, FileText, Globe, HardDrive, LoaderCircle, LockKeyhole, RefreshCw, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import {
  ASSISTANT_LIMITS, createAssistantClient, parsePersonalNotes,
  type AssistantMessage, type AssistantProviderId, type AssistantResponse, type AssistantStatus, type NoteProposal,
} from '@wrgram/assistant';
import { readLocal, writeLocal } from '../lib/storage';

const AI_NOTES_KEY = 'wrgram.assistant.notes.v1';
const client = createAssistantClient(import.meta.env.VITE_WRGRAM_API_URL || '/api');

interface Turn extends AssistantMessage {
  id: string;
  proposals?: NoteProposal[];
}

export function AssistantView() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [consent, setConsent] = useState<AssistantProviderId | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedProposals, setSavedProposals] = useState<string[]>([]);
  const [notes, setNotes] = useState(() => parsePersonalNotes(readLocal(AI_NOTES_KEY).value));
  const [storageError, setStorageError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cloud = status?.provider !== 'ollama';
  const publicAlpha = status?.deployment === 'public-alpha';
  const ready = status?.state === 'ready';
  const accepted = consent === status?.provider;

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setStatusError('');
    void client.status(controller.signal).then((next) => {
      if (!controller.signal.aborted) setStatus(next);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setStatus(null); setStatusError(error instanceof Error ? error.message : 'No se pudo comprobar la IA.'); }
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [refreshIndex]);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ready || !status || !accepted || busy || controllerRef.current || !draft.trim()) return;
    const text = draft.trim();
    const previous = messages.map(({ role, content }) => ({ role, content })).slice(-(ASSISTANT_LIMITS.history - 1));
    const requestMessages: AssistantMessage[] = [...previous, { role: 'user', content: text }];
    const turn: Turn = { id: crypto.randomUUID(), role: 'user', content: text };
    setBusy(true); setRequestError(''); setDraft('');
    setMessages((current) => [...current, turn]);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const result: AssistantResponse = await client.chat({ messages: requestMessages, consent: true, provider: status.provider }, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: result.message, proposals: result.proposals }]);
    } catch (error) {
      if (controller.signal.aborted) {
        setDraft(text);
        setMessages((current) => current.filter((message) => message.id !== turn.id));
      }
      if (!controller.signal.aborted) {
        setRequestError(error instanceof Error ? error.message : 'No pudimos obtener una respuesta.');
        setDraft(text);
        setMessages((current) => current.filter((message) => message.id !== turn.id));
      }
    } finally {
      if (controllerRef.current === controller) { setBusy(false); controllerRef.current = null; }
    }
  }

  function cancel() { controllerRef.current?.abort(); setRequestError('Generación cancelada. El proveedor podría haber procesado ya la instrucción.'); }

  function saveProposal(proposal: NoteProposal, key: string) {
    if (savedProposals.includes(key)) return;
    if (notes.length >= ASSISTANT_LIMITS.notes) { setStorageError('Has alcanzado 50 notas personales. Elimina alguna antes de guardar otra.'); return; }
    const next = [{ id: crypto.randomUUID(), title: proposal.title, text: proposal.text, createdAt: new Date().toISOString() }, ...notes];
    if (!writeLocal(AI_NOTES_KEY, next)) { setStorageError('No se pudo guardar la nota en este navegador. No se ha marcado como guardada.'); return; }
    setNotes(next); setSavedProposals((current) => [...current, key]); setStorageError('');
  }

  function deleteNote(id: string) {
    const next = notes.filter((note) => note.id !== id);
    if (!writeLocal(AI_NOTES_KEY, next)) { setStorageError('No se pudo eliminar la nota del almacenamiento local.'); return; }
    setNotes(next); setStorageError('');
  }

  function reset() {
    controllerRef.current?.abort();
    setMessages([]); setRequestError(''); setDraft(''); setSavedProposals([]);
  }

  return <section className={`assistant-view ${showNotes ? 'assistant-show-notes' : ''}`} aria-labelledby="assistant-title">
    <div className="assistant-main">
      <header className="assistant-header"><div className="assistant-identity"><span className="assistant-icon"><Sparkles size={21} /></span><div><h1 id="assistant-title">WR IA <span>Tu copiloto personal</span></h1><p>Ideas propias. Herramientas útiles. Tú al mando.</p></div></div><div className="assistant-header-buttons"><button className="icon-button assistant-mobile-notes" aria-label="Ver mis notas personales" onClick={() => setShowNotes(!showNotes)}><FileText size={18} /></button><button className="icon-button" aria-label="Nueva conversación con WR IA" title="Nueva conversación; borra el historial en memoria" disabled={busy || !messages.length} onClick={reset}><RefreshCw size={17} /></button></div></header>
      <div className="assistant-provider-bar"><span className={`assistant-state ${ready ? 'assistant-state-ready' : ''}`}><span />{checking ? 'Comprobando conexión…' : ready ? `${cloud ? 'Groq online' : 'Ollama local'} · disponible` : 'Pendiente de configuración'}</span><button className="text-button" disabled={checking || busy} onClick={() => setRefreshIndex((current) => current + 1)}><RefreshCw size={12} /> Actualizar estado</button></div>
      <div className="assistant-scroll" ref={scrollRef}>
        {!messages.length && <div className="assistant-welcome"><div className="assistant-welcome-symbol"><Bot size={39} strokeWidth={1.3} /><span><Sparkles size={13} /></span></div><span className="eyebrow">UN PEQUEÑO IMPULSO PARA TUS IDEAS</span><h2>¿Qué vamos a crear hoy?</h2><p>Puedo ayudarte a escribir, entender y planificar.<br />Sin acceso a tus conversaciones de Telegram.</p><div className="assistant-prompts">{[
          ['Un punto de partida', 'Ayúdame a organizar un proyecto personal en cinco pasos.'],
          ['Dale forma a una idea', 'Dame tres ideas originales para un proyecto de fin de semana.'],
          ['Una nota para después', 'Prepara una nota personal con una rutina de estudio de TypeScript.'],
        ].map(([title, prompt]) => <button key={title} onClick={() => { setDraft(prompt); textareaRef.current?.focus(); }}><strong>{title}<ArrowUpRight size={14} /></strong><span>{prompt}</span></button>)}</div></div>}

        {!checking && (!ready || statusError) && <div className="assistant-setup"><div><SettingsIcon cloud={cloud} /><h3>{publicAlpha ? 'WR IA llegará en la siguiente etapa' : statusError ? 'Inicia el servicio de WRGram' : status?.state === 'not-configured' ? 'Conecta Groq una sola vez' : status?.state === 'model-missing' ? 'Revisa el modelo configurado' : 'El proveedor no está disponible'}</h3></div><p>{publicAlpha ? 'La integración con Groq está preparada, pero la generación está deshabilitada en esta alpha pública hasta configurar el acceso seguro y la clave del servidor.' : statusError || (cloud ? 'La clave se configura en el servidor, no en esta pantalla. La aplicación nunca debe recibirla.' : 'Ollama debe estar ejecutándose en el equipo que aloja la API y tener un modelo compatible descargado.')}</p>{!publicAlpha && <code>{statusError ? 'pnpm dev:api' : cloud ? 'GROQ_API_KEY=••••   ·   WRGRAM_AI_PROVIDER=groq' : `ollama pull ${status?.model ?? 'qwen3:1.7b'}`}</code>}<p>{publicAlpha ? 'Puedes explorar las sugerencias, pero esta versión no enviará tus instrucciones a una IA. No mostramos respuestas simuladas.' : <>Consulta <strong>docs/ai.md</strong> para la configuración. No se han generado respuestas de ejemplo ni activado servicios de pago.</>}</p>{cloud && !publicAlpha && <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Abrir consola de Groq <ArrowUpRight size={12} /></a>}</div>}

        <div className="assistant-messages" role="log" aria-label="Conversación con WR IA" aria-live="polite" aria-relevant="additions text">{messages.map((message) => <article className={`assistant-turn ${message.role === 'user' ? 'assistant-turn-user' : ''}`} key={message.id}><span className="assistant-turn-label">{message.role === 'user' ? 'Tú' : <><Sparkles size={13} /> WR IA</>}</span><p>{message.content}</p>{message.proposals?.map((proposal, index) => {
          const key = `${message.id}-${index}`;
          const saved = savedProposals.includes(key);
          return <div className="ai-note-proposal" key={key}><span className="eyebrow"><FileText size={12} /> PROPUESTA · NO GUARDADA AUTOMÁTICAMENTE</span><h3>{proposal.title}</h3><p>{proposal.text}</p><button className="secondary-button" disabled={saved} onClick={() => saveProposal(proposal, key)}>{saved ? <><Check size={14} /> Guardada en este navegador</> : <><FileText size={14} /> Confirmar y guardar nota</>}</button></div>;
        })}</article>)}</div>
        {busy && <div className="assistant-thinking" role="status"><LoaderCircle size={16} className="spin" /> WR IA está preparando una respuesta…</div>}
      </div>

      <div className="assistant-compose-area">
        {requestError && <p className="assistant-error" role="alert">{requestError}</p>}
        {ready && !accepted && <label className="assistant-consent"><input type="checkbox" checked={false} onChange={() => setConsent(status!.provider)} /><span>{cloud ? 'Acepto que WRGram envíe mis instrucciones y el historial de esta sesión a Groq para responder.' : 'Acepto que mis instrucciones se procesen en el servidor Ollama configurado.'} Usaré texto propio, no contenido obtenido de Telegram ni información sensible.</span></label>}
        {accepted && <div className="assistant-consent-active"><ShieldCheck size={12} /> {cloud ? 'Procesamiento online en Groq' : 'Procesamiento en tu servidor Ollama'}<button disabled={busy} onClick={() => { setConsent(null); reset(); }}>Retirar consentimiento</button></div>}
        <form className="assistant-composer" onSubmit={(event) => { void send(event); }}><textarea ref={textareaRef} aria-label="Instrucción propia para WR IA" placeholder="Una idea propia, una pregunta, un nuevo proyecto…" rows={2} value={draft} maxLength={ASSISTANT_LIMITS.prompt} disabled={busy} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div>{busy ? <button className="send-button" type="button" aria-label="Cancelar generación" onClick={cancel}><CircleStop size={18} /></button> : <button className="send-button" type="submit" aria-label="Enviar instrucción a WR IA" disabled={!draft.trim() || !ready || !accepted || checking}><Send size={17} /></button>}</div></form>
        <div className="assistant-compose-footer"><span><LockKeyhole size={11} /> Sin acceso a Telegram · Puede equivocarse</span><span>{draft.length}/{ASSISTANT_LIMITS.prompt}</span></div>
      </div>
    </div>

    <aside className="assistant-side"><button className="text-button assistant-mobile-notes" onClick={() => setShowNotes(false)}>Volver al asistente <ArrowRight size={14} /></button><div className="assistant-side-heading"><span className="eyebrow">UN PLUS DE WRGRAM</span><h2>Inteligencia con límites claros.</h2><p>La demo web y WR IA no tienen acceso a Telegram. Android está en prueba cerrada; iOS sigue en desarrollo.</p></div><div className="assistant-fact"><span>{cloud ? <Globe size={18} /> : <HardDrive size={18} />}</span><div><h3>{cloud ? 'Online, con cuota gratuita' : 'Local, sin coste por petición'}</h3><p>{cloud ? 'Requiere cuenta de Groq. Sus cuotas se comparten entre los usuarios de esta instalación y pueden cambiar.' : 'Necesita un equipo con Ollama. El hardware y el alojamiento no están incluidos.'}</p></div></div><div className="assistant-fact"><span><ShieldCheck size={18} /></span><div><h3>Sin acciones ocultas</h3><p>Las herramientas solo preparan propuestas. Guardar una nota requiere tu confirmación.</p></div></div><div className="assistant-fact"><span><LockKeyhole size={18} /></span><div><h3>Sin cambio de proveedor automático</h3><p>No reenviamos tu texto a otro servicio si falla el elegido. La clave se guarda solo en el servidor.</p></div></div>
      <div className="assistant-note-list"><h3><FileText size={15} /> Mis notas personales <span>{notes.length}</span></h3><p>Separadas de los chats. Locales, sin cifrado y sin sincronización.</p>{storageError && <p className="assistant-error" role="alert">{storageError}</p>}{!notes.length && <div className="assistant-notes-empty">Pide a WR IA que prepare una nota con una idea tuya. Podrás revisarla antes de guardarla.<ArrowRight size={15} /></div>}{notes.map((note) => <details className="assistant-saved-note" key={note.id}><summary>{note.title}</summary><p>{note.text}</p><button className="text-button" onClick={() => { if (window.confirm('¿Eliminar esta nota personal? No se puede deshacer.')) deleteNote(note.id); }}><Trash2 size={12} /> Eliminar nota</button></details>)}</div>
      <p className="assistant-provider-name">{status?.model ?? 'Proveedor aún no conectado'}{cloud && <a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">Privacidad de Groq <ArrowUpRight size={10} /></a>}</p>
    </aside>
  </section>;
}

function SettingsIcon({ cloud }: { cloud: boolean }) { return cloud ? <Globe size={19} /> : <HardDrive size={19} />; }
