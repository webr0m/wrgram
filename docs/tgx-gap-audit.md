# Revisión de flujos de Telegram X · primera tanda de mensajería

Revisión puntual del código público de [TGX-Android/Telegram-X](https://github.com/TGX-Android/Telegram-X), licencia GPL-3.0, y documentación actual de TDLib. No se copió código fuente de TGX; se adaptaron los patrones a la UI WebView/React y al puente de capacidades allowlist de WRGram. En TGX se revisaron `TGInlineKeyboard.java` y `TdlibFilesManager.java`.

## Patrones aplicados

- TGX proyecta cada `ReplyMarkupInlineKeyboard` por filas y conserva su relación con el mensaje; WRGram ahora serializa solo etiqueta, tipo visual, estado y estilo. Callback data, URL y otros payloads no cruzan a JavaScript.
- Las pulsaciones se resuelven contra el mensaje/botón TDLib actual, no contra valores de acción recibidos del WebView: `GetCallbackQueryAnswer`, URL confirmada, `OpenWebApp`, abrir usuario, o copiar texto tras acción explícita.
- La respuesta de bot `ReplyMarkupShowKeyboard` se toma del `replyMarkupMessageId` que mantiene TDLib. La UI muestra el teclado y solo habilita texto y Web App; solicitudes de teléfono, ubicación, usuarios, polls y permisos permanecen visibles pero deshabilitadas.
- TGX sincroniza archivos y publica actualizaciones de progreso/estado a vistas suscritas. WRGram ahora fusiona el `File` actualizado de TDLib, observa `UpdateFile`, refresca el mapa de archivos listos después de descargas y vuelve a emitir estado; los previews usan una capa visible, no un z-index detrás del fondo.
- Para una Mini App inline se usa `OpenWebApp` y se abre la URL que autoriza TDLib; el identificador de lanzamiento se conserva solo en memoria y se cierra mediante `CloseWebApp`. Para menú se lee el `BotInfo.menuButton` de `GetUserFullInfo`, y para reply keyboard se resuelve mediante `GetWebAppUrl`. Se mantiene el host aislado de WRGram: origen exacto, sin DOM storage, sin puente de conversaciones ni permisos de dispositivo.
- El evento de envío de datos de una Mini App reply-keyboard no se manda silenciosamente: WRGram muestra el dato solicitado y requiere una confirmación explícita antes de `SendWebAppData`.

## Segunda tanda implementada localmente (beta04)

- Login URL vía `GetLoginUrlInfo`; confirmación de dominio y consentimiento separado si el sitio pide permiso para escribir al usuario.
- Callback que requiere 2FA con diálogo nativo, no persistente, y confirmación de que TDLib procese el botón.
- Callback de juego solamente si TDLib enlaza el botón a un `MessageGame`.
- `switch_inline_query` hacia la conversación actual con consulta TDLib, resultados paginados, previews allowlist y envío únicamente al tocar un resultado. IDs de query/resultados quedan nativos; el WebView recibe un token opaco breve.

## Tercera tanda compilada (beta05)

- Teclados de respuesta: compartir teléfono de Telegram requiere confirmación, crear una encuesta requiere editar/pulsar “Crear y enviar”, y compartir ubicación requiere permiso Android más una segunda confirmación con coordenadas/precisión. No se concede permiso ni se envía dato al mostrar el teclado.
- La tanda se compiló y subió como borrador code9, sin enviar a revisión. Los flujos siguen pendientes de pruebas con bots controlados; no todas las cuentas tienen un número compartible ni una ubicación reciente en Android.

## Cuarta tanda local (beta06)

- `switch_inline_query` con `TargetChatChosen`: selector limitado por los tipos de chat permitidos por Telegram, validación nativa contra el tipo real del chat y consulta inline después de elegir un destino. El mensaje no se envía hasta que se selecciona un resultado; al confirmar, se abre el chat destino.
- El selector y los resultados usan tokens opacos con expiración y están ligados a la cuenta/chat origen. No se exponen a JavaScript los IDs de consulta/resultados de TDLib. Code10 está cargado como borrador con notas `es-419`; no se envió a revisión ni se probó con un bot real.
- El flujo multimedia conserva la instancia `File` referenciada por los DTOs, espera el estado `UpdateFile` actual, entrega rangos HTTP a WebView y vuelve a intentar descargas fallidas. Las descargas entrantes admiten límites mayores por tipo. Sigue pendiente validar formatos/códecs con archivos reales de distintos dispositivos.

## Quinta tanda compilada (beta07)

- Los botones de respuesta `request_users` y `request_chat` muestran selectores nativos sobre chats cargados. Para usuarios se aplica el filtro de bot/Premium y la cantidad máxima; antes de compartir se valida con `ShareUsersWithBot`/`ShareChatWithBot` en `onlyCheck` y se solicita confirmación.
- No se aceptan botones que requieran agregar un bot o cambiar permisos administrativos. El selector no inventa usuarios/chats que TDLib no tenga cargados.
- Code11 está cargada como borrador de prueba cerrada con notas `es-419`; no se envió a revisión. Los selectores siguen pendientes de pruebas con bots reales.

## Sexta tanda (beta08 · estado histórico)

- Actualiza listas cuando Telegram cambia la foto de un chat/canal; serializa descargas de miniaturas (máximo cuatro simultáneas), coalesce IDs y liga trabajos a la cuenta. Evita falsos fallos si `DownloadFile` responde antes de que llegue `UpdateFile`; reintenta la imagen desde su avatar.
- El tamaño de fuente aplica al texto del chat, lista y compositor; la prueba instrumentada mide estilos renderizados. La prueba de capturas ya adapta la resolución del emulador.
- Mejora ciclo in-app: muestra estado/progreso, errores, resultado cancelado, reanudación inmediata y estado descargado; cancelar no relanza el flujo inmediatamente. Play Core solo ve versiones distribuidas a la cuenta desde Google Play; no puede actualizar desde un borrador no publicado.
- Menú de usuario desde rail y Ajustes: perfil, cambio de nombre/biografía/username (confirmación para publicar username), sesiones activas y revocación explícita, mensajes guardados, cuentas, complementos, WR IA, tema, Ajustes y cierre de sesión. No añade edición de foto ni contactos/grupos.
- Vista de historias activas en chats no secretos: lista recibida de TDLib, carga de fotos/video permitidos, registro con `OpenStory` y cierre con `CloseStory`. No publica, edita, elimina, guarda ni archiva historias.
- En la auditoría original beta08/code12 se había preparado localmente y no se probó con una cuenta conectada. Ese estado fue sustituido por beta09/code13; el resumen actual de Play muestra la versión 13 en comprobaciones de revisión. No se reemplazó ni retiró ningún cambio de Play en esta sesión.
- `TargetChatInternalLink`, pagos/Stars, llamadas/video y administración avanzada aún necesitan flujos independientes; una clase TDLib disponible no basta para garantizar una experiencia cliente funcional.

## Séptima tanda (beta09/code13 · en comprobaciones de Play)

- Perfil: seleccionar/cortar/rotar y previsualizar foto, fijarla o eliminarla con confirmación; no se activa `isPublic` ni se importa la foto original.
- Contactos: buscar la agenda de Telegram, agregar/quitar sin compartir el teléfono, crear grupos básicos desde contactos seleccionados; no se sincroniza la agenda Android ni se admiten bots como miembros de grupos creados aquí.
- Grupos: lista reciente de miembros solo para quien tenga `canRestrictMembers`, restricción temporal de 1 hora de miembros normales y edición de permisos predeterminados con confirmación nativa.
- Facturas digitales Stars: solo `XTR`, factura no pagada y sin dirección de envío; el precio se consulta a PaymentForm, se requieren dos confirmaciones, y las suscripciones/otros medios se rechazan.
- TGS: renderizador Lottie local, descompresión limitada, dimensiones/duración restringidas y rechazo de assets externos. TDLib entrega el archivo y thumbnail autorizados.
- Destino interno: acepta solamente `InternalLinkTypePublicChat`, exige confirmar el chat y no manda nada hasta elegir un resultado inline. Se bloquean tokens sin pagar, perfiles y tipos de link no implementados.
- Mini Apps: `AllowBotToSendMessages`, compartir teléfono como contacto TDLib tras consentimiento; ubicación con permiso Android + permiso local por bot y entrega al sitio solo al pedirla; clipboard solo para bots añadidos al attachment menu, con gesto reciente y previsualización; DeviceStorage aislado por cuenta/bot, back button, popup y haptics. Cámara/micrófono continúan denegados.
- El AAB code13 aparece en la pista cerrada y en comprobaciones de Play. No se probaron pagos, grupos, permisos, foto ni Mini Apps con cuenta conectada; el parser TGS y la proyección TDLib tienen pruebas unitarias/focalizadas.

## Compatibilidad y límites deliberados

Beta03: teclados de respuesta con texto, callback inline, URL, Web Apps inline/reply/menu, copiar texto y abrir usuario. Beta04 suma login URL, callback 2FA/juegos y switch-inline al chat actual. Beta05 añade teléfono, ubicación y encuesta bajo confirmación/permiso. Beta06 añade switch-inline con selección de otro chat. Beta07 añade selectores de usuarios/chats solicitados por bots con validación y confirmación. Beta09 añade facturas Stars, Mini App requests consentidos, TGS y destino interno público acotado.

No es paridad completa con TGX. Siguen fuera las llamadas (no hay tgcalls/libtgvoip), los pagos con monedas distintas de XTR, las facturas por *slug* de Mini Apps, la edición de áreas de historias ya publicadas o la sustitución de su medio, la paginación de la búsqueda de miembros, la reordenación libre de historias dentro de un álbum y los eventos de Mini Apps que este binding de TDLib no expone. La administración de roles, restricciones y baneos, la creación de supergrupos, foros y canales, la gestión de álbumes de historias y los destinos inline a bots, mensajes e historias ya están implementados en la fuente local beta20, aunque sin validación con una cuenta real. No describir WRGram como cliente equivalente.

## Referencias

- Código TGX: `app/src/main/java/org/thunderdog/challegram/data/TGInlineKeyboard.java` y `app/src/main/java/org/thunderdog/challegram/telegram/TdlibFilesManager.java`.
- TDLib: `GetCallbackQueryAnswer`, `OpenWebApp`, `GetWebAppUrl`, `ReplyMarkupInlineKeyboard`, `ReplyMarkupShowKeyboard`, `UpdateChatReplyMarkup`, `UpdateFile`.
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps): flujos keyboard/inline y requisitos de inicialización/datos.
