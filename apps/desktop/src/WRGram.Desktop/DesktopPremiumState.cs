namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;

/// <summary>
/// La marca de Premium en Windows (ronda CD): <c>premium.state</c>, la clave que el selector de emojis personalizados
/// pregunta antes de dejar elegir (<c>apps/mobile-ui/src/App.tsx:1302</c>) y la que decide si el botón ✨ del menú del mensaje se pinta o
/// no, porque la pantalla lee <c>props.allowCustom</c> (<c>apps/mobile-ui/src/App.tsx:1116</c>). En Android la contesta
/// <c>premiumState</c> (<c>NativeBridge.java:4409</c>) con dos peticiones: <c>GetUser(selfId)</c> para la marca y
/// <c>GetPremiumState</c> para el texto del plan y sus opciones de pago. Aquí la marca sale de la cuenta ya conectada
/// —<see cref="DesktopEmojiCatalog.IsPremium(User)"/>, la bandera <c>User.Flags.premium</c>— sin ida y vuelta, igual
/// que hace <see cref="EmojiStatusStateAsync"/> con el estado emoji.
/// <para>
/// Los dos huecos, dichos: <c>state</c> va vacío y <c>paymentOptions</c> también. La petición que los llena en TDLib
/// no está en WTelegramClient 4.4.10, medido por reflexión sobre el ensamblado: lo que hay es
/// <c>help.getUserPremiumPromo</c> (<c>Help_GetPremiumPromo</c>), que es la promoción de los planes que se pueden
/// comprar —con su precio y su <c>store_product</c>— y no el estado del plan de esta cuenta. Confundirlos escribiría
/// en la pantalla «Tu plan: …» (<c>contract.ts:102</c>) una oferta de Telegram disfrazada de dato propio. La familia
/// del panel —ventajas, límites, códigos de regalo y pagos— sigue en «pendiente» en <c>desktopScope.ts</c>, y ese
/// panel no se ofrece en el escritorio.
/// </para>
/// </summary>
public static class DesktopPremiumState
{
    /// La frase con la que el escritorio avisa de que aquí no se cobra. No es la de Android, copiada carácter a
    /// carácter como en las otras familias: <c>StarsPolicy.STORE_PURCHASE_UNAVAILABLE</c> (<c>StarsPolicy.java:14</c>)
    /// habla de Google Play y de TDLib, y las dos cosas son falsas en Windows.
    public const string Notice = "WRGram para escritorio no inicia el cobro: la compra de Stars y de Premium se hace en Telegram oficial, y aquí se gasta.";

    /// La forma que espera <c>PremiumStatus</c>: las cuatro claves, con el vector de planes vacío porque arriba está
    /// la razón.
    public static object Of(bool premium) => new
    {
        premium,
        notice = Notice,
        state = "",
        paymentOptions = Array.Empty<object>(),
    };
}

/// <summary>
/// El brazo del despacho. Va aparte de la familia del emoji porque sus once ramas las mide la ronda BY como un bloque
/// contiguo, y porque esta no pide nada a la red: la bandera vive en el <c>User</c> de la sesión.
/// </summary>
public sealed partial class TelegramService
{
    /// <c>premium.state</c>: la puerta de <see cref="Connected()"/> y la marca, sin más. La escritura de una reacción
    /// personalizada ya comprobaba la bandera y la negaba con <c>NotPremiumAccount</c>
    /// (<c>DesktopMessageReactFlow.cs:75</c>) antes de mandar <c>messages.sendReaction</c>
    /// (<c>DesktopMessageReactFlow.cs:15</c>); lo que faltaba era que la pantalla pudiera saberla.
    private Task<object?> PremiumStateAsync()
    {
        var (_, user) = Connected();
        return Task.FromResult<object?>(DesktopPremiumState.Of(DesktopEmojiCatalog.IsPremium(user)));
    }
}
