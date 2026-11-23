package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * El tope de subida de Telegram: 2 GB por archivo y 4 GB con Premium. TDLib no publica ese número —las 22
 * subclases de {@code PremiumLimitType} son de recuentos y longitudes—, así que la regla se escribe aquí una vez
 * y las otras dos capas la copian con sus dos orillas. Premium se lee de la cuenta ya cargada, sin ida y vuelta.
 */
final class UploadPolicy {
    static final long FREE_MAX_BYTES=2L*1024*1024*1024;
    static final long PREMIUM_MAX_BYTES=4L*1024*1024*1024;
    static final String TOO_BIG="No se pudo importar el archivo. Límite: 2 GB.";
    static final String TOO_BIG_PREMIUM="No se pudo importar el archivo. Límite: 4 GB.";
    static final String ALBUM_TOO_BIG="No se pudieron importar las fotos. Límite: 10 imágenes de 2 GB.";
    static final String ALBUM_TOO_BIG_PREMIUM="No se pudieron importar las fotos. Límite: 10 imágenes de 4 GB.";
    static final String KEYBOARD_TOO_BIG="No se pudo importar el GIF o imagen del teclado. Límite: 2 GB.";
    static final String KEYBOARD_TOO_BIG_PREMIUM="No se pudo importar el GIF o imagen del teclado. Límite: 4 GB.";
    private UploadPolicy(){}
    static long maxBytes(boolean premium){return premium?PREMIUM_MAX_BYTES:FREE_MAX_BYTES;}
    static boolean premium(TdApi.User self){return self!=null&&self.isPremium;}
    static String tooBig(boolean premium){return premium?TOO_BIG_PREMIUM:TOO_BIG;}
    static String albumTooBig(boolean premium){return premium?ALBUM_TOO_BIG_PREMIUM:ALBUM_TOO_BIG;}
    static String keyboardTooBig(boolean premium){return premium?KEYBOARD_TOO_BIG_PREMIUM:KEYBOARD_TOO_BIG;}
}