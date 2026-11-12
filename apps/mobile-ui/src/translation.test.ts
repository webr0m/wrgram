import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const snapshot = java('NativeSnapshot');
const session = java('TdSession');
const allowed = java('BridgePolicy');
const content = ui('MessageContent.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const css = ui('message-preview.css');

describe('traducción por chat y transcripción de notas de voz', () => {
  it('los cuatro métodos están en la lista de permitidos del puente', () => {
    expect(allowed).toContain('"chat.translatable","chat.autotranslate","message.transcribe","message.transcribe.rate"');
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "chat.translatable":{TdApi.Chat chat=target(p);perform(new TdApi.ToggleChatIsTranslatable(chat.id,p.getBoolean("value")),a,value->a.ok(true));break;}');
    expect(bridge).toContain('case "chat.autotranslate":{TdApi.Chat chat=target(p);if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("La traducción automática de Telegram solo está disponible en canales y supergrupos.");perform(new TdApi.ToggleSupergroupHasAutomaticTranslation(((TdApi.ChatTypeSupergroup)chat.type).supergroupId,p.getBoolean("value")),a,value->a.ok(true));break;}');
    expect(bridge).toContain('case "message.transcribe":transcribe(message(p),a);break;');
    expect(bridge).toContain('new TdApi.RecognizeSpeech(message.chatId,message.id)');
    expect(bridge).toContain('case "message.transcribe.rate":{TdApi.Message rating=message(p);perform(new TdApi.RateSpeechRecognition(rating.chatId,rating.id,p.getBoolean("good")),a,value->a.ok(true));break;}');
  });

  it('el botón de transcribir solo aparece cuando Telegram marca la nota como reconocible', () => {
    expect(bridge).toContain('"transcribe",props.canRecognizeSpeech&&(message.content instanceof TdApi.MessageVoiceNote||message.content instanceof TdApi.MessageVideoNote));');
    expect(app).toContain("{props.transcribe&&<MenuItem icon={<Mic/>} label=\"Transcribir\" onClick={()=>activateMessageLanguage(message,'transcribe')}/>}");
    expect(bridge).toContain('if(!properties.canRecognizeSpeech)');
  });

  it('las banderas de traducción viajan en el DTO del chat y la sesión reacciona a su actualización', () => {
    expect(snapshot).toContain('data.put("translatable",chat.isTranslatable);');
    expect(snapshot).toContain('if(group.hasAutomaticTranslation)data.put("automaticTranslation",true);');
    expect(session).toContain('object instanceof TdApi.UpdateChatIsTranslatable');
    expect(session).toContain('chats.get(value.chatId).isTranslatable = value.isTranslatable; emit("chats");');
    expect(contract).toContain('translatable?:boolean; automaticTranslation?:boolean');
  });

  it('la transcripción viaja en el DTO del mensaje con los cuatro estados', () => {
    expect(snapshot).toContain('voiceNote.speechRecognitionResult');
    expect(snapshot).toContain('videoNote.speechRecognitionResult');
    expect(snapshot).toContain('if(speech instanceof TdApi.SpeechRecognitionResultText)');
    expect(snapshot).toContain('if(speech instanceof TdApi.SpeechRecognitionResultError)');
    expect(snapshot).toContain('if(speech instanceof TdApi.SpeechRecognitionResultPending)');
    expect(contract).toContain('export interface SpeechInfo { state:\'pending\'|\'text\'|\'error\'; partial?:string; text?:string; error?:string }');
  });

  it('la burbuja muestra la transcripción y permite valorarla con la llamada real al puente', () => {
    expect(content).toContain('function SpeechBlock({message,run,speech');
    expect(content).toContain('{(message.transcribable||message.speech)&&run&&<InlineSpeech message={message} run={run}');
    expect(content).toContain("if(await run<boolean>('message.transcribe.rate',{id:message.id,good}))setRated(true)");
    expect(content).toContain('speech.state===\'pending\'');
    expect(content).toContain('speech.state===\'error\'');
    expect(css).toContain('.speech-block');
    expect(css).toContain('.speech-rate button');
  });

  it('los dos interruptores de traducción viven en la ficha del chat y giran la bandera actual', () => {
    expect(app).toContain('void run("chat.translatable",{id:active.id,value:!active.translatable})');
    expect(app).toContain('void run("chat.autotranslate",{id:active.id,value:!active.automaticTranslation})');
    expect(app).toContain('active.translatable?"Dejar de traducir este chat":"Traducir mensajes de este chat"');
    expect(app).toContain('active.automaticTranslation?"Desactivar traducción automática":"Activar traducción automática"');
  });

  it('no se inventan métodos ni funciones fuera del binding', () => {
    expect(app).not.toMatch(/chat\.translate|chat\.detectLanguage/);
    expect(content).not.toMatch(/message\.transcribe\.cancel|transcribe\.stop/);
  });
});
