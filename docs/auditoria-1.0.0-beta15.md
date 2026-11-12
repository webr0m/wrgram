# Auditoría de WRGram 1.0.0 beta15

Revisión del cliente Android y de la interfaz React que se empaqueta con TDLib. La versión para Play Console es `1.0.0-beta15`, código `43`.

| Flujo | Resultado de la revisión |
| --- | --- |
| Arranque | Si se cierra el proceso de renderizado de WebView, Android retira la vista dañada y ofrece reabrir la interfaz desde una pantalla nativa. La sesión de TDLib sigue en la aplicación. |
| Navegación y lectura | Se revisaron el ancla de no leídos, el seguimiento del final y los saltos por mensaje. Los enlaces y las vistas previas de chat interpretan el mismo resultado del puente. Un enlace de foro abre su tema y los IDs de mensajes se mantienen como texto entre Java y JavaScript. |
| Búsqueda, Guardados y galería | Se revisaron las consultas locales y remotas de chats, el agrupamiento de Guardados por origen, el reinicio de cursores y la galería por tipo y fecha. |
| Fichas, multimedia y Telegra.ph | Se revisaron las fichas de entidades, la ruta del navegador interno de artículos y la entrega de archivos a los visores propios o a un visor de Android según el formato. |
| Bots administrados | Se revisó la elegibilidad de publicación por chat. Las consultas y envíos de Bot API usan una cola de red independiente, de modo que una respuesta lenta no demore las tareas de almacenamiento. |
| Pestañas | Los filtros quedan bloqueados mientras se guardan. Si desaparece la carpeta de origen, el editor muestra que se usará la bandeja principal. |
| Premium y Stars | El catálogo de emojis puede reintentar el pack que falló y conserva el contexto al fallar un cambio. Los anuncios abren con el titular correspondiente. Una confirmación de factura consume su token al abrirse y solo se permite un diálogo de pago de facturas a la vez. |
| Descargas y voz | La búsqueda y el cursor de la cola comparten el filtro aplicado. La actualización automática respeta la paginación manual. Pausar un archivo devuelve éxito al puente, y los errores de reglas se muestran en Ajustes. Una valoración de voz solo se muestra como enviada cuando Telegram la confirma. |
| Programados y listas de tareas | Las acciones sobre programados comprueban que el mensaje siga en la cola del chat activo. La fecha y el envío inmediato de programados recurrentes se gestionan en Telegram para conservar la repetición. Se revisaron los permisos de las listas de tareas. |

## Validación

- Pasaron 557 pruebas de JavaScript y 196 pruebas unitarias de Android. La comprobación de tipos pasó en todo el workspace. Android Lint informó 0 errores y 8 avisos de localización existentes.
- El APK firmado actualizó beta13 en el emulador sin borrar datos. Android abrió `ShellActivity` desde cero y se verificaron el código 43, el WebView y diez filas visibles en la bandeja. El registro del proceso no mostró fallos fatales durante ese arranque.
- Se validó el AAB con `bundletool` y se comprobó que el certificado de subida coincide con beta14. El APK pasó la verificación de firma y alineación de 16 KB.
- Quedan pendientes la prueba de lectura en privados, grupos, canales y temas con una cuenta real, la simulación de un fallo del renderizador y la validación de pagos, anuncios y publicación con bots contra Telegram.
- El paquete está preparado para subir a Play Console. Los artefactos firmados y sus sumas SHA-256 están en `artifacts/android`.
