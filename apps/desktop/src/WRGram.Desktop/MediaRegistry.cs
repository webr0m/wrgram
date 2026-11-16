using System.IO;
using System.Security.Cryptography;
using System.Text;
using TL;
using WTelegram;

namespace WRGram.Desktop;

public sealed class MediaRegistry
{
    private sealed record Entry(
        long Id,
        string Mime,
        string Name,
        string Kind,
        long Size,
        Func<Client, Stream, Task> Download,
        bool Exportable = true);

    private readonly object _sync = new();
    private readonly Dictionary<long, Entry> _entries = new();
    private readonly Dictionary<long, TaskCompletionSource<string?>> _tasks = new();
    private readonly HashSet<long> _failed = new();
    private readonly string _directory;
    private readonly Func<Client?> _client;

    public event Action? Changed;

    public MediaRegistry(DesktopStore store, Func<Client?> client)
    {
        _directory = store.MediaDirectory;
        _client = client;
    }

    private string PathFor(long id) => Path.Combine(_directory, id + ".bin");

    public MediaDto? RegisterPhoto(Photo photo, string name = "Foto", bool exportable = true)
    {
        var size = photo.LargestPhotoSize?.FileSize ?? 0;
        var entry = new Entry(photo.id, "image/jpeg", name, "image", size,
            (client, stream) => client.DownloadFileAsync(photo, stream, photo.LargestPhotoSize, null), exportable);
        var dto = Register(entry);
        var small = photo.sizes.OfType<PhotoSize>().Where(item => item.w >= 120 && item.w <= 480)
            .OrderBy(item => item.w).FirstOrDefault();
        if (dto != null && small != null && small != photo.LargestPhotoSize)
        {
            var thumb = new Entry(StableId("photo-thumb:" + photo.id), "image/jpeg", name, "image", small.FileSize,
                (client, stream) => client.DownloadFileAsync(photo, stream, small, null), exportable);
            dto.Thumbnail = Register(thumb);
        }
        return dto;
    }

    public MediaDto? RegisterDocument(Document document, bool exportable = true)
    {
        var mime = string.IsNullOrWhiteSpace(document.mime_type) ? "application/octet-stream" : document.mime_type;
        var name = string.IsNullOrWhiteSpace(document.Filename) ? "Archivo" : document.Filename!;
        var kind = KindOf(mime, document);
        var entry = new Entry(document.id, mime, name, kind, document.size,
            (client, stream) => client.DownloadFileAsync(document, stream, (PhotoSizeBase?)null, null), exportable);
        var dto = Register(entry);
        if (dto != null && document.LargestThumbSize is { } thumb && kind != "image")
        {
            var thumbId = StableId("thumb:" + document.id);
            var thumbEntry = new Entry(thumbId, "image/jpeg", "Miniatura", "image", thumb.FileSize,
                (client, stream) => client.DownloadFileAsync(document, stream, thumb, null), exportable);
            dto.Thumbnail = Register(thumbEntry);
        }
        return dto;
    }

    public MediaDto? RegisterProfile(TL.IPeerInfo peer, bool hasPhoto, string ownerKey, string name)
    {
        if (!hasPhoto) return null;
        var id = StableId("photo:" + ownerKey);
        var entry = new Entry(id, "image/jpeg", name, "image", 0,
            (client, stream) => client.DownloadProfilePhotoAsync(peer, stream, big: false, miniThumb: false));
        return Register(entry);
    }

