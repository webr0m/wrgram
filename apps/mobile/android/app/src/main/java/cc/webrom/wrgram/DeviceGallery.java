package cc.webrom.wrgram;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.UUID;

/** Bounded, local-only recent photos. The UI never receives paths or content URIs. */
final class DeviceGallery {
    private final HashMap<String,Uri> photos=new HashMap<>();
    private String batch="";
    private long owner,chat;
    static boolean full(Context context){return granted(context,Build.VERSION.SDK_INT>=33?Manifest.permission.READ_MEDIA_IMAGES:Manifest.permission.READ_EXTERNAL_STORAGE);}
    static boolean limited(Context context){return Build.VERSION.SDK_INT>=34&&granted(context,Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);}
    private static boolean granted(Context context,String permission){return ContextCompat.checkSelfPermission(context,permission)==PackageManager.PERMISSION_GRANTED;}
    static String[] permissions(){return Build.VERSION.SDK_INT>=34?new String[]{Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED}:new String[]{Build.VERSION.SDK_INT>=33?Manifest.permission.READ_MEDIA_IMAGES:Manifest.permission.READ_EXTERNAL_STORAGE};}
    synchronized void clear(){photos.clear();batch="";owner=0;chat=0;}
    synchronized Uri selected(String key,String id,long user,long target){if(!batch.equals(key)||owner!=user||chat!=target)throw new IllegalArgumentException("La galería cambió. Vuelve a abrirla.");Uri uri=photos.get(id);if(uri==null)throw new IllegalArgumentException("La foto ya no está disponible.");return uri;}
    synchronized JSONObject list(Context context,long user,long target)throws Exception {
        clear();boolean allowed=full(context),partial=limited(context);
        JSONArray items=new JSONArray();batch=UUID.randomUUID().toString();owner=user;chat=target;
        if(allowed||partial){
            Bundle query=new Bundle();query.putStringArray(android.content.ContentResolver.QUERY_ARG_SORT_COLUMNS,new String[]{MediaStore.Images.Media.DATE_ADDED,MediaStore.Images.Media._ID});query.putInt(android.content.ContentResolver.QUERY_ARG_SORT_DIRECTION,android.content.ContentResolver.QUERY_SORT_DIRECTION_DESCENDING);query.putInt(android.content.ContentResolver.QUERY_ARG_LIMIT,36);
            try(Cursor cursor=context.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,new String[]{MediaStore.Images.Media._ID,MediaStore.Images.Media.DISPLAY_NAME},query,null)){
                int scanned=0;while(cursor!=null&&scanned++<36&&cursor.moveToNext()){
                    Uri uri=ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,cursor.getLong(0));Bitmap thumbnail=null;
                    try{
                        if(Build.VERSION.SDK_INT>=29)thumbnail=context.getContentResolver().loadThumbnail(uri,new android.util.Size(160,160),null);
                        else thumbnail=MediaStore.Images.Thumbnails.getThumbnail(context.getContentResolver(),cursor.getLong(0),MediaStore.Images.Thumbnails.MICRO_KIND,null);
                        if(thumbnail==null)continue;
                        ByteArrayOutputStream bytes=new ByteArrayOutputStream();thumbnail.compress(Bitmap.CompressFormat.JPEG,65,bytes);
                        String id=UUID.randomUUID().toString();photos.put(id,uri);
                        items.put(new JSONObject().put("id",id).put("name",cursor.isNull(1)?"Foto":cursor.getString(1)).put("thumbnail","data:image/jpeg;base64,"+android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP)));
                    }catch(Exception unavailable){/* Deleted or revoked photos are skipped. */}
                    finally{if(thumbnail!=null)thumbnail.recycle();}
                }
            }
        }
        return new JSONObject().put("batch",batch).put("access",allowed?"full":partial?"limited":"denied").put("items",items);
    }
}
