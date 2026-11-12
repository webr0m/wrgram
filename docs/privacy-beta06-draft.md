# Propuesta local de privacidad · WRGram beta06

**BORRADOR PARA REVISIÓN DEL PROPIETARIO; NO PUBLICADO.** Continúa beta05. No se modificó la política pública ni la declaración de Seguridad de los datos.

- **Switch-inline a otro chat:** al seleccionar expresamente un destino, WRGram consulta al bot inline de Telegram usando la consulta configurada por el botón. La consulta se solicita mediante TDLib y no envía por sí sola un mensaje al chat elegido. Al seleccionar un resultado, se envía ese contenido al chat de destino por Telegram y se abre la conversación. El usuario puede cancelar el selector o cerrar los resultados antes del envío.
- La lista disponible se limita a los tipos de chat que Telegram indica en el botón. El identificador del botón, la consulta, los IDs de consulta y los resultados se mantienen en el código nativo y usan tokens temporales para la UI.

La recopilación y la divulgación dependen de la consulta y del resultado que el usuario elija; verificar con bots controlados antes de publicar. Beta06/code10 está en borrador con notas `es-419`, no enviada a revisión.

- **Multimedia entrante:** fotos, miniaturas, audios y videos se descargan desde Telegram por TDLib al almacenamiento privado local de la cuenta para mostrarlos en WRGram. El reproductor lee el archivo local mediante un origen interno de WebView (incluye peticiones parciales para reproducción/búsqueda). No se envía la copia local a otros servicios. La descarga requiere una acción del usuario, salvo imágenes pequeñas visibles, y está limitada por tipo de archivo.
