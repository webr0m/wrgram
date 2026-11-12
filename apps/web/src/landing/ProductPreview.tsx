import { useState } from 'react';
import { Bookmark, CheckCheck, ChevronDown, FileText, MessageSquareText, MoreHorizontal, Plus, Puzzle, Search, Send, Settings2, Sparkles } from 'lucide-react';
import type { ThemeId } from '@wrgram/design-tokens';
import { BrandIcon } from '../components/BrandIcon';

const CHATS = [
  { name: 'Estudio Creativo', initials: 'ec', preview: 'Lucía: ¡Vamos a darle forma! ✨', time: '10:42', count: 2 },
  { name: 'Sofía Martínez', initials: 'SM', preview: 'Un café, una idea y empezamos.', time: '10:38', count: 1 },
  { name: 'Mensajes guardados', initials: '', preview: 'Aquí empieza tu próxima idea.', time: '09:56', count: 0 },
  { name: 'Producto & código', initials: 'p/', preview: 'Todo listo para el siguiente paso.', time: '09:41', count: 0 },
];

export function ProductPreview({ theme, compact = false }: { theme: ThemeId; compact?: boolean }) {
  const [active, setActive] = useState(0);
  const chat = CHATS[active];
  return <div className={`lp-preview theme-option ${compact ? 'lp-preview-compact' : ''}`} data-theme-choice={theme}>
    <div className="lp-window-bar"><span className="lp-window-dots"><i /><i /><i /></span><span><span className="lp-window-lock" /> WRGram <span className="lp-window-slash">/</span> Tu espacio</span><span className="lp-window-demo">VISTA PREVIA</span></div>
    <div className="lp-preview-body">
      <div className="lp-preview-rail" aria-hidden="true"><span className="lp-preview-brand"><BrandIcon /></span><span className="lp-preview-rail-selected"><MessageSquareText size={16} /></span><Puzzle size={17} /><Sparkles size={16} /><Bookmark size={16} /><span className="lp-preview-rail-bottom"><Settings2 size={16} /><span>W</span></span></div>
      <div className="lp-preview-sidebar"><div className="lp-preview-title">Mensajes <Plus size={14} /></div><div className="lp-preview-search"><Search size={12} /> Buscar una conversación</div><div className="lp-preview-filters"><span>Todos</span><span>No leídos</span><span>Bots</span></div><span className="lp-preview-list-title">TU DÍA, CONECTADO</span>
        {CHATS.map((item, index) => <button type="button" key={item.name} className={`lp-preview-chat ${active === index ? 'lp-preview-chat-active' : ''}`} aria-pressed={active === index} onClick={() => setActive(index)}><span className={`lp-preview-avatar lp-preview-avatar-${index}`} aria-hidden="true">{item.initials || <Bookmark size={14} />}</span><span><strong>{item.name}</strong><small>{item.preview}</small></span><span className="lp-preview-chat-meta"><time>{item.time}</time>{item.count > 0 && <b>{item.count}</b>}</span></button>)}
        <div className="lp-preview-extra"><Puzzle size={15} /><span>Un pequeño extra.<br /><strong>Muchas posibilidades.</strong></span></div>
      </div>
      <div className="lp-preview-conversation"><div className="lp-preview-conversation-header"><span className="lp-preview-avatar">{chat.initials || <Bookmark size={14} />}</span><span><strong>{chat.name}</strong><small>Conversación de ejemplo</small></span><MoreHorizontal size={17} /></div><div className="lp-preview-messages"><span className="lp-preview-date">Hoy</span>
        <div className="lp-preview-bubble"><strong>{active === 1 ? 'Sofía' : active === 0 ? 'Lucía' : 'WRGram'}</strong><p>{active === 2 ? 'Una idea que merece su propio espacio. 💡' : active === 3 ? '¿Y si nuestras herramientas se adaptaran a la forma en que trabajamos?' : 'Tengo una idea. ¿Y si hacemos que cada conversación tenga un poco más de nosotros?'}</p><time>10:35</time></div>
        <div className="lp-preview-bubble lp-preview-bubble-out"><p>Menos ruido. Más espacio para lo que importa.</p><time>10:38 <CheckCheck size={10} /></time></div>
        <div className="lp-preview-bubble"><strong>{active === 1 ? 'Sofía' : 'Lucía'}</strong><p>Justo eso. ¡Vamos a darle forma! ✨</p><time>10:42</time></div>
        <div className="lp-preview-system"><Sparkles size={11} /> Tu espacio. Tus herramientas.</div>
      </div><div className="lp-preview-composer" aria-hidden="true"><Plus size={14} /><span>Una nueva idea empieza aquí…</span><span><Send size={12} /></span></div><div className="lp-preview-local">Interfaz ilustrativa · Sin conexión a Telegram</div></div>
    </div>
    {!compact && <div className="lp-preview-toolbar"><span><span /> Un cliente, a tu manera</span><span>{theme === 'gold' ? 'WR Gold' : theme === 'day' ? 'Día' : theme === 'night' ? 'Noche' : theme === 'ocean' ? 'Océano' : theme === 'forest' ? 'Bosque' : theme === 'sunset' ? 'Terracota' : theme === 'graphite' ? 'Grafito' : 'Violeta'} <ChevronDown size={10} /></span></div>}
  </div>;
}

export function PhonePreview() {
  return <div className="lp-phone" aria-hidden="true"><div className="lp-phone-island" /><div className="lp-phone-status"><span>9:41</span><span>••• ▰</span></div><div className="lp-phone-heading"><span>Tu espacio.</span><span className="lp-phone-logo"><BrandIcon /></span></div><div className="lp-phone-subtitle">Un poco más tuyo.</div><div className="lp-phone-search"><Search size={10} /> Buscar</div><div className="lp-phone-tabs"><b>Todos</b><span>Personal</span><span>Trabajo</span></div>{CHATS.slice(0, 3).map((chat, index) => <div className="lp-phone-chat" key={chat.name}><span className="lp-preview-avatar">{chat.initials || <Bookmark size={10} />}</span><span><strong>{chat.name}</strong><small>{index === 0 ? 'Una idea cambia todo. ✨' : chat.preview}</small></span></div>)}<div className="lp-phone-note"><span><FileText size={12} /> Notas privadas</span><p>Las grandes ideas también empiezan con un mensaje.</p><small>SOLO PARA TI</small></div><div className="lp-phone-nav"><MessageSquareText size={16} /><Puzzle size={16} /><Sparkles size={16} /></div><div className="lp-phone-home" /></div>;
}
