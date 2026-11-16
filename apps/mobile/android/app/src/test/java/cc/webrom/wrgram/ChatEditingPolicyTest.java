package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatEditingPolicyTest {
    private static TdApi.Chat basicGroup(boolean changeInfo) {
        TdApi.Chat chat = new TdApi.Chat();
        chat.type = new TdApi.ChatTypeBasicGroup();
        TdApi.ChatPermissions permissions = new TdApi.ChatPermissions();
        permissions.canChangeInfo = changeInfo;
        chat.permissions = permissions;
        return chat;
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.Chat chat = new TdApi.Chat();
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        chat.type = type;
        TdApi.ChatPermissions permissions = new TdApi.ChatPermissions();
        permissions.canChangeInfo = true;
        chat.permissions = permissions;
        return chat;
    }

    private static TdApi.ChatMemberStatusAdministrator admin(boolean changeInfo) {
        TdApi.ChatMemberStatusAdministrator status = new TdApi.ChatMemberStatusAdministrator();
        TdApi.ChatAdministratorRights rights = new TdApi.ChatAdministratorRights();
        rights.canChangeInfo = changeInfo;
        status.rights = rights;
        return status;
    }

    @Test public void onlyCommunitiesHaveANameToEdit() {
        assertTrue(ChatEditing.supported(basicGroup(true)));
        assertTrue(ChatEditing.supported(supergroup(false)));
        assertTrue(ChatEditing.supported(supergroup(true)));
        TdApi.Chat privateChat = new TdApi.Chat();
        privateChat.type = new TdApi.ChatTypePrivate();
        TdApi.Chat secret = new TdApi.Chat();
        secret.type = new TdApi.ChatTypeSecret();
        assertFalse(ChatEditing.supported(privateChat));
        assertFalse(ChatEditing.supported(secret));
        assertFalse(ChatEditing.supported(null));
    }

    @Test public void aCreatorWhoLeftCannotRenameWhatItNoLongerIsIn() {
        TdApi.ChatMemberStatusCreator creator = new TdApi.ChatMemberStatusCreator();
        assertFalse(ChatEditing.canChange(basicGroup(true), creator));
        creator.isMember = true;
        assertTrue(ChatEditing.canChange(basicGroup(false), creator));
        assertTrue(ChatEditing.canChange(supergroup(true), creator));
    }

    @Test public void anAdministratorNeedsTheRightNamedByTelegram() {
        assertTrue(ChatEditing.canChange(supergroup(true), admin(true)));
        assertFalse(ChatEditing.canChange(supergroup(true), admin(false)));
        assertFalse(ChatEditing.canChange(supergroup(true), new TdApi.ChatMemberStatusAdministrator()));
        // Los permisos por defecto del chat no mandan sobre lo que Telegram le concedió como admin.
        assertTrue(ChatEditing.canChange(basicGroup(false), admin(true)));
        assertTrue(ChatEditing.canChange(basicGroup(true), admin(true)));
        assertFalse(ChatEditing.canChange(basicGroup(true), admin(false)));
    }

    @Test public void ordinaryMembersRenamedBasicGroupsAndOnlyBasicGroups() {
        assertTrue(ChatEditing.canChange(basicGroup(true), new TdApi.ChatMemberStatusMember()));
        assertFalse(ChatEditing.canChange(basicGroup(false), new TdApi.ChatMemberStatusMember()));
        assertFalse(ChatEditing.canChange(supergroup(false), new TdApi.ChatMemberStatusMember()));
        assertFalse(ChatEditing.canChange(supergroup(true), new TdApi.ChatMemberStatusMember()));
        TdApi.Chat naked = new TdApi.Chat();
        naked.type = new TdApi.ChatTypeBasicGroup();
        assertFalse(ChatEditing.canChange(naked, new TdApi.ChatMemberStatusMember()));
    }

    @Test public void restrictedMembersNeedBothPermissionsStillStanding() {
        TdApi.ChatMemberStatusRestricted status = new TdApi.ChatMemberStatusRestricted();
        TdApi.ChatPermissions override = new TdApi.ChatPermissions();
        override.canChangeInfo = true;
        status.permissions = override;
        status.isMember = true;
        assertTrue(ChatEditing.canChange(basicGroup(true), status));
        assertFalse(ChatEditing.canChange(basicGroup(false), status));
        assertFalse(ChatEditing.canChange(supergroup(false), status));
        status.isMember = false;
        assertFalse(ChatEditing.canChange(basicGroup(true), status));
        override.canChangeInfo = false;
        status.isMember = true;
        assertFalse(ChatEditing.canChange(basicGroup(true), status));
        status.permissions = null;
        assertFalse(ChatEditing.canChange(basicGroup(true), status));
    }

    @Test public void statusesThatLeftOrWereBannedHaveNoRightsAtAll() {
        for (TdApi.ChatMemberStatus status : new TdApi.ChatMemberStatus[]{new TdApi.ChatMemberStatusLeft(), new TdApi.ChatMemberStatusBanned()}) {
            assertFalse(ChatEditing.canChange(basicGroup(true), status));
            assertFalse(ChatEditing.canChange(supergroup(true), status));
        }
        assertFalse(ChatEditing.canChange(basicGroup(true), null));
        assertFalse(ChatEditing.canChange(null, new TdApi.ChatMemberStatusCreator()));
    }

    private static String letters(int count) {
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < count; i++) value.append('a');
        return value.toString();
    }

    @Test public void telegramCountsTitleAndDescriptionInUnicodeCharacters() {
        assertNull(ChatEditing.problem("title", "WRGram"));
        assertEquals("Telegram no guarda comunidades sin nombre: escribe un título de al menos un carácter.", ChatEditing.problem("title", ""));
        assertEquals(ChatEditing.problem("title", "   "), ChatEditing.problem("title", ""));
        assertNull(ChatEditing.problem("title", letters(128)));
        assertEquals("Telegram admite nombres de hasta 128 caracteres.", ChatEditing.problem("title", letters(129)));
        assertEquals("Telegram admite descripciones de hasta 255 caracteres.", ChatEditing.problem("description", letters(256)));
        assertNull(ChatEditing.problem("description", ""));
        StringBuilder emoji = new StringBuilder();
        for (int i = 0; i < ChatEditing.MAX_TITLE; i++) emoji.append("🎧");
        assertEquals(2 * ChatEditing.MAX_TITLE, emoji.length());
        assertNull(ChatEditing.problem("title", emoji.toString()));
        emoji.append("🎧");
        assertEquals("Telegram admite nombres de hasta 128 caracteres.", ChatEditing.problem("title", emoji.toString()));
    }

    @Test public void anUnknownFieldIsRefusedInTheSameLanguageAsTheRest() {
        assertEquals("Ese campo no se puede cambiar desde WRGram.", ChatEditing.problem("photo", "WRGram"));
        assertEquals("Ese campo no se puede cambiar desde WRGram.", ChatEditing.problem(null, "WRGram"));
        assertNotNull(ChatEditing.problem("title", null));
    }

    @Test public void spacesAroundTheTextAreNotPartOfWhatTelegramStores() {
        assertEquals("WRGram", ChatEditing.prepared("  WRGram  "));
        assertEquals("", ChatEditing.prepared(null));
        assertEquals("hola", ChatEditing.prepared("hola"));
    }
}
