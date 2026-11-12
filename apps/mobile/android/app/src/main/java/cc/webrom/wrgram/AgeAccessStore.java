package cc.webrom.wrgram;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.time.LocalDate;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** No DOB/age persisted; a separate Keystore key never changes the existing TDLib key. */
final class AgeAccessStore {
    private static final String ALIAS = "wrgram.age.access.v1";
    private static final byte[] AAD = ALIAS.getBytes(StandardCharsets.UTF_8);
    private final File file;
    private AgePolicy.Receipt receipt;
    AgeAccessStore(Context context) { file = new File(context.getNoBackupFilesDir(), "age-access.v1.enc"); reload(); }
    synchronized AgePolicy.Receipt receipt() { return receipt; }
    synchronized boolean allowed() { return receipt != null && receipt.eligible && receipt.current(System.currentTimeMillis()); }
    synchronized boolean blocked() { return receipt != null && !receipt.eligible && receipt.revision == AgePolicy.REVISION &&
        (receipt.current(System.currentTimeMillis()) || System.currentTimeMillis() < receipt.checkedAt); }
    synchronized void reload() {
        receipt = null;
        try {
            if (!file.exists() || file.length() < 28 || file.length() > 2048) return;
            byte[] bytes = Files.readAllBytes(file.toPath());
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12))); cipher.updateAAD(AAD);
            JSONObject value = new JSONObject(new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8));
            if (value.length() != 4 || !(value.get("eligible") instanceof Boolean) || !(value.get("country") instanceof String) ||
                !(value.get("checkedAt") instanceof Number) || !(value.get("revision") instanceof Number)) return;
            AgePolicy.Receipt candidate = new AgePolicy.Receipt(value.getString("country"), value.getBoolean("eligible"), value.getLong("checkedAt"), value.getInt("revision"));
            if (AgePolicy.COUNTRIES.contains(candidate.country)) receipt = candidate;
        } catch (Exception ignored) { /* Missing, damaged or inaccessible storage never grants access. */ }
    }
    synchronized void declare(String country, LocalDate birth) throws Exception {
        if (blocked()) throw new IllegalStateException("Declaration temporarily locked");
        long now = System.currentTimeMillis();
        AgePolicy.Receipt next = new AgePolicy.Receipt(country, AgePolicy.eligible(country, birth, LocalDate.now()), now, AgePolicy.REVISION);
        receipt = null;
        JSONObject value = new JSONObject().put("country", country).put("eligible", next.eligible).put("checkedAt", now).put("revision", next.revision);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true)); cipher.updateAAD(AAD);
        byte[] encrypted = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        byte[] bytes = new byte[12 + encrypted.length]; System.arraycopy(cipher.getIV(), 0, bytes, 0, 12); System.arraycopy(encrypted, 0, bytes, 12, encrypted.length);
        File temporary = new File(file.getParentFile(), file.getName() + ".tmp"); Files.write(temporary.toPath(), bytes);
        try { Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException ignored) { Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING); }
        receipt = next;
    }
    synchronized void forgetApproval() throws Exception {
        if (blocked()) throw new IllegalStateException("Declaration temporarily locked");
        receipt = null; Files.deleteIfExists(file.toPath());
    }
    private static SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("Age key unavailable");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
}
