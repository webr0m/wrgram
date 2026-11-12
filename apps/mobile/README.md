# WRGram · Android beta09

Aplicación Android con **TDLib/JNI nativo** y una interfaz **React/Vite empaquetada localmente**. La versión de trabajo es `0.5.0-beta09` (versionCode 13); no carga la demo ni un sitio remoto. `ShellActivity` usa un origen local restringido; Java 17/AndroidX mantiene la sesión, el cifrado, el transporte y el selector de archivos. La UI nativa anterior se conserva como respaldo y para avisos/licencias/notas de WR IA. Beta significa canal de prueba, no certificación de estabilidad ni paridad completa.

El árbol fuente y el artefacto local contienen `0.5.0-beta10`/code14 (comunidades, moderación, historias de foto e importación opcional de contactos). Play Console muestra el AAB en preparación de prueba cerrada, sin envío ni publicación; la ficha en directo sigue siendo beta09/code13. Beta10 requiere pruebas controladas, capturas actuales y revisión de privacidad. Ver [propuesta beta10](../../docs/beta10-proposal.md) e [informe del AAB](../../artifacts/android/BETA10.md).

## Compilar en Windows

Requisitos: Node 22.12+, JDK 17+, Android SDK Platform 36 y Build Tools 35.0.0+. `JAVA_HOME` y `ANDROID_HOME` pueden configurarse por proceso. El script también reconoce las herramientas descargadas para esta sesión, sin instalación global.

