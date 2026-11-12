package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** Las transcripciones de Telegram llegan en cuatro formas; el DTO las aplana a pending/text/error. */
public class SpeechDtoTest {
    @Test
    public void aPendingTranscriptionCarriesItsPartialText()throws Exception{
        JSONObject value=NativeSnapshot.speechDto(new TdApi.SpeechRecognitionResultPending("Hola, ¿cómo"));
        assertEquals("pending",value.getString("state"));
        assertEquals("Hola, ¿cómo",value.getString("partial"));
    }
    @Test
    public void aFinishedTranscriptionCarriesItsText()throws Exception{
        JSONObject value=NativeSnapshot.speechDto(new TdApi.SpeechRecognitionResultText("Hola, ¿cómo estás?"));
        assertEquals("text",value.getString("state"));
        assertEquals("Hola, ¿cómo estás?",value.getString("text"));
    }
    @Test
    public void aFailedTranscriptionCarriesTheTelegramError()throws Exception{
        TdApi.SpeechRecognitionResultError failure=new TdApi.SpeechRecognitionResultError(new TdApi.Error(404,"NOT_FOUND"));
        failure.error.message="Telegram no pudo transcribir la nota.";
        JSONObject value=NativeSnapshot.speechDto(failure);
        assertEquals("error",value.getString("state"));
        assertEquals("Telegram no pudo transcribir la nota.",value.getString("error"));
    }
    @Test
    public void anErrorWithoutMessageFallsBackToAReadableNote()throws Exception{
        TdApi.SpeechRecognitionResultError failure=new TdApi.SpeechRecognitionResultError(null);
        JSONObject value=NativeSnapshot.speechDto(failure);
        assertEquals("error",value.getString("state"));
        assertEquals("Error de Telegram",value.getString("error"));
    }
    @Test
    public void anUnknownResultShapeIsReportedAsAnError()throws Exception{
        JSONObject value=NativeSnapshot.speechDto(null);
        assertEquals("error",value.getString("state"));
        assertEquals("Telegram no devolvió una transcripción válida.",value.getString("error"));
    }
    @Test
    public void longTranscriptionsAreClampedBeforeCrossingTheBridge()throws Exception{
        StringBuilder huge=new StringBuilder();
        for(int i=0;i<900;i++)huge.append("áéíóú");
        JSONObject pending=NativeSnapshot.speechDto(new TdApi.SpeechRecognitionResultPending(huge.toString()));
        assertEquals(601,pending.getString("partial").length());
        assertTrue(pending.getString("partial").endsWith("…"));
        JSONObject text=NativeSnapshot.speechDto(new TdApi.SpeechRecognitionResultText(huge.toString()));
        assertEquals(4001,text.getString("text").length());
        TdApi.SpeechRecognitionResultError failure=new TdApi.SpeechRecognitionResultError(null);
        failure.error=new TdApi.Error(500,"x".repeat(500));
        JSONObject error=NativeSnapshot.speechDto(failure);
        assertEquals(201,error.getString("error").length());
        assertTrue(error.getString("error").startsWith("x"));
        assertTrue(error.getString("error").endsWith("…"));
    }
}
