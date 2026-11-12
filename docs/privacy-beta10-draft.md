# Propuesta local de privacidad · siguiente beta

**Borrador técnico, no aprobado ni publicado.** La versión `0.5.0-beta10`/code14 y su AAB/APK están generados y firmados localmente. Play Console muestra el AAB adjunto a una preparación de prueba cerrada; no se avanzó ni se envió a revisión. La política pública y Seguridad de los datos no se han actualizado. El propietario debe revisar y aprobar cualquier cambio antes de distribuirlos.

## Flujos nuevos en el código local

- **Importación puntual de agenda:** solo empieza cuando la persona toca «Importar desde la agenda de Android». Android solicita `READ_CONTACTS`; WRGram muestra hasta 200 nombres/números en formato internacional. La persona selecciona los contactos y confirma una segunda vez. Solo esa selección se transmite a Telegram mediante TDLib. No se manda al servidor de WRGram, no se conserva una copia local y no se sincroniza continuamente. Si se niega el permiso o cancela cualquiera de los pasos, no se importa nada.
- **Crear supergrupos, foros y canales privados:** el usuario introduce el nombre y confirma la creación; no se agregan miembros ni se publica contenido automáticamente. La creación se solicita a Telegram por TDLib.
- **Enlaces de invitación:** solo tras confirmación, TDLib crea un enlace de grupo/canal con caducidad de siete días. Abrir el selector Android para compartirlo es una acción separada del usuario. Quien reciba el enlace puede reenviarlo durante su vigencia.
- **Administración:** consultar baneos, quitar un baneo, promover o demover administradores requiere el permiso que TDLib comunica y confirmación antes de cambiar el estado en Telegram. Los permisos de un administrador se limitan a un subconjunto que su cuenta puede delegar.
- **Historias de foto:** WRGram normaliza localmente la imagen elegida a JPEG 1080×1920. Solo al tocar «Publicar historia» envía la foto, caption y audiencia elegida a Telegram mediante TDLib. Se admite audiencia Todos, Contactos o Mejores amigos y un periodo activo de 24 horas. La foto temporal se elimina del directorio privado de WRGram al terminar la operación. No se sube a servidores de WRGram. Editar caption, eliminar y mantenerla visible en el perfil después de caducar requieren acciones posteriores explícitas. No se admiten historias de video en este candidato.

## Revisión pendiente

- Confirmar con el propietario los fines y destinatarios de importar contactos, crear enlaces y publicar historias, y reflejarlos en la política pública y la declaración de Seguridad de los datos.
- Probar con una cuenta propia/controlada y contactos de prueba; no usar agendas reales o publicar historias durante pruebas sin autorización expresa.
- Verificar cómo Telegram aplica privacidad, caducidad y permisos a cada historia/enlace; WRGram no controla la conservación que Telegram aplique.
- Estos textos describen comportamiento de código, no son asesoramiento legal ni una garantía de aprobación de Google Play.
