import { readFileSync } from 'node:fs';
import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatOptions, ChatOptionSection, optionSections } from './ChatOptions';
import { ReplyQuote } from './ReplyQuote';

vi.mock('./language',()=>({useLanguage:()=>({t:(text:string)=>text})}));
vi.mock('./bridge',()=>({native:false,request:vi.fn(),snapshot:()=>({}),subscribe:vi.fn()}));
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const section=(id:string,children:React.ReactNode)=>h(ChatOptionSection,{id,title:id,description:'Descripción',icon:h('span',null,'•'),children});

describe('opciones de chat por categorías',()=>{
  it('omits empty sections including nested conditional fragments',()=>{
    const children=[section('messages',h('button',null,'Archivar')),section('private',false),section('empty',h(Fragment,null,false,null)),section('nested',h(Fragment,null,false,h('button',null,'Salir')))];
    expect(optionSections(children).map(item=>item.id)).toEqual(['messages','nested']);
  });
  it('shows quick actions and category cards instead of mounting the entire action list',()=>{
    const action=vi.fn();
    function DeferredAction(){action();return h('button',null,'Eliminar foto');}
    const html=renderToStaticMarkup(h(ChatOptions,{quick:h('button',null,'Fijar'),children:[section('Comunidad',h(DeferredAction)),section('Vacía',false)]}));
    expect(html).toContain('Accesos rápidos');expect(html).toContain('chat-options-category');
    expect(html).toContain('Comunidad');expect(html).not.toContain('Eliminar foto');expect(html).not.toContain('Vacía');
    expect(action).not.toHaveBeenCalled();
  });
  it('keeps submenu Back/Escape in the shared overlay stack and preserves the enclosing focus trap',()=>{
    expect(source('./ChatOptions.tsx')).toContain('useDialogNavigation(!!section');
    expect(source('./ChatOptions.tsx')).not.toContain("addEventListener('keydown'");
    const dialogs=source('./dialogs.tsx');
    expect(dialogs).toContain('navigation:true');expect(dialogs).toContain("event.key==='Tab'");
    expect(dialogs).toContain('isTopOverlay(overlay)');
  });
  it('connects both platform menus without changing their action guards',()=>{
    const app=source('./App.tsx');
    expect(app.match(/<ChatOptions key=/g)).toHaveLength(2);
    for(const label of ['Mensajes','Personas e invitaciones','Comunidad'])expect(app).toContain('title="'+label+'"');
    expect(app).toContain('chat.canReport&&chat.type!==');
    expect(app).toContain('community(chat)&&chat.photo&&<MenuItem');
    expect(app).toContain('key={state.selfId+\':\'+chat.id} quick=');
  });
});

describe('citas contenidas en la burbuja',()=>{
  it('separates author and quote into two shrinkable lines and preserves the full text',()=>{
    const author='NombreSinEspacios'.repeat(30),text='https://example.org/'+('ruta'.repeat(300));
    const html=renderToStaticMarkup(h(ReplyQuote,{author,text,group:true,jump:()=>{}}));
    expect(html).toContain('reply-preview-copy');expect(html).toContain('reply-preview-author');expect(html).toContain('reply-preview-text');
    expect(html).toContain(author);expect(html).toContain(text);expect(html).toContain('dir="auto"');
    expect(html).not.toContain('<button');
  });
  it('keeps a navigable citation only when there is a valid destination',()=>{
    const render=(to?:{chatId:string;messageId:string})=>renderToStaticMarkup(h(ReplyQuote,{text:'Citado',group:false,to,jump:()=>{}}));
    expect(render({chatId:'-42',messageId:'100'})).toContain('<button');
    expect(render({chatId:'0',messageId:'0'})).not.toContain('<button');
    expect(render()).not.toContain('reply-preview-author');
  });
  it('does not interpret quote text or author as HTML',()=>{
    const html=renderToStaticMarkup(h(ReplyQuote,{author:'<img src=x>',text:'<script>alert(1)</script>',group:true,jump:()=>{}}));
    expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');
  });
  it('bounds reply, composer and formatted quotations without clipping the entire bubble',()=>{
    const css=source('./message-quotes.css');
    expect(css).toContain('grid-template-columns:13px minmax(0,1fr)');
    expect(css).toContain('text-overflow:ellipsis');expect(css).toContain('overflow-wrap:anywhere');
    expect(css).toContain('.compose-reply strong');expect(css).toContain('.bubble .rich-quote');
    expect(css).not.toMatch(/\.bubble\s*\{[^}]*overflow:hidden/);
  });
});
