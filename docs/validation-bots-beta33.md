# Comandos y Mini Apps · beta33 · 22 de noviembre de 2026

## Cambios

- Comandos publicados por Telegram en chats privados y grupos, con descripciones, filtro por prefijo y atribución al bot. La selección inserta un borrador; no envía mensajes automáticamente.
- Botón de menú personalizado o Mini App principal en Android. Se conserva la identidad del bot y la sesión de lanzamiento del navegador interno.
- Las entidades automáticas de comando se usan en el editor y se excluyen del formato manual enviado a TDLib.
- Corregida la firma de segmentos del editor que provocaba repintados repetidos al combinar formato y comandos.
- Corregido el snapshot nativo: ahora declara `platform: android`. Antes ocultaba botones Mini App y opciones de fondos de Telegram al heredar `web`.
- Los enlaces externos se conservan durante el arranque hasta que estén listos TDLib, el desbloqueo y la interfaz. Se despachan al cargar la interfaz o recibir autorización lista.

## Validación

- Compilación oficial de Windows .NET 8: correcta, cero errores y advertencias de compilación. Ejecutable autocontenido en `artifacts/desktop/win-x64/WRGram.Desktop.exe`, sin firma Authenticode. Mini Apps del compositor siguen limitadas a Android; Windows incorpora comandos.
- Release oficial Android: salida 0, 2.639 pruebas Vitest en 162 archivos, 501 pruebas Java sin fallos, lintRelease, bundletool, alineación de 16 KB y verificación de firma correctos. Mismo certificado de subida que la versión anterior.
- Actualización real en `wrgram-test`, Android x86_64, con la cuenta ya autenticada; instalación con `adb install -r`, sin borrar datos ni desinstalar.
- Bot privado WRShorten: menú con comandos y descripciones; selección de `/acortar` insertada sin enviarse. El borrador de prueba se dejó vacío.
- Beta33: apertura desde enlace `tg://resolve` inmediatamente después de actualizar; abrió el bot tras el arranque, sin el aviso incorrecto de iniciar sesión observado en beta32.
- Beta33: botón **Webrom Links** visible junto a **Comandos**. Confirmación nativa y apertura de la Mini App real de WRShorten dentro de WRGram. Se vio el formulario «Acorta tu enlace»; no se creó ningún enlace ni se enviaron mensajes.
- Beta33: grupo real GB ULTRA Group; el panel mostró comandos como `/start@DirectoryTGApp`, su descripción y el nombre DirectoryTG. No se envió ningún comando al grupo.
- Evidencia local de la Mini App: `artifacts/WRGram-beta33-miniapp-real.png`.
- No se probó un teléfono físico ni la apertura de Mini Apps en Windows.

## Artefacto

- Android: `1.0.0-beta33`, código **61**.
- AAB: `artifacts/android/WRGram-1.0.0-beta33.aab`.
- SHA-256: `8b9c6d7cbbc87e0e13f20cd01499e13d7a1831b2b6f617d2e61ced983ddbb87c`.
- Beta32, código 60, se cargó durante la prueba y se quitó del borrador al encontrar el fallo de plataforma. No se envió a revisión.
- Google Play detecta una advertencia no bloqueante por ausencia de símbolos de depuración nativos. El archivo ReTrace está incluido.
- Estado de publicación: enviado a revisión de **Prueba cerrada - Alpha**, release 47. Play Console muestra «Cambios en la etapa de revisión» con la fila **61 (1.0.0-beta33)**; las verificaciones rápidas siguen en curso. La aprobación y distribución de beta33 todavía no están confirmadas.
- Evidencia del envío: `artifacts/android/WRGram-beta33-Alpha-revision.jpg`. La pestaña del resumen de publicación quedó abierta.
