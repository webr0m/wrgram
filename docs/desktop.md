# WRGram para escritorio (.NET)

Edición de escritorio experimental para Windows 10/11. Reutiliza la interfaz React de `apps/mobile-ui` dentro de WebView2 y conecta a Telegram con WTelegramClient (MTProto puro en .NET, sin procesos auxiliares).

Estado: **beta de escritorio** · versión `0.1.0-desktop2` · no publicada.

## Requisitos

| Uso | Necesitas |
| --- | --- |
| Ejecutar | Windows 10/11 x64 y [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (viene con Windows 11 y Edge actualizado). El `.exe` publicado es autocontenido: no hace falta instalar .NET |
| Compilar | .NET 8 SDK, Node.js 22 o superior y las dependencias del repositorio (`npm`/`pnpm`) |

La solución detecta el SDK local en `.tools\dotnet8\dotnet.exe`; si no existe, usa `dotnet` del `PATH`.

## Compilar y ejecutar

Doble clic en `WRGram-Desktop.cmd`, o desde PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desktop.ps1 -Task run
```

El script compila la interfaz React (`@wrgram/mobile-ui`), compila `apps/desktop/src/WRGram.Desktop` en Release y abre la aplicación.

Otras tareas:

```powershell
scripts\desktop.ps1 -Task check      # solo compila interfaz y aplicación
scripts\desktop.ps1 -Task publish    # genera artifacts\desktop\win-x64\WRGram.Desktop.exe
scripts\desktop.ps1 -Task configure  # guarda api_id/api_hash en %APPDATA%\WRGram\telegram.json
scripts\desktop.ps1 -Task data       # abre la carpeta de datos
```

## Publicar un único ejecutable

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desktop.ps1 -Task publish
```

Genera `artifacts\desktop\win-x64\WRGram.Desktop.exe` (unos 70 MB): es un ejecutable **autocontenido** de .NET 8 para win-x64, con la interfaz React y las credenciales de aplicación incrustadas. No necesita una carpeta `ui` ni instalar .NET; solo requiere WebView2 Runtime. En el primer arranque extrae la interfaz a `%LOCALAPPDATA%\WRGram\ui`.

## Credenciales de Telegram

WTelegramClient necesita un `api_id` y un `api_hash` de **aplicación**, creados en <https://my.telegram.org> (no son tu teléfono ni tu contraseña). No se escriben en el código fuente. Las compilaciones de escritorio incluyen los de `.private\desktop-telegram.json`, que el script genera desde `.env` sin imprimir sus valores.

Prioridad al arrancar:

1. Variables de entorno `WRGRAM_TELEGRAM_API_ID` y `WRGRAM_TELEGRAM_API_HASH`, o `TELEGRAM_API_ID` y `TELEGRAM_API_HASH`.
2. Archivo `%APPDATA%\WRGram\telegram.json` con `{"apiId":123456,"apiHash":"..."}`. La tarea `configure` lo crea con permisos solo para tu usuario y no muestra los valores.
3. Credenciales incrustadas en la compilación (solo si no hay ninguna de las anteriores).

Las credenciales de aplicación identifican al cliente, no a tu cuenta: sin tu teléfono y el código de Telegram no permiten entrar. Aun así, quedan dentro del `.exe` y pueden extraerse; distribúyelo solo de forma privada, no como descarga abierta. La aplicación nunca imprime sus valores.

El inicio de sesión (teléfono, código, contraseña de dos pasos o registro) se escribe **solo en la ventana de WRGram** y viaja directo a Telegram. No se guarda la contraseña.

## Datos locales

| Ruta | Contenido |
| --- | --- |
| `%APPDATA%\WRGram\session.dat` | Sesión MTProto de WTelegramClient |
| `%APPDATA%\WRGram\settings.json` | Apariencia y consentimiento |
| `%APPDATA%\WRGram\telegram.json` | Credenciales de aplicación (opcional) |
| `%APPDATA%\WRGram\media\` | Medios descargados |
| `%LOCALAPPDATA%\WRGram\ui\` | Interfaz extraída del ejecutable al arrancar |
| `%LOCALAPPDATA%\WRGram\WebView2\` | Perfil y caché del motor WebView2 |

La tarea `data` y el menú de la cuenta abren esa carpeta. Cerrar sesión desde la aplicación elimina la sesión y los datos asociados de la vista, no el archivo de credenciales.

`session.dat` **no se guarda en claro**: lo cifra WTelegramClient, como declara su propio README. Comprobado sobre el archivo real (28 696 bytes, 63 % de bytes no imprimibles y **cero** coincidencias de las marcas `WRGram`, `Windows`, `Telegram`, `phone`, `dc` o `session`, que aparecerían si el modelo MTProto se serializara en texto). Lo que WRGram **no** añade es una protección propia —ni DPAPI ni contraseña del usuario—: la aplicación vuelve a descifrar el archivo sola, así que quien controle tu sesión de Windows puede abrirla con el propio ejecutable. En Android la clave vive además bajo Android Keystore; aquí no. No dejes el equipo con la sesión iniciada ni copies la carpeta `%APPDATA%\WRGram`, y usa Cerrar sesión antes de prestar el equipo.

## Qué funciona en esta beta

- Inicio de sesión real: número, código, contraseña de dos pasos y registro con términos.
- Lista de conversaciones con carpetas existentes, no leídos, fijados, silenciados y archivados.
- Historial paginado, apertura de chat, mensajes guardados, marcar como leído, silenciar y borradores. Al abrir una conversación con mensajes sin leer se ancla en el primer no leído (ya no se salta al final ni se marca como leído al abrir); la flecha inferior y `history.newer` cargan los mensajes siguientes hasta el final, y solo entonces la interfaz envía `chat.read`.
- Envío de texto con formato (negrita, cursiva, subrayado, tachado, spoiler, código, cita y enlaces), respuestas, envío silencioso y programado.
- Indicador de escritura, copiar texto, propiedades del mensaje y exportación de medios.
- Fotos y documentos con descarga bajo demanda y miniaturas; apertura de enlaces externos en el navegador.
- Apariencia (tema, tipografía, tamaño, fondo), diagnóstico de medios y carpeta de datos.
- Persistencia local de sesión, apariencia y consentimiento.

## Qué no está disponible

La interfaz de escritorio oculta los controles que no tienen implementación real. Además, cualquier método no soportado responde con un error explícito `No disponible en escritorio (beta): …` en lugar de simular una acción.

- Acceso por QR, reenvío de código y recuperación de contraseña 2FA.
- Varias cuentas simultáneas.
- Envío de fotos, vídeos, stickers, voz, encuestas, contactos o ubicación.
- Carpetas: solo se muestran las existentes; no se crean ni editan.
- Notificaciones, contactos sincronizados, historias, llamadas, secretos, temas de foro, administración y Mini Apps.
- Actualizaciones automáticas, instalador firmado y ejecución en segundo plano.

## Verificación realizada

- Compilación de la interfaz React y de la aplicación .NET en Release: 0 errores y 0 advertencias.
- Publicación autocontenida de archivo único: `WRGram.Desktop.exe` (~70 MB) con la interfaz y las credenciales de aplicación incrustadas; se comprobó que ambos recursos están presentes y que las credenciales se leen correctamente, sin mostrarlas.
- Arranque real del `.exe` publicado en Windows con WebView2: se comprobó por captura que la ventana carga la interfaz, extrae la UI y muestra la pantalla de bienvenida/consentimiento sin errores de puente.
- El inicio de sesión y la navegación de conversaciones **no se pudieron probar con una cuenta real** en esta entrega: requieren tu teléfono/código o una sesión de Telegram existente. No se afirma que funcionen sin esa prueba.

## Estructura

```
apps/desktop/src/WRGram.Desktop/
  MainWindow.xaml(.cs)   host WPF + WebView2, shim del puente y servidor de medios
  DesktopBridge.cs       mensajes JSON entre la UI y C#
  TelegramService.cs     WTelegramClient: sesión, chats, historial, envío y medios
  DesktopState.cs        estado serializado que consume React
  DesktopStore.cs        rutas, credenciales y persistencia
  MediaRegistry.cs       descarga y registro estable de medios
apps/mobile-ui/          interfaz compartida con Android
scripts/desktop.ps1      compilación, ejecución, publicación y configuración
WRGram-Desktop.cmd       lanzador de un clic
```
