using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

namespace WRGram.Desktop;

/// <summary>
/// Las cuatro órdenes del perfil propio en Windows: leer la cuenta y escribir nombre, biografía y nombre público.
/// Las reglas y las frases están en <see cref="DesktopAccountProfile"/>; aquí solo está el cable, que es lo que
/// faltaba — las peticiones existen en WTelegramClient 4.4.10 desde siempre y el puente Android las atiende desde
/// <c>NativeBridge.java:534</c> y <c>:535-537</c>.
/// <para>
/// La medición que cambió el diseño a mitad de ronda, escrita para que no se vuelva a intentar: el plan era
/// reconciliar la caché de la librería asignando <c>client.User</c> con la <c>TL.User</c> que devuelven las
/// escrituras, y parecía confirmado por haber visto la propiedad pública con setter. Reflexionado
/// WTelegramClient 4.4.10, ese <c>set_User</c> es **privado** y no existe un <c>GetMe()</c> público: la asignación
/// no compila. Lo que se hace entonces es lo mismo que hace Android, que tampoco reusa un objeto guardado — su
/// <c>accountProfile</c> empieza con un <c>GetMe</c> nuevo (<c>NativeBridge.java:1661</c>)—: cada lectura del
/// perfil vuelve a preguntar a Telegram.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>account.profile</c>, el DTO que la pantalla de «Mi perfil de Telegram» y el resumen del menú de cuenta
    /// consumen. Se lee dos veces, como en Android (<c>NativeBridge.java:1663</c>, <c>GetMe</c> y dentro
    /// <c>GetUserFullInfo</c>): lo que la cuenta es (<c>users.getUsers([self])</c>, de donde salen los nombres, el
    /// móvil, los nombres públicos y la foto) y lo que la cuenta escribe de sí misma
    /// (<c>users.getFullUser(self)</c>, de donde salen la biografía y el cumpleaños).
    /// <para>
    /// Tres claves del DTO de Android no se rellenan en Windows y ninguna se finge. <c>bioEntities</c> no puede
    /// existir: MTProto manda <c>about</c> como cadena sola, sin la lista paralela de entidades que TDLib sí
    /// publica, así que la biografía se ve como texto plano y sin enlaces pulsables. <c>business</c> no se traduce
    /// —en MTProto vive repartido en otros campos y necesita su propia ronda—, y la pantalla omite el bloque. El
    /// resto está tal cual: los nombres, el público activo, el editable, el móvil, el id, la foto y el cumpleaños.
    /// </para>
    /// </summary>
    private async Task<object?> AccountProfileAsync()
    {
        var client = CollectionClient();
        var self = await SelfAsync(client);
        var page = await client.Users_GetFullUser(new InputUserSelf());
        var info = page.full_user ?? throw new BridgeException(DesktopAccountProfile.NotRead);
        return new
        {
            id = self.id.ToString(),
            firstName = self.first_name ?? "",
            lastName = self.last_name ?? "",
            username = DesktopAccountProfile.ShownUsername(self.usernames),
            usernames = DesktopAccountProfile.ActiveUsernames(self.usernames),
            editableUsername = DesktopAccountProfile.EditableUsername(self.usernames),
            bio = info.about ?? "",
            photoId = DesktopAccountProfile.PhotoId(self.photo),
            phoneNumber = self.phone ?? "",
            birthday = DesktopAccountProfile.Birthday(info.birthday)
        };
    }

    /// <summary>
    /// La cuenta tal y como está ahora mismo en Telegram. Se pide siempre, porque es la única forma honesta de que
    /// un cambio escrito se vea escrito: <c>client.User</c> es la instantánea con la que se abrió la sesión y este
    /// puente no tiene manera de reemplazarla. Si la lectura fresca no trajera un <c>TL.User</c> completo se usa
    /// esa instantánea, que trae los mismos campos aunque puedan venir viejos.
    /// </summary>
    private async Task<TL.User> SelfAsync(Client client)
    {
        var fresh = await client.Users_GetUsers([new InputUserSelf()]);
        return fresh.OfType<TL.User>().FirstOrDefault() ?? client.User ??
            throw new BridgeException(DesktopAccountProfile.NotRead);
    }

    /// <summary>
    /// <c>account.name</c>. Los dos nombres viajan siempre, aunque la persona solo haya tocado uno: es lo que hace
    /// Android con <c>SetName(first,last)</c>, y en MTProto es obligatorio —<c>account.updateProfile</c> no parchea,
    /// y un <c>null</c> aquí dejaría el apellido viejo colgado mientras la pantalla ya enseña el nuevo. Por eso
    /// <see cref="ApplyProfileAsync"/> recibe los huecos sin tocar como <c>null</c> y los que sí se escriben como
    /// cadena: <c>""</c> borra, <c>null</c> no toca.
    /// </summary>
    private async Task<object?> AccountNameAsync(JsonElement args)
    {
        var client = CollectionClient();
        var first = Raw(args, "firstName");
        var last = Raw(args, "lastName");
        var problem = DesktopAccountProfile.NameProblem(first, last);
        if (problem != null) throw new BridgeException(problem);
        await ApplyProfileAsync(client, DesktopAccountProfile.FirstName(first!), DesktopAccountProfile.LastName(last!), null);
        return true;
    }

    /// <c>account.bio</c>: la biografía normalizada (<see cref="DesktopAccountProfile.Bio"/>) viaja con los nombres
    /// en <c>null</c>, que es la única forma de no moverlos. Vacía es un valor legítimo: borra la biografía, y por
    /// eso el puente la escribe como cadena y no como hueco.
    private async Task<object?> AccountBioAsync(JsonElement args)
    {
        var client = CollectionClient();
        var raw = Raw(args, "bio");
        var problem = DesktopAccountProfile.BioProblem(raw);
        if (problem != null) throw new BridgeException(problem);
        await ApplyProfileAsync(client, null, null, DesktopAccountProfile.Bio(raw!));
        return true;
    }

    /// <summary>
    /// <c>account.username</c>. Aquí sí hay una petición propia (<c>account.updateUsername</c>) y la cadena vacía
    /// significa quitar el nombre, igual que en TDLib. Los rechazos que Telegram dice con nombre se traducen
    /// (<see cref="DesktopAccountProfile.UsernameRefusal"/>); los demás viajan tal cual los dijo Telegram, porque
    /// una causa inventada para un código no medido engaña más que el código.
    /// </summary>
    private async Task<object?> AccountUsernameAsync(JsonElement args)
    {
        var client = CollectionClient();
        var raw = Raw(args, "username");
        var problem = DesktopAccountProfile.UsernameProblem(raw);
        if (problem != null) throw new BridgeException(problem);
        try
        {
            RefreshSelf(await client.Account_UpdateUsername(DesktopAccountProfile.Username(raw!)));
        }
        catch (RpcException rpc)
        {
            var refusal = DesktopAccountProfile.UsernameRefusal(rpc.Message);
            if (refusal == null) throw;
            throw new BridgeException(refusal);
        }
        return true;
    }

    private async Task ApplyProfileAsync(Client client, string? first, string? last, string? about)
    {
        // La respuesta no se descarta: `account.updateProfile` devuelve la `TL.User` ya escrita, y eso es lo único
        // fresco que hay en este hilo hasta la siguiente lectura.
        RefreshSelf(await client.Account_UpdateProfile(first, last, about));
    }

    /// <summary>
    /// Lo que Android hace con <c>schedule()</c> al terminar las tres escrituras (<c>NativeBridge.java:548-550</c>):
    /// avisar a la interfaz de que vuelva a pedir lo suyo. El equivalente en Windows es refrescar
    /// <c>state.name</c> —el rótulo del avatar, del menú de cuenta y de la lista de cuentas— y empujar el estado;
    /// el resto (biografía, nombre público, foto) no vive en el estado sino en <c>account.profile</c>, que releer a
    /// Telegram cada vez que la pantalla lo abre.
    /// </summary>
    private void RefreshSelf(UserBase updated)
    {
        if (updated is TL.User user) _state.Name = FullName(user);
        Push();
    }
}
