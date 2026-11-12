# WRGram: interfaz y paridad de clientes

## Referencias y alcance

Referencias indicadas por el propietario: **Nekogram, Webogram, Unigram y Plus Messenger**, además del cliente oficial. Se toma como referencia la organización y calidad visual, no se copia su código, marca ni se afirma equivalencia completa con sus versiones actuales. Esta matriz es el inventario de WRGram, no una auditoría de funciones de terceros.

Objetivo: interfaz React/Vite empaquetada localmente en Android con transporte TDLib real, no la demo dentro de un WebView. **La fuente local vigente es beta20 (`0.5.0-beta20`, código 24)**, generada localmente pero no subida a Play; beta19 (código 23), beta18 (código 22), beta17 (código 21) y beta16 (código 20) fueron instantáneas locales, beta14 (código 18) quedó como borrador en Play, beta13 (código 17) está en revisión y beta12 es la versión publicada de referencia. Esta matriz describe la fuente local posterior a beta18. Ver [estado Play](android-play.md), [BETA20](../artifacts/android/BETA20.md) y [BETA19](../artifacts/android/BETA19.md).

**Implementado** significa conectado a una operación real o almacenamiento local, no validado con la cuenta del propietario. Las pruebas del agente no autentican cuentas ni leen conversaciones privadas.

## Resumen vigente · beta20

