import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPOSER_TYPES, MAX_ENTITIES, MAX_LENGTH } from './richDraft';

/**
 * La ronda BT convierte el compositor de mensajes en un WYSIWYG cuyo estado **es** el cable: una cadena y sus
 * entidades de Telegram, con offsets en unidades UTF-16. No hay HTML intermedio, no hay `execCommand`, y el DOM
 * se pinta desde el modelo y se lee solo como texto.
 *
 * Alcance decidido y cerrado aquí: **solo el compositor de mensajes**. Editar el texto de un mensaje, editar un
 * pie de foto, la multimedia de pago y publicar con un bot siguen aceptando markdown escrito a mano, porque en
 * esas ventanas lo que se teclea no es el mensaje sino el borrador de un mensaje ya enviado; y ahí el analizador
 * (`parseFormatting`) no compite con ningún caret que conservar.
 *
 * Lo que vigila esta prueba, en el orden en que se puede romper: que el modelo sea puro y tenga los topes de
 * Telegram; que el pegamento DOM no lea HTML ni compare longitudes a secas, y que el caret sobreviva a pegar, a
 * un salto de línea y a un IME; que App.tsx llame al modelo en los seis sitios que tocan el borrador y no deje
 * ningún acceso al `textarea` viejo; que la barra no mienta sobre lo que está aplicado; que cada tipo que el
 * compositor puede escribir tenga brazo en las dos orillas; y que el CSS del campo rico herede las reglas del
 * campo que sustituyó.
 *
 * Lo que esta prueba **no** afirma es el comportamiento en el teléfono: Vitest corre en `node`, sin
 * DOM, así que el pegamento queda pinned por aguja de fuente y nada más, y lo único que lo valida es una pasada
 * por `emulator-5554` con cuenta real. La simetría entre Windows y Android ya no es un hueco: la ronda CE escribió
 * el brazo del emoji personalizado en el despacho y aquí se mide el brazo, no la ausencia.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const JAVA = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';

const model = text('./richDraft.ts');
const glue = text('./RichComposer.tsx');
const app = text('./App.tsx');
const bridge = text(`${JAVA}NativeBridge.java`);
const snapshot = text(`${JAVA}NativeSnapshot.java`);
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const styles = ['./style.css', './visual-polish.css', './audit-fixes.css'].map(path => text(path)).join('\n');

/** Un bloque `<div …>…</div>`: ni la barra ni el compositor llevan otro `div` dentro, así que el primero cierra. */
function block(from: string, marker: string): string {
  const start = from.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const end = from.indexOf('</div>', start);
  expect(end, `${marker} cierra`).toBeGreaterThan(start);
  return from.slice(start, end + 6);
}

/** Un trozo desde un marcador, para pinar una llamada sin leer el fichero entero. */
function region(from: string, marker: string, length: number): string {
  const start = from.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  return from.slice(start, start + length);
}

const composer = block(app, '<div className="composer">');
const toolbar = block(app, '<div className="format-toolbar"');

describe('ronda BT · el modelo', () => {
  it('es texto y entidades, con los topes de Telegram escritos una sola vez', () => {
    expect(MAX_LENGTH).toBe(4096);
    expect(MAX_ENTITIES).toBe(100);
    expect(model).toContain('export const MAX_ENTITIES=100;');
    expect(model).toContain('export const MAX_LENGTH=4096;');
    expect(model).toContain('export interface Draft { text:string; entities:TextEntity[]; caret:number }');
  });

  it('no importa React ni conoce el DOM: el HTML no es estado en ninguna capa', () => {
    expect(model).toContain("import type { TextEntity, TextEntityType } from './contract';");
    for (const dead of ['from \'react\'', 'document.', 'window', 'HTMLElement', 'execCommand', 'contentEditable', 'innerHTML']) {
      expect(model, dead).not.toContain(dead);
    }
  });

  it('mide en unidades UTF-16, igual que Telegram y que un Range del DOM', () => {
    expect(model).toContain('item.offset+item.length<=text.length');
    expect(glue).toContain('if(anchor.nodeType===3)return span[0]+Math.min(Math.max(position,0),span[1]-span[0]);');
    expect(glue).toContain('parts.push(`t${leaf.data.length}:${marksOf(root,leaf)}`)');
  });

  it('el conjunto que el compositor escribe está cerrado y en el orden de anidamiento', () => {
    expect([...COMPOSER_TYPES].join(',')).toBe('bold,italic,underline,strikethrough,spoiler,code,pre,blockquote,link,customEmoji,botCommand');
    expect(model).toContain("const LINES=new Set<TextEntityType>(['blockquote','pre'])");
    expect(model).toContain('const SAFE_URL=/^(https?:\\/\\/|tg:\\/\\/)/i;');
  });
});

