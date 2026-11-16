namespace WRGram.Desktop;

using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Los mensajes programados en Windows. TDLib los trata como mensajes de verdad que aún no salieron: viven en
/// el chat, <c>GetChatScheduledMessages</c> los devuelve y <c>EditMessageSchedulingState</c> —con estado
/// <c>null</c>— los dispara ya. MTProto reparte lo mismo en tres peticiones y un detalle:
/// <c>messages.getScheduledMessages(peer, id[])</c> lee la bandeja (con <c>id</c> vacío, toda),
/// <c>messages.sendScheduledMessages(peer, id[])</c> la vacía antes de hora y
/// <c>messages.deleteScheduledMessages(peer, id[])</c> la tira sin enviarla. Las tres existen en
/// WTelegramClient 4.4.10, verificadas por reflexión: devuelven <c>Messages_MessagesBase</c> y
/// <c>UpdatesBase</c>, y la primera contesta con <c>messages.messages</c>, que es la base de
/// <c>messages.messagesSlice</c> —una sola prueba de tipo cubre las dos formas—.
/// <para>
/// Cambiar la hora no tiene petición propia. Lo que hace un cliente de Telegram es volver a llamar a
/// <c>messages.editMessage</c> con <c>schedule_date</c> nuevo, y <c>editMessage</c> es la petición que la ronda
/// AH ya describió: <b>reemplaza, no parchea</b>. Por eso esta ronda aplica la misma regla —escribir obliga a
/// leer— y reescribe la fila con el texto, los <c>entities</c> y el <c>InputMedia</c> que Telegram acaba de
/// devolver, nunca con lo que la pantalla pintó. Lo que el puente no sabe volver a mandar (<see cref="KeepsContent"/>:
/// una encuesta, un sticker o un archivo que no llega como foto ni como documento) se niega con nombre en vez
/// de arriesgarse a dejar la fila vacía.
/// </para>
/// <para>
/// Los recurrentes se quedan fuera de las dos escrituras que cambian el estado, igual que en Android: la fila
/// lleva <c>schedule_repeat_period</c> con su bandera, y un <c>editMessage</c> que no lo devuelva borra el
/// ciclo. Eliminar uno recurrente sí se deja, porque ahí no se reescribe nada.
/// </para>
/// <para>
/// Las cuatro frases de negativa están copiadas carácter a carácter de <c>NativeBridge.scheduledList</c>,
/// <c>scheduledSchedule</c> y <c>withScheduledMessage</c>, que son las que Android responde en los mismos
/// casos. La ventana de la hora nueva no se repite aquí: es la misma de <see cref="DesktopSchedule"/>, que ya
/// usan <c>send.text</c> y el reenvío.
/// </para>
/// </summary>
public static class DesktopScheduled
{
    /// Copiada de <c>NativeBridge.scheduledList</c> y de <c>withScheduledMessage</c>: el puente de Android
    /// descarta la respuesta si la persona cambió de conversación mientras el chat contestaba.
    public const string ChangedChat = "La conversación cambió.";

    /// Copiada de <c>NativeBridge.withScheduledMessage</c>, para la fila que ya no estaba en la bandeja.
    public const string NotScheduled = "Ese mensaje ya no está programado. Actualiza la lista de envíos.";

    /// Copiada de <c>NativeBridge.scheduledSchedule</c>: TDLib no deja tocar el estado de un recurrente y
    /// MTProto tampoco lo reescribe gratis, así que las dos capas dicen lo mismo en el mismo caso.
    public const string Recurring = "Gestiona la fecha o el envío inmediato de los mensajes recurrentes en Telegram.";

    /// Copiada de <c>NativeBridge.scheduledList</c>, el aviso con el que Android se queda cuando la bandeja no
    /// se pudo leer o convertir. Aquí tapa también la lectura previa que exigen las dos escrituras.
    public const string Prepare = "No se pudieron preparar los mensajes programados.";

    /// La negativa que en Android no hace falta: TDLib tiene un <c>EditMessageSchedulingState</c> que cambia
    /// solo la hora y deja la fila intacta, y <c>messages.editMessage</c> no. Si el contenido no se puede
    /// volver a mandar tal cual, cambiar la hora sería borrarlo.
    public const string Unsupported =
        "Este cliente no sabe volver a mandar ese contenido, así que no le cambia la hora. Hazlo desde otro dispositivo.";

    /// Un programado recurrente: la bandera <c>has_schedule_repeat_period</c> y un periodo mayor que cero, en
    /// segundos, que es la misma unidad que la interfaz ya lista en sus opciones de repetición.
    public static bool IsRecurring(Message message) =>
        (message.flags2 & Message.Flags2.has_schedule_repeat_period) != 0 && message.schedule_repeat_period > 0;

    /// El periodo, o <c>null</c> cuando la fila se envía una sola vez.
    public static int? RepeatPeriod(Message message) => IsRecurring(message) ? message.schedule_repeat_period : null;

    /// Si <see cref="DesktopMessageEdit.MediaOf"/> podría reconstruir la fila entera. Una fila sin archivo
    /// siempre se puede —solo viaja el texto—; con archivo, solo foto y documento, que son las dos clases con
    /// <c>ToInputMedia()</c>. Una encuesta, un sticker o un contacto programado se quedan fuera.
    public static bool KeepsContent(Message message) => message.media is null or MessageMediaPhoto or MessageMediaDocument;

    /// Las tres escrituras empiezan igual: la misma mira de <c>NativeBridge.withScheduledMessage</c>, que antes
    /// de tocar nada vuelve a leer la bandeja y busca la fila. Devuelve <c>null</c> cuando ya no está, y es el
    /// llamante quien decide la frase, porque la lectura puede haber fallado antes.
    public static Message? Find(IEnumerable<MessageBase>? rows, int id) =>
        rows?.OfType<Message>().FirstOrDefault(row => row.ID == id);
}
