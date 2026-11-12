# Seguridad: límites y siguientes pasos

## Esta demo no es un almacén seguro

- La alpha pública no recibe datos reales de Telegram, credenciales ni sesiones. La prueba de desarrollo local es independiente y solo se conecta bajo una acción explícita del propietario; usa sesión efímera en memoria. Ver [telegram.md](telegram.md).
- Notas y permisos locales sin cifrar. Las notas no se envían a un servidor, pero código del mismo origen, extensiones del navegador o quien use el mismo perfil podrían leerlas.
- Sin analítica, fuentes externas ni CDN de terceros en el frontend. WR IA, si se configura y autoriza, envía instrucciones propias a Groq o al servidor Ollama elegido; no recibe contenido de Telegram. La generación pública está deshabilitada por defecto.
- Los enlaces externos se abren con `rel="noreferrer"`.
- React representa el texto como texto, sin `dangerouslySetInnerHTML`, `eval` ni scripts de plugins.
- Las solicitudes de activar complementos enumeran los permisos y permiten cancelarlos.
- Datos persistidos inválidos se descartan; el runtime revalida los permisos contra el manifiesto.

Los permisos son una **frontera de diseño entre servicios propios**, no una defensa contra código no confiable ejecutándose en el mismo proceso. Una firma verifica procedencia/integridad, no demuestra que un complemento sea seguro.

## Bloqueo de la app (beta18)

- Activar, desactivar o entrar exige la autenticación del propio Android: huella o rostro con `BiometricPrompt` (biometría débil) y, como alternativa, el PIN, patrón o contraseña del dispositivo. En Android 9/10 se usa `setDeviceCredentialAllowed(true)`; si la biometría falla o no está disponible se abre `createConfirmDeviceCredentialIntent`.
- WRGram **nunca recibe ni guarda** el PIN, patrón, contraseña ni plantillas biométricas. Solo persiste `app_lock` (booleano) y `lock_after` (0/30/60/300 s) en `SharedPreferences`. El resultado de la verificación lo comunica el sistema; no se registra el secreto ni se envía al puente.
- El desbloqueo vive en estáticos del proceso y cubre la interfaz web, la nativa heredada y las Mini Apps. La muerte del proceso vuelve a bloquear; `MiniAppActivity` se cierra si el bloqueo está activo.
- El bloqueo protege la **interfaz**, no los datos en reposo: no cifra TDLib, notas, preferencias ni el WebView. No resiste un dispositivo con root, ADB o depuración, y no sustituye la contraseña de dos pasos ni el bloqueo de pantalla del sistema.
- La preferencia es local, no se sincroniza entre dispositivos y es común a todas las cuentas de la instalación. Si el propietario elimina la credencial del teléfono, el bloqueo se desactiva al siguiente arranque con un aviso.
- Pendiente antes de producción: probar huella/rostro en hardware real, Android 9/10, y decidir si se exige reautenticación al volver de segundo plano inmediatamente para cuentas múltiples.

## Mini Apps: permisos y estado emoji (beta19)

- La Mini App corre en `MiniAppActivity` sobre un origen validado por `MiniAppPolicy`; sin cookies, sin almacenamiento de formulario y sin el puente de la cuenta. Cada evento comprueba que la sesión, la cuenta y el origen sigan coincidiendo antes de actuar.
- **Estado emoji**: una Mini App no puede cambiar el estado por sí sola. Debe pedirlo con `web_app_request_emoji_status_access`, lo que muestra un diálogo nativo; solo si el usuario acepta se llama a `ToggleBotCanManageEmojiStatus` para ese bot. Después, `web_app_set_emoji_status` valida el identificador y la caducidad antes de `SetEmojiStatus`. La concesión se revoca al cerrar la Mini App y WRGram no guarda el estado elegido.
- **Permiso de escritura**: `web_app_check_write_access` consulta `CanBotSendMessages` y responde el estado real; solicitar el permiso requiere `web_app_request_write_access` y un diálogo nativo independiente. La concesión no se otorga al abrir la Mini App.
- **Área segura**: `web_app_request_safe_area` devuelve los inset del sistema que entrega la actividad nativa; el WebView no inventa valores cuando el sistema no los proporciona.
- Los eventos que este binding de TDLib no admite se responden como no disponibles; no se simula un éxito que Telegram no haya confirmado.

