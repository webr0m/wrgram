import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Bookmark, Clock, Film, LoaderCircle, Search, ShieldCheck, Smile, Sparkles, Sticker, X } from 'lucide-react';
import { native, request } from './bridge';
import type { Catalog, CatalogItem, EmojiPackDetail, EmojiPackPage, EmojiStatusOption, Media } from './contract';
import { CustomEmoji } from './CustomEmoji';
import { EMOJI_GROUPS, findEmojis } from './emoji';
import { MediaView } from './MediaView';
import './expression-picker.css';

type Tab = 'emoji' | 'gif' | 'sticker';
const tabs = [
  ['emoji', 'Emojis', Smile], ['gif', 'GIF', Film], ['sticker', 'Stickers', Sticker],
] as const;
const placeholders = {emoji:'Buscar emoji o categoría…',gif:'Buscar GIF en Telegram…',sticker:'Buscar stickers…'};
const gifSuggestions=[['😂','Risa'],['❤️','Amor'],['👏','Aplausos'],['🥳','Fiesta'],['😮','Sorpresa'],['👋','Hola']] as const;

function useResults<T>(method:string, params:Record<string,string>, enabled:boolean, debounce=0) {
  const key=JSON.stringify(params);
  const [result,setResult]=useState<{key:string;value?:T;error?:string}>();
  const [attempt,retry]=useState(0);
  const lookup=key+':'+attempt;
  useEffect(()=>{
    if(!enabled)return;
    let current=true;
    const timer=setTimeout(()=>{
      void request<T>(method,JSON.parse(key)).then(
        value=>{if(current)setResult({key:lookup,value});},
        (error:Error)=>{if(current)setResult({key:lookup,error:error.message});},
      );
    },debounce);
    return()=>{current=false;clearTimeout(timer);};
  },[method,key,lookup,enabled,debounce]);
  const active=enabled&&result?.key===lookup?result:undefined;
  return {value:active?.value,error:active?.error,loading:enabled&&!active,retry:()=>retry(value=>value+1)};
}

function PickerStatus({error,retry,loading,children}:{error?:string;retry?():void;loading?:boolean;children?:ReactNode}) {
  if(loading)return <div className="picker-empty" role="status"><LoaderCircle className="spin" size={22}/><p>Cargando…</p></div>;
  if(error)return <div className="picker-empty" role="alert"><p>{error}</p><button type="button" className="secondary" onClick={retry}>Reintentar</button></div>;
  return <div className="picker-empty"><p>{children}</p></div>;
}

function PackButton({title,selected,onClick,children}:{title:string;selected?:boolean;onClick():void;children:ReactNode}) {
  return <button type="button" title={title} aria-label={title} aria-pressed={selected} onClick={onClick}>{children}</button>;
}

function PackArt({media,emoji='✨'}:{media?:Media;emoji?:string}) {
  const fallback=<span aria-hidden="true">{emoji||'✨'}</span>;
  return media?<MediaView media={media} auto passive playInView fallback={fallback}/>:fallback;
}

