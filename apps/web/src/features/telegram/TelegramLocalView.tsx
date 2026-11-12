import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { MemoryStorage, TelegramClient, User, tl } from '@mtcute/web';
import { LogManager } from '@mtcute/web/utils.js';
import { parseTelegramAppCredentials } from '@wrgram/telegram';
import { telegramError as safeError } from './errors';
import { MtcuteAdapter } from './MtcuteAdapter';
import { TelegramMessenger } from './TelegramMessenger';

type Step = 'phone' | 'code' | 'password' | 'connected';

function LocalMessenger({ client, accountId, displayName, onExit, exiting, exitError }: {
  client: TelegramClient; accountId: string; displayName: string; onExit: () => void; exiting: boolean; exitError: string;
}) {
  const adapter = useMemo(() => new MtcuteAdapter(client, accountId), [client, accountId]);
  useEffect(() => () => adapter.dispose(), [adapter]);
  return <TelegramMessenger adapter={adapter} displayName={displayName} onExit={onExit} exiting={exiting} exitError={exitError} formatError={safeError} />;
}

/** Prueba técnica exclusivamente local, excluida del bundle de producción. */
export default function TelegramLocalView({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codeType, setCodeType] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountId, setAccountId] = useState('');
  const clientRef = useRef<TelegramClient | null>(null);
  const hashRef = useRef('');
  const connectedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (clientRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      window.removeEventListener('beforeunload', warn);
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        // Mejor esfuerzo al navegar dentro de la app. No garantiza revocación al cerrar la pestaña.
        void (connectedRef.current ? client.logOut().catch(() => undefined) : Promise.resolve())
          .then(() => client.destroy()).catch(() => undefined);
      }
    };
  }, []);

  function complete(user: User) {
    connectedRef.current = true;
    hashRef.current = '';
    setPhone(''); setValue('');
    setDisplayName(user.displayName);
    setAccountId(String(user.id));
    setStep('connected');
    void clientRef.current?.startUpdatesLoop().catch((caught) => { if (mountedRef.current) setError(safeError(caught)); });
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (busy || controllerRef.current || !accepted) return;
    if (step === 'phone' && !/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ''))) {
      setError('Usa el formato internacional, por ejemplo +34 seguido de tu número.'); return;
    }
    setBusy(true); setError('');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      let client = clientRef.current;
      if (!client) {
        const response = await fetch('/__wrgram/telegram/config', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) { setError('No se encontró una configuración válida de Telegram en el .env local.'); return; }
        const config: unknown = await response.json();
        if (!mountedRef.current || controller.signal.aborted) return;
        if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
        const values = config as Record<string, unknown>;
        const credentials = parseTelegramAppCredentials(values.apiId, values.apiHash);
        client = new TelegramClient({
          ...credentials,
          storage: new MemoryStorage(),
          logLevel: LogManager.OFF,
          initConnectionOptions: { deviceModel: 'WRGram Web · local alpha', appVersion: '0.1.0', langCode: 'es', systemLangCode: 'es' },
        }).withParams({ floodSleepThreshold: 0, maxRetryCount: 0, timeout: 60_000 });
        clientRef.current = client;
      }
      if (step === 'phone') {
        const result = await client.sendCode({ phone, abortSignal: controller.signal });
        if (!mountedRef.current || controller.signal.aborted) return;
        if (result instanceof User) { complete(result); return; }
        if (result.type === 'email_required') { setError('Telegram solicita configurar un correo. Este flujo todavía no está soportado en la prueba; usa el cliente oficial.'); return; }
        hashRef.current = result.phoneCodeHash;
        setCodeType(result.type); setStep('code'); setValue('');
      } else if (step === 'code') {
        try {
          const user = await client.signIn({ phone, phoneCodeHash: hashRef.current, phoneCode: value.trim(), abortSignal: controller.signal });
          if (mountedRef.current && !controller.signal.aborted) complete(user);
        } catch (caught) {
          if (tl.RpcError.is(caught, 'SESSION_PASSWORD_NEEDED') && mountedRef.current && !controller.signal.aborted) { setValue(''); setStep('password'); }
          else throw caught;
        }
      } else if (step === 'password') {
        const user = await client.checkPassword({ password: value, abortSignal: controller.signal });
        if (mountedRef.current && !controller.signal.aborted) complete(user);
      }
    } catch (caught) {
      if (mountedRef.current && !controller.signal.aborted) { setError(safeError(caught)); setValue(''); }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  }

  async function exit() {
    if (busy) return;
    setBusy(true); setError('');
    const client = clientRef.current;
    try {
      if (client && connectedRef.current) await client.logOut();
      connectedRef.current = false;
      clientRef.current = null;
      if (client) await client.destroy();
      onExit();
    } catch (caught) {
      setError(`${safeError(caught)} Puedes revocar esta sesión desde Dispositivos en el cliente oficial.`);
      setBusy(false);
    }
  }

  if (step === 'connected' && clientRef.current && accountId) {
    return <LocalMessenger client={clientRef.current} accountId={accountId} displayName={displayName} onExit={() => { void exit(); }} exiting={busy} exitError={error} />;
  }

  return <section className="telegram-local-view">
    <div className="telegram-local-card">
      <span className="eyebrow">PRUEBA TÉCNICA LOCAL · MTPROTO REAL</span>
      <h1>Conecta tu cuenta, solo aquí.</h1>
      <p className="telegram-local-intro">Esta pantalla sí se conecta a Telegram. Está separada de los chats ficticios y de WR IA; no forma parte de la alpha pública.</p>
      <div className="privacy-notice"><ShieldCheck size={18} /><p>La sesión solo vive en memoria, no se exporta ni se guarda en localStorage. Antes de salir usa «Cerrar sesión». Si cierras la pestaña o se pierde la red, revócala desde Dispositivos en el cliente oficial. No utilices todavía este prototipo como tu cliente habitual.</p></div>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form onSubmit={(event) => { void authenticate(event); }}>
        <label className="field-label" htmlFor="tg-auth-input">{step === 'phone' ? 'Número de teléfono con prefijo internacional' : step === 'code' ? `Código de Telegram · entrega: ${codeType}` : 'Tu contraseña de verificación en dos pasos'}</label>
        <input key={step} id="tg-auth-input" className="text-input" type={step === 'password' ? 'password' : step === 'phone' ? 'tel' : 'text'} inputMode={step === 'password' ? 'text' : step === 'phone' ? 'tel' : 'numeric'} autoComplete="off" spellCheck={false} maxLength={step === 'password' ? 256 : 32} value={step === 'phone' ? phone : value} onChange={(event) => step === 'phone' ? setPhone(event.target.value) : setValue(event.target.value)} disabled={busy} required />
        {step === 'phone' && <label className="assistant-consent telegram-local-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} /><span>Entiendo que se solicitará un acceso real a Telegram y que esta es una prueba local sin persistencia segura ni funciones completas.</span></label>}
        <p className="telegram-local-help">{step === 'phone' ? 'El código podría llegar a tu aplicación oficial de Telegram. No garantizamos SMS desde un cliente no oficial.' : 'Introduce el dato únicamente aquí. No lo compartas con el agente ni en mensajes de chat.'}</p>
        <button className="primary-button" type="submit" disabled={busy || !accepted || !(step === 'phone' ? phone.trim() : value)}>{busy ? <><LoaderCircle size={15} className="spin" /> Conectando…</> : <><LockKeyhole size={15} />{step === 'phone' ? 'Solicitar código a Telegram' : 'Verificar y continuar'}</>}</button>
      </form>
      <div className="telegram-local-exit"><button className="text-button" disabled={busy} onClick={() => { void exit(); }}>{step === 'connected' ? <LogOut size={15} /> : <ArrowLeft size={15} />}{step === 'connected' ? 'Cerrar sesión y volver a la demo' : 'Cancelar prueba y volver a la demo'}</button></div>
    </div>
  </section>;
}
