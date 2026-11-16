package cc.webrom.wrgram;

import android.app.AlertDialog;
import android.app.Activity;
import android.os.SystemClock;
import android.text.InputFilter;
import android.widget.EditText;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;

/** Server-driven report wizard. Opaque option IDs never cross the WebView bridge. */
final class ChatReportFlow {
    private final Activity context;
    private final TdSession session;
    private final long chatId;
    private final BooleanSupplier current;
    private final Consumer<Boolean> completed;
    private final Consumer<String> failed;
    private final long started=SystemClock.elapsedRealtime();
    private long[] messageIds;
    private byte[] optionId=new byte[0];
    private String details="";
    private boolean finished,busy;
    private int steps;

    ChatReportFlow(Activity context,TdSession session,long chatId,long[] messageIds,BooleanSupplier current,Consumer<Boolean> completed,Consumer<String> failed) {
        this.context=context;this.session=session;this.chatId=chatId;this.messageIds=messageIds.clone();
        this.current=current;this.completed=completed;this.failed=failed;
    }
    private boolean alive() {
        if(finished)return false;
        if(!current.getAsBoolean()||SystemClock.elapsedRealtime()-started>280_000){fail("La cuenta cambió o la denuncia caducó. No continúes sin revisar su estado.");return false;}
        return true;
    }
    private void cancel(){if(!finished){finished=true;completed.accept(false);}}
    private void fail(String message){if(!finished){finished=true;failed.accept(message);}}
    private <T extends TdApi.Object>void perform(TdApi.Function<T> request,Consumer<T> next) {
        if(!alive()||busy)return;
        busy=true;
        session.perform(request,value->{busy=false;if(alive())try{next.accept(value);}catch(Exception invalid){fail("Telegram devolvió un paso de denuncia no compatible.");}},error->{busy=false;fail(error);});
    }
    void start() {
        perform(new TdApi.GetChat(chatId),chat->{
            if(chat.type instanceof TdApi.ChatTypeSecret){fail("Los chats secretos no se denuncian desde este flujo.");return;}
            Runnable review=()->Dialogs.builder(context).setTitle(messageIds.length==0?"Denunciar chat":"Denunciar mensaje")
                .setMessage("Se enviará una denuncia de «"+NativeSnapshot.limit(chat.title,100)+"» a los moderadores de Telegram. Telegram solicitará el motivo, detalles o mensajes. Elegir un motivo puede completar la denuncia. No se bloquea a nadie ni se borra contenido automáticamente.")
                .setNegativeButton("Cancelar",(dialog,which)->cancel()).setPositiveButton("Continuar con la denuncia",(dialog,which)->send())
                .setOnCancelListener(dialog->cancel()).show();
            if(messageIds.length==0){if(!chat.canBeReported){fail("Telegram no permite denunciar este chat desde aquí.");return;}review.run();}
            else validateMessages(0,review);
        });
    }
    private void validateMessages(int index,Runnable next) {
        if(!alive())return;
        if(index>=messageIds.length){next.run();return;}
        perform(new TdApi.GetMessageProperties(chatId,messageIds[index]),properties->{
            if(!properties.canReportChat){fail("Uno de los mensajes ya no se puede denunciar. Vuelve a seleccionarlo.");return;}
            validateMessages(index+1,next);
        });
    }
    private void send() {
        if(!alive()||busy)return;
        if(++steps>20){fail("La denuncia requiere demasiados pasos. Revisa su estado antes de repetirla.");return;}
        perform(new TdApi.ReportChat(chatId,optionId.clone(),messageIds.clone(),details),this::handle);
    }
    private void handle(TdApi.ReportChatResult result) {
        switch(ReportPolicy.step(result)){
            case "done":finished=true;completed.accept(true);return;
            case "options":{
                TdApi.ReportChatResultOptionRequired step=(TdApi.ReportChatResultOptionRequired)result;
                String[] labels=Arrays.stream(step.options).map(option->option.text).toArray(String[]::new);
                Dialogs.builder(context).setTitle(step.title).setItems(labels,(dialog,index)->{
                    if(!alive())return;
                    optionId=step.options[index].id.clone();send();
                }).setNegativeButton("Cancelar",(dialog,which)->cancel()).setOnCancelListener(dialog->cancel()).show();return;
            }
            case "text":{
                TdApi.ReportChatResultTextRequired step=(TdApi.ReportChatResultTextRequired)result;
                optionId=step.optionId.clone();
                EditText input=new EditText(context);input.setHint(step.isOptional?"Detalles (opcional)":"Detalles de la denuncia");
                input.setMinLines(3);input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1024)});
                AlertDialog dialog=Dialogs.builder(context).setTitle("Detalles para Telegram").setView(input)
                    .setNegativeButton("Cancelar",(box,which)->cancel()).setPositiveButton("Enviar denuncia",null).setOnCancelListener(box->cancel()).create();
                dialog.show();dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
                    String text=input.getText().toString().trim();
                    if(!step.isOptional&&text.isEmpty()){input.setError("Telegram solicita detalles.");return;}
                    if(!alive())return;
                    details=text;dialog.dismiss();send();
                });return;
            }
            case "messages":chooseMessages();return;
            default:fail("Este paso de denuncia no está disponible.");
        }
    }
    private void chooseMessages() {
        if(!alive())return;
        if(session.activeChat!=chatId){fail("Abre la conversación y elige un mensaje para denunciarlo.");return;}
        ArrayList<TdApi.Message> candidates=new ArrayList<>();
        for(TdApi.Message message:session.history())if(message.chatId==chatId&&message.sendingState==null&&message.schedulingState==null&&!MessageExtras.temporary(message))candidates.add(message);
        if(candidates.isEmpty()){fail("No hay mensajes cargados para seleccionar. Abre el chat y vuelve a intentarlo.");return;}
        if(candidates.size()>50)candidates=new ArrayList<>(candidates.subList(candidates.size()-50,candidates.size()));
        final ArrayList<TdApi.Message> items=candidates;
        String[] labels=items.stream().map(message->NativeSnapshot.limit(session.senderName(message.senderId)+": "+TdSession.text(message,session),140)).toArray(String[]::new);
        boolean[] selected=new boolean[items.size()];
        AlertDialog dialog=Dialogs.builder(context).setTitle("Mensajes para denunciar · hasta 20")
            .setMultiChoiceItems(labels,selected,(box,index,checked)->selected[index]=checked)
            .setNegativeButton("Cancelar",(box,which)->cancel()).setPositiveButton("Denunciar seleccionados",null).setOnCancelListener(box->cancel()).create();
        dialog.show();dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            if(!alive())return;
            ArrayList<Long> chosen=new ArrayList<>();for(int i=0;i<selected.length;i++)if(selected[i])chosen.add(items.get(i).id);
            if(chosen.isEmpty()||chosen.size()>20){android.widget.Toast.makeText(context,"Elige entre 1 y 20 mensajes.",android.widget.Toast.LENGTH_SHORT).show();return;}
            messageIds=chosen.stream().mapToLong(Long::longValue).toArray();dialog.dismiss();validateMessages(0,this::send);
        });
    }
}
