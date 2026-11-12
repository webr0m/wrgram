# Propuesta de actualización de privacidad · WRGram 0.5.0-beta01

**BORRADOR LOCAL PARA REVISIÓN DEL PROPIETARIO. NO PUBLICADO.** No sustituye la política pública actual, que sigue describiendo alpha04, y no es asesoramiento jurídico. No se cambiará la página, el formulario de Seguridad de los datos ni se enviará beta01 a revisión hasta verificar los datos pendientes marcados aquí.

URL pública vigente: https://wrgram.webrom.cc/android/privacy/ · Responsable/contacto ya aprobados: Rodrigo Olmos, Chile, ridrogo@gmail.com.

## Texto propuesto para el cambio de versión

### Alcance y cuentas

Beta01 mantiene el control de edad y residencia, la conexión de Telegram y las finalidades descritas en la política vigente. El inicio usa teléfono/código/2FA. Añade hasta tres sesiones locales de Telegram, cada una con base TDLib, archivos y clave de cifrado separados. La cuenta primaria conserva el almacenamiento existente de alpha04. Los slots y ciertos ajustes de cuenta se mantienen en preferencias privadas Android sin una capa adicional de cifrado propia. El cambio de cuenta no envía la clave, base, borradores ni conversaciones de una sesión a otra. Al cerrar sesión se solicita a Telegram revocar esa sesión; desinstalar no garantiza revocación.

### Chats y medios

Los chats cloud continúan alojados por Telegram y **no** tienen cifrado de extremo a extremo. Los chats secretos usan el protocolo E2EE de Telegram/TDLib en esa conversación; dependen también del dispositivo y aplicación de la otra persona. WRGram permite mostrar la huella para comparar, pero esta beta no implementa todos los mensajes temporales ni todas las funciones de secretos. Las huellas, mensajes y medios de secreto no deben incluirse en analytics de WRGram. Los medios de secretos y chats protegidos no se exportan mediante esta interfaz.

La beta recibe por Telegram miniaturas de fotos, documentos, vídeo, audio, stickers y vistas previas de enlaces disponibles para los chats que consulta. La interfaz puede descargar un medio pequeño en pantalla y permite pedir otras descargas; límites y formatos actuales están en la ficha técnica beta. Los archivos elegidos con el selector Android se copian a almacenamiento privado y, si el usuario confirma enviar, se mandan al chat de Telegram. Exportar crea una copia en el destino que elija el usuario.

### Seis apps propias y sus Mini Apps

WRGram incluye accesos a `@GroupButlerEsp_bot`, `@antiubot`, `@anycompressorbot`, `@WRShorten_bot`, `@mutidlprobot` y `@Wrsnakebot`. El catálogo y las fotos públicas de perfil están empaquetados localmente. Los servicios y sus backends siguen siendo remotos; no se compilan como seis servidores dentro de WRGram.

Solo después de que el usuario elige una app y confirma, el cliente consulta Telegram para resolver el bot y su Mini App principal o botón lateral configurado. La URL firmada de lanzamiento solo permanece en memoria y no cruza el puente general de la UI ni se guarda en logs/Intent. El host separado no expone chats, notas, códigos, contraseñas 2FA, token FCM ni rutas de archivos de TDLib. Aun así, la Mini App recibe los datos de lanzamiento que Telegram define (que pueden incluir identificador de usuario, nombre/username, idioma, contexto del chat/start y firma) y su servidor/hosting recibe la conexión, como mínimo IP y metadatos de red. Apps que no hayan configurado Mini App principal o botón de menú no abrirán desde la tarjeta; no se debe inventar un dominio.

El usuario puede elegir un archivo para subir desde el selector del sistema a la Mini App concreta; eso entrega el archivo al servidor remoto de esa app. El host inicial deniega cámara, micrófono y geolocalización, cancela solicitudes de teléfono y escritura del bot, no ofrece compras/invoices ni permite que una Mini App administre grupos automáticamente. Enlaces HTTPS externos se confirman antes de abrir. Descargas `blob:` y varias funciones del SDK de Telegram siguen sin soporte; la Mini App puede requerir su chat normal o Telegram oficial.

