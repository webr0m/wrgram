# WRGram 0.5.0-beta07 · selectores de bots y ajustes

`0.5.0-beta07`, versionCode 11. Beta06/code10 permanece como borrador en Play; conservar ese AAB. El AAB code11 ya está en el borrador de prueba cerrada y sus notas `es-419` se guardaron; no se envió a revisión.

## Alcance implementado en esta tanda

- Añade selectores para `KeyboardButtonTypeRequestUsers` y `KeyboardButtonTypeRequestChat` de bots, solo en chats privados de bots.
- Aplicar filtros que TDLib declara y validar la selección mediante `ShareUsersWithBot`/`ShareChatWithBot` en modo `onlyCheck` antes de compartir.
- Confirmar explícitamente los datos que se enviarán al bot. Rechazar solicitudes que exijan agregar el bot a un grupo o conceder derechos administrativos automáticamente.
- Mantener `TargetChatInternalLink`, llamadas, historias, pagos/Stars y otras APIs de Mini Apps fuera hasta implementar y probar un flujo real, con las divulgaciones necesarias.
- Reorganiza Ajustes en secciones tipo TGX para las opciones existentes (cuentas, notificaciones, privacidad, almacenamiento, chats, apariencia y actualizaciones). No agrega controles ficticios para funciones que aún no existen.
- Corrige el selector de tamaño de texto con actualización inmediata de la variable que consume el chat y persistencia en las preferencias nativas.

La lista se limita a chats cargados localmente en TDLib; no se comparte un usuario/chat si el teclado cambió, la conversación dejó de ser un bot privado o el tipo no coincide. Las peticiones que requieren membresía o derechos administrativos se rechazan.

Ver `docs/privacy-beta07-draft.md`, `docs/tgx-gap-audit.md` y `artifacts/android/BETA07.md`.
