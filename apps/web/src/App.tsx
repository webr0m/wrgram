import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bookmark, Check,
  CheckCheck, ChevronDown, ChevronRight, CircleHelp, Command, FileText, Info,
  LockKeyhole, MessageCircle, MessageSquareText, PanelRightClose, PanelRightOpen,
  Moon, Pin, Plus, Puzzle, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Sun, Trash2, X, Zap,
} from 'lucide-react';
import { createOutgoingMessage, type Chat, type Message } from '@wrgram/core';
import { BUILTIN_PLUGINS, PERMISSIONS, type PluginManifest } from '@wrgram/plugin-sdk';
import { PluginRuntime } from '@wrgram/plugin-runtime';
import { Avatar } from './components/Avatar';
import { Modal } from './components/Modal';
import { PluginCatalog, PluginIcon } from './components/PluginCatalog';
import { AssistantView } from './components/AssistantView';
import { DEMO_CHATS, DEMO_MESSAGES } from './lib/demo';
import { parseNotes, readLocal, STORAGE_KEYS, writeLocal } from './lib/storage';
import { useTheme } from './theme/ThemeProvider';
import { ThemePicker } from './theme/ThemePicker';
import { THEMES } from '@wrgram/design-tokens';
import { BrandIcon } from './components/BrandIcon';

type View = 'chats' | 'plugins' | 'assistant' | 'telegram-local' | 'telegram-web';
type ModalName = 'connection' | 'settings' | 'about' | 'new-chat' | null;
type Filter = 'all' | 'unread' | 'bots';

const QUICK_REPLIES = ['¡Gracias! Lo reviso y te cuento.', 'Perfecto, seguimos en contacto.', '¿Lo vemos con más calma?'];
const TelegramLocalView = import.meta.env.DEV ? lazy(() => import('./features/telegram/TelegramLocalView')) : null;
const TelegramServerView = import.meta.env.DEV || import.meta.env.VITE_WRGRAM_TELEGRAM_WEB === '1'
  ? lazy(() => import('./features/telegram/TelegramServerView'))
  : null;

