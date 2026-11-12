package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import org.junit.Test;

public class PublicNetworkPolicyTest {
    private static byte[] v4(int a,int b,int c,int d){ return new byte[]{(byte)a,(byte)b,(byte)c,(byte) d}; }
    private static byte[] mapped(int a,int b,int c,int d){
        return ByteBuffer.allocate(16).put(new byte[10]).put(new byte[]{(byte)0xff,(byte)0xff,(byte)a,(byte)b,(byte)c,(byte) d}).array();
    }

    @Test public void aceptaDireccionesEnrutables(){
        for (byte[] raw : new byte[][]{v4(8,8,8,8), v4(172,15,0,1), v4(172,32,0,1), v4(100,63,0,1), v4(100,128,0,1), v4(198,16,0,1), v4(198,20,0,1), mapped(8,8,8,8)}) {
            assertTrue(PublicNetworkPolicy.isPublic(raw));
        }
    }

    @Test public void rechazaRedesPrivadasEnlaceLocalCGNATyReservadas(){
        for (byte[] raw : new byte[][]{v4(0,0,0,0), v4(10,1,2,3), v4(127,0,0,1), v4(169,254,169,254), v4(172,16,0,1), v4(172,31,255,255),
                                       v4(192,168,1,50), v4(100,64,0,1), v4(100,127,255,255), v4(198,18,0,1), v4(198,19,255,255), v4(224,0,0,1), v4(255,255,255,255)}) {
            assertFalse(PublicNetworkPolicy.isPublic(raw));
        }
    }

    @Test public void unIPv4MapeadoEnIPv6SeEvaluaComoIPv4(){
        assertFalse(PublicNetworkPolicy.isPublic(mapped(127,0,0,1)));
        assertFalse(PublicNetworkPolicy.isPublic(mapped(192,168,1,50)));
        assertFalse(PublicNetworkPolicy.isPublic(mapped(169,254,169,254)));
        assertFalse(PublicNetworkPolicy.isPublic(mapped(100,64,0,1)));
        assertTrue(PublicNetworkPolicy.isPublic(mapped(203,0,113,7)));
    }

    /** El JDK puede devolver el literal en 4 o 16 bytes según la forma; se normaliza a 16 sin tocar el orden. */
    private static byte[] v6(String literal)throws Exception{
        byte[] raw=InetAddress.getByName(literal).getAddress();
        if(raw.length==16)return raw;
        byte[] padded=new byte[16];
        System.arraycopy(raw,0,padded,16-raw.length,raw.length);
        return padded;
    }

    @Test public void rechazaLiteralesIPv6NoPublicosYFormatosRaros()throws Exception{
        for (String literal : new String[]{"::", "::1", "fe80::1", "febf::1", "fc00::1", "fd12:3456::1", "fec0::1", "ff02::1"}) {
            assertFalse(literal, PublicNetworkPolicy.isPublic(v6(literal)));
        }
        assertTrue(PublicNetworkPolicy.isPublic(v6("2001:4860:4860::8888")));
        assertFalse(PublicNetworkPolicy.isPublic(new byte[]{1,2,3}));
        assertFalse(PublicNetworkPolicy.isPublic((byte[]) null));
        assertFalse(PublicNetworkPolicy.isPublic((InetAddress) null));
    }
}
