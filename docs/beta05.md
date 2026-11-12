# WRGram 0.5.0-beta05 · borrador de prueba cerrada

Versión `0.5.0-beta05`, versionCode 9. El AAB/APK release está compilado y validado. El AAB code9 ya está cargado en el borrador de prueba cerrada; se añadieron las notas `es-419` y se guardó el borrador. No se envió a revisión y beta04/code8 se preservó.

## Flujos nuevos en preparación

- **Compartir número**: solo desde la solicitud explícita del teclado en el chat privado del bot. Se muestra el número que TDLib conoce de la cuenta y se envía el contacto al pulsar “Compartir”; no se guarda una copia.
- **Compartir ubicación**: solicitud visible, permiso Android coarse/fine después de “Continuar”, ubicación reciente que se revisa por el usuario y segunda confirmación antes de enviar. Si se deniega el permiso o no hay fix reciente, no se envía nada.
- **Crear encuesta**: formulario nativo de pregunta/opciones y, si Telegram pide quiz, índice de respuesta correcta. Solo se envía al pulsar “Crear y enviar”.
- **Actualizaciones de Play**: Play Core detecta un código disponible para instalaciones hechas desde Play y ofrece un flujo oficial de actualización. La API no trae notas de versión; la UI enlaza a Google Play para el changelog de esa pista.

## Pendientes

Selector de usuarios/chats, switch-inline a otros chats, pagos/Stars, llamadas/video, historias, administración avanzada y todas las funciones Web App requieren fases separadas. Los flujos nuevos están cubiertos por pruebas instrumentadas de serialización, pero aún no se probaron Play Core ni un bot/cuenta real. Las funciones de teléfono y ubicación modifican declaraciones de permisos/datos; revisar `docs/privacy-beta05-draft.md` antes de subir o enviar a Play. Los hashes están en `artifacts/android/BETA05.md`.
