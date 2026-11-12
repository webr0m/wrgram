import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, Gift, LoaderCircle, Pin, RefreshCw, Save, Share2, Sparkles, Star, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { request } from './bridge';
import { MediaView } from './MediaView';
import type { CatalogGift, CanSendGiftResult, Chat, GiftCatalog, GiftUpgradePreview, GiftView, Media, ReceivedGiftCatalog, ReceivedGiftItem, StarPaymentOptions } from './contract';
import { currentUpgradePrice, giftPrice, giftSubtitle, GIFT_VIEWS, MAX_PINNED, mergeReceived, perMilleLabel, pinnedIds, rarityLabel, sendBlockedReason, sendCost, togglePin, uniqueNumber, upcomingUpgradePrices } from './giftModel';
import { money } from './starsModel';
import './gifts.css';

type Tab = 'received' | 'send';
const failure = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const day = (seconds: number) => new Date(seconds * 1000).toLocaleDateString('es', { dateStyle: 'medium' });

function ErrorNote({ text }: { text: string }) { return text ? <p className="settings-note settings-error" role="alert">{text}</p> : null; }
function Busy({ busy, label }: { busy: boolean; label: string }) { return <>{busy ? <LoaderCircle className="spin" size={15}/> : null}{label}</>; }

function GiftThumb({ media, name }: { media?: Media; name: string }) {
  return <span className="gift-thumb">{media ? <MediaView media={media} passive/> : <span className="gift-thumb-fallback" aria-hidden="true">{name.trim().slice(0, 2) || '🎁'}</span>}</span>;
}

