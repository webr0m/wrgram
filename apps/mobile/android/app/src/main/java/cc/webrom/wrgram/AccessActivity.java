package cc.webrom.wrgram;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import androidx.fragment.app.FragmentActivity;

/** Guards both UI paths, including fallback, upgrades, resume and expiry. */
abstract class AccessActivity extends FragmentActivity implements Dialogs.Host {
    private final Handler accessTimer = new Handler(Looper.getMainLooper());
    private final DialogTracker dialogs = new DialogTracker();
    private final Runnable expired = () -> { if(handlesAccessGate()){onAccessGateRefresh();scheduleExpiry();}else requireAccess(); };
    private boolean redirecting;
    boolean handlesAccessGate(){return false;}
    void onAccessGateRefresh(){}
    private void scheduleExpiry(){AgePolicy.Receipt receipt=((WrgramApplication)getApplication()).ageAccess().receipt();if(receipt!=null&&receipt.expiresAt()>System.currentTimeMillis())accessTimer.postDelayed(expired,receipt.expiresAt()-System.currentTimeMillis());}
    final boolean requireAccess() {
        WrgramApplication app = (WrgramApplication) getApplication();
        if (!redirecting && app.ageAccess().allowed()) return true;
        if(!redirecting&&handlesAccessGate())return true;
        if (!redirecting) {
            redirecting = true; for(TdSession session:app.accounts())session.pauseForAgeGate();app.assistant().clear();MiniAppLaunch.clear();
            Class<?> destination=ShellActivity.canHostBundledUi(this)?ShellActivity.class:AgeGateActivity.class;
            startActivity(new Intent(this, destination).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK)); finish();
        }
        return false;
    }
    @Override protected void onResume() {
        super.onResume();
        accessTimer.removeCallbacks(expired);WrgramApplication app=(WrgramApplication)getApplication();
        if(app.ageAccess().allowed()||handlesAccessGate())scheduleExpiry();else requireAccess();
    }
    @Override protected void onPause() { accessTimer.removeCallbacks(expired); super.onPause(); }
    @Override public void trackDialog(android.app.Dialog dialog) { dialogs.trackDialog(dialog); }
    @Override protected void onDestroy() { dialogs.closeAll(); accessTimer.removeCallbacksAndMessages(null); super.onDestroy(); }
}
