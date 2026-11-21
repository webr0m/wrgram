namespace WRGram.Desktop;

/// <summary>
/// Reglas de «copiar al portapapeles», el cable que la ronda AP destapó porque una tarjeta de contacto se copia.
/// Android lo atiende con <c>ClipboardManager</c> y un tope de <c>BridgePolicy.text(p,"text",4096)</c>
/// (<c>NativeBridge.java:543</c>); aquí manda WPF, que es una API de sistema y no de Telegram, así que las dos
/// frases de esta clase son las únicas que el usuario puede leer de un botón que no habla con el servidor.
/// <para>
/// El tope se niega y no se recorta, igual que en Android: quien copia espera en el portapapeles exactamente lo que
/// pulsó, y un texto recortado en silencio sería una copia que no es lo que se pidió. La otra frase es la que Android
/// reserva para un <c>ClipboardManager</c> nulo; aquí le toca al portapapeles ocupado por otro proceso y al caso de
/// que la app no tenga ni ventana, que son las dos formas reales de no poder escribir en él.
/// </para>
/// </summary>
public static class DesktopClipboard
{
    /// El tope de <c>BridgePolicy.text(p,"text",4096)</c>.
    public const int MaxText = 4096;

    /// La misma negativa de Android por pasarse del tope, dicha en español —la divergencia de idioma del andamio ya
    /// está escrita en la ronda AN—.
    public const string TooLong = "El portapapeles admite hasta 4096 caracteres.";

    /// La frase que Android usa cuando el sistema no le da portapapeles (<c>NativeBridge.java:543</c>).
    public const string Unavailable = "El portapapeles no está disponible.";
}
