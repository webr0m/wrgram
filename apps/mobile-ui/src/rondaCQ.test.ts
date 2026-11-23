import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CQ · N03: responder y marcar leído desde la notificación Android. Las acciones nacen en
 * `PushNotifications.update` (RemoteInput para responder, botón para marcar leído) y las ejecuta un
 * receptor no exportado que re-verifica edad, bloqueo, cuenta y chat secreto en el momento del pulsado,
 * no solo al publicar. Con el bloqueo de la app activo no se ofrece la respuesta directa: el RemoteInput
 * no pasa por AppLockScreen. El envío usa un brazo de TdSession independiente de activeChat y nunca
 * reintenta solo: si no se confirma, el aviso manda revisar el historial.
 *
 * Lo que no se puede probar sin cuenta queda dicho: la entrega real del RemoteInput y el ViewMessages
 * contra Telegram solo se prueban en el dispositivo del propietario. Aquí se mide el contrato estático.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const push = text(`${javaDir}PushNotifications.java`);
const receiver = text(`${javaDir}NotificationActionReceiver.java`);
const rules = text(`${javaDir}NotificationActions.java`);
const engine = text(`${javaDir}TdSession.java`);
const manifest = text('../../mobile/android/app/src/main/AndroidManifest.xml');
const jvm = text('../../mobile/android/app/src/test/java/cc/webrom/wrgram/NotificationActionsTest.java');

describe('ronda CQ · acciones de notificación', () => {
  it('declara el receptor sin exportarlo', () => {
    expect(manifest).toContain('<receiver android:name=".NotificationActionReceiver" android:exported="false" />');
  });

  it('ofrece responder solo sin bloqueo y sin chat secreto, y marcar leído solo con mensaje conocido', () => {
    expect(push).toContain('boolean secret=target!=null&&target.type instanceof TdApi.ChatTypeSecret;');
    expect(push).toContain('if(NotificationActions.replyAllowed(AppLock.enabled(c),secret))builder.addAction(replyAction(c,session,group.chatId,topic,tag));');
    expect(push).toContain('if(NotificationActions.markReadAllowed(message))builder.addAction(markReadAction(c,session,group.chatId,topic,message,tag));');
    expect(rules).toContain('return !lockEnabled && !secretChat;');
    expect(rules).toContain('return messageId != 0;');
  });

  it('construye el RemoteInput con PendingIntent mutable solo desde API 31 y sin respuestas generadas', () => {
    expect(push).toContain('new RemoteInput.Builder(NotificationActions.EXTRA_TEXT).setLabel("Responder").build()');
    expect(push).toContain('Build.VERSION.SDK_INT>=31?PendingIntent.FLAG_MUTABLE:0');
    expect(push).toContain('.addRemoteInput(input).setAllowGeneratedReplies(false).build()');
    expect(push).toContain('PendingIntent.getBroadcast(c,0,actionIntent(c,session,NotificationActions.MARK_READ,chat,topic,message,tag),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE)');
  });

  it('no revela datos sensibles ni pierde las puertas heredadas del aviso', () => {
    expect(push).toContain('Notification.VISIBILITY_SECRET');
    expect(push).toContain('setContentTitle("WRGram").setContentText("Tienes mensajes nuevos en Telegram")');
    expect(push).toContain('ChatNotificationPolicy.explicitlyMuted(settings.notificationSettings)');
    expect(push).toContain('!app.ageAccess().allowed()');
    expect(push).toContain('new TdApi.GetPushReceiverId(payload)');
  });

  it('re-verifica edad, bloqueo, cuenta y secreto al ejecutar, y mantiene vivo el receptor durante el envío', () => {
    expect(receiver).toContain('if (!PushNotifications.enabled(app) || !app.ageAccess().allowed()) { cancel(app, tag); return; }');
    expect(receiver).toContain('if (session == null || !session.ready()) { toast(context, NotificationActions.NOT_READY); return; }');
    expect(receiver).toContain('if (AppLock.enabled(context)) { toast(context, NotificationActions.LOCKED); return; }');
    expect(receiver).toContain('if (known != null && known.type instanceof TdApi.ChatTypeSecret) { toast(context, NotificationActions.SECRET); return; }');
    expect(receiver).toContain('final PendingResult pending = goAsync();');
    expect(receiver).toContain('pending.finish();');
    expect(receiver).toContain('RemoteInput.getResultsFromIntent(intent)');
    expect(receiver).toContain('NotificationActions.replyProblem(text)');
    // Un solo punto de envío: el fallo avisa, no reintenta.
    expect(receiver.split('session.replyFromNotification(').length - 1).toBe(1);
    expect(receiver).toContain('else toast(context, NotificationActions.SEND_FAILED);');
  });

  it('envía y marca leído con el chat explícito de la notificación, nunca con activeChat', () => {
    const reply = engine.slice(engine.indexOf('void replyFromNotification('));
    const read = reply.slice(reply.indexOf('void markReadFromNotification('));
    const send = reply.slice(0, reply.indexOf('void markReadFromNotification('));
    expect(send).toContain('send.chatId=chat;');
    expect(send).toContain('if(topic!=0)send.topicId=new TdApi.MessageTopicForum(topic);');
    expect(send).toContain('NotificationActions.replyProblem(text)!=null||(known!=null&&known.type instanceof TdApi.ChatTypeSecret)');
    expect(send).not.toContain('activeChat');
    expect(read).toContain('view.chatId=chat;view.messageIds=new long[]{messageId};view.forceRead=true;');
    expect(read).toContain('NotificationActions.markReadAllowed(messageId)');
    expect(read).not.toContain('activeChat');
  });

  it('las reglas puras tienen su prueba JVM y el límite se mide sobre el texto limpio', () => {
    expect(jvm).toContain('responderSoloSinBloqueoYSinChatSecreto');
    expect(jvm).toContain('elLimiteSeMideSobreElTextoLimpio');
    expect(rules).toContain('String cleaned = cleanedReply(text);');
    expect(rules).toContain('if (cleaned.length() > MAX_TEXT)');
    expect(rules).toContain('static final int MAX_TEXT = 4096;');
  });
});