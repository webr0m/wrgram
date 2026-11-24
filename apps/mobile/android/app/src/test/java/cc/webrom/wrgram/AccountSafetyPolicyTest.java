package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class AccountSafetyPolicyTest {
    @Test public void autoDeleteUsesWholeDaysAndAllowsDisabling() throws Exception {
        for(int days:new int[]{0,1,7,30,365})assertEquals(days*86400,AccountSafetyPolicy.autoDeleteSeconds(new JSONObject().put("seconds",days*86400)));
    }
    @Test public void rejectsInvalidOrTruncatedAutoDeleteDurations() throws Exception {
        for(Object value:new Object[]{1,-86400,366L*86400,86400.5,"86400",true,Long.MAX_VALUE,JSONObject.NULL})
            assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.autoDeleteSeconds(new JSONObject().put("seconds",value)));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.autoDeleteSeconds(new JSONObject()));
    }
    @Test public void bindsActionsToTheExactAccountIdentifier() throws Exception {
        JSONObject params=new JSONObject().put("accountId","9007199254740993");
        AccountSafetyPolicy.owner(params,9007199254740993L);
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.owner(params,9007199254740992L));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.owner(new JSONObject(),42));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.owner(new JSONObject().put("accountId",42),42));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.owner(new JSONObject().put("accountId","0"),0));
    }
    @Test public void validatesRecoveryEmailWithoutEchoingItInErrors() throws Exception {
        assertEquals("ana+recuperar@example.org",AccountSafetyPolicy.recoveryEmail(new JSONObject().put("email"," ana+recuperar@example.org ")));
        for(String email:new String[]{"","ana","ana@@example.org","a b@example.org","a@example.org\nCc: x@y.z","x".repeat(255)}) {
            IllegalArgumentException error=assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.recoveryEmail(new JSONObject().put("email",email)));
            assertFalse(error.getMessage().contains("Cc:"));
        }
    }
    @Test public void requiresAnExplicitNonemptyRecoveryCode() throws Exception {
        assertEquals("123456",AccountSafetyPolicy.code(new JSONObject().put("code"," 123456 ")));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.code(new JSONObject().put("code"," ")));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.code(new JSONObject().put("code","1".repeat(65))));
    }
    @Test public void nonPremiumCannotBePresentedAsHavingAdsDisabled() throws Exception {
        for(boolean serverEnabled:new boolean[]{false,true}) {
            JSONObject state=AccountSafetyPolicy.sponsoredSettings(false,serverEnabled);
            assertTrue(state.getBoolean("enabled"));assertFalse(state.getBoolean("canDisable"));
        }
    }
    @Test public void PremiumSettingsFollowTheServerRatherThanLocalPreferences() throws Exception {
        assertFalse(AccountSafetyPolicy.sponsoredSettings(true,false).getBoolean("enabled"));
        assertTrue(AccountSafetyPolicy.sponsoredSettings(true,true).getBoolean("enabled"));
        assertTrue(AccountSafetyPolicy.sponsoredSettings(true,false).getBoolean("canDisable"));
    }

    @Test public void thePhoneCodeIsTrimmedAndNeverStoredOrEchoed() throws Exception {
        assertEquals("123456",AccountSafetyPolicy.phoneCode(new JSONObject().put("code"," 123456 ")));
        assertEquals("A1B2C",AccountSafetyPolicy.phoneCode(new JSONObject().put("code","A1B2C")));
        IllegalArgumentException empty=assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.phoneCode(new JSONObject().put("code","   ")));
        assertTrue(empty.getMessage(),empty.getMessage().contains("teléfono"));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.phoneCode(new JSONObject().put("code","1".repeat(33))));
        assertThrows(IllegalArgumentException.class,()->AccountSafetyPolicy.phoneCode(new JSONObject()));
    }
}
