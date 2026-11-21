package cc.webrom.wrgram;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** La ubicación en directo solo cruza el puente con los periodos y los refrescos que TDLib admite. */
public class LiveLocationPolicyTest {
    private static JSONObject params(String key,Object value)throws Exception{
        JSONObject params=new JSONObject();
        params.put(key,value);
        return params;
    }
    @Test
    public void periodsMatchTheLibraryBounds(){
        assertTrue(LiveLocationPolicy.validPeriod(60));
        assertTrue(LiveLocationPolicy.validPeriod(86400));
        assertTrue(LiveLocationPolicy.validPeriod(LiveLocationPolicy.PERMANENT));
        assertFalse(LiveLocationPolicy.validPeriod(59));
        assertFalse(LiveLocationPolicy.validPeriod(86401));
        assertFalse(LiveLocationPolicy.validPeriod(0));
        assertFalse(LiveLocationPolicy.validPeriod(-1));
    }
    @Test
    public void periodReadsTheRequestedDurationAndRefusesAnythingElse()throws Exception{
        assertEquals(3600,LiveLocationPolicy.period(params("period",3600)));
        assertEquals(LiveLocationPolicy.PERMANENT,LiveLocationPolicy.period(params("period",LiveLocationPolicy.PERMANENT)));
        try{LiveLocationPolicy.period(params("period",30));fail("Un periodo fuera de la cota debe rechazarse.");}
        catch(IllegalArgumentException expected){assertEquals(LiveLocationPolicy.BAD_PERIOD,expected.getMessage());}
        try{LiveLocationPolicy.period(new JSONObject());fail("El periodo obligatorio debe rechazarse cuando falta.");}
        catch(IllegalArgumentException expected){assertEquals(LiveLocationPolicy.BAD_PERIOD,expected.getMessage());}
    }
    @Test
    public void durationsOfferedInTheComposerAreAllAdmissible(){
        assertEquals(4,LiveLocationPolicy.DURATIONS.length);
        for(int period:LiveLocationPolicy.DURATIONS)assertTrue("La pantalla ofrece "+period,LiveLocationPolicy.validPeriod(period));
        assertEquals(900,LiveLocationPolicy.DURATIONS[0]);
        assertEquals(86400,LiveLocationPolicy.DURATIONS[LiveLocationPolicy.DURATIONS.length-1]);
    }
    @Test
    public void headingIsZeroWhenTheSensorDoesNotKnowIt(){
        assertEquals(0,LiveLocationPolicy.heading(false,137f));
        assertEquals(0,LiveLocationPolicy.heading(true,0f));
        assertEquals(0,LiveLocationPolicy.heading(true,-10f));
        assertEquals(90,LiveLocationPolicy.heading(true,89.6f));
        assertEquals(360,LiveLocationPolicy.heading(true,360f));
        assertEquals(360,LiveLocationPolicy.heading(true,361f));
    }
    @Test
    public void expiryUsesTheSendingDateAndPermanentHasNoCountdown(){
        assertEquals(1_000L+3_600L,LiveLocationPolicy.expiresAt(1_000L,3_600));
        assertEquals(0L,LiveLocationPolicy.expiresAt(1_000L,LiveLocationPolicy.PERMANENT));
        assertEquals(0L,LiveLocationPolicy.expiresAt(1_000L,0));
    }
    @Test
    public void remainingTimeNeverGoesNegative(){
        assertEquals(40_000L,LiveLocationPolicy.remainingMs(70_000L,50_000L,60));
        assertEquals(0L,LiveLocationPolicy.remainingMs(200_000L,50_000L,60));
        assertEquals(Long.MAX_VALUE,LiveLocationPolicy.remainingMs(200_000L,50_000L,LiveLocationPolicy.PERMANENT));
    }
    @Test
    public void refreshWaitsSixSecondsUnlessThePersonMoved(){
        assertFalse(LiveLocationPolicy.shouldPush(50_000L,47_000L,3f));
        assertTrue(LiveLocationPolicy.shouldPush(56_000L,50_000L,0f));
        assertTrue(LiveLocationPolicy.shouldPush(51_000L,50_000L,LiveLocationPolicy.PUSH_MIN_METERS));
        assertTrue(LiveLocationPolicy.shouldPush(51_000L,50_000L,Float.MAX_VALUE));
        assertFalse(LiveLocationPolicy.shouldPush(51_000L,50_000L,LiveLocationPolicy.PUSH_MIN_METERS-0.1f));
    }
    @Test
    public void labelsAreTheOnesTheComposerShows(){
        assertEquals("1 minuto",LiveLocationPolicy.label(60));
        assertEquals("15 minutos",LiveLocationPolicy.label(900));
        assertEquals("2 minutos",LiveLocationPolicy.label(120));
        assertEquals("1 hora",LiveLocationPolicy.label(3_600));
        assertEquals("8 horas",LiveLocationPolicy.label(28_800));
        assertEquals("24 horas",LiveLocationPolicy.label(86_400));
        assertEquals("sin límite",LiveLocationPolicy.label(LiveLocationPolicy.PERMANENT));
    }
    @Test
    public void aFixOlderThanFiveMinutesIsNotSent(){
        assertEquals(5*60_000L,LiveLocationPolicy.FIX_MAX_AGE_MS);
    }
    @Test
    public void refusalsKeepTheWordsTheScreensRepeat(){
        assertEquals("Ya estás compartiendo una ubicación en directo. Detenla antes de empezar otra.",LiveLocationPolicy.ALREADY);
        assertEquals("No estás compartiendo ninguna ubicación en directo en este chat.",LiveLocationPolicy.NOT_SHARING);
        assertEquals("Elige una duración entre 1 minuto y 24 horas.",LiveLocationPolicy.BAD_PERIOD);
        assertEquals("No se concedió permiso. No se envió ninguna ubicación.",LiveLocationPolicy.NO_PERMISSION);
        assertEquals("Android no tiene una ubicación reciente. No se envió nada; inténtalo cuando haya una señal disponible.",LiveLocationPolicy.NO_FIX);
    }
}
