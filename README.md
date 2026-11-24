# WRGram

**Tu espacio, conectado.** Cliente no oficial de Telegram con complementos basados en permisos, en tres capas reales: Android nativo, Windows de escritorio y una interfaz React compartida.

> **Inventario técnico revisado el 24/11/2026.** La fuente local es `1.0.0-beta35` (código 63) y está commiteada y pushada (`9c4c9b7`). El inventario flujo a flujo frente al cliente oficial es [la auditoría](docs/telegram-flow-audit-2026-11-13.md) con su mapa de **81 filas**; el registro de releases con su evidencia es [docs/validation.md](docs/validation.md); el estado de Google Play es [docs/android-play.md](docs/android-play.md). Ninguna cifra de este README es de memoria: todas se midieron sobre este árbol.

## Estado a 24/11/2026

- **Android — `1.0.0-beta35` / código 63.** TDLib/JNI nativo, sesión cifrada, interfaz compartida empaquetada localmente. Compilado y firmado (AAB 82.938.184 B `74737a84…de6d71c`, APK 182.292.586 B `9b8e8262…ae71eb`, mapa R8 30.101.299 B), probado en el emulador con la build firmada y validado con la cuenta del propietario. La política pública está re-anclada al 63, desplegada y vuelta a leer de `wrgram.webrom.cc` con el mismo SHA-256 que el archivo del árbol (31.045 B, `fc5e3661…d0ccc9d2`).
- **Google Play — prueba cerrada, sin lanzamiento público.** El **código 62** (`1.0.0-beta34`) figura **activo en la pista de prueba cerrada** para 178 países, leído el 24/11 a través del Chrome del propietario. El **código 63** está subido y **guardado como borrador** con su nombre y su nota es-419; **no se pulsó «Enviar a revisión»**. El canal sigue siendo prueba cerrada: no hay disponibilidad para el público general y no se afirma paridad ni estabilidad de producción.
- **Escritorio Windows — `0.1.0-desktop3`, beta no publicada.** WPF + WebView2 con la misma interfaz React y WTelegramClient (MTProto puro en .NET, sin procesos auxiliares). Publicado autocontenido el 24/11: `artifacts/desktop/win-x64/WRGram.Desktop.exe`, 74.437.910 B, SHA-256 `c5262366…cbf3210`. El inicio de sesión con cuenta real **sigue sin probarse** en esta entrega ([docs/desktop.md](docs/desktop.md)).
- **Web pública — `https://wrgram.webrom.cc/` sigue siendo una demo.** `/` es la landing y `/app/` una interfaz de pruebas **sin cuenta de Telegram y sin envío real**. Existe un **cliente web real con backend TDLib**, desactivado por defecto (`WRGRAM_TELEGRAM_WEB=0`) y no expuesto: solo texto saliente, sin medios y sin persistencia entre reinicios ([docs/web-tdlib.md](docs/web-tdlib.md)). Su conversión en plataforma web real es el frente de trabajo abierto.
- **iOS — no existe.** Ni código ni fecha.
- **WR IA** tiene integración configurable Groq/Ollama; la generación pública sigue deshabilitada (`WRGRAM_AI_ENABLED=false` en el Worker).

## Descargas del 63

