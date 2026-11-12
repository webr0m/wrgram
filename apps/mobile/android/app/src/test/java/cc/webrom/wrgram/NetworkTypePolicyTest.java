package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class NetworkTypePolicyTest {
    @Test public void noActiveInternetIsReportedAsOffline(){
        assertTrue(TdSession.networkType(false,false,false,false) instanceof TdApi.NetworkTypeNone);
        assertTrue(TdSession.networkType(true,false,true,false) instanceof TdApi.NetworkTypeNone);
    }

    @Test public void reportsWifiCellularAndOtherInternetTransports(){
        assertTrue(TdSession.networkType(true,true,true,false) instanceof TdApi.NetworkTypeWiFi);
        assertTrue(TdSession.networkType(true,true,false,true) instanceof TdApi.NetworkTypeMobile);
        assertTrue(TdSession.networkType(true,true,false,false) instanceof TdApi.NetworkTypeOther);
    }
}