| Área | Disponible | Límite principal |
| --- | --- | --- |
| Cuenta y chats | Hasta tres cuentas, chats privados/grupos, canales compatibles y chats secretos básicos; acceso por teléfono o correo, registro de cuenta nueva y recuperación de 2FA por correo | Apple ID/Google ID no se usan; los proveedores externos dependen de la app oficial |
| Bloqueo de la app | Autenticación del propio dispositivo (huella/rostro y, como alternativa, PIN, patrón o contraseña), retardo de 0/30/60/300 s, «Bloquear ahora» y cobertura de la interfaz nativa y las Mini Apps; no se guardan secretos en WRGram | Validado con PIN en emulador; biometría en hardware real y Android 9/10 pendientes. No cifra datos en reposo ni sustituye la 2FA de Telegram |
| Perfil y contactos | Editar perfil/foto, administrar contactos de Telegram, importar la agenda Android y sincronizarla cada 24 h en segundo plano mientras la opción siga activa | Hasta 200 contactos con número válido |
| Grupos y comunidades | Miembros paginados por filtro (recientes, administradores, restringidos, baneados, bots, contactos) y búsqueda; restringir o banear con duración de 1 h a permanente y borrado opcional de mensajes recientes; quitar sanción; promover con permisos prellenados, editarlos y quitar administración; crear supergrupos, foros y canales con descripción y nombre público posterior | La búsqueda de miembros no pagina porque TDLib no ofrece offset en `SearchChatMembers`; editar un administrador reemplaza el conjunto completo de permisos y Telegram puede rechazar los no delegables |
| Stickers | WebP, WebM y TGS animados; GIF; buscar, previsualizar, instalar y quitar packs oficiales de tu cuenta | Editor de packs propio y formatos avanzados pendientes |
| Encuestas | Crear encuestas y cuestionarios, votar (única o múltiple), consultar votantes y cerrar las propias | Sin programar encuestas ni editar opciones después de enviarlas |
| Fijados | Lista completa por chat/tema con salto a cada mensaje y desfijado individual; la barra superior se refresca con los cambios | Hasta 100 fijados por chat, límite de Telegram |
| Borradores | Texto del borrador guardado en Telegram por chat/tema y recuperable en otros clientes | Solo texto: no se sincronizan respuestas ni formato; los chats secretos no usan borradores en la nube |
| Voz y videomensajes | Notas de voz de hasta 60 s con onda real; videomensajes grabados con la cámara o elegidos como MP4, con tope de 60 s, 640 px por lado y 20 MB | La grabación depende de la app de cámara del dispositivo; no se recodifica en local y Telegram recorta el resultado a un círculo |
| Compartir | Contactos de Telegram y ubicación reciente tras permiso y confirmación nativa | Solo se comparte el número que Telegram ya expone; el contacto no se crea ni se modifica |
| Proxy y almacenamiento | SOCKS5/MTProto/HTTP/Web administrados por TDLib sin devolver credenciales; estadísticas y optimización por antigüedad | Sin reglas automáticas por red ni limpieza programada |
| Historias | Consultar y abrir historias activas; publicar fotos o vídeos MP4 de 1–60 s y hasta 20 MB con texto y área de enlace; editar texto, visibilidad, eliminar, reaccionar y consultar las interacciones de las propias; crear, renombrar, borrar y reordenar álbumes propios y listar, añadir, quitar y mover historias dentro de ellos | Las áreas solo se definen al publicar (TDLib no permite editarlas sin cambiar el contenido); no se sustituye el vídeo/foto publicado; las interacciones solo se listan para historias propias; dentro de un álbum solo se ofrece mover al inicio porque `ReorderStoryAlbumStories` actúa sobre los identificadores indicados |
| Mensajes programados | Lista real por chat, envío inmediato y cambio de hora con `EditMessageSchedulingState`; eliminar con `DeleteMessages` | Solo mensajes ya programados en Telegram; no crea programados nuevos desde la lista |
| Contraseña de dos pasos | Lee `PasswordState`, establece o cambia la contraseña y la quita con confirmación; la pista y el correo de recuperación se muestran, pero el correo no se modifica | El secreto viaja directo a Telegram y no se guarda; no se admiten cambios de correo desde WRGram |
| Excepciones de privacidad | Reglas `AllowUsers`/`RestrictUsers` por ajuste, con búsqueda de contactos y hasta 200 excepciones | Los valores «Personalizado» se muestran pero no se reescriben sin elegir Todos/Mis contactos/Nadie |
| Filtros de búsqueda | Filtros por fotos, vídeos, multimedia, documentos, audio, voz, videomensajes, animaciones, enlaces y encuestas, en chat y en Todo Telegram; menciones solo dentro de un chat | El filtro de menciones global no lo admite `SearchMessages` en este binding y se rechaza con aviso |
| Reacciones y vistas de historias | Reacciones normales y personalizadas sobre historias, y lista de interacciones de las historias propias (vistas, reenvíos y reposts) | `GetStoryInteractions` solo funciona con historias propias; la lista muestra las primeras 50 |
| Estado emoji | Estado emoji Premium con emojis por defecto, temáticos y recientes, y caducidad opcional | Requiere Telegram Premium; no se inventan estados si Telegram no devuelve opciones |
| Stars | Facturas `XTR` de pago único y suscripciones recurrentes, con doble confirmación y aviso de renovación; reacciones de pago y emojis personalizados se envían mediante TDLib | Otras monedas/tarjetas no están disponibles: requieren tokenización del proveedor |
| Mini Apps | Solicitudes consentidas acotadas, ubicación/teléfono/clipboard, DeviceStorage, pantalla completa, bloqueo de orientación, cámara/micrófono con diálogo nativo por sesión, botón secundario y de ajustes, área segura, comprobación de permiso de escritura, cierre de factura, pantalla de inicio, estado emoji con autorización explícita del bot, compartir en historias, consulta inline y acceso directo en la pantalla de inicio | Facturas por *slug* siguen fuera (este binding de TDLib no expone `InputInvoiceSlug`); la cámara/micrófono se revoca al cerrar la Mini App y no hay consentimiento permanente; el estado emoji no se persiste en WRGram |
| Llamadas y notificaciones | Llamadas no disponibles en esta compilación | Falta el motor de medios `tgcalls`/`libtgvoip`; no se simula la interfaz. Push FCM implementado pero sin configurar |

Los flujos nuevos requieren pruebas del propietario con cuentas/bots controlados. No describir la app como equivalente al cliente oficial.

### Detalle del lote local posterior a beta18 · beta19, corregido en beta20

