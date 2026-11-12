# WRGram 0.5.0-beta04 · ampliación de flujos

Versión `0.5.0-beta04`, versionCode 8. Beta03/code7 fue generada como candidata local y se conserva; beta02/code6 permanece en su borrador anterior. El AAB beta04 ya está cargado en el borrador de prueba cerrada (release ordinal 4); nombre, porcentaje 100 y notas es-419 están guardados. Aún no se envió a revisión.

## Nuevos flujos

- Login URL: consulta `GetLoginUrlInfo`, muestra dominio y pide confirmación explícita; si el sitio solicita permiso de escritura, lo separa con elección “sin permiso” o “permitir mensajes”. TDLib resuelve la URL autorizada.
- Callback con contraseña 2FA: muestra diálogo Android enmascarado, no guarda la contraseña y no procesa el callback sin confirmar.
- Botón callback de juego: solo llama a TDLib cuando el mensaje contiene un juego.
- `switch_inline_query` al chat actual: carga resultados y paginación desde TDLib, muestra previews/etiquetas sin exponer IDs ni URLs y manda el resultado solo tras una selección.
- La consulta se ata a cuenta/chat, caduca localmente y el token del puente es opaco. Al seleccionar un resultado se consume la sesión de resultados para evitar reenvíos por doble toque/timeout.

## Delimitaciones

Pagos/Buy no se habilitan. Botones de compartir teléfono/ubicación, creación de poll/usuarios/chats y cambio a otro chat siguen visibles pero deshabilitados; requieren consentimiento/permisos y pantallas independientes. Login URL, 2FA y mensajes con datos de los bots necesitan revisión de privacidad antes de publicar. El código TGX se consultó como referencia de comportamiento, no se copió.

## Validación

- `pnpm check`: **93 pruebas en 20 archivos** y build web aprobado.
- Android 16, `emulator-5580`, sin cuenta Telegram autenticada: **26 pruebas instrumentadas aprobadas**.
- Release R8/Lint completada. Bundletool validó el AAB; 138 payloads firmados con certificado igual a alpha04; apksigner v2 y zipalign 16 KB aprobados.
- Hashes/tamaños en `artifacts/android/BETA04.md`; cinco capturas debug en `artifacts/beta04/screens/`.

No enviar a revisión ni iniciar el lanzamiento desde la consola todavía. La tanda requiere pruebas con bots reales controlados por el propietario y revisión de privacidad para login URL/2FA/inline. Play muestra una advertencia opcional sobre símbolos de depuración nativos. Cobertura/restantes: `docs/tgx-gap-audit.md`; borrador local: `docs/privacy-beta04-draft.md`.
