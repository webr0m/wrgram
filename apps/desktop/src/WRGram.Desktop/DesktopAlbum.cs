namespace WRGram.Desktop;

using TL;

/// <summary>
/// Reglas del álbum de fotos en Windows, la segunda mitad del adjunto: elegir el lote, mandarlo en una sola
/// petición y leer las piezas que lo forman para poder escribirles un texto. Viven fuera del puente por lo mismo que
/// las de <see cref="DesktopAttachment"/>: casi todas son literales que el espejo del andamio copia carácter a
/// carácter de <c>NativeBridge</c> —de <c>pickedAlbum</c> (<c>NativeBridge.java:5031-5048</c>), de
/// <c>sendAlbum</c> (<c>:4985-4988</c>) y de <c>album</c> (<c>:4032-4038</c>)— y hace falta leerlas sin abrir un
/// selector ni conectar una cuenta.
/// <para>
/// Este host no tiene la frase «Ya hay un selector de álbum abierto.», que en Android sí existe
/// (<c>NativeBridge.java:848</c>): allá el selector es asíncrono y puede quedar una solicitud colgando mientras
/// llega otra. Aquí el diálogo de Windows es modal y sincrónico sobre el hilo de la interfaz, así que dos
/// selectores abiertos a la vez no son un estado alcanzable. Se cuenta aquí para que no se lea como un olvido.
/// </para>
/// <para>
/// Tampoco hay frase de «cuenta o conversación cambió» en la elección, y no es un olvido. Android la necesita porque
/// su selector es asíncrono: copia en un hilo de fondo y al terminar vuelve al principal a comprobar si la persona
/// sigue donde estaba, y si no, tira las copias. Aquí los vales se sellan con la cuenta y la conversación en las que
/// se abrió el selector y se quedan con ellas, así que un salto de pestaña a media copia no manda nada a otro sitio:
/// lo que lo nota es el envío, y lo niega con la frase del lote —ver <see cref="ChangedPieces"/>— sin borrar las
/// fotos, que siguen siendo de la conversación para la que se eligieron.
/// </para>
/// <para>
/// Tampoco hay coma de miniaturas: <c>InputMediaUploadedPhoto</c> admite un <c>thumb</c> que este host deja vacío
/// a propósito, porque generarlo exige decodificar la imagen y ninguna de las dos capas sabe hacerlo hoy.
/// Telegram la calcula en el servidor y la burbuja sale con retrato igual.
/// </para>
/// </summary>
public static class DesktopAlbum
{
    /// Las dos orillas de Android: <c>sendAlbum</c> pide «entre 2 y 10» y <c>pickedAlbum</c> corta por las dos
    /// puntas con dos frases distintas, que son las que la pantalla muestra al elegir.
    public const int Min = 2;
    public const int Max = 10;

    /// Literal de <c>NativeBridge.attachment.album</c>, en el <c>catch</c> de <c>activity.chooseAlbum()</c>.
    public const string NoPicker = "No hay un selector de fotos disponible.";

    /// Literal de <c>pickedAlbum</c> cuando la persona vuelve con una sola foto.
    public const string TooFew = "Elige al menos 2 fotos para crear un álbum.";

    /// Literal de <c>pickedAlbum</c> cuando vuelve con once o más.
    public const string TooMany = "Puedes elegir hasta 10 fotos por álbum.";

    /// Literal del <c>catch</c> de <c>pickedAlbum</c>: Android mete en la misma frase el archivo que no se puede
    /// leer y el que pasa de 32 MB, porque desde la pantalla las dos se ven igual —el álbum no se preparó—, y por
    /// eso el tope se dice dentro de la frase en vez de repetir <see cref="DesktopAttachment.TooBig"/>.
    public const string ImportFailed = "No se pudieron importar las fotos. Límite: 10 imágenes de 32 MB.";