## Amenazas a resolver antes de conectar cuentas reales

1. **Robo de sesión / XSS:** CSP estricta, sin scripts remotos innecesarios, auditoría de dependencias, sesiones aisladas y logs redactados. Cifrar IndexedDB por sí solo no evita que un XSS lea claves mientras la app está desbloqueada. En el modo TDLib, la cookie es `HttpOnly`, `SameSite=Strict` y `Secure` en producción; aun así, un XSS podría realizar acciones en nombre de la sesión, así que CSP y revisión de dependencias siguen siendo obligatorias.
2. **Cruce de cuentas:** claves compuestas por cuenta/chat para notas, borradores, caché y concesiones. Los identificadores locales actuales solo sirven para la demo.
3. **Filtrado de contenido por complementos:** capacidades por recurso, payload mínimo, salida de red explícita y trazabilidad. No pasar al plugin el objeto de sesión ni el cliente MTProto completo.
4. **Código externo:** no cargarlo hasta definir aislamiento real, mensajería entre contextos, validación de esquemas y controles de recursos. Evaluar restricciones de ejecución remota en iOS.
5. **Tokens de bots propios:** backend/secret manager, no variables `VITE_*` ni bundles públicos. Un bot ajeno no requiere su token para conversar con él.
6. **Pérdida de notas:** persistencia con errores visibles, exportación, migraciones y política de recuperación. Revocación de permiso y borrado son operaciones diferentes.
7. **Acciones involuntarias / abuso:** confirmación, límites, cancelación y manejo de `FLOOD_WAIT`; nunca autoenviar por un permiso de borrador.
8. **Registros:** no registrar contraseñas, códigos, `api_hash`, claves de sesión ni cuerpos de mensajes. No enviar informes automáticos que incluyan contexto privado. En el backend TDLib se redactan cookies y `Authorization`, se desactiva la verbosidad de TDLib y no se habilita `DEBUG=tdl:*` en producción.
9. **Multimedia / enlaces / Mini Apps:** validación de tipos, límites, esquemas permitidos y aislamiento antes de habilitarlos.
10. **Sincronización de preferencias entre pestañas/dispositivos:** todavía no existe. Las concesiones son de una pestaña; antes de producción, sincronizar revocación y conflictos.

## Servicios propios

La API de desarrollo escucha en `127.0.0.1`, tiene límite de cuerpo de 192 KiB y publica catálogo/salud/WR IA. Tiene validación, tiempo máximo y límites de petición y concurrencia. No ofrece autenticación general y no debe exponerse directamente a Internet.

Incluye un gateway TDLib opcional (`WRGRAM_TELEGRAM_WEB=1`) con una sesión aislada por cookie, token hasheado, base TDLib cifrada con clave aleatoria en memoria, límites por IP/sesión, SSE y limpieza al cerrar. `api_hash` y claves de sesión nunca se envían al navegador. El servidor sí procesa los mensajes mientras la sesión está activa; antes de publicarlo hacen falta HTTPS, proxy de confianza, revisión de privacidad/Data Safety y una prueba de carga. Ver [web-tdlib.md](web-tdlib.md).

La web pública usa Cloudflare con CSP y cabeceras de seguridad. La generación permanece cerrada (`WRGRAM_AI_ENABLED=false`) y sin clave desplegada. Los límites por IP del Worker son aproximados por ubicación; no sustituyen autenticación, límites por usuario ni un presupuesto global. Antes de habilitar generación pública hay que implementar esos controles y publicar el tratamiento de datos. Ver [ai.md](ai.md) y [deployment.md](deployment.md).

## Telegram y publicación

Cumplir https://core.telegram.org/api/terms: credenciales propias de aplicación, transparencia sobre el cliente no oficial, no falsear estados ni conservar contenido autodestructivo, soporte de mensajes patrocinados según corresponda y no presentar extras como Telegram Premium.

Antes de introducir IA sobre datos obtenidos de Telegram, revisar específicamente sus términos vigentes; no asumir que el consentimiento del usuario elimina restricciones contractuales de plataforma.
