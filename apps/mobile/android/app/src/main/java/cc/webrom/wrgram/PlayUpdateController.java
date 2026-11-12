package cc.webrom.wrgram;

import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import org.json.JSONObject;

/** Checks the signed-in Play installation through Play Core; Play's release notes remain authoritative in Play. */
final class PlayUpdateController implements InstallStateUpdatedListener {
    private static final long CHECK_INTERVAL_MS=6L*60*60*1000;
    private static final String LISTING="https://play.google.com/store/apps/details?id=cc.webrom.wrgram";
    private final ShellActivity activity;
    private final ActivityResultLauncher<IntentSenderRequest> flow;
    private final AppUpdateManager manager;
    private boolean checking,available,downloaded;
    private boolean starting;
    private boolean resumeAllowed=true;
    private int installStatus=InstallStatus.UNKNOWN;
    private long bytesDownloaded,totalBytes;
    private int availableCode,priority;
    private String error="";
    private long checkedAt;
    PlayUpdateController(ShellActivity activity,ActivityResultLauncher<IntentSenderRequest> flow){this.activity=activity;this.flow=flow;manager=AppUpdateManagerFactory.create(activity);manager.registerListener(this);}
    void check(boolean force){if(BuildConfig.DEBUG)return;if(checking||!force&&checkedAt>0&&SystemClock.elapsedRealtime()-checkedAt<CHECK_INTERVAL_MS)return;checking=true;error="";activity.updateChanged();manager.getAppUpdateInfo().addOnSuccessListener(info->{checking=false;checkedAt=SystemClock.elapsedRealtime();apply(info);activity.updateChanged();}).addOnFailureListener(failure->{checking=false;available=false;downloaded=false;error="Play Store no pudo consultar esta instalación. Comprueba la conexión y que WRGram esté instalado desde Play.";activity.updateChanged();});}
    private void apply(AppUpdateInfo info){int status=info.updateAvailability();installStatus=info.installStatus();available=status==UpdateAvailability.UPDATE_AVAILABLE||status==UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS||installStatus==InstallStatus.DOWNLOADED;availableCode=available?info.availableVersionCode():0;priority=available?info.updatePriority():0;downloaded=installStatus==InstallStatus.DOWNLOADED;bytesDownloaded=info.bytesDownloaded();totalBytes=info.totalBytesToDownload();}
    JSONObject status()throws Exception{return new JSONObject().put("supported",!BuildConfig.DEBUG).put("checking",checking).put("available",available).put("downloaded",downloaded).put("starting",starting).put("downloading",installStatus==InstallStatus.DOWNLOADING||installStatus==InstallStatus.PENDING).put("installing",installStatus==InstallStatus.INSTALLING).put("bytesDownloaded",bytesDownloaded).put("totalBytes",totalBytes).put("currentVersionCode",BuildConfig.VERSION_CODE).put("availableVersionCode",availableCode).put("priority",priority).put("error",error);}
    void start(){
        if(starting||installStatus==InstallStatus.DOWNLOADING||installStatus==InstallStatus.PENDING||installStatus==InstallStatus.INSTALLING)return;
        if(BuildConfig.DEBUG){error="Las actualizaciones en la app solo se consultan con instalaciones de Google Play.";activity.updateChanged();return;}
        starting=true;resumeAllowed=true;error="";activity.updateChanged();
        manager.getAppUpdateInfo().addOnSuccessListener(info->{
            apply(info);if(downloaded){starting=false;activity.updateChanged();return;}
            int availability=info.updateAvailability();
            if(availability!=UpdateAvailability.UPDATE_AVAILABLE&&availability!=UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS){starting=false;error="No hay una versión publicada disponible para esta cuenta de Play. Los borradores no se distribuyen.";activity.updateChanged();return;}
            AppUpdateOptions flexible=AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build();
            AppUpdateOptions immediate=AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build();
            AppUpdateOptions selected=availability==UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS&&info.isUpdateTypeAllowed(immediate)?immediate:info.isUpdateTypeAllowed(flexible)?flexible:info.isUpdateTypeAllowed(immediate)?immediate:null;
            if(selected==null){starting=false;error="Play Store no permite iniciar ahora la actualización.";activity.updateChanged();return;}
            try{if(!manager.startUpdateFlowForResult(info,flow,selected)){starting=false;error="No se pudo iniciar la actualización de Play.";}}catch(Exception failure){starting=false;error="No se pudo iniciar la actualización de Play.";}activity.updateChanged();
        }).addOnFailureListener(failure->{starting=false;error="Play Store no pudo consultar la actualización.";activity.updateChanged();});
    }
    void complete(){if(!downloaded){error="La actualización todavía no terminó de descargarse.";activity.updateChanged();return;}manager.completeUpdate().addOnFailureListener(failure->{error="No se pudo instalar la actualización. Inténtalo desde Google Play.";activity.updateChanged();});}
    void openPlayStore(){try{Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("market://details?id=cc.webrom.wrgram"));intent.setPackage("com.android.vending");if(intent.resolveActivity(activity.getPackageManager())==null){intent.setPackage(null);intent.setData(Uri.parse(LISTING));}activity.startActivity(intent);}catch(Exception ignored){try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(LISTING)));}catch(Exception alsoIgnored){error="No se pudo abrir Google Play.";activity.updateChanged();}}}
    void result(int resultCode){starting=false;if(resultCode==android.app.Activity.RESULT_CANCELED){resumeAllowed=false;error="Actualización cancelada. Puedes volver a intentarlo.";}else if(resultCode!=android.app.Activity.RESULT_OK){resumeAllowed=false;error="Google Play no pudo iniciar la actualización. Inténtalo desde su ficha.";}activity.updateChanged();resume();}
    void resume(){if(BuildConfig.DEBUG)return;manager.getAppUpdateInfo().addOnSuccessListener(info->{apply(info);if(resumeAllowed&&info.updateAvailability()==UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS&&!starting){starting=true;try{if(!manager.startUpdateFlowForResult(info,flow,AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()))starting=false;}catch(Exception failure){starting=false;error="No se pudo reanudar la actualización de Play.";}}activity.updateChanged();}).addOnFailureListener(ignored->{});}
    void close(){manager.unregisterListener(this);}
    @Override public void onStateUpdate(InstallState state){installStatus=state.installStatus();bytesDownloaded=state.bytesDownloaded();totalBytes=state.totalBytesToDownload();downloaded=installStatus==InstallStatus.DOWNLOADED;if(downloaded)available=true;if(installStatus==InstallStatus.FAILED){starting=false;error="Play Store no pudo descargar la actualización ("+state.installErrorCode()+"). Reintenta o abre Google Play.";}else if(installStatus==InstallStatus.CANCELED){starting=false;error="Descarga cancelada. Puedes volver a intentarlo.";}else error="";activity.updateChanged();}
}