export function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const darkTheme = THEMES.find((item) => item.id === theme)?.scheme === 'dark';
  const [initialStorage] = useState(() => ({ notes: readLocal(STORAGE_KEYS.notes), grants: readLocal(STORAGE_KEYS.grants) }));
  const [runtime] = useState(() => new PluginRuntime(BUILTIN_PLUGINS, initialStorage.grants.value));
  const [grants, setGrants] = useState(() => runtime.snapshot());
  const [notes, setNotes] = useState(() => parseNotes(initialStorage.notes.value));
  const [storageError, setStorageError] = useState(initialStorage.notes.unavailable || initialStorage.grants.unavailable);
  const [view, setView] = useState<View>('chats');
  const realTelegramView = view === 'telegram-local' || view === 'telegram-web';
  const [chats, setChats] = useState<Chat[]>(DEMO_CHATS);
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [activeId, setActiveId] = useState('design');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortAlpha, setSortAlpha] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.matchMedia('(min-width: 1181px)').matches);
  const [inspectorTab, setInspectorTab] = useState<'tools' | 'info'>('tools');
  const [mobileConversation, setMobileConversation] = useState(false);
  const [messageSearch, setMessageSearch] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [pendingPlugin, setPendingPlugin] = useState<PluginManifest | null>(null);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeId)!;
  const draft = drafts[activeId] ?? '';
  const notesEnabled = Boolean(grants['wrgram.notes']);
  const repliesEnabled = Boolean(grants['wrgram.quick-replies']);
  const enabledCount = Object.keys(grants).length;
  const isEnabled = (id: string) => Boolean(grants[id]);

  const filteredChats = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    const result = chats.filter((chat) =>
      (chat.title.toLocaleLowerCase('es').includes(normalizedQuery) || chat.preview.toLocaleLowerCase('es').includes(normalizedQuery)) &&
      (filter === 'all' || (filter === 'unread' ? chat.unread > 0 : chat.kind === 'bot')),
    );
    return sortAlpha ? [...result].sort((a, b) => a.title.localeCompare(b.title, 'es')) : result;
  }, [chats, query, filter, sortAlpha]);

  const visibleMessages = messages.filter((message) => message.chatId === activeId &&
    (!messageSearch || message.text.toLocaleLowerCase('es').includes(messageSearch.toLocaleLowerCase('es'))));

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (document.querySelector('dialog[open]')) return;
        event.preventDefault();
        if (realTelegramView) { document.getElementById('live-chat-search')?.focus(); return; }
        setView('chats');
        setMobileConversation(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [view]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeId, messages.length]);

  function saveGrants() {
    const next = runtime.snapshot();
    setGrants(next);
    setStorageError(!writeLocal(STORAGE_KEYS.grants, next));
  }

  function activatePlugin() {
    if (!pendingPlugin) return;
    runtime.enable(pendingPlugin.id);
    saveGrants();
    setToast(`${pendingPlugin.name}: complemento activado.`);
    setPendingPlugin(null);
  }

  function revokePlugin(id: string) {
    runtime.revoke(id);
    saveGrants();
    if (id === 'wrgram.quick-replies') setQuickRepliesOpen(false);
    setToast('Permisos revocados. Los datos locales se conservan; puedes borrarlos en Ajustes.');
  }

  function selectChat(chat: Chat) {
    setActiveId(chat.id);
    setMobileConversation(true);
    setMessageSearch(null);
    setQuickRepliesOpen(false);
    setEmojiOpen(false);
    setChats((current) => current.map((item) => item.id === chat.id ? { ...item, unread: 0 } : item));
  }

  function updateDraft(value: string) {
    setDrafts((current) => ({ ...current, [activeId]: value }));
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    try {
      const time = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      const message = createOutgoingMessage(activeId, draft, crypto.randomUUID(), time);
      setMessages((current) => [...current, message]);
      setChats((current) => current.map((chat) => chat.id === activeId ? { ...chat, preview: `Tú: ${message.text}`, time } : chat));
      updateDraft('');
      setEmojiOpen(false);
      setQuickRepliesOpen(false);
      composerRef.current?.focus();
    } catch (error) { setToast(error instanceof Error ? error.message : 'No pudimos preparar el mensaje.'); }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (draft.trim()) sendMessage();
    }
  }

  function updateNote(value: string) {
    runtime.require('wrgram.notes', 'notes:write');
    const next = { ...notes, [activeId]: value };
    setNotes(next);
    setStorageError(!writeLocal(STORAGE_KEYS.notes, next));
  }

  function insertQuickReply(text: string) {
    runtime.require('wrgram.quick-replies', 'composer:write');
    updateDraft(draft ? `${draft}\n${text}`.slice(0, 4096) : text);
    setQuickRepliesOpen(false);
    composerRef.current?.focus();
  }

  function createDemoChat(event: FormEvent) {
    event.preventDefault();
    const title = newChatName.trim();
    if (!title) return;
    const chat: Chat = { id: crypto.randomUUID(), title, initials: title.slice(0, 2).toUpperCase(), color: 'mint', kind: 'private', preview: 'Una conversación de demostración.', time: 'Ahora', unread: 0, members: 'Chat local · no se enviará nada a Telegram' };
    setChats((current) => [chat, ...current]);
    setActiveId(chat.id);
    setFilter('all'); setQuery(''); setView('chats'); setMobileConversation(true);
    setNewChatName(''); setModal(null);
    setToast('Chat de ejemplo creado. Solo existe en esta sesión.');
  }

  function clearNotes() {
    setNotes({});
    const success = writeLocal(STORAGE_KEYS.notes, {});
    setStorageError(!success);
    setToast(success ? 'Se han eliminado todas las notas de este navegador.' : 'Notas borradas de memoria. No pudimos actualizar el almacenamiento del navegador.');
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <nav className="nav-rail" aria-label="Navegación principal">
        <a className="brand-mark wrgram-brand" href="#" aria-label="WRGram, inicio" aria-disabled={realTelegramView} onClick={(event) => { event.preventDefault(); if (realTelegramView) return; setView('chats'); setMobileConversation(false); }}>
          <BrandIcon />
        </a>
        <div className="rail-divider" />
        <button className={`rail-button ${view === 'chats' || realTelegramView ? 'rail-active' : ''}`} aria-label="Conversaciones" aria-current={view === 'chats' || realTelegramView ? 'page' : undefined} title="Conversaciones" disabled={realTelegramView} onClick={() => { setView('chats'); setMobileConversation(false); }}><MessageSquareText size={22} /><span className="rail-indicator" /></button>
        <button className={`rail-button ${view === 'plugins' ? 'rail-active' : ''}`} aria-label="Complementos" aria-current={view === 'plugins' ? 'page' : undefined} title="Complementos" disabled={realTelegramView} onClick={() => setView('plugins')}><Puzzle size={22} />{enabledCount > 0 && <span className="rail-count">{enabledCount}</span>}</button>
        <button className={`rail-button ${view === 'assistant' ? 'rail-active' : ''}`} aria-label="WR IA, asistente personal" aria-current={view === 'assistant' ? 'page' : undefined} title="WR IA · Asistente personal" disabled={realTelegramView} onClick={() => setView('assistant')}><Sparkles size={21} /><span className="ai-rail-dot" /></button>
        <button className="rail-button" aria-label="Mensajes guardados" title="Mensajes guardados" disabled={realTelegramView} onClick={() => { setView('chats'); selectChat(chats.find((chat) => chat.id === 'saved')!); }}><Bookmark size={21} /></button>
        <div className="rail-spacer" />
        <button className="rail-button" aria-label={darkTheme ? 'Cambiar al tema Día' : 'Cambiar al tema Noche'} title={darkTheme ? 'Tema Día' : 'Tema Noche'} onClick={toggleTheme}>{darkTheme ? <Sun size={21} /> : <Moon size={21} />}</button>
        <button className="rail-button" aria-label="Acerca de WRGram" title="Acerca de WRGram" onClick={() => setModal('about')}><CircleHelp size={21} /></button>
        <button className="rail-button" aria-label="Ajustes" title="Ajustes" onClick={() => setModal('settings')}><Settings2 size={21} /></button>
        <button className="profile-button" aria-label="Tú · Perfil de demostración" title="Perfil de demostración" disabled={realTelegramView} onClick={() => setModal('connection')}>Tú<span /></button>
      </nav>

      <div className="workspace">
        <header className="topbar">
          <div className="wordmark">WRGram<span className="version-tag">alpha</span></div>
          <span className="topbar-separator" />
          <span className="workspace-name">Tu espacio personal <ChevronDown size={12} /></span>
          <div className="topbar-actions"><span className="demo-badge"><span /> {view === 'telegram-local' ? 'Telegram real · local' : view === 'telegram-web' ? 'Telegram web · TDLib' : 'Demo local'}</span><button className="connect-button" disabled={realTelegramView} onClick={() => setModal('connection')}>Conectar Telegram <ArrowUpRight size={14} /></button></div>
        </header>

        <main id="main-content" className={`main-content ${view === 'plugins' ? 'catalog-main' : ''}`}>
          {view === 'telegram-local' && TelegramLocalView ? <Suspense fallback={<div className="fatal-error"><p>Preparando prueba local de Telegram…</p></div>}><TelegramLocalView onExit={() => setView('chats')} /></Suspense> : view === 'telegram-web' && TelegramServerView ? <Suspense fallback={<div className="fatal-error"><p>Preparando el cliente web con TDLib…</p></div>}><TelegramServerView onExit={() => setView('chats')} /></Suspense> : view === 'assistant' ? <AssistantView /> : view === 'plugins' ? <PluginCatalog isEnabled={isEnabled} onEnable={setPendingPlugin} onRevoke={revokePlugin} onBack={() => setView('chats')} /> : <div className={`messenger ${mobileConversation ? 'mobile-conversation' : ''} ${inspectorOpen ? 'with-inspector' : ''}`}>
            <aside className="chat-sidebar" aria-label="Lista de conversaciones">
              <div className="sidebar-title"><h1>Mensajes<span>{chats.length}</span></h1><button className="icon-button new-chat-button" aria-label="Crear chat de demostración" title="Crear chat de demostración" onClick={() => setModal('new-chat')}><Plus size={19} /></button></div>
              <div className="search-field"><Search size={17} /><input ref={searchRef} aria-label="Buscar conversaciones" placeholder="Buscar una conversación" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd><Command size={10} /> K</kbd>{query && <button aria-label="Borrar búsqueda" onClick={() => setQuery('')}><X size={13} /></button>}</div>
              <div className="chat-filters" role="group" aria-label="Filtrar conversaciones">
                <button className={filter === 'all' ? 'selected' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos</button>
                <button className={filter === 'unread' ? 'selected' : ''} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>No leídos <span>{chats.filter((chat) => chat.unread > 0).length}</span></button>
                <button className={filter === 'bots' ? 'selected' : ''} aria-pressed={filter === 'bots'} onClick={() => setFilter('bots')}>Bots</button>
              </div>
              <div className="chat-section-label"><span>{query ? 'RESULTADOS' : filter === 'bots' ? 'TUS BOTS' : 'CONVERSACIONES'}</span><button aria-label={sortAlpha ? 'Ordenar por actividad' : 'Ordenar alfabéticamente'} title={sortAlpha ? 'Ordenar por actividad' : 'Ordenar alfabéticamente'} onClick={() => setSortAlpha(!sortAlpha)}>{sortAlpha ? 'A–Z' : <ArrowDown size={12} />}</button></div>
              <div className="chat-list">
                {filteredChats.map((chat) => <button key={chat.id} className={`chat-item ${activeId === chat.id ? 'chat-active' : ''}`} onClick={() => selectChat(chat)} aria-current={activeId === chat.id ? 'true' : undefined}>
                  <Avatar chat={chat} />
                  <span className="chat-item-content"><span className="chat-item-top"><span className="chat-name"><span className="chat-name-text">{chat.title}</span>{chat.verified && <BadgeCheck size={13} className="verified" />}</span><span className="chat-time">{chat.time}</span></span><span className="chat-item-bottom"><span className="chat-preview">{chat.preview}</span>{chat.unread > 0 ? <span className="unread-count">{chat.unread}</span> : chat.pinned ? <Pin size={12} className="pin-icon" /> : null}</span></span>
                </button>)}
                {filteredChats.length === 0 && <div className="list-empty"><Search size={25} /><h3>{filter === 'unread' && !query ? 'Todo al día' : 'Sin resultados'}</h3><p>{filter === 'unread' && !query ? 'No hay conversaciones pendientes.' : 'Prueba otro nombre o cambia el filtro.'}</p><button className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Ver todos los chats</button></div>}
              </div>
              <button className="sidebar-discover" onClick={() => setView('plugins')}><span className="discover-icon"><Puzzle size={19} /></span><span><strong>Más que mensajes</strong><small>Descubre tus complementos</small></span><ArrowUpRight size={15} /></button>
              <div className="sidebar-footer"><ShieldCheck size={12} /><span>Prototipo no oficial de Telegram</span><span>v0.1</span></div>
            </aside>

            <section className="conversation" aria-label={`Conversación: ${activeChat.title}`}>
              <header className="conversation-header"><button className="icon-button mobile-back" aria-label="Volver a conversaciones" onClick={() => setMobileConversation(false)}><ArrowLeft size={20} /></button><Avatar chat={activeChat} small /><div className="conversation-heading"><h2><span className="conversation-title">{activeChat.title}</span>{activeChat.verified && <BadgeCheck size={15} className="verified" />}</h2><p>{activeChat.members}</p></div><div className="conversation-actions"><button className={`icon-button ${messageSearch !== null ? 'icon-selected' : ''}`} aria-label="Buscar en esta conversación" title="Buscar en esta conversación" onClick={() => setMessageSearch(messageSearch === null ? '' : null)}><Search size={19} /></button><button className="icon-button info-button" aria-label="Información de la conversación" title="Información" onClick={() => { setInspectorTab('info'); setInspectorOpen(true); }}><Info size={19} /></button><span className="header-action-divider" /><button className={`icon-button ${inspectorOpen ? 'icon-selected' : ''}`} aria-label={inspectorOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'} title={inspectorOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button></div></header>
              {messageSearch !== null && <div className="message-search"><Search size={16} /><input aria-label="Buscar texto en los mensajes" autoFocus placeholder="Buscar en los mensajes de ejemplo…" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} /><span>{visibleMessages.length} resultados</span><button className="icon-button" aria-label="Cerrar búsqueda de mensajes" onClick={() => setMessageSearch(null)}><X size={16} /></button></div>}
              <div className="message-scroll" ref={messagesRef}>
                <div className="conversation-start"><span className="conversation-start-icon"><MessageCircle size={22} strokeWidth={1.5} /></span><h3>Las buenas ideas empiezan conversando.</h3><p>Y crecen cuando tienes las herramientas adecuadas.</p></div>
                <div className="date-divider"><span />Hoy<span /></div>
                <div className="messages" role="log" aria-label="Mensajes de demostración" aria-live="polite" aria-relevant="additions text">
                  {visibleMessages.map((message, index) => {
                    const sameSender = index > 0 && visibleMessages[index - 1].sender === message.sender;
                    return <div className={`message-row ${message.outgoing ? 'message-outgoing' : ''} ${sameSender ? 'message-continuation' : ''}`} key={message.id}>
                      {!message.outgoing && <span className={`sender-avatar ${message.sender === 'Lucía' ? 'sender-coral' : ''} ${sameSender ? 'avatar-hidden' : ''}`} aria-hidden="true">{message.sender.slice(0, 1)}</span>}
                      <div className="message-bubble">{!message.outgoing && !sameSender && <span className={`message-author ${message.sender === 'Lucía' ? 'author-coral' : ''}`}>{message.sender}</span>}<p>{message.text}</p><span className="message-meta"><time>{message.time}</time>{message.outgoing && <Check size={13} aria-label="Mensaje local de demostración" />}</span></div>
                    </div>;
                  })}
                  {visibleMessages.length === 0 && <div className="messages-empty"><Bookmark size={28} /><p>{messageSearch ? 'No hay mensajes con ese texto.' : 'Este espacio está esperando tu primera idea.'}</p></div>}
                </div>
                {activeId === 'design' && !messageSearch && <div className="inline-discovery"><span><Sparkles size={16} /></span><p>Una idea que no quieres perder.<br /><strong>Guárdala en tus notas privadas.</strong></p><button aria-label="Abrir notas privadas" onClick={() => { setInspectorTab('tools'); setInspectorOpen(true); }}><ArrowRight size={17} /></button></div>}
              </div>

              <div className="composer-area">
                {quickRepliesOpen && repliesEnabled && <div className="quick-replies"><span className="eyebrow"><Zap size={12} /> RESPUESTAS RÁPIDAS</span>{QUICK_REPLIES.map((reply) => <button key={reply} onClick={() => insertQuickReply(reply)}>{reply}<ArrowUpRight size={13} /></button>)}<small>Solo inserta un borrador. Tú decides cuándo enviar.</small></div>}
                {emojiOpen && <div className="emoji-picker" role="group" aria-label="Insertar emoji">{['😊', '✨', '💜', '👍', '🎉', '☀️', '🚀', '☕'].map((emoji) => <button key={emoji} aria-label={`Insertar ${emoji}`} onClick={() => { updateDraft(`${draft}${emoji}`.slice(0, 4096)); setEmojiOpen(false); composerRef.current?.focus(); }}>{emoji}</button>)}</div>}
                <form className="composer" onSubmit={sendMessage}><button className="icon-button" type="button" aria-label="Insertar emoji" title="Insertar emoji" aria-expanded={emojiOpen} onClick={() => { setEmojiOpen(!emojiOpen); setQuickRepliesOpen(false); }}><Smile size={21} /></button><textarea ref={composerRef} aria-label="Escribe un mensaje de demostración" placeholder="Escribe un mensaje…" value={draft} maxLength={4096} rows={1} onChange={(event) => updateDraft(event.target.value)} onKeyDown={onComposerKeyDown} /><button className={`icon-button quick-reply-trigger ${quickRepliesOpen ? 'icon-selected' : ''}`} type="button" aria-label={repliesEnabled ? 'Respuestas rápidas' : 'Activar respuestas rápidas'} title="Respuestas rápidas" aria-expanded={quickRepliesOpen} onClick={() => { if (repliesEnabled) { setQuickRepliesOpen(!quickRepliesOpen); setEmojiOpen(false); } else setPendingPlugin(BUILTIN_PLUGINS[1]); }}><Zap size={19} /></button><span className="composer-divider" /><button className="send-button" type="submit" disabled={!draft.trim()} aria-label="Enviar mensaje de demostración" title="Enviar solo en esta demo"><Send size={18} /></button></form>
                <div className="composer-footer"><span><LockKeyhole size={11} /> Demo: los mensajes no se envían a Telegram.</span><span><kbd>Enter</kbd> enviar <span>·</span> <kbd>Shift + Enter</kbd> nueva línea</span></div>
              </div>
            </section>

            {inspectorOpen && <aside className="inspector" aria-label="Herramientas de la conversación">
              <div className="inspector-heading"><span>Tu espacio, ampliado.</span><button className="icon-button inspector-close" aria-label="Cerrar panel de herramientas" onClick={() => setInspectorOpen(false)}><X size={17} /></button><span className="inspector-spark"><Sparkles size={16} /></span></div>
              <div className="inspector-tabs" role="group" aria-label="Contenido del panel"><button className={inspectorTab === 'tools' ? 'selected' : ''} aria-pressed={inspectorTab === 'tools'} onClick={() => setInspectorTab('tools')}><Puzzle size={14} /> Herramientas</button><button className={inspectorTab === 'info' ? 'selected' : ''} aria-pressed={inspectorTab === 'info'} onClick={() => setInspectorTab('info')}>Información</button></div>
              <div className="inspector-content">
                {inspectorTab === 'tools' ? <>
                  <div className="notes-heading"><span className="plugin-icon plugin-icon-small"><FileText size={17} /></span><div><h3>Notas privadas</h3><span>SOLO PARA TI</span></div>{notesEnabled ? <span className="tiny-status" title="Complemento activado" /> : <LockKeyhole size={14} className="muted" />}</div>
                  <p className="notes-description">Un lugar para lo que importa en esta conversación.</p>
                  {notesEnabled && runtime.can('wrgram.notes', 'notes:read') ? <>
                    <label className="sr-only" htmlFor="private-note">Nota privada para {activeChat.title}</label>
                    <textarea id="private-note" className="note-editor" placeholder={'Una idea, un pendiente, algo que no quieres olvidar…\n\nEste espacio es tuyo.'} maxLength={5000} value={typeof notes[activeId] === 'string' ? notes[activeId] : ''} onChange={(event) => updateNote(event.target.value)} />
                    <div className={`note-save-status ${storageError ? 'save-error' : ''}`}><span>{storageError ? <Info size={12} /> : <CheckCheck size={13} />}{storageError ? 'Solo en memoria' : 'Guardado en este navegador'}</span><span>{typeof notes[activeId] === 'string' ? notes[activeId].length : 0}/5000</span></div>
                    <button className="text-button subtle-button" onClick={() => revokePlugin('wrgram.notes')}>Desactivar notas <ChevronRight size={12} /></button>
                  </> : <div className="notes-empty"><div className="note-illustration" aria-hidden="true"><FileText size={34} strokeWidth={1.1} /><span>+</span></div><h4>Que no se pierda esa idea.</h4><p>Añade notas a tus chats sin enviarlas a nadie.</p><button className="primary-button" onClick={() => setPendingPlugin(BUILTIN_PLUGINS[0])}><Plus size={15} /> Activar mis notas</button><small>Local · Sin acceso a tus mensajes</small></div>}
                  <div className="inspector-rule" />
                  <div className="mini-section-heading"><h3>A tu manera</h3><span>01</span></div>
                  <button className="mini-plugin" onClick={() => repliesEnabled ? setQuickRepliesOpen(!quickRepliesOpen) : setPendingPlugin(BUILTIN_PLUGINS[1])}><span className="plugin-icon plugin-icon-small plugin-icon-amber"><Zap size={17} /></span><span><strong>Respuestas rápidas</strong><small>{repliesEnabled ? 'Preparar un borrador' : 'Tus frases, a un clic'}</small></span>{repliesEnabled ? <Check size={14} className="success" /> : <Plus size={16} />}</button>
                  <button className="browse-plugins" onClick={() => setView('plugins')}><Puzzle size={15} /> Explorar complementos <ArrowUpRight size={14} /></button>
                </> : <div className="chat-info"><Avatar chat={activeChat} /><h3>{activeChat.title}</h3><p>{activeChat.members}</p><div className="info-label">TIPO DE CONVERSACIÓN</div><span>{({ private: 'Privada', group: 'Grupo', channel: 'Canal', bot: 'Bot' })[activeChat.kind]}</span><div className="info-label">IDENTIFICADOR LOCAL</div><code>{activeChat.id}</code><div className="privacy-notice"><Info size={16} /><p>Estos perfiles y mensajes son ficticios. No representan usuarios ni grupos reales de Telegram.</p></div></div>}
              </div>
              <div className="inspector-privacy"><span><ShieldCheck size={18} /></span><div><strong>El control sigue siendo tuyo.</strong><p>Activa solo lo que necesitas.<br />Revoca los permisos cuando quieras.</p></div></div>
            </aside>}
          </div>}
        </main>
      </div>

      {storageError && <div className="storage-warning" role="alert"><Info size={15} /> El almacenamiento local no está disponible o contiene datos dañados. No confíes en el guardado hasta recargar o revisar los ajustes.</div>}
      <div className={`toast ${toast ? 'toast-visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={16} /><span>{toast}</span><button aria-label="Cerrar notificación" onClick={() => setToast('')}><X size={14} /></button></>}</div>

      {pendingPlugin && <Modal title={`Activar ${pendingPlugin.name.toLowerCase()}`} eyebrow="TÚ DECIDES QUÉ COMPARTIR" onClose={() => setPendingPlugin(null)}><span className="permission-plugin-icon plugin-icon"><PluginIcon id={pendingPlugin.id} size={28} /></span><p className="modal-description">Este complemento propio de WRGram solicita los siguientes permisos:</p><ul className="permission-list">{pendingPlugin.permissions.map((permission) => <li key={permission}><ShieldCheck size={18} /><div><strong>{PERMISSIONS[permission].title}</strong><p>{PERMISSIONS[permission].description}</p></div></li>)}</ul><div className="privacy-notice"><LockKeyhole size={17} /><p>No puede leer tus conversaciones, enviar mensajes automáticamente ni transferir datos a servicios externos.</p></div><p className="local-storage-disclaimer">Las notas de esta demo se guardan sin cifrado en este navegador. No introduzcas información sensible. Al desactivar el complemento se conservan; puedes borrarlas en Ajustes.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setPendingPlugin(null)}>Ahora no</button><button className="primary-button" onClick={activatePlugin}>Permitir y activar <ArrowRight size={15} /></button></div></Modal>}

      {modal === 'connection' && <Modal title="El comienzo de algo más tuyo." eyebrow="BIENVENIDO A WRGRAM" onClose={() => setModal(null)}><div className="connection-visual"><span className="brand-mark wrgram-brand"><BrandIcon /></span><span className="connection-line" /><span className="connection-telegram"><Send size={28} /></span></div><p className="modal-description">WRGram será un cliente no oficial que utiliza la API de Telegram. La mensajería de esta primera versión es una <strong>demostración sin conexión a Telegram.</strong></p><div className="milestone"><span className="milestone-check"><Check size={15} /></span><div><strong>Tu espacio y tus complementos</strong><p>Ya puedes explorar la interfaz, escribir mensajes de ejemplo y guardar notas locales.</p></div></div><div className="milestone"><span className="milestone-next">02</span><div><strong>Conectar tu cuenta de forma segura</strong><p>Próxima etapa: validar la autenticación, proteger sesiones y sincronizar conversaciones reales.</p></div></div><div className="privacy-notice"><ShieldCheck size={17} /><p>La alpha pública no solicita teléfono, códigos ni contraseña. Nunca compartas estos datos con el agente.</p></div>{TelegramServerView && <button className="secondary-button full-width" onClick={() => { setModal(null); setView('telegram-web'); }}>Abrir cliente web con TDLib (beta) <ArrowUpRight size={15} /></button>}{import.meta.env.DEV && <button className="secondary-button full-width" onClick={() => { setModal(null); setView('telegram-local'); }}>Abrir prueba técnica local de MTProto <ArrowUpRight size={15} /></button>}<button className="primary-button full-width" onClick={() => setModal(null)}>Seguir explorando <ArrowRight size={15} /></button></Modal>}

      {modal === 'settings' && <Modal title="Un espacio bajo tu control." eyebrow="AJUSTES DE WRGRAM" onClose={() => setModal(null)}><ThemePicker /><div className="settings-section"><h3>Complementos activos <span className="pill">{enabledCount}</span></h3>{BUILTIN_PLUGINS.filter((plugin) => isEnabled(plugin.id)).map((plugin) => <div className="settings-plugin" key={plugin.id}><span>{plugin.name}</span><button className="text-button" onClick={() => revokePlugin(plugin.id)}>Revocar acceso</button></div>)}{!enabledCount && <p>No hay complementos con permisos concedidos.</p>}</div><div className="settings-section"><h3>Datos de este navegador</h3><p>Solo se guardan notas, permisos y preferencias de apariencia en localStorage, sin cifrado ni sincronización. Los chats y mensajes de la demo se reinician al recargar.</p><p>No uses esta versión para almacenar información sensible. Otros usuarios de este perfil del navegador podrían acceder a las notas.</p><button className="danger-button" disabled={Object.values(notes).every((note) => !note)} onClick={() => { if (window.confirm('¿Eliminar todas las notas privadas de WRGram en este navegador? Esta acción no se puede deshacer.')) clearNotes(); }}><Trash2 size={15} /> Borrar todas las notas locales</button></div><div className="settings-section"><h3>Estado del proyecto</h3><p>Web alpha 0.1.0 · La demo pública no conecta con Telegram.<br />Android está en prueba cerrada, no disponible para el público general; iOS sigue en desarrollo.</p></div></Modal>}

      {modal === 'about' && <Modal title="Tu espacio, conectado." eyebrow="WRGRAM · ALPHA 0.1.0" onClose={() => setModal(null)}><p className="modal-description">Un cliente no oficial de Telegram pensado para conversar, organizar y trabajar con herramientas que tú eliges.</p><div className="about-grid"><div><MessageSquareText size={23} /><h3>Conversar</h3><p>Una interfaz clara, sin perder de vista lo importante.</p></div><div><Puzzle size={23} /><h3>Ampliar</h3><p>Complementos pequeños con permisos explícitos.</p></div></div><div className="privacy-notice"><Info size={17} /><p>WRGram es independiente. No está afiliado, patrocinado ni avalado por Telegram. Esta demo no implementa todavía su API.</p></div><a className="external-link" href="https://core.telegram.org/api/terms" target="_blank" rel="noreferrer">Términos de la API de Telegram <ArrowUpRight size={14} /></a></Modal>}

      {modal === 'new-chat' && <Modal title="Una nueva conversación." eyebrow="SOLO EN ESTA DEMOSTRACIÓN" onClose={() => setModal(null)}><p className="modal-description">Crea un chat de ejemplo para probar mensajes y notas. No buscará contactos ni enviará invitaciones en Telegram.</p><form onSubmit={createDemoChat}><label className="field-label" htmlFor="new-chat-name">Nombre del chat</label><input className="text-input" id="new-chat-name" autoFocus maxLength={64} placeholder="Por ejemplo, Ideas para WRGram" value={newChatName} onChange={(event) => setNewChatName(event.target.value)} required /><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={!newChatName.trim()}>Crear chat local <Plus size={15} /></button></div></form></Modal>}
    </div>
  );
}
