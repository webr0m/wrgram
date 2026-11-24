using System.Reflection;
using System.Globalization;
using TL;
using WRGram.Desktop;

// Compila el archivo real del host —no una copia— y le pasa acciones sintéticas: es la única forma de
// ejecutar las frases de llamada de Windows, porque el proyecto de escritorio no tiene pruebas unitarias.
static class Program
{
    static readonly CultureInfo Es = new("es-ES");
    static int casos;
    static int fallos;

    static void Caso(string nombre, string obtenido, string esperado)
    {
        casos++;
        bool ok = obtenido == esperado;
        if (!ok) fallos++;
        Console.WriteLine((ok ? "VERDE  " : "ROJO   ") + nombre + " :: «" + obtenido + "»" + (ok ? "" : "  esperado «" + esperado + "»"));
    }

    // Las filas sintéticas de la ronda CH-B, con la forma medida en .tools/logs/chb-probe-6.txt: `wallPaper`,
    // `wallPaperNoFile` y `wallPaperSettings` tienen constructor sin argumentos y campos públicos, los bits son
    // `creator,default_,has_settings,pattern,dark` en la hoja con archivo, `default_,has_settings,dark` en la que no
    // lo tiene, y `Settings` es la propiedad virtual que cada hoja declara sobre su campo `settings`.
    static WallPaperSettings UnColor(int color) => new()
    {
        flags = WallPaperSettings.Flags.has_background_color,
        background_color = color,
    };

    static WallPaperSettings DosColores(int primero, int segundo, int giro) => new()
    {
        flags = WallPaperSettings.Flags.has_background_color | WallPaperSettings.Flags.has_second_background_color,
        background_color = primero,
        second_background_color = segundo,
        rotation = giro,
    };

    static WallPaperSettings CuatroColores(int uno, int dos, int tres, int cuatro) => new()
    {
        flags = WallPaperSettings.Flags.has_background_color | WallPaperSettings.Flags.has_second_background_color
            | WallPaperSettings.Flags.has_third_background_color | WallPaperSettings.Flags.has_fourth_background_color,
        background_color = uno,
        second_background_color = dos,
        third_background_color = tres,
        fourth_background_color = cuatro,
    };

    static string Pintar(WallPaperBase wallpaper) => DesktopBackgrounds.Css(wallpaper) ?? "nada";

    static string Numero(long? parsed) => parsed == null ? "nulo" : parsed.Value.ToString();

    // Las dos formas de pedir un fondo instalado, contadas como las escribe el brazo: con archivo son dos números,
    // sin archivo uno. Lo que no es ninguna de las dos hojas no tiene petición, y eso es el `Gone` del cable.
    static string Pedir(WallPaperBase wallpaper) => DesktopBackgrounds.InputOf(wallpaper) switch
    {
        InputWallPaper conArchivo => $"{conArchivo.id}/{conArchivo.access_hash}",
        InputWallPaperNoFile sinArchivo => sinArchivo.id.ToString(),
        _ => "sin petición",
    };

