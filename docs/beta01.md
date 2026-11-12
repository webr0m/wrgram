# WRGram 0.5.0-beta01 · desarrollo local

Versión solicitada como **beta**, código **5**, mismo paquete `cc.webrom.wrgram` y misma configuración de firma. El propietario cargó el AAB a la pista cerrada y guardó el release ordinal 2 con sus notas en el resumen de publicación. **No se ha enviado a revisión ni iniciado**; alpha04 permanece activa. La palabra beta no certifica estabilidad ni paridad con Telegram oficial.

## Implementación de esta ronda

| Área | Implementación | Límite que debe conservarse visible |
| --- | --- | --- |
| Miniaturas | Fotos/perfiles, documentos, videos, videomensajes, GIF, portadas de audio, stickers compatibles y vistas previas de enlaces recibidas por TDLib; minithumbnails embebidas como respaldo | No hay una imagen real cuando Telegram no la proporciona. TGS/ciertos formatos animados siguen incompletos. Descarga de archivos hasta 32 MB; las imágenes completas de más de 2 MB no se autodescargan. Las mejoras posteriores están en beta02 |
| Apps propias | Seis tarjetas incluidas por defecto, con sus fotos públicas empaquetadas y actualización de foto mediante Telegram al iniciar sesión | Son servicios remotos, no se han reimplementado sus backends dentro del APK. Sin un requisito de WRGram Premium; las condiciones propias de cada servicio no cambian |
| Mini Apps | Resolución `SearchPublicChat` → `GetUser` → Mini App principal o botón lateral `GetMenuButton`/`GetWebAppUrl`, después de confirmar; host separado, origen exacto y marco principal, cuenta ligada y URL de lanzamiento solo en memoria | Cada bot debe haber publicado la Mini App principal o un botón de menú para el usuario. Aún no lanza directamente enlaces nombrados `t.me/bot/app`; necesita incorporar el slug y validarlo con Telegram. Compatibilidad inicial, no equivalencia con el host oficial |
| Canales | Apertura/historial, filtro Canales, unirse/salir tras confirmación, consulta de patrocinados, etiqueta, contenido completo antes de mostrar, vista solo si está enteramente visible y click real confirmado | No oculta patrocinados. Integración pendiente de prueba con un canal real y anuncios reales; no implica cumplimiento certificado de todas las condiciones de Telegram |
| Secretos | TDLib con `useSecretChats=true`, creación con una persona por @usuario, estados pendiente/listo/cerrado, bloqueo de envío hasta listo, huella de los primeros 32 bytes según TDLib | Solo secretos básicos. Mensajes temporales siguen sin exponerse; multimedia no exportable; previews de enlaces deshabilitadas al enviar en secreto. No se probaron dos cuentas reales entre dispositivos |
| Multicuenta | Hasta tres slots, cambio y autenticación propios; base, archivos y clave de cada slot separados; puente y Mini Apps invalidados al cambiar | No importa sesiones ni migra conversaciones. `primary` conserva exactamente `telegram`, `tdlib-key.v1` y el alias de alpha04. No se eliminan cuentas ni claves al cambiar |
| Push | FCM opcional, permiso Android, token cifrado registrado en Telegram, enrutado por receiver ID al slot correcto, WorkManager para procesamiento nativo y notificaciones genéricas; revocación desde Ajustes | **No operativo sin configuración Firebase y entrega autorizada por Telegram.** No se probó recepción remota con app cerrada. No promete entrega tras forzar detención |

## Las seis apps propias

1. `@GroupButlerEsp_bot`: administración de grupos.
2. `@antiubot`: control de bots y usuarios automatizados.
3. `@anycompressorbot`: compresión de archivos.
4. `@WRShorten_bot`: acortador de enlaces.
5. `@mutidlprobot`: descargas de archivos/medios con permiso del titular.
6. `@Wrsnakebot`: Snake mediante Mini App.

Identidades y finalidad proporcionadas por el propietario. Páginas públicas consultadas sin autenticar el 6 de noviembre de 2026; ello no certifica propiedad ni compatibilidad funcional. Fotos públicas reales, no imágenes generadas: `apps/mobile-ui/public/bots/provenance.json`, con origen, fecha, tamaño y SHA-256; script `scripts/download-bot-icons.mjs`. No se enviaron `/start`, archivos, URLs o permisos administrativos a esos bots durante el desarrollo.

El catálogo se entrega de fábrica, no añade bots a grupos, no concede administración, no escribe mensajes ni comparte historial por abrir la sección. Al abrir una Mini App, Telegram proporciona sus datos firmados de lanzamiento; estos no cruzan el puente React ni se guardan en Intents. La app remota recibe los datos de lanzamiento y conexión propios de ese mecanismo, no acceso general a las otras conversaciones.

## Compatibilidad inicial del host