- **Administración paginada**: `groups.members.page` llama a `GetSupergroupMembers` con los filtros `SupergroupMembersFilterRecent`, `Administrators`, `Restricted`, `Banned`, `Bots` y `Contacts`, offset y límite de 50, con «Cargar más» y refresco manual. `groups.members` sigue devolviendo el array simple que usa la transferencia de propiedad.
- **Búsqueda de miembros**: `groups.members.page` con texto usa `SearchChatMembers`; como esa llamada no admite offset, la respuesta indica `nextOffset=0` y `hasMore=false` en lugar de prometer una paginación inexistente.
- **Restringir y banear**: `groups.member.restrict` aplica `ChatMemberStatusRestricted(true, until, ChatPermissions vacíos)`; `groups.member.ban` aplica `ChatMemberStatusBanned(until)`. La UI ofrece 1 h, 24 h, 7 d, 30 d o permanente con la fecha resultante visible antes de confirmar.
- **Borrar mensajes recientes**: una casilla desmarcada por defecto añade `DeleteChatMessagesBySender(chat.id, MessageSenderUser)` a la sanción, solo si el usuario lo pide.
- **Quitar sanción**: `groups.member.unban` restaura `ChatMemberStatusMember` tanto para baneados como para restringidos, con confirmación y sin invitación automática.
- **Roles**: `groups.member.promote` construye `ChatAdministratorRights` con los permisos que TDLib marca como delegables y respeta `ChatMemberStatusAdministrator.canBeEdited` y los `currentRights` al prellenar el editor. Guardar reemplaza el conjunto completo; la UI avisa de que Telegram puede rechazar cambios sobre permisos no delegables. `groups.member.demote` devuelve al miembro a `ChatMemberStatusMember`.
- **Comunidades**: `groups.createSuper` crea supergrupo, foro o canal con nombre y descripción opcionales en pasos separados y confirmación previa. Tras crearlo, `chat.username.set` permite fijar el nombre público solo si Telegram confirma que está disponible; no se invita a nadie ni se publica contenido.
- **Álbumes de historias**: `story.albums.list`, `story.albums.stories`, `story.albums.create`, `story.albums.rename`, `story.albums.delete`, `story.albums.reorder`, `story.album.add`, `story.album.remove` y `story.album.reorder` cubren `GetChatStoryAlbums`, `GetStoryAlbumStories`, `CreateStoryAlbum`, `SetStoryAlbumName`, `DeleteStoryAlbum`, `ReorderStoryAlbums`, `AddStoryAlbumStories`, `RemoveStoryAlbumStories` y `ReorderStoryAlbumStories`. «Archivo» se reconoce por `StoryAlbum.archive` y se excluye de renombrar y borrar; solo se ofrecen historias con `canBeAddedToAlbum`.
- **Mini Apps · eventos añadidos**: se manejan `web_app_setup_settings_button`, `web_app_setup_secondary_button` y `web_app_setup_main_button` con sus eventos `settings_button_pressed`, `secondary_button_pressed` y `main_button_pressed`; se añaden `web_app_request_safe_area` → `safe_area_changed`, `web_app_check_write_access` → `write_access_requested`, `web_app_request_emoji_status_access` → `emoji_status_access_requested` y `web_app_set_emoji_status`. Los eventos que este binding no admite se responden como no disponibles en lugar de simularse.
- **Mini Apps · estado emoji**: la Mini App necesita autorización explícita del bot con `ToggleBotCanManageEmojiStatus` antes de cambiar el estado; el diálogo nativo explica el alcance y la app valida el identificador y la caducidad antes de `SetEmojiStatus`. La concesión dura lo que dura la Mini App y no se persiste.

### Detalle de las funciones añadidas en beta14

