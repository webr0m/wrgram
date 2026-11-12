# Propuesta local de privacidad · WRGram beta09

**Borrador para revisión del propietario; no publicado ni aprobado como política vigente.** El resumen de Play actualmente muestra `Descripción` y `Prueba cerrada - Alpha 13` en comprobaciones de revisión; esta propuesta no se ha enviado como sustitución de la política pública.

- El usuario elige una imagen y ve una previsualización antes de cambiar o eliminar la foto propia en Telegram. WRGram genera un JPEG recortado en el almacenamiento privado de la cuenta; no conserva la imagen de origen ni la envía a servidores WRGram.
- Contactos y miembros vienen de TDLib/Telegram. Buscar usa los contactos de la cuenta, sin importar la agenda Android. Agregar o quitar contactos, crear un grupo y restringir a una persona requieren acción explícita; agregar contacto no comparte el número.
- Los permisos predeterminados afectan miembros no administradores. Las acciones requieren el permiso `canRestrictMembers` que devuelve TDLib. No se conceden roles automáticamente.
- Un pago solo se inicia desde una factura `XTR`. WRGram muestra producto, vendedor y Stars, y requiere confirmación en la interfaz y en un diálogo nativo de Android; TDLib confirma la factura y procesa el cargo. No se manejan credenciales de tarjeta ni suscripciones.
- Los stickers TGS se descargan desde TDLib y se descomprimen/renderizan localmente, con límites de tamaño y bloqueo de assets externos.
- DeviceStorage de Mini Apps se guarda localmente en preferencias privadas separadas por cuenta y bot, con cuota de 5 MB; no se sincroniza con los servidores de WRGram ni se usa para secretos (SecureStorage sigue fuera).
- Una Mini App debe confirmar antes de recibir permiso de escritura del bot, enviar el teléfono como contacto al chat de Telegram o compartir su ubicación con el sitio. La ubicación requiere consentimiento local por bot y permiso Android; la coordenada se entrega a la página de esa Mini App y puede ser recibida por sus servidores. El clipboard requiere que el bot esté añadido al attachment menu, interacción reciente y confirmación con vista previa; solo los primeros 4096 caracteres se comparten. No se conceden permisos de cámara/micrófono.

Beta09/code13 aparece en la prueba cerrada y en comprobaciones de revisión de Play Console. Las notas `es-419` están guardadas y se editó la ficha. Revisar estas divulgaciones y Seguridad de los datos con el propietario antes de publicar; no asumir que la política pública ya se actualizó.
