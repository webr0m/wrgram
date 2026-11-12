# WRGram

**Tu espacio, conectado.** Base de un cliente no oficial de Telegram con complementos basados en permisos.

> Estado: la **demo web pública** (`alpha 0.1.0`) no conecta con Telegram ni envía mensajes reales. Por separado, Android tiene una beta conectada mediante TDLib: `0.5.0-beta11` (código 15) figura en el borrador de una prueba cerrada de Google Play y en comprobaciones de revisión; no está disponible para el público general. iOS aún no está disponible. WR IA tiene integración configurable Groq/Ollama; la generación permanece deshabilitada en la alpha pública. No se afirma paridad completa ni estabilidad de producción. [Estado Android/Play](docs/android-play.md).

Se generó localmente WRGram `0.5.0-beta11` (code15) con AAB/APK firmados y se procesó en Play Console como borrador. No se envió a revisión ni se publicó. La ficha en directo sigue siendo beta09/code13. Ver [informe](artifacts/android/BETA11.md).

También existe un **cliente web real con backend TDLib**, desactivado por defecto. El navegador habla solo con `/api/v1/telegram`; el `api_hash` y las sesiones quedan en el servidor. Requiere un proceso Node persistente (no funciona en Cloudflare Workers) y revisión de privacidad antes de exponerlo. Ver [cliente web TDLib](docs/web-tdlib.md).

## Empezar

Requisitos: Node.js **22.12+** (recomendado: Node.js 24 LTS) y pnpm **12.18.0**.

```sh
pnpm install
pnpm dev
```

Landing: **http://127.0.0.1:5173/**. Demo y acceso técnico local: **http://127.0.0.1:5173/app/**.

Web pública: **https://wrgram.webrom.cc/**. Alpha: **https://wrgram.webrom.cc/app/**, sin autenticación de Telegram ni generación IA habilitada. La landing indica que Android está en prueba cerrada e iOS en desarrollo; no hay fecha de lanzamiento público. Contacto: [@webrom_bot](https://t.me/webrom_bot).

### Windows sin pnpm instalado

Si PowerShell bloquea `npm.ps1`, usa `npm.cmd`; no necesitas cambiar la política de ejecución:

```powershell
npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm install
npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm dev
```

### Comprobaciones

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`check` ejecuta las tres comprobaciones. `build` genera **solo la aplicación web** en `apps/web/dist`; no construye una app móvil. `pnpm deploy:check` valida además el empaquetado del Worker sin publicar; `pnpm deploy` comprueba y publica en Cloudflare. Ver [despliegue](docs/deployment.md).

### Android (beta cerrada)

Hay una aplicación independiente en `apps/mobile/android`, con TDLib real, identidad negro/dorado, gestor con 19 paletas y temas propios, y almacenamiento de sesión cifrado. No es la demo web empaquetada. La versión `0.5.0-beta11` (código 15) está en el borrador de la prueba cerrada de Google Play y en comprobaciones de revisión; la ficha en directo sigue siendo beta09/code13. La validación de cuenta y flujos nuevos sigue a cargo del propietario. No está disponible para el público general. Play indica 1 de 12 verificadores y exige 14 días de prueba cerrada para solicitar producción.

Compilación y firma: [Android](apps/mobile/README.md). Requisitos y pasos antes de distribuir: [Play Console](docs/android-play.md). Los repositorios privados de GitHub/GitLab siguen pendientes, sin secretos.

### Escritorio Windows (.NET, beta)

`apps/desktop` aloja la misma interfaz React en WPF + WebView2 y conecta a Telegram con WTelegramClient, sin procesos auxiliares ni credenciales en el código fuente. El ejecutable publicado es autocontenido y solo requiere WebView2 Runtime; para compilar hace falta .NET 8 SDK. Incluye inicio de sesión real, conversaciones, historial, envío de texto y medios; el resto responde como no disponible en lugar de simular controles. Compilar y ejecutar: `WRGram-Desktop.cmd` o `scripts\desktop.ps1`. Requisitos, credenciales y límites: [escritorio](docs/desktop.md). No se ha probado el inicio de sesión con una cuenta real en esta entrega.

API de desarrollo:

```sh
pnpm dev:api
```

- `GET http://127.0.0.1:3001/health`
- `GET http://127.0.0.1:3001/v1/plugins`
- `GET http://127.0.0.1:3001/v1/assistant/status`
- `POST http://127.0.0.1:3001/v1/assistant/chat`
- `GET http://127.0.0.1:3001/v1/telegram/status` (cliente web TDLib, requiere `WRGRAM_TELEGRAM_WEB=1`)

Expone salud, catálogo e integración de IA. El gateway TDLib es opcional y, cuando se activa, mantiene una sesión aislada por usuario con base cifrada y cookies `HttpOnly`. Escucha en loopback por defecto. `.env` configura Groq u Ollama sin exponer la clave al navegador. Ver [WR IA](docs/ai.md) y [cliente web TDLib](docs/web-tdlib.md).

## Qué funciona

