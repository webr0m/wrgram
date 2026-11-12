import { useEffect, useState } from 'react';

type Run = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;
type Invite = { link: string; name: string; chatIds: string[] };

export function FolderLinks({ id, run }: { id: number; run: Run }) {
  const [links, setLinks] = useState<Invite[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Invite>();
  const [revoke, setRevoke] = useState('');

  async function refresh() {
    setError('');
    const rows = await run<Invite[]>('folders.links.list', { id });
    if (rows) setLinks(rows);
    else setError('No se pudieron cargar los enlaces de esta carpeta.');
  }
  useEffect(() => { void refresh(); }, [id]);

  async function update(method: 'edit' | 'delete', link: string, options = {}) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const done = await run<boolean>(method === 'edit' ? 'folders.links.edit' : 'folders.links.delete', { id, link, ...options });
      if (done) {
        setEdit(undefined);
        setRevoke('');
        await refresh();
      } else if (done === undefined) setError('Telegram no confirmó el cambio. Actualiza la lista antes de reintentar.');
    } finally { setBusy(false); }
  }

  return <section className="folder-links">
    <h3>Enlaces de la carpeta</h3>
    {error && <p className="settings-note settings-error" role="alert">{error}</p>}
    {!links && !error && <p className="settings-note" role="status">Consultando Telegram…</p>}
    {links?.length === 0 && <p className="settings-note">Esta carpeta no tiene enlaces activos.</p>}
    {links?.map(invite => <div className="session-item" key={invite.link}>
      <strong>{invite.name || 'Enlace sin nombre'}</strong>
      <small>{invite.chatIds.length} chats</small>
      <div className="settings-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void run('clipboard.copy', { text: invite.link })}>Copiar enlace</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setEdit(invite); setRevoke(''); }}>Editar enlace</button>
        <button type="button" className="text-button danger-text" disabled={busy} onClick={() => { setRevoke(invite.link); setEdit(undefined); }}>Revocar</button>
      </div>
      {edit?.link === invite.link && <form onSubmit={event => { event.preventDefault(); void update('edit', invite.link, { name: edit.name }); }}>
        <label className="field-label">Nombre del enlace<input value={edit.name} maxLength={32} disabled={busy} onChange={event => setEdit({ ...edit, name: event.target.value })}/></label>
        <div className="settings-actions">
          <button type="submit" className="primary" disabled={busy}>Guardar nombre</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void update('edit', invite.link, { name: edit.name, chooseChats: true })}>Cambiar chats incluidos</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => setEdit(undefined)}>Cancelar</button>
        </div>
      </form>}
      {revoke === invite.link && <div className="settings-actions">
        <p className="settings-note">Telegram dejará de aceptar nuevas incorporaciones con este enlace.</p>
        <button type="button" className="danger" disabled={busy} onClick={() => void update('delete', invite.link)}>Confirmar revocación</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => setRevoke('')}>Cancelar</button>
      </div>}
    </div>)}
    <button type="button" className="text-button" disabled={busy} onClick={() => void refresh()}>Actualizar enlaces</button>
  </section>;
}