Las condiciones, retención, analytics, transferencias y compras reales de los seis backends deben revisarse por separado. Que sean del mismo desarrollador no demuestra que recojan los mismos datos o que no haya proveedores terceros. **Pendiente de confirmación del propietario por bot:** datos que recibe además del `initData`, archivos/URLs que conserva, países/proveedores, analítica, plazos de retención y funciones de pago/Premium.

### Canales y mensajes patrocinados

Para canales y bots, TDLib consulta contenido patrocinado de Telegram. WRGram etiqueta lo que el propio servicio identifica como patrocinado/recomendado y señala una vista cuando el mensaje completo estuvo visible; un click se comunica a Telegram después de que el usuario confirma abrir el enlace. El destino o anunciante puede tratar datos bajo sus propios términos. WRGram no incorpora un SDK de anuncios ni el identificador publicitario de Android. No confundir esta afirmación con «la app no muestra anuncios»: **revisar y actualizar** la declaración de anuncios y Seguridad de los datos de Play antes de envío. Nunca ocultar o quitar el patrocinio requerido por Telegram.

### Notificaciones push

En el AAB beta01 generado, la configuración de cliente FCM está **ausente/deshabilitada**; el permiso Android de notificaciones no produce una conexión si el usuario no activa el control y si Firebase/Telegram no se configuran. El código preparado para un build posterior requiere configuración de cliente Firebase, consentimiento y permiso Android, además de credenciales de entrega autorizadas para el API ID en Telegram. Si se configura/activa: Google Firebase recibe token/identificador del dispositivo y metadatos técnicos; WRGram registra en Telegram la suscripción cifrada para cada cuenta. Telegram/FCM envían payload cifrado; TDLib lo procesa mediante WorkManager y la notificación nativa es genérica, sin texto del mensaje en pantalla bloqueada. Desactivar intenta quitar registros en sesiones activas y elimina el token local; no garantiza borrar logs ya conservados por Google o Telegram. **No anunciar push disponible en esta beta sin completar configuración y una prueba real con app cerrada.**

### Tratamiento local, terceros y derechos

DOB/recibo de edad, preferencias y notas siguen locales; WR IA pública sigue deshabilitada y separada. Telegram trata cuentas, mensajes, archivos y metadatos de conexión según su política; Cloudflare/Gmail según las condiciones ya descritas en la política vigente; los servidores de cada Mini App según los datos pendientes arriba. No vender datos ni adjuntar historial de otros chats a Mini Apps o WR IA. Solicitudes de derechos/eliminación bajo control del responsable y retención de soporte de 90 días siguen sujetas al texto público vigente; esto no borra datos retenidos por Telegram, Google ni los servicios bot.

## Cambio que proponen las declaraciones Play · aún no aplicar al formulario

- Revisar «contiene anuncios»: Telegram sponsored messages ahora se consultan y muestran.
- Revisar tipos/transmisiones de datos originados en contenido remoto Mini App y selector de archivos; completar exactamente los seis servicios propios antes de declarar recepción, compartición y finalidades.
- Para el AAB actual, FCM permanece deshabilitado por `FCM_CONFIGURED=false`. Si se prepara y publica una compilación FCM activa, antes habrá que declarar instalación/dispositivo, finalidad de notificaciones, transferencia a Google/Telegram, cifrado, opción de activación y baja.
- Determinar con Google la clasificación de los Mini Apps y compras que cada bot pueda ofrecer. No declarar «sin compras» ni «sin anuncios» por la UI nativa sola.
- Mantener audiencia regional 13+, restricciones de edad de Telegram y la autodeclaración local descritas en alpha04; no ampliar ni restringir edades por este borrador sin completar la revisión de política de familias que corresponda.

## No autorizado / no realizado por esta propuesta

No se desplegó el borrador a Cloudflare, no se alteró la página pública, no se editó Play Data Safety/anuncios/IARC, no se inició la revisión ni se habilitó Firebase. Falta revisión y aprobación explícita del propietario del texto final y confirmación de las prácticas reales de sus seis servidores.