- **Historias de vídeo y áreas**: selector `video/*`, copia privada con tope de 20 MB, validación local de duración 1–60 s y carátula; se publican con `PostStory` y un área de enlace opcional (`InputStoryAreaTypeLink`) colocada sobre el borde inferior. Telegram recomienda 720×1280 H.265; los vídeos con otros códecs/tamaños dependen de la validación del servidor y de una prueba con cuenta real.
- **Sincronización de agenda en segundo plano**: `WorkManager` ejecuta una importación cada 24 h solo si hay al menos una cuenta con la opción activa, permiso `READ_CONTACTS` y consentimiento. Si no hay ninguna pantalla abierta, el trabajador inicia TDLib, espera hasta 75 s, importa y cierra el cliente sin cerrar la sesión del usuario.
- **Destinos inline**: además de chats públicos, se resuelven bots (`BotStart`), mensajes (`GetMessageLinkInfo`) e historias/en vivo; el botón original se vuelve a verificar antes de consultar el bot inline y nada se envía hasta elegir un resultado.
- **Mini Apps**: pantalla completa, bloqueo de orientación, consulta de pantalla de inicio (respuesta `unknown`), acceso a estado emoji (cancelado) y cierre de facturas por *slug* con estado `failed`, porque este binding de TDLib no expone `InputInvoiceSlug`.
- **Llamadas VoIP**: siguen sin implementar; no existe motor de medios `tgcalls`/`libtgvoip` en el proyecto y no se añade una interfaz ficticia.

### Detalle de las funciones añadidas en beta15

- **Encuestas**: `InputMessagePoll` con tipo regular o cuestionario, 2–10 opciones, voto anónimo, múltiple, revotación y resultados ocultos; votar con `SetPollAnswer`, cerrar con `StopPoll` y listar votantes con `GetPollVoters`. La UI muestra el orden real de TDLib (`optionOrder`), porcentajes, restricción de voto y explicación del cuestionario.
- **Notas de voz**: `MediaRecorder` en M4A/AAC mono, onda calculada a partir de amplitudes reales, límite de 60 s con parada automática y envío con `InputMessageVoiceNote`. El permiso `RECORD_AUDIO` se pide solo al grabar y la grabación se cancela al cerrar la sesión o cambiar de chat.
- **Videomensajes**: selector de MP4 con validación local (1–60 s, cuadrado, ≤640 px y ≤20 MB) mediante `MediaMetadataRetriever` y envío con `InputMessageVideoNote`. No se recodifica ni se graba con la cámara: se rechaza cualquier vídeo que no cumpla el formato.
- **Contactos y ubicación**: `InputMessageContact` solo con números que Telegram ya expone en tus contactos; `InputMessageLocation` usa la última ubicación de Android (≤5 min), pide permiso y exige una segunda confirmación con coordenadas y precisión antes de enviar.
- **Packs de stickers**: `GetInstalledStickerSets`, `SearchStickerSet`, `GetStickerSet` y `ChangeStickerSet`; vista previa limitada a 24 stickers y sin descargas fuera de Telegram.
- **Proxy**: `AddProxy`/`EnableProxy`/`DisableProxy`/`RemoveProxy`/`PingProxy` para SOCKS5, MTProto, HTTP y Web. La interfaz nunca recibe contraseñas ni secretos de vuelta.
- **Almacenamiento**: `GetStorageStatisticsFast` para el desglose y `OptimizeStorage` con ventanas de 7/30/90 días, conservando miniaturas, packs y fondos. No borra mensajes de Telegram.

### Detalle del lote local posterior a beta15

- **Mensajes fijados**: `pinned.list` enumera hasta 100 fijados del chat o tema con `SearchChatMessages` y `SearchMessagesFilterPinned`; la lista abre desde la barra superior o el menú del chat, permite saltar a cada mensaje y desfijarlo. Desfijar usa `UnpinChatMessage` para un mensaje concreto y `UnpinAllForumTopicMessages` en temas. La barra se refresca con `UpdateMessageIsPinned`.
- **Borradores en la nube**: el DTO del chat expone el texto de `Chat.draftMessage` y `draft.set` guarda el borrador con `SetChatDraftMessage` tras 900 ms sin escribir. Solo se sincroniza texto; respuestas y formato no se restauran, y los chats secretos quedan fuera.
- **Tamaño de texto**: el ajuste de 12–24 px también actualiza el `font-size` raíz, de modo que escalan tanto `--ui-scale` como las medidas `rem/em`.
- **Cuentas**: «Añadir cuenta» vuelve a estar disponible con menos de tres sesiones listas y la ventana de acceso se puede cerrar para volver a la cuenta anterior.
- **Desbordes de fijados**: la barra limita ancho y alto, recorta el texto y ya no desborda en pantallas estrechas; también se corrigió la consulta del mensaje fijado por tema.
- **Descargas**: `NativeMediaStore` solo marca un archivo como fallido tras una ventana completa sin bytes nuevos, no cuando TDLib pausa la transferencia; las miniaturas de stickers TGS y GIF ocupan su celda sin recortarse. Los stickers animados del catálogo cargan su miniatura en lugar del archivo completo.
- **Foros**: la lista de temas sigue el patrón del cliente oficial (fila con icono, último mensaje, hora y no leídos, gestor en la cabecera y botón flotante para crear); el compositor se oculta mientras se elige tema.

