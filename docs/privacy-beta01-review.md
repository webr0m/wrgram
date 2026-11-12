# Cambios de privacidad para beta01 · revisión pendiente

**Documento de revisión local, no política publicada ni aprobación jurídica.** La política pública vigente sigue siendo la aprobada para alpha04. No sustituirla ni distribuir beta01 a terceros hasta revisar y aprobar los cambios con el propietario y actualizar Play.

## Cambios comprobables en el cliente

1. **Tres cuentas locales:** slots distintos para sesión TDLib, archivos y claves; la cuenta original conserva sus nombres de almacenamiento y alias. Los identificadores de slot, cuenta/receiver y consentimientos de funcionamiento se guardan en preferencias privadas de Android sin backup y **sin una capa de cifrado propia adicional**. Las bases y notas mantienen su cifrado existente; los archivos multimedia importados/descargados no se presentan como cifrados por TDLib en reposo.
2. **Chats secretos básicos:** TDLib cifra E2EE la comunicación secreta y permite comparar una huella. No afirmar E2EE para cloud ni soporte completo de autodestrucción. La UI no expone contenido temporal ni exporta multimedia de secretos; las vistas previas de enlaces están deshabilitadas al enviar texto en esos chats.
3. **Miniaturas:** descargas autorizadas desde Telegram al mostrar vistas; imágenes completas pequeñas pueden autodescargarse, no archivos completos de cualquier tamaño. Fotos públicas de los seis bots incluidas en el APK, sin consultas a CDN externo para pintar esas imágenes iniciales. Tras autenticación, se consulta el perfil a Telegram para actualizar la foto, sin enviar `/start` ni adjuntar conversaciones.
4. **Mini Apps propias remotas:** el catálogo es parte de WRGram, pero las funciones se ejecutan en los servidores de cada servicio. Abrirlas exige confirmación y utiliza datos firmados de lanzamiento de Telegram, que pueden incluir ID y perfil público, idioma y metadatos del contexto que Telegram entregue. Sus servidores e infraestructura reciben la conexión/IP. El código del cliente no adjunta otros chats, notas, teléfonos, credenciales de sesión o claves.
5. **Archivos y permisos de Mini Apps:** el usuario puede elegir un archivo mediante Android para la web remota; es una transferencia distinta de enviar un archivo al chat. El host cancela solicitudes de teléfono/escritura y deniega cámara, micrófono y geolocalización. No concede administración de grupos ni añade bots automáticamente. No admite pagos/invoices desde el host inicial. URLs externas requieren confirmación; descargas blob pendientes.
6. **Almacenamiento de Mini Apps:** cookies y DOM storage persistente deshabilitados en este host inicial. Esto limita compatibilidad y evita reutilizar una sesión web de otra cuenta; no equivale a impedir registros de servidor, huellas o tratamientos de los scripts remotos. La ausencia de analítica en el cliente no certifica ausencia de analítica en las Mini Apps.
7. **FCM opcional:** SDK de Firebase Messaging e Installations y WorkManager. Configuración ausente por defecto y autoinicialización de Messaging deshabilitada; activación voluntaria y permiso Android. El token/identificador del dispositivo se registra con Google y Telegram cuando se configura y activa; la entrega requiere también credenciales FCM del API ID en Telegram. El payload de Telegram se procesa con TDLib; WorkManager puede persistir ese payload para ejecutarlo en segundo plano. No se interpretan textos arbitrarios de FCM como mensajes de usuario ni se muestran textos en la pantalla bloqueada. Desactivar solicita quitar los registros de las cuentas listas y borrar el token; no es borrado de todos los registros de infraestructura de proveedores.
8. **Patrocinados de Telegram:** consulta de anuncios en canales/bots, etiquetas, confirmaciones de vista y click. Los destinos externos pueden tratar datos con sus propias condiciones. La antigua declaración «sin anuncios» de alpha04 **no debe trasladarse sin revisión** a beta01; tampoco asumir ausencia de ID publicitario sin inspeccionar el manifiesto combinado.

## Datos que no cambian de finalidad automáticamente

DOB y recibo de elegibilidad siguen locales; las notas de chats no se adjuntan a Mini Apps ni a IA. Las notas personales de WR IA siguen siendo una herramienta del dispositivo separada de Telegram: no se migraron ni se borraron en esta ronda. WR IA pública permanece deshabilitada. No se añadieron compras de WRGram ni cobros al catálogo por defecto; las condiciones y precios de cada servicio propio existente deben comprobarse por separado.

## Información que falta de los servicios propios

Para `GroupButlerEsp_bot`, `antiubot`, `anycompressorbot`, `WRShorten_bot`, `mutidlprobot` y `Wrsnakebot`: proyectos fuente, hosts reales, infraestructura, datos tratados, retención, analítica, permisos ya autorizados en Telegram, términos/precios y procedimiento de eliminación. No inferir esos datos del hecho de que el propietario sea el desarrollador. No se solicitaron ni se necesitan tokens de bot para revisar el cliente.

## Antes de Play

- Aprobar una política completa que describa cliente, proveedores nuevos y límites de control sobre los servidores.
- Revisar publicidad, finalidades de tratamiento, datos de dispositivo/instalación, archivos enviados a webs, interacción con patrocinados y exención E2EE donde corresponda. No usar una respuesta global «no recopila datos».
- Revisar público, IARC, seguridad infantil, descarga de contenidos, pagos de los servicios propios y el acceso reutilizable del revisor.
- No hay publicación, cambio de formularios ni despliegue web autorizado por este borrador.
