import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const allowed = java('BridgePolicy');
const session = java('TdSession');
const settings = ui('SettingsPage.tsx');
const collections = ui('Collections.tsx');
const contract = ui('contract.ts');
const styles = ui('collections.css');

describe('Ronda G en el puente', () => {
  it('los métodos nuevos están en la lista de permitidos del puente', () => {
    expect(allowed).toContain('"folders.join","chat.folderTags","chat.folderCount","saved.tags","saved.tag.label","saved.search","saved.topics.pin"');
    for (const method of ['chat.folderTags', 'chat.folderCount', 'saved.tags', 'saved.tag.label', 'saved.search', 'saved.topics.pin']) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "chat.folderTags":folderTags(p,a);break;');
    expect(bridge).toContain('case "chat.folderCount":folderCount(p,a);break;');
    expect(bridge).toContain('case "saved.tags":savedTags(p,a);break;');
    expect(bridge).toContain('case "saved.tag.label":savedTagLabel(p,a);break;');
    expect(bridge).toContain('case "saved.search":savedSearch(p,a);break;');
    expect(bridge).toContain('case "saved.topics.pin":savedTopicPin(p,a);break;');
  });

  it('folders.save persiste exclusiones y fijados explícitos', () => {
    expect(bridge).toContain('long[] excluded=optionalIds(p,"excluded",200);');
    expect(bridge).toContain('long[] pinned=optionalIds(p,"pinned",200);');
    expect(bridge).toContain('folder.excludedChatIds=excluded;');
    expect(bridge).toContain('folder.pinnedChatIds=pinned;');
    expect(bridge).toContain('folder.includedChatIds=included;');
  });

  it('las etiquetas de carpeta leen el estado de la sesión y cambian con ToggleChatFolderTags', () => {
    expect(bridge).toContain('if(!p.has("enabled")){a.ok(object("enabled",session.folderTagsEnabled()));return;}');
    expect(bridge).toContain('perform(new TdApi.ToggleChatFolderTags(enabled),a,ok->a.ok(object("enabled",enabled)));');
    expect(session).toContain('folderTagsEnabled = update.areTagsEnabled; emit("chats");');
    expect(session).toContain('boolean folderTagsEnabled() { return folderTagsEnabled; }');
    expect(session).toContain('savedTopicsEnd=false; folderTagsEnabled=false;');
  });

  it('el contador de carpeta usa GetChatFolderChatCount sobre la carpeta guardada', () => {
    expect(bridge).toContain('perform(new TdApi.GetChatFolder(folderId(p)),a,folder->perform(new TdApi.GetChatFolderChatCount(folder),a,count->a.ok(object("count",count.count))));');
  });

  it('las etiquetas de Guardados se leen y se renombran con validación', () => {
    expect(bridge).toContain('perform(new TdApi.GetSavedMessagesTags(BridgePolicy.id(p,"topic")),a,tags->{');
    expect(bridge).toContain('item.put("label",tag.label==null?"":tag.label).put("count",tag.count);');
    expect(bridge).toContain('perform(new TdApi.SetSavedMessagesTagLabel(savedTagType(p),BridgePolicy.text(p,"label",12)),a,ok->a.ok(true));');
    expect(bridge).toContain('if(tag==null)throw new IllegalArgumentException("Etiqueta no válida.");');
    expect(bridge).toContain('return new TdApi.ReactionTypeEmoji(BridgePolicy.text(tag,"emoji",32));');
    expect(bridge).toContain('return new TdApi.ReactionTypeCustomEmoji(BridgePolicy.id(tag,"customEmojiId"));');
  });

  it('la búsqueda por etiqueta usa SearchSavedMessages y pagina por cursor', () => {
    expect(bridge).toContain('perform(new TdApi.SearchSavedMessages(topic,tag,BridgePolicy.text(p,"query",128),cursor,0,31),a,result->{');
    expect(bridge).toContain('a.ok(collectionPage(items,result.nextFromMessageId));');
    expect(bridge).toContain('if(message==null||message.id==cursor)continue;');
  });

  it('el fijado de orígenes valida el tema y usa ToggleSavedMessagesTopicIsPinned', () => {
    expect(bridge).toContain('if(!session.hasSavedTopic(id))throw new IllegalArgumentException("Este origen ya no está disponible.");');
    expect(bridge).toContain('perform(new TdApi.ToggleSavedMessagesTopicIsPinned(id,p.optBoolean("pin")),a,ok->a.ok(true));');
  });
});

describe('Ronda G en la interfaz', () => {
  it('el contrato tipa las etiquetas de Guardados', () => {
    expect(contract).toContain('export interface SavedTag { kind:\'emoji\'|\'custom\'; emoji?:string; customEmojiId?:string; label:string; count:number }');
  });

  it('el editor de carpetas alterna incluir, excluir y fijar sobre el mismo listado', () => {
    expect(settings).toContain('included:string[];excluded:string[];pinned:string[]};');
    expect(settings).toContain("const FOLDER_LISTS:[FolderList,string][]=[['included','Incluir'],['excluded','Excluir'],['pinned','Fijar']];");
    expect(settings).toContain('aria-pressed={list===key}');
    expect(settings).toContain('checked={draft[list].includes(chat.id)}');
    expect(settings).toContain('Chats excluidos ($');
    expect(settings).toContain('Chats fijados ($');
  });

  it('el editor muestra el conteo real de la carpeta guardada', () => {
    expect(settings).toContain("return run<{count:number}>('chat.folderCount',{id:folder.id})");
    expect(settings).toContain('La versión guardada de esta carpeta muestra {count} chats hoy.');
  });

  it('las etiquetas de carpeta se consultan y se cambian desde Ajustes', () => {
    expect(settings).toContain("void run<{enabled:boolean}>('chat.folderTags').then(state=>state&&setTags(state.enabled))");
    expect(settings).toContain("void run<{enabled:boolean}>('chat.folderTags',{enabled:value}).then(state=>state&&setTags(state.enabled))");
    expect(settings).toContain('label="Etiquetas de carpetas"');
    expect(settings).toContain('requiere Telegram Premium');
  });

  it('el explorador de Guardados fija orígenes con confirmación de estado', () => {
    expect(collections).toContain("void request('saved.topics.pin', { id: item.id, pin: !item.pinned })");
    expect(collections).toContain('aria-label={item.pinned ? `Quitar fijado de ${item.title}` : `Fijar ${item.title}`}');
    expect(collections).toContain("usePages<Message>('saved.history', { id: source.id })");
  });

  it('las etiquetas de Guardados filtran con saved.search y permiten renombrar', () => {
    expect(collections).toContain("request<SavedTag[]>('saved.tags', { topic: source.id })");
    expect(collections).toContain("'saved.search', { topic: source.id, tag: { kind: tag.kind, emoji: tag.emoji, customEmojiId: tag.customEmojiId } }");
    expect(collections).toContain("void request('saved.tag.label', { tag: { kind: selected.kind, emoji: selected.emoji, customEmojiId: selected.customEmojiId }, label: label.trim() })");
    expect(collections).toContain('maxLength={12}');
    expect(collections).toContain('función de Telegram Premium');
  });

  it('las filas de origen y las etiquetas tienen estilos propios', () => {
    expect(styles).toContain('.collection-row-open');
    expect(styles).toContain('.collection-row-pin[aria-pressed=true]');
    expect(styles).toContain('.saved-tag.selected');
    expect(styles).toContain('.saved-tag-rename');
  });
});
