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
import org.json.JSONObject;

/**
 * Registro cifrado del bot propio: un solo blob por ranura de cuenta, sellado además contra la
 * cuenta que lo escribió, de modo que otro usuario autenticado en la misma ranura no pueda leerlo.
 */
final class BotAccounts {
    private BotAccounts() {}

    private static File file(Context context, String slot) {
        return new File(context.getNoBackupFilesDir(), "bot-" + AccountSlot.validate(slot) + ".v1");
    }

    private static byte[] aad(long owner) {
        if (owner <= 0) throw new IllegalArgumentException("Account required");
        return ("bot:" + owner).getBytes(StandardCharsets.UTF_8);
    }

    /** `null` cuando la cuenta aún no ha configurado ningún bot. */
    static JSONObject read(Context context, String slot, long owner) throws Exception {
        File file = file(context, slot);
        if (!file.exists()) return null;
        byte[] data = Files.readAllBytes(file.toPath());
        if (data.length < 28 || data.length > 8_192) throw new IllegalStateException("Invalid bot record");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(SessionKey.load(context, slot), "AES"),
            new GCMParameterSpec(128, Arrays.copyOfRange(data, 0, 12)));
        cipher.updateAAD(aad(owner));
        return new JSONObject(new String(cipher.doFinal(Arrays.copyOfRange(data, 12, data.length)), StandardCharsets.UTF_8));
    }

    static void write(Context context, String slot, long owner, JSONObject record) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(SessionKey.load(context, slot), "AES"));
        cipher.updateAAD(aad(owner));
        byte[] encrypted = cipher.doFinal(record.toString().getBytes(StandardCharsets.UTF_8));
        byte[] data = new byte[12 + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, data, 0, 12);
        System.arraycopy(encrypted, 0, data, 12, encrypted.length);
        File file = file(context, slot);
        File temporary = new File(file.getParentFile(), file.getName() + ".tmp");
        Files.write(temporary.toPath(), data);
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    static void clear(Context context, String slot) {
        try {
            File file = file(context, slot);
            Files.deleteIfExists(file.toPath());
            Files.deleteIfExists(new File(file.getParentFile(), file.getName() + ".tmp").toPath());
        } catch (RuntimeException | java.io.IOException ignored) {}
    }
}
