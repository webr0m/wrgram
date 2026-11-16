package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/**
 * Las reglas de expulsar en un grupo básico, medidas contra lo que la schema de TDLib escribe sobre
 * `BanChatMember`, `ChatMemberStatusRestricted` y `canPromoteMembers`.
 */
public class BasicGroupMemberActionPolicyTest {

    private static TdApi.Chat basic() {
        TdApi.Chat chat = new TdApi.Chat();
        chat.type = new TdApi.ChatTypeBasicGroup(7);
        return chat;
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.Chat chat = new TdApi.Chat();
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        chat.type = type;
        return chat;
    }

    private static TdApi.ChatMemberStatus member() {
        return new TdApi.ChatMemberStatusMember(0);
    }

    private static TdApi.ChatMemberStatus creator(boolean inside) {
        return new TdApi.ChatMemberStatusCreator(false, inside);
    }

    private static TdApi.ChatMemberStatus admin(boolean restrict) {
        TdApi.ChatAdministratorRights rights = new TdApi.ChatAdministratorRights();
        rights.canRestrictMembers = restrict;
        return new TdApi.ChatMemberStatusAdministrator(true, rights);
    }

    private static TdApi.ChatMemberStatus restricted(boolean inside) {
        return new TdApi.ChatMemberStatusRestricted(inside, 0, new TdApi.ChatPermissions());
    }

    @Test
    public void soloMandaEnGruposBasicos() {
        assertTrue(BasicGroupMemberAction.applicable(basic()));
        assertFalse(BasicGroupMemberAction.applicable(supergroup(false)));
        assertFalse(BasicGroupMemberAction.applicable(supergroup(true)));
        assertFalse(BasicGroupMemberAction.applicable(null));
    }

    @Test
    public void elCreadorDentroPuedeExpulsar() {
        assertTrue(BasicGroupMemberAction.mayRemove(creator(true)));
    }

    @Test
    public void unCreadorFueraNoPuedeNada() {
        assertFalse(BasicGroupMemberAction.mayRemove(creator(false)));
    }

    @Test
    public void elAdministradorMandaSiElServidorLeDaElPermiso() {
        assertTrue(BasicGroupMemberAction.mayRemove(admin(true)));
        assertFalse(BasicGroupMemberAction.mayRemove(admin(false)));
    }

    @Test
    public void unMiembroNormalNoExpulsaANadie() {
        assertFalse(BasicGroupMemberAction.mayRemove(member()));
        assertFalse(BasicGroupMemberAction.mayRemove(restricted(true)));
        assertFalse(BasicGroupMemberAction.mayRemove(null));
    }

    @Test
    public void unoMismoSeFrenaAntesQueCualquierOtroEstado() {
        assertEquals(BasicGroupMemberAction.SELF, BasicGroupMemberAction.banProblem(creator(true), creator(true), 40, 40));
    }

    @Test
    public void alCreadorNoSeLeExpulsa() {
        assertEquals(BasicGroupMemberAction.CREATOR, BasicGroupMemberAction.banProblem(admin(true), creator(true), 41, 42));
    }

    @Test
    public void fueraDeLaListaNoHayNadaQueExpulsar() {
        assertEquals(BasicGroupMemberAction.OUTSIDE,
            BasicGroupMemberAction.banProblem(admin(true), new TdApi.ChatMemberStatusBanned(0), 41, 42));
        assertEquals(BasicGroupMemberAction.OUTSIDE,
            BasicGroupMemberAction.banProblem(admin(true), new TdApi.ChatMemberStatusLeft(), 41, 42));
        assertEquals(BasicGroupMemberAction.OUTSIDE,
            BasicGroupMemberAction.banProblem(admin(true), restricted(true), 41, 42));
    }

    @Test
    public void sinPermisoElRechazoLlegaAntesDeEscribir() {
        assertEquals(BasicGroupMemberAction.NO_RIGHT, BasicGroupMemberAction.banProblem(member(), member(), 41, 42));
        assertEquals(BasicGroupMemberAction.NO_RIGHT, BasicGroupMemberAction.banProblem(admin(false), member(), 41, 42));
    }

    @Test
    public void dentroConPermisoEsLaUnicaSalidaBuena() {
        assertNull(BasicGroupMemberAction.banProblem(admin(true), member(), 41, 42));
        assertNull(BasicGroupMemberAction.banProblem(creator(true), admin(true), 41, 42));
    }

