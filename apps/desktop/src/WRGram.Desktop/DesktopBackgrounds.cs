namespace WRGram.Desktop;

using System;
using TL;

/// <summary>
/// Las reglas de los fondos de la cuenta en Windows (ronda CH-B). El otro lado es
/// <c>AccountBackgrounds.rows</c> (<c>AccountBackgrounds.java:99</c>) y su <c>row</c> (<c>AccountBackgrounds.java:87</c>),
/// llamadas desde <c>NativeBridge.backgroundsList</c> (<c>NativeBridge.java:754</c>) y
/// <c>NativeBridge.backgroundSet</c> (<c>NativeBridge.java:755</c>); la pantalla es la misma en las dos capas
/// (<c>CloudBackgrounds.tsx:13</c>), así que las siete claves de la fila son las del contrato
/// <c>CloudBackground</c> y no se añade ni se quita ninguna.
/// <para>
/// Lo medido antes de escribir una línea, con la sonda <c>.tools/chb-dump</c> sobre el ensamblado empaquetado
/// (WTelegramClient 4.4.10, capturas en <c>.tools/logs/chb-probe-3.txt</c> y <c>.tools/logs/chb-probe-4.txt</c>):
/// <c>Account_GetWallPapers(client, hash = 0) -&gt; Task&lt;Account_WallPapers&gt;</c> y
/// <c>Account_InstallWallPaper(client, InputWallPaperBase wallpaper, WallPaperSettings settings) -&gt; Task&lt;bool&gt;</c>,
/// ambas en <c>TL.SchemaExtensions</c>. La respuesta de la lectura es <c>{ hash, wallpapers: WallPaperBase[] }</c>, y
/// <c>WallPaperBase</c> solo expone dos cosas: <c>ID</c> (Int64) y <c>Settings</c> (<c>WallPaperSettings</c>).
/// </para>
/// <para>
/// <b>Las tres marcas de la fila no son las mismas en las dos capas, y aquí se dice cuáles son.</b> En TDLib
/// <c>Background</c> trae <c>isDefault</c> («one of default backgrounds», o sea de serie) y el elegido se lo inventa
/// Android porque su lista no lo dice: sale de la tienda de los dos huecos que escribe
/// <c>UpdateDefaultBackground</c>. En MTProto es al revés: el bit <c>default_</c> de <c>WallPaper.Flags</c> y de
/// <c>WallPaperNoFile.Flags</c> —los dos medidos, y los nombres completos de los dos enumerados son
/// <c>creator, default_, has_settings, pattern, dark</c> y <c>default_, has_settings, dark</c>— significa «el puesto
/// en este modo», así que <c>selected</c> viene en la propia respuesta y <c>stock</c> no viene en ninguna parte.
/// <c>creator</c> no es su gemelo: dice «esta cuenta lo creó», y un fondo recibido por enlace es las dos cosas a la
/// vez ni una ni otra. Por eso <c>Stock</c> sale <c>null</c> en todas las filas de este host: la marca no existe, y
/// la pantalla deja de escribir la palabra en vez de poner una aproximación.
/// </para>
/// <para>
/// <b>Tampoco hay nombre.</b> <c>wallPaper</c> trae <c>slug</c>, que el documento de la librería define como la
/// dirección opaca de los enlaces de fondo, y <c>wallPaperNoFile</c> no trae ningún campo de texto. Android sí
/// recibe <c>name</c> de TDLib. Aquí la fila sale con <c>Name</c> vacío y la pantalla la etiqueta por su tipo
/// (<c>cloudBackgroundLabel</c> en <c>cloud-backgrounds.ts</c>), que es lo único que se puede afirmar sin inventar.
/// </para>
/// <para>
/// <b>El CSS es el mismo cálculo con otros nombres.</b> TDLib pone los colores dentro de un
/// <c>BackgroundType</c> que envuelve un <c>BackgroundFill</c>; MTProto los pone todos en
/// <c>WallPaperSettings</c> y dice cuáles hay con sus bits: <c>has_background_color</c>,
/// <c>has_second_background_color</c>, <c>has_third_background_color</c> y <c>has_fourth_background_color</c> —los
/// ocho nombres medidos del enumerado son <c>has_background_color, blur, motion, has_intensity,
/// has_second_background_color, has_third_background_color, has_fourth_background_color, has_emoticon</c>—. Con un
/// color es liso; con dos, degradado con el <c>rotation</c>, que el documento describe igual que el
/// <c>rotationAngle</c> de TDLib («clockwise rotation angle of the gradient, in degrees; 0-359. Should be always
/// divisible by 45») y por eso pasa por la misma conversión de abajo; con tres o cuatro, la lista en orden. Una
/// imagen no se pinta: <c>wallpaper</c> lleva su archivo en <c>document</c> y este host no lo baja, que es el aviso
/// que la fila ya dice. Lo mismo con el estampado: el bit <c>pattern</c> lo nombra, y se pinta su relleno.
/// </para>
/// </summary>
public static class DesktopBackgrounds
{
    /// Los tres nombres de <c>kind</c> que este host puede producir, carácter a carácter con los de
    /// <c>AccountBackgrounds.java:26</c>, <c>AccountBackgrounds.java:27</c> y <c>AccountBackgrounds.java:28</c>.
    /// El cuarto de Android —<c>chatTheme</c>— no sale aquí: MTProto no mete temas de chat en esta lista.
    public const string Fill = "fill";
    public const string Wallpaper = "wallpaper";
    public const string Pattern = "pattern";

