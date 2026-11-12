import type { RichBlock, RichMessageInfo, TextEntity } from './contract';
import { FormattedText } from './formatting';
import { MediaView } from './MediaView';
import './rich-message.css';

type Handlers = {
  openUrl?(url:string):void;
  openUser?(userId:string):void;
  openTag?(tag:string):void;
  openCommand?(command:string):void;
};

const MEDIA_TYPES = new Set(['photo','video','animation','audio','document','voiceNote']);

const safeLink = (url?:string) => url && /^(https?:\/\/|tg:\/\/)/i.test(url) ? url : undefined;

function formatDate(seconds?:number): string {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

function RichText({text,entities,...handlers}:{text?:string;entities?:TextEntity[]}&Handlers){
  if (!text) return null;
  return <FormattedText text={text} entities={entities} {...handlers} />;
}

function Caption({block,...handlers}:{block:RichBlock}&Handlers){
  if (!block.caption) return null;
  return <p className="rich-caption"><RichText text={block.caption} entities={block.captionEntities} {...handlers} />{block.credit && <small>{block.credit}</small>}</p>;
}

function Blocks({blocks,...handlers}:{blocks?:RichBlock[]}&Handlers){
  if (!blocks?.length) return null;
  return <>{blocks.map((block,index)=><Block key={index} block={block} {...handlers} />)}</>;
}

function Block({block,...handlers}:{block:RichBlock}&Handlers){
  if (MEDIA_TYPES.has(block.type)) {
    return <div className={`rich-media${block.spoiler?' is-spoiler':''}`}>
      {block.media && <MediaView media={block.media} fileControls auto={block.type==='photo'||block.type==='animation'} eager={block.type==='photo'} />}
      <Caption block={block} {...handlers} />
    </div>;
  }
  switch (block.type) {
    case 'title': return block.text ? <h3 className="rich-title"><RichText text={block.text} entities={block.entities} {...handlers} /></h3> : null;
    case 'subtitle': return block.text ? <h4 className="rich-subtitle"><RichText text={block.text} entities={block.entities} {...handlers} /></h4> : null;
    case 'header': return block.text ? <h4 className="rich-header"><RichText text={block.text} entities={block.entities} {...handlers} /></h4> : null;
    case 'subheader': return block.text ? <h5 className="rich-subheader"><RichText text={block.text} entities={block.entities} {...handlers} /></h5> : null;
    case 'sectionHeading': return block.text ? <h5 className={`rich-sectionHeading${(block.size??0)>1?' is-large':''}`}><RichText text={block.text} entities={block.entities} {...handlers} /></h5> : null;
    case 'kicker': return block.text ? <small className="rich-kicker"><RichText text={block.text} entities={block.entities} {...handlers} /></small> : null;
    case 'paragraph': return block.text ? <p className="rich-paragraph"><RichText text={block.text} entities={block.entities} {...handlers} /></p> : null;
    case 'footer': return block.text ? <footer className="rich-footer"><RichText text={block.text} entities={block.entities} {...handlers} /></footer> : null;
    case 'pre': return block.text ? <div className="rich-pre">{block.language && <small>{block.language}</small>}<pre>{block.text}</pre></div> : null;
    case 'math': return block.text ? <div className="rich-math">{block.text}</div> : null;
    case 'thinking': return block.text ? <details className="rich-thinking"><summary>Razonamiento</summary><p><RichText text={block.text} entities={block.entities} {...handlers} /></p></details> : null;
    case 'divider': return <hr className="rich-divider" />;
    case 'authorDate': return block.text ? <p className="rich-author"><RichText text={block.text} entities={block.entities} {...handlers} />{block.date ? <time>{formatDate(block.date)}</time> : null}</p> : null;
    case 'blockquote': return <blockquote className="rich-quote"><RichText text={block.text} entities={block.entities} {...handlers} />{block.credit && <small>{block.credit}</small>}</blockquote>;
    case 'pullQuote': return block.text ? <blockquote className="rich-quote is-pull"><RichText text={block.text} entities={block.entities} {...handlers} /></blockquote> : null;
    case 'expandableBlockquote': return block.text ? <details className="rich-quote is-expandable"><summary><RichText text={block.text} entities={block.entities} {...handlers} /></summary>{block.credit && <small>{block.credit}</small>}</details> : null;
    case 'list': return <ul className="rich-list">{(block.items??[]).map((item,index)=><li key={index} className={item.checkbox?'is-checkable':undefined}>{item.checkbox?<span className={`rich-check${item.checked?' is-checked':''}`} aria-hidden="true">{item.checked?'✓':''}</span>:item.label?<span className="rich-label">{item.label}</span>:<span className="rich-bullet" aria-hidden="true">•</span>}<div className="rich-list-body">{item.blocks?.length?<Blocks blocks={item.blocks} {...handlers} />:null}</div></li>)}</ul>;
    case 'details': return <details className="rich-details" open={block.open}><summary><RichText text={block.text} entities={block.entities} {...handlers} /></summary><Blocks blocks={block.blocks} {...handlers} /></details>;
    case 'cover': return block.block ? <div className="rich-cover"><Block block={block.block} {...handlers} /></div> : null;
    case 'collage': return <div className="rich-collage"><Blocks blocks={block.blocks} {...handlers} /><Caption block={block} {...handlers} /></div>;
    case 'slideshow': return <div className="rich-slideshow"><Blocks blocks={block.blocks} {...handlers} /><Caption block={block} {...handlers} /></div>;
    case 'embedded': {const url=safeLink(block.url);return <section className="rich-embedded">{block.media&&<MediaView media={block.media} auto />}<Caption block={block} {...handlers} />{url&&<button type="button" className="text-button" onClick={()=>handlers.openUrl?.(url)}>Abrir contenido externo</button>}</section>;}
    case 'embeddedPost': {const url=safeLink(block.url);return <article className="rich-embeddedPost">{(block.author||block.date)&&<small className="rich-embed-author">{[block.author,formatDate(block.date)].filter(Boolean).join(' · ')}</small>}<Blocks blocks={block.blocks} {...handlers} /><Caption block={block} {...handlers} />{url&&<button type="button" className="text-button" onClick={()=>handlers.openUrl?.(url)}>Ver publicación original</button>}</article>;}
    case 'chatLink': {const url=block.username?`https://t.me/${block.username}`:undefined;return <section className="rich-chatLink">{block.media&&<MediaView media={block.media} eager />}<span className="rich-chatLink-text"><strong>{block.title||'Conversación'}</strong>{block.username&&<small>@{block.username}</small>}</span>{url?<button type="button" className="text-button" onClick={()=>handlers.openUrl?.(url)}>Abrir</button>:null}</section>;}
    case 'table': {const rows=block.cells??[];return <div className="rich-table-wrap"><table className={`rich-table${block.bordered?' is-bordered':''}${block.striped?' is-striped':''}${block.compact?' is-compact':''}`}><tbody>{rows.map((row,index)=><tr key={index}>{(row??[]).map((cell,column)=>cell?<td key={column} colSpan={Math.min(cell.colspan||1,Math.max(1,(row??[]).length-column))} rowSpan={Math.min(cell.rowspan||1,Math.max(1,rows.length-index))} className={cell.header?'is-header':undefined}><RichText text={cell.text} entities={cell.entities} {...handlers} /></td>:null)}</tr>)}</tbody></table>{block.caption&&<Caption block={block} {...handlers} />}</div>;}
    case 'relatedArticles': return <section className="rich-related">{block.header&&<h5 className="rich-sectionHeading">{block.header}</h5>}{block.articles&&block.articles.length>0?<div className="rich-article-list">{block.articles.map((article,index)=>{const url=safeLink(article.url);return <a key={index} className="rich-article" href={url} onClick={event=>{event.preventDefault();if(url)handlers.openUrl?.(url);}}>{article.media&&<MediaView media={article.media} eager />}{article.title&&<strong>{article.title}</strong>}{article.description&&<p>{article.description}</p>}<small>{[article.author,formatDate(article.date)].filter(Boolean).join(' · ')}</small></a>;})}</div>:null}</section>;
    case 'map': {const hasLocation=Number.isFinite(block.latitude)&&Number.isFinite(block.longitude);return <section className="rich-map"><small>Ubicación compartida</small>{hasLocation?<button type="button" className="text-button" onClick={()=>handlers.openUrl?.(`https://www.openstreetmap.org/?mlat=${block.latitude}&mlon=${block.longitude}#map=15/${block.latitude}/${block.longitude}`)}>Abrir mapa</button>:null}<Caption block={block} {...handlers} /></section>;}
    case 'buttons': return <div className="rich-buttons">{(block.buttons??[]).map((row,index)=>{const url=safeLink(row.url);return <button key={index} type="button" className="rich-button" disabled={!url} onClick={()=>url&&handlers.openUrl?.(url)}>{row.text}</button>;})}</div>;
    default: return null;
  }
}

export function RichMessage({rich,...handlers}:{rich:RichMessageInfo}&Handlers){
  if (!rich.blocks?.length) return null;
  return <div className={`rich-message${rich.rtl?' is-rtl':''}`}>
    {rich.blocks.map((block,index)=><Block key={index} block={block} {...handlers} />)}
    {!rich.full && <small className="rich-partial">Contenido recortado · el resto se ve en Telegram</small>}
  </div>;
}
