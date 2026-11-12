package cc.webrom.wrgram;

import android.graphics.Bitmap;
import android.graphics.Color;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;

/** Renders Telegram's short-lived login URI locally; the raw URI is never sent to JavaScript or logs. */
final class QrCodeImage {
    private QrCodeImage(){}
    static String dataUri(String value)throws Exception{
        if(value==null||!value.startsWith("tg://login?")||value.length()>2048)throw new IllegalArgumentException("Unexpected QR login link");
        Map<EncodeHintType,Object> hints=new EnumMap<>(EncodeHintType.class);hints.put(EncodeHintType.MARGIN,2);hints.put(EncodeHintType.CHARACTER_SET,"UTF-8");
        BitMatrix matrix=new MultiFormatWriter().encode(value,BarcodeFormat.QR_CODE,360,360,hints);Bitmap bitmap=Bitmap.createBitmap(360,360,Bitmap.Config.ARGB_8888);
        try{for(int y=0;y<360;y++)for(int x=0;x<360;x++)bitmap.setPixel(x,y,matrix.get(x,y)?Color.BLACK:Color.WHITE);ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes))throw new IllegalStateException("QR PNG encoding failed");return "data:image/png;base64,"+android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP);}finally{bitmap.recycle();}
    }
}
