package cc.webrom.wrgram;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** A read-only grant for one downloaded file, without copying it out of TDLib's cache. */
public final class TelegramFileProvider extends ContentProvider {
    private static final long LIFETIME_MS = 15 * 60_000L;
    private static final Map<String, Entry> GRANTS = new LinkedHashMap<>();

    private record Entry(File file, String mime, long until) {}

    static synchronized Uri grant(Context context, File file, String mime) {
        long now = SystemClock.elapsedRealtime();
        GRANTS.values().removeIf(entry -> entry.until <= now);
        while (GRANTS.size() >= 32) GRANTS.remove(GRANTS.keySet().iterator().next());
        String token = UUID.randomUUID().toString();
        GRANTS.put(token, new Entry(file, mime, now + LIFETIME_MS));
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".mediafiles")
                .appendPath(token).build();
    }

    static synchronized void clear() { GRANTS.clear(); }

    private static synchronized Entry entry(Uri uri) {
        if (uri.getPathSegments().size() != 1) return null;
        Entry entry = GRANTS.get(uri.getLastPathSegment());
        return entry != null && entry.until > SystemClock.elapsedRealtime() && entry.file.isFile() ? entry : null;
    }

    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) {
        Entry entry = entry(uri);
        return entry == null ? null : entry.mime;
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Entry entry = entry(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns);
        if (entry != null) {
            MatrixCursor.RowBuilder row = cursor.newRow();
            for (String column : columns) {
                if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(entry.file.getName());
                else if (OpenableColumns.SIZE.equals(column)) row.add(entry.file.length());
                else row.add(null);
            }
        }
        return cursor;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Entry entry = entry(uri);
        if (!"r".equals(mode) || entry == null) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(entry.file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
