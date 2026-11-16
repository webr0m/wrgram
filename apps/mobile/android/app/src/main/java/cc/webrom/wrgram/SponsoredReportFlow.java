package cc.webrom.wrgram;

import android.app.Activity;
import android.os.SystemClock;
import java.util.Arrays;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;

final class SponsoredReportFlow {
    private final Activity activity;
    private final TdSession session;
    private final long chatId,messageId;
    private final BooleanSupplier current;
    private final Consumer<String> completed,failed;
    private final long started=SystemClock.elapsedRealtime();
    private boolean finished,busy;
    private int steps;
    SponsoredReportFlow(Activity activity,TdSession session,long chatId,long messageId,BooleanSupplier current,Consumer<String> completed,Consumer<String> failed) {
        this.activity=activity;this.session=session;this.chatId=chatId;this.messageId=messageId;this.current=current;this.completed=completed;this.failed=failed;
    }
    private void finish(String action){if(!finished){finished=true;completed.accept(action);}}
    private void fail(String error){if(!finished){finished=true;failed.accept(error);}}
    private boolean alive(){if(finished)return false;if(!current.getAsBoolean()||SystemClock.elapsedRealtime()-started>280_000){fail("La cuenta o el chat cambió, o el anuncio caducó. No se continuará.");return false;}return true;}
    void start(){
        if(!alive())return;
        Dialogs.builder(activity).setTitle("Opciones del anuncio de Telegram")
            .setMessage("Telegram mostrará los motivos de denuncia y las opciones que admita tu cuenta. Elegir una opción puede enviarla inmediatamente. Ocultar todos los patrocinados requiere Premium; WRGram no activa ni cobra la suscripción.")
            .setNegativeButton("Cancelar",(dialog,which)->finish("cancel"))
            .setPositiveButton("Consultar opciones",(dialog,which)->send(new byte[0]))
            .setOnCancelListener(dialog->finish("cancel")).show();
    }
    private void send(byte[] optionId){
        if(!alive()||busy)return;
        if(++steps>20){fail("La operación requiere demasiados pasos. Comprueba su estado antes de repetirla.");return;}
        busy=true;
        session.perform(new TdApi.ReportChatSponsoredMessage(chatId,messageId,optionId.clone()),result->{
            busy=false;if(!alive())return;
            try{
                switch(ReportPolicy.sponsoredStep(result)){
                    case "reported":finish("reported");return;
                    case "hidden":finish("hidden");return;
                    case "premium":fail("Telegram requiere Premium para ocultar todos los mensajes patrocinados.");return;
                    case "failed":fail("Telegram no pudo tramitar la solicitud. El anuncio puede haber caducado.");return;
                    case "options":{
                        TdApi.ReportSponsoredResultOptionRequired step=(TdApi.ReportSponsoredResultOptionRequired)result;
                        String[] labels=Arrays.stream(step.options).map(option->option.text).toArray(String[]::new);
                        Dialogs.builder(activity).setTitle(step.title).setItems(labels,(dialog,index)->send(step.options[index].id))
                            .setNegativeButton("Cancelar",(dialog,which)->finish("cancel")).setOnCancelListener(dialog->finish("cancel")).show();return;
                    }
                    default:fail("Esta opción del anuncio no está disponible.");
                }
            }catch(Exception invalid){fail("Telegram devolvió opciones del anuncio no compatibles.");}
        },error->{busy=false;fail(error);});
    }
}
