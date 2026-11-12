import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const allowed = java('BridgePolicy');
const snapshot = java('NativeSnapshot');
const content = ui('MessageContent.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const styles = ui('visual-polish.css');

const METHODS = ['send.paidMedia', 'chat.paidMessages.get', 'chat.paidMessages.set', 'stars.paidMessageRevenue'];

describe('Ronda F en el puente', () => {
  it('los métodos nuevos están en la lista de permitidos del puente', () => {
    expect(allowed).toContain('"send.paidMedia","chat.paidMessages.get","chat.paidMessages.set","stars.paidMessageRevenue"');
    for (const method of METHODS) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "send.paidMedia":sendPaidMedia(p,a);break;');
    expect(bridge).toContain('case "chat.paidMessages.get":paidMessagesGet(p,a);break;');
    expect(bridge).toContain('case "chat.paidMessages.set":paidMessagesSet(p,a);break;');
    expect(bridge).toContain('case "stars.paidMessageRevenue":paidMessageRevenue(p,a);break;');
  });

  it('la multimedia de pago solo se publica en un canal con la función activada', () => {
    expect(bridge).toContain('!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel');
    expect(bridge).toContain('if(!info.hasPaidMediaAllowed)');
    expect(bridge).toContain('new TdApi.GetSupergroupFullInfo(groupId)');
  });

  it('el precio se valida contra el máximo de Telegram y se confirma con el importe', () => {
    expect(bridge).toContain('new TdApi.GetOption("paid_media_message_star_count_max")');
    expect(bridge).toContain('StarsPolicy.stars(p,"starCount",max)');
    expect(bridge).toContain('setTitle("Publicar contenido de pago")');
    expect(bridge).toContain('setPositiveButton("Publicar por "+price+" ⭐"');
    expect(bridge).toContain('TdApi.InputMessagePaidMedia content=new TdApi.InputMessagePaidMedia();');
    expect(bridge).toContain('content.starCount=price;content.paidMedia=media;content.caption=formatted;content.payload="";');
    expect(bridge).toContain('piece.media=new TdApi.InputFileLocal(item.path.getPath())');
    expect(bridge).toContain('if(sent)for(String token:tokens){Attachment item=attachments.remove(token);');
  });

  it('los mensajes de pago leen y fijan el precio real del supergrupo', () => {
    expect(bridge).toContain('new TdApi.GetOption("paid_message_star_count_max")');
    expect(bridge).toContain('new TdApi.SetChatPaidMessageStarCount(chat.id,price)');
    expect(bridge).toContain('content instanceof TdApi.MessagePaidMessagePriceChanged){price=((TdApi.MessagePaidMessagePriceChanged)item.content).paidMessageStarCount;break;}');
    expect(bridge).toContain('if(price==0&&info.outgoingPaidMessageStarCount>0)price=info.outgoingPaidMessageStarCount;');
    expect(bridge).toContain('object("starCount",price,"canEnable",info.canEnablePaidMessages)');
    expect(bridge).toContain('perform(new TdApi.GetPaidMessageRevenue(userId),answer,value->answer.ok(object("starCount",value.starCount)));');
    expect(bridge).toContain('setTitle("Mensajes de pago")');
  });

  it('el pago de facturas y contenido comparte preparación con doble vía y guardas de repetición', () => {
    expect(bridge).toContain('if(paid!=null&&starsPurchaseDone(source.content))');
    expect(bridge).toContain('TdApi.InputInvoice input=new TdApi.InputInvoiceMessage(source.chatId,source.id);');
    expect(bridge).toContain('else if(form.type instanceof TdApi.PaymentFormTypeStarSubscription)');
    expect(bridge).toContain('if(paid.media!=null)for(TdApi.PaidMedia piece:paid.media)if(piece!=null&&!(piece instanceof TdApi.PaidMediaPreview))return true;');
    expect(bridge).toContain('"canBePaid",props.canBePaid');
  });

  it('el snapshot serializa las piezas de contenido de pago y deduce el candado', () => {
    expect(snapshot).toContain('data.put("paidMedia",new JSONObject().put("starCount",paid.starCount).put("locked",locked).put("media",pieces));');
    expect(snapshot).toContain('private JSONObject paidMediaPiece(TdApi.PaidMedia piece)throws Exception{');
    expect(snapshot).toContain('if(piece instanceof TdApi.PaidMediaPreview){');
    expect(snapshot).toContain('if(piece instanceof TdApi.PaidMediaPhoto||piece instanceof TdApi.PaidMediaVideo)locked=false;');
    expect(snapshot).toContain('content instanceof TdApi.MessagePaidMedia?"Contenido de pago"');
    expect(snapshot).toContain('if(content instanceof TdApi.MessagePaidMedia)return ((TdApi.MessagePaidMedia)content).caption;');
  });
});

describe('Ronda F en la interfaz', () => {
  it('los tipos de contrato describen el contenido de pago y el editor de precios', () => {
    expect(contract).toContain("export interface PaidMediaPiece { kind:'photo'|'video'|'preview'|'unsupported'; media?:Media; width?:number; height?:number; duration?:number; minithumbnail?:string }");
    expect(contract).toContain('export interface PaidMediaInfo { starCount:number; locked:boolean; media:PaidMediaPiece[] }');
    expect(contract).toContain('export interface PaidMessagesInfo { starCount:number; canEnable:boolean }');
    expect(contract).toContain('transcribe?: boolean; canBePaid?: boolean }');
  });

  it('la burbuja muestra el candado y el desbloqueo pasa por la revisión de Stars', () => {
    expect(content).toContain('{message.paidMedia&&<PaidMediaCard message={message} payStars={payStars}/>}');
    expect(content).toContain('className="paid-media-lock"');
    expect(content).toContain('Desbloquear por {paid.starCount} ⭐');
    expect(content).toContain('paid.media.some(piece=>piece.minithumbnail)');
    expect(app).toContain("payStars={()=>startStarsPayment(message)}");
  });

  it('el menú del mensaje ofrece desbloquear solo cuando sigue bloqueado', () => {
    expect(app).toContain('props.canBePaid&&message.paidMedia?.locked');
    expect(app).toContain('label={`Desbloquear por ${message.paidMedia.starCount} ⭐`}');
    expect(app).toContain('onClick={()=>{setDialog(undefined);startStarsPayment(message);}}');
  });

  it('el compositor de contenido de pago acumula archivos reales y los limpia al cerrar', () => {
    expect(app).toContain("run<{token:string;name:string;size:number}>('attachment.pick')");
    expect(app).toContain('void runRef.current(\'attachment.discard\',{token:item.token})');
    expect(app).toContain('<PaidMediaComposer run={run} close={()=>setDialog(undefined)}');
    expect(app).toContain("run<boolean>('send.paidMedia',{tokens:items.map(item=>item.token),starCount:price,text:formatted.text,entities:formatted.entities,reply:reply?.id||'0',silent})");
    expect(app).toContain('label="Publicar contenido de pago"');
    expect(app).toContain("active?.type==='channel'&&<MenuItem icon={<LockKeyhole/>} label=\"Publicar contenido de pago\"");
  });

  it('el precio de mensajes se lee y se guarda con confirmación nativa', () => {
    expect(app).toContain("run<PaidMessagesInfo>('chat.paidMessages.get',{id:chat.id})");
    expect(app).toContain("run<boolean>('chat.paidMessages.set',{id:chat.id,starCount})");
    expect(app).toContain('<PaidMessagesEditor initial={value.starCount} canEnable={value.canEnable}');
    expect(app).toContain('label="Mensajes de pago"');
  });

  it('los ingresos por mensajes se consultan desde la lista de miembros', () => {
    expect(app).toContain('revenue={member=>openMemberRevenue(member)}');
    expect(app).toContain('!member.bot&&<button className="text-button" onClick={()=>revenue(member)}>Ingresos</button>');
    expect(app).toContain("run<{starCount:number}>('stars.paidMessageRevenue',{userId:member.id})");
  });

  it('los estilos cubren el candado, el compositor y los archivos elegidos', () => {
    expect(styles).toContain('.paid-media-card.is-locked');
    expect(styles).toContain('.paid-media-lock');
    expect(styles).toContain('.paid-media-composer');
    expect(styles).toContain('.paid-media-pick');
  });
});
