# WRGram 0.5.0-beta03 · candidato local

Versión de trabajo `0.5.0-beta03`, versionCode 7. Paquete `cc.webrom.wrgram`, certificado igual al de alpha04. Beta02 (`0.5.0-beta02`, code 6) ya aparece cargada en el borrador de la pista cerrada de Play; conservar ese AAB y notas. No subir ni enviar beta03 sin permiso adicional. Nueva propuesta local de privacidad en `docs/privacy-beta03-draft.md`.

## Alcance implementado en esta tanda

- Avatares y miniaturas: reparación de sincronización de `TdApi.File`, carga visible tras `UpdateFile`, actualización tras resultado de descarga y corrección del stacking CSS que ocultaba las miniaturas bajo el fondo.
- Teclados de bots: representación de teclados inline debajo del mensaje y teclado de respuesta activo bajo el compositor. Soporta callback, enlace, Web App, copiar texto y abrir usuario. El puente manda solo `messageId`, fila, columna y fuente; TDLib resuelve el botón real.
- Mini Apps: apertura de Web Apps inline con `OpenWebApp`; menú mediante `BotInfo.menuButton` del perfil completo del bot (en vez de consultar el usuario de la sesión con `GetMenuButton`); keyboard Web App mediante `GetWebAppUrl`. Lanzamientos de TDLib se cierran con `CloseWebApp`; URLs siguen validadas por el host aislado.
- `Telegram.WebApp.sendData` desde un reply-keyboard pide confirmación visible antes de enviar a TDLib. No hay envío remoto silencioso.
- Se preservan botones con permisos o flujos no soportados como visibles pero deshabilitados.

## Investigación TGX

Patrones comparados, funciones no cubiertas y límites deliberados en `docs/tgx-gap-audit.md`. No se copió código GPL; esta tanda no representa paridad total.

## Validación

- `pnpm check`: typechecks del workspace, **91 pruebas en 20 archivos**, build web y comprobación de secretos aprobados.
- `scripts/android.ps1 -Task release`: release R8/Lint aprobado. Bundletool validó AAB, verificador JAR leyó 138 payloads sin duplicados/no firmados y confirmó certificado de alpha04. APK verificado con apksigner v2 y `zipalign -c -P 16 4`.
- Android 16, emulator-5580/WebView 133, sin cuenta real: **26 pruebas instrumentadas aprobadas**. Se generaron y revisaron cinco capturas de debug; la UI regional y el catálogo siguen renderizando correctamente.
- Tamaños y hashes en `artifacts/android/BETA03.md`. AAB local solamente; **no se subió a Play**. Login real QR, descargas de chats autenticados, botones de bots de un servidor real y Mini Apps de los seis bots todavía requieren validación con una cuenta/dispositivos de prueba controlados por el propietario.
