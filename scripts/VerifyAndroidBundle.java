import java.io.OutputStream;
import java.nio.file.Path;
import java.security.cert.Certificate;
import java.util.HashSet;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/** Read every payload with Java's signature verifier; compare the upload certificate to a prior AAB. */
public final class VerifyAndroidBundle {
    private static Certificate verify(String path) throws Exception {
        Certificate expected = null;
        int count = 0;
        Set<String> names = new HashSet<>();
        try (JarFile jar = new JarFile(Path.of(path).toFile(), true)) {
            var entries = jar.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (!names.add(entry.getName())) throw new SecurityException("Duplicate entry");
                if (entry.isDirectory()) continue;
                try (var input = jar.getInputStream(entry)) { input.transferTo(OutputStream.nullOutputStream()); }
                if (entry.getName().startsWith("META-INF/")) continue;
                Certificate[] certificates = entry.getCertificates();
                if (certificates == null || certificates.length != 1) throw new SecurityException("Unsigned/unexpected payload signer: " + entry.getName());
                if (expected == null) expected = certificates[0];
                if (!expected.equals(certificates[0])) throw new SecurityException("Mixed signers");
                count++;
            }
        }
        if (expected == null || count == 0) throw new SecurityException("No signed payload");
        System.out.println(Path.of(path).getFileName() + ": " + count + " payload entries signature-verified; no duplicates/unsigned payload.");
        return expected;
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: VerifyAndroidBundle.java previous.aab candidate.aab");
        Certificate previous = verify(args[0]);
        Certificate candidate = verify(args[1]);
        if (!previous.equals(candidate)) throw new SecurityException("Upload certificate changed");
        System.out.println("Candidate uses exactly the previous upload certificate. Trust-chain warnings for a self-signed upload key are not treated as public-CA trust.");
    }
}
