import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Modal } from './dialogs';
import { request } from './bridge';
import { useLanguage } from './language';
import { STATS_LABELS, isPercent, readableStats, statDate, statGrowth, statGrowthLabel, statValue } from './groupStats';
import type { Chat, CommunityStats } from './contract';
import './group-stats.css';

/**
 * Las estadísticas que Telegram guarda de un canal o de un supergrupo (ronda CA).
 *
 * No hay lista que paginar ni escritura que confirmar: es una lectura, y el único filtro real lo hace Telegram, que
 * solo contesta al dueño y a los administradores con permiso. Por eso la pantalla no ofrece conmutadores —no hay nada
 * que cambiar en la estadística de nadie— ni esconde el «no tienes permiso» detrás de un cuadro vacío: el fallo del
 * puente se enseña como frase.
 *
 * Las gráficas de Telegram (por hora, por origen, por idioma) viajan en la misma respuesta como JSON de puntos y
 * todavía no se dibujan, así que el aviso de abajo lo dice en lugar de dejarlo pasar por un olvido.
 */
export function GroupStatsPanel({ chat, close }: { chat: Chat; close(): void }) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const value = await request<CommunityStats>('groups.stats', { id: chat.id });
      if (current !== ticket.current) return;
      if (!value || !Array.isArray(value.values)) throw new Error(t('No se pudieron preparar las estadísticas.'));
      setStats(value);
    } catch (reason) {
      if (current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : t('No se pudieron preparar las estadísticas.'));
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }, [chat.id]);

  useEffect(() => { void load(); }, [load]);

  const cards = stats ? readableStats(stats.values, stats.kind) : [];
  const top = stats && stats.kind === 'group' ? stats.top : [];
  const from = statDate(stats?.from);
  const to = statDate(stats?.to);

  return <Modal title={`${t('Estadísticas')} · ${chat.title}`} close={close} className="group-stats">
    <p className="settings-note">{t('Telegram solo enseña estas cifras al dueño y a los administradores con permiso de estadísticas. Son los datos que la propia Telegram recopila del periodo que ella elige.')}</p>
    {busy && !stats ? <p className="stats-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Consultando las estadísticas en Telegram…')}</span></p> : null}
    {error ? <div className="stats-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load()}>{t('Reintentar')}</button>
    </div> : null}
    {!busy && !error && stats ? <>
      {from && to ? <p className="stats-period">{`${t('Periodo')}: ${from} — ${to}`}</p> : null}
      <div className="stats-grid">
        {cards.map(card => <div className="stats-card" key={card.id}>
          <span className="stats-label">{t(STATS_LABELS[card.id])}</span>
          <strong dir="ltr">{statValue(card)}</strong>
          {isPercent(card) ? null : (() => {
            const growth = statGrowth(card);
            return growth === undefined ? null : <small className={growth > 0 ? 'stats-up' : growth < 0 ? 'stats-down' : 'stats-flat'}>{statGrowthLabel(growth)}</small>;
          })()}
        </div>)}
      </div>
      {top.length ? <div className="stats-block">
        <p className="stats-head">{t('Quien más escribe en el grupo')}</p>
        {top.map((item, index) => <div className="stats-row" key={`${item.name}:${index}`}>
          <span className="stats-who" dir="auto">{item.name}</span>
          <span className="stats-figures">{`${t('Mensajes')}: ${item.messages} · ${t('Media de caracteres')}: ${item.avgChars}`}</span>
        </div>)}
      </div> : null}
      {!cards.length ? <p className="stats-state">{t('Telegram no contestó ninguna cifra de este periodo.')}</p> : null}
    </> : null}
    <p className="settings-note">{t('Las gráficas por hora, por origen y por idioma que Telegram manda en la misma respuesta todavía no se dibujan: aquí se muestran solo los números.')}</p>
  </Modal>;
}
