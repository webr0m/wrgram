# WRGram para Android · política de privacidad

> **BORRADOR EDITORIAL HISTÓRICO, SUSTITUIDO; NO USAR COMO POLÍTICA VIGENTE.** El propietario aprobó el texto definitivo el 6 de noviembre de 2026. Está publicado en https://wrgram.webrom.cc/android/privacy/ y su URL quedó guardada en Play. Fuente canónica: `apps/web/public/android/privacy/index.html`. Los campos pendientes y propuestas siguientes se conservan solo como antecedente y no describen el estado actual. La publicación de la política no implica envío/aprobación de la prueba cerrada ni asesoramiento jurídico.

## 1. Responsable y contacto

- Responsable de WRGram: **Rodrigo Olmos**.
- País de establecimiento: **Chile**. **[PENDIENTE: otros datos del responsable solo si son legalmente exigibles; no se ha proporcionado domicilio.]**
- Contacto público para privacidad, derechos y soporte: **ridrogo@gmail.com**.
- Fecha de entrada en vigor: **[PENDIENTE: fecha de publicación aprobada]**.

WRGram es un cliente no oficial de Telegram. No está afiliado a Telegram ni es su aplicación oficial. La app no crea una cuenta propia de WRGram: permite acceder a una cuenta de Telegram.

## 2. Datos y finalidades

### Declaración regional de edad — nueva en alpha04

Antes de acceder a Telegram, se solicita tu país o territorio de residencia habitual y fecha de nacimiento para comprobar la edad mínima de producto: 18 años en la UE, Reino Unido y Australia, incluidos los territorios de la UE recogidos en la regla local, y 13 años en el resto donde esté permitido. Es una autodeclaración, no una prueba de identidad ni una auditoría de todas las normas de edad locales.

La fecha de nacimiento se procesa únicamente en memoria; no se guarda ni se envía. Solo se conservan cifrados el país declarado, el resultado apto/no apto, el instante de comprobación y la revisión de la regla. No se vinculan a la cuenta de Telegram. Se usa una clave propia de Android Keystore, separada de la sesión, y el registro se excluye de las copias de seguridad. No se consulta GPS, SIM, prefijo telefónico ni IP para determinar residencia. Los campos de fecha no se guardan en el estado de pantalla ni se ofrecen al autocompletado; se solicita al teclado no aprenderlos.

La aprobación caduca a los 30 días. Debes renovarla antes si cambia tu residencia desde Ajustes → Privacidad, licencias y soporte → Actualizar edad o residencia. Un resultado no apto bloquea reintentos durante 24 horas para evitar cambios inmediatos de datos; esperar ese plazo no elimina el requisito de edad. La nueva declaración sustituye el registro anterior. Un registro caducado puede permanecer cifrado hasta que lo sustituyas o borres los datos/desinstales la app, sin autorizar acceso. Borrar los datos también elimina el almacenamiento privado de la sesión, no los datos conservados por Telegram.

La pantalla de comprobación no hace conexiones de red. Cuando se requiere una nueva declaración, la app solicita pausar TDLib sin revocar la sesión remota ni borrar su base cifrada. Este control no impide descargar la app desde Play, utilizar versiones anteriores ni eludir una autodeclaración con datos falsos o un dispositivo manipulado. No se presenta como verificación documental ni como garantía de cumplimiento legal.

### Cuenta y mensajería de Telegram

La app conecta con Telegram mediante TDLib para iniciar sesión, sincronizar conversaciones y realizar las acciones que solicites. Se procesan el teléfono, código de acceso y contraseña de verificación en dos pasos cuando corresponda, los identificadores y datos de perfil que Telegram facilita, los chats, mensajes, archivos y metadatos necesarios para prestar el servicio. WRGram no registra los códigos ni la contraseña 2FA en sus logs de aplicación.