describe('ronda BT · el pegamento DOM', () => {
  it('no usa execCommand y no lee nunca HTML', () => {
    for (const dead of ['document.execCommand', '.execCommand(', 'innerHTML', 'outerHTML', 'createContextualFragment', 'innerText']) {
      expect(glue, dead).not.toContain(dead);
    }
    expect(glue).toContain('contentEditable');
    expect(glue).toContain('suppressContentEditableWarning');
    expect(glue).toContain('className="rich-field"');
    expect(glue).toContain('aria-multiline="true"');
  });

  it('compara texto y forma, así que un pegado del mismo largo no deja el campo viejo', () => {
    expect(glue).toContain('function domState(root:HTMLElement):{text:string;shape:string}');
    expect(glue).toContain('if(root.childNodes.length&&painted.text===props.text&&painted.shape===modelSignature(props.text,props.entities))return;');
    expect(glue).toContain('if(line)parts.push(`t${line.length}:${marks}`)');
    // Las dos firmas se construyen con la misma cadena: si una cambia de formato, la otra tiene que cambiarla.
    expect(glue.slice(glue.indexOf('function domState'), glue.indexOf('function wrap'))).toContain("parts.push('b')");
    expect(glue.slice(glue.indexOf('function modelSignature'), glue.indexOf('function wrap'))).toContain("parts.push('b')");
  });

  it('el caret que el navegador dejó es el que se restaura, sin fotograma intermedio', () => {
    expect(glue).toContain('pending.current=caretAt;');
    expect(glue).toContain('const wanted=pending.current;');
    expect(glue).toContain('const before=wanted===null?selection():{start:wanted,end:wanted};');
    expect(glue).not.toContain('requestAnimationFrame');
  });

  it('el caret se lee por el lado del foco, no por el ancla', () => {
    expect(glue).toContain('function caretOffset(root:HTMLElement){');
    expect(glue).toContain('return offsetOf(root,active?.focusNode??null,active?.focusOffset??0);');
    expect(glue).toContain('const read=layout(root).text;\n      if(read!==props.text)submit(read,caretOffset(root));');
  });

  it('el IME no se interrumpe ni se duplica', () => {
    expect(glue).toContain('onCompositionStart={()=>{composing.current=true;}}');
    expect(glue).toContain('if(composing.current)return;');
    expect(glue).toContain("if(event.key!=='Enter'||event.nativeEvent.isComposing)return;");
    expect(glue).toContain("submit(layout(root).text,caretOffset(root));");
  });

  it('pegar entra como texto plano y con su caret calculado', () => {
    expect(glue).toContain("const value=event.clipboardData.getData('text/plain');");
    expect(glue).toContain('submit(props.text.slice(0,start)+value+props.text.slice(end),start+value.length);');
  });

  it('Enter obedece el ajuste de la persona y el salto de línea entra por el modelo', () => {
    expect(glue).toContain("if(!event.shiftKey&&(props.enterSends||event.ctrlKey||event.metaKey)){event.preventDefault();props.onSend();return;}");
    expect(glue).toContain("submit(props.text.slice(0,start)+'\\n'+props.text.slice(end),start+1);");
  });

  it('la escucha del caret no se rehace en cada escritura y lee siempre el último estado', () => {
    expect(glue).toContain("document.addEventListener('selectionchange',onMove);");
    expect(glue).toContain('return()=>{document.removeEventListener(\'selectionchange\',onMove);');
    expect(glue).toContain('latest.current.onSelection(activeMarks(latest.current.entities,start,end));');
    expect(glue).toContain('},[]);');
    expect(glue).toContain('const latest=useRef(props);\n  latest.current=props;');
  });

  it('el salto de línea se pinta con <br> y el campo vacío conserva un relleno que el lector ignora', () => {
    expect(glue).toContain("if(index>0)fragment.appendChild(document.createElement('br'));");
    expect(glue).toContain("if(!text||text.endsWith('\\n')) {");
    expect(glue).toContain("br.dataset.fill='1';");
    expect(glue).toContain('if(filler(node))return;');
    expect(glue).toContain("span.className=`text-${type}`;");
  });
});

