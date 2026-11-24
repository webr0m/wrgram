import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const preview = text('./preview.ts');
const app = text('./App.tsx');

/** Recorta entre dos anclas fijas del propio fichero, para no leer media vista de diseño en cada prueba. */
function slice(from: string, to: string, source = preview): string {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`Falta la ancla ${from}`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`Falta el cierre ${to}`);
  return source.slice(start, end);
}

function literal(name: string): string {
  const match = new RegExp(`const ${name} = '(\\d+)'`).exec(preview);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El chat y el recuento con los que arranca la cabecera, leídos de la propia lista de chats. */
function chatRow(id: string): { title: string; preview: string; unread: number; type: string } {
  const rows = [...preview.matchAll(/\['(\d+)','([^']*)','([^']*)',(\d+),'(private|group|channel|bot|secret)'\]/g)];
  const row = rows.find(entry => entry[1] === id);
  if (!row) throw new Error(`El chat ${id} no está en la lista de arranque`);
  return { title: row[2], preview: row[3], unread: Number(row[4]), type: row[5] };
}

/** Las filas que ve la interfaz sin abrir nada: las cinco de la conversación y las de servicio. */
function bootRows(): { id: string; outgoing: boolean }[] {
  const talk = [...slice('  messages: [', '].map(([id,outgoing,text,time])').matchAll(/\['(\d+)',(true|false),/g)]
    .map(match => ({ id: match[1], outgoing: match[2] === 'true' }));
  const service = [...slice('const serviceMessages: Message[]=[', '\n];').matchAll(/id:'(\d+)'[^}]*?outgoing:(true|false)/g)]
    .map(match => ({ id: match[1], outgoing: match[2] === 'true' }));
  return [...talk, ...service];
}

describe('ronda AE · el arranque de diseño pinta el chat del que son sus filas', () => {
  it('la cabecera y las filas coinciden, que es lo que la guarda del puente exige', () => {
    const boot = literal('BOOT_CHAT');
    expect(preview).toContain('active: BOOT_CHAT, canSend: true');
    // Las tres fuentes de filas del arranque: la conversación, el muestrario de servicio y los envíos pendientes.
    expect(slice('const serviceBase=', '\n')).toContain(`chatId:'${boot}'`);
    expect(slice('const unsentBase = ', '\n')).toContain(`chatId: '${boot}'`);
    expect(preview).toContain(`:Message=>({id:String(id),chatId:'${boot}'`);
  });

  it('la rama de escritorio del menú exige la cuenta, conversación y tema del arranque', () => {
    // El menú pide las capacidades antes de pintar y solo sigue si la cuenta, el chat y el tema siguen siendo los
    // que tenía al abrirlo. Cambiar cualquiera de los tres lo convierte en una acción sobre una fila ajena.
    expect(app).toContain('if(!props||snapshot().selfId!==owner||snapshot().active!==message.chatId||(snapshot().topic?.id||0)!==topic)return;');
    expect(bootRows().length).toBeGreaterThan(8);
  });

  it('el chat de arranque puede escribir, según la misma regla que abre los chats', () => {
    const open = /canSend: id === '(\d+)' \|\| id === '(\d+)'/.exec(preview);
    if (!open) throw new Error('Falta la regla de escritura de `chat.open`');
    const writable = [open[1], open[2]];
    expect(writable).toContain(literal('BOOT_CHAT'));
    expect(preview).toContain('active: BOOT_CHAT, canSend: true');
  });

  it('la frontera de lectura es la fila recibida más nueva, así que el recuento no miente', () => {
    const boundary = Number(literal('BOOT_READ_INBOX'));
    const incoming = bootRows().filter(row => !row.outgoing).map(row => Number(row.id));
    expect(incoming).toContain(boundary);
    expect(Math.max(...incoming)).toBe(boundary);
    expect(incoming.filter(id => id > boundary)).toEqual([]);
    expect(chatRow(literal('BOOT_CHAT')).unread).toBe(0);
  });

  it('el arranque declara el mismo historial que entrega `chat.open`', () => {
    expect(preview).toContain(`history:{ loading:false,error:'',end:true,latest:true,anchor:'0' }`);
    expect(preview).toContain(`String(id)===BOOT_CHAT?{readInbox:BOOT_READ_INBOX}`);
  });

  it('el mensaje fijado se pregunta al historial del chat, no a una lista a mano', () => {
    // Desde la ronda AF el id del ancla es mutable —lo escribe el fijado, lo borra el desfijado—, pero sigue
    // resolviéndose contra el pool del chat abierto, que es lo que esta guarda venía exigiendo.
    expect(preview).toContain('const anchor = pinnedIdOf(state.active);');
    expect(preview).toContain('poolOf(state.active).find(message => message.id === anchor) ?? null');
    expect(preview).not.toContain("state.active === '14' ? fixture.messages[1]");
  });

  it('los chats que comparten frases las reetiquetan al abrirlas', () => {
    expect(preview).toContain("id==='11'||id==='14'||id==='24'?fixture.messages.map(message=>({...message,chatId:id}))");
  });

  it('el muestrario de servicio vive en el chat de arranque por declararlo así', () => {
    const comment = slice('// Las filas de servicio', 'const serviceBase=');
    expect(comment).toContain('muestrario de burbujas');
    expect(comment).toContain('descartaría como ajenas');
  });

  it('ninguna cifra suelta del viejo arranque sobrevive', () => {
    expect(preview).not.toContain(`active: '14', canSend: false`);
    expect(preview).not.toContain(`String(id)==='11'||String(id)==='14'?{readInbox:'103'}`);
    expect([...preview.matchAll(/, active: '\d+', canSend: (?:true|false)/g)]).toHaveLength(0);
  });
});

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function body(name: string, source: string): string {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

describe('ronda AE · la interfaz sigue sin pintarse sobre un chat equivocado', () => {
  it('el menú de mensaje consulta capacidades antes de pintar nada', () => {
    const menu = body('messageMenu', app);
    expect(menu).toContain("await run<Properties>('message.properties',{id:message.id})");
    expect(menu).toContain('{props.copy&&');
    expect(menu).toContain('forwardItem(message,props)');
    expect(menu).toContain('deleteItems(message,props)');
  });

  it('la ventana de reenvío no ofrece en escritorio lo que el puente no puede cumplir', () => {
    expect((app.match(/whenOnline=\{!desktop\}/g) || []).length).toBe(3);
    expect(app).toContain("whenOnline={active?.type==='private'&&!desktop}");
  });
});

describe('ronda AE · la copia reenviada aparece en el destino', () => {
  // El recorrido con ratón encontró aquí el segundo defecto del andamio: el espejo metía las filas nuevas
  // en `state.messages`, que es la ventana del chat que se está mirando, así que reenviar pintaba el mensaje
  // en el chat del que se copió. En Telegram el reenvío escribe en otra conversación.
  it('el reenvío no toca la ventana abierta', () => {
    const forward = body('desktopForward', preview);
    expect(forward).toContain('forwardedCopies.push(...clones)');
    expect(forward).not.toContain('acceptState');
  });

  it('el historial que crece es el del destino', () => {
    expect(preview).toContain('...forwardedCopies.filter(item=>item.chatId===id)');
    expect(preview).toContain('const base = poolOf(id);');
  });

  it('los identificadores nuevos salen del historial del destino, no del de la pantalla', () => {
    expect(body('desktopForward', preview)).toContain('Math.max(0, ...poolOf(target.id).map(message => Number(message.id) || 0)) + 1');
  });
});
