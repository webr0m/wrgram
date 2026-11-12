# WRGram 0.5.0-beta10 · artefacto local, no distribuido

La fuente está versionada como `0.5.0-beta10` / versionCode `14` y se generó el AAB/APK firmados localmente con la misma clave de subida que beta09. Play Console muestra ahora el AAB code14 adjunto a la preparación de una prueba cerrada; se guardaron como borradores las notas `es-419` y el texto de la ficha. **No se pulsó «Siguiente», «Enviar a revisión» ni se publicó la versión o la ficha.** La ficha en directo continúa siendo beta09/code13. Validación y hashes: [BETA10.md](../artifacts/android/BETA10.md).

## Añadido en el código local

- Recuperación de conexión al volver a primer plano, durante cambios de red y al reanudar desde `ConnectionStateWaitingForNetwork`; diagnóstico y botón de reintento.
- Miniaturas del cliente React con reintentos al reconectar, seguimiento de descargas TDLib ya activas y soporte de previews MPEG‑4 silenciadas. La vista de compatibilidad nativa también muestra fotos y miniaturas de mensajes.
- La interfaz moderna empaquetada se permite en Android System WebView/Chrome 100+ cuando AndroidX confirma `WEB_MESSAGE_LISTENER`; el fallback no usa un puente JavaScript inseguro.
- Ajustes de privacidad/edad/soporte permanecen en `ShellActivity`, sin saltar a `MainActivity` antigua.
- Crear supergrupos, foros y canales privados mediante TDLib; confirmar antes de crear y no invitar contactos automáticamente. Se puede crear y compartir un enlace de invitación con confirmación, limitado a siete días.
- Buscar la lista de usuarios baneados y quitar baneos; promover miembros y quitar roles de administrador solo con permisos delegables revisados por TDLib y confirmación. El registro de actividad administrativa y la transferencia de propiedad siguen fuera.
- Publicar una historia de **foto**: procesamiento local a 1080×1920, audiencia elegida y confirmación visible antes de `PostStory`; editar caption, borrar, guardar en el álbum local de historias `Archivo` y cambiar si permanece visible en el perfil al caducar cuando Telegram lo permite.
- Importación **puntual y opcional** de hasta 200 contactos Android con números en formato internacional. Solo tras tocar la opción se solicita `READ_CONTACTS`; la persona elige contactos y confirma su envío a Telegram. No se sincroniza continuamente ni se guarda una agenda en WRGram.

## Antes de distribuir

1. Probar con una cuenta y bots controlados: reconexión real, imágenes/miniaturas, creación de grupos/canales, administración, historias, permisos de agenda y demás acciones nuevas. El código no se ha probado en vivo con una cuenta Telegram durante esta tarea.
2. Revisar con el propietario la política pública y Seguridad de los datos: la importación de agenda transmite a Telegram los nombres/teléfonos seleccionados y publicar historias añade otro flujo de contenido. Declarar también los permisos Mini App ya existentes según su uso real. No usar las respuestas alpha04 automáticamente.
3. Añadir pruebas instrumentadas para la importación de contactos y permisos administrativos; volver a ejecutar la suite Android completa. La suite previa tenía un fallo de instrumentación (`Existing account key unavailable`) en el APK de pruebas.
4. Mantener como límites: sin motor de llamadas VoIP, sin publicación de historias de video/edición de áreas ni gestión completa de álbumes, sin transferencia de propiedad y sin todas las APIs Mini App. No afirmar paridad con Telegram.
5. Tras completar esas revisiones y reemplazar las capturas, decidir explícitamente si se autoriza enviar a revisión el borrador ya preparado; no requiere regenerar el AAB salvo que cambie el código o el propietario solicite otro build.

Borrador de divulgaciones para revisión del propietario: [privacy-beta10-draft.md](privacy-beta10-draft.md).

Los 12 verificadores durante 14 días son requisito para solicitar acceso a producción, no para compilar o preparar una beta cerrada.