### Detalle del lote local posterior a beta16

- **Mini Apps · compartir en historias**: el evento `web_app_share_to_story` descarga `media_url` solo por HTTPS, rechaza hosts privados/loopback/link-local/ULA/CGNAT, no sigue redirecciones automáticamente (máximo 4 saltos manuales), corta en 20 MB y detecta JPEG/PNG/WebP/MP4 por cabecera. Después abre un diálogo nativo con vista previa, texto (≤1024), enlace opcional (`http`, `https`, `tg://`) y audiencia; al confirmar publica con `CreatePrivateChat` → `CanPostStory` → `PostStory` y traduce cada tipo de `CanPostStoryResult` negativo. Nada se publica sin la confirmación del usuario.
- **Mini Apps · consulta inline**: `web_app_switch_inline_query` resuelve el `@usuario` del bot en `User.usernames.activeUsernames`, abre `ShellActivity` con la consulta (≤512) y la UI rellena el compositor con `@usuario consulta `. No se envía nada y los bots sin nombre de usuario reciben un aviso honesto.
- **Mini Apps · pantalla de inicio**: `web_app_add_to_home_screen` crea un acceso directo con `requestPinShortcut`. Solo se guardan `slot`, id del bot y título; el enlace firmado no se persiste. Al abrirlo se vuelve a pedir con `GetMainWebApp`, se valida el origen con `MiniAppPolicy` y se comprueba que la cuenta siga lista; si no coincide, se muestra un aviso y no se cambia de cuenta. `checkHomeScreen` responde `added`/`unknown` según los accesos ya fijados.
- **Mini Apps · estado emoji**: el bot debe solicitar el permiso y la app muestra un diálogo nativo; la concesión dura solo mientras la Mini App está abierta. Rechazar o cerrar la Mini App la revoca.
- **Mini Apps · cámara y micrófono**: `onPermissionRequest` ya no deniega por defecto. Solo se conceden `RESOURCE_AUDIO_CAPTURE`/`RESOURCE_VIDEO_CAPTURE` tras un diálogo nativo, un gesto reciente del usuario, origen validado y permiso Android concedido; la denegación o el cierre de la Mini App no dejan concesión abierta. `CAMERA` se declara como `uses-feature` no obligatoria.
- **Llamadas**: siguen sin implementar. El AAR de TDLib incluye las clases de señalización pero no el motor de medios; no existe `tgcalls`/`libtgvoip` en el proyecto y no se añade una pantalla de llamada ficticia.
- **Facturas por enlace**: se mantiene el cierre con estado `failed` y un aviso explícito; este binding de TDLib no expone `InputInvoiceSlug`.

### Detalle del lote local posterior a beta17 · beta18

- **Bloqueo de la app**: activar o desactivar exige autenticar primero con el dispositivo (`security.lock`). `AppLockScreen` usa `BiometricPrompt` con `BIOMETRIC_WEAK | DEVICE_CREDENTIAL` en Android 11+, `setDeviceCredentialAllowed(true)` en Android 9/10 y `createConfirmDeviceCredentialIntent` como alternativa. El diálogo y los secretos son del sistema; WRGram solo recibe el resultado.
- **Retardo y bloqueo manual**: `security.timeout` acepta 0, 30, 60 o 300 s y `security.lockNow` bloquea y abre la verificación. El contador de actividades compartido evita bloqueos falsos al rotar o cambiar entre la vista web, la nativa y una Mini App; `shouldPrompt` limita la petición automática a una por evento.
- **Cobertura y estado**: `AppLock` guarda el desbloqueo en estáticos del proceso, así que una Mini App no lo elude. `MiniAppActivity` se cierra si el bloqueo está activo; `MainActivity` vuelve a mostrar el bloqueo. La muerte del proceso restablece el bloqueo.
- **Datos guardados**: únicamente `app_lock` (booleano) y `lock_after` (retardo) en `SharedPreferences`; no se guardan PIN, patrón, contraseña ni plantillas biométricas. Si se elimina la credencial del dispositivo, el bloqueo se desactiva con un aviso.

