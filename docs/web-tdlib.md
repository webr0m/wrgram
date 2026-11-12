# Cliente web con TDLib

El modo web real usa **TDLib oficial en el servidor**. El navegador no ejecuta TDLib, no recibe `TELEGRAM_API_HASH` y no guarda claves de sesión. La interfaz reutiliza `TelegramAdapter`, `LiveTelegramStore` y `TelegramMessenger`, igual que la prueba local de MTProto.

> Estado: integración de desarrollo. El modo está desactivado por defecto (`WRGRAM_TELEGRAM_WEB=0`) y no debe exponerse a Internet hasta revisar privacidad, aislamiento, cifrado, retención y términos de Telegram.

## Arquitectura

```text
Navegador
  │  cookie HttpOnly + SSE + JSON
  ▼
Fastify /api/v1/telegram
  │  sesión aislada, límites, validación, errores seguros
  ▼
tdl + tdjson (TDLib oficial)
  │  una base cifrada por sesión
  ▼
Telegram
```

- `apps/api/src/telegram/tdlib.ts`: cliente TDLib, inicio de sesión, mapeo de chats/mensajes, actualizaciones y cierre seguro.
- `apps/api/src/telegram/sessions.ts`: tokens, cookies, caducidad, límites y limpieza de bases.
- `apps/api/src/telegram/routes.ts`: rutas HTTP y SSE.
- `apps/web/src/features/telegram/tdlibApi.ts`: cliente del navegador y `TdlibWebAdapter`.
- `apps/web/src/features/telegram/TelegramServerView.tsx`: inicio de sesión web.

Cada sesión crea su propio cliente TDLib, su propia base de datos y su propia carpeta de archivos. TDLib usa una clave de cifrado aleatoria de 32 bytes que solo vive en la memoria del proceso.

## Flujo

1. `POST /v1/telegram/session` crea una sesión y una cookie `HttpOnly`, `SameSite=Strict` (y `Secure` en producción).
2. `POST /v1/telegram/login/phone` envía el número a TDLib. Nuestro código no lo guarda en el estado de la sesión ni lo registra; TDLib lo conserva dentro de su base cifrada mientras la sesión exista.
3. `POST /v1/telegram/login/code` verifica el código y, si hace falta, pasa a contraseña 2FA.
4. `POST /v1/telegram/login/password` completa la verificación en dos pasos.
5. `GET /v1/telegram/chats` y `GET /v1/telegram/chats/:id/messages` devuelven páginas del contrato `LiveChat`/`LiveMessage`.
6. `POST /v1/telegram/chats/:id/messages` envía texto solo si la conversación lo permite.
7. `POST /v1/telegram/chats/:id/read` y `/typing` confirman lectura y estado de escritura.
8. `GET /v1/telegram/updates` mantiene un flujo SSE con mensajes nuevos, ediciones, borrados, lecturas y estado de conexión.
9. `POST /v1/telegram/session/logout` cierra TDLib, intenta revocar la autorización en Telegram, destruye la base y borra la carpeta.

## Seguridad aplicada

- `api_hash` solo en el proceso del servidor. La web nunca lo recibe ni lo solicita.
- Token de sesión de 32 bytes; el servidor guarda únicamente su hash SHA-256.
- Cookie `HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` obligatorio con HTTPS.
- Las escrituras exigen la cabecera `X-WRGram-Client: web` y un `Origin` del mismo host. Sin CORS.
- Base TDLib cifrada con una clave aleatoria por sesión. La clave no se escribe en disco.
- Al arrancar se eliminan las bases huérfanas: sin la clave en memoria no se pueden abrir.
- Al cerrar sesión se intenta `logOut`, se cierra TDLib y se borra la carpeta con reintentos. Si no hay red, la base local se borra igualmente; la autorización puede quedar visible en **Dispositivos** de Telegram y debe revocarse allí.
- Límites por IP, por sesión y por minuto. Máximo de conexiones SSE por sesión.
- Los registros HTTP no incluyen cuerpos; se redactan cookies y `Authorization`. No se registran teléfono, códigos, contraseñas, textos ni perfiles. No actives `DEBUG=tdl:*` en producción: la depuración de `tdl` puede volcar actualizaciones completas.
- Los errores de TDLib se traducen a mensajes seguros; no se devuelve el objeto original.
- Sesiones no autenticadas caducan a los 15 minutos por defecto; autenticadas, a las 24 horas de inactividad.

## Configuración

En `.env` de la raíz:

```dotenv
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
WRGRAM_TELEGRAM_WEB=1

# Opcionales
WRGRAM_TELEGRAM_DATA_DIR=D:\datos\wrgram-tdlib
WRGRAM_TELEGRAM_SECURE_COOKIES=1
WRGRAM_TELEGRAM_SESSION_TTL_MINUTES=1440
WRGRAM_TELEGRAM_AUTH_TTL_MINUTES=15
WRGRAM_TELEGRAM_MAX_SESSIONS=20
WRGRAM_TELEGRAM_MAX_SESSIONS_PER_IP=3
WRGRAM_WEB_ORIGIN=https://wrgram.webrom.cc
# Solo si hay un proxy inverso de confianza que fije X-Forwarded-For.
# WRGRAM_TRUST_PROXY=1
```

