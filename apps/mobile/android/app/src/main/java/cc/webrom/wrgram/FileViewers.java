package cc.webrom.wrgram;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.util.Locale;

final class FileViewers {
    private FileViewers() {}

    static String extension(File file) {
        String name=file.getName();
        int dot=name.lastIndexOf('.');
        return dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);
    }

    static String mime(String supplied,File file) {
        String extension=extension(file);
        String byExtension=switch(extension){
            case "apk" -> "application/vnd.android.package-archive";
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "odt" -> "application/vnd.oasis.opendocument.text";
            case "ods" -> "application/vnd.oasis.opendocument.spreadsheet";
            case "odp" -> "application/vnd.oasis.opendocument.presentation";
            case "epub" -> "application/epub+zip";
            case "mobi" -> "application/x-mobipocket-ebook";
            case "7z" -> "application/x-7z-compressed";
            case "rar" -> "application/vnd.rar";
            case "cbz" -> "application/vnd.comicbook+zip";
            case "gpx" -> "application/gpx+xml";
            case "kml" -> "application/vnd.google-earth.kml+xml";
            default -> "";
        };
        if(!byExtension.isEmpty())return byExtension;
        String type=supplied==null?"":supplied.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
        if(type.matches("[a-z0-9.+_-]+/[a-z0-9.+_-]+")&&!type.equals("application/octet-stream")
                &&!type.equals("application/x-unknown")&&!type.equals("binary/octet-stream"))return type;
        String guessed=MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return guessed==null?"application/octet-stream":guessed;
    }

    static boolean readableText(String mime,File file) {
        return mime.startsWith("text/")||mime.equals("application/json")||mime.equals("application/xml")
                ||extension(file).matches("txt|log|md|markdown|csv|tsv|json|xml|html?|yaml|yml|ini|conf|toml|sql|srt|vtt|nfo|rst|properties");
    }

    static void open(Context context,File file,String mime) throws ActivityNotFoundException {
        Uri uri=TelegramFileProvider.grant(context,file,mime);
        Intent view=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        view.setClipData(ClipData.newRawUri("Archivo de Telegram",uri));
        context.startActivity(view);
    }
}
