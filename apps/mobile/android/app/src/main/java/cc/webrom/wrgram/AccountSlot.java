package cc.webrom.wrgram;

/** Stable storage namespaces; legacy remains byte-for-byte compatible with alpha04. */
final class AccountSlot {
    static final String LEGACY="primary";
    static String validate(String slot){if(slot==null||!slot.matches("primary|[a-f0-9]{32}"))throw new IllegalArgumentException("Invalid account slot");return slot;}
    static String directory(String slot){validate(slot);return LEGACY.equals(slot)?"telegram":"accounts/"+slot+"/telegram";}
    static String envelope(String slot){validate(slot);return LEGACY.equals(slot)?"tdlib-key.v1":"tdlib-key-"+slot+".v1";}
    static String alias(String slot){validate(slot);return "wrgram.tdlib.database.v1"+(LEGACY.equals(slot)?"":"."+slot);}
}