    @Test
    public void lasRestriccionesParcialesNoExistenEnUnBasico() {
        assertEquals(BasicGroupMemberAction.NO_RESTRICT, BasicGroupMemberAction.restrictProblem(basic()));
        assertNull(BasicGroupMemberAction.restrictProblem(supergroup(false)));
        assertNull(BasicGroupMemberAction.restrictProblem(supergroup(true)));
    }

    @Test
    public void repartirPermisosEsCosadeSupergrupos() {
        assertEquals(BasicGroupMemberAction.NO_PROMOTE, BasicGroupMemberAction.promoteProblem(basic()));
        assertNull(BasicGroupMemberAction.promoteProblem(supergroup(false)));
    }

    @Test
    public void pedirPlazoEnUnBasicoEsPrometerHumo() {
        assertEquals(BasicGroupMemberAction.NO_DURATION, BasicGroupMemberAction.durationProblem(basic(), 3600));
        assertNull(BasicGroupMemberAction.durationProblem(basic(), 0));
        assertNull(BasicGroupMemberAction.durationProblem(supergroup(false), 3600));
    }

    @Test
    public void elPlazoQueSaleHaciaTelegramESiempreCeroEnUnBasico() {
        assertEquals(0, BasicGroupMemberAction.until(basic(), 3600));
        assertEquals(0, BasicGroupMemberAction.until(basic(), 0));
        assertEquals(3600, BasicGroupMemberAction.until(supergroup(false), 3600));
        assertEquals(0, BasicGroupMemberAction.until(supergroup(false), -5));
    }

    @Test
    public void borrarLosMensajesSoloSePreguntaDondeDependeDeQuienPregunta() {
        assertTrue(BasicGroupMemberAction.revokes(basic(), true));
        assertFalse(BasicGroupMemberAction.revokes(basic(), false));
        assertTrue(BasicGroupMemberAction.revokes(supergroup(false), false));
        assertTrue(BasicGroupMemberAction.revokes(supergroup(true), false));
    }

    @Test
    public void laConfirmacionDiceNombrePlazoYMensajes() {
        String on = BasicGroupMemberAction.confirm("Lucía", true);
        String off = BasicGroupMemberAction.confirm("Lucía", false);
        assertTrue(on.contains("Lucía"));
        assertTrue(on.contains("definitiva"));
        assertTrue(on.contains(BasicGroupMemberAction.REVOKE_ON));
        assertTrue(off.contains(BasicGroupMemberAction.REVOKE_OFF));
        assertFalse(off.contains(BasicGroupMemberAction.REVOKE_ON));
    }

    @Test
    public void devolverAlguienAUnBasicoEsInvitarloOtraVez() {
        assertEquals(BasicGroupMemberAction.UNBAN_HINT, BasicGroupMemberAction.unbanProblem(basic()));
        assertNull(BasicGroupMemberAction.unbanProblem(supergroup(false)));
    }

    @Test
    public void laLineaDeAlcanceEsLaMismaQueVeLaLista() {
        assertEquals(BasicGroupMemberAction.SCOPE, BasicGroupMemberAction.scope());
    }

    @Test
    public void ningunaFraseSeRepiteniConfundeConLasDeInvitar() {
        String[] phrases = {BasicGroupMemberAction.NO_RIGHT, BasicGroupMemberAction.SELF, BasicGroupMemberAction.CREATOR,
            BasicGroupMemberAction.OUTSIDE, BasicGroupMemberAction.NO_RESTRICT, BasicGroupMemberAction.NO_PROMOTE,
            BasicGroupMemberAction.NO_DURATION, BasicGroupMemberAction.REVOKE_ON, BasicGroupMemberAction.REVOKE_OFF,
            BasicGroupMemberAction.SCOPE, BasicGroupMemberAction.UNBAN_HINT};
        java.util.Set<String> unique = new java.util.HashSet<>();
        for (String phrase : phrases) {
            assertNotNull(phrase);
            assertFalse(phrase.isEmpty());
            assertTrue("frase repetida: " + phrase, unique.add(phrase));
            assertNotEquals(MemberAdditions.NO_RIGHT, phrase);
            assertNotEquals(MemberAdditions.OUTSIDE, phrase);
        }
    }
}
