namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la privacidad de la cuenta en Windows: <c>privacy.get</c> (<c>NativeBridge.java:552</c> →
/// <c>privacyGet</c>, <c>:3848-3859</c>) y <c>privacy.set</c> (<c>:542</c> → <c>privacySet</c>, <c>:3860-3874</c>).
/// Las claves, la proyección, la reconstrucción y las frases están en <see cref="DesktopPrivacy"/>; aquí está el
/// hilo, que es lo que faltaba. Las dos órdenes están en la lista del puente desde la ronda B
/// (<c>BridgePolicy.java:23</c>) y la pantalla las pide desde entonces en dos sitios —
/// el panel «Quién puede verte y contactarte» de los ajustes (<c>SettingsPage.tsx:109</c>) y el desplegable de
/// visibilidad del menú de cuenta (<c>UserMenu.tsx:50</c>)—, pero en Windows caían en el <c>_ =&gt; throw</c>
/// genérico. En los ajustes el daño era doble: la pregunta viene dentro de un <c>Promise.all</c> junto a
/// <c>contacts.list</c> (<c>SettingsPage.tsx:109</c>), así que no se degradaba el panel, se negaba entero con
/// «No disponible en escritorio (beta): privacy.get».
/// <para>
/// La diferencia de verdad entre las dos capas está en el escribir, y cabe en una línea: TDLib acepta
/// identificadores sueltos y MTProto acepta <c>InputUser</c>, que llevan <c>access_hash</c>. Por eso la lectura
/// rellena la caché de personas con <c>MergePeers</c> antes de reconstruir, y por eso existe
/// <see cref="DesktopPrivacy.MissingUser"/>. Todo lo demás —el orden de las claves, el de las guardas, las
/// negaciones y los tres techos— es la misma norma de <c>PrivacyRules.java</c> dicha una vez en esta capa.
/// </para>
/// <para>
/// La otra diferencia es que aquí el <c>catch</c> de <c>:3870</c> («No se pudo leer la privacidad actual de este
/// ajuste. No se cambió nada.») no tiene de qué escapar. Allá ese <c>catch</c> atrapa lo que se rompa <i>armado</i>
/// la lista de reglas; aquí la lista se arma a partir de valores ya validados, así que no hay fallo posible que
/// merezca esa frase y no se copia: una negación que no puede ocurrir es peor que un hueco. La de <c>:3869</c>, en
/// cambio, sí tiene gemelo, porque el <c>IllegalArgumentException</c> de <c>validate</c> viaja con su propio
/// mensaje hasta la pantalla en las dos capas.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>privacyGet</c> (<c>:3848-3859</c>). Diez lecturas seguidas, en el orden de <c>PRIVACY_KEYS</c>, que es el
    /// orden en el que la pantalla recorre el array. Allá la recursión va de clave en clave; aquí el mismo recorrido
    /// es un <c>foreach</c>, y el orden sale idéntico.
    /// <para>
    /// Dos cosas que Android hace y aquí no pueden repetirse tal cual. La primera: el <c>try/catch</c> de <c>:3856</c>
    /// se traga el fallo de proyección de una clave y sigue con la siguiente, de modo que su array puede venir con
    /// nueve elementos cuando una falla. Aquí no hay nada que atrapar —la proyección se arma sobre un <c>switch</c>
    /// cerrado sobre los doce tipos que devolvió la reflexión—, así que el array de Windows tiene siempre los diez.
    /// La segunda: cada respuesta se guarda en la caché de personas, que Android no necesita porque TDLib resuelve
    /// los ids con su propio almacén. Sin ese paso, escribir una excepción por persona dependería de que
    /// <c>contacts.list</c> se hubiera llamado antes.
    /// </para>
    /// </summary>
    private async Task<object?> PrivacyAsync()
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var rows = new List<object>(DesktopPrivacy.Keys.Length);
        foreach (var (key, setting) in DesktopPrivacy.Keys)
        {
            var answer = await client.Account_GetPrivacy(setting);
            // La pasada del `perform` de `:475` sobre cada una de las diez lecturas: la respuesta es de la sesión
            // que la pidió, y el array que se estaría armando mezclaría reglas de dos cuentas.
            if (client.User?.id != owner) throw new BridgeException(DesktopPrivacy.ChangedAccount);
            MergePeers(answer.users?.Values, answer.chats?.Values);
            rows.Add(DesktopPrivacy.Row(key, answer.rules));
        }
        return rows;
    }

    /// <summary>
    /// <c>privacySet</c> (<c>:3860-3874</c>). El orden es el de Java línea por línea y no es cosmético: si la
    /// reconstrucción se intentara antes de mirar la forma, un argumento mal formado se confundiría con un ajuste
    /// que Telegram no deja reescribir. La lectura previa va en medio porque la norma de conservar las reglas que la
    /// pantalla no sabe expresar (<c>PrivacyRules.java:12-18</c>) exige saber cuáles había.
    /// </summary>
    private async Task<object?> SetPrivacyAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var key = Raw(args, "key");
        if (!DesktopPrivacy.Shaped(key, DesktopPrivacy.MaxKey)) throw new BridgeException(DesktopPrivacy.BadText);
        var value = Raw(args, "value");
        if (!DesktopPrivacy.Shaped(value, DesktopPrivacy.MaxValue)) throw new BridgeException(DesktopPrivacy.BadText);
        var allow = PrivacyIds(args, "allowUsers");
        var restrict = PrivacyIds(args, "restrictUsers");
        var setting = DesktopPrivacy.Setting(key!);
        var current = await client.Account_GetPrivacy(setting);
        if (client.User?.id != owner) throw new BridgeException(DesktopPrivacy.ChangedAccount);
        MergePeers(current.users?.Values, current.chats?.Values);
        var rules = DesktopPrivacy.Merge(current.rules, value!, allow, restrict, PrivacyInput);
        // La guarda escrita de su puño y letra en `:3871`, entre la reconstrucción y la petición: llega después del
        // `merge` porque allá el `merge` vive dentro del `perform` de la lectura, y el orden de las negaciones es el
        // de esa línea.
        if (client.User?.id != owner) throw new BridgeException(DesktopPrivacy.ChangedAccount);
        await client.Account_SetPrivacy(setting, rules);
        return true;
    }

    /// <summary>
    /// Los dos <c>optionalIds(p, …, 100)</c> de <c>:3863</c>. La ausencia y el array vacío son la lista vacía, igual
    /// que allá; lo que no está bien formado se corta con la causa dicha en español, porque en Android ese rechazo
    /// lo produce <c>BridgePolicy.ids</c> (<c>BridgePolicy.java:58</c>) fuera de cualquier <c>catch</c> propio: sube
    /// al general de <c>NativeBridge.java:165</c> y la pantalla lee «Solicitud no válida o función no disponible».
    /// </summary>
    private static long[] PrivacyIds(JsonElement args, string name)
    {
        var ids = DesktopPrivacy.Ids(Arr(args, name), out var refusal);
        if (refusal != null) throw new BridgeException(refusal);
        return ids;
    }

    /// <summary>
    /// El <c>access_hash</c> de una persona de la lista de excepciones. Es el hueco que TDLib no tiene: allá
    /// <c>UserPrivacySettingRuleAllowUsers</c> lleva <c>long[]</c> y el servidor resuelve solo; aquí la regla se arma
    /// con <c>InputUserBase[]</c> y un hash cero sería una respuesta de Telegram que ninguna pantalla sabe traducir.
    /// La caché la acaban de llenar las lecturas de <c>privacy.get</c> y la de <c>contacts.list</c>; si aun así no
    /// está, se aborta la escritura y no se manda el cero.
    /// </summary>
    private InputUserBase PrivacyInput(long userId)
    {
        var user = _users.GetValueOrDefault(userId);
        if (user == null || user.access_hash == 0) throw new BridgeException(DesktopPrivacy.MissingUser);
        return new InputUser(userId, user.access_hash);
    }
}
