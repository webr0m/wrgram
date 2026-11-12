# Seguridad de los datos · declaración de Play verificada el 9 de noviembre de 2026

Este documento registra las respuestas del cuestionario de Google Play revisadas el 9 de noviembre de 2026 contra el release beta24 (código 28), que incluye Firebase Cloud Messaging. La declaración guardada en Play sigue siendo la base descrita abajo: **no se añadieron ni quitaron tipos de datos** porque el identificador de instalación de Firebase ya queda cubierto por «Dispositivo u otros IDs». El agente solo verificó el cuestionario y guardó metadatos del release; **no envió la declaración ni el release a revisión**. Véase [estado de Play](android-play.md) y el [borrador beta24](../artifacts/android/BETA24.md).

> **Corregido el 9 de noviembre de 2026 tras auditar 1.0.0-beta04 (código 32).** Tres justificaciones de este documento eran falsas respecto a la app distribuida y faltaba un tipo de dato. La tabla de «Respuestas guardadas» se conserva como registro histórico de lo que hay en Play; los hechos verificados y las acciones que corresponden al titular están en la sección siguiente. **La declaración en Play Console no se ha modificado.**

## Corrección del 9 de noviembre de 2026 · contraste con 1.0.0-beta04 (código 32)

| Afirmación anterior | Hecho verificado en el código | Efecto sobre la declaración |
| --- | --- | --- |
| «Esta versión no implementa chats secretos» / «No afirmar chats secretos/E2EE» | `TdSession.java:422` fija `useSecretChats = true`; `NativeBridge.java:372` (`chat.secret`) crea el chat; `NativeSnapshot.java:63` expone estado y huella de 32 bytes; la UI ofrece «Nuevo chat secreto» (`App.tsx:261`) | La app sí ofrece E2EE entre dos dispositivos. No procede invocar una exención de extremo a extremo para omitir la declaración: los chats en la nube siguen sin E2EE y se declaran como recopilados. |
| «Contactos … **no** carga de la agenda del teléfono» | `ContactSync.java:50-70` lee `ContactsContract` (nombre y número normalizado, máx. 200); `NativeBridge.java:848` y `:893` y `ContactSyncWork.java:60` llaman `ImportContacts`; opt-in con permiso `READ_CONTACTS` y trabajo periódico de 24 h (`ContactSync.java:102`) | «Contactos» ya estaba declarado, pero su justificación era falsa. La carga de la agenda es **opcional**: el usuario puede no activarla, desactivarla y revocar el permiso. |
| «Audio/video … **no hay grabación propia con cámara/micrófono**» | `NativeBridge.java:1445` graba con `MediaRecorder.AudioSource.MIC` (nota de voz, hasta 60 s); `NativeBridge.java:551` y `ShellActivity.java:115` graban un videomensaje con la cámara; el manifiesto declara `RECORD_AUDIO` y `CAMERA` | «Fotos, videos» y «Grabaciones de voz/sonido, música, otros audios» ya estaban declarados como opcionales: el tipo era correcto, la justificación era falsa. |
| «No se seleccionaron ubicación precisa …» | `NativeBridge.java:718` (compartir ubicación y solicitud de un bot) y `MiniAppActivity.java:136` (Mini App) leen `LocationManager.getLastKnownLocation` de GPS/red y transmiten latitud, longitud y precisión a Telegram o al sitio de la Mini App, previo diálogo y permiso. El manifiesto declara `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION` | **Falta declarar «Ubicación precisa»**. Es la única adición de tipo detectada. La guía oficial de Android la define como la ubicación en un área menor de 3 km², «such as location provided by Android's `ACCESS_FINE_LOCATION` permission». |

