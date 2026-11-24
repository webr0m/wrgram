import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Phone, RefreshCw } from 'lucide-react';
import type { PhoneCodeInfo } from './contract';
import { snapshot } from './bridge';
import { canResend, codeSentence, countdownFrom, waitLabel } from './phoneChange';

type Run = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;

/**
 * A02 — cambiar el número de teléfono con la sesión abierta.
 *
 * Dos pasos, los dos dictados por `AuthenticationCodeInfo` (TdApi.java:3380): primero Telegram dice por dónde manda
 * el código y cuánto tarda en poder volver a pedirlo, y después el código se escribe, se envía y se olvida. Nada de
 * esto pasa por la máquina de estados de inicio de sesión, así que cerrar el diálogo deja la cuenta como estaba.
 */
export function PhoneChangeSettings({ run, ready, current }: { run: Run; ready: boolean; current?: string }) {
  const [info, setInfo] = useState<PhoneCodeInfo>();
  const [phone, setPhone] = useState(''), [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [asked, setAsked] = useState(false), [wrong, setWrong] = useState(false);
  const owner = useRef(snapshot().selfId), pending = useRef(false), generation = useRef(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const tick = window.setInterval(() => setSeconds(value => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(tick);
  }, [seconds]);

  function fail(reason: unknown) { setError(reason instanceof Error ? reason.message : 'Telegram no aceptó la petición.'); }
  function accepted(sent: PhoneCodeInfo) { setInfo(sent); setSeconds(countdownFrom(sent)); setWrong(false); setAsked(false); setCode(''); }

  async function request() {
    if (!ready || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const attempt = ++generation.current;
    try {
      const sent = await run<PhoneCodeInfo>('account.phone.change', {phone:phone.trim(), accountId:owner.current});
      if (attempt !== generation.current) return;
      if (!sent || !sent.sent) throw new Error('Telegram no envió ningún código. Revisa el número antes de intentarlo otra vez.');
      accepted(sent);
    } catch (reason) {
      if (attempt === generation.current) fail(reason);
    } finally {
      if (attempt === generation.current) { pending.current = false; setBusy(false); }
    }
  }

  async function verify() {
    if (!ready || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const attempt = ++generation.current;
    const value = code.trim();
    // El código se suelta del campo antes de salir de aquí: no queda en el estado ni en el historial del teclado.
    setCode('');
    try {
      const done = await run<{verified:boolean}>('account.phone.check', {code:value, accountId:owner.current});
      if (attempt !== generation.current) return;
      if (!done) throw new Error('Telegram no confirmó el código. Comprueba los dígitos y vuelve a escribirlo.');
      setInfo(undefined); setPhone(''); setSeconds(0); setWrong(false);
      setNotice('Telegram confirmó el número nuevo. El perfil se actualiza solo, sin cerrar la sesión.');
    } catch (reason) {
      if (attempt === generation.current) { setWrong(true); fail(reason); }
    } finally {
      if (attempt === generation.current) { pending.current = false; setBusy(false); }
    }
  }

  async function resend() {
    if (!ready || pending.current || !info || !canResend(info, seconds)) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const attempt = ++generation.current;
    try {
      const sent = await run<PhoneCodeInfo>('account.phone.resend', {verificationFailed:wrong, accountId:owner.current});
      if (attempt !== generation.current) return;
      if (!sent || !sent.sent) throw new Error('Telegram no reenvió el código. Espera a que pase la cuenta atrás.');
      accepted(sent);
      setNotice(wrong ? 'Telegram reenvió el código tras el fallo anterior.' : 'Telegram reenvió el código.');
    } catch (reason) {
      if (attempt === generation.current) fail(reason);
    } finally {
      if (attempt === generation.current) { pending.current = false; setBusy(false); }
    }
  }

  function restart() {
    generation.current++; pending.current = false;
    setInfo(undefined); setCode(''); setSeconds(0); setWrong(false); setAsked(false); setBusy(false); setError(''); setNotice('');
  }

  if (!ready) return <p className="settings-note">Inicia sesión para cambiar tu número de teléfono.</p>;

  return <div className="phone-change-settings">
    {!info
      ? <form onSubmit={event => { event.preventDefault(); if (asked) void request(); else setAsked(true); }}>
        <p className="settings-note">{current ? `Tu número actual es ${current}.` : 'Tu número es el que Telegram usa para reconocer esta cuenta.'} Cambiarlo no borra tus chats ni tus contactos.</p>
        <label className="field-label">Número nuevo, en formato internacional
          <input autoComplete="off" autoCorrect="off" spellCheck={false} type="tel" inputMode="tel" placeholder="+34 600 12 34 56" value={phone} disabled={busy} maxLength={32} onChange={event => { setPhone(event.target.value); setAsked(false); }} /></label>
        {asked
          ? <>
            <p className="settings-note">Telegram te enviará un código al número nuevo para comprobar que es tuyo antes de cambiarlo.</p>
            <div className="settings-actions">
              <button type="submit" className="primary" disabled={busy || !phone.trim()}><Phone size={15} />Pedir el código</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setAsked(false)}>Volver</button>
            </div>
          </>
          : <div className="settings-actions"><button type="submit" className="primary" disabled={busy || !phone.trim()}>Continuar</button></div>}
      </form>
      : <div className="phone-change-code">
        <p className="settings-note">{codeSentence(info)}</p>
        <p className="settings-note">El código va al número {info.phone}.</p>
        <form onSubmit={event => { event.preventDefault(); void verify(); }}>
          <label className="field-label">Código de Telegram
            <input autoComplete="off" autoCorrect="off" spellCheck={false} type="text" inputMode="numeric" value={code} disabled={busy} maxLength={32} onChange={event => setCode(event.target.value)} /></label>
          <div className="settings-actions">
            <button type="submit" className="primary" disabled={busy || !code.trim()}>Confirmar número</button>
            <button type="button" className="secondary" disabled={busy} onClick={restart}>Cancelar el cambio</button>
          </div>
        </form>
        <div className="settings-actions">
          {info.next
            ? canResend(info, seconds)
              ? <button type="button" className="text-button" disabled={busy} onClick={() => void resend()}>Reenviar por {info.next}</button>
              : <p className="settings-note">Podrás pedirlo por {info.next} cuando terminen {waitLabel(seconds) || 'los segundos de espera'}.</p>
            : <p className="settings-note">Telegram no ofreció otro medio para este código.</p>}
        </div>
      </div>}
    <p className="settings-note">Telegram solo permite este cambio a las aplicaciones oficiales de Android e iOS, así que puede rechazarlo aunque el número sea correcto; si pasa, el número se queda igual y el código no se guarda en ninguna parte de WRGram.</p>
    {busy && <p className="settings-note" role="status"><LoaderCircle className="spin" size={15} />Consultando Telegram…</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {error && <p className="settings-note settings-error" role="alert">{error}</p>}
    {info && !busy && <div className="settings-actions"><button type="button" className="secondary" onClick={restart}><RefreshCw size={15} />Volver a empezar</button></div>}
  </div>;
}