`TELEGRAM_API_HASH` no debe copiarse a `VITE_*`, a un asset, a una captura ni a un mensaje. `pnpm build` revisa que no aparezca en los artefactos web conocidos.

## Ejecutar en local

Requisitos: Node.js 22.12+ y las dependencias nativas de `prebuilt-tdlib` para tu plataforma. En Windows se usa `tdjson.dll`; en Linux, `libtdjson.so`; en macOS, `libtdjson.dylib`.

```sh
pnpm install
pnpm dev:api     # API en http://127.0.0.1:3001
pnpm dev         # web en http://127.0.0.1:5173
```

Abre `http://127.0.0.1:5173/app/`, pulsa **Conectar Telegram → Abrir cliente web con TDLib (beta)**. La vista solo se incluye en desarrollo o cuando se compila con `VITE_WRGRAM_TELEGRAM_WEB=1`.

No introduzcas tu teléfono, código o contraseña en el chat del agente. Hazlo únicamente en la pantalla de WRGram.

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/v1/telegram/status` | Indica si el modo está habilitado. |
| GET | `/v1/telegram/session` | Estado de la sesión y paso de autenticación. |
| POST | `/v1/telegram/session` | Crea la sesión y la cookie. |
| POST | `/v1/telegram/session/logout` | Revoca y destruye la sesión. |
| POST | `/v1/telegram/login/phone` | Envía el número. |
| POST | `/v1/telegram/login/code` | Verifica el código. |
| POST | `/v1/telegram/login/password` | Verifica la contraseña 2FA. |
| GET | `/v1/telegram/chats?cursor=` | Página de conversaciones. |
| GET | `/v1/telegram/chats/:chatId/messages?cursor=` | Página de historial. |
| POST | `/v1/telegram/chats/:chatId/messages` | Envía texto. |
| POST | `/v1/telegram/chats/:chatId/read` | Marca lectura hasta `maxId`. |
| POST | `/v1/telegram/chats/:chatId/typing` | Envía o cancela escritura. |
| GET | `/v1/telegram/updates` | SSE de actualizaciones. |

## Límites de esta etapa

- Solo texto saliente. Fotos, vídeos, documentos, stickers, encuestas, ubicaciones, contactos y botones se muestran como marcador y no se descargan.
- Canales de solo lectura. Foros y conversaciones especiales no permiten enviar.
- No hay chats secretos, llamadas, historias, edición avanzada de álbumes ni Mini Apps.
- No se admite registro nuevo, verificación por correo ni confirmación por QR; se muestra un rechazo claro.
- La lista usa la lista principal de TDLib; los chats archivados pueden no aparecer y la paginación se detiene en 500 conversaciones por sesión.
- No hay persistencia de sesión entre reinicios del servidor: al reiniciar, las bases se eliminan y hay que volver a iniciar sesión.
- El servidor puede leer los mensajes mientras la sesión está activa. Es un cambio de modelo respecto al modo local del navegador y exige actualizar la política de privacidad y la declaración de datos si se publica.

## Producción

TDLib necesita un proceso Node persistente con la biblioteca nativa y un directorio de escritura. **No funciona en Cloudflare Workers** ni en un hosting puramente estático. El directorio de sesiones se crea con permisos `0700`; no lo incluyas en copias de seguridad ni en sincronización en la nube.

Para desplegar:

1. Usa un servidor/VPS con HTTPS y un directorio privado para `WRGRAM_TELEGRAM_DATA_DIR`.
2. Activa `WRGRAM_TELEGRAM_SECURE_COOKIES=1` y sirve `/api` por el mismo origen.
3. Mantén una sola instancia o usa sesiones persistentes/sticky si hay varias; el registro de sesiones está en memoria.
4. Limita el acceso, revisa los logs del proxy para que no capturen cuerpos y configura retención/borrado del directorio.
5. Revisa términos de Telegram, privacidad, seguridad de los datos y el texto de la ficha antes de abrir el modo al público.
6. Antes de reiniciar, avisa de que las sesiones se destruyen; después, revoca las autorizaciones huérfanas desde **Dispositivos** en Telegram.

## Pruebas

```sh
pnpm --filter @wrgram/api typecheck
pnpm --filter @wrgram/api exec vitest run src/telegram
pnpm --filter @wrgram/web typecheck
pnpm test
```

Las pruebas automatizadas cubren configuración, tokens/cookies, límites de sesión, validación de teléfono, mapeo de chats/mensajes y errores seguros. La autenticación real debe probarla el propietario con una cuenta controlada; el agente no introduce teléfono, código ni contraseña.

## Problemas habituales

- **`TDLib no pudo iniciarse`**: faltan las dependencias nativas de `prebuilt-tdlib` o el `tdjson` no carga en la plataforma.
- **`401` en `/session`**: la cookie caducó, se cerró sesión o el servidor se reinició.
- **`429`**: límite de sesiones o de Telegram. No reintentar en bucle.
- **SSE en `offline`**: revisa el proxy; algunos proxies bufferean `text/event-stream`. La API envía `X-Accel-Buffering: no`.
- **La autorización sigue en Dispositivos**: el cierre sin red no pudo revocarla. Elimínala manualmente en Telegram.