describe('ronda BT · App.tsx, seis sitios que tocan el borrador', () => {
  it('el compositor es el editor rico y el textarea desapareció de esa fila', () => {
    expect(app).toContain("import { RichComposer, type RichEditor } from './RichComposer';");
    expect(app).toContain('const field=useRef<RichEditor>(null);');
    expect(composer).toContain('<RichComposer ref={field} label={t(\'Escribir mensaje\')}');
    expect(composer).not.toContain('<textarea');
    expect(composer).toContain('text={draft} entities={draftEntities} enterSends={state.appearance.enter}');
    expect(composer).toContain('onEdit={typeDraft} onSend={()=>void send()} onSelection={setFormatMarks}');
  });

  it('no queda ningún acceso al textarea viejo ni al modelo de emoji que sustituyó', () => {
    for (const dead of ['selectionStart', 'selectionEnd', 'setSelectionRange', 'wrapFormat', 'editDraftEmojis', 'replaceDraftEmojis',
      'emojiDraftKey', 'draftEmojis', 'remoteEmojiKey', "'./draftEmoji'", 'El formato aplicado no deja texto para enviar.']) {
      expect(app, dead).not.toContain(dead);
    }
    expect(app).not.toContain('./draftEmoji');
    expect(text('./contract.ts')).toContain('draftEntities?:TextEntity[]');
  });

  it('el tecleo pasa por el markdown escrito y por el reanclaje, en ese orden', () => {
    expect(app).toContain('const typed=matchTypedMarkdown(value,editDraft(draft,value,draftEntities,caret),caret);');
    expect(app).toContain('if(!typed){changeDraft(value,caret);return;}');
    expect(app).toContain('function changeDraft(value:string,caret?:number,entities=editDraft(draft,value,draftEntities,caret)){');
    expect(app).toContain('field.current?.select(start,end);');
  });

  it('las marcas y el enlace se aplican sobre el modelo, con el rango normalizado', () => {
    expect(app).toContain('const entities=toggleMark(draft,draftEntities,type,start,end);');
    expect(app).toContain('applyDraft(draft,entities,Math.min(start,end),Math.max(start,end));');
    expect(app).toContain('const entities=setLink(value,draftEntities,start,start+label.length,url);');
    expect(app).toContain('applyDraft(draft,removeLink(draftEntities,start,end),start,end);');
    expect(app).toContain('const entities=insertAt(draftEntities,start,end,emoji.length,customId);');
  });

  it('los cien elementos se miden en el modelo: al marcar, al enlazar, al insertar y al enviar', () => {
    expect(app).toContain("if(draftEntities.length>MAX_ENTITIES){setToast('Telegram admite hasta 100 elementos de formato por mensaje.');return;}");
    expect([...app.matchAll(/entities\.length>MAX_ENTITIES/g)]).toHaveLength(3);
    expect([...app.matchAll(/draftEntities\.length>MAX_ENTITIES/g)]).toHaveLength(1);
    expect([...app.matchAll(/Telegram admite hasta 100 elementos de formato por mensaje\./g)]).toHaveLength(4);
    expect(app).toContain("if(next.length>MAX_LENGTH){setToast('Alcanzaste el límite del mensaje.');return;}");
  });

  it('el envío manda el texto y las entidades tales como están', () => {
    const payload = region(app, "'send.text',{...draftScope", 90);
    expect(payload).toContain('text:draft,entities:draftEntities,reply:replyId||\'0\'');
    expect(payload).not.toContain('formatted');
  });

  it('la barra no miente: ocho botones, cada uno con su marca pulsada', () => {
    expect([...toolbar.matchAll(/onMouseDown=\{event=>event\.preventDefault\(\)\}/g)]).toHaveLength(8);
    for (const type of ['bold', 'italic', 'underline', 'strikethrough', 'code', 'blockquote', 'spoiler']) {
      expect(toolbar, type).toContain(`aria-pressed={formatMarks.has('${type}')}`);
      expect(toolbar, type).toContain(`onClick={()=>toggleFormat('${type}')}`);
    }
    expect(toolbar).toContain("aria-pressed={formatMarks.has('link')}");
    expect(toolbar).toContain('onClick={pickLink}');
    expect(toolbar).not.toContain('Se aplica al enviar');
    expect(app).toContain('onSelection={setFormatMarks}');
    expect(app).toContain('const [formatMarks,setFormatMarks]=useState<Set<TextEntityType>>(new Set());');
    // El botón no puede robar la selección: sin esto, marcar no sabría qué rango es.
    expect(toolbar).toContain('<strong>B</strong>');
    expect(toolbar).toContain('<Quote size={16}/>');
    expect(toolbar).toContain('<Underline size={16}/>');
  });

  it('el enlace se valida con la misma guarda que el analizador de markdown', () => {
    expect(app).toContain("test(url)){setToast('Usa un enlace https://, http:// o tg://.');return;}");
    expect(app).toContain('maximum={2048} action="Insertar enlace"');
    expect(app).toContain("const label=draft.slice(start,end)||'texto';");
  });

  it('la comparación del borrador solo mira lo que el compositor sabe escribir', () => {
    expect(app).toContain('entities.filter(entity=>COMPOSER_TYPES.has(entity.type))');
    expect(app).toContain("${entity.type}:${entity.offset}:${entity.length}:${entity.url??''}:${entity.customEmojiId??''}");
    expect(app).toContain('const remoteFormatKey=draftFormatKey(remoteEntities);');
    expect(app).toContain('format:draftFormatKey(draftFormats.current.get(draftKey)??[])');
  });

  it('la chapa de Premium sigue mostrando solo emojis personalizados', () => {
    expect(app).toContain("{draftEntities.some(entity=>entity.type==='customEmoji')&&<div className=\"draft-emoji-preview\"");
    expect(app).toContain("{draftEntities.filter(entity=>entity.type==='customEmoji').map(");
  });
});