- `TelegramWebviewProxy.postEvent` con ready, expand/viewport, tema, botón principal, confirmación de cierre y enlaces externos HTTPS confirmados.
- Cámara, micrófono, geolocalización y permisos web denegados; sin escritura automática, teléfono, portapapeles ni compras/invoices.
- Sin cookies aceptadas ni DOM storage persistente, para evitar heredar la sesión web de otra cuenta. Una Mini App que dependa de ese almacenamiento necesitará adaptación o un diseño de perfiles aislados antes de habilitarlo.
- Selector de archivos del sistema, tras acción del usuario. No hay lectura genérica del filesystem. Compatibilidad real de cada flujo de subida pendiente de prueba.
- Descargas HTTPS delegadas al navegador con confirmación. `blob:` no exportado todavía; usar el archivo del chat del bot o la implementación del servicio en navegador.
- Falta implementar eventos avanzados de Telegram, menús/botones de bot generales, apps nombradas y probar las seis Mini Apps reales con sus fuentes. El acceso al chat del bot es una vía separada, no una Mini App simulada.

## Dependencias externas para terminar

### Push

1. Crear/seleccionar un proyecto Firebase del propietario para este paquete; no usar credenciales de otra app.
2. Copiar `docs/firebase-client.properties.example` a `.private/firebase/client.properties` y completar **solo configuración pública de cliente**. La variante debug necesita su app Firebase correspondiente. No poner allí JSON de service account, contraseñas o tokens de bot.
3. Configurar las credenciales de envío FCM correspondientes para el API ID de Telegram en su portal oficial, bajo control del propietario. La configuración cliente por sí sola no permite a Telegram enviar a ese proyecto. No copiar credenciales de envío al APK ni compartirlas en el chat.
4. Compilar, aceptar el permiso y la activación voluntaria, confirmar `RegisterDevice` y probar entrega real en dos dispositivos, ambas cuentas, silencio, reinicio, caducidad de edad, revocación y pantalla bloqueada.

Referencias: [push Telegram](https://core.telegram.org/api/push-updates), [TDLib Notification API](https://core.telegram.org/tdlib/notification-api), [aclaraciones del mantenedor sobre FCM/API ID](https://github.com/tdlib/td/issues/549). No se creó un proyecto ni se configuraron credenciales remotas en esta ronda.

### Servicios propios

Se necesitan las rutas de sus repositorios/proyectos y los contratos de API para cambiar el funcionamiento interno de las seis apps, además de los enlaces nombrados cuando no tengan Mini App principal. No hacen falta tokens de bot para desarrollar la interfaz del cliente; secretos de servidor deben permanecer en el backend bajo control del propietario.

## Antes de distribuir beta01

- Probar actualización sin pérdida de la sesión alpha04 y dos/tres cuentas reales, bajo control del propietario.
- Validar secretos entre dos dispositivos y comparar huellas; no afirmar soporte completo de autodestrucción.
- Validar patrocinados reales y actualizar la declaración de anuncios de Play cuando corresponda: la declaración anterior de alpha04 no se debe reutilizar automáticamente para canales/bots con patrocinados.
- Revisar y aprobar nueva política pública y Seguridad de los datos: Mini Apps remotas, perfiles por cuenta, Google/FCM/WorkManager y registros de patrocinados modifican el alcance de alpha04. La política publicada sigue describiendo alpha04; **no se cambió ni desplegó** en esta ronda.
- Capturas, público objetivo, clasificación, acceso de revisión, permisos y notas de la nueva versión requieren revisión antes de subir. No se editó Play ni se abrió producción.

## Validación local de beta01 (no aplica a los cambios posteriores de beta02)

- `pnpm check` final: typechecks de todo el workspace; **85 pruebas en 20 archivos**; compilación web y comprobación de secretos conocidos aprobadas.
- `scripts/android.ps1 -Task release`: compilación R8, **60 pruebas JUnit nativas**, Lint release sin errores y **13 advertencias** (versión de Gradle, recurso mipmap existente y 11 de internacionalización). No es auditoría de seguridad.
- En `emulator-5580` Android 16, aplicación y APK de instrumentación debug instalados; **22 pruebas instrumentadas** aprobadas. Incluyen 5 pruebas BetaIsolation, control de cuenta/puente, JPEGS locales, captura no autenticada, navegación y regresiones.
- Cinco capturas no autenticadas exportadas y revisadas en `artifacts/beta01/screens/`, con `FLAG_SECURE` activo: control de edad, bienvenida, ajustes, sección de apps y catálogo con las seis fotos cargadas. Resolución temporal restaurada de 1080×1920 a la resolución física 1080×2400.
- AAB validado por Bundletool y verificador JAR leyendo íntegramente **138 payloads firmados**, sin entradas duplicadas ni firmantes mixtos; mismo certificado de subida que alpha04. APK verificado (firma v2) y alineación de páginas de 16 KB aprobadas.
- AAB beta01 cargado a Play, pero release todavía es un cambio no enviado y no está disponible para los verificadores. Las pruebas sin autenticar no validan los servicios reales, funcionamiento de una Mini App, chats secretos entre dispositivos ni entrega push. Firebase/FCM no configurado; push no operativo.

Los tamaños y hashes de AAB/APK y capturas de debug están en `artifacts/android/BETA01.md` y `artifacts/beta01/README.md`. Las capturas no son material listo para subir a Play.
