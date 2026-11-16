using System.IO;
using System.Net.Http.Headers;

namespace WRGram.Desktop;

internal sealed record DesktopMediaResponse(Stream? Body, int Status, string Reason, string Headers)
{
    internal static DesktopMediaResponse Open(string path, string mediaType, string? range, bool head)
    {
        var mime = MediaTypeHeaderValue.TryParse(mediaType, out var parsed) && !mediaType.Any(char.IsControl)
            ? parsed.MediaType : "application/octet-stream";
        var headers = $"Content-Type: {mime}\r\nAccept-Ranges: bytes";
        var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
        var size = file.Length;
        if (head)
        {
            file.Dispose();
            return new(null, 200, "OK", $"{headers}\r\nContent-Length: {size}");
        }
        if (range == null)
            return new(file, 200, "OK", $"{headers}\r\nContent-Length: {size}");

        if (!TryReadRange(range, size, out var start, out var end))
        {
            file.Dispose();
            return new(null, 416, "Range Not Satisfiable", $"{headers}\r\nContent-Range: bytes */{size}");
        }
        var length = end - start + 1;
        return new(new MediaSegment(file, start, length), 206, "Partial Content",
            $"{headers}\r\nContent-Length: {length}\r\nContent-Range: bytes {start}-{end}/{size}");
    }

    private static bool TryReadRange(string header, long size, out long start, out long end)
    {
        start = 0;
        end = size - 1;
        if (size == 0 || !RangeHeaderValue.TryParse(header, out var range)
            || !range.Unit.Equals("bytes", StringComparison.OrdinalIgnoreCase) || range.Ranges.Count != 1) return false;
        var part = range.Ranges.Single();
        if (part.From is long from)
        {
            start = from;
            end = Math.Min(end, part.To ?? end);
            return start <= end;
        }
        if (part.To is not long suffix || suffix == 0) return false;
        start = Math.Max(0, size - suffix);
        return true;
    }

    private sealed class MediaSegment : Stream
    {
        private readonly FileStream _file;
        private readonly long _start;

        public MediaSegment(FileStream file, long start, long length)
        {
            _file = file;
            _start = start;
            Length = length;
            _file.Position = start;
        }

        public override bool CanRead => _file.CanRead;
        public override bool CanSeek => _file.CanSeek;
        public override bool CanWrite => false;
        public override long Length { get; }
        public override long Position
        {
            get => _file.Position - _start;
            set => Seek(value, SeekOrigin.Begin);
        }

        public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));
        public override int Read(Span<byte> buffer) => _file.Read(buffer[..(int)Math.Min(buffer.Length, Length - Position)]);
        public override long Seek(long offset, SeekOrigin origin)
        {
            var position = origin switch
            {
                SeekOrigin.Begin => offset,
                SeekOrigin.Current => checked(Position + offset),
                SeekOrigin.End => checked(Length + offset),
                _ => throw new ArgumentOutOfRangeException(nameof(origin))
            };
            if (position < 0 || position > Length) throw new IOException("La posición queda fuera del segmento.");
            _file.Position = _start + position;
            return position;
        }
        public override void Flush() { }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing) _file.Dispose();
            base.Dispose(disposing);
        }
    }
}