describe('ronda BT · el markdown donde no hay editor', () => {
  it('son exactamente cinco sitios y ninguno es el compositor', () => {
    const calls = [...app.matchAll(/=parseFormatting\((\w+)\)/g)].map(match => match[1]);
    expect(calls).toEqual(['caption', 'caption', 'text', 'caption', 'body']);
    expect(app).not.toContain('=parseFormatting(draft');
    expect(app).toContain("import { FormattedText, parseFormatting } from './formatting';");
  });

  it('editar texto y editar pie de foto siguen enviando lo que devuelve el analizador', () => {
    expect(app).toContain("const value=parseFormatting(text);void run<boolean>('message.edit',{id:message.id,text:value.text,entities:value.entities})");
    expect(app).toContain('parseFormatting(caption)');
  });
});

describe('ronda BT · las dos orillas', () => {
  it('Android tiene brazo para cada tipo que el compositor puede escribir', () => {
    const cases = [
      ['bold', 'TextEntityTypeBold'], ['italic', 'TextEntityTypeItalic'], ['underline', 'TextEntityTypeUnderline'],
      ['strikethrough', 'TextEntityTypeStrikethrough'], ['spoiler', 'TextEntityTypeSpoiler'], ['code', 'TextEntityTypeCode'],
      ['pre', 'TextEntityTypePre'], ['blockquote', 'TextEntityTypeBlockQuote'],
    ];
    for (const [type, kind] of cases) expect(bridge, type).toContain(`case "${type}":kind=new TdApi.${kind}();break;`);
    expect(bridge).toContain('case "link":{String url=BridgePolicy.text(value,"url",2048);');
    expect(bridge).toContain('case "customEmoji":{');
    // La guarda de rango es la misma para los tipos nuevos que para los viejos.
    expect(bridge).toContain('if(offset<0||offset>length||size<1||size>length-offset)throw new IllegalArgumentException();');
  });

  it('Windows tiene brazo para los mismos tipos, ya incluido el emoji personalizado', () => {
    const arms = [
      ['bold', 'MessageEntityBold'], ['italic', 'MessageEntityItalic'], ['underline', 'MessageEntityUnderline'],
      ['strikethrough', 'MessageEntityStrike'], ['spoiler', 'MessageEntitySpoiler'], ['code', 'MessageEntityCode'],
      ['pre', 'MessageEntityPre'], ['blockquote', 'MessageEntityBlockquote'],
    ];
    for (const [type, kind] of arms) expect(service, type).toContain(`"${type}" => new ${kind}(),`);
    // La ronda CE sacó el enlace y la cifra del emoji a dos ayudantes, porque la negativa necesita ir antes del brazo.
    expect(service).toContain('"link" => new MessageEntityTextUrl { url = LinkUrlOf(item) },');
    expect(service).toContain('"customEmoji" => new MessageEntityCustomEmoji { document_id = FaceIdOf(item) },');
    // La BY trajo al host las claves del puente `customEmoji.get` y `customEmoji.search`, que son ramas de lectura de
    // documentos y no tienen nada que ver con este brazo; el de la entidad es el que acaba en `MessageEntityCustomEmoji`.
    expect([...service.matchAll(/"customEmoji" => new MessageEntityCustomEmoji/g)]).toHaveLength(1);
    expect(service).toContain('MessageEntityCustomEmoji => "customEmoji",');
  });

  it('la vuelta también trae subrayado y cita, en el nombre que usa el modelo', () => {
    expect(snapshot).toContain('kind instanceof TdApi.TextEntityTypeUnderline?"underline"');
    expect(snapshot).toContain('TextEntityTypeBlockQuote?"blockquote"');
    expect(service).toContain('MessageEntityUnderline => "underline",');
    expect(service).toContain('MessageEntityBlockquote => "blockquote",');
  });

  it('la ruta de bot ya conocía los dos tipos, así que publicar con bot no cambia', () => {
    expect(bridge).toContain('case "underline":return "underline";');
    expect(bridge).toContain('case "blockquote":return "blockquote";');
  });

  it('la ronda no abre ningún método nuevo del puente', () => {
    for (const key of ['send.text', 'draft.set', 'message.edit', 'message.edit.caption', 'bot.publish', 'bot.edit']) {
      expect(text(`${JAVA}BridgePolicy.java`), key).toContain(`"${key}"`);
    }
    expect(text('./preview.ts')).toContain("if (method === 'draft.set') {");
  });
});

