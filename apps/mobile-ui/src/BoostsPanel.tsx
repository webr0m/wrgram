import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, Copy, Gauge, LoaderCircle, RefreshCw, Rocket, Star, TriangleAlert } from 'lucide-react';
import { request } from './bridge';
import { StarsRevenue } from './StarsPanels';
import type { BoostFeatures, BoostLevelFeatures, BoostLink, BoostSlots, BoostStatus, Chat } from './contract';
import { boostCountLabel, boostDate, boostLevelLabel, boostNumber, boostProgress, canBoostWith, giveawayLabel, levelFeatureRows, minimumFeatures, slotState, SLOT_STATE_LABEL, type SlotState } from './boostModel';
import './boosts.css';

type Tab = 'status' | 'slots' | 'levels' | 'revenue';
const failure = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function ErrorNote({ text }: { text: string }) { return text ? <p className="settings-note settings-error" role="alert">{text}</p> : null; }

function useBoostStatus(chat: Chat) {
  const [value, setValue] = useState<BoostStatus>(), [link, setLink] = useState<BoostLink>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function load() {
    setBusy(true); setError('');
    try {
      setValue(await request<BoostStatus>('chat.boost.status', { id: chat.id }));
      setLink(await request<BoostLink>('chat.boost.link', { id: chat.id }).catch(() => undefined));
    } catch (caught) { setError(failure(caught, 'No se pudo leer el estado de impulsos del chat.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [chat.id]);
  async function copy() {
    if (!link?.link) return;
    try { await request('clipboard.copy', { text: link.link }); setNotice('Enlace de impulso copiado.'); }
    catch (caught) { setNotice(failure(caught, 'No se pudo copiar el enlace.')); }
  }
  return { value, link, busy, error, notice, load, copy };
}

function BoostStatusTab({ chat }: { chat: Chat }) {
  const { value, link, busy, error, notice, load, copy } = useBoostStatus(chat);
  const progress = value ? boostProgress(value) : undefined;
  return <div className="boost-tab">
    <ErrorNote text={error}/>
    {value && <div className="boost-state">
      <header><span className="boost-level"><Gauge size={15}/>{boostLevelLabel(value.level)}</span>{value.appliedSlotIds.length > 0 && <span className="boost-badge is-active">{value.appliedSlotIds.length === 1 ? '1 espacio tuyo aplicado' : `${value.appliedSlotIds.length} espacios tuyos aplicados`}</span>}</header>
      <strong>{boostCountLabel(value.boostCount)}</strong>
      {progress && progress.next > 0 && <>
        <div className="boost-meter" role="img" aria-label={`${value.boostCount} de ${progress.next} impulsos para el siguiente nivel`}><span style={{ width: `${progress.percent}%` }}/></div>
        <small>{progress.remaining > 0 ? `Faltan ${boostCountLabel(progress.remaining)} para el nivel ${value.level + 1}.` : 'Telegram no publicó el umbral del siguiente nivel.'}</small>
      </>}
      {progress && progress.next === 0 && <small>Este chat ya alcanzó el último nivel de impulso que Telegram ofrece.</small>}
      {(value.giftCodeBoostCount > 0 || value.premiumMemberCount > 0) && <div className="boost-stats">
        <div><small>De códigos de regalo y sorteos</small><strong>{boostCountLabel(value.giftCodeBoostCount)}</strong></div>
        <div><small>Miembros con Premium</small><strong>{boostNumber(value.premiumMemberCount)} · {value.premiumMemberPercentage.toFixed(1)}%</strong></div>
      </div>}
    </div>}
    {!value && !error && <p className="settings-note">{busy ? 'Consultando los impulsos en Telegram…' : 'Sin estado de impulsos.'}</p>}
    {link?.link && <div className="boost-link">
      <span><small>Enlace para pedir impulsos</small><strong>{link.link}</strong></span>
      <div className="boost-link-side">{link.isPublic && <span className="boost-badge">Canal público</span>}<button type="button" className="secondary" onClick={() => void copy()}><Copy size={15}/>Copiar</button></div>
    </div>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {value?.giveaways?.length ? <div className="boost-giveaways">
      <p className="settings-note boost-subtitle">Sorteos preparados por el canal</p>
      {value.giveaways.map(giveaway => <article key={giveaway.id}>
        <strong>{giveawayLabel(giveaway.monthCount, giveaway.starCount)}</strong>
        <small>{boostCountLabel(giveaway.boostCount)} · {giveaway.winnerCount} {giveaway.winnerCount === 1 ? 'premiado' : 'premiados'} · pagado el {boostDate(giveaway.paymentDate)}</small>
      </article>)}
    </div> : null}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/>Actualizar impulsos</button></div>
    <p className="settings-note">El nivel, los impulsos y los sorteos los devuelve Telegram para esta cuenta. Los contadores de códigos de regalo y de miembros con Premium solo aparecen si eres administrador del chat.</p>
  </div>;
}

function BoostSlotsTab({ chat, chats }: { chat: Chat; chats: Chat[] }) {
  const [value, setValue] = useState<BoostSlots>(), [busy, setBusy] = useState(false), [working, setWorking] = useState(''), [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { setValue(await request<BoostSlots>('chat.boost.slots')); }
    catch (caught) { setError(failure(caught, 'No se pudieron leer tus espacios de impulso.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function apply(slots: number[]) {
    if (!slots.length || working) return;
    setWorking(slots.join(',')); setError('');
    try {
      const result = await request<BoostSlots | false>('chat.boost.apply', { id: chat.id, slots });
      if (result) setValue(result);
      await load();
    } catch (caught) { setError(failure(caught, 'Telegram no aplicó el impulso.')); }
    finally { setWorking(''); }
  }
  const now = Math.floor(Date.now() / 1000);
  const free = (value?.items || []).filter(slot => canBoostWith(slot, now));
  return <div className="boost-tab">
    <ErrorNote text={error}/>
    {value && <header className="boost-slots-head"><strong>{value.available} de {value.total} {value.total === 1 ? 'espacio disponible' : 'espacios disponibles'}</strong><small>Telegram te da un espacio por cada mes de Premium que pagas.</small></header>}
    {value && value.items.length > 0 && <ul className="boost-slots">{value.items.map(slot => {
      const state: SlotState = slotState(slot, now);
      const mine = slot.inUse && slot.chatId === chat.id;
      const elsewhere = slot.inUse && !!slot.chatId && slot.chatId !== '0' && !mine;
      const name = elsewhere ? chats.find(other => other.id === slot.chatId)?.title : undefined;
      return <li className={`boost-slot is-${state}`} key={slot.slotId}>
        <span className="boost-slot-id"><Star size={14}/>Espacio #{slot.slotId}</span>
        <span className="boost-slot-body">
          <strong>{SLOT_STATE_LABEL[state]}{mine ? ' en este chat' : ''}</strong>
          <small>{slot.inUse ? `${name ? `En «${name}»` : elsewhere ? 'Otro chat de Telegram' : 'Este chat'} · vence el ${boostDate(slot.expirationDate)}`
            : state === 'cooldown' ? `Podrás usarlo de nuevo el ${boostDate(slot.cooldownUntilDate)}`
              : slot.expirationDate > now ? `Caduca el ${boostDate(slot.expirationDate)}` : 'Libre para impulsar'}</small>
        </span>        {state === 'free' && <button type="button" className="primary" disabled={busy || !!working} onClick={() => void apply([slot.slotId])}>{working === String(slot.slotId) ? <LoaderCircle className="spin" size={15}/> : <Rocket size={15}/>}Impulsar</button>}
      </li>;
    })}</ul>}
    {value && !value.items.length && <p className="settings-note">Telegram no te ha dado espacios de impulso. Se consiguen con Telegram Premium: cada mes pagado suma un espacio.</p>}
    {!value && !error && <p className="settings-note">{busy ? 'Consultando tus espacios en Telegram…' : 'Sin espacios cargados.'}</p>}
    {free.length > 1 && <div className="settings-actions"><button type="button" className="primary" disabled={busy || !!working} onClick={() => void apply(free.map(slot => slot.slotId))}>{working === free.map(slot => String(slot.slotId)).join(',') ? <LoaderCircle className="spin" size={15}/> : <Rocket size={15}/>}Impulsar con los {free.length} libres</button></div>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy || !!working} onClick={() => void load()}><RefreshCw size={16}/>Actualizar espacios</button></div>
    <p className="settings-note">Impulsar exige un diálogo nativo de confirmación. Telegram mantiene el impulso un mes y no permite retirarlo antes de que venza; después el espacio entra en descanso y vuelve a estar libre. Si cambias de chat, el impulso del mes en curso no se transfiere.</p>
  </div>;
}

function BoostLevelsTab({ chat }: { chat: Chat }) {
  const [value, setValue] = useState<BoostFeatures>(), [open, setOpen] = useState<BoostLevelFeatures>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const channel = chat.type === 'channel';
  async function load() {
    setBusy(true); setError(''); setOpen(undefined);
    try { setValue(await request<BoostFeatures>('chat.boost.features', { channel })); }
    catch (caught) { setError(failure(caught, 'No se pudieron leer las ventajas por nivel.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [chat.type]);
  async function detail(level: number) {
    setError('');
    if (open?.level === level) { setOpen(undefined); return; }
    try { setOpen(await request<BoostLevelFeatures>('chat.boost.level', { channel, level })); }
    catch (caught) { setError(failure(caught, 'No se pudieron leer las ventajas de ese nivel.')); }
  }
  const minimum = value ? minimumFeatures(value) : [];
  return <div className="boost-tab">
    <ErrorNote text={error}/>
    <p className="settings-note boost-subtitle">Ventajas por nivel · {channel ? 'canales' : 'grupos'}</p>
    {value && value.levels.length > 0 && <ul className="boost-levels">{value.levels.map(level => <li key={level.level}>
      <button type="button" aria-expanded={open?.level === level.level} onClick={() => void detail(level.level)}>
        <span><strong>{boostLevelLabel(level.level)}</strong><small>{levelFeatureRows(level).length ? levelFeatureRows(level).slice(0, 2).join(' · ') : 'Sin ventajas adicionales'}</small></span>
        <ChevronDown size={16} className={open?.level === level.level ? 'is-open' : ''}/>
      </button>
      {open?.level === level.level && <ul className="boost-level-rows">{levelFeatureRows(open).map((row, index) => <li key={`${row}:${index}`}><BadgeCheck size={14}/><span>{row}</span></li>)}{!levelFeatureRows(open).length && <li>Sin ventajas nuevas en este nivel.</li>}</ul>}
    </li>)}</ul>}
    {value && minimum.length > 0 && <>
      <p className="settings-note boost-subtitle">Nivel mínimo para cada ventaja</p>
      <ul className="boost-minimum">{minimum.map(item => <li key={item.key}><span>{item.label}</span><strong>Nivel {item.level}</strong></li>)}</ul>
    </>}
    {value && !value.levels.length && <p className="settings-note">Telegram no publicó la tabla de niveles para este tipo de chat.</p>}
    {!value && !error && <p className="settings-note">{busy ? 'Leyendo la tabla de niveles de Telegram…' : 'Sin niveles cargados.'}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/>Actualizar niveles</button></div>
    <p className="settings-note">La tabla la publica Telegram y es la misma para todos los chats: es una lista de referencia, no el estado de este chat. El estado real está en la pestaña Impulsos.</p>
  </div>;
}

export function BoostsPanel({ chat, chats = [] }: { chat: Chat; chats?: Chat[] }) {
  const tabs: [Tab, string][] = chat.type === 'channel'
    ? [['status', 'Impulsos'], ['slots', 'Tus espacios'], ['levels', 'Niveles'], ['revenue', 'Ingresos del canal']]
    : [['status', 'Impulsos'], ['slots', 'Tus espacios'], ['levels', 'Niveles']];
  const [tab, setTab] = useState<Tab>('status');
  return <div className="boost-panel">
    <header className="boost-head"><span className="boost-head-icon"><Rocket/></span><div><strong>Impulsos de Telegram</strong><small>{chat.title}</small></div></header>
    {!chat.supported && <p className="settings-note"><TriangleAlert size={15}/>WRGram no abre este chat, pero Telegram sí informa sus impulsos.</p>}
    <nav className="settings-subnav" aria-label="Impulsos">{tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'status' ? <BoostStatusTab chat={chat}/> : tab === 'slots' ? <BoostSlotsTab chat={chat} chats={chats}/> : tab === 'levels' ? <BoostLevelsTab chat={chat}/> : <StarsRevenue chatId={chat.id}/>}
    <p className="settings-note boost-foot">Los impulsos usan tu suscripción real de Telegram Premium; WRGram no cobra ni vende impulsos. Cada aplicación queda registrada en Telegram, que es quien la muestra en el canal.</p>
  </div>;
}