    /// <c>AccountBackgrounds.NOTHING</c> (<c>AccountBackgrounds.java:33</c>), gemela de la que Android pronuncia
    /// cuando la orden no trae ni identificador ni colores.
    public const string Nothing = "Hay que decir qué fondo elegir o qué colores ponerle.";

    /// <c>NativeBridge.java:5476</c>: el identificador que no es un número de Telegram. Aquí lo decide
    /// <see cref="ParseId"/> en vez de un <c>long.parseLong</c> sobre <c>BridgePolicy.id</c>
    /// (<c>NativeBridge.java:5474</c>), y la frase es la misma.
    public const string BadId = "El identificador del fondo no vale.";

    /// La negativa de crear. No es la del beta genérico: el brazo existe, lo que no existe es la petición. Medido
    /// con la sonda: la única escritura de un fondo nuevo es <c>account.uploadWallPaper</c>, cuyo parámetro
    /// <c>file</c> documenta «The JPG/PNG wallpaper», y <c>wallPaperNoFile</c> —el relleno de color puro, que es lo
    /// que Android crea con <c>SetDefaultBackground</c> de fondo nulo— no tiene ninguna petición que lo fabrique por
    /// su nombre en WTelegramClient 4.4.10.
    public const string NoCreate = "Windows no puede crear un fondo de color: la única forma de escribir uno nuevo "
        + "es subir una imagen, y aquí no hay imagen que subir.";

    /// Android se niega con «La cuenta cambió.» si la cuenta cambia a mitad de la lectura (<c>backgroundsList</c>,
    /// <c>NativeBridge.java:5448-5457</c>) y la pantalla convierte cualquier respuesta sin <c>rows</c> en «No se han podido
    /// leer los fondos de la cuenta.» (<c>CloudBackgrounds.tsx:40</c>). La otra forma de no traer filas es que Telegram
    /// no devuelva lista: allá sale una fila vacía (<c>rows</c>, <c>AccountBackgrounds.java:101</c>), aquí una negativa
    /// por su nombre.
    public const string NoList = "Telegram no devolvió ninguna lista de fondos. Vuelve a intentarlo.";

    /// El fondo que ya no está instalado, medido en la lista recién leída. Android lo dice con la frase del beta
    /// porque TDLib acepta un <c>InputBackgroundRemote</c> sin comprobarlo; aquí el <c>access_hash</c> sale de esa
    /// misma lista, así que sin fila no hay ni con qué pedirlo.
    public const string Gone = "Ese fondo ya no está en la cuenta. Vuelve a leer la lista.";

    /// La respuesta <c>false</c> de <c>account.installWallPaper</c>. La petición devuelve un booleano y no un fondo,
    /// así que es la única confirmación que da el protocolo antes de releer la lista.
    public const string NotConfirmed = "Telegram no confirmó el fondo.";

