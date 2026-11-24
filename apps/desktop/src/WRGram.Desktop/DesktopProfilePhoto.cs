namespace WRGram.Desktop;

using System;
using System.IO;

/// <summary>
/// Reglas de la foto de perfil en Windows. Son las dos órdenes que Android atiende desde hace rondas
/// —<c>account.photo.pick</c> (<c>NativeBridge.java:544</c>) y <c>account.photo.delete</c>
/// (<c>NativeBridge.java:545</c>)— y que en este host no tenían brazo hasta la ronda AU: la pantalla de escritorio
/// no llegaba a ofrecerlas, porque las dos entradas estaban tapadas con <c>!desktop</c>.
/// <para>
/// Todo lo que aquí se copia viene de <c>NativeBridge.preparePhoto</c> (<c>NativeBridge.java:1691-1708</c>) y de su
/// llamador <c>pickedProfilePhoto</c> (<c>:1674-1682</c>), más los dos diálogos:
/// <c>showProfilePhotoConfirmation</c> (<c>:1708-1711</c>) y <c>deleteAccountPhoto</c> (<c>:1667</c>). Las frases
/// van letra por letra, porque en Android no son decoración: son lo único que la persona lee cuando algo sale mal o
/// cuando tiene que decidir.
/// </para>
/// <para>
/// La parte que no se parece en nada es el descodificador, y está medida en este equipo con un JPEG real de
/// 4032x3024 marcado con orientación EXIF 6 (<see cref="Orientation"/>): <c>BitmapImage</c> de WPF lo devolvió
/// 4032x3024, es decir <b>no aplica la orientación por sí solo</b>, y su <c>BitmapMetadata</c> tampoco la sabe
/// leer (<c>GetQuery("/App1/IFD/{System.UInt16=274}")</c> lanza <c>InvalidOperationException</c> y la variante con
/// nombre propio devuelve vacío). Así que el giro se lee de las marcas del archivo y se aplica a mano, como hace
/// Android con <c>ExifInterface</c> (<c>:1698</c>).
/// </para>
/// <para>
/// El orden del giro y del espejo sí cambia entre las dos capas, y es la diferencia más fina de la ronda. La
/// tabla de valores —<see cref="Turn"/> y <see cref="Mirror"/>, copiada de la línea de <c>rotation</c> de
/// <c>NativeBridge.java:1698</c>— es idéntica, pero Android
/// compone las dos operaciones con <c>matrix.postRotate(r)</c> seguido de <c>matrix.postScale(-1,1)</c>, lo que
/// aplica primero el espejo y después el giro; el orden canónico de EXIF es el contrario (girar y luego espejar),
/// y para los valores 2, 3, 4, 6 y 8 los dos órdenes dan el mismo resultado, así que el error solo se ve en los 5
/// y 7. Windows aplica los dos pasos por separado, en el orden canónico. Se deja escrito en vez de replicar el
/// gesto de Android: en el 5 y el 7 Android publica un reflejo del recorte correcto.
/// </para>
/// <para>
/// Lo que sí se conserva sin discusión es el resultado final: recuadro al centro del lado menor, 640x640 y JPEG a
/// calidad 88, que es lo que Telegram llega a publicar. Por eso la pantalla enseña exactamente ese cuadro antes
/// de subir nada, igual que el diálogo nativo de Android (<c>NativeBridge.java:1709-1719</c>).
/// </para>
/// </summary>
public static class DesktopProfilePhoto
{
    /// <c>cursor.getLong(0)&gt;20L*1024*1024</c> de <c>preparePhoto</c> (<c>NativeBridge.java:1695</c>).
    public const long MaxBytes = 20L * 1024 * 1024;

    /// <c>bounds.outWidth&gt;12000 || bounds.outHeight&gt;12000</c> (<c>NativeBridge.java:1696</c>).
    public const int MaxPixels = 12000;

    /// El <c>while(max/factor&gt;2048) inSampleSize*=2</c> de <c>NativeBridge.java:1697</c>, que en WPF es
    /// <c>DecodePixelWidth</c> y solo se pone cuando de verdad recorta.
    public const int DecodeLimit = 2048;

