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

final class PrivateNotes {
    static int clearAccount(Context context, long user) throws Exception {
        if (user <= 0) throw new IllegalArgumentException("Account required");
        File[] candidates = context.getNoBackupFilesDir().listFiles(); int deleted = 0;
        if (candidates != null) for (File candidate : candidates) {
            if (candidate.getName().matches("note-" + user + "--?[0-9]+\\.enc(?:\\.tmp)?")) { Files.deleteIfExists(candidate.toPath()); deleted++; }
        }
        return deleted;
    }
    private static File file(Context context, long user, long chat) {
        if (user <= 0 || chat == 0) throw new IllegalArgumentException("Account required");
        return new File(context.getNoBackupFilesDir(), "note-" + user + "-" + chat + ".enc");
    }

    static String read(Context context, long user, long chat) throws Exception {
        File file = file(context, user, chat);
        if (!file.exists()) return "";
        byte[] data = Files.readAllBytes(file.toPath());
        if (data.length < 28 || data.length > 50_000) throw new IllegalStateException("Invalid note");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(SessionKey.load(context), "AES"), new GCMParameterSpec(128, Arrays.copyOfRange(data, 0, 12)));
        cipher.updateAAD((user + ":" + chat).getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(Arrays.copyOfRange(data, 12, data.length)), StandardCharsets.UTF_8);
    }

    static void write(Context context, long user, long chat, String text) throws Exception {
        File file = file(context, user, chat);
        if (text.trim().isEmpty()) { Files.deleteIfExists(file.toPath()); return; }
        if (text.length() > 10_000) throw new IllegalArgumentException("Note too long");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(SessionKey.load(context), "AES"));
        cipher.updateAAD((user + ":" + chat).getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
        byte[] data = new byte[12 + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, data, 0, 12);
        System.arraycopy(encrypted, 0, data, 12, encrypted.length);
        File temporary = new File(file.getParentFile(), file.getName() + ".tmp");
        Files.write(temporary.toPath(), data);
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
}