    /// <summary>
    /// Olvida la foto de perfil de <paramref name="ownerKey"/>: quita sus alias del registro y borra el archivo de
    /// disco. Hace falta porque <see cref="RegisterProfile"/> deriva el identificador de una clave que no cambia
    /// nunca (<c>photo:self:&lt;id&gt;</c>); sin esto, la foto vieja seguiría sirviéndose después de cambiarla.
    /// </summary>
    public void Forget(string ownerKey)
    {
        var raw = StableId("photo:" + ownerKey);
        lock (_sync)
        {
            var aliases = _entries.Where(pair => pair.Value.Id == raw).Select(pair => pair.Key).ToList();
            foreach (var alias in aliases)
            {
                _entries.Remove(alias);
                if (_tasks.Remove(alias, out var pending)) pending.SetResult(null);
                _failed.Remove(alias);
            }
            try { File.Delete(PathFor(raw)); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private MediaDto? Register(Entry entry)
    {
        // Telegram IDs are 64-bit. Keep them for disk paths and give the WebView a safe alias.
        const long maxSafeId = (1L << 53) - 1;
        var alias = Math.Max(1, entry.Id & maxSafeId);
        bool ready;
        lock (_sync)
        {
            while (_entries.TryGetValue(alias, out var existing) && existing.Id != entry.Id)
                alias = alias == maxSafeId ? 1 : alias + 1;
            if (_entries.TryGetValue(alias, out var previous) && !previous.Exportable)
                entry = entry with { Exportable = false };
            _entries[alias] = entry;
            ready = File.Exists(PathFor(entry.Id));
        }
        return new MediaDto
        {
            Id = alias,
            Ready = ready,
            Mime = entry.Mime,
            Kind = entry.Kind,
            Name = entry.Name,
            Size = entry.Size,
            Exportable = entry.Exportable
        };
    }

    public Task<string?> EnsureFileAsync(long id)
    {
        Entry entry;
        TaskCompletionSource<string?> pending;
        lock (_sync)
        {
            if (!_entries.TryGetValue(id, out entry!)) return Task.FromResult<string?>(null);
            var path = PathFor(entry.Id);
            if (File.Exists(path)) return Task.FromResult<string?>(path);
            if (_tasks.TryGetValue(id, out var running)) return running.Task;
            pending = new(TaskCreationOptions.RunContinuationsAsynchronously);
            _tasks.Add(id, pending);
            _failed.Remove(id);
        }
        _ = DownloadAsync(id, entry, pending);
        return pending.Task;
    }

    private async Task DownloadAsync(long id, Entry entry, TaskCompletionSource<string?> pending)
    {
        var path = PathFor(entry.Id);
        var temp = $"{path}.{Guid.NewGuid():N}.part";
        try
        {
            Changed?.Invoke();
            var client = _client() ?? throw new BridgeException("La cuenta no está conectada.");
            Directory.CreateDirectory(_directory);
            await using (var stream = File.Create(temp))
                await entry.Download(client, stream);
            lock (_sync)
            {
                // Forget puede liberar este alias y arrancar otra descarga mientras llega la anterior.
                if (!ReferenceEquals(_tasks.GetValueOrDefault(id), pending)) return;
                File.Move(temp, path, overwrite: true);
                _tasks.Remove(id);
                pending.SetResult(path);
            }
        }
        catch (Exception error)
        {
            lock (_sync)
            {
                if (!ReferenceEquals(_tasks.GetValueOrDefault(id), pending)) return;
                _tasks.Remove(id);
                _failed.Add(id);
                pending.SetException(error);
            }
        }
        finally
        {
            try { File.Delete(temp); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        Changed?.Invoke();
    }

    public string? NameOf(long id)
    {
        lock (_sync) return _entries.TryGetValue(id, out var entry) ? entry.Name : null;
    }

    public bool Known(long id) { lock (_sync) return _entries.ContainsKey(id); }
    public bool IsLoading(long id) { lock (_sync) return _tasks.ContainsKey(id); }
    public bool IsFailed(long id) { lock (_sync) return _failed.Contains(id); }

    /// <summary>Null cuando el alias no existe en esta sesión; true cuando el archivo ya está en disco.</summary>
    public bool? IsReady(long id)
    {
        lock (_sync) return _entries.TryGetValue(id, out var entry) ? File.Exists(PathFor(entry.Id)) : null;
    }

    public (string Name, string Kind, long Size)? MetaOf(long id)
    {
        lock (_sync) return _entries.TryGetValue(id, out var entry) ? (entry.Name, entry.Kind, entry.Size) : null;
    }

    public bool CanExport(long id)
    {
        lock (_sync) return _entries.TryGetValue(id, out var entry) && entry.Exportable;
    }

    public bool TryGetFile(long id, out string path, out string mime)
    {
        path = "";
        mime = "application/octet-stream";
        lock (_sync)
        {
            if (!_entries.TryGetValue(id, out var entry)) return false;
            path = PathFor(entry.Id);
            mime = entry.Mime;
        }
        return File.Exists(path);
    }

    public List<long> ReadyIds() { lock (_sync) return _entries.Where(pair => File.Exists(PathFor(pair.Value.Id))).Select(pair => pair.Key).Take(1500).ToList(); }
    public List<long> LoadingIds() { lock (_sync) return _tasks.Keys.ToList(); }
    public List<long> FailedIds() { lock (_sync) return _failed.ToList(); }

    public int RetryFailed()
    {
        List<long> failed;
        lock (_sync) failed = _failed.ToList();
        foreach (var id in failed) _ = RetryAsync(id);
        return failed.Count;
    }

    private async Task RetryAsync(long id)
    {
        try { await EnsureFileAsync(id); }
        catch { /* El fallo ya se refleja en FailedIds para que la interfaz pueda reintentar. */ }
    }

    private static string KindOf(string mime, Document document)
    {
        if (mime is "application/x-tgsticker" or "application/x-tgs") return "sticker";
        if (document.attributes?.Any(attribute => attribute is DocumentAttributeSticker) == true && mime.StartsWith("image/")) return "sticker";
        if (mime.StartsWith("image/")) return "image";
        if (mime.StartsWith("video/")) return "video";
        if (mime.StartsWith("audio/")) return "audio";
        return "file";
    }

    private static long StableId(string value)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        var id = BitConverter.ToInt64(hash, 0) & long.MaxValue;
        return id == 0 ? 1 : id;
    }
}
