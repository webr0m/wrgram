package cc.webrom.wrgram;

import java.net.URI;

/** Pure URL policy. Never accept JS-supplied launch URLs or credentials in an authority. */
final class MiniAppPolicy {
    static String origin(String value){try{URI uri=new URI(value);String host=uri.getHost();if(!"https".equalsIgnoreCase(uri.getScheme())||host==null||uri.getUserInfo()!=null||uri.getPort()!=-1&&uri.getPort()!=443)throw new IllegalArgumentException();host=host.toLowerCase(java.util.Locale.ROOT);if(!host.contains(".")||host.matches("[0-9.]+")||host.contains(":")||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))throw new IllegalArgumentException();return "https://"+host;}catch(Exception ignored){throw new IllegalArgumentException("Only public HTTPS Mini Apps are supported");}}
    static boolean sameOrigin(String expected,String value){try{return expected.equals(origin(value));}catch(IllegalArgumentException ignored){return false;}}
}