La guía oficial advierte de que una discrepancia entre la conducta de la app y la declaración puede dar lugar a medidas de aplicación, incluida la retirada de la app. Fuente: [Declare your app's data use](https://developer.android.com/privacy-and-security/declare-data-use) y [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=es).

### Acciones que corresponden al titular en Play Console

1. **Añadir «Ubicación precisa»** como recopilada y compartida (Telegram/bot y, si la Mini App la pide, el sitio del bot), **opcional**, no efímera, fin «Funciones de la app». Aunque medie un diálogo de confirmación, la coordenada sale del dispositivo: se declara como recopilada. No se ha verificado que alguna exención del cuestionario cubra este caso; ante la duda, declarar.
2. **Añadir o revisar «Ubicación aproximada»**: el tipo ya está guardado y sigue siendo correcto para `ACCESS_COARSE_LOCATION` y las inferencias de IP del servicio, pero ya no es la única ubicación tratada.
3. **Revisar «Contactos» → Opcional**: la lectura y el envío de la agenda solo ocurren si el usuario activa la importación o la sincronización y concede el permiso. Si se mantiene «Necesaria», debe justificarse únicamente por la lista de contactos de Telegram, nunca por la agenda del teléfono.
4. **No hace falta añadir tipos** por chats secretos, notas de voz ni videomensajes: «Otros mensajes de app», «Fotos, videos» y «Grabaciones de voz/sonido, música, otros audios» ya cubren esas transmisiones.
5. **Mini Apps**: el sitio del bot recibe los datos de lanzamiento de la cuenta y la IP; si el usuario lo confirma, el teléfono se envía al bot como mensaje del chat (`MiniAppActivity.java:124`) y la ubicación puede entregarse al sitio (`:136`). Revisar si «Número de teléfono» y «Ubicación precisa» deben marcarse también como compartidos con ese tercero.
6. El texto canónico de la política quedó corregido en `apps/web/public/android/privacy/index.html` con la misma fecha; su publicación requiere deploy y confirmación del titular. La URL registrada en Play no cambia.

### Política publicada · 10 de noviembre de 2026 (beta06, código 34)

El punto 6 de la lista anterior quedó cumplido: `apps/web/public/android/privacy/index.html` se reancló a **1.0.0-beta06 (código 34)** y se corrigió la frase que llamaba «propuesta» a la pantalla de Complementos — `BetaPanels.tsx:18` abre Mini Apps reales y el código lo sirve el sitio del bot, así que la política ahora lo dice explícitamente y mantiene que no hay compras, cobros ni conectores Premium operativos. `apps/web/src/landing/privacy.test.ts` (7 pruebas) lee `apps/mobile/android/version.properties` y exige el par `versionName (código versionCode)`, rechaza cualquier código ≤ 33 y fija la frase nueva. `pnpm check` → `pnpm deploy:check` → `wrangler deploy` subieron un solo asset (`/android/privacy/index.html`, Version ID `4e87e5ba-b2d7-4078-9481-1f88a9c2592c`) y `curl` sobre la URL registrada confirma el anclaje a 34, «abre Mini Apps reales», «última ubicación conocida», «hasta 200 contactos», «sí permite crear chats secretos» y la ausencia del texto antiguo y de `<script>`. **Las respuestas 1, 2, 3 y 5 siguen sin aplicar en Play Console**: el cuestionario de Data Safety no se tocó en esta ronda; es declaración del titular y las correcciones listadas arriba son literalmente lo que hay que marcar.

### Aviso dentro de la app · corregido el 10 de noviembre de 2026

`BetaPanels.tsx` (diálogo «Abrir Mini App») afirmaba «sin almacenamiento web persistente, pagos, solicitudes de teléfono ni descargas blob» mientras `MiniAppActivity.java:85-87` ya implementaba `web_app_device_storage_*` y `:80` `web_app_request_phone`. El aviso ahora describe la conducta real: cámara, micrófono, ubicación y portapapeles solo tras confirmación y permiso de Android; el teléfono se envía **al bot como contacto en el chat**, nunca al sitio web; el almacenamiento de la Mini App es persistente y va separado por cuenta y bot (`"webapp."+selfId+"."+botUserId+"."`), con el almacenamiento web del navegador desactivado (`setDomStorageEnabled(false)`); y siguen sin soporte los pagos con factura (`rejectInvoice` responde `invoice_closed`/`failed`) ni la exportación de descargas `blob` (el `DownloadListener` responde «Esta beta no exporta descargas blob»). `apps/mobile-ui/src/beta.test.ts` fija las cinco frases del diálogo y los cuatro anclajes del nativo, así que negar una función implementada vuelve a fallar en la compilación.

## Firebase Cloud Messaging · revisión del 9 de noviembre de 2026

- Las notificaciones son opcionales y solo se activan con consentimiento y el permiso de Android. Al activarlas, Firebase genera un identificador de instalación (FID) y un token de registro; la app envía el token a Telegram mediante `RegisterDevice` para recibir avisos. La app inicializa Firebase con `setDataCollectionDefaultEnabled(false)` y no incluye Analytics, Crashlytics ni SDK de anuncios.
- Play clasifica el FID y el token dentro de **Dispositivo u otros IDs**; Google documenta el FID como ese tipo de dato. La declaración vigente ya marca ese tipo como **recopilado y compartido**, **no efímero** y **necesario**, con fines de **funciones de la app** y **seguridad/prevención de fraudes**. La compartición con Telegram corresponde al registro del token; Google actúa como proveedor de FCM. No se marcó «estadísticas», «publicidad» ni «comunicaciones del desarrollador», porque FCM no se usa para eso.
- El cuestionario quedó completo en los cinco pasos y sin cambios pendientes («Guardar como borrador» y «Guardar» deshabilitados en la vista previa). El agente no pulsó ningún botón de envío a revisión.
- La política pública se actualizó y publicó el mismo día con una sección de notificaciones push y Firebase como destinatario: https://wrgram.webrom.cc/android/privacy/.

## Criterio y fuentes

- [Definiciones de Google Play](https://support.google.com/googleplay/android-developer/answer/10787469?hl=es): transmitir fuera del dispositivo cuenta como recopilación, aunque reciba un tercero. El cifrado de transporte no es la excepción de extremo a extremo.
- [Guía de Firebase para la divulgación de datos de Play](https://firebase.google.com/docs/android/play-data-disclosure) y [tipos de datos de Play](https://support.google.com/googleplay/android-developer/answer/10787469?hl=es): el FID y el user agent de FCM se declaran como «Dispositivo u otros IDs».
- [Política de Telegram](https://telegram.org/privacy), TDLib y comandos reales de `TdSession`, `NativeBridge`, `NativeCatalog` y `NativeMediaStore`.
- [Política pública aprobada de Android](https://wrgram.webrom.cc/android/privacy/).
- Se declararon recopilación **y compartición con Telegram**, un servicio independiente, sin usar una exención general para ocultar esa transferencia. Las excepciones de acciones iniciadas por usuarios permiten omitir ciertas comparticiones de mensajes/archivos, pero no se invocaron en este borrador: la transferencia real se muestra de forma conservadora. No significa que WRGram venda datos ni que retransmita chats por su servidor.

## Respuestas guardadas

- Sí recopila/transmite datos; todos cifrados en tránsito (MTProto a Telegram, HTTPS a WRGram). **Corregido:** la app sí admite chats secretos con E2EE entre dos dispositivos, pero los chats en la nube no lo son; no se invoca la exención de extremo a extremo para omitir la declaración.
- No crea cuentas; admite acceso a cuentas creadas fuera de la app. «Otro»: cuenta creada previamente en Telegram oficial, acceso por teléfono/código/2FA; sin registro en WRGram.
- Solicitud de eliminación de datos: https://wrgram.webrom.cc/android/privacy/#eliminar-datos. Distingue almacenamiento local, soporte bajo control del responsable y gestión/eliminación de Telegram mediante sus herramientas oficiales. No se declaró borrado automático global en 90 días ni eliminación de Telegram dentro de WRGram.
- Sin insignia de auditoría independiente, UPI ni cumplimiento de Familias inventados.

| Tipo | Recopilación | Fines declarados para recopilación y compartición |
| --- | --- | --- |
| ID de usuario, teléfono | Necesaria | Funciones, seguridad/prevención de fraude, administración de cuenta |
| Ubicación aproximada | Necesaria | Funciones, seguridad/prevención de fraude |
| Otros mensajes de app | Necesaria | Funciones |
| Fotos, videos | Opcional | Funciones |
| Grabaciones de voz/sonido, música, otros audios | Opcional | Funciones |
| Contactos | Necesaria | Funciones |
| Archivos/documentos | Opcional | Funciones |
| Interacciones en app | Necesaria | Funciones |
| Historial de búsqueda en app | Opcional | Funciones |
| Dispositivo u otros IDs | Necesaria | Funciones, seguridad/prevención de fraude |

Los 14 tipos se declararon no efímeros: no se promete que Telegram u otra infraestructura los mantenga solo en RAM. **Corregido:** ubicación aproximada cubre `ACCESS_COARSE_LOCATION` y las inferencias de conexión/IP del servicio, pero la app también lee GPS y transmite coordenadas exactas, de modo que falta declarar «Ubicación precisa»; ninguna ubicación se usa para determinar el país autodeclarado local. **Corregido:** contactos incluye el grafo de interlocutores de Telegram **y** la carga opt-in de la agenda del teléfono (nombres y números, hasta 200, `ImportContacts`). **Corregido:** audio/video incluye grabación propia con micrófono (notas de voz) y cámara (videomensajes y fotos), además de los archivos seleccionados o reenviados. Interacciones incluye acciones de lectura/escritura/reacciones transmitidas a Telegram, no un SDK de analítica de WRGram. Identificadores corresponden a cuenta/sesión/conexión, no al ID publicitario.

**Corregido:** «Ubicación precisa» sí debe seleccionarse; véase la sección de corrección y las acciones del titular. No se seleccionaron calendario, datos financieros/sanitarios, apps instaladas, navegación web, analítica/fallos ni atributos personales que esta interfaz no pide ni transmite como campos. No clasificar automáticamente el contenido libre de un mensaje como todos los datos sensibles posibles.

## Tratamiento local y generación deshabilitada

DOB solo en memoria; registro de residencia/elegibilidad y notas cifradas solo en dispositivo: no se declararon como recopilados. WR IA consulta estado HTTPS, con IP/metadatos técnicos; generación pública deshabilitada, sin instrucciones ni chats remitidos a Groq. Antes de habilitarla deberán revisarse política y declaración. Este documento no certifica todas las prácticas de terceros ni sustituye la responsabilidad del titular sobre las declaraciones.