    /// <c>Bitmap.createScaledBitmap(crop,640,640,true)</c> (<c>NativeBridge.java:1699</c>).
    public const int Side = 640;

    /// <c>scaled.compress(Bitmap.CompressFormat.JPEG,88,stream)</c> (<c>NativeBridge.java:1700</c>).
    public const int JpegQuality = 88;

    /// La única frase que sale del descarte de Android (<c>NativeBridge.java:1705</c>): las cinco negaciones —no
    /// es imagen, pesa más de 20 MB, no tiene dimensiones legibles, pasa de 12000 píxeles y no decodifica— caben
    /// en una sola cadena, y aquí caben en la misma.
    public const string NoImage = "No se pudo preparar la imagen. Elige una foto válida de hasta 20 MB.";

    /// Literal de <c>NativeBridge.java:1680</c> y <c>:1714</c>: la cuenta que estaba abierta al elegir ya no es la
    /// abierta cuando hay que escribir.
    public const string ChangedAccount = "La cuenta cambió. No se estableció la foto.";

    /// <c>setTitle</c> del diálogo de confirmar (<c>NativeBridge.java:1711</c>).
    public const string PickTitle = "Confirmar foto de perfil";

    /// <c>setMessage</c> del mismo diálogo (<c>NativeBridge.java:1711</c>). Es la promesa de privacidad de la
    /// ronda: lo que sube es el recuadro que se está viendo, no el archivo entero, y no se guarda ninguna copia.
    public const string PickBody = "Esta foto se establecerá en Telegram. No se cambiará su privacidad y WRGram no la enviará a sus servidores.";

    /// <c>setPositiveButton</c> de <c>NativeBridge.java:1711</c>.
    public const string PickAccept = "Establecer foto";

    /// <c>setTitle</c> del diálogo de borrar (<c>NativeBridge.java:1667</c>).
    public const string DeleteTitle = "Eliminar foto de perfil";

    /// <c>setMessage</c> del mismo (<c>NativeBridge.java:1667</c>).
    public const string DeleteBody = "La foto actual se quitará de tu perfil de Telegram. WRGram no conserva una copia.";

    /// <c>setPositiveButton("Eliminar foto",…)</c> de <c>NativeBridge.java:1667</c>.
    public const string DeleteAccept = "Eliminar foto";

    /// <c>setNegativeButton("Cancelar",…)</c> de <c>NativeBridge.java:1667</c>, que aparece en los dos diálogos y en los dos responde
    /// <c>answer.ok(false)</c>: cancelar no es un error, es una decisión.
    public const string Cancel = "Cancelar";

    /// <c>setTitle</c> del selector de Android, que es el del sistema; en Windows lo escribe el propio diálogo.
    public const string PickFile = "Elegir la foto de perfil";

    /// <summary>
    /// La única negativa que no está en Android. Borrar una foto en MTProto no se hace con el identificador que
    /// trae <c>users.getUsers</c>: <c>photos.deletePhotos</c> pide un <c>InputPhoto</c> con su <c>access_hash</c> y
    /// su <c>file_reference</c>, y eso solo lo da <c>photos.getUserPhotos</c>. Si esa lectura no trae la foto que
    /// la cuenta dice tener, no se finge el borrado: se dice. TDLib no puede fallar así porque su
    /// <c>DeleteProfilePhoto(photoId)</c> (<c>NativeBridge.java:1667</c>) se arregla solo con el id.
    /// </summary>
    public const string NotFound = "Telegram no devolvió tu foto actual; vuelve a abrir el perfil e inténtalo otra vez.";

    /// La frase de Android cuando el selector lanza (<c>attachment.pick</c>, <c>NativeBridge.java:845</c>) sirve
    /// igual aquí, pero en Windows el selector es del sistema y no puede faltar, así que esta solo cubre que el
    /// diálogo sea rechazado por el propio Windows.
    public const string NoPicker = "No hay un selector de imágenes disponible.";

