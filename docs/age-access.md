# Control regional de edad · Android

## Regla implementada

- Público previsto autorizado: 13–15, 16–17 y adultos, donde esté permitido. Menores de 13 no acceden.
- 18+ en los 27 países de la UE, Reino Unido y Australia, según los [términos de Telegram](https://telegram.org/tos) consultados el 6 de noviembre de 2026. Se aplica conservadoramente al acceso de WRGram, aunque el texto de Telegram se refiere al registro.
- También 18+ para los códigos ISO de Åland, Guayana Francesa, Guadalupe, Martinica, Reunión, Mayotte y San Martín francés; los demás territorios ultraperiféricos de la UE ya quedan bajo los códigos de España/Portugal.
- El umbral 13 del resto es el mínimo de producto solicitado, **no una certificación de que todas las leyes locales permitan ese uso**. Falta una evaluación jurídica de los mercados pertinentes. La lista es local y versionada, no se actualiza desde un servidor.
- País desconocido/no seleccionado o fecha inválida: no se concede acceso. No se infiere la residencia por idioma, teléfono, SIM, GPS ni IP.

## Mecanismo y datos

Pantalla nativa previa a React, TDLib y WR IA, tanto en el lanzador como en el acceso nativo alternativo. Solicita país/territorio de residencia y fecha de nacimiento en campos vacíos, sin un valor de edad preseleccionado. Permite revisar/corregir antes de confirmar. Los campos no admiten guardado del estado ni autocompletado de Android y solicitan al teclado no aprender los datos; un teclado de terceros sigue fuera del control de la app.

La fecha se usa en memoria para calcular el resultado y no se guarda ni se envía. Solo se persisten cuatro campos: país, resultado apto/no apto, instante de comprobación y revisión de la regla. No hay identificador Telegram, edad exacta, fecha de nacimiento ni telemetría de esta declaración. Registro AES-GCM con clave independiente en Android Keystore, dentro de `noBackupFilesDir`; no cambia la clave ni los datos de sesión existentes. El registro anterior se sustituye al confirmar una nueva declaración y se elimina al borrar datos/desinstalar; un registro caducado puede permanecer cifrado hasta entonces, sin autorizar el acceso.

Una aprobación dura 30 días. Debe actualizarse antes si cambia la residencia: React → Ajustes → Privacidad, licencias y soporte → Actualizar edad o residencia; la misma opción existe en el cliente nativo. Se invalida la aprobación antes de volver al formulario. Un resultado no apto se conserva y bloquea reintentos durante 24 horas, incluso al recrear la pantalla o reiniciar el proceso; no permite cambiar de país inmediatamente para evadirlo. El bloqueo de 24 horas no convierte al usuario en apto ni elimina el umbral. Un reloj atrasado no concede acceso por un recibo futuro y no desbloquea una denegación actual. No se dispone de hora de servidor confiable.

Para nacidos el 29 de febrero se usa conservadoramente el 1 de marzo en el aniversario no bisiesto. Fechas futuras, mayores de 120 años o inexistentes no son válidas.

## Actualización desde alpha03

La ausencia de recibo siempre exige declaración nueva, aunque exista consentimiento de Telegram, base cifrada o sesión previa. No se migran esos consentimientos a una declaración de edad. No se borra ni revoca la sesión remota para hacerlo: cuando corresponde pausar un cliente ya iniciado se solicita `TdApi.Close`, **no `LogOut`**, y se espera el estado cerrado antes de reutilizarlo. El consentimiento previo de transporte se conserva en esa pausa; no equivale a aprobación de edad.

Se comprueba la aprobación al entrar/reanudar, al caducar mientras la pantalla está abierta, en los comandos del puente, en las respuestas multimedia y antes de iniciar/enviar solicitudes TDLib. Un temporizador de proceso solicita cerrar TDLib al caducar también si la UI quedó en segundo plano; la entrega de temporizadores depende del sistema operativo. No se reenvían operaciones fallidas ni inciertas. El proceso no inspecciona mensajes para evaluar la edad.

## Límites que no deben ocultarse

- Es **autodeclaración**, no verificación documental, prueba de identidad, comprobación real de residencia ni estimación de edad de Google.
- Quien declare información falsa, manipule el dispositivo/almacenamiento/reloj o reinstale puede eludir una barrera local. No se promete resistencia frente a un dispositivo comprometido.
- Bloquea el acceso dentro de esta versión, no la descarga de Play, otras apps de Telegram ni una alpha anterior ya instalada. La disponibilidad y clasificación de Play son controles distintos.
- No sustituye las obligaciones de protección de menores, moderación, consentimiento parental donde proceda, retención, derechos ni revisión de Seguridad de los datos. No se marca una declaración como completa sin esos requisitos.
- El mecanismo se introdujo en alpha04 y continúa en beta09. El estado de distribución de alpha04 descrito en versiones anteriores de este documento es histórico; el AAB beta09/code13 aparece ahora en la pista cerrada con comprobaciones de revisión. Consultar [estado actual de Play](android-play.md). Todos los países permanecen seleccionados en la configuración registrada; esta autodeclaración local no filtra descargas de Google Play.
