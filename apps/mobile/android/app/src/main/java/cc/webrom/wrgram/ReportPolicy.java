package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

final class ReportPolicy {
    private static void options(TdApi.ReportOption[] options) {
        if(options==null||options.length==0||options.length>100)throw new IllegalArgumentException("Opciones de denuncia no válidas.");
        for(TdApi.ReportOption option:options)if(option==null||option.id==null||option.id.length>4096||option.text==null||option.text.isBlank())throw new IllegalArgumentException("Opción de denuncia no válida.");
    }
    static String sponsoredStep(TdApi.ReportSponsoredResult result) {
        if(result instanceof TdApi.ReportSponsoredResultOk)return "reported";
        if(result instanceof TdApi.ReportSponsoredResultAdsHidden)return "hidden";
        if(result instanceof TdApi.ReportSponsoredResultPremiumRequired)return "premium";
        if(result instanceof TdApi.ReportSponsoredResultFailed)return "failed";
        if(result instanceof TdApi.ReportSponsoredResultOptionRequired){options(((TdApi.ReportSponsoredResultOptionRequired)result).options);return "options";}
        throw new IllegalArgumentException("Paso de anuncio no compatible.");
    }
    static String step(TdApi.ReportChatResult result) {
        if(result instanceof TdApi.ReportChatResultOk)return "done";
        if(result instanceof TdApi.ReportChatResultMessagesRequired)return "messages";
        if(result instanceof TdApi.ReportChatResultTextRequired){
            byte[] id=((TdApi.ReportChatResultTextRequired)result).optionId;
            if(id==null||id.length>4096)throw new IllegalArgumentException("Opción de denuncia no válida.");
            return "text";
        }
        if(result instanceof TdApi.ReportChatResultOptionRequired){
            TdApi.ReportOption[] options=((TdApi.ReportChatResultOptionRequired)result).options;
            options(options);
            return "options";
        }
        throw new IllegalArgumentException("Paso de denuncia no compatible.");
    }
}
