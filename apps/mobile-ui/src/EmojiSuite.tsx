import { useState } from 'react';
import { Search } from 'lucide-react';
import { EMOJI_GROUPS, SKIN_TONES, findEmojis, hasTone, tonedEmoji } from './emoji';
import './emoji-suite.css';

let currentTone=0;

export function EmojiSuite({onPick,note}:{onPick(emoji:string):void;note?:string}){
  const [group,setGroup]=useState(0),[query,setQuery]=useState(''),[tone,setTone]=useState(currentTone);
  const items=findEmojis(query,group);
  const chooseTon=(value:number)=>{currentTone=value;setTone(value);};
  return <div className="emoji-suite">
    <label className="picker-search"><Search size={16}/><input aria-label="Buscar emoji" placeholder="Buscar emoji o categoría…" value={query} maxLength={60} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="emoji-categories" role="tablist" aria-label="Categorías de emojis">{EMOJI_GROUPS.map((category,index)=><button type="button" role="tab" aria-selected={!query&&group===index} className={!query&&group===index?'selected':''} aria-label={category.name} title={category.name} key={category.name} onClick={()=>{setGroup(index);setQuery('');}}>{category.icon}</button>)}</div>
    <div className="emoji-tones" role="radiogroup" aria-label="Tono de piel">{SKIN_TONES.map((value,index)=><button type="button" role="radio" aria-checked={tone===index} aria-label={index===0?'Tono de piel predeterminado':`Tono de piel ${index}`} title={index===0?'Predeterminado':`Tono ${index}`} className={tone===index?'selected':''} key={value||'base'} onClick={()=>chooseTon(index)}>{index===0?'✋':`✋${value}`}</button>)}</div>
    <div className="emoji-grid" role="listbox" aria-label={query?`Resultados para ${query}`:EMOJI_GROUPS[group].name}>{items.map(emoji=>{const shown=tonedEmoji(emoji,tone);return <button type="button" role="option" aria-label={`Elegir ${shown}`} key={emoji} onClick={()=>onPick(shown)}>{shown}</button>;})}</div>
    {items.length===0&&<p className="emoji-suite-empty" role="status">No hay emojis que coincidan con “{query}”.</p>}
    <footer>{note||(items.some(hasTone)?'Toca un tono para cambiar la piel de los emojis que lo admiten.':'Catálogo Unicode completo con búsqueda en español.')}</footer>
  </div>;
}
