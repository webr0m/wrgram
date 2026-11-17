import { CustomEmoji } from './CustomEmoji';
import type { ReactionOption } from './contract';

/** La clave de React para una reacción: el `emoji` vacío de una personalizada no la confunde con otra. */
export function reactionKey(option:ReactionOption){return `${option.kind}:${option.customEmojiId||option.emoji}`;}

export function ReactionButton({option,pick}:{option:ReactionOption;pick(option:ReactionOption):void}){
  const custom=option.kind==='custom';
  return <button type="button" className={option.needsPremium?'reaction-premium':''} aria-label={custom?'Reaccionar con un emoji personalizado de Premium':`Reaccionar con ${option.emoji}`} title={option.needsPremium?'Requiere Telegram Premium':undefined} onClick={()=>pick(option)}>{custom?<CustomEmoji id={option.customEmojiId??''} size={22}/>:option.emoji}</button>;
}

export function ReactionSuite({options,pick}:{options:ReactionOption[];pick(option:ReactionOption):void}){
  return <div className="reaction-suite">
    <div className="reaction-picker">{options.map(option=><ReactionButton key={reactionKey(option)} option={option} pick={pick}/>)}</div>
    <p className="settings-note">Telegram decide qué reacciones admite cada mensaje: aquí solo están las que ofrece este chat, incluidas las que necesitan Premium.</p>
  </div>;
}
