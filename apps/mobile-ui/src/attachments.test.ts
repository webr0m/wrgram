import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentPanel } from './AttachmentPanel';
import { ChatOptionSection } from './ChatOptions';
import { previewDeviceGallery } from './previewDeviceGallery';
import { EMPTY } from './contract';

vi.mock('./language',()=>({useLanguage:()=>({t:(text:string)=>text})}));
vi.mock('./bridge',()=>({snapshot:()=>({selfId:'1',active:'11'}),subscribe:vi.fn(),request:vi.fn()}));
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const native=(name:string)=>source(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const state={...EMPTY,selfId:'1',active:'11',canSend:true};
afterEach(()=>vi.unstubAllGlobals());

describe('panel visual de adjuntos',()=>{
  it('opens the gallery above the category banner, with camera and direct recents',()=>{
    const action=vi.fn(),deferred=vi.fn();
    function Deferred(){deferred();return h('button',null,'Enviar ahora');}
    const html=renderToStaticMarkup(h(AttachmentPanel,{desktop:false,camera:action,picker:action,prepared:action,close:action,children:[h(ChatOptionSection,{id:'files',title:'Fotos y archivos',description:'Archivos',icon:'•',children:h(Deferred)})]}));
    expect(html).toContain('Galería');expect(html).toContain('Recientes');expect(html).toContain('Ver todas');expect(html).toContain('Cámara');
    expect(html.indexOf('attachment-gallery-grid')).toBeLessThan(html.indexOf('attachment-banner'));
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Galería/);
    expect(html).not.toContain('Enviar ahora');expect(action).not.toHaveBeenCalled();expect(deferred).not.toHaveBeenCalled();
  });
  it('does not advertise a device camera on desktop',()=>{
    const action=vi.fn();const html=renderToStaticMarkup(h(AttachmentPanel,{desktop:true,camera:action,picker:action,prepared:action,close:action,children:null}));
    expect(html).not.toContain('Cámara');expect(html).toContain('Elegir fotos');
  });
  it('keeps permission requests explicit, Back local, and discarded late imports out of new chats',()=>{
    const panel=source('./AttachmentPanel.tsx');
    expect(panel).toContain('useDialogNavigation(selected!==\'gallery\'');expect(panel).toContain('load(true)');
    expect(panel).toContain('alive.current=false');expect(panel).toContain("request('attachment.discard'");expect(panel).toContain("snapshot().topic?.id||0");
    expect(panel).not.toContain("request('send.");expect(panel).toContain("'attachment.pick',{kind:'photo'}");
  });
});

describe('galería sintética y selección segura',()=>{
  function list(fixture='full',scope='sheet'){
    vi.stubGlobal('window',{location:{search:'?photoAccess='+fixture}});
    return previewDeviceGallery('attachment.recents',{scope},state,vi.fn()) as {batch:string;access:string;items:{id:string}[]};
  }
  it.each([['full',18],['limited',3],['denied',0],['empty',0]])('models %s photo access without reading real files',(access,count)=>{
    const result=list(String(access));expect(result.items).toHaveLength(Number(count));expect(result.access).toBe(access==='empty'?'full':access);
  });
  it('allows a separate permission action after denial',()=>{
    list('denied');const result=previewDeviceGallery('attachment.photos.permission',{scope:'sheet'},state,vi.fn()) as {access:string};expect(result.access).toBe('full');
  });
  it('only prepares an authorized photo; no selection sends it',()=>{
    const result=list(),pick=vi.fn(()=>({token:'selected'}));
    expect(previewDeviceGallery('attachment.photo',{scope:'sheet',batch:result.batch,id:result.items[0].id},state,pick)).toEqual({token:'selected'});
    expect(pick).toHaveBeenCalledExactlyOnceWith({name:'Foto reciente.jpg',size:256000});
    for(const changed of [{...state,selfId:'2'},{...state,active:'22'}])expect(()=>previewDeviceGallery('attachment.photo',{scope:'sheet',batch:result.batch,id:result.items[0].id},changed,pick)).toThrow('galería cambió');
  });
  it('invalidates old batches and closed sheets',()=>{
    const old=list(),fresh=list();const pick=vi.fn();
    expect(()=>previewDeviceGallery('attachment.photo',{scope:'sheet',batch:old.batch,id:old.items[0].id},state,pick)).toThrow();
    previewDeviceGallery('attachment.recents.close',{scope:'sheet'},state,pick);
    expect(()=>previewDeviceGallery('attachment.photo',{scope:'sheet',batch:fresh.batch,id:fresh.items[0].id},state,pick)).toThrow();expect(pick).not.toHaveBeenCalled();
  });
});

describe('galería y teclado Android',()=>{
  it('bounds local thumbnails and uses opaque account/chat-bound photo handles',()=>{
    const gallery=native('DeviceGallery');expect(gallery).toContain('QUERY_ARG_LIMIT,36');expect(gallery).toContain('scanned++<36');expect(gallery).toContain('UUID.randomUUID()');
    expect(gallery).toContain('owner!=user||chat!=target');expect(gallery).not.toContain('.put("uri"');expect(gallery).not.toContain('READ_MEDIA_VIDEO');expect(gallery).toContain('thumbnail.recycle()');
    expect(gallery).toContain('Build.VERSION.SDK_INT>=34');expect(gallery).toContain('READ_MEDIA_VISUAL_USER_SELECTED');
  });
  it('advertises rich content only for the message composer and keeps the original text input connection',()=>{
    const view=native('RichInputWebView');expect(view).toContain('super.onCreateInputConnection(info)');expect(view).toContain('connection==null||!composer');
    expect(view).toContain('EditorInfoCompat.setContentMimeTypes');expect(view).toContain('InputConnectionCompat.createWrapper');expect(view).toContain('restartInput(this)');
    expect(view).toContain('"image/gif","image/png","image/jpeg","image/webp"');
  });
  it('copies transient keyboard content on storage executor and releases the URI grant',()=>{
    const bridge=native('NativeBridge').split('boolean keyboardContent(')[1].split('private void deviceGallery(')[0];
    expect(bridge).toContain('"content".equals(uri.getScheme())');expect(bridge).toContain('content.requestPermission()');expect(bridge).toContain('content.releasePermission()');expect(bridge).toContain('storage().execute');
    expect(bridge).toContain('session.activeChat!=chat');expect(bridge).toContain('session.activeTopic!=topic');expect(bridge).toContain('session.selfId!=owner');expect(bridge).not.toContain('sendContent(');
  });
});