    /// Extensiones que WPF decodifica en este equipo, medidas una por una con los codificadores de la propia
    /// librería de PresentationCore (<c>PngBitmapEncoder</c> y compañía, leídos y re-leídos sin error). No está
    /// <c>webp</c>: WPF no trae ese códec, mientras que el <c>BitmapFactory</c> de Android sí lo decodifica, así
    /// que un .webp se niega con <see cref="NoImage"/>. Se decide por extensión porque el selector de Windows no
    /// da el tipo de contenido que <c>ContentResolver.getType</c> sí le da a Android (<c>:1673</c>).
    public static readonly string[] Extensions = ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff"];

    /// El filtro que ve la persona en el selector: la lista de arriba, en el formato de <c>OpenFileDialog</c>. Se
    /// ofrece además «Todos los archivos», porque en Windows la persona puede escribir la extensión a mano y la
    /// negativa honesta está en <see cref="Problem"/>, no en un cuadro de diálogo que escondiera el archivo.
    public static string Filter => $"Imágenes|{string.Join(";", Array.ConvertAll(Extensions, item => "*." + item))}|Todos los archivos|*.*";

    public static bool IsImage(string name)
    {
        var dot = name.LastIndexOf('.');
        if (dot < 0) return false;
        var extension = name[(dot + 1)..].ToLowerInvariant();
        return Array.Exists(Extensions, item => item == extension);
    }

    /// El <c>inSampleSize</c> de Android: se duplica hasta que el lado mayor quepa en 2048. Con las dimensiones
    /// <b>almacenadas</b>, que son las que ve <c>bounds.outWidth</c> antes de cualquier giro.
    public static int Factor(int width, int height)
    {
        var factor = 1;
        while (Math.Max(width, height) / factor > DecodeLimit) factor *= 2;
        return factor;
    }

    /// <c>Math.min(oriented.getWidth(), oriented.getHeight())</c> (<c>NativeBridge.java:1699</c>). Va después del
    /// giro, igual que en Android: un retrato con orientación 6 tiene el lado menor en el eje contrario a sus
    /// dimensiones almacenadas.
    public static int CropSide(int width, int height) => Math.Min(width, height);

    /// <c>(oriented.getWidth() - side) / 2</c>, el origen del recuadro al centro.
    public static int CropLeft(int width, int height) => (width - CropSide(width, height)) / 2;

    /// <c>(oriented.getHeight() - side) / 2</c>.
    public static int CropTop(int width, int height) => (height - CropSide(width, height)) / 2;

    /// <c>rotation</c> de <c>NativeBridge.java:1698</c>: 3 y 4 giran 180, 5 y 6 giran 90, 7 y 8 giran 270.
    public static int Turn(ushort orientation) => orientation switch
    {
        3 or 4 => 180,
        5 or 6 => 90,
        7 or 8 => 270,
        _ => 0
    };

    /// <c>flip</c> de la misma línea: los valores 2, 4, 5 y 7 llevan espejo horizontal.
    public static bool Mirror(ushort orientation) => orientation is 2 or 4 or 5 or 7;

    /// <summary>
    /// Las cuatro negaciones de Android que caben en una frase, en el orden en que Android las comprueba: el tipo
    /// (<c>:1673</c>), el peso (<c>:1674</c>) y las dimensiones leídas de las marcas (<c>:1675</c>). Queda una
    /// quinta que no se puede escribir aquí —el archivo existe pero no decodifica (<c>:1676</c>)— y la lanza el
    /// cable con la misma cadena.
    /// </summary>
    public static string? Problem(string name, long bytes, int width, int height)
    {
        if (!IsImage(name)) return NoImage;
        if (bytes > MaxBytes) return NoImage;
        if (width <= 0 || height <= 0 || width > MaxPixels || height > MaxPixels) return NoImage;
        return null;
    }

