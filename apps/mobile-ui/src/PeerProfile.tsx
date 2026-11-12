import { useEffect, useState, useSyncExternalStore } from 'react';
import { AtSign, BadgeCheck, Ban, Bell, BellOff, CalendarDays, ChevronLeft, ChevronRight, Copy, Gift, Image, Link2, LoaderCircle, LockKeyhole, MessageCircle, MoreHorizontal, Phone, Rocket, SlidersHorizontal, Users } from 'lucide-react';
import { Avatar } from './Inbox';
import { FormattedText } from './formatting';
import { request, snapshot, subscribe } from './bridge';
import { PremiumMark } from './PremiumMark';
import { SharedGallery } from './Collections';
import { MediaView } from './MediaView';
import type { Chat, ChatProfile, Media, Message } from './contract';
import './peer-profile.css';

type Related = { chats?: Chat[]; members?: { id: string; name: string; role: string; photo?: Media }[]; nextCursor?: string; nextOffset?: number; hasMore?: boolean };

export function PeerProfile({ initial, message, openChat, openUrl, jump, openPeer, openMember, menu, stories, manage, boosts, gifts, forum, ownId, changeContact, changeBlock, advanced, back }: {
  initial?: Chat;
  message?: { chatId: string; id: string };
  openChat(chat: Chat): void;
  openUrl(url: string): void;
  jump(message: Message): void;
  openPeer(id: string, parent: Chat): void;
  openMember(id: string, parent: Chat): void;
  menu(chat: Chat): void;
  stories(chat: Chat, posted?:boolean): void;
  manage(chat: Chat): void;
  boosts(chat: Chat): void;
  gifts(chat: Chat): void;
  forum(chat: Chat): void;
  ownId: string;
  changeContact(chat:Chat, remove:boolean):void;
  changeBlock(chat:Chat, blocked:boolean):void;
  advanced?: (chat:Chat) => void;
  back?: () => void;
}) {
  const [chat, setChat] = useState(initial);
  const [profile, setProfile] = useState<ChatProfile>();
  const liveChat = useSyncExternalStore(subscribe,()=>snapshot().chats.find(item=>item.id===chat?.id));
  const premiumProfile = liveChat ?? profile ?? chat;
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<'info'|'media'|'related'>('info');
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    setError('');
    async function load() {
      const peer = initial ?? await request<Chat>('profile.sender', message);
      if (!mounted) return;
      setChat(peer);
      if (peer.type === 'secret') return;
      const data = await request<ChatProfile>('chat.profile', { id: peer.id });
      if (mounted) setProfile(data);
    }
    void load().catch(reason => { if (mounted) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el perfil.'); });
    return () => { mounted = false; };
  }, [initial, message, retry]);

  const isForum = profile?.isForum || chat?.isForum;
  const kind = chat?.type === 'channel' ? 'Canal' : chat?.type === 'group' ? (isForum ? 'Foro' : 'Grupo') : chat?.type === 'secret' ? 'Chat secreto' : chat?.bot ? 'Bot' : 'Usuario';
  const count = profile?.memberCount;
  const status = count ? NUMBER(count)+' '+(kind === 'Canal' ? 'suscriptores' : 'miembros') : profile?.presence;
  const usernames = profile?.usernames?.length ? profile.usernames : profile?.username ? [profile.username] : [];
  const birthday = profile?.birthday && new Intl.DateTimeFormat('es', { day:'numeric', month:'long', ...(profile.birthday.year ? {year:'numeric'} : {}), timeZone:'UTC' })
    .format(new Date(Date.UTC(profile.birthday.year || 2000, profile.birthday.month - 1, profile.birthday.day)));
  const publicLink = usernames[0] ? 'https://t.me/' + usernames[0] : '';
  const related = profile?.canViewMembers ? 'Miembros' : profile?.groupCount ? 'En común' : '';
  function copy(value: string) {
    void request('clipboard.copy', { text:value }).then(() => setNotice('Copiado al portapapeles.')).catch(() => setNotice('No se pudo copiar.'));
  }
  async function mute() {
    if (!chat || busy) return;
    setBusy(true); setNotice('');
    try {
      await request('chat.mute', { id:chat.id, value:!chat.muted });
      setChat({ ...chat, muted:!chat.muted });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'No se pudo cambiar el aviso.'); }
    finally { setBusy(false); }
  }

  return <div className="peer-profile">
    {back && <button type="button" className="text-button peer-back" onClick={back}><ChevronLeft size={17}/> Volver al perfil</button>}
    {chat && <>
      <section className="peer-hero">
        <div className="peer-photo"><span className="account-avatar-status">{profile?.photo ? <MediaView media={profile.photo} auto eager passive/> : <Avatar chat={chat} large/>}<PremiumMark premium={premiumProfile?.premium} status={premiumProfile?.emojiStatus} size={23}/></span></div>
        <span className="peer-kind">{kind} de Telegram</span>
        <h3>{chat.title}{profile?.verified && <BadgeCheck size={20} aria-label="Verificado"/>}</h3>
        {status && <p>{status}</p>}
      </section>
      <div className="peer-actions">
        {chat.supported && <button type="button" onClick={() => openChat(chat)}><MessageCircle size={20}/>Mensaje</button>}
        {chat.supported && <button type="button" onClick={() => void mute()} disabled={busy}>{chat.muted ? <BellOff size={20}/> : <Bell size={20}/>} {chat.muted ? 'Activar avisos' : 'Silenciar'}</button>}
        {!!chat.activeStories && <button type="button" onClick={() => stories(chat)}><Image size={20}/>Historias</button>}
        <button type="button" aria-expanded={more} onClick={() => setMore(value => !value)}><MoreHorizontal size={20}/>Más</button>
      </div>
      {more && <div className="peer-menu">
        {publicLink && <button type="button" onClick={() => copy(publicLink)}><Link2 size={16}/>Copiar enlace público</button>}
        {profile?.phone && <button type="button" onClick={() => copy(profile.phone!)}><Copy size={16}/>Copiar número</button>}
        {chat.type !== 'secret' && <button type="button" onClick={() => stories(chat)}><Image size={16}/>Historias</button>}
        {profile?.hasStories && <button type="button" onClick={() => stories(chat,true)}><Image size={16}/>Historias del perfil</button>}
        {profile?.canManageMembers && <button type="button" onClick={() => manage(chat)}><Users size={16}/>Administrar miembros</button>}
        {(chat.type === 'channel' || chat.type === 'group') && <button type="button" onClick={() => boosts(chat)}><Rocket size={16}/>Impulsos del chat</button>}
        {chat.type !== 'secret' && !chat.bot && <button type="button" onClick={() => gifts(chat)}><Gift size={16}/>Regalos de Stars</button>}
        {isForum && <button type="button" onClick={() => forum(chat)}><MessageCircle size={16}/>Temas del foro</button>}
        {chat.type === 'secret' && chat.fingerprint && <button type="button" onClick={() => copy(chat.fingerprint!)}><LockKeyhole size={16}/>Copiar huella de cifrado</button>}
        {chat.type==='private' && !chat.bot && chat.id!==ownId && <button type="button" onClick={() => changeContact(chat,!!chat.isContact)}><Users size={16}/>{chat.isContact?'Quitar de contactos':'Añadir a contactos'}</button>}
        {chat.type==='private' && chat.id!==ownId && profile && <button type="button" onClick={() => changeBlock(chat,!!profile.blocked)}><Ban size={16}/>{profile.blocked?'Desbloquear':'Bloquear'}</button>}
        {advanced && <button type="button" onClick={() => advanced(chat)}><SlidersHorizontal size={16}/>Ajustes avanzados del chat</button>}
        {chat.supported && <button type="button" onClick={() => menu(chat)}><MoreHorizontal size={16}/>Opciones del chat</button>}
      </div>}
      {notice && <p className="settings-note" role="status">{notice}</p>}
      <nav className="peer-tabs" aria-label="Secciones del perfil">
        <button type="button" aria-pressed={tab==='info'} onClick={() => setTab('info')}>Información</button>
        {chat.type!=='secret' && chat.supported && <button type="button" aria-pressed={tab==='media'} onClick={() => setTab('media')}>Compartido</button>}
        {related && <button type="button" aria-pressed={tab==='related'} onClick={() => setTab('related')}>{related}</button>}
      </nav>
    </>}
    {error ? <p className="settings-note" role="status">{error} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></p>
      : !profile && chat?.type !== 'secret' && <p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/> Consultando el perfil…</p>}
    {chat && tab==='info' && <div className="peer-info">
      {profile?.bio && <div className="peer-bio"><small>{chat.type==='group'||chat.type==='channel'?'Descripción':'Biografía'}</small><FormattedText text={profile.bio} entities={profile.bioEntities} openUrl={openUrl}/></div>}
      {usernames.map(username => <button type="button" className="peer-row" key={username} onClick={() => copy('@'+username)}>
        <AtSign size={17}/><span><small>Nombre de usuario</small><strong>@{username}</strong></span><Copy size={15}/>
      </button>)}
      {profile?.phone && <button type="button" className="peer-row" onClick={() => copy(profile.phone!)}><Phone size={17}/><span><small>Teléfono</small><strong>{'+' + profile.phone.replace(/^\+/, '')}</strong></span><Copy size={15}/></button>}
      {birthday && <div className="peer-row"><CalendarDays size={17}/><span><small>Cumpleaños</small><strong>{birthday}</strong></span></div>}
      {profile?.linkedChatId && profile.linkedChatId!=='0' && <button type="button" className="peer-row" onClick={() => openPeer(profile.linkedChatId!, chat)}><Link2 size={17}/><span><strong>Conversación vinculada</strong></span><ChevronRight size={16}/></button>}
      {!!profile?.administratorCount && <div className="peer-row"><Users size={17}/><span><small>Administradores</small><strong>{NUMBER(profile.administratorCount)}</strong></span></div>}
      {!!profile?.commands?.length && <details className="peer-bio"><summary>Comandos del bot</summary><ul>{profile.commands.map(command => <li key={command.name}><strong>/{command.name}</strong> {command.description}</li>)}</ul></details>}
      {profile?.privacyUrl && <button type="button" className="peer-row" onClick={() => openUrl(profile.privacyUrl!)}><LockKeyhole size={17}/><span><strong>Política de privacidad del bot</strong></span><ChevronRight size={16}/></button>}
      {chat.type==='secret' && <div className="peer-bio"><small>Seguridad</small><p>{chat.secretState === 'ready' ? 'Cifrado de extremo a extremo' : chat.secretState === 'closed' ? 'Cerrado' : 'Esperando a la otra persona'}</p>{chat.fingerprint&&<pre>{chat.fingerprint}</pre>}</div>}
      {profile && !profile.bio && !usernames.length && !profile.phone && !birthday && !profile.linkedChatId && <p className="settings-note">Telegram no muestra más datos de este perfil.</p>}
    </div>}
    {chat && tab==='media' && <SharedGallery chat={chat} jump={jump} openUrl={openUrl}/>}
    {chat && tab==='related' && <ProfileRelated chat={chat} openPeer={openPeer} openMember={openMember}/>}
  </div>;
}