    /// El modo pedido no es el del fondo: la lista se filtra por modo y la petición no lleva modo ninguno, porque
    /// el que manda es el bit <c>dark</c> del propio fondo. Seguir adelante pintaría el otro modo.
    public const string ModeChanged = "Ese fondo es del otro modo. Vuelve a leer la lista.";

    /// El tipo con su nombre estable, en el orden que obliga la jerarquía medida: <c>wallPaperNoFile</c> hay que
    /// preguntarlo antes que <c>wallPaper</c> porque las dos cuelgan de <c>WallPaperBase</c> y ninguna deriva de la
    /// otra. Un relleno sin archivo es <c>fill</c> por definición —el documento lo describe como «wallpaper only
    /// based on colors/gradients»—; una fila con archivo y su bit <c>pattern</c> es estampado, y el resto son
    /// imágenes.
    public static string KindOf(WallPaperBase wallpaper) => wallpaper switch
    {
        WallPaperNoFile => Fill,
        WallPaper file when IsPattern(file) => Pattern,
        WallPaper => Wallpaper,
        _ => "",
    };

    /// La marca de estampado, solo en la hoja con archivo: <c>wallPaperNoFile</c> no declara ese bit.
    public static bool IsPattern(WallPaper file) => (file.flags & WallPaper.Flags.pattern) != 0;

    /// El modo al que pertenece el fondo. Los dos enumerados tienen su <c>dark</c>, y el documento lo define como
    /// «whether this wallpaper should be used in dark mode», que es la pregunta que hace la pantalla al filtrar.
    public static bool IsDark(WallPaperBase wallpaper) => wallpaper switch
    {
        WallPaper file => (file.flags & WallPaper.Flags.dark) != 0,
        WallPaperNoFile solid => (solid.flags & WallPaperNoFile.Flags.dark) != 0,
        _ => false,
    };

    /// El fondo puesto en su modo. Es el bit <c>default_</c> de la propia respuesta, que en MTProto significa
    /// «puesto», no «de serie»: la diferencia con el <c>isDefault</c> de TDLib está escrita arriba, en la explicación
    /// de por qué <see cref="Stock"/> sale nulo.
    public static bool IsChosen(WallPaperBase wallpaper) => wallpaper switch
    {
        WallPaper file => (file.flags & WallPaper.Flags.default_) != 0,
        WallPaperNoFile solid => (solid.flags & WallPaperNoFile.Flags.default_) != 0,
        _ => false,
    };

    /// La marca de «de serie» de TDLib no tiene traducción en MTProto y <c>creator</c> no es esa marca: devuelve
    /// siempre <c>null</c> para que la pantalla omita la palabra en vez de afirmar una aproximación.
    public static bool? Stock(WallPaperBase wallpaper) => null;

    /// El CSS con el que la pantalla pinta el relleno, o <c>null</c> si no hay relleno que pintar. La imagen se
    /// queda en <c>null</c> aunque su <c>settings</c> traiga colores de reserva: pintarlos sería enseñar un fondo
    /// liso donde la cuenta tiene una foto, y Android hace lo mismo: su <c>fillOf</c>
    /// (<c>AccountBackgrounds.java:72-75</c>) solo saca el relleno del tipo de relleno y del de estampado, y deja el
    /// <c>BackgroundTypeWallpaper</c> sin <c>fill</c>, que es lo que aquí devuelve <c>null</c>.
    public static string? Css(WallPaperBase wallpaper) => KindOf(wallpaper) == Wallpaper ? null : Paint(wallpaper.Settings);

