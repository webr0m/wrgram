import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { request, snapshot, subscribe } from './bridge';
import type { EmojiPack, EmojiPackDetail, EmojiPackPage, EmojiStatusOption } from './contract';
import { CustomEmoji } from './CustomEmoji';
import { MediaView } from './MediaView';
import { PremiumMark } from './PremiumMark';

type View = 'status'|'featured'|'installed'|'search';
const TABS = [['status','Estados'],['featured','Destacados'],['installed','Guardados']] as const;
const DURATION = [[0,'Sin caducidad'],[3600,'1 hora'],[7200,'2 horas'],[28800,'8 horas'],[86400,'1 día'],[172800,'2 días']] as const;

export function EmojiStatusSettings({initial='status'}:{initial?:'status'|'featured'}) {
  const state = useSyncExternalStore(subscribe,snapshot);
  if (!state.ready) return <p className="settings-note">Inicia sesión para explorar los emojis de Telegram.</p>;
  return <EmojiCatalog key={state.selfId} premium={state.wallet?.premium===true} initial={initial}/>;
}

export function PremiumEmojiPicker({pick}:{pick(emoji:EmojiStatusOption):void}) {
  const state = useSyncExternalStore(subscribe,snapshot);
  if (!state.ready || !state.wallet?.premium) {
    return <p className="settings-note">Necesitas Telegram Premium para elegir un emoji de un pack.</p>;
  }
  return <EmojiCatalog key={state.selfId} premium initial="featured" pick={pick}/>;
}

