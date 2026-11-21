namespace WRGram.Desktop;

using System;
using System.Collections.Generic;

/// <summary>
/// El silencio que una cuenta aplica por defecto a lo que ella misma envía. En Android lo guarda TDLib en
/// `Chat.default_disable_notification` al llamar `toggleChatDefaultDisableNotification`, y ahí queda: el
/// valor no viaja a los servidores de Telegram, es una preferencia de este cliente.
/// <para>
/// En escritorio la sonda de la ronda CJ recorrió `TL.Chat`, `TL.Channel`, `TL.ChannelFull` y `TL.ChatFull`
/// buscando el hueco y solo encontró `default_banned_rights`, `groupcall_default_join_as` y `default_send_as`,
/// que son otras tres cosas. Tampoco hay un método `*Notify*` del cliente donde escribirlo: lo que MTProto
/// ofrece con `account.updateNotifySettings` es el silencio de lo que <em>llega</em>, que ya atiende
/// `chat.mute`. Así que la lista vive en la carpeta de la app, igual que los filtros de búsqueda guardados de
/// `DesktopSavedFilters`, con la diferencia honesta de que aquí el equivalente de la otra capa tampoco es del
/// servidor.
/// </para>
/// <para>
/// La clase es pura —sin disco, sin sesión, sin red— por la misma razón que las demás: la regla se puede leer
/// y medir de una vez, y `rondaCJ.test.ts` la compara con la copia de Android.
/// </para>
/// </summary>
public static class DesktopDefaultSilent
{
    /// El archivo, dentro de `DesktopStore.Root` y aparte de `settings.json`.
    public const string FileName = "default-silent.json";

    /// La cuenta dueña de la lista, con el prefijo `u` que ya usan los filtros guardados.
    public static string AccountKey(long userId) => "u" + userId;

    /// Encender añade el chat, apagar lo quita; repetir el valor no duplica ni borra al vecino.
    public static HashSet<string> Toggle(IEnumerable<string> current, string chatId, bool value)
    {
        var next = new HashSet<string>(current);
        if (value) next.Add(chatId);
        else next.Remove(chatId);
        return next;
    }

    /// La marca que ve la interfaz: solo se escribe cuando está encendida, como `isForum` o `supergroup`.
    public static bool? Mark(HashSet<string> current, string chatId) => current.Contains(chatId) ? true : null;

    /// El silencio con el que sale un envío propio. En Android lo decide TDLib: `sendOptions` devuelve `null`
    /// cuando la pantalla pidió avisar (<c>NativeBridge.java:174</c>) y entonces la biblioteca aplica su
    /// `Chat.default_disable_notification`, que su propia fuente describe como «Default value of the
    /// disableNotification parameter, used when a message is sent to the chat»
    /// (<c>org/drinkless/tdlib/TdApi.java:10697</c>). O sea: el defecto de la conversación gana al interruptor de
    /// la pantalla, y aquí tiene que ganar igual.
    public static bool SilentFor(HashSet<string> current, string chatId, bool silent) => silent || current.Contains(chatId);
}
