using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using TL;
using WTelegram;

namespace WRGram.Desktop;

/// <summary>
/// Las dos órdenes de la foto de perfil en Windows: elegir y establecer la foto propia, y quitarla. Las reglas y
/// las frases están en <see cref="DesktopProfilePhoto"/>; aquí está el cable, que es lo que falta en esta ronda —
/// el selector, el descodificador, el diálogo nativo de confirmación y la escritura.
/// <para>
/// En Android el puente se queda con la petición abierta (<c>profilePhotoPicking</c>, <c>NativeBridge.java:531</c>)
/// mientras el sistema muestra el selector y el diálogo de confirmar; aquí las dos ventanas son modales y
/// sincrónicas, así que no hay petición a medias que proteger —y tampoco hace falta la negativa «Ya hay un
/// selector de imagen abierto» (<c>:531</c>), porque dos cuadros modales del mismo proceso no se abultan.
/// </para>
/// <para>
/// El diálogo de confirmar no es un adorno ni una copia del gesto de Android: es lo que hace visible el recorte.
/// Lo que Telegram publica no es el archivo elegido sino el cuadro central de 640 píxeles, y sin enseñarlo la
/// persona aceptaría a ciegas un encuadre que no ha visto. En Windows se pinta en una ventana propia del host con
/// los colores del <c>MainWindow.xaml</c>, porque el host de escritorio no tenía hasta ahora ningún diálogo de
/// pregunta: solo los selectores de archivo de <c>attachment.pick</c> y <c>media.export</c>.
/// </para>
/// <para>
/// La copia del archivo no va a disco. Android escribe un JPEG temporal porque TDLib solo sabe leer una ruta
/// (<c>InputFileLocal</c>, <c>:1695</c>); MTProto sube un <c>Stream</c>, así que el recuadro se queda en memoria y
/// no queda ningún equipaje que borrar —la promesa del diálogo («WRGram no la enviará a sus servidores», y sin
/// copia local) sale más barata de cumplir que en el móvil.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// Lo que <see cref="PreparePhoto"/> saca del archivo elegido: los bytes que se van a subir y la imagen con la
    /// que se pinta la confirmación. Es exactamente el par que Android guarda como <c>profilePhotoFile</c> y
    /// <c>preview</c> (<c>NativeBridge.java:1659</c>), menos el archivo.
    private sealed record PreparedPhoto(byte[] Jpeg, BitmapSource Preview);

    /// <summary>
    /// <c>account.photo.pick</c> (<c>NativeBridge.java:531</c>). Cancelar en el selector o en la confirmación
    /// responde <c>false</c>, como en Android (<c>:1655</c> y <c>:1690</c>); establecerla responde <c>true</c> y
    /// nada de esto es un error.
    /// <para>
    /// El orden es el de <c>pickedProfilePhoto</c>: elegir, preparar, mirar la cuenta, confirmar, mirar la cuenta
    /// otra vez y escribir. Las dos miradas de cuenta son las de <c>:1659</c> y <c>:1693</c>: entre elegir y
    /// confirmar puede haber pasado un cambio de sesión, y la foto no debe escribirse nunca en una cuenta distinta
    /// de la que estaba delante cuando la persona eligió el archivo.
    /// </para>
    /// </summary>
    private async Task<object?> AccountPhotoPickAsync()
    {
        var client = CollectionClient();
        var owner = client.User!.id;
        var chosen = ChoosePhoto(DesktopProfilePhoto.PickFile);
        if (chosen == null) return false;
        var prepared = PreparePhoto(chosen);
        if (CollectionClient().User!.id != owner) throw new BridgeException(DesktopProfilePhoto.ChangedAccount);
        if (!ConfirmPhoto(DesktopProfilePhoto.PickTitle, DesktopProfilePhoto.PickBody, DesktopProfilePhoto.PickAccept, prepared.Preview)) return false;
        if (CollectionClient().User!.id != owner) throw new BridgeException(DesktopProfilePhoto.ChangedAccount);
        var uploaded = await client.UploadFileAsync(new MemoryStream(prepared.Jpeg), "perfil.jpg");
        await client.Photos_UploadProfilePhoto(file: uploaded);
        await RefreshSelfPhotoAsync(client);
        return true;
    }

    /// <summary>
    /// <c>account.photo.delete</c> (<c>NativeBridge.java:532</c>). Sin foto no hay diálogo ni error: Android
    /// responde <c>false</c> cuando <c>GetMe</c> no trae <c>profilePhoto</c> (<c>:1646</c>), y la pantalla ya sabe
    /// que <c>false</c> significa «no cambió nada».
    /// <para>
    /// Lo que Android no tiene que hacer aquí es buscar la foto. <c>DeleteProfilePhoto(photoId)</c> se arregla con
    /// el identificador, pero <c>photos.deletePhotos</c> pide un <c>InputPhoto</c> completo —id,
    /// <c>access_hash</c> y <c>file_reference</c>—, y eso solo lo da <c>photos.getUserPhotos</c>. Esa lectura va
    /// <b>antes</b> del diálogo, no después: ofrecer borrar una foto que este host no puede localizar sería
    /// prometer un botón que va a fallar en la última línea.
    /// </para>
    /// </summary>
    private async Task<object?> AccountPhotoDeleteAsync()
    {
        var client = CollectionClient();
        var self = await SelfAsync(client);
        var photoId = self.photo?.photo_id ?? 0;
        if (photoId <= 0) return false;
        var current = await ResolvePhotoAsync(client, photoId);
        if (!ConfirmPhoto(DesktopProfilePhoto.DeleteTitle, DesktopProfilePhoto.DeleteBody, DesktopProfilePhoto.DeleteAccept, null)) return false;
        if (CollectionClient().User!.id != self.id) throw new BridgeException(DesktopProfilePhoto.ChangedAccount);
        await client.Photos_DeletePhotos([current]);
        await RefreshSelfPhotoAsync(client);
        return true;
    }

    /// Una página de las fotos de la cuenta, buscando la que está publicada como perfil. El límite se deja por
    /// defecto —la librería manda <c>int.MaxValue</c> y Telegram recorta la página él solo—, porque inventar un
    /// número de fotos por página sería una norma que nadie ha medido.
    /// <para>
    /// La conversión a <c>InputPhoto</c> es implícita (<c>PhotoBase.op_Implicit</c>, medida por reflexión): el
    /// método con nombre, <c>PhotoBase.ToInputPhoto()</c>, es <c>protected</c> y no se puede llamar desde aquí.
    /// </para>
    /// </summary>
    private async Task<InputPhoto> ResolvePhotoAsync(Client client, long photoId)
    {
        var page = await client.Photos_GetUserPhotos(new InputUserSelf());
        var found = page.photos.OfType<TL.Photo>().FirstOrDefault(photo => photo.id == photoId);
        if (found == null) throw new BridgeException(DesktopProfilePhoto.NotFound);
        return found;
    }

    /// <summary>
    /// Después de escribir la foto hay que refrescar el avatar, y aquí manda la medición de la ronda AT: la
    /// caché de la librería no se puede reemplazar, así que se vuelve a preguntar a Telegram.
    /// <para>
    /// Lo que la AT no previó es <see cref="DesktopState.ProfilePhoto"/>: se escribe una sola vez al abrir la
    /// sesión, con la instantánea de <c>client.User</c> (<c>TelegramService.cs:532</c>), y además va cacheado en
    /// disco bajo una clave que no cambia nunca (<c>photo:self:&lt;id&gt;</c> en <c>MediaRegistry.cs:76</c>). Sin
    /// borrar ese archivo, cambiar la foto desde otra parte dejaría en la pantalla la foto vieja para siempre.
    /// </para>
    /// </summary>
    private async Task RefreshSelfPhotoAsync(Client client)
    {
        var self = await SelfAsync(client);
        var key = "self:" + self.id;
        _media.Forget(key);
        _state.ProfilePhoto = _media.RegisterProfile(self, self.photo != null, key, _state.Name);
        Push();
    }

    /// El selector de Windows, con el filtro de las extensiones que este host sabe decodificar. Cancelar no es
    /// negativo: es <c>null</c>, que el brazo de arriba traduce a <c>false</c>. El título lo pone cada flujo porque
    /// el cuadro dice lo que se va a elegir, y <c>GetContent</c> de Android no tiene título que poner.
    private static string? ChoosePhoto(string title)
    {
        try
        {
            return Application.Current.Dispatcher.Invoke(() =>
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Title = title,
                    Filter = DesktopProfilePhoto.Filter,
                    CheckFileExists = true,
                    Multiselect = false
                };
                return dialog.ShowDialog() == true ? dialog.FileName : null;
            });
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopProfilePhoto.NoPicker, ex);
        }
    }

    /// <summary>
    /// El <c>preparePhoto</c> de Android (<c>NativeBridge.java:1670-1687</c>) con el descodificador de WPF:
    /// tipo, peso y dimensiones antes de tocar nada; <c>Factor</c> para no meter en memoria un lienzo de 12000
    /// píxeles; el giro y el espejo leídos del EXIF; el recuadro al centro; 640x640; y JPEG a calidad 88.
    /// <para>
    /// Dos cosas se hicieron a mano por lo que se midió en este equipo. La primera es el giro: <c>BitmapImage</c>
    /// devolvió 4032x3024 un JPEG real marcado con orientación 6, o sea que WPF no aplica la orientación, y su
    /// <c>BitmapMetadata</c> tampoco la devuelve (<c>GetQuery</c> lanza <c>InvalidOperationException</c> sobre ese
    /// mismo archivo), así que <c>Orientation</c> la lee de las marcas. La segunda es el orden: girar y después
    /// espejar, en dos pasos separados y medidos los ocho valores contra la tabla canónica de EXIF —componerlos en
    /// una sola matriz, como hace Android, invierte el resultado justo en los valores 5 y 7.
    /// </para>
    /// <para>
    /// Cualquier fallo de la tubería —el archivo no decodifica, el códec no está, la imagen sale vacía— sale con la
    /// frase única de Android, que es la que cubre las cinco negaciones.
    /// </para>
    /// </summary>
    private static PreparedPhoto PreparePhoto(string path)
    {
        var name = Path.GetFileName(path);
        var size = new FileInfo(path).Length;
        if (!DesktopProfilePhoto.IsImage(name) || size > DesktopProfilePhoto.MaxBytes) throw new BridgeException(DesktopProfilePhoto.NoImage);
        byte[] data;
        try
        {
            data = File.ReadAllBytes(path);
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopProfilePhoto.NoImage, ex);
        }
        try
        {
            var orientation = DesktopProfilePhoto.Orientation(data);
            var stored = StoredSize(data);
            var problem = DesktopProfilePhoto.Problem(name, size, stored.Width, stored.Height);
            if (problem != null) throw new BridgeException(problem);
            var factor = DesktopProfilePhoto.Factor(stored.Width, stored.Height);
            var decoded = Decode(data, factor > 1 ? Math.Max(1, stored.Width / factor) : 0);
            var turned = Turn(decoded, orientation);
            var side = DesktopProfilePhoto.CropSide(turned.PixelWidth, turned.PixelHeight);
            var crop = new CroppedBitmap(turned, new Int32Rect(
                DesktopProfilePhoto.CropLeft(turned.PixelWidth, turned.PixelHeight),
                DesktopProfilePhoto.CropTop(turned.PixelWidth, turned.PixelHeight), side, side));
            var scaled = new TransformedBitmap(crop, new ScaleTransform(
                (double)DesktopProfilePhoto.Side / side, (double)DesktopProfilePhoto.Side / side));
            var jpeg = Encode(scaled);
            if (jpeg.Length == 0) throw new BridgeException(DesktopProfilePhoto.NoImage);
            return new PreparedPhoto(jpeg, Decode(jpeg, 0));
        }
        catch (BridgeException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopProfilePhoto.NoImage, ex);
        }
    }

    /// Las dimensiones tal y como están escritas en la cabecera, sin descodificar un solo píxel. Es el equivalente
    /// del <c>inJustDecodeBounds</c> con el que Android comprueba el tope de 12000 (<c>:1675</c>), y se midió aquí:
    /// un <c>BitmapDecoder</c> con <c>DelayCreation</c> devuelve 4032x3024 sobre la foto real sin gastar memoria,
    /// igual en jpeg, png, gif, bmp y tiff.
    private static (int Width, int Height) StoredSize(byte[] data)
    {
        var decoder = BitmapDecoder.Create(new MemoryStream(data), BitmapCreateOptions.DelayCreation, BitmapCacheOption.None);
        var frame = decoder.Frames.FirstOrDefault() ??
            throw new BridgeException(DesktopProfilePhoto.NoImage);
        return (frame.PixelWidth, frame.PixelHeight);
    }

    private static BitmapSource Decode(byte[] data, int decodePixelWidth)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        if (decodePixelWidth > 0) image.DecodePixelWidth = decodePixelWidth;
        image.StreamSource = new MemoryStream(data);
        image.EndInit();
        image.Freeze();
        return image;
    }

    /// Los dos pasos del giro, en el orden canónico de EXIF y con la tabla de <c>NativeBridge.java:1677</c>.
    private static BitmapSource Turn(BitmapSource source, ushort orientation)
    {
        var angle = DesktopProfilePhoto.Turn(orientation);
        if (angle != 0) source = new TransformedBitmap(source, new RotateTransform(angle));
        if (DesktopProfilePhoto.Mirror(orientation)) source = new TransformedBitmap(source, new ScaleTransform(-1, 1));
        return source;
    }

    /// 640x640 en JPEG calidad 88, sin canal alfa: el <c>Config.ARGB_8888</c> de Android comprimido a JPEG deja el
    /// alfa sobre negro, y <c>FormatConvertedBitmap</c> hace lo mismo aquí sin depender de lo que decida el
    /// codificador.
    private static byte[] Encode(BitmapSource source)
    {
        var encoder = new JpegBitmapEncoder { QualityLevel = DesktopProfilePhoto.JpegQuality };
        encoder.Frames.Add(BitmapFrame.Create(new FormatConvertedBitmap(source, PixelFormats.Bgr24, null, 0)));
        using var output = new MemoryStream();
        encoder.Save(output);
        return output.ToArray();
    }

    /// <summary>
    /// El <c>AlertDialog</c> de Android (<c>NativeBridge.java:1690</c> y <c>:1646</c>) hecho ventana de WPF: el
    /// mismo texto, los mismos dos botones y la misma regla de que cerrar la ventana por la equis vale por
    /// «Cancelar». Sale del hilo de la interfaz, como los dos selectores que ya había en el host; la diferencia es
    /// que aquí hay dos botones propios en vez de los del sistema, porque la vista previa de 240 píxeles no cabe en
    /// un <c>MessageBox</c>.
    /// </summary>
    private static bool ConfirmPhoto(string title, string body, string accept, BitmapSource? preview) =>
        Dialog(title, body, accept, DesktopProfilePhoto.Cancel, preview, null) == true;

    /// <summary>
    /// El <c>AlertDialog</c> de un solo botón con su caja seleccionable (<c>NativeBridge.java:1863</c>). Android lo
    /// monta cuando no hay ninguna aplicación a la que pasarle el enlace recién creado; en Windows es el único camino
    /// posible, porque aquí no hay <c>Intent.ACTION_SEND</c>. Se pone el enlace en una caja de lectura, como allá, y
    /// no en el portapapeles: copiar sin que se pida sería escribir en un sitio que la persona no eligió.
    /// </summary>
    private static void Notice(string title, string body, string close, string value) =>
        Dialog(title, body, close, null, null, value);

    /// <summary>
    /// La ventana que comparten los dos cuadros del host. <paramref name="cancel"/> a <c>null</c> deja el
    /// <paramref name="accept"/> como botón único —el diálogo informativo de Android no tiene más—, y
    /// <paramref name="value"/> añade debajo del texto la caja de la que se puede seleccionar y copiar. El foco, en
    /// el botón que niega cuando lo hay: el cuadro de confirmar no se acepta con un golpe de Intro.
    /// </summary>
    private static bool? Dialog(string title, string body, string accept, string? cancel, BitmapSource? preview, string? value) =>
        Application.Current.Dispatcher.Invoke(() =>
        {
            var window = new Window
            {
                Title = title,
                Owner = Application.Current.MainWindow,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                ResizeMode = ResizeMode.NoResize,
                ShowInTaskbar = false,
                SizeToContent = SizeToContent.WidthAndHeight,
                Background = new SolidColorBrush(Color.FromRgb(0x0f, 0x10, 0x12))
            };
            var panel = new StackPanel { Margin = new Thickness(24), MaxWidth = 380 };
            if (preview != null)
                panel.Children.Add(new Image
                {
                    Source = preview, Width = 240, Height = 240, Stretch = Stretch.UniformToFill,
                    HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 16)
                });
            panel.Children.Add(new TextBlock
            {
                Text = body, TextWrapping = TextWrapping.Wrap, FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(0xd6, 0xd4, 0xcf)), Margin = new Thickness(0, 0, 0, 20)
            });
            if (value != null)
                panel.Children.Add(new TextBox
                {
                    Text = value, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, FontSize = 13,
                    Margin = new Thickness(0, 0, 0, 20)
                });
            var buttons = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            var yes = new Button
            {
                Content = accept, MinWidth = 132,
                Margin = new Thickness(0, 0, cancel == null ? 0 : 8, 0), Padding = new Thickness(10, 5, 10, 5)
            };
            yes.Click += (_, _) => window.DialogResult = true;
            buttons.Children.Add(yes);
            Button? no = null;
            if (cancel != null)
            {
                no = new Button { Content = cancel, MinWidth = 104, Padding = new Thickness(10, 5, 10, 5) };
                no.Click += (_, _) => window.DialogResult = false;
                buttons.Children.Add(no);
            }
            panel.Children.Add(buttons);
            window.Content = panel;
            window.Loaded += (_, _) => (no ?? yes).Focus();
            return window.ShowDialog();
        });
}