    /// Literal de <c>pickedAlbum</c> para el fallo raro: las fotos están copiadas y algo impide devolver los
    /// vales. En Windows no hay JSON que montar, así que queda escrita por si el disco se queja tarde.
    public const string Prepare = "No se pudo preparar el álbum.";

    /// Literal de <c>sendAlbum</c> sobre el número de vales que llegan. Es otra frase que los dos cortes de la
    /// elección —y así en las dos capas— porque aquí lo que falla es el lote, no la selección.
    public const string Batch = "Elige entre 2 y 10 fotos.";

    /// Literal de <c>sendAlbum</c> cuando hay un envío sin confirmar en el historial.
    public const string Uncertain = "Revisa el envío anterior en el historial antes de enviar un álbum.";

    /// Literal de <c>sendAlbum</c>: un vale que no está, o que es de otra cuenta o de otra conversación, se niega
    /// con la frase del álbum y no con la del archivo suelto, porque aquí se tiraría un lote por una pieza.
    public const string ChangedPieces = "El álbum cambió de conversación.";

    /// Segunda frase que no existe en Android. Allá el selector se abre con <c>image/*</c> y el propio sistema no
    /// deja volver con otra cosa; el de Windows admite «Todos los archivos», así que alguien puede traer un
    /// <c>.pdf</c> o un <c>.heic</c> metidos en un álbum. Se niega con nombre en lugar de mandarlos como foto y
    /// descubrir el tipo en el servidor: TDLib decide sola qué es cada archivo, MTProto no.
    public const string NotPhoto = "Un álbum de Telegram admite fotos: JPG, PNG o WEBP.";

    /// Las tres frases con las que <c>NativeBridge.album</c> (<c>NativeBridge.java:4029-4035</c>) corta el
    /// navegador de textos antes de devolver nada. No hay cuarta: la que Android reserva para el fallo al montar
    /// el JSON («No se pudo consultar el álbum.») no tiene equivalente aquí, porque este puente no serializa a
    /// mano —devuelve un <c>AlbumCaptionDto[]</c> y la conversión ya está fuera del camino—.
    public const string Gone = "El mensaje ya no está disponible.";
    public const string NoAlbum = "Este mensaje no pertenece a un álbum.";
    public const string NoItems = "No se encontraron los elementos del álbum.";

    /// El ancho de la banda que se lee alrededor del mensaje ancla. Android hace <b>dos</b> lecturas de <c>±9</c>
    /// sobre <c>GetChatHistory</c>; aquí basta una, porque <c>messages.getHistory</c> admite <c>add_offset</c>
    /// negativo: la franja empieza <c>Window</c> mensajes más abajo del ancla y trae <c>Window * 3</c> en total, o
    /// sea diez anteriores y diecinueve posteriores. Cabe holgadamente el álbum entero, porque <see cref="Max"/>
    /// fija diez piezas y se envían juntas, así que sus identificadores van seguidos.
    public const int Window = 10;

    /// El <c>grouped_id</c> con el que la interfaz agrupa, en la misma forma en la que lo publica
    /// <c>MessageDto.AlbumId</c>: cadena si el mensaje está en un álbum, <c>null</c> si es un mensaje suelto. Un
    /// <c>grouped_id</c> que no está en los flags o que vale cero no es «el álbum cero», es la ausencia de álbum,
    /// y confundirlos agruparía en una sola burbuja todos los mensajes sueltos de la ventana.
    public static string? AlbumIdOf(Message message)
    {
        var grouped = (message.flags & Message.Flags.has_grouped_id) != 0 ? message.grouped_id : 0L;
        return grouped > 0 ? grouped.ToString() : null;
    }

    /// La negativa con la que el puente responde a una selección fuera de las dos orillas, en el orden de
    /// <c>pickedAlbum</c>: primero el mínimo, después el máximo.
    public static string? CountError(int count) => count < Min ? TooFew : count > Max ? TooMany : null;

    /// Lo mismo para el envío, donde Android tiene una sola frase para las dos puntas.
    public static bool Fits(int count) => count >= Min && count <= Max;
}
