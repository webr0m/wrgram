package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Los formularios de Business solo cruzan el puente con valores que Telegram acepta. */
public class BusinessPolicyTest {
    private static JSONObject params(String key,Object value)throws Exception{
        JSONObject params=new JSONObject();
        params.put(key,value);
        return params;
    }
    @Test
    public void shortcutNamesAreTrimmedAndBounded()throws Exception{
        assertEquals("Ventas",BusinessPolicy.name(params("name","  Ventas  "),"name"));
        assertEquals(32,BusinessPolicy.name(params("name","a".repeat(32)),"name").length());
        try{BusinessPolicy.name(params("name","   "),"name");fail("El nombre vacío debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{BusinessPolicy.name(params("name","a".repeat(33)),"name");fail("El nombre largo debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void inactivityDaysOnlyAcceptTelegramChoices()throws Exception{
        assertEquals(7,BusinessPolicy.inactivityDays(params("inactivityDays",7)));
        assertEquals(28,BusinessPolicy.inactivityDays(params("inactivityDays",28)));
        for(int wrong:new int[]{0,1,6,30})try{BusinessPolicy.inactivityDays(params("inactivityDays",wrong));fail("Día "+wrong+" debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void recipientsMapTheFourSelectors()throws Exception{
        JSONObject value=new JSONObject().put("existing",true).put("newChats",false).put("contacts",true).put("nonContacts",false);
        TdApi.BusinessRecipients recipients=BusinessPolicy.recipients(params("recipients",value),"recipients");
        assertTrue(recipients.selectExistingChats);
        assertTrue(recipients.selectContacts);
        assertFalse(recipients.selectNewChats);
        assertFalse(recipients.selectNonContacts);
        TdApi.BusinessRecipients empty=BusinessPolicy.recipients(new JSONObject(),"recipients");
        assertFalse(empty.selectExistingChats||empty.selectNewChats||empty.selectContacts||empty.selectNonContacts);
    }
    @Test
    public void awaySchedulesAcceptAlwaysOutsideAndBoundedCustom()throws Exception{
        assertTrue(BusinessPolicy.schedule(new JSONObject()) instanceof TdApi.BusinessAwayMessageScheduleAlways);
        JSONObject outside=params("schedule","outside");
        assertTrue(BusinessPolicy.schedule(outside) instanceof TdApi.BusinessAwayMessageScheduleOutsideOfOpeningHours);
        JSONObject custom=new JSONObject().put("schedule","custom").put("startDate",1000).put("endDate",2000);
        TdApi.BusinessAwayMessageSchedule value=BusinessPolicy.schedule(custom);
        assertTrue(value instanceof TdApi.BusinessAwayMessageScheduleCustom);
        assertEquals(1000,((TdApi.BusinessAwayMessageScheduleCustom)value).startDate);
        JSONObject inverted=new JSONObject().put("schedule","custom").put("startDate",2000).put("endDate",2000);
        try{BusinessPolicy.schedule(inverted);fail("El periodo invertido debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void openingHoursValidateWeeklyMinutes()throws Exception{
        JSONArray intervals=new JSONArray()
            .put(new JSONObject().put("startMinute",0).put("endMinute",600))
            .put(new JSONObject().put("startMinute",1440+480).put("endMinute",2*1440+60));
        TdApi.BusinessOpeningHoursInterval[] result=BusinessPolicy.intervals(params("intervals",intervals),"intervals");
        assertEquals(2,result.length);
        assertEquals(1920,result[1].startMinute);
        JSONArray inverted=new JSONArray().put(new JSONObject().put("startMinute",600).put("endMinute",600));
        try{BusinessPolicy.intervals(params("intervals",inverted),"intervals");fail("El tramo vacío debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        JSONArray beyondWeek=new JSONArray().put(new JSONObject().put("startMinute",0).put("endMinute",10081));
        try{BusinessPolicy.intervals(params("intervals",beyondWeek),"intervals");fail("El fin fuera de la semana debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void botRightsBuildAllFourteenFlags()throws Exception{
        JSONObject value=new JSONObject().put("canReply",true).put("canReadMessages",true);
        TdApi.BusinessBotRights rights=BusinessPolicy.botRights(params("rights",value),"rights");
        assertTrue(rights.canReply);
        assertTrue(rights.canReadMessages);
        assertFalse(rights.canDeleteAllMessages);
        assertEquals(14,BusinessPolicy.rightKeys().length);
    }
}