Los datos de mensajería se transmiten directamente a Telegram, no se retransmiten por el servidor de WRGram ni se entregan automáticamente a proveedores de IA. Telegram trata los datos conforme a su [política de privacidad](https://telegram.org/privacy). Los destinatarios de los mensajes y los integrantes de los grupos pueden recibir lo que compartas y conservar sus propias copias.

Los chats en la nube de Telegram **no tienen cifrado de extremo a extremo**. Esta alpha no implementa chats secretos.

### Archivos, stickers y GIF

Los archivos que selecciones mediante el selector del sistema se copian al almacenamiento privado de la app para preparar su envío; se envían a Telegram cuando confirmas. La recepción o descarga de multimedia también utiliza Telegram. Alpha03 permite seleccionar archivos de hasta 32 MB para enviar.

Las búsquedas de stickers se realizan mediante Telegram. Una búsqueda de GIF en línea transmite el término al bot de GIF configurado por Telegram. Los bots y servicios externos pueden tratar esos datos bajo sus propias condiciones; no escribas información sensible en las búsquedas.

Exportar un archivo crea una copia en la ubicación que elijas fuera del almacenamiento privado. Las exportaciones de contenido protegido se bloquean. Las copias ya exportadas no se eliminan al borrar los datos o desinstalar WRGram.

### Almacenamiento local y notas

La app guarda la sesión, la base de datos de TDLib, archivos descargados o importados, preferencias y borradores necesarios para su funcionamiento. La base local de TDLib se cifra y su clave se protege con Android Keystore. Las notas opcionales por cuenta/chat y las notas personales de WR IA se guardan cifradas en el dispositivo y no se adjuntan automáticamente a mensajes ni consultas de IA.

No se afirma que los archivos multimedia descargados o importados estén cifrados en reposo por TDLib. La app deshabilita las copias de seguridad de Android. La protección por hardware depende del dispositivo y no elimina los riesgos de un dispositivo comprometido o una sesión desbloqueada.

### WR IA, independiente de Telegram

La app puede consultar por HTTPS el estado del servicio de WRGram en `wrgram.webrom.cc`. Esa conexión permite a la infraestructura recibir datos técnicos de red, como la dirección IP y los metadatos de la solicitud, aunque no incluya una instrucción de IA.

La generación pública está **deshabilitada en esta alpha**: no se anuncia como función operativa. Si posteriormente se habilita, la implementación exige disponibilidad del servicio, consentimiento explícito y que pulses Consultar. En ese caso, tu instrucción y un historial acotado de la conversación de IA se transmiten al servidor de WRGram y al proveedor Groq. No se adjuntan chats, credenciales ni notas de Telegram ni notas personales de WR IA. El texto que escribas manualmente sí formaría parte de la consulta: no incluyas información sensible.

El historial de conversación de IA se mantiene en memoria; las notas personales que guardes son locales. Revocar el consentimiento vacía ese historial local y detiene nuevas consultas desde la interfaz, pero no borra datos que ya se hubieran transmitido a un proveedor. No hay cambio automático de proveedor. Antes de habilitar generación deberán revisarse la política, Seguridad de los datos y las condiciones y retención de Groq.

## 3. Permisos, publicidad y complementos

La app solicita acceso a Internet y al estado de la conexión. Pide cámara y micrófono solo al grabar una nota de voz o un videomensaje, o cuando una Mini App los solicita y el usuario los confirma en un diálogo nativo de esa sesión; la ubicación solo se consulta al compartirla. La agenda se lee únicamente si activas la importación o sincronización. Los archivos se eligen mediante los selectores del sistema, sin acceso general a todo el almacenamiento. El control de edad de alpha04 no añade permisos.

La app no incorpora SDK de analítica ni publicidad propia, no utiliza un ID publicitario y no carga tu agenda. Esto no impide que un usuario o bot publique contenido comercial en una conversación de Telegram.

La pantalla de complementos/Premium es una propuesta de diseño: no descarga código de terceros, no concede acceso automático a conversaciones y no activa compras, cobros ni suscripciones.

## 4. Destinatarios e infraestructura

- **Telegram**: autenticación, sincronización, mensajería, archivos y operaciones solicitadas.
- **Destinatarios y bots**: reciben los contenidos o términos que decidas enviar o consultar.
- **Infraestructura de WRGram/Cloudflare**: atiende las conexiones al servicio HTTPS de WR IA. El código público no guarda un historial de consultas en una base de datos; esto no equivale a ausencia de todo tratamiento o registro de infraestructura.
- **Groq**: proveedor previsto únicamente para consultas expresamente autorizadas si se habilita la generación; actualmente deshabilitada en el despliegue público.
- **Soporte**: si contactas voluntariamente, el responsable y el canal elegido reciben lo que envíes. No envíes códigos, contraseñas ni conversaciones privadas.

No se vende información ni se usa para publicidad personalizada desde WRGram. Los servicios externos pueden operar fuera de tu país. **[PENDIENTE: confirmar relaciones con proveedores, transferencias y garantías legalmente aplicables; no afirmar residencia local de datos.]**

## 5. Conservación y eliminación

Los datos locales permanecen según el uso de la sesión y la gestión de caché de TDLib; no se promete borrado automático en un plazo fijo. Puedes borrar notas desde sus pantallas. Borrar los datos de la aplicación o desinstalarla elimina su almacenamiento privado, pero no los archivos exportados ni los datos conservados por Telegram, destinatarios u otros servicios.

Cerrar sesión solicita a Telegram revocar la autorización de esta app; si no se confirma, revócala desde Dispositivos en Telegram oficial. Desinstalar por sí solo no garantiza revocar la sesión remota. Cerrar sesión tampoco equivale a eliminar la cuenta de Telegram ni se presenta como un botón para borrar todos los datos locales de WRGram.

WRGram no ofrece eliminación de la cuenta de Telegram. Para eliminarla o administrar los datos alojados por Telegram, utiliza sus herramientas oficiales y consulta su política. Borrar un mensaje o una cuenta no permite garantizar la eliminación de copias que otras personas hayan conservado.

Los correos de soporte se eliminarán del buzón y de las copias bajo control del responsable dentro de los 90 días siguientes a la resolución de la consulta, salvo que deban conservarse para cumplir obligaciones legales o atender reclamaciones pendientes. El responsable aceptó aplicar este procedimiento; no se ha configurado un borrado automático en Gmail. El proveedor de correo puede mantener registros o copias conforme a sus propias condiciones.

**[PENDIENTE antes de publicar: verificar cualquier registro técnico de alojamiento y las condiciones de conservación y eliminación de los proveedores. No se ha verificado un plazo contractual de Cloudflare/Groq ni de copias del proveedor de correo fuera del control del responsable.]**

## 6. Derechos, edad y cambios

Para consultar el tratamiento bajo responsabilidad de WRGram o ejercer los derechos que reconozca la legislación aplicable, utiliza el contacto público del apartado 1. El responsable no puede acceder ni borrar desde su servidor las conversaciones que están en Telegram. Nunca se solicitarán códigos de acceso o contraseñas para atender una petición.

**[PENDIENTE: concretar bases jurídicas, derechos, autoridad de reclamación y procedimiento según país del responsable y mercados de distribución.]** La conexión necesaria para la mensajería y el consentimiento opcional de IA no deben confundirse con una única aceptación genérica para todo tratamiento.

El responsable ha confirmado como público previsto adolescentes de **13–15 y 16–17 años**, además de adultos, únicamente donde las condiciones del servicio y la normativa aplicable lo permitan. No se dirige a menores de 13 años. Los [términos de Telegram](https://telegram.org/tos), consultados durante esta preparación, exigen tener al menos 18 años para registrarse en los países de la Unión Europea, Reino Unido y Australia. El responsable solicita respetar esas restricciones regionales y mantener las franjas adolescentes en el resto, sin excluir países de distribución ni imponer automáticamente una audiencia adulta mundial.

Alpha04 interna incorpora el control local descrito en el apartado 2; no verifica identidad ni residencia real. Alpha03 no lo incorporaba. **[PENDIENTE: validación con la cuenta/dispositivo del propietario y distribución cerrada de alpha04, evaluación jurídica de menores y normas regionales, y coherencia de Seguridad de los datos. No se han declarado aún las franjas en Play.]**

Las modificaciones de esta política se publicarán con una nueva fecha de entrada en vigor. Los cambios materiales de funciones o tratamiento requerirán revisar también los avisos de la app y las declaraciones de Google Play.

## Lista editorial de aprobación — retirar antes de publicar

1. Identidad, país y correo público confirmados expresamente por el propietario: Rodrigo Olmos, Chile, ridrogo@gmail.com. Completar los campos PENDIENTE restantes, incluida conservación; estos datos no implican aprobación del resto del borrador ni autorización para publicar otros datos personales.
2. Confirmar público objetivo, base jurídica y requisitos de eliminación de cuentas de Play. La autenticación de Telegram no justifica marcar automáticamente «no recoge datos».
3. Confirmar las condiciones de infraestructura, soporte y transferencias internacionales.
4. Publicar HTML accesible por HTTPS, sin autenticación ni geobloqueo, en una URL dedicada aprobada; comprobar acceso público antes de registrarla en Play.
5. Mantener coherencia con la versión que se distribuya, el aviso dentro de la app y Seguridad de los datos. Alpha04 requiere AAB código 4: no modificar ni sustituir el archivo firmado código 3 ya publicado. No publicar esta política como si alpha03 incluyera el control nuevo.
