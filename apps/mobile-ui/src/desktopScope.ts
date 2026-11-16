/**
 * Las dos listas del aviso «ALCANCE DE ESTA BETA» del escritorio (ronda BJ).
 *
 * El párrafo vivía escrito a pelo en la sección «ALCANCE DE ESTA BETA» de `SettingsPage.tsx` y ya mentía: negaba
 * «envío de archivos», «contactos», «administración de grupos» y «búsqueda» muchas rondas después de que el puente
 * de Windows contestara sus peticiones (`send.attachment` desde la AK, `chats.search` desde la O-S-T,
 * `groups.member.*` desde la AZ-BB, `contacts.list` desde la BH). La causa no es una frase descuidada sino la forma:
 * mientras el aviso sea prosa suelta, nada lo comprueba y vuelve a pudrirse en verde. Aquí cada afirmación lleva las
 * claves del puente que la sostienen, así que `rondaBJ.test.ts` las mide contra el despacho real de
 * `TelegramService.cs`: una línea solo es «disponible» si **todas** sus claves tienen brazo que no se niega a sí
 * mismo, y solo es «pendiente» si **ninguna** lo tiene. Lo que el cable no contesta no se afirma, y lo que el cable
 * contesta no se niega.
 *
 * Todas las claves citadas existen en la lista del puente (`BridgePolicy.java`) y tienen su `case` en
 * `NativeBridge.java`: afirmar sobre una clave que ninguna capa conoce sería una promesa vacía en las dos
 * direcciones. Lo contrario también cuenta: `bold`, `code` o `blockquote` no son claves del puente sino tipos de
 * entidad que viajan dentro de `send.text`, y por eso no se citan aquí.
 */
export type ScopeClaim = { readonly label: string; readonly methods: readonly string[] };

/** Lo que el puente de Windows responde hoy, familia por familia. */
export const DESKTOP_AVAILABLE: readonly ScopeClaim[] = [
  { label: 'inicio de sesión con número y código', methods: ['connect', 'authenticate', 'auth.register', 'logout'] },
  { label: 'lista de chats, carpetas e historial', methods: ['chats.list', 'chats.more', 'folders.list', 'folders.get', 'folders.save', 'folders.delete', 'folders.join', 'history.older', 'history.newer', 'history.refresh', 'history.byDate'] },
  { label: 'texto con formato, respuestas y borradores', methods: ['send.text', 'draft.set', 'typing'] },
  { label: 'editar, borrar y reenviar mensajes', methods: ['message.edit', 'message.edit.caption', 'message.delete', 'messages.delete', 'message.forward', 'messages.forward', 'message.copy'] },
  { label: 'archivos, fotos y álbumes enviados', methods: ['attachment.pick', 'send.attachment', 'send.album', 'attachment.album', 'attachment.discard', 'message.album'] },
  { label: 'encuestas creadas y votadas', methods: ['poll.send', 'poll.answer', 'poll.voters'] },
  { label: 'programación de mensajes', methods: ['scheduled.list', 'scheduled.sendNow', 'scheduled.reschedule', 'scheduled.delete'] },
  { label: 'lectura, archivo y silencio', methods: ['chat.read', 'chat.unread', 'chat.archive', 'chat.mute'] },
  { label: 'fijar un mensaje y fijar la conversación', methods: ['chat.pin', 'message.pin', 'chat.pinned', 'message.properties'] },
  { label: 'multimedia recibida y su descarga', methods: ['media.load', 'media.retry', 'media.export', 'downloads.status', 'downloads.queue', 'downloads.pause', 'downloads.item.add', 'downloads.item.pause', 'downloads.item.cancel', 'downloads.item.remove'] },
  { label: 'búsqueda con filtros guardados', methods: ['chats.search', 'messages.search', 'messages.search.more', 'search.filters.list', 'search.filters.save', 'search.filters.delete'] },
  { label: 'agenda leída: ver, buscar, compartir contacto y abrir su chat', methods: ['contacts.list', 'contacts.search', 'contacts.open', 'share.contact', 'profile.contact'] },
  { label: 'agenda escribible: añadir y quitar una persona de la lista', methods: ['contacts.add', 'contacts.remove'] },
  { label: 'administración de comunidades: miembros, permisos, nombre, foto, enlaces y solicitudes', methods: ['groups.members', 'groups.members.page', 'groups.members.basic', 'groups.add.info', 'groups.member.add', 'groups.member.ban', 'groups.member.unban', 'groups.member.restrict', 'groups.member.promote', 'groups.member.demote', 'groups.permissions.get', 'groups.permissions.set', 'chat.info', 'chat.info.set', 'chat.username', 'chat.username.set', 'chat.photo.pick', 'chat.invite', 'chat.invitelinks', 'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke', 'chat.requests', 'chat.request.answer'] },
  { label: 'privacidad de la cuenta y remitentes bloqueados', methods: ['privacy.get', 'privacy.set', 'privacy.blocked', 'privacy.unblock', 'profile.block'] },
  { label: 'autodestrucción por chat y predeterminada', methods: ['chat.autoDelete', 'chat.autoDelete.set', 'privacy.autoDelete', 'privacy.autoDelete.set'] },
  { label: 'perfil propio, foto y sesiones activas', methods: ['account.profile', 'account.name', 'account.bio', 'account.username', 'account.photo.pick', 'account.photo.delete', 'account.sessions', 'account.session.revoke'] },
  { label: 'fichas de chat y de persona', methods: ['chat.profile', 'profile.peer', 'profile.related', 'profile.sender'] },
  { label: 'traducir y transcribir', methods: ['message.translate', 'message.transcribe', 'message.transcribe.rate'] },
  { label: 'unirse, salir y abrir enlaces de invitación', methods: ['chat.join', 'chat.leave', 'telegram.link', 'link.open'] },
  { label: 'cartera de Stars y sus suscripciones', methods: ['stars.options', 'stars.revenue', 'stars.transactions', 'stars.withdraw', 'stars.subscriptions', 'stars.subscription.cancel', 'stars.subscription.resume', 'stars.subscription.reuse'] },
  { label: 'respuestas rápidas de Telegram Business', methods: ['business.quick.list', 'business.quick.add', 'business.quick.edit', 'business.quick.delete', 'business.quick.name', 'business.quick.send', 'business.quick.messages'] },
  { label: 'tema, tipografía y fondo', methods: ['appearance'] },
];

