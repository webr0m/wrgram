# WRGram 0.5.0-beta08 · auditoría y correcciones

`0.5.0-beta08`, versionCode 12. Beta07/code11 sigue como borrador en Play. Beta08 queda local; no subir ni enviar a revisión en esta tanda.

## Cambios

- Actualizar la lista cuando cambia la foto de un chat; carga de miniaturas con cola acotada/coalescente, vínculo a la cuenta y reintentos. Evita declarar fallida una descarga antes de recibir el estado de TDLib.
- Aplicar tipografía a mensajes, compositor y vista previa; comprobar el tamaño CSS renderizado en emulador.
- Mostrar progreso/errores de Google Play, conservar el diálogo durante el inicio, reanudar una actualización inmediata interrumpida y respetar cancelación del usuario. Play Core requiere una versión distribuida y elegible; una versión en borrador no aparece como actualización instalable.
- Menú de usuario: perfil, nombre, biografía y username; sesiones activas/revocación; mensajes guardados, cuentas, Ajustes, complementos, WR IA, tema y cierre de sesión.
- Lectura de historias activas desde detalles de chat, con `OpenStory`/`CloseStory` y contenido multimedia servido desde TDLib. No hay publicación ni edición de historias.
- Hacer adaptable a la pantalla la prueba instrumentada de capturas.

## Pendiente y límites de validación

- No se pudo probar con una cuenta Telegram conectada ni con fotos privadas, así que la causa de “no aparecen imágenes” queda corregida en los cambios de estado/carga pero necesita verificación real en varios chats.
- No hay una actualización code13 publicada para el usuario de prueba; Play in-app no puede descargar beta08 local ni un borrador.
- Siguen fuera edición de foto de perfil, contactos/grupos, idioma, creación/edición/archivo de historias, llamadas/video, pagos/Stars, stickers TGS, `TargetChatInternalLink`, APIs ampliadas Mini App y administración avanzada.
- No declarar paridad total con TGX. Ver [auditoría de brechas](tgx-gap-audit.md) y [borrador de privacidad](privacy-beta08-draft.md).
