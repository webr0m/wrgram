# WRGram 0.5.0-beta02 · candidato local

VersionCode 6; paquete `cc.webrom.wrgram` y certificado de subida de alpha04. Beta01 (código 5) permanece en Play como release ordinal 2, borrador de pista cerrada no enviado. Beta02 es un artefacto local distinto y no se ha subido. La política pública permanece en alpha04; propuesta beta02: `docs/privacy-beta02-draft.md`.

## Cambios de interfaz y acceso

- La comprobación regional se integra en el Shell React/Vite negro/dorado antes de mostrar la autenticación. Conserva la regla 18+ UE/Reino Unido/Australia, 13+ en otros países permitidos, aprobación de 30 días y pausa de 24 h para una declaración no elegible. DOB solo en memoria, limpiada al confirmar/ocultar el WebView; el recibo cifrado contiene país, resultado, instante y revisión de regla. No inicia TDLib antes de aprobar. AgeGateActivity queda solo como compatibilidad para WebView que no soporte el Shell.
- Inicio de sesión con QR de TDLib, opcional junto a teléfono/código/2FA. QR renderizado como PNG local; el URI temporal no se expone ni persiste. Requiere escanearlo desde un Telegram oficial ya autenticado; login QR real no probado.
- Miniaturas de perfil: minithumbnail local si no hay archivo pequeño; deduplicación de descargas concurrentes y fallback de iniciales cuando falla la foto. Se respetan los límites existentes de descarga.
- Timeout de operaciones UI ampliado a 25 s, con aviso de que Telegram podría seguir procesando tras expirar. No hay reintentos automáticos de mutaciones.

Las seis apps propias por defecto, Mini Apps por botón principal/menú Telegram, chats secretos básicos, canales/patrocinados y multicuenta conservan las limitaciones y pruebas de `docs/beta01.md`. Firebase/FCM sigue sin configurar. Las prácticas reales de los seis backends aún no están verificadas.

## Validación observada

- `pnpm check`: typechecks del workspace, **88 pruebas en 20 archivos**, build web y detección de secretos aprobados.
- `scripts/android.ps1 -Task release`: compilación Release con R8 y Lint completada; artefactos beta02 locales, sin subida a Play. Tamaños y hashes finales en `artifacts/android/BETA02.md`.
- Android 16, `emulator-5580` (WebView 133.0.6943.137), sin cuenta autenticada: **24 pruebas instrumentadas aprobadas**, incluidas pantalla React de edad, bloqueo sin TDLib, QR local, regresiones y exportación de capturas. Cinco capturas debug en `artifacts/beta02/screens/`; inspeccionadas, el gate aparece en el Shell nuevo.
- Bundletool validó el AAB; el verificador JAR leyó 138 payloads firmados y confirmó el mismo certificado que alpha04. APK verificado por apksigner (firma v2) y `zipalign -c -P 16 4` aprobado.

## No enviar todavía

No subir beta02 ni enviar beta01 hasta actualizar y aprobar la política pública y Seguridad de los datos para Mini Apps, anuncios/patrocinados, archivos y FCM; revisar las prácticas reales de los seis servicios; y preparar capturas/listado. Las pruebas sin autenticar no demuestran login QR, mensajería real, chats secretos entre dos dispositivos ni recepción push.
