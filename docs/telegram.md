# Cliente local de Telegram · alpha

> Este documento describe el modo **local/dev con `@mtcute/web`**. El cliente web real con backend TDLib, sesiones aisladas y SSE se documenta en [web-tdlib.md](web-tdlib.md). Ese modo está desactivado por defecto y solo se activa con `WRGRAM_TELEGRAM_WEB=1`.

## Qué existe

La demo pública **no solicita ni acepta sesiones de Telegram**. En desarrollo hay una pantalla técnica independiente que usa `@mtcute/web` mediante MTProto real para:

1. Solicitar un código para tu teléfono e iniciar sesión.
2. Verificar una contraseña 2FA, si tu cuenta lo requiere.
3. Mostrar conversaciones reales, en páginas de 30, y filtrar por título o no leídos entre los chats cargados.
4. Abrir un chat y cargar su historial en páginas de 40 mensajes, conservando la posición al cargar mensajes anteriores.
5. Recibir texto y procesar ediciones, eliminaciones y lectura mediante actualizaciones de Telegram.
6. Enviar texto a conversaciones compatibles, únicamente al pulsar Enviar o Enter. Canales, foros y conversaciones especiales permanecen en solo lectura.
7. Cerrar sesión y liberar el cliente.

El propietario confirmó que la primera prueba de inicio de sesión y envío a Mensajes guardados funcionó. La nueva interfaz de historial y actualizaciones se valida con datos ficticios y pruebas automatizadas; queda pendiente su comprobación por el propietario en su cuenta. El agente no consulta conversaciones privadas para probarla. Teléfono, código y 2FA se introducen únicamente en la interfaz, nunca por mensajes al agente. Los errores de Telegram se muestran normalizados sin imprimir credenciales, respuestas completas ni perfiles en registros.

## Ejecutar

El archivo `.env` de la raíz, ignorado por Git, contiene:

```dotenv
TELEGRAM_API_ID=tu_identificador_de_aplicacion
TELEGRAM_API_HASH=tu_hash_de_aplicacion
```

No confundir estos datos con una clave de sesión o token de bot. El formato se valida localmente; eso **no certifica que Telegram acepte las credenciales** hasta una llamada real.

```sh
pnpm dev
```

Abre http://127.0.0.1:5173/app/, pulsa **Conectar Telegram → Abrir prueba técnica local de MTProto**. Revisa el aviso antes de solicitar el código. Telegram puede enviarlo a la aplicación oficial, no necesariamente por SMS. No se implementan nuevos registros, recuperación 2FA ni configuración de correo requerida por Telegram.

El backend Fastify no es necesario para esta prueba: el navegador se conecta directamente a Telegram. El endpoint de configuración es un middleware de Vite que solo se monta en desarrollo, requiere host local y no permite otro origen. Nunca se añade al Worker público. No ejecutar este servidor de desarrollo con acceso remoto, túneles públicos ni `--host 0.0.0.0`.

## Sesión efímera, no producción

Se usa `MemoryStorage`: no se escriben claves de sesión en IndexedDB/localStorage, no se exportan cadenas de sesión y no se envían a nuestros servidores. **No equivale a persistencia segura de producción**.

Cerrar la pestaña borra la copia en memoria, pero **no garantiza revocar la autorización en Telegram**. Usa el botón de cierre de sesión antes de salir. Si se pierde la red o cierras sin salir, revoca esa sesión desde Dispositivos / Sesiones activas en el cliente oficial. La navegación interna intenta revocarla, sin garantizarlo si falla la conexión. Repetir inicios de sesión puede activar límites de Telegram: no usar como cliente habitual.

No se mezclan títulos, sesiones, historial ni textos de esta pantalla con los chats ficticios, las notas demo, los plugins o WR IA. Durante el modo real se bloquean las opciones de navegación que cerrarían la sesión accidentalmente. Ajustes de apariencia y el botón Día/Noche siguen disponibles. El historial y borradores no se escriben en localStorage.

`@wrgram/telegram` contiene un contrato de datos de una cuenta autenticada, modelos de mensajes y conversaciones reales, paginación, eventos y un almacén en memoria independiente de React. `MtcuteAdapter` está en el frontend local. El cliente web con backend TDLib añade `TdlibWebAdapter` y reutiliza el mismo contrato; ver [web-tdlib.md](web-tdlib.md). No hay persistencia de sesión de producción ni cobertura completa de Telegram.

## Lectura, envío y reconexión

- La apertura de la lista no marca chats como leídos. Se confirma lectura hasta el último mensaje cargado cuando la conversación está visible al final, la ventana tiene foco y está activa. No hay modo fantasma.
- El editor envía el estado de escritura con limitación de frecuencia y lo cancela al perder foco, cambiar de chat o dejar de escribir.
- No se muestra una confirmación de envío hasta recibir la respuesta de Telegram. Respuesta RPC y evento en directo se deduplican. Si el envío falla o se pierde la conexión, puede haber llegado: comprobar antes de repetir. No hay reenvío automático.
- Los mensajes editados se actualizan. Las eliminaciones retiran mensajes y registran marcadores en memoria para evitar que una petición antigua los haga reaparecer. Los IDs se aíslan por cuenta y conversación; los borrados globales de chats privados/grupos básicos no se aplican a IDs homónimos de canales.
- Al desconectar o sincronizar se descarta la caché visible de historial. Al reconectar se vuelve a consultar la conversación abierta. No se afirma sincronización completa de todos los tipos de actualizaciones.
- Mensajes con TTL o medios autodestructivos se muestran como un marcador sin su contenido en el modelo de interfaz. No se descargan adjuntos. Multimedia, bots con botones/inline, temas de foro, mensajes patrocinados, llamadas y chats secretos requieren implementación aparte antes de distribuir un cliente real.

## Publicación y verificación

El componente se importa con `import.meta.env.DEV` y se elimina del build de producción. Las credenciales no usan prefijo `VITE_`, no se interpolan en HTML y no se incluyen en assets. `pnpm build` verifica que no aparezcan el hash local conocido ni el endpoint de configuración local; `pnpm deploy:check` inspecciona también el Worker empaquetado.

La comprobación de artefactos **no sustituye un escáner general de secretos**: detecta valores conocidos en `.env` o el entorno, no cualquier secreto desconocido.

El modo web real elegido evita exponer el `api_hash` porque ejecuta TDLib en el servidor. El modo local MTProto descrito en este documento sí entrega datos de aplicación al navegador en desarrollo y no debe publicarse. Antes de habilitar cualquier cliente público hay que proteger sesiones, aislar cuentas y revisar CSP, almacenamiento, sincronización, funciones básicas y términos de Telegram.