function NUMBER(value:number) { return value.toLocaleString('es'); }

function ProfileRelated({ chat, openPeer, openMember }: {chat:Chat;openPeer(id:string,parent:Chat):void;openMember(id:string,parent:Chat):void}) {
  const [result, setResult] = useState<Related>();
  const [error, setError] = useState('');
  const [page, setPage] = useState({ offset:0, cursor:'0' });
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setError(''); setLoading(true);
    void request<Related>('profile.related', { id:chat.id, ...page }).then(value => {
      if (!active) return;
      setResult(previous => ({ ...value,
        ...(value.chats ? {chats:[...previous?.chats || [],...value.chats]} : {}),
        ...(value.members ? {members:[...previous?.members || [],...value.members]} : {}),
      }));
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar la lista.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chat.id, page, retry]);
  const more = result?.hasMore || (result?.nextCursor && result.nextCursor !== '0' && result.nextCursor !== page.cursor);
  return <div className="peer-info">
    {result?.chats?.map(peer => <button type="button" className="peer-person" key={peer.id} onClick={() => openPeer(peer.id, chat)}><Avatar chat={peer}/><strong>{peer.title}</strong><ChevronRight size={17}/></button>)}
    {result?.members?.map(member => <button type="button" className="peer-person" key={member.id} onClick={() => openMember(member.id, chat)}><Avatar chat={{id:member.id,title:member.name,photo:member.photo,bot:false}}/><span><strong>{member.name}</strong>{member.role && <small>{member.role}</small>}</span><ChevronRight size={17}/></button>)}
    {error && <p role="status" className="settings-note">{error} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></p>}
    {loading && <p role="status" className="settings-note"><LoaderCircle className="spin" size={15}/> Cargando…</p>}
    {!loading && !error && !result?.chats?.length && !result?.members?.length && <p className="settings-note">No hay resultados visibles.</p>}
    {more && !error && <button className="secondary full" type="button" disabled={loading} onClick={() => setPage({offset:result?.nextOffset || 0,cursor:result?.nextCursor || '0'})}>Cargar más</button>}
  </div>;
}