    static int Main()
    {
        Caso("uno a uno sin bit, perdida",
            DesktopServiceCalls.PhoneCall(new MessageActionPhoneCall { reason = new PhoneCallDiscardReasonMissed() }),
            "Llamada perdida");
        Caso("uno a uno con bit, interrumpida",
            DesktopServiceCalls.PhoneCall(new MessageActionPhoneCall { flags = MessageActionPhoneCall.Flags.video, reason = new PhoneCallDiscardReasonDisconnect() }),
            "Videollamada interrumpida");
        Caso("uno a uno colgada con cifra",
            DesktopServiceCalls.PhoneCall(new MessageActionPhoneCall { reason = new PhoneCallDiscardReasonHangup(), duration = 65 }),
            "Llamada finalizada · 1 min 5 s");
        Caso("uno a uno ocupada, como en Android",
            DesktopServiceCalls.PhoneCall(new MessageActionPhoneCall { flags = MessageActionPhoneCall.Flags.video, reason = new PhoneCallDiscardReasonBusy(), duration = 3725 }),
            "Videollamada finalizada · 1 h 2 min");
        Caso("uno a uno sin razon ni cifra",
            DesktopServiceCalls.PhoneCall(new MessageActionPhoneCall()),
            "Llamada finalizada");

        Caso("conferencia perdida sin bit de vídeo",
            DesktopServiceCalls.ConferenceCall(new MessageActionConferenceCall { flags = MessageActionConferenceCall.Flags.missed }),
            "Llamada de voz perdida");
        Caso("conferencia en curso con bit de vídeo",
            DesktopServiceCalls.ConferenceCall(new MessageActionConferenceCall { flags = MessageActionConferenceCall.Flags.video | MessageActionConferenceCall.Flags.active }),
            "Videollamada en curso");
        Caso("conferencia en curso sin bit de vídeo",
            DesktopServiceCalls.ConferenceCall(new MessageActionConferenceCall { flags = MessageActionConferenceCall.Flags.active }),
            "Llamada de voz en curso");
        Caso("conferencia con los dos bits, manda la perdida como en Android",
            DesktopServiceCalls.ConferenceCall(new MessageActionConferenceCall { flags = MessageActionConferenceCall.Flags.missed | MessageActionConferenceCall.Flags.active }),
            "Llamada de voz perdida");
        Caso("conferencia finalizada con cifra",
            DesktopServiceCalls.ConferenceCall(new MessageActionConferenceCall { duration = 30 }),
            "Llamada de voz finalizada · 30 s");

        Caso("grupo con cifra, sustantivo sin afirmar el tipo",
            DesktopServiceCalls.GroupCall(new MessageActionGroupCall { flags = MessageActionGroupCall.Flags.has_duration, duration = 125 }),
            "Llamada de grupo finalizada · 2 min 5 s");
        Caso("grupo sin cifra, tampoco se afirma que terminara",
            DesktopServiceCalls.GroupCall(new MessageActionGroupCall()),
            "Llamada de grupo");

        DateTime programada = new(2026, 11, 25, 20, 30, 0, DateTimeKind.Utc);
        Console.WriteLine("       desfase de la máquina en esa fecha: " + TimeZoneInfo.Local.GetUtcOffset(programada) +
                          " — con desfase cero el caso de la hora no podría discriminar el paso a la zona local");
        Caso("grupo programado con hora local",
            DesktopServiceCalls.GroupCallScheduled(new MessageActionGroupCallScheduled { schedule_date = programada }),
            "Llamada de grupo programada · " + programada.ToLocalTime().ToString("d MMM, HH:mm", Es));
        Caso("grupo programado sin hora, sin colgante",
            DesktopServiceCalls.GroupCallScheduled(new MessageActionGroupCallScheduled()),
            "Llamada de grupo programada");

        // La invitación nombrada, que es la ronda CW-D: el actor delante cuando el host lo conoce, la forma pasiva
        // cuando no, «Invitaste» cuando el mensaje es propio y la cuenta «y N más» solo con la lista entera que trae
        // `MessageActionInviteToGroupCall.users`. El relleno lo pone abajo el resolvedor, igual que en Android.
        static string Nombre(long id) => id switch
        {
            1 => "Ana", 2 => "Bruno", 3 => "Carla", 4 => "Dani", 5 => "Elena",
            _ => "Usuario de Telegram",
        };
        Caso("invitación a una, con el actor delante",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana a la llamada de grupo");
        Caso("invitación a dos, con la conjunción y sin comas",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana y Bruno a la llamada de grupo");
        Caso("invitación a tres, los tres nombrados",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2, 3] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana, Bruno y Carla a la llamada de grupo");
        Caso("invitación a cuatro, tres nombres y la cuenta del resto",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2, 3, 4] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana, Bruno, Carla y 1 más a la llamada de grupo");
        Caso("invitación a cinco, la cuenta sube con la lista",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2, 3, 4, 5] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana, Bruno, Carla y 2 más a la llamada de grupo");
        Caso("invitación sin lista, la preposición no queda suelta",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall(), "Diego", Nombre, 0, false),
            "Diego invitó a la llamada de grupo");
        Caso("invitación con el actor desconocido, en pasiva",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2] }, "", Nombre, 0, false),
            "Se invitó a Ana y Bruno a la llamada de grupo");
        Caso("invitación sin actor y sin lista",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall(), "", Nombre, 0, false),
            "Se invitó a la llamada de grupo");
        Caso("uno entre invitados, con actor",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [7, 1] }, "Diego", Nombre, 7, false),
            "Diego te invitó a la llamada de grupo");
        Caso("uno entre invitados, sin actor",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [7] }, "", Nombre, 7, false),
            "Se te invitó a la llamada de grupo");
        Caso("invitación propia con lista",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [1, 2] }, "Diego", Nombre, 7, true),
            "Invitaste a Ana y Bruno a la llamada de grupo");
        Caso("invitación propia sin lista",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall(), "Diego", Nombre, 7, true),
            "Invitaste a la llamada de grupo");
        // El orden de Android se ejecuta aquí: si el mensaje es propio la cadena sale de la rama «Invitaste», y el yo
        // entre invitados no la mueve a «Diego te invitó», que sería lo que encadenar al revés escribiría.
        Caso("invitación propia con yo entre invitados, manda el propio",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [5, 1] }, "Diego", Nombre, 5, true),
            "Invitaste a Elena y Ana a la llamada de grupo");
        Caso("el identificador cero no se cuela en la lista",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [0, 1, 2] }, "Diego", Nombre, 0, false),
            "Diego invitó a Ana y Bruno a la llamada de grupo");
        Caso("lista solo con ceros, sin nombre inventado",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [0] }, "Diego", Nombre, 0, false),
            "Diego invitó a un miembro a la llamada de grupo");
        Caso("el perfil que no ha llegado sale con el relleno de Android",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [99] }, "Diego", Nombre, 0, false),
            "Diego invitó a Usuario de Telegram a la llamada de grupo");
        Caso("el propio cero no coincide con un invitado real",
            DesktopServiceCalls.Invitation(new MessageActionInviteToGroupCall { users = [7] }, "Diego", Nombre, 0, false),
            "Diego invitó a Usuario de Telegram a la llamada de grupo");

        // Las tres banderas de las que depende cada frase, leídas del ensamblado en vez de dichas de memoria.
        var motivos = typeof(MessageActionPhoneCall).Assembly.GetTypes()
            .Where(x => x.Name.StartsWith("PhoneCallDiscardReason")).Select(x => x.Name).OrderBy(x => x);
        Caso("el esquema no conoce el motivo «rechazada»",
            string.Join(",", motivos),
            "PhoneCallDiscardReason,PhoneCallDiscardReasonBusy,PhoneCallDiscardReasonDisconnect," +
            "PhoneCallDiscardReasonHangup,PhoneCallDiscardReasonMigrateConferenceCall,PhoneCallDiscardReasonMissed");
        Caso("qué tipos traen bit de vídeo, medido sobre los Flags anidados",
            string.Join(",", new[]
            {
                typeof(MessageActionPhoneCall).GetNestedType("Flags")!.GetField("video") != null ? "PhoneCall" : "",
                typeof(MessageActionConferenceCall).GetNestedType("Flags")!.GetField("video") != null ? "ConferenceCall" : "",
                typeof(MessageActionGroupCall).GetNestedType("Flags")!.GetField("video") != null ? "GroupCall" : "",
            }),
            "PhoneCall,ConferenceCall,");
        Caso("qué banderas trae la acción de grupo, medidas una por una",
            string.Join(",", typeof(MessageActionGroupCall).GetNestedType("Flags")!
                .GetFields(BindingFlags.Public | BindingFlags.Static).Select(x => x.Name).OrderBy(x => x)),
            "has_duration");

        // ————— Ronda CH-B: los fondos de la cuenta leídos de la lista de MTProto —————
        // El contrato con Android es que las mismas siete claves salgan de las mismas reglas: los tres nombres de
        // tipo son carácter a carácter los de `AccountBackgrounds.kindOf` y el dibujo sale de la misma fórmula de
        // giro que `AccountBackgrounds.css`, con los nombres de campo de acá.
        Caso("relleno sin archivo es relleno", DesktopBackgrounds.KindOf(new WallPaperNoFile()), "fill");
        Caso("archivo con el bit de estampado es estampado",
            DesktopBackgrounds.KindOf(new WallPaper { flags = WallPaper.Flags.pattern }), "pattern");
        Caso("archivo sin estampado es imagen", DesktopBackgrounds.KindOf(new WallPaper()), "wallpaper");
        Caso("el bit oscuro, preguntado en las dos hojas", string.Join(",", new[]
            {
                DesktopBackgrounds.IsDark(new WallPaper { flags = WallPaper.Flags.dark }),
                DesktopBackgrounds.IsDark(new WallPaperNoFile { flags = WallPaperNoFile.Flags.dark }),
                DesktopBackgrounds.IsDark(new WallPaper()),
                DesktopBackgrounds.IsDark(new WallPaperNoFile()),
            }), "True,True,False,False");
        Caso("puesto es el bit default_, y creador no es puesto", string.Join(",", new[]
            {
                DesktopBackgrounds.IsChosen(new WallPaper { flags = WallPaper.Flags.default_ }),
                DesktopBackgrounds.IsChosen(new WallPaper { flags = WallPaper.Flags.creator }),
                DesktopBackgrounds.IsChosen(new WallPaperNoFile { flags = WallPaperNoFile.Flags.default_ }),
                DesktopBackgrounds.IsChosen(new WallPaperNoFile()),
            }), "True,False,True,False");
        Caso("la marca de serie de TDLib no sale en ninguna fila de aquí",
            DesktopBackgrounds.Stock(new WallPaper { flags = WallPaper.Flags.creator | WallPaper.Flags.default_ }) == null
                ? "nulo" : "con marca", "nulo");

        Caso("un color es liso", Pintar(new WallPaperNoFile { settings = UnColor(0x112233) }), "#112233");
        Caso("dos colores son degradado y el giro cero cae hacia abajo",
            Pintar(new WallPaperNoFile { settings = DosColores(0x112233, 0x445566, 0) }),
            "linear-gradient(180deg, #112233, #445566)");
        Caso("el giro noventa de Telegram es el doscientos setenta de CSS",
            Pintar(new WallPaperNoFile { settings = DosColores(0x112233, 0x445566, 90) }),
            "linear-gradient(270deg, #112233, #445566)");
        Caso("el giro doscientos setenta es el noventa",
            Pintar(new WallPaperNoFile { settings = DosColores(0x112233, 0x445566, 270) }),
            "linear-gradient(90deg, #112233, #445566)");
        Caso("un giro pasado de vuelta se recorta, no se pinta con el número gordo",
            Pintar(new WallPaperNoFile { settings = DosColores(0x112233, 0x445566, 405) }),
            "linear-gradient(225deg, #112233, #445566)");
        // El `%` de C# trunca hacia cero: con un solo módulo, un giro de más de medio círculo al revés escribiría
        // «-135deg», que CSS no pinta, y la doble vuelta es lo que iguala el `floorMod` de Android. El -45 de arriba
        // no lo distingue porque ahí el +180 absorbe el signo: por eso este caso vale -315, que es el mismo giro
        // dicho al otro lado.
        Caso("un giro negativo sigue saliendo del lado de Android",
            Pintar(new WallPaperNoFile { settings = DosColores(0x112233, 0x445566, -315) }),
            "linear-gradient(225deg, #112233, #445566)");
        Caso("tres colores salen en orden y de arriba abajo",
            Pintar(new WallPaperNoFile { settings = new WallPaperSettings
            {
                flags = WallPaperSettings.Flags.has_background_color
                    | WallPaperSettings.Flags.has_second_background_color
                    | WallPaperSettings.Flags.has_third_background_color,
                background_color = 0x112233,
                second_background_color = 0x445566,
                third_background_color = 0x778899,
            } }),
            "linear-gradient(180deg, #112233, #445566, #778899)");
        Caso("cuatro colores son la lista libre, sin giro que los ordene",
            Pintar(new WallPaperNoFile { settings = CuatroColores(0x112233, 0x445566, 0x778899, 0xaabbcc) }),
            "linear-gradient(180deg, #112233, #445566, #778899, #aabbcc)");
        Caso("el estampado se pinta con su relleno y el archivo queda sin dibujar",
            Pintar(new WallPaper { flags = WallPaper.Flags.pattern, settings = UnColor(0x112233) }), "#112233");
        Caso("la imagen no se pinta aunque su settings traiga colores",
            Pintar(new WallPaper { settings = UnColor(0x112233) }), "nada");
        Caso("sin ningún bit de color no hay fondo pintable",
            Pintar(new WallPaperNoFile { settings = new WallPaperSettings() }), "nada");
        Caso("sin settings tampoco", Pintar(new WallPaperNoFile()), "nada");

        Caso("el alfa no viaja en estos campos", DesktopBackgrounds.Hex(unchecked((int)0xff112233)), "#112233");
        Caso("un entero negativo no escribe nueve dígitos con su signo",
            DesktopBackgrounds.Hex(-1), "#ffffff");

        Caso("la fila con archivo se pide con su id y su access_hash",
            Pedir(new WallPaper { id = 123, access_hash = 456 }), "123/456");
        Caso("la fila de relleno se pide solo con su id", Pedir(new WallPaperNoFile { id = 77 }), "77");
        Caso("el identificador viaja en texto, no en número",
            DesktopBackgrounds.IdOf(new WallPaper { id = 1234567890123 }), "1234567890123");
        Caso("los espacios no rompen el número, y el signo se acepta como en Java", string.Join(",", new[]
            {
                Numero(DesktopBackgrounds.ParseId(" 42 ")),
                Numero(DesktopBackgrounds.ParseId("-7")),
                Numero(DesktopBackgrounds.ParseId("1234567890123")),
            }), "42,-7,1234567890123");
        // Un texto que no es número no puede quedarse en cero: el cero es un identificador legítimo de la lista y
        // instalaría el fondo equivocado en vez de negarse.
        Caso("lo que no es número sale nulo y lo niega el brazo", string.Join(",", new[]
            {
                Numero(DesktopBackgrounds.ParseId("abc")),
                Numero(DesktopBackgrounds.ParseId("")),
                Numero(DesktopBackgrounds.ParseId("12x")),
                Numero(DesktopBackgrounds.ParseId("99999999999999999999")),
            }), "nulo,nulo,nulo,nulo");

        Console.WriteLine($"casos = {casos}, fallos = {fallos}");
        return fallos == 0 ? 0 : 1;
    }
}
