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
  { label: 'lista de chats, carpetas con sus enlaces e historial', methods: ['chats.list', 'chats.more', 'folders.list', 'folders.get', 'folders.save', 'folders.delete', 'folders.link', 'folders.join', 'folders.links.list', 'folders.links.edit', 'folders.links.delete', 'history.older', 'history.newer', 'history.refresh', 'history.byDate'] },
  { label: 'texto con formato, respuestas y borradores', methods: ['send.text', 'draft.set', 'typing'] },
  // Las tres caras de editar están cableadas: el texto y el pie desde la AH, y el archivo desde la CK-B, que sube
  // el elegido con `upload.saveFilePart` y reescribe la fila con el parámetro `media` de `messages.editMessage`.
  { label: 'editar, borrar y reenviar mensajes', methods: ['message.edit', 'message.edit.caption', 'message.edit.media', 'message.delete', 'messages.delete', 'message.forward', 'messages.forward', 'message.copy'] },
  { label: 'archivos, fotos y álbumes enviados', methods: ['attachment.pick', 'send.attachment', 'send.album', 'attachment.album', 'attachment.discard', 'message.album'] },
  { label: 'encuestas creadas y votadas', methods: ['poll.send', 'poll.answer', 'poll.voters'] },
  { label: 'programación de mensajes', methods: ['scheduled.list', 'scheduled.sendNow', 'scheduled.reschedule', 'scheduled.delete'] },
  { label: 'lectura, archivo y silencio', methods: ['chat.read', 'chat.unread', 'chat.archive', 'chat.mute', 'chat.defaultSilent'] },
  { label: 'fijar un mensaje y fijar la conversación', methods: ['chat.pin', 'message.pin', 'chat.pinned', 'message.properties'] },
  // La ronda BX sacó estas dos claves de «pendiente»: la negativa de la ronda AG buscaba en la librería
  // `messages.setReactions` y `TypeReaction`, que son los nombres que Telegram jubiló. La petición actual es
  // `messages.sendReaction`, y está.
  { label: 'poner y quitar reacciones de emoji y personalizadas', methods: ['message.react', 'message.react.custom'] },
  { label: 'multimedia recibida y su descarga', methods: ['media.load', 'media.retry', 'media.export', 'downloads.status', 'downloads.queue', 'downloads.pause', 'downloads.item.add', 'downloads.item.pause', 'downloads.item.cancel', 'downloads.item.remove'] },
  { label: 'vista previa de documentos de texto y archivos ZIP', methods: ['media.text', 'media.archive'] },
  { label: 'búsqueda con filtros guardados', methods: ['chats.search', 'messages.search', 'messages.search.more', 'search.filters.list', 'search.filters.save', 'search.filters.delete'] },
  { label: 'agenda leída: ver, buscar, compartir contacto y abrir su chat', methods: ['contacts.list', 'contacts.search', 'contacts.open', 'share.contact', 'profile.contact'] },
  { label: 'agenda escribible: añadir y quitar una persona de la lista', methods: ['contacts.add', 'contacts.remove'] },
  { label: 'administración de comunidades: miembros, permisos, nombre, foto, enlaces y solicitudes', methods: ['groups.members', 'groups.members.page', 'groups.members.basic', 'groups.add.info', 'groups.member.add', 'groups.member.ban', 'groups.member.unban', 'groups.member.restrict', 'groups.member.promote', 'groups.member.demote', 'groups.permissions.get', 'groups.permissions.set', 'chat.info', 'chat.info.set', 'chat.username', 'chat.username.set', 'chat.photo.pick', 'chat.invite', 'chat.invitelinks', 'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke', 'chat.requests', 'chat.request.answer', 'groups.stats'] },
  { label: 'privacidad de la cuenta y remitentes bloqueados', methods: ['privacy.get', 'privacy.set', 'privacy.blocked', 'privacy.unblock', 'profile.block'] },
  { label: 'autodestrucción por chat y predeterminada', methods: ['chat.autoDelete', 'chat.autoDelete.set', 'privacy.autoDelete', 'privacy.autoDelete.set'] },
  { label: 'perfil propio, foto y sesiones activas', methods: ['account.profile', 'account.name', 'account.bio', 'account.username', 'account.photo.pick', 'account.photo.delete', 'account.sessions', 'account.session.revoke'] },
  { label: 'fichas de chat y de persona', methods: ['chat.profile', 'profile.peer', 'profile.related', 'profile.sender'] },
  { label: 'historias leídas: bandeja, perfil, abrir y cerrar', methods: ['chat.stories', 'story.open', 'message.story.open', 'story.close'] },
  { label: 'traducir y transcribir', methods: ['message.translate', 'message.transcribe', 'message.transcribe.rate'] },
  { label: 'unirse, salir y abrir enlaces de invitación y el enlace de un mensaje', methods: ['chat.join', 'chat.leave', 'telegram.link', 'link.open', 'message.link'] },
  { label: 'cartera de Stars y sus suscripciones', methods: ['stars.options', 'stars.revenue', 'stars.transactions', 'stars.withdraw', 'stars.subscriptions', 'stars.subscription.cancel', 'stars.subscription.resume', 'stars.subscription.reuse'] },
  { label: 'respuestas rápidas de Telegram Business', methods: ['business.quick.list', 'business.quick.add', 'business.quick.edit', 'business.quick.delete', 'business.quick.name', 'business.quick.send', 'business.quick.messages'] },
  { label: 'tema, tipografía y fondo', methods: ['appearance'] },
  // La ronda BY cableó las once claves de la familia. Dos matices van en la propia etiqueta, porque son lo que
  // queda: `emojiStatus.set` pone pero no quita —WTelegramClient 4.4.10 no tiene `account.clearEmojiStatus`, y el
  // id cero se rechaza con causa en vez de fingir un borrado—, y `customEmoji.search` busca por el caracter que
  // Android usa como texto alternativo, no por nombre de pack. `emojiStatus.state` se queda fuera de la lista a
  // pesar de tener brazo: ninguna pantalla la llama en ninguna capa, porque la marca viaja en el estado empujado, y
  // la compuerta BJ solo admite afirmar lo que la interfaz nombra.
  { label: 'estado emoji puesto (no quitado), packs y stickers', methods: ['emojiStatus.options', 'emojiStatus.set', 'customEmoji.get', 'customEmoji.search', 'emojiPacks.list', 'emojiPacks.get', 'stickers.installed', 'stickers.search', 'stickers.get', 'stickers.install'] },
  // La ronda CD cableó `premium.state`: la marca sale de la bandera `User.Flags.premium` de la sesión conectada, sin
  // petición, y es la que abre el botón ✨ del menú del mensaje y la que el selector de emojis personalizados lee antes
  // de avisar de que Telegram rechazará la ficha. Los dos huecos están dichos en `DesktopPremiumState.cs`: el texto
  // del plan y sus opciones de pago siguen vacíos porque WTelegramClient 4.4.10 no tiene la petición de TDLib que los
  // llena, y el panel de Premium no se ofrece en el escritorio. Por eso la etiqueta habla de la marca y no del plan.
  { label: 'marca de Premium de la cuenta', methods: ['premium.state'] },
  // La ronda CB cableó el `messages.editMessage` con el bit `stopped` de `inputMediaGeoLive`, que es lo que hace el
  // botón «Dejar de compartir» de la tarjeta. Lo demás de la familia está en «pendiente» aquí abajo.
  { label: 'dejar de compartir una ubicación en directo propia', methods: ['location.live.stop'] },
];

