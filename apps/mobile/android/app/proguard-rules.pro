-keep class org.drinkless.tdlib.** { *; }
-dontwarn org.drinkless.tdlib.**
-keep class org.webrtc.ContextUtils {
    public static void initialize(android.content.Context);
}
