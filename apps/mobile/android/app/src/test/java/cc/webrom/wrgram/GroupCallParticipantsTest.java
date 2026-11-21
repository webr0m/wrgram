package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/**
 * La ronda CW-C escribe los participantes que el mensaje de llamada de grupo ya trae. `otherParticipantIds`
 * (`TdApi.java:49783`) llegaba hasta el despachador y se tiraba: la burbuja decía «Llamada de voz finalizada» y
 * callaba los nombres que Telegram sí mandaba. Las dos funciones puras de abajo son las que cerraron ese hueco, y
 * sus tres reglas son deliberadas: deduplicar, cortar en tres, y no poner cifra de «más» —el campo se documenta como
 * «some other call participants», o sea que lo que llega no es el censo de la llamada y un número se leería como total—.
 */
public class GroupCallParticipantsTest {

    private static TdApi.MessageSender user(long id) {
        TdApi.MessageSenderUser sender = new TdApi.MessageSenderUser();
        sender.userId = id;
        return sender;
    }

    private static TdApi.Message group(boolean missed, boolean active, boolean video, int seconds, TdApi.MessageSender[] others) {
        TdApi.MessageGroupCall call = new TdApi.MessageGroupCall();
        call.wasMissed = missed;
        call.isActive = active;
        call.isVideo = video;
        call.duration = seconds;
        call.otherParticipantIds = others;
        TdApi.Message message = new TdApi.Message();
        message.chatId = 8;
        message.id = 4;
        message.date = 1771234567;
        message.content = call;
        return message;
    }

    @Test public void anEmptyRosterIsAnEmptyString() {
        assertEquals("", ServiceMessages.participantList(null));
        assertEquals("", ServiceMessages.participantList(new String[0]));
    }

    @Test public void threeNamesJoinWithAY() {
        assertEquals("Ana", ServiceMessages.participantList(new String[] {"Ana"}));
        assertEquals("Ana y Bruno", ServiceMessages.participantList(new String[] {"Ana", "Bruno"}));
        assertEquals("Ana, Bruno y Carla", ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla"}));
    }

    @Test public void aFourthNameCutsWithEllipsisAndNoCount() {
        // La lista que sigue no es el censo: «y 1 más» afirmaría que el resto es justo uno.
        assertEquals("Ana, Bruno y Carla…", ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla", "Dani"}));
        assertEquals("Ana, Bruno y Carla…", ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla", "Dani", "Elena", "Fabi"}));
        assertFalse(ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla", "Dani"}).contains("más"));
        assertTrue(ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla", "Dani"}).endsWith("…"));
    }

    @Test public void senderNamesSkipsHolesAndRepeatsOnce() {
        assertEquals(0, ServiceMessages.senderNames(null, null).length);
        assertEquals(0, ServiceMessages.senderNames(null, new TdApi.MessageSender[0]).length);
        // Sin sesión todo nombre cae en «Alguien», y la burbuja no puede decir «Alguien y Alguien».
        String[] una = ServiceMessages.senderNames(null, new TdApi.MessageSender[] {user(11), null, user(12), user(13)});
        assertEquals(1, una.length);
        assertEquals("Alguien", una[0]);
    }

    @Test public void theGroupMessageAppendsTheParticipantsItCarries() {
        assertEquals("Llamada de voz finalizada · 2 min 5 s · Otros participantes: Alguien",
            ServiceMessages.text(group(false, false, false, 125, new TdApi.MessageSender[] {user(11), user(12)}), null));
    }

    @Test public void noRosterMeansNoSuffixAndNoHangingDot() {
        assertEquals("Llamada de voz finalizada · 2 min 5 s", ServiceMessages.text(group(false, false, false, 125, null), null));
        assertEquals("Llamada de voz finalizada · 2 min 5 s", ServiceMessages.text(group(false, false, false, 125, new TdApi.MessageSender[0]), null));
    }

    @Test public void theSuffixFollowsTheShapeOfTheCallNotItsDuration() {
        assertEquals("Llamada de voz perdida · Otros participantes: Alguien",
            ServiceMessages.text(group(true, false, false, 0, new TdApi.MessageSender[] {user(11)}), null));
        assertEquals("Videollamada en curso · Otros participantes: Alguien",
            ServiceMessages.text(group(false, true, true, 0, new TdApi.MessageSender[] {user(11)}), null));
    }

    @Test public void anInvitationWithoutInviteesDoesNotLeaveADanglingPreposition() {
        TdApi.MessageInviteVideoChatParticipants empty = new TdApi.MessageInviteVideoChatParticipants();
        empty.userIds = new long[0];
        assertEquals("Alguien invitó a la videollamada", ServiceMessages.text(with(empty), null));
        TdApi.MessageInviteVideoChatParticipants sinLista = new TdApi.MessageInviteVideoChatParticipants();
        assertEquals("Alguien invitó a la videollamada", ServiceMessages.text(with(sinLista), null));
    }

    @Test public void anInvitationNamesWhoItInvited() {
        TdApi.MessageInviteVideoChatParticipants uno = new TdApi.MessageInviteVideoChatParticipants();
        uno.userIds = new long[] {77};
        assertEquals("Alguien invitó a un usuario a la videollamada", ServiceMessages.text(with(uno), null));
    }

    private static TdApi.Message with(TdApi.MessageContent content) {
        TdApi.Message message = new TdApi.Message();
        message.chatId = 8;
        message.id = 5;
        message.date = 1771234567;
        message.content = content;
        return message;
    }
}
