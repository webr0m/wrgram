import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus, RotateCw } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let active = true;
    const task = getDocument({
      url, disableStream: true, disableAutoFetch: true, enableXfa: false,
      disableFontFace: true, useWasm: false, maxImageSize: 24_000_000,
      canvasMaxAreaInBytes: 32_000_000,
    });
    void task.promise.then(pdf => { if (active) setDocument(pdf); }).catch(reason => {
      if (!active) return;
      setBusy(false);
      setError(reason?.name === 'PasswordException' ? 'Este PDF está protegido con contraseña. Ábrelo en un visor compatible.' : 'No se pudo leer este PDF.');
    });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [url]);
  useEffect(() => {
    const host = viewport.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setWidth(host.clientWidth));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const surface = canvas.current;
    if (!document || !surface || width < 40) return;
    let active = true;
    let rendering: RenderTask | undefined;
    setBusy(true);
    setError('');
    void document.getPage(page).then(async pdfPage => {
      if (!active) return;
      const angle = (pdfPage.rotate + rotation) % 360;
      const unit = pdfPage.getViewport({ scale: 1, rotation: angle });
      const scale = Math.min(4, (width - 20) * zoom / unit.width);
      const display = pdfPage.getViewport({ scale, rotation: angle });
      const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(5_000_000 / (display.width * display.height)));
      surface.width = Math.max(1, Math.floor(display.width * density));
      surface.height = Math.max(1, Math.floor(display.height * density));
      surface.style.width = `${display.width}px`;
      surface.style.height = `${display.height}px`;
      rendering = pdfPage.render({ canvas: surface, viewport: display, transform: [density, 0, 0, density, 0, 0] });
      await rendering.promise;
      if (active) setBusy(false);
    }).catch(() => { if (active) { setBusy(false); setError('No se pudo mostrar esta página.'); } });
    return () => { active = false; rendering?.cancel(); };
  }, [document, page, rotation, width, zoom]);
  const selectPage = (value: number) => setPage(Math.min(document?.numPages || 1, Math.max(1, value)));
  return <div className="document-preview">
    <div className="document-toolbar" aria-label="Controles del PDF">
      <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => selectPage(page - 1)}><ChevronLeft size={18}/></button>
      <label className="document-pages"><input key={page} type="number" min={1} max={document?.numPages} defaultValue={page} aria-label="Ir a la página" disabled={!document}
        onBlur={event => { selectPage(Math.trunc(Number(event.currentTarget.value)) || page); event.currentTarget.value = String(Math.min(document?.numPages || 1, Math.max(1, Math.trunc(Number(event.currentTarget.value)) || page))); }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/> / {document?.numPages ?? '–'}</label>
      <button type="button" aria-label="Página siguiente" disabled={!document || page >= document.numPages} onClick={() => selectPage(page + 1)}><ChevronRight size={18}/></button>
      <button type="button" aria-label="Alejar" disabled={zoom <= 0.75} onClick={() => setZoom(value => Math.max(0.75, value - 0.25))}><Minus size={17}/></button>
      <button type="button" aria-label="Acercar" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.25))}><Plus size={17}/></button>
      <button type="button" aria-label="Girar página" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={17}/></button>
    </div>
    <div className="document-sheet" ref={viewport} aria-busy={busy}>
      {busy && <p role="status"><LoaderCircle className="spin" size={16}/> Cargando PDF…</p>}
      {error && <p role="alert">{error}</p>}
      <canvas ref={canvas} aria-label={`Página ${page} del PDF`} hidden={!!error || !document}/>
    </div>
  </div>;
}
