package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ReportPolicyTest {
    @Test public void distinguishesAllChatReportSteps() {
        assertEquals("done",ReportPolicy.step(new TdApi.ReportChatResultOk()));
        assertEquals("messages",ReportPolicy.step(new TdApi.ReportChatResultMessagesRequired()));
        assertEquals("text",ReportPolicy.step(new TdApi.ReportChatResultTextRequired(new byte[]{3},true)));
        assertEquals("options",ReportPolicy.step(new TdApi.ReportChatResultOptionRequired("Motivo",new TdApi.ReportOption[]{new TdApi.ReportOption(new byte[]{1},"Motivo del servidor")})));
    }
    @Test public void rejectsMissingAndMalformedReportChoices() {
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(null));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(new TdApi.ReportChatResultOptionRequired("Motivo",new TdApi.ReportOption[0])));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(new TdApi.ReportChatResultOptionRequired("Motivo",new TdApi.ReportOption[]{new TdApi.ReportOption(null,"Texto")})));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(new TdApi.ReportChatResultTextRequired(null,false)));
    }
    @Test public void boundsServerOptionsAndOpaqueIdentifierSizes() {
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(new TdApi.ReportChatResultOptionRequired("Motivo",new TdApi.ReportOption[101])));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.step(new TdApi.ReportChatResultTextRequired(new byte[4097],false)));
    }
    @Test public void sponsoredHidingReportingAndFailureAreDifferentResults() {
        assertEquals("reported",ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultOk()));
        assertEquals("hidden",ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultAdsHidden()));
        assertEquals("premium",ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultPremiumRequired()));
        assertEquals("failed",ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultFailed()));
    }
    @Test public void sponsoredOptionsAreExactlyThoseSuppliedByTelegram() {
        assertEquals("options",ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultOptionRequired("Opciones",new TdApi.ReportOption[]{new TdApi.ReportOption(new byte[]{7,8},"Opción remota")})));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.sponsoredStep(new TdApi.ReportSponsoredResultOptionRequired("Opciones",null)));
        assertThrows(IllegalArgumentException.class,()->ReportPolicy.sponsoredStep(null));
    }
}
