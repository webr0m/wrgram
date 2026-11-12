import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Folder, LoaderCircle, Search } from 'lucide-react';
import { mediaUrl, request } from './bridge';
import type { Media } from './contract';
import { Modal } from './dialogs';

const PdfPreview = lazy(() => import('./PdfPreview'));
type Format = 'pdf' | 'text' | 'archive' | 'video';
type ArchiveEntry = { name: string; size: number; directory: boolean };
type FileData = { text?: string; truncated?: boolean; entries?: ArchiveEntry[]; total?: number };

export function documentFormat(media: Pick<Media, 'mime' | 'name'>): Format | undefined {
  const mime = media.mime.toLowerCase().split(';')[0].trim();
  if (mime === 'application/pdf' || /\.pdf$/i.test(media.name)) return 'pdf';
  if (mime.startsWith('video/') || /\.(mp4|m4v|mkv|webm|mov|avi|3gp|mpg|mpeg|mts|m2ts|ts|ogv|flv)$/i.test(media.name)) return 'video';
  if (/\.(zip|cbz|jar)$/i.test(media.name) || (mime === 'application/zip' && !/\.(docx|xlsx|pptx|odt|ods|odp|epub)$/i.test(media.name))) return 'archive';
  if (mime.startsWith('text/') || /^(application\/(json|xml))$/.test(mime) ||
    /\.(txt|log|md|markdown|csv|tsv|json|xml|html?|yaml|yml|ini|conf|toml|sql|srt|vtt|nfo|rst|properties)$/i.test(media.name)) return 'text';
}

export function DocumentViewer({ media, format, close }: { media: Media; format: Exclude<Format, 'video'>; close(): void }) {
  const [data, setData] = useState<FileData>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const limited = (format === 'pdf' && media.size > 160 * 1024 * 1024) || (format === 'archive' && media.size > 64 * 1024 * 1024);
  useEffect(() => {
    if (format === 'pdf' || limited) return;
    let active = true;
    void request<FileData>(format === 'text' ? 'media.text' : 'media.archive', { id: media.id })
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo abrir el archivo.'); });
    return () => { active = false; };
  }, [media.id, format, limited]);
  const entries = useMemo(() => data?.entries?.filter(entry => entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [data, query]);
  async function action(method: 'media.open' | 'media.export') {
    setSaving(true); setActionError('');
    try { await request(method, { id: media.id }); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No se pudo abrir el archivo.'); }
    finally { setSaving(false); }
  }
  return <Modal title={media.name || 'Documento de Telegram'} className="document-modal" close={close}>
    {limited ? <p role="status" className="settings-note">Este archivo supera el tamaño de vista previa. Puedes usar un visor de Android si Telegram permite abrirlo fuera de WRGram.</p>
      : format === 'pdf' ? <Suspense fallback={<p role="status">Preparando el visor de PDF…</p>}><PdfPreview url={mediaUrl(media.id)}/></Suspense>
      : error ? <p role="alert">{error}</p>
      : !data ? <p role="status"><LoaderCircle className="spin" size={16}/> Leyendo archivo…</p>
      : format === 'text' ? <>{data.truncated && <p className="settings-note">Vista previa de los primeros 256 KB.</p>}
        <pre className="text-file-preview">{data.text || 'Archivo vacío.'}</pre></>
      : <>
        <label className="document-filter"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en el índice" aria-label="Buscar en el índice"/></label>
        <p className="settings-note">{data.entries?.length ?? 0} de {data.total ?? 0} entradas · vista del índice</p>
        <ul className="archive-entries">{entries?.map((entry, index) => <li key={index}>
          {entry.directory ? <Folder size={17}/> : <FileText size={17}/>}<span>{entry.name}</span>
          {!entry.directory && <small>{Math.ceil(entry.size / 1024).toLocaleString()} KB</small>}
        </li>)}</ul>
      </>}
    {media.exportable !== false && <div className="document-actions">
      <button type="button" className="secondary" disabled={saving} onClick={() => void action('media.open')}><ExternalLink size={15}/> Abrir con otra app</button>
      <button type="button" className="secondary" disabled={saving} onClick={() => void action('media.export')}><Download size={15}/> Guardar</button>
    </div>}
    {actionError && <p role="status">{actionError}</p>}
  </Modal>;
}