function PremiumEmojis({query,choose}:{query:string;choose(item:EmojiStatusOption):void}) {
  const [source,setSource]=useState<'installed'|'featured'>('featured');
  const [packId,selectPack]=useState('');
  const [extra,setExtra]=useState<EmojiPackPage>();
  const [loadingMore,setLoadingMore]=useState(false);
  const [pageError,setPageError]=useState('');
  const [saving,setSaving]=useState(false);
  const [override,setOverride]=useState<{id:string;installed:boolean}>();
  const [installError,setInstallError]=useState('');
  const packs=useResults<EmojiPackPage>('emojiPacks.list',{kind:query?'search':source,query,offset:'0'},true,query?300:0);
  const detail=useResults<EmojiPackDetail>('emojiPacks.get',{id:packId},!!packId);
  const pack=detail.value;
  const installed=pack&&override?.id===pack.id?override.installed:pack?.installed;
  const nextOffset=extra?.nextOffset??packs.value?.nextOffset;
  const items=[...new Map([...(packs.value?.items??[]),...(extra?.items??[])].map(item=>[item.id,item])).values()];

  async function more() {
    if(!nextOffset||loadingMore)return;
    setLoadingMore(true);
    setPageError('');
    try{
      const next=await request<EmojiPackPage>('emojiPacks.list',{kind:'featured',query:'',offset:nextOffset});
      setExtra(current=>({items:[...(current?.items??[]),...next.items],nextOffset:next.nextOffset}));
    }catch(error){setPageError((error as Error).message);}
    finally{setLoadingMore(false);}
  }

  async function toggleInstall() {
    if(!pack||saving)return;
    setSaving(true);
    setInstallError('');
    try{
      await request('stickers.install',{id:pack.id,installed:!installed});
      setOverride({id:pack.id,installed:!installed});
      packs.retry();
    }catch(error){setInstallError((error as Error).message);}
    finally{setSaving(false);}
  }

  return <>
    {!query&&<div className="expression-sections" aria-label="Packs de emojis Premium">
      {([['installed','Guardados'],['featured','Destacados']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={id===source} disabled={loadingMore||saving} onClick={()=>{if(id!==source)setExtra(undefined);setSource(id);selectPack('');setInstallError('');setPageError('');}}>{label}</button>)}
    </div>}
    {packId&&items.length?<div className="sticker-sets expression-packs" aria-label="Packs de emojis">
      {items.map(item=><PackButton key={item.id} title={item.title} selected={packId===item.id} onClick={()=>{selectPack(item.id);setInstallError('');}}><PackArt media={item.thumbnail} emoji={item.emoji}/></PackButton>)}
    </div>:null}
    {packId
      ? pack?<><div className="expression-pack-title">
        <button type="button" className="icon-button" aria-label="Volver a los packs" onClick={()=>selectPack('')}><ArrowLeft size={18}/></button>
        <strong>{pack.title}</strong>
        <button type="button" className="text-button" disabled={saving} onClick={()=>void toggleInstall()}>{installed?'Quitar':'Guardar pack'}</button>
      </div>
      {installError&&<p className="expression-error" role="alert">{installError}</p>}
      {pack.items.length?<div className="emoji-grid" aria-label={pack.title} key={pack.id}>
        {pack.items.map((item,index)=><button type="button" key={item.id} aria-label={`Insertar emoji Premium ${item.emoji||''} · ${index+1}`} onClick={()=>choose(item)}><CustomEmoji {...item} size={31} playInView/></button>)}
      </div>:<PickerStatus>Este pack está vacío.</PickerStatus>}</>:<PickerStatus {...detail}/>
      :items.length?<div className="expression-collection">
        {items.map(item=><button type="button" key={item.id} aria-label={`Abrir pack ${item.title}`} title={item.title} onClick={()=>selectPack(item.id)}><PackArt media={item.thumbnail} emoji={item.emoji}/></button>)}
        {pageError&&<p className="expression-error" role="alert">{pageError}</p>}
        {source==='featured'&&!query&&!!nextOffset&&<button type="button" className="secondary expression-more" disabled={loadingMore} onClick={()=>void more()}>{loadingMore?'Cargando…':pageError?'Reintentar':'Ver más packs'}</button>}
      </div>:<PickerStatus {...packs}>{query?'No encontramos packs con ese nombre.':source==='installed'?'Todavía no tienes packs guardados. Explora los destacados.':'Telegram no devolvió packs destacados.'}</PickerStatus>}
  </>;
}

export default function ExpressionPicker({ready,premium,canSendMedia,close,selectEmoji,select}:{ready:boolean;premium:boolean;canSendMedia:boolean;close():void;selectEmoji(emoji:string,customId?:string):void;select(item:CatalogItem):void}) {
  const [tab,setTab]=useState<Tab>('emoji');
  const [group,setGroup]=useState(0);
  const [premiumEmoji,setPremiumEmoji]=useState(false);
  const [query,setQuery]=useState('');
  const [setId,setSetId]=useState('');
  const [consent,setConsent]=useState(false);
  const [stickerSets,setStickerSets]=useState<Catalog['sets']>();
  const search=query.trim();
  const gifNeedsConsent=tab==='gif'&&!!search&&!consent;
  const catalog=useResults<Catalog>('catalog',{tab,query:search,setId},tab!=='emoji'&&ready&&native&&canSendMedia&&!gifNeedsConsent,search?300:0);
  useEffect(()=>{if(tab==='sticker'&&catalog.value?.sets)setStickerSets(catalog.value.sets);},[tab,catalog.value]);

  function switchTab(next:Tab) {
    if(next===tab)return;
    setTab(next);
    setQuery('');
  }

  function showStickers(id:string) {
    setSetId(id);
    setQuery('');
  }

  const unicode=findEmojis(search,group);
  return <section className="expression-picker" aria-label="Selector de Telegram">
    <header>
      <div role="tablist" aria-label="Tipo de expresión">{tabs.map(([id,label,Icon])=><button type="button" role="tab" aria-selected={tab===id} className={tab===id?'selected':''} key={id} onClick={()=>switchTab(id)}><Icon size={16}/><span>{label}</span></button>)}</div>
      <button type="button" className="icon-button" aria-label="Cerrar selector" onClick={close}><X size={18}/></button>
    </header>
    <label className="picker-search"><Search size={16}/><input aria-label={placeholders[tab]} placeholder={placeholders[tab]} value={query} maxLength={tab==='emoji'?64:100} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label="Borrar búsqueda" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
    {tab==='emoji'?<>
      <div className="emoji-categories expression-packs" aria-label="Categorías de emojis">
        {premium&&<PackButton title="Emojis Premium" selected={premiumEmoji} onClick={()=>setPremiumEmoji(value=>!value)}><Sparkles size={20}/></PackButton>}
        {EMOJI_GROUPS.map((category,index)=><PackButton key={category.name} title={category.name} selected={!premiumEmoji&&!search&&group===index} onClick={()=>{setPremiumEmoji(false);setGroup(index);setQuery('');}}>{category.icon}</PackButton>)}
      </div>
      {premium&&premiumEmoji
        ? <PremiumEmojis key={search} query={search} choose={item=>selectEmoji(item.emoji||'✨',item.id)}/>
        : unicode.length?<div className="emoji-grid" aria-label={search?'Resultados de emojis':EMOJI_GROUPS[group].name} key={group}>{unicode.map(emoji=><button type="button" key={emoji} aria-label={`Insertar ${emoji}`} onClick={()=>selectEmoji(emoji)}>{emoji}</button>)}</div>:<PickerStatus>No hay emojis que coincidan con la búsqueda.</PickerStatus>}
    </>:gifNeedsConsent?<div className="picker-empty"><ShieldCheck/><p>La búsqueda envía el término al bot de GIF configurado por Telegram.</p><button type="button" className="secondary" onClick={()=>setConsent(true)}>Permitir búsqueda de GIF</button></div>:<>
      {tab==='gif'&&canSendMedia&&<div className="sticker-sets expression-packs" aria-label="Colecciones de GIF">
        <PackButton title="GIF guardados" selected={!search} onClick={()=>setQuery('')}><Bookmark size={20}/></PackButton>
        {gifSuggestions.map(([emoji,label])=><PackButton key={label} title={label} selected={search===label} onClick={()=>setQuery(label)}>{emoji}</PackButton>)}
      </div>}
      {tab==='sticker'&&<div className="sticker-sets expression-packs" aria-label="Packs de stickers">
        <PackButton title="Recientes" selected={!search&&!setId} onClick={()=>showStickers('')}><Clock size={20}/></PackButton>
        <PackButton title="Favoritos" selected={!search&&setId==='favorites'} onClick={()=>showStickers('favorites')}><Bookmark size={20}/></PackButton>
        {premium&&<PackButton title="Stickers Premium" selected={!search&&setId==='premium'} onClick={()=>showStickers('premium')}><Sparkles size={20}/></PackButton>}
        {stickerSets?.map(item=><PackButton key={item.id} title={item.title} selected={!search&&setId===item.id} onClick={()=>showStickers(item.id)}><PackArt media={item.thumbnail} emoji={item.emoji||'🖼️'}/></PackButton>)}
      </div>}
      {catalog.value?.items.length?<div className={`catalog-grid ${tab}`} aria-label={tab==='gif'?(search?'Resultados de GIF':'GIF guardados'):'Stickers disponibles'} key={tab+setId+search}>
        {catalog.value.items.map((item,index)=>{
          const locked=item.premium&&!premium;
          const label=tab==='gif'?`GIF ${index+1}`:item.label;
          return <button type="button" key={item.key} title={locked?`${label} · Requiere Premium`:label} aria-label={locked?`${label} · Requiere Premium`:label} disabled={locked} onClick={()=>select(item)}>
            <PackArt media={item.media} emoji={item.emoji||(tab==='gif'?'🎞️':'🙂')}/>
            {item.premium&&<span className="expression-premium" aria-hidden="true"><Sparkles size={12}/></span>}
          </button>;
        })}
      </div>:<PickerStatus {...catalog}>{!canSendMedia?'Este chat no permite enviar GIF o stickers.':!native?'Conecta tu cuenta en Android para ver tus GIF y stickers.':search?'No hay resultados para esta búsqueda.':tab==='gif'?'Aquí aparecerán tus GIF guardados.':'No hay stickers en esta colección.'}</PickerStatus>}
    </>}
  </section>;
}