### Detalle del lote local posterior a beta16 · beta17

- **Mensajes programados**: `scheduled.list` usa `GetChatScheduledMessages`; `scheduled.sendNow` llama a `EditMessageSchedulingState` con estado nulo y `scheduled.reschedule` con `MessageSchedulingStateSendAtDate` (entre 5 s y 367 días); `scheduled.delete` usa `DeleteMessages`. La UI solo permite gestionar la conversación abierta y refresca la lista tras cada acción.
- **Contraseña de dos pasos**: `password.state` lee `GetPasswordState`; `password.set` usa `SetPassword` con contraseña actual, nueva y pista. Quitar la contraseña exige una segunda confirmación. La contraseña no se persiste, no entra en las instantáneas y no se escribe en registros.
- **Excepciones de privacidad**: `privacy.get` devuelve las reglas permitidas/restringidas por usuario y `privacy.set` construye `AllowAll`/`AllowContacts`/`RestrictAll` con `AllowUsers`/`RestrictUsers`. Cambiar el valor base reenvía las excepciones existentes para no borrarlas; los valores personalizados no se reescriben.
- **Filtros de búsqueda**: `messages.search` y `messages.search.more` aceptan un filtro de tipo (`photo`, `video`, `photoVideo`, `document`, `audio`, `voice`, `videoNote`, `animation`, `url`, `poll`, `mention`) y lo conservan al paginar; la búsqueda global aplica el mismo filtro salvo menciones, que TDLib no admite fuera de un chat.
- **Reacciones y vistas de historias**: `story.reactions` consulta `GetStoryAvailableReactions`; `story.react` envía `SetStoryReaction` con emoji normal o personalizado y una reacción nula la retira; `story.interactions` usa `GetStoryInteractions` para historias propias y muestra vistas, reenvíos y reposts con su reacción elegida cuando existe.
- **Estado emoji**: `emojiStatus.state` lee el usuario propio y su `EmojiStatus`; `emojiStatus.options` combina estados por defecto, temáticos y recientes (máximo 200) y resuelve sus medios con `GetCustomEmojiStickers`; `emojiStatus.set` usa `SetEmojiStatus` con caducidad opcional entre un minuto y 367 días.
- **Reenvío con opciones**: `ForwardMessages` recibe `MessageSendOptions`, `sendCopy` y `removeCaption`; la UI exige `canBeCopied` para ocultar el remitente y `canBeForwarded` para el reenvío normal, permite silenciar y programar, y muestra los fallos parciales que reporta Telegram.

### Detalle del lote local posterior a beta13

