# WRGram · Android

Capa nativa con **TDLib/JNI real** y la interfaz **React compartida** (`apps/mobile-ui`) empaquetada localmente en un WebView restringido. No carga la demo ni un sitio remoto: `ShellActivity` sirve `https://appassets.androidplatform.net/assets/ui/index.html`. El árbol fuente está en **`1.0.0-beta35` / `versionCode 63`** (`android/version.properties`) y el commit `9c4c9b7`. Java 17, `minSdk 26`, `targetSdk` y `compileSdk` 36, cuatro ABI, lanzable `cc.webrom.wrgram.ShellActivity`.

El alcance técnico flujo a flujo y las brechas frente al cliente oficial están en [la auditoría](../../docs/telegram-flow-audit-2026-11-13.md) con su mapa de **81 filas**; el registro por release en [docs/validation.md](../../docs/validation.md); el estado de la consola en [docs/android-play.md](../../docs/android-play.md). Este archivo describe cómo se compila y firma, no qué hace cada botón.

## Compilar en Windows

Requisitos: Node 22.12+, JDK 17+, Android SDK Platform 36 y Build Tools 35.0.0+. `JAVA_HOME` y `ANDROID_HOME` pueden configurarse por proceso; el script también reconoce las herramientas descargadas para esta sesión, sin instalación global. El build usa el wrapper **Gradle 8.14.6**.

Desde la raíz (`-Task` admite `check`, `debug`, `release`, `version`):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task release
```

`Bypass` afecta solo a ese proceso; no se modifica la política de Windows. El script compila primero `apps/mobile-ui` y copia únicamente su build en los assets locales, y antes de firmar corre la suite raíz (en el 63: **172 archivos y 2.770 pruebas**).

`-Task version` es la única forma de versionar: reescribe a la vez `version.properties`, `contract.ts`, `beta.test.ts` y `android-contract.test.ts` o no toca nada. Nunca edite una aguja suelta.

## Firma y clave de subida

La firma vive bajo `.private/android-signing/`, excluida de Git y con permisos de usuario/SYSTEM. Guarda una copia **cifrada** fuera del repositorio. `-CreateUploadKey` se usa **solo la primera vez y solo si la aplicación no tiene clave de subida previa**; nunca sobrescribe una existente, y para una app ya creada en Play Console se configura la clave previa en `upload.properties`. La contraseña no se imprime ni se pasa como argumento visible. El 63 se firmó con el mismo certificado que beta27…beta34: `CN=WRGram Upload`, SHA-256 `f6165d20…ca8332`.

El build lee únicamente `TELEGRAM_API_ID` y `TELEGRAM_API_HASH` del entorno o del `.env` raíz. Identifican a la aplicación y son necesariamente extraíbles de un cliente distribuido; **no son códigos de acceso ni sesiones de usuario**. El build web público permanece separado y sin esas credenciales.

## Motor nativo

`node scripts/prepare-tdlib.mjs` descarga desde una revisión fija de `TGX-Android/tdlib`, verifica SHA-256 de cada fuente y biblioteca y valida la alineación ELF de 16 KB en 64 bits. `android/tdlib/native-lock.json` registra la revisión, el commit de TDLib y OpenSSL. Los archivos pesados se generan bajo `tdlib/vendor/`, excluido de Git. No se descarga `main` ni `latest` al compilar. Las 20 bibliotecas nativas empacadas salen despojadas de símbolos, en APK y en AAB.

## Estado de Google Play (24/11/2026)

Canal: **prueba cerrada**, sin disponibilidad pública y sin afirmación de paridad o estabilidad de producción.

- **`62 (1.0.0-beta34)`: versión activa** en la pista de prueba cerrada, leída el 24/11 en el Chrome autenticado del propietario, desplegada en **178 países o regiones**.
- **`63 (1.0.0-beta35)`: subido y guardado como borrador** con su nombre de versión y su nota `es-419` (497 de 500 caracteres en la fuente). La persistencia se comprobó recargando la página. **No se pulsó «Enviar a revisión»** ni el paso «Obtener vista previa y confirmar»: eso es del propietario.
- Play exige los verificadores y la ventana de prueba cerrada antes de producción; las respuestas de Data Safety y las capturas actuales de la ficha siguen pendientes. **Generar el `.aab` no lo publica.**

## Artefactos del 63

En `artifacts/android/` (excluido de Git), identificadores `cc.webrom.wrgram`:

| Archivo | Bytes | SHA-256 |
| --- | --- | --- |
| `WRGram-1.0.0-beta35.aab` | 82.938.184 | `74737a84…de6d71c` |
| `WRGram-1.0.0-beta35.apk` | 182.292.586 | `9b8e8262…ae71eb` |
| `mapping-1.0.0-beta35.txt` | 30.101.299 | `b720901f…db49c4` |

Los dos paquetes recalculados con `sha256sum` e iguales a sus líneas en `SHA256SUMS.txt`. Ficha del release: [BETA-1.0.0-beta35.md](../../artifacts/android/BETA-1.0.0-beta35.md). La política pública está re-anclada al 63, desplegada y vuelta a leer de `wrgram.webrom.cc` con el mismo SHA-256 que el archivo del árbol (31.045 B, `fc5e3661…d0ccc9d2`).

## Qué cubre y qué no

Resumen; la verdad por flujo está en el mapa de la auditoría.

- Sesión con hasta tres cuentas, teléfono/código/2FA, recuperación, QR, sesiones y revocación, **cambio de número sin cerrar sesión** (ronda A02, nueva en el 63), bloqueo con biometría/PIN y autodeclaración de edad.
- Chats privados, grupos, supergrupos, canales, foros con tópicos, secretos básicos, carpetas, archivo, silencio, no leídos y pestañas con presentación por pestaña.
- Historial paginado, búsqueda, respuestas con cita de selección, edición de texto y pie, reenvío, fijados, borradores, programados, reacciones (normales, pagas, personalizadas), **recibos de lectura**, notas de voz con transcripción y registro de llamadas.
- Multimedia: fotos con variantes, vídeo con Media3, cola de descargas con reglas por red, álbumes, stickers y TGS, GIF (Giphy o archivo del dispositivo), videomensajes, cámara, ubicación y ubicación en directo, contactos, encuestas y listas colaborativas, además de **recibir contenido compartido desde otras apps**.
- Administración y comunidad (crear grupo/supergrupo/canal, miembros, restringir, banear, promover, traspaso, registro, enlaces de invitación, estadísticas, ficha de chat y de persona), bots (publicar con bot propio, panel de bot administrador), Stars y Premium, Telegram Business, notas privadas, traducción, Mini Apps aisladas con consentimiento, proxy, temas y fondos de la cuenta, y push con FCM configurado.
- **No:** llamadas grupales ni chats de voz (la señal de `JoinGroupCall` no existe en el binding; el voz 1:1 está cableado a `ntgcalls` pero sin validar con dos aparatos), tarjetas y monedas distintas de `XTR`, pagos por *slug* de Mini Apps (`InputInvoiceSlug` no expuesto), visionado único con medios, iOS.
- **Paridad medida en este árbol:** `BridgePolicy.METHODS` declara **404** métodos y `NativeBridge.java` tiene **428** líneas con `case "` sobre 5.601 líneas.