    /// Los colores que la respuesta dice que hay, en el orden de Telegram y con su formato. Un color es liso; dos
    /// son degradado con el giro; tres o cuatro son la lista libre, escrita siempre de arriba abajo igual que en
    /// <c>AccountBackgrounds.java:67</c>. Cero colores no es un fondo pintable, y cinco no los puede haber porque
    /// el cuarto es el último campo.
    public static string? Paint(WallPaperSettings? settings)
    {
        if (settings == null) return null;
        var stops = new List<string>();
        if ((settings.flags & WallPaperSettings.Flags.has_background_color) != 0) stops.Add(Hex(settings.background_color));
        if ((settings.flags & WallPaperSettings.Flags.has_second_background_color) != 0) stops.Add(Hex(settings.second_background_color));
        if ((settings.flags & WallPaperSettings.Flags.has_third_background_color) != 0) stops.Add(Hex(settings.third_background_color));
        if ((settings.flags & WallPaperSettings.Flags.has_fourth_background_color) != 0) stops.Add(Hex(settings.fourth_background_color));
        return stops.Count switch
        {
            1 => stops[0],
            2 => $"linear-gradient({Angle(settings.rotation)}deg, {stops[0]}, {stops[1]})",
            3 or 4 => "linear-gradient(180deg, " + string.Join(", ", stops) + ")",
            _ => null,
        };
    }

    /// El giro que manda Telegram, pasado al sistema de CSS del mismo modo que en
    /// <c>AccountBackgrounds.java:56</c>: Telegram mide en sentido horario desde la vertical y CSS desde abajo, así
    /// que a los grados del protocolo hay que sumarles medio giro. El módulo dos veces, y no una, porque un
    /// <c>rotation</c> negativo seguiría saliendo negativo en C# (<c>%</c> trunca hacia cero) y el resultado de la
    /// fórmula de Android nunca baja de cero. Con -45 las dos fórmulas coinciden porque el +180 absorbe el signo,
    /// así que lo que obliga al doble módulo es un giro de más de medio círculo al revés: -315 sale 225 en Android
    /// y saldría -135 con uno solo, y ese es el caso que mira la sonda.
    public static int Angle(int rotation)
    {
        var normalized = ((rotation % 360) + 360) % 360;
        return (180 + normalized) % 360;
    }

    /// El color entero de Telegram como <c>#rrggbb</c>. La máscara es la de <c>AccountBackgrounds.java:212</c>
    /// (<c>color &amp; 0xffffff</c>): el alfa no viaja en estos campos, y sin ella un entero negativo escribiría
    /// nueve dígitos con su signo.
    public static string Hex(int color) => $"#{color & 0xffffff:x6}";

    /// El <c>InputWallPaper</c> con el que se pide un fondo instalado. El <c>access_hash</c> no se puede inventar ni
    /// reutilizar de otra lectura: sale de la fila que se acaba de releer, y por eso el brazo llama a
    /// <c>InstalledWallPapersAsync</c> antes de instalar. Un relleno sin archivo se nombra con <c>InputWallPaperNoFile</c>
    /// y su único campo. Lo que no es ninguna de las dos hojas medidas devuelve nulo, y es el brazo —no esta
    /// regla— el que lo niega con <see cref="Gone"/>: aquí no se lanza nada, igual que en las demás clases puras del
    /// host, para que la sonda <c>.tools/cwb-probe</c> pueda compilar este archivo sin arrastrar el cable.
    public static InputWallPaperBase? InputOf(WallPaperBase wallpaper) => wallpaper switch
    {
        WallPaper file => new InputWallPaper { id = file.id, access_hash = file.access_hash },
        WallPaperNoFile solid => new InputWallPaperNoFile { id = solid.id },
        _ => null,
    };

    /// El identificador tal y como lo escribe la pantalla: en texto, porque un <c>long</c> de Telegram no cabe en
    /// JavaScript sin redondearse —la misma razón que lleva a Android a mandarlo con <c>String.valueOf</c> en
    /// <c>AccountBackgrounds.java:89</c>—.
    public static string IdOf(WallPaperBase wallpaper) => wallpaper.ID.ToString();

    /// La lectura estricta del identificador que llega del puente: dígitos con su signo y nada más, que es lo que
    /// <c>BridgePolicy.id</c> exige en Android antes de escribir <c>backgroundId</c>. Un texto vacío no es un
    /// identificador malo: es la otra rama de la orden, y la decide el brazo antes de llamar aquí. Lo que no se
    /// parsea sale nulo y lo niega el brazo con <see cref="BadId"/>.
    public static long? ParseId(string value)
    {
        if (!long.TryParse(value.Trim(), System.Globalization.NumberStyles.AllowLeadingSign,
            System.Globalization.CultureInfo.InvariantCulture, out var parsed)) return null;
        return parsed;
    }
}