- **Búsqueda paginada**: `messages.search.more` continúa la búsqueda desde el último mensaje recibido en vez de limitarse a los primeros 50 resultados.
- **Mensajes fijados**: `chat.pinned` devuelve el mensaje fijado más reciente y la UI muestra una barra superior con salto al mensaje y desfijado; la lista completa llegó en beta16.
- **Álbumes**: se puede editar el pie de cada foto/vídeo ya enviado con `message.edit.caption`; sustituir el medio de un álbum no es una operación de Telegram.
- **Traducción**: `message.translate` solicita a TDLib la traducción al idioma configurado y la muestra bajo el mensaje, sin enviar el texto a servidores de WRGram.
- **Carpetas**: `folders.save`, `folders.delete`, `folders.link` y `folders.join` crean, editan, eliminan y comparten carpetas reales de Telegram; la UI solo muestra las carpetas que devuelve la cuenta.
- **Privacidad**: `privacy.get`/`privacy.set` leen y cambian estado en línea, foto de perfil, número, reenvíos, llamadas, voz/videomensajes, invitaciones y búsqueda por teléfono. Las reglas avanzadas se muestran como «Personalizado» y no se reescriben sin una elección explícita.
- **Videomensajes grabados**: `ACTION_VIDEO_CAPTURE` con salida privada, límite de 60 s y validación local por `MediaMetadataRetriever`. También se aceptan MP4 de hasta 20 MB y 640 px; no se recodifica.
- **Reacciones y Premium**: reacciones de pago en Stars (con confirmación nativa del gasto), emojis personalizados para cuentas Premium y estado de suscripción de solo lectura. WRGram no vende, renueva ni cobra Telegram Premium.
- **Bots inline**: `bot.inline.query` consulta cualquier bot inline mediante `GetInlineQueryResults` y envía el resultado elegido con `SendInlineQueryResultMessage`; nada se envía hasta seleccionar un resultado.
- **Emojis y apariencia**: selector de tonos de piel sobre la suite Unicode, tipografías y fondos adicionales guardados en las preferencias nativas.
- **Correo, registro y recuperación**: se manejan los estados `WaitEmailAddress`, `WaitEmailCode`, `WaitRegistration` y el flujo de recuperación de 2FA (`RequestAuthenticationPasswordRecovery` y `RecoverAuthenticationPassword` con código, contraseña nueva y pista), además de reenviar códigos con `ResendAuthenticationCode`.
- **Push FCM**: el código registra el token con `RegisterDevice`, procesa cargas cifradas con `GetPushReceiverId` y nunca acepta texto de mensajes desde FCM. Sigue inactivo hasta que exista la configuración pública de Firebase del propietario; no se incluye ninguna credencial en el repositorio.

Todos estos flujos están verificados con typecheck, pruebas estáticas y compilación, pero requieren prueba del propietario con cuentas reales; el emulador local no tiene una sesión autenticada.

## Inventario histórico de alpha03/alpha04 · no describe la versión vigente

Alpha04 publicada internamente añade una [declaración regional de edad](age-access.md) previa a ambas interfaces y reemplaza alpha03 en ese canal. No cambia la mensajería de esta matriz. Es un control de autodeclaración local, no comprobación documental de identidad ni filtro de descargas de Play.

