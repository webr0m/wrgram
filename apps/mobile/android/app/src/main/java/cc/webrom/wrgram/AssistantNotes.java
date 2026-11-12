package cc.webrom.wrgram;

import android.content.Context;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Personal assistant notes are separate from every Telegram chat and never enter an AI request. */
final class AssistantNotes {
    private static final byte[] AAD = "wrgram.assistant.notes.v1".getBytes(StandardCharsets.UTF_8);
    private static File file(Context context) { return new File(context.getNoBackupFilesDir(), "assistant-notes.v1.enc"); }
    static JSONArray read(Context context) throws Exception {
        File source = file(context); if (!source.exists()) return new JSONArray();
        if (source.length() > 1_000_000) throw new IllegalStateException("Notes too large");
        byte[] bytes = Files.readAllBytes(source.toPath()); if (bytes.length < 28) throw new IllegalStateException("Invalid encrypted notes");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(SessionKey.load(context), "AES"), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12))); cipher.updateAAD(AAD);
        JSONArray notes = new JSONArray(new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8));
        if (notes.length() > 50) throw new IllegalStateException("Too many notes");
        return notes;
    }
    static void add(Context context, String title, String text) throws Exception {
        if (title.trim().isEmpty() || title.length() > 80 || text.trim().isEmpty() || text.length() > 5000) throw new IllegalArgumentException("Invalid note");
        JSONArray notes = read(context); if (notes.length() >= 50) throw new IllegalStateException("Note limit");
        notes.put(new JSONObject().put("title", title).put("text", text));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(SessionKey.load(context), "AES")); cipher.updateAAD(AAD);
        byte[] encrypted = cipher.doFinal(notes.toString().getBytes(StandardCharsets.UTF_8)), bytes = new byte[12 + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, bytes, 0, 12); System.arraycopy(encrypted, 0, bytes, 12, encrypted.length);
        File destination = file(context), temporary = new File(destination.getPath() + ".tmp");
        Files.write(temporary.toPath(), bytes); Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
    static void clear(Context context) throws Exception { Files.deleteIfExists(file(context).toPath()); }
}
