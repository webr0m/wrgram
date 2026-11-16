using System.IO;
using System.IO.Compression;
using System.Text;

namespace WRGram.Desktop;

internal static class DesktopDocuments
{
    private const int TextLimit = 256 * 1024;
    private const long ArchiveLimit = 64L * 1024 * 1024;

    internal static string DownloadName(string name, string mime)
    {
        var safe = DesktopAttachment.NameOf(name);
        if (Path.HasExtension(safe)) return safe;
        var suffix = mime switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "video/mp4" => ".mp4",
            "video/webm" => ".webm",
            "application/pdf" => ".pdf",
            "application/zip" => ".zip",
            "text/plain" => ".txt",
            _ => ""
        };
        return safe.TrimEnd('.', ' ') + suffix;
    }

    internal static async Task<object> ReadTextAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        var bytes = new byte[TextLimit];
        var length = await stream.ReadAtLeastAsync(bytes, bytes.Length, false);
        var truncated = stream.ReadByte() != -1;
        using var reader = new StreamReader(new MemoryStream(bytes, 0, length), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return new { text = await reader.ReadToEndAsync(), truncated };
    }

    internal static object ReadArchive(string path)
    {
        using var stream = File.OpenRead(path);
        if (stream.Length > ArchiveLimit) throw new BridgeException("El archivo es demasiado grande para mostrar su índice.");
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        var entries = archive.Entries.Take(200).Select(entry => new
        {
            name = entry.FullName[..Math.Min(entry.FullName.Length, 512)],
            size = entry.Length,
            directory = entry.FullName.EndsWith('/')
        }).ToArray();
        return new { entries, total = archive.Entries.Count };
    }
}

public sealed partial class TelegramService
{
    private async Task<object> PreviewMediaAsync(long id, bool archive)
    {
        if (_client?.User == null || !_media.TryGetFile(id, out var path, out var mime))
            throw new BridgeException("Descarga primero el archivo.");
        var extension = Path.GetExtension(_media.NameOf(id) ?? "").ToLowerInvariant();
        if (archive && mime != "application/zip" && extension is not (".zip" or ".cbz" or ".jar"))
            throw new BridgeException("Este archivo no usa el formato ZIP.");
        if (!archive && !mime.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
            && mime is not ("application/json" or "application/xml")
            && extension is not (".txt" or ".log" or ".md" or ".markdown" or ".csv" or ".tsv" or ".json" or ".xml" or ".html" or ".htm"
                or ".yaml" or ".yml" or ".ini" or ".conf" or ".toml" or ".sql" or ".srt" or ".vtt" or ".nfo" or ".rst" or ".properties"))
            throw new BridgeException("Este archivo no es un documento de texto.");
        try
        {
            return archive ? await Task.Run(() => DesktopDocuments.ReadArchive(path)) : await DesktopDocuments.ReadTextAsync(path);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException)
        {
            throw new BridgeException(archive ? "No se pudo leer el índice del archivo." : "No se pudo leer el archivo.", ex);
        }
    }
}
