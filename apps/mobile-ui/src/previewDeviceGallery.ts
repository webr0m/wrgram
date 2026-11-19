import type { State } from './contract';
let sequence=0;
const galleries=new Map<string,{owner:string;chat:string;batch:string;ids:string[]}>();
/** Synthetic photos only. This module is excluded with the rest of the design transport in production. */
export function previewDeviceGallery(method:string,params:Record<string,unknown>,state:State,pick:(params:Record<string,unknown>)=>unknown){
  if(method==='composer.focus')return true;
  const scope=String(params.scope??'');
  if(method==='attachment.recents.close'){galleries.delete(scope);return true;}
  if(method==='attachment.photo'){
    const gallery=galleries.get(scope);
    if(!gallery||gallery.owner!==state.selfId||gallery.chat!==state.active||gallery.batch!==params.batch||!gallery.ids.includes(String(params.id)))throw new Error('La galería cambió. Vuelve a abrirla.');
    return pick({name:'Foto reciente.jpg',size:256000});
  }
  const fixture=new URLSearchParams(window.location.search).get('photoAccess')??'full';
  if(fixture==='error')throw new Error('No se pudieron leer las fotos. Usa el selector del sistema.');
  const access=fixture==='denied'&&method!=='attachment.photos.permission'?'denied':fixture==='limited'?'limited':'full';
  const batch='preview-photos-'+(++sequence);
  const items=Array.from({length:access==='denied'||fixture==='empty'?0:access==='limited'?3:18},(_,index)=>({id:batch+'-'+index,name:`Foto reciente ${index+1}.jpg`,thumbnail:['/bots/snake.jpg','/bots/compressor.jpg','/bots/downloads.jpg'][index%3]}));
  galleries.set(scope,{owner:state.selfId,chat:state.active,batch,ids:items.map(item=>item.id)});
  return {batch,access,items};
}
