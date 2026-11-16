import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const sources=(dir:string):string[]=>readdirSync(new URL(dir,import.meta.url),{withFileTypes:true}).flatMap(entry=>{
  const path=`${dir}${entry.name}`;
  if(entry.isDirectory())return sources(`${path}/`);
  return /\.tsx?$/.test(entry.name)&&!/\.test\.tsx?$/.test(entry.name)?[path]:[];
});
const block=(source:string,start:string)=>{
  const open=source.indexOf(start);
  if(open<0)throw new Error(`No se encuentra ${start}`);
  const brace=source.indexOf('{',open);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&--depth===0)return source.slice(open,i+1);
  }
  throw new Error(`Llave sin cerrar tras ${start}`);
};
describe('interfaz Android comercial',()=>{
  it('empaqueta assets locales con CSP sin código remoto',()=>{const html=read('./index.html');expect(html).toContain("script-src 'self'");expect(html).toContain("frame-src 'none'");expect(html).not.toContain('cdn.');});
  it('mantiene los IDs como strings y no guarda mensajes en localStorage',()=>{const bridge=read('./src/bridge.ts');expect(bridge).not.toMatch(/localStorage|sessionStorage|apiHash|TELEGRAM_API/);expect(read('./src/contract.ts')).toContain('id: string');});
  it('no adjunta Telegram a WR IA ni habilita premium ficticio',()=>{const panels=read('./src/Panels.tsx');expect(panels).toContain("run('assistant.send',{text})");expect(panels).not.toMatch(/run\('assistant.send'.*(messages|state.chats)/);expect(panels).not.toContain('export function Plugins');const plugins=read('./src/BetaPanels.tsx');expect(plugins).toContain('export function Plugins');expect(plugins).toContain('No hay conectores premium operativos');});
  it('usa catálogo TDLib y un puente con lista cerrada',()=>{const catalog=read('../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeCatalog.java');expect(catalog).toContain('new TdApi.GetSavedAnimations()');expect(catalog).toContain('new TdApi.GetRecentStickers(false)');expect(catalog).toContain('new TdApi.GetInlineQueryResults()');expect(catalog).toContain('selection.chat=chat');});
  it('no permite un método de puente que la allowlist nativa desconozca, ni al revés',()=>{
    const policy=read('../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
    const allowed=new Set<string>();
    for(const line of policy.split(/\r?\n/)){if(!line.includes('METHODS')||line.includes('static void envelope'))continue;for(const match of line.matchAll(/"([^"]+)"/g))allowed.add(match[1]);}
    const bridge=read('./src/bridge.ts');
    expect(bridge).toContain('window.WRGramNative');
    const used=new Set<string>();
    for(const path of sources('./src/'))for(const match of read(path).matchAll(/run(?:<[^>]*>)?\(\s*['"]([a-zA-Z][\w.]*)['"]/g))used.add(match[1]);
    expect(used.size).toBeGreaterThan(100);
    const orphan=[...used].filter(method=>!allowed.has(method)).sort();
    expect(orphan,`sin registro en BridgePolicy: ${orphan.join(', ')}`).toEqual([]);
    const handlers=read('../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
    const dispatched=new Set([...handlers.matchAll(/case "([\w.]+)":/g)].map(match=>match[1]));
    const dead=[...allowed].filter(method=>!dispatched.has(method)).sort();
    expect(dead,`permitidos sin manejador en dispatch: ${dead.join(', ')}`).toEqual([]);
  });
  it('Android y Windows guardan las mismas claves de apariencia',()=>{
    const android=block(read('../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java'),'private void appearance(JSONObject p)');
    const windows=block(read('../desktop/src/WRGram.Desktop/TelegramService.cs'),'private object? Appearance(JsonElement args)');
    const androidKeys=new Set<string>();
    for(const match of android.matchAll(/p\.has\("([^"]+)"\)/g))androidKeys.add(match[1]);
    for(const list of android.matchAll(/new String\[\]\{([^}]*)\}/g))for(const key of list[1].matchAll(/"([^"]+)"/g))androidKeys.add(key[1]);
    const windowsKeys=new Set([...windows.matchAll(/args\.TryGetProperty\("([^"]+)",/g)].map(match=>match[1]));
    expect(androidKeys.size).toBeGreaterThan(10);
    const soloAndroid=[...androidKeys].filter(key=>!windowsKeys.has(key)).sort();
    expect(soloAndroid,`el puente C# descarta estas claves de apariencia: ${soloAndroid.join(', ')}`).toEqual([]);
    const soloWindows=[...windowsKeys].filter(key=>!androidKeys.has(key)).sort();
    expect(soloWindows,'chrome es el único tinte propio de la ventana de Windows').toEqual(['chrome']);
  });
});