/** Lo que falta, con las claves que lo negarían; ninguna de estas líneas se ofrece en la pantalla. */
export const DESKTOP_PENDING: readonly ScopeClaim[] = [
  { label: 'notas de voz y vídeo de un solo uso', methods: ['voice.start', 'voice.finish', 'voice.cancel', 'attachment.videoNote', 'attachment.videoNote.record', 'attachment.camera', 'send.paidMedia'] },
  { label: 'historias', methods: ['story.open', 'story.create.photo', 'story.create.video', 'chat.stories', 'message.story.open'] },
  { label: 'poner reacciones y cerrar una encuesta', methods: ['message.react', 'message.react.custom', 'message.react.paid', 'poll.stop'] },
  { label: 'listar los mensajes fijados de una conversación', methods: ['pinned.list'] },
  { label: 'quitar la foto de una comunidad', methods: ['chat.photo.delete'] },
  { label: 'reintentar un mensaje que no se envió', methods: ['message.retry'] },
  { label: 'crear grupos o foros, ver la lista de expulsados, traspasar la propiedad y los chats secretos', methods: ['groups.create', 'groups.createSuper', 'groups.banned', 'groups.events', 'forum.create', 'forum.topics', 'chat.transfer', 'chat.transfer.check', 'chat.secret'] },
  { label: 'importar la agenda y sincronizarla con la del teléfono', methods: ['contacts.import', 'contacts.sync.set', 'contacts.sync.now'] },
  { label: 'denuncias, avisos de seguridad y controles de los patrocinados', methods: ['chat.report', 'message.report', 'chat.safety', 'chat.safety.dismiss', 'sponsored.report', 'sponsored.open', 'sponsored.view', 'sponsored.settings', 'sponsored.settings.set'] },
  { label: 'contraseña de dos pasos, su correo y la recuperación', methods: ['password.set', 'password.state', 'password.email.set', 'password.email.check', 'password.email.resend', 'password.email.cancel', 'auth.recover.request', 'auth.recover.reset'] },
  { label: 'acceso por QR, reenvío del código y varias cuentas en el equipo', methods: ['authenticate.qr', 'auth.resend', 'accounts.add', 'accounts.switch'] },
  { label: 'notificaciones push, llamadas y WR IA', methods: ['notifications.enable', 'notifications.disable', 'call.open', 'assistant.send', 'assistant.status', 'native.assistant'] },
  { label: 'Mini Apps, bots y el resto de Telegram Business', methods: ['apps.open', 'apps.list', 'apps.chat', 'bot.father', 'bot.status', 'bot.publish', 'business.hours', 'business.greeting', 'business.away', 'business.location', 'business.links.list', 'business.bot.get', 'business.start'] },
  { label: 'Premium, regalos y pagos con Stars', methods: ['premium.state', 'premium.features', 'premium.limit', 'gifts.catalog', 'gifts.send', 'gifts.received', 'payments.stars.prepare', 'payments.stars.confirm'] },
  { label: 'estado emoji, packs y stickers', methods: ['emojiStatus.state', 'emojiStatus.options', 'emojiStatus.set', 'customEmoji.get', 'customEmoji.search', 'emojiPacks.list', 'emojiPacks.get', 'stickers.search', 'stickers.install'] },
  { label: 'bloqueo local de la app, caché y proxies', methods: ['security.lock', 'security.timeout', 'security.lockNow', 'storage.status', 'storage.details', 'storage.settings', 'storage.optimize', 'proxy.list', 'proxy.add', 'proxy.enable'] },
  { label: 'listas de tareas, traducción automática del chat y etiquetas de Guardados', methods: ['checklist.add', 'checklist.send', 'chat.autotranslate', 'chat.translatable', 'saved.tags', 'saved.tag.label', 'saved.topics.pin', 'saved.search'] },
  { label: 'reproducir en el visor nativo y abrir el archivo en otra app', methods: ['media.play', 'media.open'] },
  { label: 'ventajas por nivel de impulso y paleta dinámica del sistema', methods: ['chat.boost.features', 'chat.boost.level', 'appearance.systemPalette'] },
  { label: 'resultados inline de los bots', methods: ['bot.inline.query', 'bot.inline.more', 'bot.inline.send', 'bot.inline.choose', 'bot.inline.cancel'] },
  { label: 'enlaces guardados dentro de carpetas y notas privadas por chat', methods: ['folders.links.list', 'folders.links.edit', 'folders.links.delete', 'notes.write', 'notes.read', 'notes.clear'] },
];

export const DESKTOP_AVAILABLE_TEXT = 'Disponible: ' + DESKTOP_AVAILABLE.map(claim => claim.label).join(', ') + '.';
export const DESKTOP_PENDING_TEXT = 'Pendiente en escritorio: ' + DESKTOP_PENDING.map(claim => claim.label).join(', ') +
  '. Estas funciones no se simulan: si una acción no está disponible, la app lo indica.';
