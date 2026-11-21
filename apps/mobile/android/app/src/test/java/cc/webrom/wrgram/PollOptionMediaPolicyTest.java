package cc.webrom.wrgram;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/**
 * El tamaño de la foto que la pantalla pinta en cada opción de una encuesta con imágenes (ronda CN). Se prueba aquí
 * porque lo que se decide no es un dibujo: es qué le manda TDLib a la interfaz. Un tamaño de 0 píxeles es el que
 * Telegram todavía no descargó, y uno de más de 1280 es el que la burbuja no puede mostrar sin recortarlo.
 */
public class PollOptionMediaPolicyTest {
    private static TdApi.PhotoSize size(int width) {
        TdApi.PhotoSize value = new TdApi.PhotoSize();
        value.type = "m";
        value.photo = new TdApi.File();
        value.width = width;
        value.height = width;
        return value;
    }

    private static TdApi.Photo photo(TdApi.PhotoSize... sizes) {
        TdApi.Photo value = new TdApi.Photo();
        value.sizes = sizes;
        return value;
    }

    @Test
    public void theWidestSizeThatStillFitsTheBubbleIsTheOnePainted() {
        // Se compara por identidad: `TdApi.Object.toString()` es nativo, y un `assertEquals` fallido intentaría
        // imprimir el tamaño en una JVM que no tiene la biblioteca cargada.
        TdApi.PhotoSize wide = size(1280);
        TdApi.Photo value = photo(size(90), size(320), wide, size(1600));
        assertSame(wide, NativeSnapshot.pollPhotoSize(value));
    }

    @Test
    public void aSizeWithoutWidthIsAPhotoTelegramHasNotMeasuredYet() {
        assertNull(NativeSnapshot.pollPhotoSize(photo(size(0), new TdApi.PhotoSize())));
    }

    @Test
    public void aPhotoBiggerThanTheBubbleIsNotPaintedAndADeletedOneIsNotEither() {
        assertNull(NativeSnapshot.pollPhotoSize(photo(size(2500))));
        TdApi.PhotoSize hollow = size(400);
        hollow.photo = null;
        assertNull(NativeSnapshot.pollPhotoSize(photo(hollow)));
    }

    @Test
    public void aPhotoWithoutAnySizeListStillReachesTheRule() {
        assertNull(NativeSnapshot.pollPhotoSize(new TdApi.Photo()));
        assertNull(NativeSnapshot.pollPhotoSize(null));
    }
}
