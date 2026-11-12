# Propuesta local de privacidad · WRGram beta04

**BORRADOR PARA REVISIÓN DEL PROPIETARIO; NO PUBLICADO.** Complementa beta03. La política pública aún describe alpha04; no se actualizaron Play, Seguridad de los datos ni anuncios.

- **Login URL:** TDLib determina URL y dominio de destino. La app confirma el inicio; si la web solicita que el bot pueda escribir al usuario, WRGram pide ese permiso por separado. El sitio recibe el flujo de autorización de Telegram. No se envían credenciales de WRGram ni se almacena el acceso.
- **Callbacks con 2FA:** la contraseña solo se procesa en el diálogo nativo y se entrega a TDLib para validar una acción del bot. No se persiste ni se remite a un servidor WRGram. El callback lo recibe el bot correspondiente. Debe validarse el texto de consentimiento y la conducta de Telegram antes de publicar.
- **Inline mode:** la consulta y ubicación nula (no se solicita GPS) se envían a Telegram/TDLib para el bot y el chat actuales. WRGram guarda temporalmente los IDs de la consulta/resultados en memoria nativa; la interfaz solo obtiene una referencia opaca, etiqueta, descripción y media permitida. Al elegir, Telegram envía el resultado al chat. Al caducar o cambiar cuenta/chat se invalida la caché.
- **Juegos:** se envía callback a Telegram solo tras tocar el botón de un mensaje game; la URL devuelta se confirma antes de abrir.

Beta04 no añade pagos y no habilita botones de contacto/ubicación/encuestas/permisos de bot. Revisar estas finalidades y prácticas de los servicios antes de rellenar formularios públicos. Beta04 no se ha subido ni enviado a Play.
