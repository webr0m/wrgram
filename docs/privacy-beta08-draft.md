# Propuesta local de privacidad · WRGram beta08

**Borrador para revisar; no publicado ni enviado a Google Play.**

- El menú de perfil lee de TDLib el nombre, username y biografía de la propia cuenta. Solo al guardar se envía a Telegram el cambio de nombre, bio o username elegido por la persona. El username es público; la interfaz lo advierte antes de cambiarlo.
- La consulta de sesiones obtiene de Telegram nombres de dispositivos, ubicación/IP y actividad. Esos datos se presentan en el dispositivo; al cerrar una sesión remota se envía la revocación explícita a Telegram.
- Las fotos/miniaturas se cargan mediante TDLib para el contenido visible. WRGram no las envía a sus propios servidores. Las descargas quedan dentro del almacenamiento privado de la cuenta.
- Al elegir ver una historia, WRGram la solicita a TDLib y notifica apertura/cierre; al abrirla Telegram puede registrar que se vio. El contenido no se exporta.
- Las actualizaciones in-app se consultan mediante Play Core con Google Play. Google Play determina elegibilidad y distribución; los borradores no se instalan como actualizaciones.

Este documento es una propuesta histórica para beta08/code12; su estado de Play fue sustituido por beta09/code13, que figura en comprobaciones de revisión. No usar este texto como divulgación vigente. Las declaraciones requieren aprobación del propietario y revisión de privacidad/Seguridad de los datos antes de publicar.