Desde la raíz:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Task release
```

`Bypass` afecta solo a ese proceso; no se modifica la política de Windows. `-CreateUploadKey` se usa **solo la primera vez y solo si la aplicación no tiene una clave de subida previa**. Nunca sobrescribe una clave. En compilaciones posteriores omite esa opción.

La firma se guarda bajo `.private/android-signing/`, excluida de Git y con permisos de usuario/SYSTEM. Guarda una copia **cifrada** fuera del repositorio. La contraseña no se imprime ni se pasa como argumento visible al generar la clave. Para una app ya creada en Play Console, configura su clave existente en `upload.properties`; no generes una nueva arbitrariamente.

El build lee únicamente `TELEGRAM_API_ID` y `TELEGRAM_API_HASH` del entorno o del `.env` raíz. Estos datos identifican a la aplicación y son necesariamente extraíbles de un cliente distribuido. **No son códigos de acceso ni sesiones de usuario**. El build web público permanece separado y sin esas credenciales.

## Motor nativo

`node scripts/prepare-tdlib.mjs` descarga desde una revisión fija de `TGX-Android/tdlib`, verifica SHA-256 de cada fuente y biblioteca y valida alineación ELF de 16 KB en 64 bits. `android/tdlib/native-lock.json` registra la revisión, el commit de TDLib y OpenSSL 3.5.9. Los archivos pesados se generan bajo `tdlib/vendor/`, excluido de Git. No se descarga `main` ni `latest` al compilar.

Los avisos y licencias se incluyen en la aplicación. Esto no sustituye una auditoría de seguridad ni prueba la reproducibilidad de los binarios de terceros.

## Alcance de beta09

- Hasta tres cuentas de Telegram con almacenamiento TDLib separado; acceso por teléfono, código y contraseña 2FA. Registro, recuperación y algunos pasos de autenticación por correo siguen sin cubrirse.
- Base TDLib cifrada con clave protegida por Android Keystore; sin copias de seguridad ni capturas de pantalla.
- Chats privados, grupos básicos, canales compatibles y chats secretos básicos; filtros, carpetas existentes, archivo, fijado, silencio y estado de no leído.
- Historial paginado, búsqueda de mensajes/multimedia, respuestas, edición/eliminación según permisos, reenvío, reacciones, emojis y Mensajes guardados. La memoria mantiene una ventana de 300 mensajes y hasta cuatro conversaciones; se puede seguir paginando.
- Stickers recientes, favoritos y packs; renderizado local de TGS animados y WebM, GIF guardados/búsqueda inline. La selección no envía hasta que se confirma.
- Fotos, vídeo, audio, notas de voz y documentos. Descargas con límites por tipo (hasta 128 MB para fotos/audio, 512 MB para vídeo y 32 MB para otros archivos); adjuntos elegidos para enviar limitados a 32 MB. No hay grabación ni envío de álbumes.
- Perfil propio (foto, nombre, biografía y username); contactos existentes de Telegram, altas/bajas y creación de grupos básicos con selección explícita. No importa la agenda Android.
- En grupos/canales con permiso: consultar miembros recientes, editar permisos predeterminados y restringir temporalmente miembros normales. No promueve administradores ni gestiona completamente baneos/roles.
- Facturas digitales Telegram Stars `XTR` de un solo pago, con revisión del producto/precio y doble confirmación. No admite tarjetas, otras monedas ni suscripciones.
- Mini Apps aisladas con solicitudes acotadas de escritura, teléfono, ubicación y portapapeles bajo consentimiento. DeviceStorage se mantiene local y aislado por cuenta/bot. Cámara y micrófono continúan denegados.
- Consulta historias activas; no crear, publicar ni editar historias. Notificaciones push aún no están configuradas en esta compilación.
- Notas locales cifradas por cuenta/chat y respuestas rápidas que **solo preparan borradores**, con permisos explícitos y revocables. WR IA permanece separada; la generación pública sigue deshabilitada.
- Ocho temas, Día/Noche, tamaño de texto, densidad, estado de escritura opcional y atajos de teclado físico.

No incluye llamadas de voz/video (falta motor VoIP), crear supergrupos/canales, importar la agenda, historias editables, gestión completa de administradores y baneos, pagos recurrentes/otras monedas ni todas las APIs Mini App. Sin pruebas con una cuenta y bots controlados, no se consideran validados los flujos beta09 de perfil, grupos, Stars y Mini Apps. La matriz de [paridad y pendientes](../../docs/client-parity.md) y el [registro beta09](../../docs/beta09.md) detallan límites. Conserva el cliente oficial para las funciones pendientes.

## Entrega y validación

La compilación release genera `.aab`, APK firmado y mapa R8 por versión en `artifacts/android/` (excluido de Git). **Generar el archivo no lo publica en Play Console**. Identificador: `cc.webrom.wrgram`; se conserva junto con la clave de subida. `android/version.properties` fija actualmente `0.5.0-beta09` (código 13), con [autodeclaración regional de edad](../../docs/age-access.md) previa a Telegram. El script compila primero `apps/mobile-ui` y copia únicamente su build en los assets locales.

El AAB `0.5.0-beta09` aparece en la pista cerrada `Prueba cerrada - Alpha 13`, con cambios de `Descripción` y la versión bajo comprobaciones de revisión. Esta sesión no pulsó enviar a revisión ni publicar. La ficha tiene icono, gráfico y cuatro capturas de teléfono. Verifica el [estado actual de Play](../../docs/android-play.md); el registro anterior de alpha04 es histórico.

Play indica un verificador inscrito de los 12 requeridos y 14 días de prueba cerrada antes de solicitar producción. Aún faltan pruebas reales con cuentas/bots controlados; no desinstalar ni borrar datos para actualizar una cuenta. En el primer arranque se requiere la autodeclaración de edad/residencia. Las pruebas sintéticas residen exclusivamente en `src/debug/` y `src/androidTest/`, no en release.

Para revisar la UI en el navegador: `pnpm --filter @wrgram/mobile-ui dev`, puerto 5174. `/` muestra la pantalla sin cuenta; `/?preview=1` y `/mobile-preview.html` muestran fixtures **solo en desarrollo**, rotulados como sintéticos. No pueden enviar mensajes y no se incluyen en el build Android. La vista pública `/app/` continúa siendo otra demo, no la sesión nativa.

Las pruebas reales de cuenta y mensajería corresponden al propietario, sin compartir códigos ni conversaciones con el agente. Antes de distribuir: completar [la lista de Play Console](../../docs/android-play.md). Alpha/beta son nombres de canal, no certificaciones de estabilidad.
