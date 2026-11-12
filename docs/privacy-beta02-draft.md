# Propuesta de extensión de privacidad · WRGram 0.5.0-beta02

**BORRADOR LOCAL PARA REVISIÓN DEL PROPIETARIO. NO PUBLICADO.** Es una adición a `docs/privacy-beta01-draft.md`, no sustituye la política pública (que aún describe alpha04) ni completa por sí sola Seguridad de los datos, la declaración de anuncios o IARC. No enviar a revisión antes de validar las prácticas de los servicios remotos y aprobar el texto final.

## Comprobación de edad en el Shell nuevo

La autodeclaración de residencia/fecha de nacimiento se muestra en la interfaz React empaquetada antes de iniciar TDLib. La fecha se procesa localmente en la app, solo en memoria; no se almacena ni se envía por red a Telegram, a servidores WRGram o a terceros. Se borra de los campos de UI al confirmar y cuando el WebView se oculta. Si la declaración es admisible, la app persiste en Android Keystore un recibo cifrado con país, resultado, instante y revisión de regla; no incluye fecha, edad ni identificador de cuenta. La regla regional y los plazos deben coincidir con la versión legal vigente antes de publicar.

## Login QR de Telegram

El usuario puede pedir a TDLib un QR temporal para vincular esta instalación desde un cliente Telegram oficial ya autenticado. TDLib genera el URI/token de autenticación; WRGram lo procesa localmente para mostrar un PNG y no lo guarda como URL, archivo o preferencia ni lo envía a un servicio externo de QR. El token se entrega a Telegram por el flujo oficial de TDLib y está sujeto a los controles/sesiones de Telegram. La captura de pantalla de la aplicación está protegida por FLAG_SECURE. No se ha probado este flujo con una cuenta real; verificar caducidad y cancelación antes de afirmar disponibilidad.

## Cambios restantes que siguen pendientes

El gate y el QR no eliminan las divulgaciones de la propuesta beta01: hasta tres almacenes de cuenta locales separados, archivos seleccionados/exportados por el usuario, miniaturas solicitadas a Telegram, contenido patrocinado y conexiones a Mini Apps remotas. Las Mini Apps reciben datos de lanzamiento de Telegram y la app remota recibe datos de conexión; todavía faltan las prácticas exactas de cada uno de los seis servicios. FCM está deshabilitado en esta compilación; si se configura en una versión posterior, declarar transferencia de tokens/metadatos a Firebase y Telegram. Revisar la declaración «contiene anuncios» por mensajes patrocinados de Telegram y el posible contenido/compras de los servicios.

La política web actual no ha cambiado, beta02 no se ha subido y no se inició ninguna revisión en Play. Requiere aprobación explícita del responsable después de cotejar el AAB final, las declaraciones de Play y la conducta real de los servidores.