| Área | Estado real | Límite / validación pendiente |
| --- | --- | --- |
| Interfaz | React 19 + Vite, rail, lista virtualizada, conversación, panel de información, menús y hojas de confirmación | Revisada con datos sintéticos solo en desarrollo y en Android sin autenticar |
| Sesión | TDLib nativo existente; teléfono, código, 2FA, cancelación y cierre | Correo, registro, recuperación y varias cuentas pendientes |
| Apariencia | Ocho temas, Día/Noche, tamaño de texto y densidad | Más fondos, tipografías y opciones visuales avanzadas pendientes |
| Organización | Filtros Todos/No leídos/Grupos/Bots; actividad/A–Z | Búsqueda local de chats cargados |
| Carpetas y archivo | Lee carpetas de Telegram y sus listas, abre archivo, archiva/desarchiva | Crear/editar/compartir carpetas pendiente |
| Acciones de chat | Fijar/desfijar, silenciar/activar sonido y marcar no leído mediante Telegram | Las notificaciones push de Android no están implementadas; el silencio modifica el ajuste remoto |
| Historial | Caché local/red concurrentes; plazos; ventana móvil; paginación y reintento manual | Mantiene límites de memoria de alpha02; confirmar reconexión y cuentas grandes reales |
| Búsqueda de mensajes | `SearchChatMessages` real, texto y multimedia compartida | Hasta 50 resultados por búsqueda; paginación de resultados pendiente |
| Texto | Envío real, borrador en memoria, teclado, fecha y estados de Telegram | Formato enriquecido, enlaces enriquecidos, traducción y mensajes programados pendientes |
| Acciones de mensaje | Responder, copiar, editar, borrar solo para ti y reenviar; propiedades verificadas antes de operar | Edición/borrado globales, selección múltiple, álbumes y salto a mensaje pendiente |
| Fijados | Fijar mensaje para ti cuando Telegram lo permite | Barra de fijados y gestión completa pendientes |
| Reacciones | Consulta las permitidas por mensaje; añade/elimina emojis normales | Reacciones de pago/Stars y emojis personalizados Premium no se simulan |
| Emojis | Selector Unicode por categorías y búsqueda; inserta en el borrador | Emojis personalizados de Telegram y tonos de piel avanzados pendientes |
| Stickers | Recientes, favoritos, packs instalados, búsqueda y envío real mediante TDLib | WebP/miniaturas reales; TGS y ciertos animados no se reproducen completos. Instalación/editor de packs pendientes |
| GIF | GIF guardados y búsqueda mediante el bot configurado por Telegram; confirmación antes de enviar | La búsqueda comparte el término con ese bot, no el historial; no se cambia de proveedor automáticamente |
| Recepción multimedia | Fotos, vídeos, animaciones, audio, notas de voz y documentos mediante archivos TDLib autorizados | Descarga hasta 32 MB. Reproducción depende de codecs del WebView. No se expone el filesystem a JavaScript |
| Envío de archivos | Selector de Android; foto JPEG/PNG/WebP como foto y resto como documento, tras confirmación | Hasta 32 MB; vídeo/audio como documento, no grabación ni álbum |
| Guardar archivos | Selector de destino de Android, sin permisos de almacenamiento generales | Se impide exportar archivos de chats con contenido protegido |
| Guardados y bots | Mensajes guardados reales y apertura por @usuario | Teclados de bots, miniapps y consultas inline generales pendientes; GIF inline sí integrado |
| Complementos locales | Notas cifradas por cuenta/chat y respuestas que solo preparan borradores; permisos revocables | No ejecuta código externo ni recibe automáticamente mensajes |
| WR IA | Pantalla React separada; estado/consentimiento propios; notas y propuestas en pantalla nativa existente | Generación pública aún deshabilitada; sin claves de proveedor en Android |
| WRGram Premium | Diseño de catálogo, conectores de bots y flujo de permisos/confirmación | **Solo esbozo**: sin conectores operativos, precios, suscripciones, cobros ni activaciones ficticias |

## Backlog registrado tras alpha04 · histórico

La lista siguiente conserva el plan escrito tras alpha04 y no es un inventario actual. Para el estado actual y los pendientes, consultar el [registro beta09](beta09.md) y los Ajustes Android.

- Canales con integración de mensajes patrocinados exigida por Telegram; foros/temas completos.
- Llamadas y videollamadas, notificaciones push, multicuenta y chats secretos.
- Agenda, búsqueda global/por medios avanzada, creación de grupos y administración de miembros.
- Encuestas, ubicaciones, contactos compartidos, historias y mensajes guardados avanzados.
- Formato enriquecido de entidades, edición de captions, selección múltiple, álbumes, programación, envío silencioso y gestión de descargas.
- Grabación de voz/vídeo, tratamiento de codecs y formatos de stickers animados.
- Gestión de sesiones/dispositivos, bloqueo local, almacenamiento/caché y más controles de privacidad.
- Regalos (*gifts*), Stars y Telegram Premium: operaciones de pago requieren implementación y confirmaciones específicas. **No** son parte del esbozo de WRGram Premium y no se activan cobros.
- Accesibilidad manual, pruebas físicas, regresiones autenticadas y revisión de privacidad antes de presentarlo como producto comercial estable.

## Aislamiento

- La UI solo carga archivos incluidos en el APK desde `https://appassets.androidplatform.net/assets/ui/index.html`.
- Puente `WebMessageListener` limitado a ese origen y marco principal; lista cerrada de comandos, límites e IDs como strings.
- JavaScript no recibe credenciales, claves, sesiones serializadas, rutas de disco ni un `send` TDLib arbitrario.
- Recursos multimedia registrados por el código nativo; paths canónicos bajo el directorio de archivos de TDLib y respuestas sin caché.
- Assets Vite sin fixtures de desarrollo, fuentes remotas ni dependencias CDN. El selector de archivos usa el sistema, no acceso libre al almacenamiento.
- Capturas y backups siguen deshabilitados. Los complementos de bots no obtienen acceso por estar dibujados en el catálogo.