    /// <summary>
    /// La orientación EXIF (etiqueta 274) leída de las marcas del archivo, sin descodificar píxeles. Se lee solo
    /// el encabezado porque APP1 va pegado al SOI: con 256 KiB leídos de un JPEG de cámara sobra, y así no se
    /// mete un archivo de 20 MB en memoria para averiguar cuatro bytes.
    /// <para>
    /// Medido con la cabecera del <c>BitmapMetadata</c> de WPF y con este parser sobre un JPEG real: el parser da
    /// 6, la consulta de WPF no da nada. Mismo orden de comprobación que <c>ExifInterface</c> en Android: valores
    /// 3/4→180, 5/6→90, 7/8→270 y espejo en 2/4/5/7. Un archivo sin APP1, sin IFD0 o sin la etiqueta vale 1, que
    /// es «tal cual».
    /// </para>
    /// </summary>
    public static ushort Orientation(byte[] head)
    {
        if (head.Length < 4 || head[0] != 0xFF || head[1] != 0xD8) return 1;
        for (var at = 2; at + 14 < head.Length;)
        {
            if (head[at] != 0xFF) return 1;
            var marker = head[at + 1];
            if (marker is 0xDA or 0xD9) return 1;
            if (marker == 0x01 || marker is >= 0xD0 and <= 0xD7 or 0xFE or 0xCC) { at += 2; continue; }
            var size = Be16(head, at + 2);
            if (marker == 0xE1 && size >= 8 && head[at + 4] == (byte)'E' && head[at + 5] == (byte)'x' &&
                head[at + 6] == (byte)'i' && head[at + 7] == (byte)'f')
            {
                var value = IfdOrientation(head, at + 10, size - 8);
                if (value != 0) return value;
            }
            at += 2 + size;
        }
        return 1;
    }

    /// IFD0 dentro del bloque TIFF: cabecera «II»/«MM», magia 42, desplazamiento al IFD, recuento de entradas y
    /// entradas de doce bytes. Se salta el sub-IFD y los EXIF de la miniatura porque la orientación vive en IFD0.
    private static ushort IfdOrientation(byte[] head, int tiff, int available)
    {
        if (available < 8 || tiff + 8 > head.Length) return 0;
        var little = head[tiff] == 0x49 && head[tiff + 1] == 0x49;
        var magic = little ? (ushort)(head[tiff + 2] | head[tiff + 3] << 8) : (ushort)(head[tiff + 2] << 8 | head[tiff + 3]);
        if (magic != 42) return 0;
        var offset = little ? (int)Le32(head, tiff + 4) : (int)Be32(head, tiff + 4);
        var ifd = tiff + offset;
        if (offset < 8 || ifd + 2 > head.Length || ifd - tiff > available) return 0;
        var count = little ? (ushort)(head[ifd] | head[ifd + 1] << 8) : (ushort)(head[ifd] << 8 | head[ifd + 1]);
        for (ushort index = 0; index < count; index++)
        {
            var entry = ifd + 2 + index * 12;
            if (entry + 12 > head.Length) return 0;
            var tag = little ? (ushort)(head[entry] | head[entry + 1] << 8) : (ushort)(head[entry] << 8 | head[entry + 1]);
            if (tag != 274) continue;
            return little ? (ushort)(head[entry + 8] | head[entry + 9] << 8) : (ushort)(head[entry + 8] << 8 | head[entry + 9]);
        }
        return 0;
    }

    private static ushort Be16(byte[] head, int at) => (ushort)(head[at] << 8 | head[at + 1]);

    // Los cuatro operandos se convierten a uint antes de mezclarlos: sin el cast del último byte el compilador
    // promueve el entero con signo y avisa de la extensión (CS0675).
    private static uint Be32(byte[] head, int at) =>
        (uint)head[at] << 24 | (uint)head[at + 1] << 16 | (uint)head[at + 2] << 8 | (uint)head[at + 3];

    private static uint Le32(byte[] head, int at) =>
        (uint)head[at] | (uint)head[at + 1] << 8 | (uint)head[at + 2] << 16 | (uint)head[at + 3] << 24;
}
