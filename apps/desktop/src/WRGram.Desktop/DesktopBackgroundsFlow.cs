namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de los fondos de la cuenta en Windows (ronda CH-B): dos brazos, uno que lee y otro que pone, y una
/// tercera cosa que la librería no tiene y por eso se niega por su nombre. Las dos claves vivían en «Pendiente» del
/// aviso de alcance desde la ronda CH; desde aquí están cableadas y el aviso las afirma.
/// <para>
/// El orden del brazo que lee es el de <c>backgroundsList</c> (<c>NativeBridge.java:757</c>): pide la cuenta, lee la
/// lista y la recorta al modo pedido. La cuenta la pide <c>CollectionClient</c>; el recorte lo hace el filtro por el
/// bit <c>dark</c> de cada fila, porque <c>account.getWallPapers</c> no tiene parámetro de modo —a diferencia del
/// <c>forDarkTheme</c> de <c>GetInstalledBackgrounds</c>— y devolver las dos listas juntas obligaría a la pantalla a
/// adivinar. Con la lectura publicada, además, salen los dos huecos que la raíz pinta sin que nadie abra el panel:
/// en Android los escribe la tienda local (<c>AccountBackgrounds.java:113</c>) porque su lista no dice cuál está
/// puesto, y aquí los dice la propia respuesta.
/// </para>
/// <para>
/// El brazo que pone reproduce las tres ramas de <c>backgroundSet</c> (<c>NativeBridge.java:758</c>) en el mismo
/// orden —identificador, colores, nada— y solo puede recorrer dos de ellas. Con identificador: releer la lista para
/// sacar el <c>access_hash</c> que la fila trajo, instalar con <c>account.installWallPaper</c> y volver a leer para
/// devolver la fila con su marca real, porque la petición contesta un booleano y no un fondo. Con colores:
/// <see cref="DesktopBackgrounds.NoCreate"/>, que dice la causa medida —la única escritura de un fondo nuevo es
/// <c>account.uploadWallPaper</c> y pide un archivo—. Sin ninguna de las dos: la misma frase de Android.
/// </para>
/// <para>
/// Dos comprobaciones que Android no hace y que aquí no son capa de más. La primera es la del modo: la orden lleva
/// <c>dark</c>, pero la petición no tiene parámetro de modo, así que lo que manda es el bit del fondo elegido; si el
/// panel está viejo y pide el modo contrario, instalar seguiría adelante y pintaría el otro modo. La segunda es la
/// de la fila devuelta: se lee después de instalar en vez de dar por hecho que ya está puesto, porque la marca
/// <c>default_</c> es la que la pantalla marca como elegida y la que pinta la raíz. Si Telegram confirma con
/// <c>true</c> y la releída sigue sin marcarlo, la fila sale sin marcar y el aviso de la pantalla lo dice.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// La lista tal y como la devuelve Telegram, sin convertir. Con el <c>hash</c> en cero a propósito: la petición
    /// puede contestar <c>null</c> cuando la librería traduce un <c>account.wallPapersNotModified</c>, y eso solo
    /// pasa si se le manda un marcador de una lectura anterior. Con cero la respuesta tiene lista o el brazo lo dice.
    private async Task<WallPaperBase[]> InstalledWallPapersAsync()
    {
        var client = CollectionClient();
        var answer = await client.Account_GetWallPapers(0);
        if (answer?.wallpapers == null) throw new BridgeException(DesktopBackgrounds.NoList);
        return answer.wallpapers.Where(item => item != null).ToArray();
    }

    /// <c>backgrounds.list</c> (<c>NativeBridge.java:757</c>): la lista del modo pedido y, de paso, los dos huecos
    /// puestos en el estado para que la raíz los pinte aunque nadie abra el panel.
    private async Task<object?> BackgroundsListAsync(JsonElement args)
    {
        var rows = BackgroundRowDto.Rows(await InstalledWallPapersAsync());
        var dark = Bool(args, "dark");
        PublishCloudSlots(rows);
        return new { rows = rows.FindAll(row => row.Dark == dark) };
    }

    /// <c>background.set</c> (<c>NativeBridge.java:758</c>) en su única forma posible por MTProto con esta
    /// librería: elegir un fondo instalado. El <c>random_id</c> que TDLib pide para toda escritura no existe aquí,
    /// y el fondo creado con colores tampoco, que es lo que dice <see cref="DesktopBackgrounds.NoCreate"/>.
    private async Task<object?> BackgroundSetAsync(JsonElement args)
    {
        var raw = Str(args, "id").Trim();
        var top = Str(args, "top").Trim();
        if (raw.Length == 0 && top.Length == 0) throw new BridgeException(DesktopBackgrounds.Nothing);
        if (raw.Length == 0) throw new BridgeException(DesktopBackgrounds.NoCreate);
        var wanted = DesktopBackgrounds.ParseId(raw) ?? throw new BridgeException(DesktopBackgrounds.BadId);
        var dark = Bool(args, "dark");
        var installed = await InstalledWallPapersAsync();
        var wallpaper = Array.Find(installed, item => item.ID == wanted) ?? throw new BridgeException(DesktopBackgrounds.Gone);
        if (DesktopBackgrounds.IsDark(wallpaper) != dark) throw new BridgeException(DesktopBackgrounds.ModeChanged);
        var client = CollectionClient();
        // La hoja devuelta por la lectura es siempre una de las dos que la librería sabe tener <c>access_hash</c>; si
        // no lo fuera no hay con qué pedirla, y eso es lo mismo que decir que ese fondo ya no está.
        var request = DesktopBackgrounds.InputOf(wallpaper) ?? throw new BridgeException(DesktopBackgrounds.Gone);
        if (!await client.Account_InstallWallPaper(request, wallpaper.Settings))
            throw new BridgeException(DesktopBackgrounds.NotConfirmed);
        var after = BackgroundRowDto.Rows(await InstalledWallPapersAsync());
        PublishCloudSlots(after);
        return after.Find(row => row.Id == raw) ?? throw new BridgeException(DesktopBackgrounds.Gone);
    }

    /// Los dos huecos del estado, escritos con la lista que se acaba de leer. <see cref="BackgroundSlotsDto.Of"/>
    /// deja el hueco libre si ninguna fila de ese modo trae la marca, y eso es lo que hay que publicar: un fondo
    /// puesto en otro aparato puede haber dejado de estarlo, y dejar el viejo pintado sería peor que no pintar ninguno.
    private void PublishCloudSlots(List<BackgroundRowDto> rows)
    {
        _state.Appearance.AccountBackgrounds = BackgroundSlotsDto.Of(rows);
    }

    /// La lectura que pinta el fondo de la cuenta antes de que nadie abra el panel. Va al final del arranque,
    /// después de las carpetas y de la lista de chats, y su fallo se traga: es un adorno de la raíz, no la sesión,
    /// y una cuenta que funciona no puede perderse por no haber podido leer un degradado. Cuando el panel se abra
    /// se volverá a leer, y esa sí avisará.
    private async Task RefreshCloudSlotsAsync()
    {
        try
        {
            PublishCloudSlots(BackgroundRowDto.Rows(await InstalledWallPapersAsync()));
            Push();
        }
        catch { /* Sin lista no hay fondo: la pantalla sigue con el del tema. */ }
    }
}
