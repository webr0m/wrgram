import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const policy = java('DownloadsPolicy');
const session = java('TdSession');
const allowed = java('BridgePolicy');
const panel = ui('DownloadsPanels.tsx');
const settings = ui('SettingsPage.tsx');

const METHODS = ['downloads.queue', 'downloads.item.pause', 'downloads.item.cancel', 'downloads.item.remove',
  'downloads.item.add', 'downloads.presets', 'downloads.rules', 'downloads.rules.set'];

describe('cola de descargas por archivo', () => {
  it('los ocho métodos de descargas están en la lista de permitidos del puente', () => {
    for (const method of METHODS) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "downloads.queue":downloadsQueue(p,a);break;');
    expect(bridge).toContain('case "downloads.item.pause":requireAccount();downloadsItem(p,a);break;');
    expect(bridge).toContain('case "downloads.item.cancel":requireAccount();perform(new TdApi.CancelDownloadFile((int)BridgePolicy.id(p,"fileId"),false),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "downloads.item.remove":requireAccount();perform(new TdApi.RemoveFileFromDownloads((int)BridgePolicy.id(p,"fileId"),false),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "downloads.item.add":downloadsItemAdd(p,a);break;');
    expect(bridge).toContain('case "downloads.presets":requireAccount();perform(new TdApi.GetAutoDownloadSettingsPresets(),a,value->a.ok(DownloadsPolicy.presets(value)));break;');
    expect(bridge).toContain('case "downloads.rules":requireAccount();a.ok(object("networks",DownloadsPolicy.storedRules(downloadRules())));break;');
    expect(bridge).toContain('case "downloads.rules.set":downloadsRuleSet(p,a);break;');
  });

  it('la cola sale de SearchFileDownloads con los tres alcances y progreso real por archivo', () => {
    expect(bridge).toContain('new TdApi.SearchFileDownloads()');
    expect(bridge).toContain('search.onlyActive=DownloadsPolicy.onlyActive(p);');
    expect(bridge).toContain('search.onlyCompleted=DownloadsPolicy.onlyCompleted(p);');
    expect(bridge).toContain('search.limit=DownloadsPolicy.MAX_LIMIT;');
    expect(bridge).toContain('session.cachedFile(fileId)');
    expect(policy).toContain('boolean active=file!=null&&file.local!=null&&file.local.isDownloadingActive&&!download.isPaused;');
    expect(policy).toContain('int progress=size>0?(int)Math.min(100L,Math.round(100.0*downloaded/size))');
  });

  it('pausar, reanudar, cancelar, quitar y reintentar llaman a su función de Telegram', () => {
    expect(bridge).toContain('new TdApi.ToggleDownloadIsPaused(fileId,paused),a,value->a.ok(true)');
    expect(bridge).toContain('new TdApi.CancelDownloadFile');
    expect(bridge).toContain('new TdApi.RemoveFileFromDownloads');
    expect(bridge).toContain('new TdApi.AddFileToDownloads(fileId,chatId,messageId,0)');
    expect(bridge).toContain('if(chatId==0||messageId==0){a.fail("No se pudo volver a poner el archivo en cola.");return;}');
  });

  it('las reglas por red se fijan con SetAutoDownloadSettings sobre el nivel elegido de Telegram', () => {
    expect(bridge).toContain('new TdApi.SetAutoDownloadSettings(value,DownloadsPolicy.networkType(network))');
    expect(policy).toContain('value.isAutoDownloadEnabled=!level.equals("off");');
    expect(policy).toContain('value.maxVideoFileSize=level.equals("off")?0:source.maxVideoFileSize;');
    expect(policy).toContain('case "wifi":return new TdApi.NetworkTypeWiFi();');
    expect(bridge).toContain('prefs.edit().putString("downloads.rules."+session.selfId,raw.toString()).apply()');
  });

  it('la sesión reacciona a las actualizaciones de descargas por archivo', () => {
    expect(session).toContain('object instanceof TdApi.UpdateFileAddedToDownloads');
    expect(session).toContain('object instanceof TdApi.UpdateFileDownload');
    expect(session).toContain('object instanceof TdApi.UpdateFileRemovedFromDownloads');
    expect(session).toContain('TdApi.File cachedFile(int fileId){return files.get(fileId);}');
  });
});

describe('panel de descargas en Ajustes', () => {
  it('el panel consulta la cola con búsqueda, alcances y paginación', () => {
    expect(panel).toContain("run<DownloadQueue>('downloads.queue',{query:search,active:scope==='active',completed:scope==='completed'");
    expect(panel).toContain("'downloads.item.pause',{fileId:item.fileId,value:item.state!=='paused'}");
    expect(panel).toContain("'downloads.item.cancel',{fileId:item.fileId}");
    expect(panel).toContain("'downloads.item.remove',{fileId:item.fileId}");
    expect(panel).toContain("'downloads.item.add',{fileId:item.fileId,chatId:item.chatId,messageId:item.messageId}");
  });

  it('el panel solo sondea mientras hay una descarga activa y para al desmontar', () => {
    expect(panel).toContain("const watching=ready&&!paged&&!error&&items.some(item=>item.state==='downloading');");
    expect(panel).toContain('load(true,tab,appliedQuery,true)');
    expect(panel).toContain('window.setInterval');
    expect(panel).toContain('window.clearInterval(timer)');
  });

  it('Ajustes monta la cola y las reglas dentro de la sección de descargas', () => {
    expect(settings).toContain("import { DownloadRules, DownloadsQueue } from './DownloadsPanels';");
    expect(settings).toContain('<DownloadsQueue run={run} ready={!!native&&state.ready}/>');
    expect(settings).toContain('<DownloadRules run={run} ready={!!native&&state.ready}/>');
  });

  it('la UI declara que Telegram no permite leer las reglas ya fijadas', () => {
    expect(panel).toContain('Telegram no deja leer estas reglas una vez fijadas');
    expect(panel).toContain('Sin establecer en esta app');
  });

  it('el panel no inventa estados ni acciones que el puente no expone', () => {
    expect(panel).not.toMatch(/downloads\.(delete|retry|clear|config)\b/);
    expect(panel).toContain("STATE_LABEL:Record<DownloadEntry['state'],string>={downloading:'Descargando',paused:'En pausa',completed:'Completado',stopped:'Detenido'}");
  });
});
