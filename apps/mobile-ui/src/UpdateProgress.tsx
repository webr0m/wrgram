import type { PlayUpdateStatus } from './contract';
export function UpdateProgress({update}:{update?:PlayUpdateStatus}){
  if(!update)return null;
  return <div aria-live="polite">{update.error&&<p className="settings-note" role="alert">{update.error}</p>}{(update.downloading||update.starting||update.installing)&&<p className="settings-note">{update.installing?'Instalando…':update.starting?'Esperando confirmación de Google Play…':'Descargando desde Google Play…'}{update.downloading&&<progress className="update-progress" aria-label="Descarga de actualización" max={update.totalBytes||undefined} value={update.totalBytes?update.bytesDownloaded||0:undefined}/>}</p>}</div>;
}