describe('ronda BT · el CSS del campo rico', () => {
  it('cada regla del campo que sustituyó se extiende al nuevo', () => {
    // Sin `::placeholder`, que el div no puede tener; ahí manda `data-placeholder`.
    expect([...styles.matchAll(/\.composer textarea(?![,:])/g)]).toHaveLength(0);
    expect([...styles.matchAll(/\.composer textarea,/g)]).toHaveLength(6);
    // Ninguna pseudoclase quedó colgada del lado nuevo, que es el error de un reemplazo mecánico.
    expect(styles).not.toMatch(/\.rich-field:/);
    expect(styles).not.toMatch(/\.rich-field::/);
  });

  it('el div crece hasta el tope del campo viejo y después se desplaza', () => {
    expect(styles).toContain('.composer .rich-field{position:relative;outline:0;cursor:text;white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto}');
    expect(styles).toContain('.composer textarea,.composer .rich-field{border:0;outline:0;background:none;line-height:1.5;font-size:var(--font-size,15px);flex:1;align-self:center;min-height:28px;max-height:140px;');
  });

  it('el marcador de posición se pinta con data-empty y el spoiler se ve como spoiler dentro del campo', () => {
    expect(styles).toContain('.composer .rich-field[data-empty="true"]:before{content:attr(data-placeholder)');
    expect(styles).toContain('.composer .rich-field .text-spoiler{filter:none;border-bottom:1px dashed var(--muted)}');
    expect(glue).toContain("data-empty={props.text.length?'false':'true'}");
    expect(glue).toContain('data-placeholder={props.placeholder}');
  });
});
