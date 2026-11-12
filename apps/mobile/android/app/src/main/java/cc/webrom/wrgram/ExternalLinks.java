package cc.webrom.wrgram;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;

final class ExternalLinks {
    static void open(Activity activity,String url,Runnable opened,Runnable cancelled){
        String origin=MiniAppPolicy.origin(url);
        Dialogs.builder(activity).setTitle("Abrir enlace externo").setMessage("Se abrirá "+origin+" fuera de WRGram. No se comparte tu historial de chats.").setNegativeButton("Cancelar",(dialog,which)->cancelled.run()).setPositiveButton("Abrir",(dialog,which)->{try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));opened.run();}catch(RuntimeException ignored){Dialogs.builder(activity).setMessage("No hay una aplicación disponible para abrir este enlace.").setPositiveButton("Aceptar",null).show();cancelled.run();}}).setOnCancelListener(dialog->cancelled.run()).show();
    }
}
