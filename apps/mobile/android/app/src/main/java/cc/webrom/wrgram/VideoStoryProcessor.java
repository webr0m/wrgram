package cc.webrom.wrgram;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;

/** Copies a picked video into private storage and reads its duration/cover locally. */
final class VideoStoryProcessor {
    private static final long MAX_BYTES=20L*1024*1024;
    static final class Draft {
        final File file;
        final Bitmap preview;
        final double duration;
        final boolean silent;
        Draft(File file,Bitmap preview,double duration,boolean silent){this.file=file;this.preview=preview;this.duration=duration;this.silent=silent;}
        void clear(){if(file!=null)file.delete();if(preview!=null&&!preview.isRecycled())preview.recycle();}
    }
    private VideoStoryProcessor(){}

    static Draft prepare(Context context,Uri uri,File directory)throws Exception{
        String mime=context.getContentResolver().getType(uri);
        if((mime==null||!mime.startsWith("video/"))&&"file".equals(uri.getScheme())){
            String name=uri.getLastPathSegment();
            String extension=name==null||!name.contains(".")?"":name.substring(name.lastIndexOf('.')+1).toLowerCase(java.util.Locale.ROOT);
            if(extension.equals("mp4")||extension.equals("m4v")||extension.equals("mov"))mime="video/mp4";
        }
        if(mime==null||!mime.startsWith("video/"))throw new IllegalArgumentException("Selecciona un vídeo MP4.");
        try(android.database.Cursor cursor=context.getContentResolver().query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0)&&cursor.getLong(0)>MAX_BYTES)throw new IllegalArgumentException("El vídeo supera 20 MB.");
        }
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("No se pudo preparar el almacenamiento local.");
        File output=new File(directory,"video-"+UUID.randomUUID()+".mp4");
        Bitmap preview=null;
        try{
            long size=0;
            try(InputStream input=context.getContentResolver().openInputStream(uri);FileOutputStream stream=new FileOutputStream(output)){
                if(input==null)throw new IllegalArgumentException("No se pudo leer el vídeo.");
                byte[] buffer=new byte[65536];
                int count;
                while((count=input.read(buffer))!=-1){size+=count;if(size>MAX_BYTES)throw new IllegalArgumentException("El vídeo supera 20 MB.");stream.write(buffer,0,count);}
            }
            if(size==0)throw new IllegalArgumentException("El vídeo está vacío.");
            MediaMetadataRetriever retriever=new MediaMetadataRetriever();
            double duration=0;
            boolean silent=false;
            try{
                retriever.setDataSource(output.getAbsolutePath());
                String rawDuration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if(rawDuration!=null)try{duration=Double.parseDouble(rawDuration)/1000d;}catch(NumberFormatException ignored){}
                silent="no".equalsIgnoreCase(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO));
                Bitmap frame=retriever.getFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if(frame!=null)try{preview=Bitmap.createScaledBitmap(frame,270,480,true);}finally{if(preview!=frame&&!frame.isRecycled())frame.recycle();}
            }finally{
                try{retriever.release();}catch(Exception ignored){}
            }
            if(duration<1||duration>60)throw new IllegalArgumentException("La historia de vídeo debe durar entre 1 y 60 segundos.");
            if(preview==null)throw new IllegalArgumentException("No se pudo leer la vista previa del vídeo.");
            Draft result=new Draft(output,preview,duration,silent);
            output=null;preview=null;
            return result;
        }finally{
            if(output!=null)output.delete();
            if(preview!=null&&!preview.isRecycled())preview.recycle();
        }
    }
}