La release [`v1.0.0-beta35`](https://github.com/webr0m/wrgram/releases/tag/v1.0.0-beta35) lleva `WRGram-1.0.0-beta35.aab`, `WRGram-1.0.0-beta35.apk`, `WRGram.Desktop.exe` (`0.1.0-desktop3`) y su `SHA256SUMS-beta35.txt`. El mapa de R8 (`mapping-1.0.0-beta35.txt`, 30.101.299 B) **no se publica**: es la tabla que desofusca el APK firmado y vive solo en `artifacts/android/`. El APK tiene la misma firma que la beta cerrada de Play; instalarlo directamente es una prueba, no un canal de distribución, y del paquete extraíble `api_id`/`api_hash` identifican la aplicación, no una sesión.

## Empezar

Requisitos: Node.js **22.12+** (recomendado 24 LTS) y pnpm **12.18.0**.

```sh
pnpm install
pnpm dev
```

Landing: **http://127.0.0.1:5173/**. Demo web: **http://127.0.0.1:5173/app/**. UI compartida (Android/escritorio) en modo desarrollo: **http://127.0.0.1:5174/**, con `?preview=1` para los fixtures **sintéticos** que solo existen en desarrollo.

### Windows sin pnpm instalado

Si PowerShell bloquea `npm.ps1`, usa `npm.cmd`; no hace falta cambiar la política de ejecución:

```powershell
npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm install
npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm dev
```

### Comprobaciones

```sh
pnpm typecheck   # los 11 proyectos del workspace
pnpm test        # suite raíz (Vitest)
pnpm build       # solo la aplicación web -> apps/web/dist
pnpm check       # las tres anteriores
pnpm deploy:check  # valida el empaquetado del Worker sin publicar
pnpm deploy        # comprueba y publica en Cloudflare
```

`pnpm -r` vuelve a invocar `pnpm` desde los hijos, así que si no está en el `PATH` el typecheck muere con «"pnpm" no se reconoce como un comando interno». En esta máquina el arreglo verificado es un shim **fuera del repositorio** (la ruta del repo lleva espacio) y **en forma POSIX**: `corepack enable pnpm --install-directory C:/Users/…/.wrbin` y `export PATH="/c/Users/…/.wrbin:$PATH"`. Sin eso, queda `npx tsc -p tsconfig.json` y `npx vitest run` por workspace, que **no cubre los siete `packages/*`**.

## Las tres capas

### Android (`apps/mobile/android`)

App independiente con TDLib real, no la demo web empaquetada. Compilar y firmar: [apps/mobile/README.md](apps/mobile/README.md). Requisitos, credenciales, Play Console y límites: [docs/android-play.md](docs/android-play.md).

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task release
```

`-Task version` es la única forma de versionar: reescribe a la vez `version.properties`, `contract.ts`, `beta.test.ts` y `android-contract.test.ts` o no toca nada. La clave de subida vive en `.private/android-signing/`, fuera de Git. El build lee `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` del entorno o del `.env` raíz; identifican la aplicación, no son sesiones de usuario.

### Escritorio (`apps/desktop`)

`scripts\desktop.ps1` o `WRGram-Desktop.cmd`. El ejecutable publicado es autocontenido: solo necesita WebView2 Runtime; para compilar hace falta .NET 8 SDK (o el SDK local en `.tools\dotnet8`). Lo que la capa no puede hacer responde «no disponible» en lugar de simular el control.

### Web (`apps/web` + `apps/edge` + `apps/api`)

`apps/web` compila dos entradas (`/` landing, `/app/` demo) y `apps/edge` es el Worker de Cloudflare que las sirve con `/api/*` (salud, catálogo de complementos, proxy de Giphy y estado de WR IA). `apps/api` es un Fastify **aparte**, con el gateway TDLib opcional; TDLib necesita proceso Node persistente y no corre en Workers. `scripts/check-public-build.mjs` bloquea publicar credenciales locales o el endpoint de la prueba local.

## Qué funciona hoy (Android y escritorio con TDLib/MTProto reales)

Resumen de familias; la verdad por flujo está en el mapa de la auditoría.

- **Cuenta y sesión:** hasta tres cuentas, teléfono/código/2FA, recuperación, QR, sesiones activas y revocación, **cambio de número sin cerrar sesión ni perder chats** (ronda A02, nueva en el 63), bloqueo con biometría/PIN, autodeclaración de edad.
- **Chats:** privados, grupos básicos, supergrupos, canales, foros con tópicos, chats secretos básicos, carpetas con exclusiones y fijados, archivo, silencio, no leídos, etiquetas de Guardados, pestañas con icono y/o nombre por pestaña.
- **Mensajes:** historial paginado, búsqueda con paginación, respuestas con cita de texto seleccionado, edición de texto y pie, reenvío, copiado, fijados, borradores, programados (enviar ya, reprogramar), reacciones (normales, pagas, personalizadas), notas de voz con transcripción y auto-parada avisada, **recibos de lectura y fecha de lectura**, registro de llamadas.
- **Multimedia:** fotos con variantes por tamaño, vídeo con reproductor nativo Media3, documentos con cola de descargas y reglas por red, álbumes (crear, editar pies, sustituir el medio de un enviado), stickers (packs, TGS, buscar e instalar), GIF (Giphy o archivo del dispositivo), videomensajes, cámara, ubicación y **ubicación en directo**, contactos, encuestas (12 opciones, cierre temporizado, descripción y foto por opción, votantes), listas colaborativas, **compartir hacia WRGram** desde otras apps.
- **Comunidad y administración:** crear grupo/supergrupo/canal, miembros y filtros, restringir, banear, promover, traspaso de propiedad, registro de actividad, enlaces de invitación e historial visible, estadísticas de canal/grupo/mensaje, ficha de chat y de persona con «En común», firma de invitación.
- **Bots:** escribir como otro remitente, publicar con un bot propio por Bot API, panel de bot administrador (descubrimiento, derechos, añadir, quitar, posts, editar, borrar, fijar).
- **Monetización:** Stars (cartera, transacciones, recarga, regalos, boosts), Premium (ventajas, límites, códigos de regalo, estado emoji), facturas `XTR`; tarjetas y otras monedas **no**.
- **Personalización:** catálogo con 19 paletas, editor sobre 28 tokens, temas por chat, «seguir al sistema», fondos de la cuenta en ambas capas (rondas CH), tipografías, tamaño y densidad de texto, barras del sistema, splash y notificaciones con la paleta.
- **Extras:** Telegram Business (respuestas rápidas, saludo, ausencia, enlaces), notas privadas por chat, traducción, Mini Apps aisladas con consentimiento y APIs soportadas, proxy, almacenamiento y caché, notificaciones push (FCM configurado, **entrega real sin verificar**) con acciones.

## Límites conocidos, dichos en claro

- **Llamadas grupales y chats de voz:** imposibles de entrar en las dos capas porque `JoinGroupCall` exige una señal suelta que ni TDLib ni el binding exponen. El **voz 1:1 en Android sí está cableado** a un motor real (`ntgcalls`), pero sin validar con dos dispositivos; el vídeo 1:1 y Windows con audio siguen ausentes.
- **Pagos:** tarjetas y monedas distintas de `XTR` no; facturas de Mini Apps por *slug* no, porque el binding de TDLib no expone `InputInvoiceSlug` ([MiniAppActivity.java:373](apps/mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java#L373)).
- **Visionado único y temporales:** parcial — el contenido se deriva pero sus medios no se descargan.
- **Web:** sin cuenta real desplegada. **iOS:** no existe.
- **Paridad de puente medida en este árbol:** `BridgePolicy.METHODS` declara **404** métodos únicos ([BridgePolicy.java:12](apps/mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java#L12)); el `switch` del host de Windows atiende **213** brazos —**196** vivos y **17** negados por su nombre— y **191** métodos existen solo en Android. Ningún brazo de Windows está ausente del registro de Android. Lo no cubierto se niega en pantalla: los 17 con su propia frase y el resto con el rechazo genérico «No disponible en escritorio».
- **Mapa de flujos medido hoy:** **81 filas — 25 añadidas, 40 parciales, 5 sin flujo encontrado, 6 sujetas a dependencia externa y 5 pendientes de validación** con la cuenta real del propietario. Lo «sin flujo» que queda: A04 autodestrucción por inactividad y borrado de cuenta, S02 lista de quién no puede ver historias, M09 efectos de mensaje, C08 mensajes directos al canal y P06 navegador multiventana con catálogo de Mini Apps.
- **Validación pendiente del propietario:** enviar el 63 a revisión en Play, respuestas de Data Safety, capturas actuales de la ficha, entrega push real, llamadas 1:1 con dos aparatos y el login real del escritorio.

## Compuertas y evidencia

Ningún «verde» se afirma sin haber visto su «rojo», y ninguna cifra se cita sin que un log la sostenga en `.tools/logs/`. Estado medido **después** de escribir este README (24/11/2026):

| Compuerta | Mandato | Medido |
| --- | --- | --- |
| Suite raíz | `npx vitest run --reporter=dot` | 172 archivos / 2.770 pruebas, `s=0` |
| Suite completa de la UI compartida | dentro de `apps/mobile-ui` | 149 archivos / 2.643 pruebas, `s=0` |
| Subconjunto de documentos | `citasNativas rondaBM rondaBQ rondaBV rondaCWD` en `apps/mobile-ui` | 5 archivos / 56 pruebas, `s=0` |
| Typecheck | `npx tsc --noEmit` en mobile-ui, api, edge y web | salida vacía, `s=0` |
| Pruebas JVM | `build/test-results/testDebugUnitTest/*.xml` | 561 pruebas en 66 suites, 0 fallos |
| Lint | `lintDebug` y `lintRelease` | 0 errores / 9 avisos |
| Doce cribas de citas | `node .tools/a02-doce.mjs <pasada>` | 12 de 12 byte a byte idénticas entre pasadas vecinas |

Las doce cribas (`citas-codigo`, `cwb-which-cites`, `map-hygiene`, `longitudes`, `brazos`, `citas-play`, `c315-cuerpos`, `c315-cables`, `c315-sinllave`, `ch-anclas`, `cha2-anclas`, `chb-anclas`) sostienen la higiene de citas del repo. Solo `citas-codigo` y `chb-anclas` pueden fallar por código de salida: en las otras diez hay que leer **la cifra impresa**, no el `exit 0`. Dos son las que leen los documentos: `citas-play` **103 medidas · 103 cuadran · 0 podridas** y `cwb-which-cites` **173 | 173**.

**Regla del punto fijo:** la prosa de los documentos se mide **después** de escribirla. Si una cifra se mueve, la falsa es la frase.

## Datos de la demo

Las notas y permisos de la demo web se guardan en `localStorage` bajo claves `wrgram.demo.*.v1`, **sin cifrado**. No introduzcas información sensible. No se sincronizan entre dispositivos. Los chats, mensajes nuevos y borradores de `/app/` solo viven en memoria y se pierden al recargar. Las fixtures de `?preview=1` son sintéticas, rotuladas como tales, solo existen en desarrollo y no viajan en el build de Android.

## Estructura

```text
apps/
  web/                 Landing + demo pública (React + Vite)
  mobile-ui/           Interfaz React compartida: es la app de Android y la del escritorio
  mobile/android/      Android nativo con TDLib/JNI y WebView
  desktop/             Host WPF + WebView2 + WTelegramClient (.NET 8)
  api/                 Fastify; IA y gateway TDLib web opcional
  edge/                Cloudflare Worker + assets públicos
packages/
  core/ assistant/ ai-providers/ telegram/ plugin-sdk/ plugin-runtime/ design-tokens/
docs/                  auditoría de flujos, validación, Play, seguridad, web-tdlib…
scripts/               android.ps1, desktop.ps1, prepare-tdlib.mjs, check-*.mjs
.tools/               Scratch medible: cribas, sondas y logs (excluido de Git)
artifacts/             Builds firmados y fichas de release (excluido de Git)
```

## Próxima etapa

1. **Plataforma web real.** Hoy la web y la interfaz de verdad son dos cosas distintas: `/app/` es una demo propia, mientras que las ~40 rondas de funciones viven en `apps/mobile-ui`, que solo sabe hablar con un `postMessage` de WebView. Decidir la web significa elegir UI autoritativa y transporte (gateway TDLib en un servidor Node con HTTPS, MTProto en el navegador, o ambos) y revisar privacidad antes de exponer sesión alguna.
2. **Cerrar los cinco flujos sin flujo** del mapa y subir los parciales visibles: S07 temporales, C01 comentarios de canales, F03 editor de adjuntos.
3. **Lo que depende del propietario:** enviar el 63 a revisión, Data Safety, capturas, validación con cuenta real de push, llamadas y escritorio.
4. PostgreSQL, pagos propios de WRGram, PWA y marketplace siguen siendo trabajo futuro, no servicios instalados.

## Decisiones y referencias

- [Auditoría de flujos frente a Telegram oficial y backlog priorizado](docs/telegram-flow-audit-2026-11-13.md)
- [Registro de validación por release](docs/validation.md) · [Paridad de clientes](docs/client-parity.md)
- [Android y Play Console](docs/android-play.md) · [Escritorio Windows](docs/desktop.md)
- [Cliente web TDLib: arquitectura y límites](docs/web-tdlib.md) · [Prueba técnica local de Telegram](docs/telegram.md) · [Publicación web](docs/deployment.md)
- [Arquitectura y límites](docs/architecture.md) · [Seguridad](docs/security.md) · [Temas](docs/themes.md) · [WR IA](docs/ai.md) · [Data Safety](docs/play-data-safety.md) · [Acceso por edad](docs/age-access.md)
- [Hoja de ruta histórica](docs/roadmap.md) — desactualizada a propósito: no refleja el estado actual

WRGram no está afiliado, patrocinado ni avalado por Telegram. Antes de distribuir un cliente real debemos cumplir los [términos de su API](https://core.telegram.org/api/terms), usar nuestro propio `api_id` y completar una revisión de seguridad, licencias y políticas de las tiendas.
