package cc.webrom.wrgram;

import static org.junit.Assert.*;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Prueba en la pila HTTP real de Android (OkHttp + conscrypt) que la guarda de red privada está en la
 * ruta de conexión y que no rompe una descarga legítima. El servidor habla texto plano y escucha en la
 * dirección real del dispositivo: si la guarda no se invocara, el fallo sería un error de handshake TLS
 * («unrecognized SSL message»), nunca el mensaje de la política.
 */
@RunWith(AndroidJUnit4.class)
public class PublicOnlySocketStackTest {
    private static final String BLOCKED = "El servidor apunta a una red privada.";

    private static final class Trace extends SSLSocketFactory {
        private final SSLSocketFactory delegate;
        final List<String> llamadas = new ArrayList<>();
        Trace(SSLSocketFactory delegate) { this.delegate = delegate; }
        @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
        @Override public Socket createSocket() throws IOException { llamadas.add("()"); return delegate.createSocket(); }
        @Override public Socket createSocket(String host, int port) throws IOException { llamadas.add("(String,int) host=" + host); return delegate.createSocket(host, port); }
        @Override public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { llamadas.add("(String,int,InetAddress,int) host=" + host); return delegate.createSocket(host, port, local, localPort); }
        @Override public Socket createSocket(InetAddress address, int port) throws IOException { llamadas.add("(InetAddress,int) " + address); return delegate.createSocket(address, port); }
        @Override public Socket createSocket(InetAddress address, int port, InetAddress local, int localPort) throws IOException { llamadas.add("(InetAddress,int,InetAddress,int) " + address); return delegate.createSocket(address, port, local, localPort); }
        @Override public Socket createSocket(Socket tcp, String host, int port, boolean autoClose) throws IOException {
            String peer = tcp == null ? "socket null" : (tcp.isConnected() ? "peer=" + tcp.getInetAddress() : "sin conectar");
            llamadas.add("(Socket " + peer + ",host=" + host + ",int,boolean)");
            return delegate.createSocket(tcp, host, port, autoClose);
        }
    }

    private static String respuesta(HttpsURLConnection conexion) throws Exception {
        try {
            conexion.connect();
            int codigo = conexion.getResponseCode();
            return "conectado " + codigo + " " + conexion.getCipherSuite();
        } catch (IOException bloqueado) {
            Throwable raiz = bloqueado;
            while (raiz.getCause() != null && raiz.getCause() != raiz) raiz = raiz.getCause();
            return "bloqueado " + raiz.getClass().getSimpleName() + " [" + raiz.getMessage() + "]";
        } finally {
            conexion.disconnect();
        }
    }

    /** Dirección no-local del propio dispositivo: el caso real al que derivaría un registro DNS re-enlazado. */
    private static InetAddress direccionPropia() throws Exception {
        for (NetworkInterface interfaz : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!interfaz.isUp() || interfaz.isLoopback()) continue;
            for (InetAddress address : Collections.list(interfaz.getInetAddresses())) {
                if (address instanceof Inet4Address && address.isSiteLocalAddress()) return address;
            }
        }
        return null;
    }

    @Test public void laPilaDeAndroid_BloqueaElTls_HaciaUnaDireccionPrivada() throws Exception {
        // Objetivo: la dirección propia del dispositivo, no 127.0.0.1. En el emulador probado (Android 16)
        // un TCP plano a loopback se rechaza antes de llegar a la capa TLS y la prueba no ejercitaría la
        // guarda; esta dirección sí atraviesa la pila de red completa.
        InetAddress objetivo = direccionPropia();
        org.junit.Assume.assumeTrue("El dispositivo no tiene dirección IPv4 propia.", objetivo != null);
        try (ServerSocket servidor = new ServerSocket(0, 16)) {
            Thread eco = new Thread(() -> {
                while (!servidor.isClosed()) { try { servidor.accept().close(); } catch (IOException fin) { return; } }
            });
            eco.setDaemon(true);
            eco.start();
            Trace rastreo = new Trace(new PublicOnlySocketFactory(4000));
            HttpsURLConnection conexion = (HttpsURLConnection) new URL("https://" + objetivo.getHostAddress() + ":" + servidor.getLocalPort() + "/").openConnection();
            conexion.setSSLSocketFactory(rastreo);
            conexion.setConnectTimeout(4000);
            conexion.setReadTimeout(4000);
            String resultado = respuesta(conexion);
            assertTrue("La pila de Android llegó a " + resultado + " tras " + rastreo.llamadas, resultado.contains(BLOCKED));
            assertTrue("La guarda debe juzgar el TCP ya conectado: " + rastreo.llamadas,
                rastreo.llamadas.stream().anyMatch(l -> l.startsWith("(Socket peer=/" + objetivo.getHostAddress())));
        }
    }

    @Test public void laPilaDeAndroid_CifraConNormalidad_UnServidorPublico() throws Exception {
        Trace rastreo = new Trace(new PublicOnlySocketFactory(10000));
        HttpsURLConnection conexion = (HttpsURLConnection) new URL("https://wrgram.webrom.cc/android/privacy/").openConnection();
        conexion.setSSLSocketFactory(rastreo);
        conexion.setInstanceFollowRedirects(false);
        conexion.setConnectTimeout(10000);
        conexion.setReadTimeout(15000);
        String resultado = respuesta(conexion);
        assertTrue("La descarga pública debe funcionar con la guarda puesta: " + resultado + " " + rastreo.llamadas, resultado.startsWith("conectado 200"));
        assertTrue("El nombre real debe conservarse para SNI y la verificación del certificado: " + rastreo.llamadas,
            rastreo.llamadas.stream().anyMatch(l -> l.contains("host=wrgram.webrom.cc")));
    }
}
