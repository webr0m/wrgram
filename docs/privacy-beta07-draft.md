# Propuesta local de privacidad · WRGram beta07

**BORRADOR PARA REVISIÓN DEL PROPIETARIO; NO PUBLICADO.** Beta07 añade selectores para solicitudes explícitas de usuarios y chats de bots.

- Al elegir personas para una solicitud `request_users`, WRGram muestra los usuarios seleccionados y pide confirmación; al continuar, TDLib los comparte con el bot. Solo comparte los campos pedidos por el botón.
- Al elegir un chat para `request_chat`, WRGram muestra el chat de destino y pide confirmación antes de compartirlo con el bot mediante TDLib.
- Las solicitudes que requieren agregar un bot a grupos o cambiar permisos administrativos no se ejecutan automáticamente; WRGram las rechaza en esta tanda.

Beta07/code11 está cargada como borrador con notas `es-419`; no se envió a revisión. Beta06/code10 se preserva. Revisar estas divulgaciones antes de cualquier publicación.