function EmojiCatalog({premium,initial,pick}:{premium:boolean;initial:'status'|'featured';pick?(emoji:EmojiStatusOption):void}) {
  const status = useSyncExternalStore(subscribe,() => snapshot().emojiStatus);
  const [view,setView] = useState<View>(initial);
  const [options,setOptions] = useState<EmojiStatusOption[]>([]);
  const [page,setPage] = useState<EmojiPackPage>();
  const [pack,setPack] = useState<EmojiPackDetail>();
  const [query,setQuery] = useState('');
  const [search,setSearch] = useState('');
  const [duration,setDuration] = useState(0);
  const [chosen,setChosen] = useState<EmojiStatusOption>();
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [retry,setRetry] = useState<()=>void>();
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const seq = ++generation.current;
    setLoading(true);
    setError('');
    setRetry(undefined);
    setPage(undefined);
    const load = view === 'status'
      ? request<EmojiStatusOption[]>('emojiStatus.options').then(result => {if (seq===generation.current) setOptions(result);})
      : request<EmojiPackPage>('emojiPacks.list',{kind:view,query:search,offset:0}).then(result => {if (seq===generation.current) setPage(result);});
    void load.catch(reason => {if (seq===generation.current) {setError(reason.message);setRetry(()=>()=>setRefresh(value=>value+1));}})
      .finally(() => {if (seq===generation.current) setLoading(false);});
    return () => {generation.current++;};
  },[view,search,refresh]);

  function browse(next:View) {
    generation.current++;
    setPack(undefined);
    setChosen(undefined);
    setError('');
    setRetry(undefined);
    setNotice('');
    setLoading(next!==view);
    setView(next);
  }

  async function open(pack:EmojiPack) {
    const seq = ++generation.current;
    setLoading(true);
    setError('');
    setRetry(undefined);
    try {
      const result = await request<EmojiPackDetail>('emojiPacks.get',{id:pack.id});
      if (seq===generation.current) setPack(result);
    } catch (reason) {
      if (seq===generation.current) {setError((reason as Error).message);setRetry(()=>()=>void open(pack));}
    } finally {
      if (seq===generation.current) setLoading(false);
    }
  }

  async function more() {
    if (!page?.nextOffset || loading) return;
    const seq = generation.current;
    setLoading(true);
    setError('');
    setRetry(undefined);
    try {
      const next = await request<EmojiPackPage>('emojiPacks.list',{kind:'featured',offset:page.nextOffset,query:''});
      if (seq!==generation.current) return;
      const known = new Set(page.items.map(item=>item.id));
      setPage({items:[...page.items,...next.items.filter(item=>!known.has(item.id))],nextOffset:next.nextOffset});
    } catch (reason) {
      if (seq===generation.current) setError((reason as Error).message);
    } finally {
      if (seq===generation.current) setLoading(false);
    }
  }

  async function savePack() {
    if (!pack || saving) return;
    const installed = !pack.installed;
    setSaving(true);
    setError('');
    setRetry(undefined);
    setNotice('');
    try {
      await request('stickers.install',{id:pack.id,installed});
      setPack({...pack,installed});
      setNotice(installed?'Pack guardado en Telegram.':'Pack quitado de tus guardados.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function apply(id:string) {
    if (!premium || saving) return;
    setSaving(true);
    setError('');
    setRetry(undefined);
    setNotice('');
    try {
      const expiration = id !== '0' && duration ? Math.floor(Date.now()/1000)+duration : 0;
      await request('emojiStatus.set',{id,expiration});
      setChosen(undefined);
      setNotice(id==='0' ? 'Quitaste el estado emoji.' : 'Estado emoji actualizado en Telegram.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function closePack() {
    setPack(undefined);
    setChosen(undefined);
    setError('');
    setRetry(undefined);
    setNotice('');
    if (view==='installed') setRefresh(value=>value+1);
  }

  const items = pack?.items ?? (view==='status' ? options : []);
  return <div className="emoji-catalog">
    {!pick && (premium ? <div className="emoji-current">
      <PremiumMark premium status={status} size={24}/>
      <span>{status ? 'Estado emoji activo' : 'Sin estado emoji'}</span>
      {status && <button type="button" className="text-button" disabled={saving} onClick={()=>void apply('0')}>Quitar</button>}
    </div> : <p className="settings-note">Puedes ver los packs. Para elegir un emoji de estado necesitas Telegram Premium.</p>)}
    <nav className="settings-subnav" aria-label="Explorar emojis">
      {TABS.filter(([id])=>!pick||id!=='status').map(([id,label])=><button type="button" key={id} aria-pressed={view===id} disabled={saving||(!pack && view===id)} onClick={()=>browse(id)}>{label}</button>)}
    </nav>
    <form className="emoji-pack-search" onSubmit={event=>{
      event.preventDefault();
      const value = query.trim();
      if (!value || saving) return;
      if (value===search && view==='search') setRefresh(count=>count+1);
      browse('search');
      setSearch(value);
    }}>
      <label className="chat-search"><Search size={16}/><input aria-label="Buscar packs de emojis" placeholder="Buscar packs de emojis" value={query} maxLength={64} onChange={event=>setQuery(event.target.value)}/></label>
      <button className="secondary" type="submit" disabled={!query.trim()||saving}>Buscar</button>
    </form>
    {pack ? <div className="emoji-pack-heading">
      <button type="button" className="text-button" disabled={saving} onClick={closePack}><ArrowLeft size={16}/>Volver a los packs</button>
      <div className="emoji-pack-title">
        <strong>{pack.title}</strong>
        {!pick && <button type="button" className="secondary" disabled={saving} onClick={()=>void savePack()}>{pack.installed?'Quitar de guardados':'Guardar pack'}</button>}
      </div>
    </div> : view!=='status' && <div className="emoji-pack-list">
      {page?.items.map(item=><button key={item.id} type="button" className="emoji-pack-row" disabled={loading||saving} onClick={()=>void open(item)}>
        <span className="emoji-pack-cover">{item.thumbnail ? <MediaView media={item.thumbnail} auto passive/> : '✨'}</span>
        <span><strong>{item.title}</strong><small>{item.size} emojis</small></span>
        <ChevronRight size={17}/>
      </button>)}
      {!loading && !error && page?.items.length===0 && <p className="settings-note">{view==='installed'?'Todavía no tienes packs guardados.':'Telegram no devolvió packs para esta búsqueda.'}</p>}
      {!!page?.nextOffset && <button type="button" className="secondary" disabled={loading} onClick={()=>void more()}>Ver más packs</button>}
    </div>}
    {(pack || view==='status') && <div className="emoji-catalog-grid" aria-label={pack ? 'Emojis del pack' : 'Estados sugeridos'}>
      {items.map((item,index)=>{
        const label = item.emoji ? 'Emoji '+item.emoji+' · '+(index+1) : 'Emoji '+(index+1);
        return premium ? <button key={item.id} type="button" aria-label={label} aria-pressed={pick ? undefined : chosen?.id===item.id} disabled={saving} onClick={()=>{
          if (pick) pick(item);
          else {setChosen(item);setNotice('');}
        }}>
          <CustomEmoji {...item} size={30} alt={label}/>
        </button> : <span key={item.id}><CustomEmoji {...item} size={30} alt={label}/></span>;
      })}
      {!items.length&&!loading&&!error&&<p className="settings-note">No hay emojis disponibles.</p>}
    </div>}
    {chosen && premium && <div className="emoji-apply">
      <CustomEmoji {...chosen} size={30}/>
      <label>Duración <select value={duration} disabled={saving} onChange={event=>setDuration(Number(event.target.value))}>
        {DURATION.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" className="primary" disabled={saving} onClick={()=>void apply(chosen.id)}>{saving?'Guardando…':'Usar como estado'}</button>
    </div>}
    {loading && <p className="settings-note" role="status">Cargando emojis de Telegram…</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {error && <p className="settings-note settings-error" role="alert">{error} {retry&&<button className="text-button" type="button" disabled={loading||saving} onClick={retry}>Reintentar</button>}</p>}
  </div>;
}
