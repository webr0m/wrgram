package cc.webrom.wrgram;

import static org.junit.Assert.*;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import javax.net.ssl.SSLSocketFactory;
import org.junit.Test;

/** Coteja la fábrica TLS contra un servidor loopback real: es la ruta que usa HttpsURLConnection. */
public class PublicOnlySocketFactoryTest {
    private static final String BLOCKED = "El servidor apunta a una red privada.";

    private static final class Recording extends SSLSocketFactory {
        Socket wrapped; String host; boolean autoClose; int calls;
        @Override public String[] getDefaultCipherSuites(){ return new String[0]; }
        @Override public String[] getSupportedCipherSuites(){ return new String[0]; }
        @Override public Socket createSocket(){ return new Socket(); }
        @Override public Socket createSocket(String h,int p){ calls++; host=h; return new Socket(); }
        @Override public Socket createSocket(String h,int p,InetAddress local,int lp){ return createSocket(h,p); }
        @Override public Socket createSocket(InetAddress a,int p){ calls++; host=a.getHostAddress(); return new Socket(); }
        @Override public Socket createSocket(InetAddress a,int p,InetAddress local,int lp){ return createSocket(a,p); }
        @Override public Socket createSocket(Socket s,String h,int p,boolean ac){ calls++; wrapped=s; host=h; autoClose=ac; return s; }
    }

    private static Socket connectTo(ServerSocket server)throws IOException{
        Socket client=new Socket();
        client.connect(new java.net.InetSocketAddress(server.getInetAddress(),server.getLocalPort()),2000);
        return client;
    }

    @Test public void rechazaEnvolverUnTCPConectadoADireccionPrivada()throws Exception{
        try(ServerSocket server=new ServerSocket(0,16,InetAddress.getLoopbackAddress())){
            Socket tcp=connectTo(server);
            try{
                new PublicOnlySocketFactory(2000).createSocket(tcp,"historia.example",server.getLocalPort(),true);
                fail("TLS sobre una dirección de loopback debe bloquearse.");
            }catch(IOException blocked){
                assertEquals(BLOCKED,blocked.getMessage());
                assertTrue("El TCP hacia la red privada debe cerrarse.",tcp.isClosed());
            }
        }
    }

    @Test public void rechazaAntes_deConectarUnHostLiteralPrivado()throws Exception{
        PublicOnlySocketFactory factory=new PublicOnlySocketFactory(60_000);
        for(String host:new String[]{"192.168.1.50","10.0.0.7","169.254.169.254","100.64.0.1","127.0.0.1"}){
            try{
                factory.createSocket(host,443);
                fail(host+" no debería conectar.");
            }catch(IOException blocked){ assertEquals(BLOCKED,blocked.getMessage()); }
        }
        for(InetAddress address:new InetAddress[]{InetAddress.getByName("100.64.0.1"),InetAddress.getByName("::ffff:192.168.1.50")}){
            try{
                factory.createSocket(address,443);
                fail(address+" no debería conectar.");
            }catch(IOException blocked){ assertEquals(BLOCKED,blocked.getMessage()); }
        }
    }

    @Test public void rechazaEnlazarDireccionLocalHaciaRedPrivada()throws Exception{
        try{
            new PublicOnlySocketFactory(2000).createSocket("127.0.0.1",443,InetAddress.getLoopbackAddress(),0);
            fail("El enlace local tampoco debe alcanzar una red privada.");
        }catch(IOException blocked){ assertEquals(BLOCKED,blocked.getMessage()); }
    }

    @Test public void fallaCerradoSiElTCPLlegaSinConectar()throws Exception{
        Recording delegate=new Recording();
        PublicOnlySocketFactory factory=new PublicOnlySocketFactory(delegate,2000,ignored->true);
        try{
            factory.createSocket(new Socket(),"historia.example",443,true);
            fail("No se debe cifrar sobre un socket sin conexión.");
        }catch(IOException expected){
            assertTrue(expected.getMessage(),expected.getMessage().contains("no está conectado"));
            assertEquals(0,delegate.calls);
        }
        try{
            factory.createSocket((Socket) null,"historia.example",443,true);
            fail("Un socket nulo no puede cifrarse.");
        }catch(IOException expected){ assertEquals(BLOCKED,expected.getMessage()); }
    }

    @Test public void delegaSinReResolverCuandoElPeerEsPublico()throws Exception{
        Recording delegate=new Recording();
        PublicOnlySocketFactory factory=new PublicOnlySocketFactory(delegate,2000,ignored->true);
        try(ServerSocket server=new ServerSocket(0,16,InetAddress.getLoopbackAddress())){
            Socket tcp=connectTo(server);
            Socket tls=factory.createSocket(tcp,"historia.example",server.getLocalPort(),true);
            assertSame(tcp,tls);
            assertEquals(1,delegate.calls);
            assertEquals("El nombre real debe llegar al delegate para SNI y la verificación del certificado.","historia.example",delegate.host);
            assertTrue(delegate.autoClose);

            Socket conectada=factory.createSocket("127.0.0.1",server.getLocalPort());
            assertTrue(conectada.isConnected());
            assertEquals("127.0.0.1",delegate.host);
            assertSame(conectada,delegate.wrapped);
            conectada.close();
        }
    }
}
