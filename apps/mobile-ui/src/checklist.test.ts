import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const policy = java('ChecklistPolicy');
const session = java('TdSession');
const snapshot = java('NativeSnapshot');
const allowed = java('BridgePolicy');
const panels = ui('BatchPanels.tsx');
const content = ui('MessageContent.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const styles = ui('batch.css');

const METHODS = ['checklist.send', 'checklist.add', 'checklist.toggle', 'checklist.edit'];
const KNOWN = [...METHODS, 'scheduled.list', 'scheduled.sendNow', 'scheduled.reschedule', 'scheduled.delete'];

describe('Listas de tareas en el puente', () => {
  it('los cuatro métodos de listas están en la lista de permitidos del puente', () => {
    expect(allowed).toContain('"checklist.send","checklist.add","checklist.toggle","checklist.edit"');
    for (const method of METHODS) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "checklist.send":checklistSend(p,a);break;');
    expect(bridge).toContain('case "checklist.add":checklistAdd(p,a);break;');
    expect(bridge).toContain('case "checklist.toggle":checklistToggle(p,a);break;');
    expect(bridge).toContain('case "checklist.edit":checklistEdit(p,a);break;');
  });

  it('las funciones de Telegram son las reales del binding', () => {
    expect(bridge).toContain('new TdApi.InputMessageChecklist()');
    expect(bridge).toContain('session.sendContent(content,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),a::ok)');
    expect(bridge).toContain('new TdApi.AddChecklistTasks(message.chatId,message.id,added)');
    expect(bridge).toContain('new TdApi.EditMessageChecklist(message.chatId,message.id,null,input)');
    expect(bridge).toContain('new TdApi.MarkChecklistTasksAsDone(message.chatId,message.id,done,notDone)');
    expect(bridge).toContain('TdApi.InputChecklistTask[] added=ChecklistPolicy.tasks(p.optJSONArray("tasks"),max+1);');
    expect(bridge).toContain('TdApi.InputChecklist input=ChecklistPolicy.input(p,max+1);');
    expect(bridge).toContain('int[] done=ChecklistPolicy.taskIds(p,"done"),notDone=ChecklistPolicy.taskIds(p,"notDone");');
    expect(bridge).toContain('if(!(message.content instanceof TdApi.MessageChecklist)||((TdApi.MessageChecklist)message.content).list==null)');
  });

  it('la política valida título, texto de tareas, límites e ids', () => {
    expect(policy).toContain('public static final int MAX_TITLE = 2000;');
    expect(policy).toContain('public static final int MAX_TASK_TEXT = 2000;');
    expect(policy).toContain('public static final int MAX_TASKS = 100;');
    expect(policy).toContain('if (title.isEmpty()) throw new IllegalArgumentException("Escribe un título para la lista.");');
    expect(policy).toContain('raw.replace(\'\\n\', \' \').trim()');
    expect(policy).toContain('if (text.isEmpty()) throw new IllegalArgumentException("Cada tarea necesita texto.");');
    expect(policy).toContain('if (count < 1 || count > MAX_TASKS) throw new IllegalArgumentException("Una lista lleva entre 1 y " + MAX_TASKS + " tareas.");');
    expect(policy).toContain('while (!seen.add(id)) id = next++;');
    expect(policy).toContain('if (id <= 0 || !seen.add(id)) throw new IllegalArgumentException("Tarea no válida.");');
    expect(policy).toContain('value.othersCanMarkTasksAsDone = params.optBoolean("othersCanDone");');
  });

  it('el menú de propiedades distingue editar texto de editar la lista', () => {
    expect(bridge).toContain('"edit",props.canBeEdited&&message.content instanceof TdApi.MessageText');
    expect(bridge).toContain('"editChecklist",props.canBeEdited&&message.content instanceof TdApi.MessageChecklist,');
  });
});

describe('Envío al conectarse en el puente', () => {
  it('sendOptions traduce la cadena "online" al estado real de Telegram', () => {
    expect(bridge).toContain('String raw=p.optString("schedule","");');
    expect(bridge).toContain('long schedule=raw.equals("online")?0:p.optLong("schedule",0);');
    expect(bridge).toContain('if(raw.equals("online"))options.schedulingState=new TdApi.MessageSchedulingStateSendWhenOnline();');
  });

  it('send.text pasa el centinela al método nativo con validación de ventana solo para fechas', () => {
    expect(bridge).toContain('long sendSchedule=p.optLong("schedule",0);if("online".equals(p.optString("schedule","")))sendSchedule=-1;');
    expect(session).toContain('if (scheduleAt > 0 && (scheduleAt < now + 5 || scheduleAt > now + 367L * 86400L))');
    expect(session.match(/new TdApi\.MessageSchedulingStateSendWhenOnline\(\)/g)?.length).toBe(2);
    expect(session).toContain('if (scheduleAt < 0) send.options.schedulingState = new TdApi.MessageSchedulingStateSendWhenOnline();');
  });

  it('reprogramar admite "cuando se conecte" con la misma ventana de 367 días', () => {
    expect(bridge).toContain('online?new TdApi.MessageSchedulingStateSendWhenOnline():new TdApi.MessageSchedulingStateSendAtDate');
    expect(bridge).toContain('if(!now&&!online&&(at<seconds+5||at>seconds+367L*86400L))');
    expect(bridge).toContain('message.id==messageId&&message.schedulingState!=null');
  });

  it('la instantánea marca los mensajes pendientes de conexión y las listas de tareas', () => {
    expect(snapshot).toContain('else if(message.schedulingState instanceof TdApi.MessageSchedulingStateSendWhenOnline)data.put("scheduledOnline",true);');
    expect(snapshot).toContain('data.put("checklist",value);');
    expect(snapshot).toContain('.put("canAdd",list.canAddTasks).put("canMark",list.canMarkTasksAsDone)');
    expect(snapshot).toContain('.put("done",task.completedBy!=null)');
    expect(session).toContain('if (message.content instanceof TdApi.MessageChecklist) {');
    expect(session).toContain('"Lista de tareas · "');
  });
});

describe('Listas de tareas en la interfaz', () => {
  it('el compositor comparte la base de la encuesta y preserva los ids al editar', () => {
    expect(panels).toContain('export function ChecklistComposer({send,close,initial,action=\'Enviar lista de tareas\',adding=false}');
    expect(panels).toContain('adding||!initial?[{id:0,text:\'\'},{id:0,text:\'\'}]:initial.tasks.map(task=>({id:task.id,text:task.text}))');
    expect(panels).toContain('if(!title.trim())return setError(\'Escribe un título para la lista.\');');
    expect(panels).toContain('if(filled.length>100)return setError(\'Una lista lleva hasta 100 tareas.\');');
    expect(panels).toContain('if(new Set(filled.map(row=>row.text.toLocaleLowerCase())).size!==filled.length)return setError(\'No repitas la misma tarea.\');');
    expect(panels).toContain('{row.id&&initial?<Check size={13}/>:index+1}');
    expect(panels).toContain('<input autoFocus={!adding} disabled={adding} value={title}');
    expect(panels).toContain('Se añadirán solo las tareas nuevas escritas aquí; el título y el resto de la lista no cambian.');
    expect(panels).toContain('Las listas de tareas requieren Telegram Premium y no se envían a canales ni a chats secretos.');
  });

  it('la tarjeta de lista marca tareas con la función real y avisa de Premium', () => {
    expect(content).toContain('function ChecklistCard({message,run}');
    expect(content).toContain("run<boolean>('checklist.toggle',{id:message.id,done:task.done?[]:[task.id],notDone:task.done?[task.id]:[]})");
    expect(content).toContain('{message.checklist&&run&&<ChecklistCard message={message} run={run}/>}');
    expect(content).toContain(':!message.checklist&&text');
    expect(content).toContain('Necesitas Telegram Premium para cambiar el estado de las tareas.');
    expect(content).toContain('Cualquier miembro con Premium puede marcar tareas.');
  });

  it('el chat crea listas desde Adjuntar con las mismas puertas que Telegram', () => {
    expect(app).toContain('function openChecklist(){');
    expect(app).toContain('label="Crear lista de tareas"');
    expect(app).toContain("run<boolean>('checklist.send',{title:draft.title,tasks:draft.tasks,othersCanAdd:draft.othersCanAdd,othersCanDone:draft.othersCanDone,reply:reply?.id||'0',silent})");
    expect(app).toContain('Los chats secretos no admiten listas de tareas.');
    expect(app).toContain('Los canales no admiten listas de tareas.');
  });

  it('el menú del mensaje añade y edita listas reales', () => {
    expect(app).toContain('label="Añadir tareas a la lista"');
    expect(app).toContain('<ChecklistComposer adding initial={message.checklist} action="Añadir a la lista"');
    expect(app).toContain("run<boolean>('checklist.add',{id:message.id,tasks:draft.tasks})");
    expect(app).toContain('label="Editar lista de tareas"');
    expect(app).toContain('<ChecklistComposer initial={message.checklist} action="Guardar en Telegram"');
    expect(app).toContain("run<boolean>('checklist.edit',{id:message.id,title:draft.title,tasks:draft.tasks,othersCanAdd:draft.othersCanAdd,othersCanDone:draft.othersCanDone})");
    expect(app).toContain('message.checklist&&message.checklist.canAdd&&');
    expect(app).toContain('message.checklist&&props.editChecklist&&');
  });

  it('programar ofrece "cuando se conecte" solo en chats privados', () => {
    expect(app).toContain('Cuando se conecte el destinatario');
    expect(app).toContain('«Cuando se conecte» solo funciona con chats privados.');
    expect(app).toContain("run<boolean>('scheduled.reschedule',at==='online'?{id:chat.id,messageId:message.id,online:true}:{id:chat.id,messageId:message.id,at})");
    expect(app).toContain("schedule:schedule==='online'?'online':schedule");
    expect(app).toContain("message.scheduledAt?new Date(message.scheduledAt*1000).toLocaleString('es'):message.scheduledOnline?'Cuando se conecte':'Sin fecha'");
    expect(app).toContain("'Telegram enviará el mensaje en cuanto el destinatario se conecte.'");
  });

  it('los tipos del contrato describen listas y envío al conectarse', () => {
    expect(contract).toContain('export interface ChecklistTaskInfo { id:number; text:string; done:boolean }');
    expect(contract).toContain('export interface ChecklistInfo { title:string; tasks:ChecklistTaskInfo[]; othersCanAdd:boolean; othersCanMark:boolean; canAdd:boolean; canMark:boolean }');
    expect(contract).toContain('export interface Message { checklist?:ChecklistInfo }');
    expect(contract).toContain('scheduledOnline?:boolean; scheduledRepeat?:boolean');
    expect(contract).toContain('editChecklist: boolean');
  });

  it('los estilos de la tarjeta y del compositor existen', () => {
    expect(styles).toContain('.checklist-card{');
    expect(styles).toContain('.checklist-tasks li.done span{');
    expect(styles).toContain('.checklist-box{');
    expect(styles).toContain('.checklist-title{');
  });

  it('no se inventan métodos que no cruzan el puente', () => {
    const invented = [app, panels, content].map(source => source.match(/(?:run<[^>]*>|run)\('(?:checklist|scheduled)[^']*'/g) || []).flat();
    expect(invented.length).toBeGreaterThan(0);
    for (const call of invented) {
      const method = call.slice(call.indexOf("'") + 1, call.lastIndexOf("'"));
      expect(KNOWN).toContain(method);
    }
  });
});
