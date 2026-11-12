import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, LockKeyhole, LogOut, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import type { TelegramWebAuth } from '@wrgram/telegram';
import {
  TelegramApiError,
  TdlibWebAdapter,
  closeTelegramSession,
  createTelegramSession,
  loginCode,
  loginPassword,
  loginPhone,
  tdlibErrorMessage,
  telegramSession,
  telegramStatus,
} from './tdlibApi';
import { TelegramMessenger } from './TelegramMessenger';

function friendlyError(error: unknown): string {
  if (error instanceof TelegramApiError) return error.message;
  return 'No se pudo contactar con el servidor de WRGram. Comprueba que la API esté iniciada y que la red esté disponible.';
}

function codeHelp(auth: TelegramWebAuth): string {
  const length = auth.codeLength ? ` de ${auth.codeLength} dígitos` : '';
  return `Introduce el código${length} que Telegram envió por ${auth.codeType ?? 'su servicio de mensajes'}. No lo compartas con nadie.`;
}

export default function TelegramServerView({ onExit }: { onExit: () => void }) {
  const [status, setStatus] = useState<{ enabled: boolean; reason?: string } | null>(null);
  const [auth, setAuth] = useState<TelegramWebAuth | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const stepRef = useRef<string>('');
  const mountedRef = useRef(true);

  const adapter = useMemo(() => auth?.step === 'ready' && auth.accountId ? new TdlibWebAdapter(auth.accountId) : null, [auth?.step, auth?.accountId]);

  useEffect(() => () => adapter?.dispose(), [adapter]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const state = await telegramStatus(controller.signal);
        if (!mountedRef.current) return;
        setStatus(state);
        if (!state.enabled) return;
        const session = await telegramSession(controller.signal);
        if (!mountedRef.current) return;
        if (session.active && session.auth) setAuth(session.auth);
      } catch (caught) {
        if (!controller.signal.aborted && mountedRef.current) setError(friendlyError(caught));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!auth) return;
    if (stepRef.current !== auth.step) {
      stepRef.current = auth.step;
      setValue('');
      setError('');
    }
  }, [auth?.step]);

  useEffect(() => {
    if (!auth || !status?.enabled) return;
    if (auth.step === 'closed' || auth.step === 'unsupported' || (auth.step === 'ready' && auth.accountId)) return;
    const timer = window.setInterval(() => {
      void telegramSession()
        .then((session) => {
          if (!mountedRef.current) return;
          if (session.active && session.auth) setAuth(session.auth);
          else {
            setAuth(null);
            setError('La sesión web se cerró o caducó. Crea una nueva para continuar. Si ya habías iniciado sesión, revócala desde Dispositivos en Telegram.');
          }
        })
        .catch((caught) => {
          if (!mountedRef.current) return;
          if (caught instanceof TelegramApiError && caught.status === 401) {
            setAuth(null);
            setError('La sesión web caducó. Crea una nueva para continuar. Si ya habías iniciado sesión, revócala desde Dispositivos en Telegram.');
          }
        });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [status?.enabled, auth?.step, auth?.accountId, auth?.active]);

  useEffect(() => {
    if (auth?.step !== 'ready' || !auth.accountId) return;
    const timer = window.setInterval(() => {
      void telegramSession()
        .then((session) => {
          if (!mountedRef.current) return;
          if (!session.active) {
            setAuth(null);
            setError('La sesión web se cerró o caducó. Vuelve a iniciar sesión si la necesitas.');
            return;
          }
          if (session.auth && (session.auth.step === 'closed' || session.auth.step === 'unsupported')) setAuth(session.auth);
        })
        .catch((caught) => {
          if (mountedRef.current && caught instanceof TelegramApiError && caught.status === 401) {
            setAuth(null);
            setError('La sesión web caducó. Vuelve a iniciar sesión si la necesitas.');
          }
        });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [auth?.step, auth?.accountId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !accepted) return;
    setBusy(true); setError('');
    try {
      const session = await createTelegramSession();
      if (session.auth) setAuth(session.auth);
      setValue('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !auth || (auth.step === 'password' ? !value : !value.trim())) return;
    setBusy(true); setError('');
    try {
      const result = auth.step === 'phone'
        ? await loginPhone(value.trim())
        : auth.step === 'code'
          ? await loginCode(value.trim())
          : auth.step === 'password'
            ? await loginPassword(value)
            : null;
      if (result) setAuth(result.auth);
      setValue('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function exit() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (auth) await closeTelegramSession();
      onExit();
    } catch (caught) {
      setError(`${friendlyError(caught)} Puedes revocar la sesión «WRGram Web» desde Dispositivos en Telegram.`);
      setBusy(false);
    }
  }

  async function restart() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (auth) await closeTelegramSession();
      setAuth(null);
      setValue('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setLoading(true); setError('');
    void telegramStatus()
      .then(async (state) => {
        setStatus(state);
        if (!state.enabled) return;
        const session = await telegramSession();
        if (session.active && session.auth) setAuth(session.auth);
      })
      .catch((caught) => setError(friendlyError(caught)))
      .finally(() => setLoading(false));
  }

  if (status?.enabled && auth?.step === 'ready' && auth.accountId && adapter) {
    return <TelegramMessenger adapter={adapter} displayName={auth.displayName ?? 'Cuenta de Telegram'} onExit={() => { void exit(); }} exiting={busy} exitError={error} variant="server" formatError={tdlibErrorMessage} />;
  }

  return <section className="telegram-local-view">
    <div className="telegram-local-card">
      <span className="eyebrow">CLIENTE WEB · TDLIB EN EL SERVIDOR</span>
      <h1>Conecta tu cuenta desde la web.</h1>
      <p className="telegram-local-intro">El inicio de sesión se procesa en el backend de WRGram con TDLib. El navegador nunca recibe el api_hash ni las claves de la base de datos de tu cuenta.</p>
      <div className="privacy-notice"><ShieldCheck size={18} /><p>La sesión TDLib se guarda cifrada en el servidor y se elimina al cerrar sesión. El servidor puede procesar tus mensajes mientras la sesión esté activa: úsala solo en un equipo de confianza y no la dejes abierta.</p></div>

      {loading && <p className="telegram-connected"><LoaderCircle size={15} className="spin" /> Comprobando el servicio TDLib…</p>}

      {!loading && status && !status.enabled && <>
        <p className="assistant-error" role="alert">{status.reason ?? 'El cliente web TDLib está desactivado en este servidor.'}</p>
        <div className="privacy-notice"><Server size={18} /><p>El propietario del servidor debe activar <code>WRGRAM_TELEGRAM_WEB=1</code> y configurar las credenciales de aplicación. Hasta entonces esta integración no se conecta a Telegram.</p></div>
        <div className="telegram-local-exit"><button className="text-button" onClick={onExit}><ArrowLeft size={15} />Volver a WRGram</button></div>
      </>}

      {!loading && !status && <>
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <button className="secondary-button full-width" onClick={retry}><RefreshCw size={15} /> Reintentar conexión con el servidor</button>
        <div className="telegram-local-exit"><button className="text-button" onClick={onExit}><ArrowLeft size={15} />Volver a WRGram</button></div>
      </>}

      {!loading && status?.enabled && !auth && <>
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <form onSubmit={(event) => { void create(event); }}>
          <label className="assistant-consent telegram-local-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} /><span>Entiendo que se abrirá una sesión real en el servidor de WRGram y que podré cerrarla desde aquí o desde Dispositivos en Telegram.</span></label>
          <button className="primary-button full-width" type="submit" disabled={busy || !accepted}>{busy ? <><LoaderCircle size={15} className="spin" /> Creando sesión…</> : <><LockKeyhole size={15} />Crear sesión segura</>}</button>
        </form>
        <div className="telegram-local-exit"><button className="text-button" disabled={busy} onClick={onExit}><ArrowLeft size={15} />Volver a WRGram</button></div>
      </>}

      {!loading && status?.enabled && auth && <>
        {error && <p className="assistant-error" role="alert">{error}</p>}

        {auth.step === 'starting' && <p className="telegram-connected"><LoaderCircle size={15} className="spin" /> Iniciando TDLib en el servidor…</p>}

        {auth.step === 'ready' && !auth.accountId && <p className="telegram-connected"><LoaderCircle size={15} className="spin" /> Preparando el perfil de tu cuenta…</p>}

        {auth.step === 'phone' && <form onSubmit={(event) => { void submit(event); }}>
          <label className="field-label" htmlFor="tg-web-phone">Número de teléfono con prefijo internacional</label>
          <input id="tg-web-phone" className="text-input" type="tel" inputMode="tel" autoComplete="off" spellCheck={false} maxLength={32} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} required autoFocus />
          <p className="telegram-local-help">El código puede llegar a tu aplicación oficial de Telegram, no necesariamente por SMS. Telegram no garantiza SMS para clientes no oficiales.</p>
          <button className="primary-button" type="submit" disabled={busy || !value.trim()}>{busy ? <><LoaderCircle size={15} className="spin" /> Solicitando…</> : <><LockKeyhole size={15} />Solicitar código a Telegram</>}</button>
        </form>}

        {auth.step === 'code' && <form onSubmit={(event) => { void submit(event); }}>
          <label className="field-label" htmlFor="tg-web-code">Código de Telegram</label>
          <input id="tg-web-code" className="text-input" type="text" autoComplete="one-time-code" spellCheck={false} maxLength={32} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} required autoFocus />
          <p className="telegram-local-help">{codeHelp(auth)}</p>
          <button className="primary-button" type="submit" disabled={busy || !value.trim()}>{busy ? <><LoaderCircle size={15} className="spin" /> Verificando…</> : <><LockKeyhole size={15} />Verificar código</>}</button>
        </form>}

        {auth.step === 'password' && <form onSubmit={(event) => { void submit(event); }}>
          <label className="field-label" htmlFor="tg-web-password">Contraseña de verificación en dos pasos</label>
          <input id="tg-web-password" className="text-input" type="password" autoComplete="off" spellCheck={false} maxLength={256} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} required autoFocus />
          <p className="telegram-local-help">{auth.passwordHint ? `Pista de Telegram: ${auth.passwordHint}` : 'La contraseña se envía únicamente al backend de WRGram y no se guarda en el navegador.'}</p>
          <button className="primary-button" type="submit" disabled={busy || !value}>{busy ? <><LoaderCircle size={15} className="spin" /> Verificando…</> : <><LockKeyhole size={15} />Verificar contraseña</>}</button>
        </form>}

        {auth.step === 'unsupported' && <>
          <p className="assistant-error" role="alert">{auth.unsupportedReason ?? 'Este flujo de inicio de sesión aún no está disponible en la web.'}</p>
          <button className="secondary-button full-width" disabled={busy} onClick={() => { void exit(); }}><LogOut size={15} />Cerrar esta sesión</button>
        </>}

        {auth.step === 'closed' && <>
          <p className="telegram-local-help">La sesión se cerró. Crea una nueva para volver a conectar tu cuenta.</p>
          <button className="secondary-button full-width" disabled={busy} onClick={() => { void restart(); }}><RefreshCw size={15} />Crear una sesión nueva</button>
        </>}

        <div className="telegram-local-exit"><button className="text-button" disabled={busy} onClick={() => { void exit(); }}><LogOut size={15} />Cancelar y cerrar la sesión del servidor</button></div>
      </>}
    </div>
  </section>;
}
