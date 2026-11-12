import { ArrowRight, Check, Clock3, FileText, LockKeyhole, Puzzle, ShieldCheck, Workflow, Zap } from 'lucide-react';
import { BUILTIN_PLUGINS, type PluginManifest } from '@wrgram/plugin-sdk';

export function PluginIcon({ id, size = 23 }: { id: string; size?: number }) {
  if (id === 'wrgram.notes') return <FileText size={size} />;
  if (id === 'wrgram.quick-replies') return <Zap size={size} />;
  return <Workflow size={size} />;
}

interface PluginCatalogProps {
  isEnabled: (id: string) => boolean;
  onEnable: (plugin: PluginManifest) => void;
  onRevoke: (id: string) => void;
  onBack: () => void;
}

export function PluginCatalog({ isEnabled, onEnable, onRevoke, onBack }: PluginCatalogProps) {
  return (
    <section className="catalog-view" aria-labelledby="catalog-title">
      <div className="catalog-heading">
        <span className="eyebrow">HECHO PARA TU FORMA DE CONVERSAR</span>
        <h1 id="catalog-title">Un pequeño extra.<br /><span>Muchas posibilidades.</span></h1>
        <p>Tu cliente, a tu manera. Añade herramientas que te ayuden de verdad,<br className="desktop-break" /> sin llenar tu espacio de cosas que no necesitas.</p>
        <div className="catalog-pills"><span><ShieldCheck size={14} /> Tú controlas los permisos</span><span><LockKeyhole size={14} /> Sin acceso automático a tus chats</span></div>
        <div className="catalog-orbit" aria-hidden="true"><Puzzle size={56} strokeWidth={1.3} /><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /></div>
      </div>
      <div className="section-heading"><h2>Complementos de WRGram <span>02 disponibles</span></h2><span className="pill">Primera colección</span></div>
      <div className="plugin-grid">
        {BUILTIN_PLUGINS.map((plugin) => {
          const enabled = isEnabled(plugin.id);
          const planned = plugin.availability === 'planned';
          return <article className={`plugin-card ${planned ? 'plugin-planned' : ''}`} key={plugin.id}>
            <div className="plugin-card-top"><span className={`plugin-icon ${plugin.id === 'wrgram.quick-replies' ? 'plugin-icon-amber' : plugin.id === 'wrgram.workflows' ? 'plugin-icon-mint' : ''}`}><PluginIcon id={plugin.id} /></span>
              <span className={`plugin-status ${enabled ? 'status-enabled' : ''}`}>{planned ? 'En camino' : enabled ? <><Check size={12} /> Activado</> : 'Incluido'}</span>
            </div>
            <h3>{plugin.name}</h3><p>{plugin.description}</p>
            <div className="plugin-meta"><span className="mini-brand">w</span> Por {plugin.author}<span>·</span>{planned ? 'Hoja de ruta' : `v${plugin.version}`}</div>
            {planned ? <button className="secondary-button" disabled><Clock3 size={15} /> Próximamente</button>
              : enabled ? <button className="secondary-button revoke-button" onClick={() => onRevoke(plugin.id)}>Desactivar complemento</button>
              : <button className="secondary-button" onClick={() => onEnable(plugin)}>Activar complemento <ArrowRight size={15} /></button>}
          </article>;
        })}
      </div>
      <div className="catalog-bottom"><div className="catalog-bottom-icon"><Puzzle size={24} /></div><div><h3>Una plataforma abierta, con una base segura.</h3><p>Estamos preparando un SDK para terceros. Por ahora, solo se ejecutan complementos propios.</p></div></div>
      <button className="text-button" onClick={onBack}>Volver a mis conversaciones <ArrowRight size={15} /></button>
    </section>
  );
}
