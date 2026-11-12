package cc.webrom.wrgram;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.function.Predicate;
import javax.net.ssl.SSLSocketFactory;

/**
 * Capa TLS que se niega a cifrar tráfico hacia una red privada.
 *
 * `HttpsURLConnection` resuelve y conecta el TCP por su cuenta y sólo llama a esta fábrica para
 * envolver ese socket ya conectado, así que la única comprobación útil ocurre sobre la dirección
 * realmente conectada: un registro DNS con TTL mínimo puede cambiar de IP pública a privada entre
 * la validación previa y la conexión. Si el peer resulta privado se cierra el TCP antes del
 * handshake, de modo que la petición nunca llega a un servicio interno.
 */
final class PublicOnlySocketFactory extends SSLSocketFactory {
    private static final String BLOCKED = "El servidor apunta a una red privada.";

    private final SSLSocketFactory delegate;
    private final int connectTimeoutMs;
    private final Predicate<InetAddress> publicAddress;

    PublicOnlySocketFactory(int connectTimeoutMs) {
        this((SSLSocketFactory) SSLSocketFactory.getDefault(), connectTimeoutMs, PublicNetworkPolicy::isPublic);
    }

    /** Costura de pruebas JVM: permite juzgar un peer local como público y verificar que hay delegación TLS. */
    PublicOnlySocketFactory(SSLSocketFactory delegate, int connectTimeoutMs, Predicate<InetAddress> publicAddress) {
        this.delegate = delegate;
        this.connectTimeoutMs = connectTimeoutMs;
        this.publicAddress = publicAddress;
    }

    @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
    @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }

    @Override public Socket createSocket(Socket tcp, String host, int port, boolean autoClose) throws IOException {
        requireConnectedPublicPeer(tcp);
        return delegate.createSocket(tcp, host, port, autoClose);
    }

    @Override public Socket createSocket(String host, int port) throws IOException {
        return connect(InetAddress.getAllByName(host), host, port, null, 0);
    }

    @Override public Socket createSocket(String host, int port, InetAddress localAddress, int localPort) throws IOException {
        return connect(InetAddress.getAllByName(host), host, port, localAddress, localPort);
    }

    @Override public Socket createSocket(InetAddress address, int port) throws IOException {
        return connect(new InetAddress[]{address}, address.getHostAddress(), port, null, 0);
    }

    @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
        return connect(new InetAddress[]{address}, address.getHostAddress(), port, localAddress, localPort);
    }

    private Socket connect(InetAddress[] addresses, String host, int port, InetAddress localAddress, int localPort) throws IOException {
        for (InetAddress address : addresses) requirePublic(address);
        IOException last = null;
        for (InetAddress address : addresses) {
            Socket tcp = new Socket();
            try {
                if (localAddress != null || localPort != 0) tcp.bind(new InetSocketAddress(localAddress, localPort));
                tcp.connect(new InetSocketAddress(address, port), connectTimeoutMs);
                return createSocket(tcp, host, port, true);
            } catch (IOException | RuntimeException failure) {
                closeQuietly(tcp);
                last = failure instanceof IOException ? (IOException) failure : new IOException(failure);
            }
        }
        throw last != null ? last : new IOException("El servidor no devolvió ninguna dirección.");
    }

    private void requireConnectedPublicPeer(Socket tcp) throws IOException {
        if (tcp == null) throw new IOException(BLOCKED);
        if (tcp.isClosed() || !tcp.isConnected()) throw new IOException("Se pidió TLS sobre un TCP que no está conectado.");
        if (!publicAddress.test(tcp.getInetAddress())) { closeQuietly(tcp); throw new IOException(BLOCKED); }
    }

    private void requirePublic(InetAddress address) throws IOException {
        if (!publicAddress.test(address)) throw new IOException(BLOCKED);
    }

    private static void closeQuietly(Socket socket) {
        try { socket.close(); } catch (IOException ignored) {}
    }
}