function GiftSendTab({ chat }: { chat: Chat }) {
  const [gifts, setGifts] = useState<CatalogGift[]>([]), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [listError, setListError] = useState('');
  const [chosen, setChosen] = useState<CatalogGift>(), [check, setCheck] = useState<CanSendGiftResult>(), [options, setOptions] = useState<StarPaymentOptions>();
  const [text, setText] = useState(''), [isPrivate, setPrivate] = useState(false), [upgrade, setUpgrade] = useState(false);
  const [working, setWorking] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  async function load() {
    setBusy(true); setListError('');
    try { setGifts((await request<GiftCatalog>('gifts.catalog')).gifts); setLoaded(true); }
    catch (caught) { setListError(failure(caught, 'No se pudo leer el catálogo de regalos.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function pick(gift: CatalogGift) {
    const closing = chosen?.id === gift.id;
    setChosen(closing ? undefined : gift); setCheck(undefined); setNotice(''); setError('');
    if (closing) return;
    setCheck(await request<CanSendGiftResult>('gifts.canSend', { gift: gift.id }).catch(() => undefined));
    if (!options) setOptions(await request<StarPaymentOptions>('gifts.options', { id: chat.id }).catch(() => undefined));
  }
  async function send() {
    if (!chosen || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const sent = await request<boolean>('gifts.send', { id: chat.id, gift: chosen.id, text, private: isPrivate, upgrade });
      setNotice(sent ? `Regalo enviado a ${chat.title}. Telegram ya descontó los Stars.` : 'Cancelado. No se gastó ningún Star.');
      if (sent) { setChosen(undefined); setText(''); setUpgrade(false); void load(); }
    } catch (caught) { setError(failure(caught, 'Telegram no confirmó el envío del regalo.')); }
    finally { setWorking(false); }
  }
  const blocked = chosen ? sendBlockedReason(chosen, check) : '';
  return <div className="gift-tab">
    <ErrorNote text={listError || error}/>
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {!loaded && !listError && <p className="settings-note">{busy ? 'Leyendo los regalos que Telegram ofrece ahora…' : 'Sin catálogo cargado.'}</p>}
    {loaded && !gifts.length && !listError && <p className="settings-note">Telegram no ha puesto regalos a la venta en este momento; el catálogo cambia según la temporada.</p>}
    <ul className="gift-catalog">{gifts.map(gift => <li className={chosen?.id === gift.id ? 'is-open' : ''} key={gift.id}>
      <button type="button" aria-expanded={chosen?.id === gift.id} onClick={() => void pick(gift)}>
        <GiftThumb media={gift.sticker} name={gift.upgradedTitle}/>
        <span className="gift-catalog-body">
          <strong>{gift.upgradedTitle || 'Regalo de Telegram'}</strong>
          <small>{giftPrice(gift.starCount)}{gift.upgradeStarCount > 0 ? ` · mejora ${giftPrice(gift.upgradeStarCount)} aparte` : ''}</small>
          <small>{[gift.isPremium && 'Solo con Premium', gift.resaleCount > 0 ? `${gift.resaleCount} ${gift.resaleCount === 1 ? 'reventa' : 'revendas'} desde ${giftPrice(gift.minResaleStarCount)}` : '', gift.hasColors ? 'Con colores elegibles' : ''].filter(Boolean).join(' · ')}</small>
        </span>
        <ChevronDown size={16} className={chosen?.id === gift.id ? 'is-open' : ''}/>
      </button>
      {chosen?.id === gift.id && <div className="gift-send-form">
        {blocked && <p className="settings-note"><TriangleAlert size={14}/>{blocked}</p>}
        {check?.allowed && <p className="settings-note"><BadgeCheck size={14}/>Telegram permite enviar este regalo ahora.</p>}
        <label className="field-label">Mensaje con el regalo
          <textarea className="large-input" value={text} maxLength={500} placeholder={`Qué quieres que lea ${chat.title}`} onChange={event => setText(event.target.value)}/>
        </label>
        <label className="consent-check"><input type="checkbox" checked={isPrivate} onChange={event => setPrivate(event.target.checked)}/><span>Regalo privado: solo quien lo reciba verá el mensaje y tu nombre.</span></label>
        {gift.upgradeStarCount > 0 && <label className="consent-check"><input type="checkbox" checked={upgrade} onChange={event => setUpgrade(event.target.checked)}/><span>Mejorarlo antes de enviarlo, con los Stars que pago yo ({giftPrice(gift.upgradeStarCount)}).</span></label>}
        {options && options.options.length > 0 && <p className="settings-note">Si te quedas sin Stars, Telegram ofrece recargarlas: {options.options.slice(0, 3).map(option => `${giftPrice(option.starCount)} por ${money(option.amount, option.currency)}`).join(' · ')}. {options.notice}</p>}
        <div className="settings-actions"><button type="button" className="primary" disabled={working || !!blocked || !!check && !check.allowed} onClick={() => void send()}><Busy busy={working} label={`Enviar por ${giftPrice(sendCost(gift, upgrade))}`}/></button></div>
        <p className="settings-note">El precio real lo vuelve a consultar Telegram antes de abrir el diálogo de confirmación: WRGram no usa el importe que muestra esta lista. Un regalo enviado no se puede devolver.</p>
      </div>}
    </li>)}</ul>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/>Actualizar catálogo</button></div>
  </div>;
}

function GiftDetail({ item, recipient, preview, onPreview, changed }: {
  item: ReceivedGiftItem; recipient?: Chat; preview?: GiftUpgradePreview;
  onPreview(value: GiftUpgradePreview | undefined): void; changed(): void;
}) {
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  async function call(method: string, label: string, params: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(label); setError(''); setNotice('');
    try {
      const result = await request<unknown>(method, { id: item.id, ...params });
      if (result === false) setNotice('Cancelado. No se cambió nada.');
      else setNotice(`Telegram confirmó: ${label.toLowerCase()}.`);
      changed();
    } catch (caught) { setError(failure(caught, `Telegram no completó ${label.toLowerCase()}.`)); }
    finally { setBusy(''); }
  }
  async function showPreview() {
    if (preview) { onPreview(undefined); return; }
    if (!item.giftId) { setError('Telegram no identificó el regalo base, así que no puede mostrar sus versiones mejoradas.'); return; }
    setError('');
    try { onPreview(await request<GiftUpgradePreview>('gifts.upgrade.preview', { gift: item.giftId })); }
    catch (caught) { setError(failure(caught, 'No se pudo leer la vista previa de la mejora.')); }
  }
  const price = currentUpgradePrice(preview);
  const upcoming = upcomingUpgradePrices(preview);
  const unique = item.unique;
  return <div className="gift-detail">
    <ErrorNote text={error}/>
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {unique && <div className="gift-unique">
      <header><strong>{unique.title || 'Regalo único'}</strong><span className="gift-badge">{rarityLabel(unique.backdrop?.rarity || '')}</span></header>
      <small>{unique.name} · n.º {unique.number} de {unique.totalUpgradedCount} {unique.totalUpgradedCount === 1 ? 'unidad' : 'unidades'} (máximo {unique.maxUpgradedCount})</small>
      {(unique.model || unique.symbol) && <ul className="gift-attributes">
        {unique.model && <li><Sparkles size={13}/><span><strong>{unique.model.name}</strong><small>{rarityLabel(unique.model.rarity)} · {perMilleLabel(unique.model.perMille)}{unique.model.crafted ? ' · fabricado por ti' : ''}</small></span></li>}
        {unique.symbol && <li><BadgeCheck size={13}/><span><strong>{unique.symbol.name}</strong><small>{rarityLabel(unique.symbol.rarity)} · {perMilleLabel(unique.symbol.perMille)}</small></span></li>}
      </ul>}
      {unique.backdrop?.colors && <div className="gift-colors" role="img" aria-label={`Colores del fondo ${unique.backdrop.name}: centro ${unique.backdrop.colors.center}, borde ${unique.backdrop.colors.edge}, símbolo ${unique.backdrop.colors.symbol}, texto ${unique.backdrop.colors.text}`}>
        {['center', 'edge', 'symbol', 'text'].map(key => <i key={key} style={{ background: (unique.backdrop?.colors as unknown as Record<string, string>)[key] || 'var(--input)' }}/>)}
        <small>{unique.backdrop.name}</small>
      </div>}
      {unique.isBurned && <small>Telegram quemó este regalo: ya no se puede enviar.</small>}
      {!!unique.valueAmount && unique.valueAmount > 0 && <small>Último precio publicado: {unique.valueAmount.toLocaleString('es')} {unique.valueCurrency} (≈ {unique.valueUsdAmount?.toLocaleString('es')} USD).</small>}
    </div>}
    <div className="gift-actions">
      <button type="button" className="secondary" disabled={!!busy} onClick={() => void call('gifts.save', item.saved ? 'Dejar de guardar' : 'Guardar', { value: !item.saved })}><Save size={15}/><Busy busy={busy === 'Guardar' || busy === 'Dejar de guardar'} label={item.saved ? 'Dejar de guardar' : 'Guardar'}/></button>
      {item.canUpgrade && <button type="button" className="secondary" disabled={!!busy} onClick={() => void showPreview()}><ChevronDown size={15} className={preview ? 'is-open' : ''}/>{preview ? 'Ocultar las variantes' : 'Ver las variantes'}</button>}
      {item.canUpgrade && <button type="button" className="primary" disabled={!!busy || !item.giftId} onClick={() => void call('gifts.upgrade', 'Mejora', { keepOriginal: item.private })}><Star size={15}/><Busy busy={busy === 'Mejora'} label="Mejorar a único"/></button>}
      {item.sellStarCount > 0 && <button type="button" className="secondary" disabled={!!busy} onClick={() => void call('gifts.sell', 'Cambio por Stars')}><Undo2 size={15}/><Busy busy={busy === 'Cambio por Stars'} label={`Cambiar por ${giftPrice(item.sellStarCount)}`}/></button>}
      {item.canTransfer && !!recipient && <button type="button" className="secondary" disabled={!!busy} onClick={() => void call('gifts.transfer', 'Transferencia', { to: recipient.id })}><Share2 size={15}/><Busy busy={busy === 'Transferencia'} label={`Transferir a ${recipient.title}`}/></button>}
      {item.canDelete && <button type="button" className="secondary" disabled={!!busy} onClick={() => void call('gifts.delete', 'Eliminación')}><Trash2 size={15}/><Busy busy={busy === 'Eliminación'} label="Eliminar"/></button>}
    </div>
    {preview && <div className="gift-preview">
      <p className="settings-note">Telegram mejora el regalo de forma irreversible y elige una variante al azar entre estas.</p>
      {price && <p className="settings-note"><strong>{giftPrice(price.starCount)}</strong> es el precio de la mejora en Telegram hoy.</p>}
      {preview.models.length > 0 && <div className="gift-variants">{preview.models.map((model, index) => <span key={`model:${index}`}><GiftThumb media={model.sticker} name={model.name}/><small>{model.name} · {rarityLabel(model.rarity)}</small></span>)}</div>}
      {preview.symbols.length > 0 && <div className="gift-variants">{preview.symbols.map((symbol, index) => <span key={`symbol:${index}`}><GiftThumb media={symbol.sticker} name={symbol.name}/><small>{symbol.name} · {rarityLabel(symbol.rarity)}</small></span>)}</div>}
      {preview.backdrops.length > 0 && <div className="gift-variants">{preview.backdrops.map(backdrop => <span key={`backdrop:${backdrop.id}`}><span className="gift-colors" role="img" aria-label={`Fondo ${backdrop.name}`}><i style={{ background: backdrop.colors?.center || 'var(--input)' }}/></span><small>{backdrop.name} · {rarityLabel(backdrop.rarity)} · {perMilleLabel(backdrop.perMille)}</small></span>)}</div>}
      {upcoming.length > 0 && <ul className="gift-ladder">{upcoming.map(entry => <li key={`price:${entry.date}`}><span>{day(entry.date)}</span><strong>{giftPrice(entry.starCount)}</strong></li>)}</ul>}
    </div>}
    {item.canTransfer && !recipient && <p className="settings-note"><TriangleAlert size={14}/>Para transferirlo ábrelo desde la conversación de quien será el nuevo dueño: Telegram exige elegirlo ahí.</p>}
  </div>;
}

function GiftReceivedTab({ owner, recipient, title }: { owner?: Chat; recipient?: Chat; title: string }) {
  const [items, setItems] = useState<ReceivedGiftItem[]>([]), [offset, setOffset] = useState(''), [view, setView] = useState<GiftView>('all');
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const [open, setOpen] = useState<string>(), [preview, setPreview] = useState<GiftUpgradePreview>(), [notice, setNotice] = useState('');
  const scope = owner ? { id: owner.id } : {};
  async function load(reset: boolean, filter: GiftView = view, next = false) {
    setBusy(true); setError('');
    try {
      const page = await request<ReceivedGiftCatalog>('gifts.received', { ...scope, view: filter, limit: 40, offset: reset ? '' : (next ? offset : '') });
      setItems(current => reset ? page.gifts : mergeReceived(current, page.gifts));
      setOffset(page.offset); setLoaded(true);
      if (reset) { setOpen(undefined); setPreview(undefined); }
    } catch (caught) { setError(failure(caught, `No se pudieron leer los ${title.toLowerCase()}.`)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(true); }, [owner?.id]);
  async function pin(item: ReceivedGiftItem) {
    const ids = togglePin(pinnedIds(items), item.id);
    if (!ids) { setError(`Telegram fija como mucho ${MAX_PINNED} regalos.`); return; }
    setError(''); setNotice('');
    try {
      await request('gifts.pin', { ...scope, ids });
      setNotice(ids.includes(item.id) ? 'Regalo fijado en el perfil.' : 'Regalo quitado de los fijados.');
      void load(true);
    } catch (caught) { setError(failure(caught, 'Telegram no guardó los regalos fijados.')); }
  }
  return <div className="gift-tab">
    <div className="segmented gift-filter" role="group" aria-label={`Filtro de ${title.toLowerCase()}`}>
      {GIFT_VIEWS.map(([key, label]) => <button type="button" key={key} className={view === key ? 'selected' : ''} disabled={busy} aria-pressed={view === key} onClick={() => { setView(key); void load(true, key); }}>{label}</button>)}
    </div>
    <ErrorNote text={error}/>
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {items.length > 0 && <ul className="gift-list">{items.map((item, index) => <li className={`gift-row${item.pinned ? ' is-pinned' : ''}${item.kind === 'upgraded' ? ' is-unique' : ''}`} key={item.id || `${item.date}:${index}`}>
      <header>
        <GiftThumb media={item.sticker || item.unique?.sticker} name={item.unique?.title || 'Regalo'}/>
        <span className="gift-row-body">
          <strong>{item.unique?.title || 'Regalo de Telegram'} {uniqueNumber(item)}</strong>
          <small>{giftSubtitle(item) || (item.kind === 'upgraded' ? 'Regalo único' : 'Regalo normal')}</small>
          <small>{day(item.date)}{item.refunded ? ' · reembolsado' : ''}{item.private ? ' · privado' : ''}</small>
        </span>
        <span className="gift-row-side">
          {item.pinned && <span className="gift-badge"><Pin size={12}/>Fijado</span>}
          {item.canUpgrade && <span className="gift-badge">Mejorable</span>}
          <button type="button" className="icon-button" aria-label={open === item.id ? 'Cerrar el regalo' : 'Abrir el regalo'} aria-expanded={open === item.id} onClick={() => { setOpen(current => current === item.id ? undefined : item.id); setPreview(undefined); }}><ChevronDown size={18} className={open === item.id ? 'is-open' : ''}/></button>
        </span>
      </header>
      {open === item.id ? <GiftDetail item={item} recipient={recipient} preview={preview} onPreview={setPreview} changed={() => void load(true)}/>
        : <button type="button" className="gift-pin" onClick={() => void pin(item)}><Pin size={14}/>{item.pinned ? 'Quitar de los fijados' : 'Fijar en el perfil'}</button>}
    </li>)}</ul>}
    {loaded && !items.length && !error && <p className="settings-note">No hay regalos con este filtro. Los regalos que te envíen aparecerán aquí en cuanto Telegram los confirme.</p>}
    {!loaded && !error && <p className="settings-note">{busy ? 'Consultando los regalos en Telegram…' : 'Sin regalos cargados.'}</p>}
    <div className="settings-actions">
      {offset && <button type="button" className="secondary" disabled={busy} onClick={() => void load(false, view, true)}><Busy busy={busy} label="Cargar más"/></button>}
      <button type="button" className="secondary" disabled={busy} onClick={() => void load(true)}><RefreshCw size={16}/>Actualizar regalos</button>
    </div>
    <p className="settings-note">WRGram no inventa regalos ni precios: cada lista, cada número de serie y cada coste de mejora los devuelve Telegram para esta cuenta.</p>
  </div>;
}

export function GiftsPanel({ chat, initial = 'received' }: { chat?: Chat; initial?: Tab }) {
  const owner = chat?.type === 'channel' ? chat : undefined;
  const recipient = chat && chat.type !== 'secret' && !chat.bot ? chat : undefined;
  const title = owner ? `regalos de ${owner.title}` : 'tus regalos';
  const [tab, setTab] = useState<Tab>(recipient && initial === 'send' ? 'send' : 'received');
  const tabs: [Tab, string][] = recipient ? [['received', owner ? 'Del canal' : 'Mis regalos'], ['send', `Enviar a ${recipient.title}`]] : [['received', owner ? 'Del canal' : 'Mis regalos']];
  return <div className="gift-panel">
    <header className="gift-head"><span className="gift-head-icon"><Gift/></span><div><strong>Regalos de Telegram</strong><small>{chat ? `${chat.title} · ${title}` : 'Regalos que ha recibido tu cuenta'}</small></div></header>
    {chat && !chat.supported && <p className="settings-note"><TriangleAlert size={15}/>WRGram no abre este chat, pero Telegram sí permite enviarle regalos.</p>}
    <nav className="settings-subnav" aria-label="Regalos">{tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'received' ? <GiftReceivedTab owner={owner} recipient={recipient} title={title}/> : <GiftSendTab chat={recipient!}/>}
    <p className="settings-note gift-foot">Los regalos se pagan con los Stars reales de tu cuenta. Telegram decide quién puede enviar, mejorar, cambiar o transferir cada regalo, y WRGram le pide confirmación antes de gastar Stars.</p>
  </div>;
}
