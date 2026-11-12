package cc.webrom.wrgram;

import java.net.InetAddress;

/**
 * Decide si una dirección ya resuelta puede servirse a una Mini App. Se evalúa sobre los bytes, no
 * sobre las clases `InetAddress.is*`, porque un IPv4 mapeado en IPv6 (`::ffff:127.0.0.1`) escapa a
 * esos predicados y abriría la puerta a redes privadas.
 */
final class PublicNetworkPolicy {
    private PublicNetworkPolicy() {}

    static boolean isPublic(InetAddress address) {
        return address != null && isPublic(address.getAddress());
    }

    static boolean isPublic(byte[] raw) {
        if (raw == null) return false;
        if (raw.length == 16) {
            if (isIpv4Mapped(raw)) {
                byte[] inner = { raw[12], raw[13], raw[14], raw[15] };
                return isPublic(inner);
            }
            if (isAllZero(raw)) return false;                                   // :: sin especificar
            if (isLoopbackV6(raw)) return false;                                 // ::1
            if ((raw[0] & 0xfe) == 0xfc) return false;                           //(fc00::/7 único-local)
            if ((raw[0] & 0xff) == 0xfe && (raw[1] & 0xc0) == 0x80) return false; // fe80::/10 enlace-local
            if ((raw[0] & 0xff) == 0xfe && (raw[1] & 0xc0) == 0xc0) return false; // fec0::/10 local de sitio, desusada
            if ((raw[0] & 0xff) == 0xff) return false;                            // ff00::/8 multidifusión
            return true;
        }
        if (raw.length != 4) return false;
        int first = raw[0] & 0xff, second = raw[1] & 0xff;
        if (first == 0 || first == 10 || first == 127) return false;             // esta red, privada, loopback
        if (first == 169 && second == 254) return false;                          // enlace-local y metadatos
        if (first == 172 && second >= 16 && second <= 31) return false;           // 172.16.0.0/12
        if (first == 192 && second == 168) return false;                          // 192.168.0.0/16
        if (first == 100 && second >= 64 && second <= 127) return false;          // 100.64.0.0/10 CGNAT
        if (first == 198 && (second & 0xfe) == 18) return false;                   // 198.18.0.0/15 pruebas
        return first < 224;                                                       // multidifusión y reservado
    }

    private static boolean isIpv4Mapped(byte[] raw) {
        for (int i = 0; i < 10; i++) if (raw[i] != 0) return false;
        return (raw[10] & 0xff) == 0xff && (raw[11] & 0xff) == 0xff;
    }

    private static boolean isAllZero(byte[] raw) {
        for (byte part : raw) if (part != 0) return false;
        return true;
    }

    private static boolean isLoopbackV6(byte[] raw) {
        if (raw[15] != 1) return false;
        for (int i = 0; i < 15; i++) if (raw[i] != 0) return false;
        return true;
    }
}
