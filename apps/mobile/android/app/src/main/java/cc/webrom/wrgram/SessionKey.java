package cc.webrom.wrgram;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** A random TDLib database key, wrapped by a non-exportable Android Keystore key. */
final class SessionKey {
    static synchronized byte[] load(Context context) throws Exception {
        return load(context, AccountSlot.LEGACY);
    }
    static synchronized byte[] load(Context context, String slot) throws Exception {
        String alias = AccountSlot.alias(slot);
        File envelope = new File(context.getNoBackupFilesDir(), AccountSlot.envelope(slot));
        File database = new File(context.getNoBackupFilesDir(), AccountSlot.directory(slot));
        if(!envelope.exists()&&database.isDirectory()&&database.list()!=null&&database.list().length>0)throw new IllegalStateException("Existing account key unavailable");
        if (!envelope.exists()) {
            File[] existing = context.getNoBackupFilesDir().listFiles();
            if (existing != null) for (File file : existing) {
                if (AccountSlot.LEGACY.equals(slot)&&((file.getName().equals("telegram") && file.isDirectory() && file.list() != null && file.list().length > 0) ||
                    file.getName().matches("note-[0-9]+--?[0-9]+\\.enc") || file.getName().equals("assistant-notes.v1.enc"))
                    )throw new IllegalStateException("Encrypted data exists but its key envelope is missing");
            }
        }
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(alias)) {
            // Never silently replace a lost key for an existing session database.
            if (envelope.exists()) throw new IllegalStateException("Session key unavailable");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
            generator.generateKey();
        }
        SecretKey key = (SecretKey) store.getKey(alias, null);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        if (envelope.exists()) {
            byte[] data = Files.readAllBytes(envelope.toPath());
            if (data.length != 60) throw new IllegalStateException("Invalid key envelope");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOfRange(data, 0, 12)));
            return cipher.doFinal(Arrays.copyOfRange(data, 12, data.length));
        }
        byte[] databaseKey = new byte[32];
        new SecureRandom().nextBytes(databaseKey);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] encrypted = cipher.doFinal(databaseKey);
        byte[] data = new byte[12 + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, data, 0, 12);
        System.arraycopy(encrypted, 0, data, 12, encrypted.length);
        File temporary = new File(context.getNoBackupFilesDir(), AccountSlot.envelope(slot)+".tmp");
        Files.write(temporary.toPath(), data);
        Files.move(temporary.toPath(), envelope.toPath());
        return databaseKey;
    }
}
