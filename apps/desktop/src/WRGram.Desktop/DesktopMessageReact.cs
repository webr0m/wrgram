namespace WRGram.Desktop;

/// <summary>
/// Reaccionar a un mensaje en Windows. En Android es una escritura con <c>SetChatMessageReaction</c>, y la
/// pantalla la ofrece desde el propio chip y desde un montón de emojis que el puente llena con
/// <c>GetMessageAvailableReactions</c>. En MTProto el equivalente es <c>messages.setReactions</c>, que pide
/// un <c>Vector&lt;TypeReaction&gt;</c> —la unión que dice si lo que se manda es un emoji, un emoji
/// personalizado o un reactionStory—.
/// <para>
/// <b>Esa petición no existe en esta versión de la librería.</b> No es una impresión ni una búsqueda por las
/// documentos: se comprobó compilando una sonda contra WTelegramClient 4.4.10, y devolvió seis errores —
/// <c>TL.Messages_SetReactions</c>, <c>TL.Messages_SetReactionsRequest</c>, <c>TL.TypeReaction</c> y
/// <c>TL.TypeReactionEmoji</c> no están en el espacio <c>TL</c>, y tampoco hay puerta genérica:
/// <c>Client.CallRpcAsync</c>, que es como se manda una consulta no generada, tampoco está. Sin la unión y sin
/// la manera de escribirla a mano, no hay forma honesta de prometer el botón.
/// </para>
/// <para>
/// Lo que sí existe, y se usa: <c>TL.MessageReactions</c> con sus <c>ReactionCount</c> —que es de donde salen
/// las fichas que ya se pintan, con su cuenta y su marca de «elegida»— y <c>TL.UpdateMessageReactions</c>, que
/// Telegram manda cada vez que alguien reacciona en cualquier dispositivo. Antes de esta ronda el host de
/// escritorio no miraba ese aviso, así que las fichas solo se ponían al cargar la ventana: ver reaccionar a
/// otra persona en directo era imposible en Windows aunque el dato llegara por el socket.
/// </para>
/// <para>
/// Fuera, y dicho: <c>messages.getMessageReactionsList</c> y <c>messages.getAvailableReactions</c> sí están
/// generados en esta librería. Aquí no se llaman todavía porque ninguna pantalla de escritorio los pregunta
/// —el detalle de «quién reaccionó» es una superficie que no existe en la interfaz—, no porque no se pueda.
/// </para>
/// </summary>
public static class DesktopMessageReact
{
    /// Lo que responde el puente a <c>message.react</c>, <c>message.react.custom</c> y <c>message.react.paid</c>.
    /// Sustituye al genérico «No disponible en escritorio (beta): message.react», que dejaba caer que faltaba
    /// el cable cuando lo que falta es la petición dentro de la propia biblioteca.
    public const string Refused =
        "La biblioteca de escritorio no incluye la petición para enviar reacciones, así que aquí se pueden ver pero no poner.";

    /// Las fichas rápidas que la pantalla ofrecería antes de abrir el selector. Vacío es la verdad mientras no
    /// exista la escritura: un selector de emojis que solo sirve para recibir un «no se puede» es peor que no
    /// pintarlo, y por eso el menú de escritorio no tiene la banda de reacciones que sí tiene el de Android.
    public static readonly string[] None = [];
}