/** Lo que falta, con las claves que lo negarían; ninguna de estas líneas se ofrece en la pantalla. */
export const DESKTOP_PENDING: readonly ScopeClaim[] = [
  { label: 'notas de voz y vídeo de un solo uso', methods: ['voice.start', 'voice.finish', 'voice.cancel', 'attachment.videoNote', 'attachment.videoNote.record', 'attachment.camera', 'send.paidMedia'] },
  { label: 'crear historias', methods: ['story.create.photo', 'story.create.video'] },
  // La ronda BZ cableó las cuatro lectoras (`chat.stories`, `story.open`, `message.story.open`, `story.close`), así
  // que el hueco que queda en la familia es todo lo que escribe sobre una historia. Con `story.reactions` fuera de
  // esta lista, el visor de escritorio la preguntaba igual y el aviso del host salía como aviso en pantalla.
  { label: 'reacciones e interacciones de una historia', methods: ['story.reactions', 'story.react', 'story.interactions'] },
  { label: 'editar el pie, cambiar la visibilidad o borrar una historia propia', methods: ['story.edit.caption', 'story.profile.toggle', 'story.delete'] },
  { label: 'álbumes de historias', methods: ['story.albums.list', 'story.albums.create', 'story.albums.rename', 'story.albums.delete', 'story.albums.order', 'story.albums.add', 'story.albums.remove', 'story.albums.story.order', 'story.albums.stories'] },
  { label: 'reacciones de pago y cerrar una encuesta', methods: ['message.react.paid', 'poll.stop'] },
  { label: 'listar los mensajes fijados de una conversación', methods: ['pinned.list'] },
  { label: 'quitar la foto de una comunidad', methods: ['chat.photo.delete'] },
  { label: 'reintentar un mensaje que no se envió', methods: ['message.retry'] },
  { label: 'crear grupos o foros, ver la lista de expulsados, traspasar la propiedad y los chats secretos', methods: ['groups.create', 'groups.createSuper', 'groups.banned', 'groups.events', 'forum.create', 'forum.topics', 'chat.transfer', 'chat.transfer.check', 'chat.secret'] },
  { label: 'importar la agenda y sincronizarla con la del teléfono', methods: ['contacts.import', 'contacts.sync.set', 'contacts.sync.now'] },
  { label: 'denuncias, avisos de seguridad y controles de los patrocinados', methods: ['chat.report', 'message.report', 'chat.safety', 'chat.safety.dismiss', 'sponsored.report', 'sponsored.open', 'sponsored.view', 'sponsored.settings', 'sponsored.settings.set'] },
  { label: 'contraseña de dos pasos, su correo y la recuperación', methods: ['password.set', 'password.state', 'password.email.set', 'password.email.check', 'password.email.resend', 'password.email.cancel', 'auth.recover.request', 'auth.recover.reset'] },
  { label: 'acceso por QR, reenvío del código y varias cuentas en el equipo', methods: ['authenticate.qr', 'auth.resend', 'accounts.add', 'accounts.switch'] },
  { label: 'notificaciones push, llamadas y WR IA', methods: ['notifications.enable', 'notifications.disable', 'call.open', 'calls.list', 'assistant.send', 'assistant.status', 'native.assistant'] },
  { label: 'Mini Apps, bots y el resto de Telegram Business', methods: ['apps.open', 'apps.list', 'apps.chat', 'bot.father', 'bot.status', 'bot.publish', 'business.hours', 'business.greeting', 'business.away', 'business.location', 'business.links.list', 'business.bot.get', 'business.start'] },
  { label: 'ventajas y límites de Premium, regalos y pagos con Stars', methods: ['premium.features', 'premium.limit', 'gifts.catalog', 'gifts.send', 'gifts.received', 'payments.stars.prepare', 'payments.stars.confirm'] },
  { label: 'bloqueo local de la app, caché y proxies', methods: ['security.lock', 'security.timeout', 'security.lockNow', 'storage.status', 'storage.details', 'storage.settings', 'storage.optimize', 'proxy.list', 'proxy.add', 'proxy.enable'] },
  { label: 'listas de tareas, traducción automática del chat y etiquetas de Guardados', methods: ['checklist.add', 'checklist.send', 'chat.autotranslate', 'chat.translatable', 'saved.tags', 'saved.tag.label', 'saved.topics.pin', 'saved.search'] },
  { label: 'fondos guardados en tu cuenta de Telegram', methods: ['backgrounds.list', 'background.set'] },
  { label: 'reproducir en el visor nativo y abrir el archivo en otra app', methods: ['media.play', 'media.open'] },
  { label: 'ventajas por nivel de impulso y paleta dinámica del sistema', methods: ['chat.boost.features', 'chat.boost.level', 'appearance.systemPalette'] },
  { label: 'resultados inline de los bots', methods: ['bot.inline.query', 'bot.inline.more', 'bot.inline.send', 'bot.inline.choose', 'bot.inline.cancel'] },
  // La ronda CI cableó los tres enlaces de carpeta; lo que queda de la línea son las notas, y esas sí siguen sin
  // con qué: la sonda de la CG no encontró en MTProto más que `Contacts_UpdateContactNote`, nota de un contacto.
  { label: 'notas privadas por chat', methods: ['notes.write', 'notes.read', 'notes.clear'] },
  // Empezar a compartir no es que falte tiempo: `WRGram.Desktop.csproj:5` se compila contra `net8.0-windows`, que no
  // proyecta `Windows.Devices.Geolocation`, y el único `CoreWebView2.Environment` del host (`MainWindow.xaml.cs:134`)
  // sirve archivos —no pide permisos— porque `PermissionRequested` no aparece en ninguno. Sin sensor que leer no hay
  // punto que enviar, y la ronda CB lo negó por su nombre en vez de dejarlo caer en el rechazo genérico del `switch`.
  { label: 'compartir una ubicación desde el equipo, fija o en directo', methods: ['share.location', 'location.live.start'] },
];

export const DESKTOP_AVAILABLE_TEXT = 'Disponible: ' + DESKTOP_AVAILABLE.map(claim => claim.label).join(', ') + '.';
export const DESKTOP_PENDING_TEXT = 'Pendiente en escritorio: ' + DESKTOP_PENDING.map(claim => claim.label).join(', ') +
  '. Estas funciones no se simulan: si una acción no está disponible, la app lo indica.';