- Interfaz adaptable con lista de conversaciones, chat y panel lateral.
- Nueva identidad vectorial en **negro y dorado**, compartida por landing e interfaz principal.
- **Gestor de temas**: 19 paletas base (WRGram, Telegram oficial y homenajes originales a TGX, Nekogram, Plus Messenger, AyuGram, Catogram, iMe, Unigram, Materialgram y 64Gram), editor con tipografía, tamaño, fondo, radio y desenfoque, temas por chat, modo «seguir al sistema», avisos de contraste, importación/exportación por código, enlace `wrgram://theme/…` y archivos `.attheme`/`.tdesktop-theme`, y hasta 20 temas guardados. En Android y escritorio, con barras del sistema, notificaciones, splash y barra de título adaptadas a la paleta; la landing mantiene las ocho paletas web. Etiquetado como Premium incluido en beta, sin cobro ni suscripción.
- Búsqueda de conversaciones y mensajes, filtros de no leídos y bots, orden alfabético.
- Mensajes de demostración, borradores separados por conversación y chats locales nuevos.
- Selector sencillo de emojis; Enter envía localmente y Shift+Enter inserta una línea.
- Catálogo de complementos propios y consentimiento explícito antes de activarlos.
- **Notas privadas por chat**, guardadas en este navegador.
- **Respuestas rápidas**, que preparan borradores sin enviarlos automáticamente.
- **WR IA** con Groq online u Ollama local: consentimiento, respuestas reales cuando se configura el proveedor y propuestas de notas que requieren confirmación. Sin acceso a Telegram.
- Revocación de permisos, eliminación de notas y advertencias de almacenamiento.
- Navegación por teclado: Ctrl/Cmd+K para buscar, diálogos con foco contenido y Escape.
- Pruebas unitarias de permisos, validación de mensajes y notas; prueba HTTP de la API.
- **Solo en desarrollo local:** conversaciones reales, historial paginado, envío de texto y actualizaciones mediante mtcute. Las credenciales y el cliente real no se incluyen en la alpha pública. Ver [Telegram local](docs/telegram.md).
- **Cliente web TDLib (beta de desarrollo):** login teléfono/código/2FA, chats, historial, envío de texto, lectura, escritura y SSE a través del backend. El navegador nunca recibe el `api_hash`. Desactivado por defecto. Ver [cliente web TDLib](docs/web-tdlib.md).

### Datos de la demo

Las notas y permisos se guardan en `localStorage` bajo claves `wrgram.demo.*.v1`, **sin cifrado**. No introduzcas información sensible. No se sincronizan entre dispositivos. Los chats, mensajes nuevos y borradores solo viven en memoria y se pierden al recargar.

Las notas personales aprobadas en WR IA se guardan separadamente bajo `wrgram.assistant.notes.v1`, también sin cifrado, y se borran desde su propio panel. El historial de IA solo vive en memoria mientras el panel está abierto.

Desactivar notas revoca acceso pero **no las elimina**. Puedes borrarlas en Ajustes. Esto no es una protección contra otras personas que usen el mismo perfil del navegador, herramientas de desarrollo o código del mismo origen.

## Estructura

```text
apps/
  web/                 React + Vite + TypeScript
  api/                 Fastify + TypeScript; gateway TDLib opcional y servicios de desarrollo
  edge/                Cloudflare Worker + assets, generación pública deshabilitada
  mobile/              Android nativo / TDLib (beta11); iOS sigue pendiente
  mobile-ui/           Interfaz React compartida con Android y escritorio
  desktop/             WPF + WebView2 + WTelegramClient (beta de escritorio)
packages/
  core/                Modelos de chat y mensaje, validaciones básicas
  assistant/           Contrato y cliente HTTP compartido de WR IA
  ai-providers/        Groq/Ollama, solo en servidor
  telegram/            Contrato, modelos, paginación y estado en memoria del modo real
  plugin-sdk/          Manifiestos y permisos de complementos propios
  plugin-runtime/      Registro, concesiones, validación y revocación
  design-tokens/       Tokens CSS compartidos
docs/
  architecture.md
  competition.md
  roadmap.md
  security.md
  ai.md
  deployment.md
  web-tdlib.md
```

## Próxima etapa

La web pública sigue siendo una demo sin cuenta ni mensajes reales. El cliente web TDLib existe en desarrollo, pero necesita una cuenta controlada, revisión de privacidad/Data Safety y un servidor Node con HTTPS antes de exponerse. En Android, la siguiente etapa es que el propietario y los verificadores prueben la fuente local beta20 con cuentas/bots controlados, completen la prueba cerrada de Play y revisen las divulgaciones antes de solicitar producción. Las pruebas automatizadas no validan pagos, grupos, perfil ni Mini Apps con Telegram real.

Llamadas, pagos con monedas distintas de XTR, facturas de Mini Apps por *slug*, edición de áreas de historias publicadas, paginación de la búsqueda de miembros y los eventos de Mini Apps que el binding no expone siguen pendientes. PostgreSQL, pagos propios de WRGram, PWA y marketplace continúan siendo trabajo futuro, no servicios ya instalados.

## Decisiones y referencias

- [Arquitectura y límites](docs/architecture.md)
- [Revisión de competencia y oportunidades](docs/competition.md)
- [Hoja de ruta priorizada](docs/roadmap.md)
- [Modelo de seguridad inicial](docs/security.md)
- [WR IA: configuración y límites](docs/ai.md)
- [Cliente web TDLib: arquitectura y límites](docs/web-tdlib.md)
- [Prueba técnica local de Telegram](docs/telegram.md)
- [Escritorio Windows: compilación, credenciales y límites](docs/desktop.md)
- [Temas y modos Día/Noche](docs/themes.md)
- [Publicación web y límites de la alpha](docs/deployment.md)

WRGram no está afiliado, patrocinado ni avalado por Telegram. Antes de distribuir un cliente real debemos cumplir los [términos de su API](https://core.telegram.org/api/terms), usar nuestro propio `api_id` y completar una revisión de seguridad, licencias y políticas de las tiendas.