## Validación medida del 63 y sus huecos

`-Task release` completo (1.061 líneas, `EXIT=0`), **561 pruebas JUnit en 66 suites** (0 fallos, 0 saltadas), `lint-results-release.txt` con **0 errores y 9 avisos**, `bundletool validate` sobre **593 entradas** sin duplicados ni entradas sin firmar, `zipalign -c -P 16 4`, un solo firmante y `aapt2 dump badging` coincidente con `version.properties`. Smoke test del APK release instalado sobre el 62 en `emulator-5554`: arranque, render de la lista y **un** envío real a Guardados con la cuenta del propietario.

Huecos dichos en claro: **el cambio de número (A02) no se ejercitó contra Telegram con la cuenta real** y depende de que Telegram admita la aplicación; la presentación por pestaña se midió en el andamio, no dentro de la app en el dispositivo; las capturas del emulador salen negras por `FLAG_SECURE`, así que no prueban nada; el `logcat` de este arranque no se re-leyó. Las pruebas sintéticas residen solo en `src/debug/` y `src/androidTest/`.

## Ver la UI en el navegador

`pnpm --filter @wrgram/mobile-ui dev`, puerto 5174. `/` muestra la pantalla sin cuenta; `/?preview=1` y `/mobile-preview.html` pintan fixtures **sintéticos**, rotulados como tales, solo en desarrollo: no pueden enviar mensajes y no viajan en el build Android. La vista pública `/app/` es otra demo, no la sesión nativa.

## Historia

`docs/beta09.md` y `docs/beta10-proposal.md`, con `artifacts/android/BETA10.md`, describen la serie `0.5.0-betaNN` (códigos 13 y 14) que quedó atrás cuando la app saltó a la numeración `1.0.0-betaNN`. Los bloques por código de [docs/android-play.md](../../docs/android-play.md) son el registro continuo; las entradas inferiores de ese archivo son históricas.

Las pruebas reales de cuenta y mensajería corresponden al propietario, sin compartir códigos ni conversaciones con el agente. Antes de distribuir: completar la lista de [Play Console](../../docs/android-play.md). WRGram no está afiliado ni avalado por Telegram; se usan `api_id` propios y hay que cumplir los [términos de su API](https://core.telegram.org/api/terms).
