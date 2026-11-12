package cc.webrom.wrgram;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Normalizes a user-picked photo to Telegram's story dimensions, entirely on-device. */
final class StoryPhotoProcessor {
    static final class Draft {
        final File file;
        final Bitmap preview;
        Draft(File file,Bitmap preview){this.file=file;this.preview=preview;}
        void clear(){if(file!=null)file.delete();if(preview!=null&&!preview.isRecycled())preview.recycle();}
    }
    private StoryPhotoProcessor(){}

    static Draft prepare(Context context,Uri uri,File directory)throws Exception{
        String mime=context.getContentResolver().getType(uri);
        if((mime==null||!mime.startsWith("image/"))&&"file".equals(uri.getScheme())){String name=uri.getLastPathSegment();int dot=name==null?-1:name.lastIndexOf('.');String extension=dot<0?"":name.substring(dot+1).toLowerCase(java.util.Locale.ROOT);mime=extension.equals("jpg")||extension.equals("jpeg")?"image/jpeg":extension.equals("png")?"image/png":extension.equals("webp")?"image/webp":mime;}
        if(mime==null||!mime.startsWith("image/"))throw new IllegalArgumentException("Selecciona una imagen.");
        try(android.database.Cursor cursor=context.getContentResolver().query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0)&&cursor.getLong(0)>20L*1024*1024)throw new IllegalArgumentException("La imagen supera 20 MB.");
        }
        Bitmap decoded=null,oriented=null,cropped=null,scaled=null,preview=null;File output=null;
        try{
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
            try(InputStream input=context.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException("No se pudo leer la imagen.");BitmapFactory.decodeStream(input,null,bounds);}
            if(bounds.outWidth<=0||bounds.outHeight<=0||bounds.outWidth>12000||bounds.outHeight>12000)throw new IllegalArgumentException("Las dimensiones de la imagen no son válidas.");
            BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>2160)options.inSampleSize*=2;options.inPreferredConfig=Bitmap.Config.ARGB_8888;
            try(InputStream input=context.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException("No se pudo leer la imagen.");decoded=BitmapFactory.decodeStream(input,null,options);}
            if(decoded==null)throw new IllegalArgumentException("No se pudo decodificar la imagen.");
            int rotation=0;boolean flip=false;
            try(InputStream input=context.getContentResolver().openInputStream(uri)){if(input!=null){androidx.exifinterface.media.ExifInterface exif=new androidx.exifinterface.media.ExifInterface(input);int orientation=exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL);rotation=orientation==3||orientation==4?180:orientation==5||orientation==6?90:orientation==7||orientation==8?270:0;flip=orientation==2||orientation==4||orientation==5||orientation==7;}}
            Matrix matrix=new Matrix();if(rotation!=0)matrix.postRotate(rotation);if(flip)matrix.postScale(-1f,1f);oriented=rotation==0&&!flip?decoded:Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),matrix,true);
            double target=(double)1080/1920;int width=oriented.getWidth(),height=oriented.getHeight(),left=0,top=0,cropWidth=width,cropHeight=height;
            if((double)width/height>target){cropWidth=(int)Math.round(height*target);left=(width-cropWidth)/2;}else{cropHeight=(int)Math.round(width/target);top=(height-cropHeight)/2;}
            cropped=Bitmap.createBitmap(oriented,left,top,cropWidth,cropHeight);scaled=Bitmap.createScaledBitmap(cropped,1080,1920,true);
            if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("No se pudo preparar el almacenamiento local.");
            output=new File(directory,java.util.UUID.randomUUID()+".jpg");
            int quality=90;do{try(FileOutputStream stream=new FileOutputStream(output)){if(!scaled.compress(Bitmap.CompressFormat.JPEG,quality,stream))throw new IllegalStateException("No se pudo codificar la historia.");}if(output.length()<=10L*1024*1024)break;quality-=10;}while(quality>=60);
            if(output.length()>10L*1024*1024)throw new IllegalArgumentException("La foto de historia supera 10 MB tras optimizarla.");
            preview=Bitmap.createScaledBitmap(scaled,270,480,true);
            Draft result=new Draft(output,preview);output=null;preview=null;return result;
        }finally{
            if(output!=null)output.delete();
            if(decoded!=null&&!decoded.isRecycled())decoded.recycle();
            if(oriented!=null&&oriented!=decoded&&!oriented.isRecycled())oriented.recycle();
            if(cropped!=null&&cropped!=oriented&&cropped!=decoded&&!cropped.isRecycled())cropped.recycle();
            if(scaled!=null&&scaled!=cropped&&scaled!=oriented&&scaled!=decoded&&!scaled.isRecycled())scaled.recycle();
            if(preview!=null&&!preview.isRecycled())preview.recycle();
        }
    }
}
