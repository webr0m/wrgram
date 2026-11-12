# WRGram 0.5.0-beta09 · integraciones TDLib seguras

`0.5.0-beta09`, versionCode 13. Play Console muestra el AAB en prueba cerrada y `Descripción` junto a `Prueba cerrada - Alpha 13` en comprobaciones de revisión. Las notas `es-419` están guardadas y se editó la ficha. En esta sesión no se pulsó «Siguiente», «Enviar a revisión» ni «Quitar los cambios»; no asumir que la ficha quedó solo como borrador mientras Play indique lo contrario.

## Integrado

- Foto propia: elegir imagen, corregir orientación EXIF, recortar a JPEG cuadrado, previsualizar y confirmar antes de `SetProfilePhoto`; eliminar la foto requiere confirmación. No cambia la foto pública ni guarda el original.
- Contactos Telegram: listar/buscar contactos actuales, abrir chats, agregar/quitar contacto sin compartir número, y crear grupos básicos con selección explícita de hasta 199 contactos. Bots quedan excluidos del selector de miembros.
- Administración inicial: ver hasta 50 miembros recientes si TDLib confirma `canRestrictMembers`, restringir miembros normales por una hora y editar los permisos predeterminados del grupo. TDLib revalida el permiso y el cliente confirma la acción; no promueve administradores.
- Facturas digitales de Telegram Stars `XTR`: mostrar el precio, pedir confirmación dentro de WRGram y otra confirmación nativa, y pagar con credenciales nulas de Stars. No procesa tarjetas, direcciones, propinas ni suscripciones.
- Stickers `.tgs` animados: descargar el TGS local, descomprimir con límite, rechazar assets externos y renderizar con Lottie. Los stickers WebM siguen el reproductor de video.
- `TargetChatInternalLink`: soporte acotado a `InternalLinkTypePublicChat`; confirma destino, consulta el bot y no envía hasta que el usuario elija un resultado. Se rechazan perfiles, borradores y tokens de pago.
- Mini Apps: solicitudes de escritura, contacto/teléfono, ubicación y clipboard con confirmaciones, permisos por bot y límites de interacción. El teléfono se envía como contacto al bot por TDLib; la ubicación se entrega al sitio de la Mini App solo tras consentimiento por bot y permiso Android. El clipboard solo se permite para bots añadidos al attachment menu, con gesto reciente y vista previa. Se implementa DeviceStorage local aislado por cuenta/bot (hasta 5 MB acumulados; 64 KiB por escritura); añade botón Atrás, popup y haptics.

## No incluido o requiere motor/pruebas

- Llamadas de voz/video: `CreateCall` de TDLib no implementa el transporte de audio/video por sí solo. El AAB actual no incluye `tgcalls`/`libtgvoip`; no añadí un botón que no pueda conectar.
- No se sincroniza la agenda del teléfono, ni se crean supergrupos/canales, ni se importan contactos automáticamente.
- Administración completa: sin ascensos/promociones, revocación y búsqueda de baneos, auditoría ni gestión completa de roles. El flujo inicial solo cubre permisos predeterminados y una restricción temporal.
- Stars: sin tarjeta/monedas FIAT, suscripciones recurrentes, membresías ni compra iniciada fuera de una factura `XTR`.
- `TargetChatInternalLink` admite solo chats públicos; otros tipos requieren flujos específicos.
- Mini Apps: faltan eventos Bot API como SecureStorage/biometría, descargas/compartir medios, switch-inline desde Mini App, añadir al home, compartir a historia y otras capacidades. Solicitudes de cámara/micrófono y permisos WebView siguen denegadas.
- Sin cuenta/bot de prueba no se validaron en vivo foto, grupo, administración, cobro Stars, descargas TGS, destinos inline ni acciones de Mini App.
- `artifacts/android/BETA09.md` registra AAB/APK, hashes y validaciones; no enviar a revisión sin completar pruebas con cuentas/bots y aprobar divulgaciones.

## Investigación y licencias

Se revisaron [la documentación oficial de TDLib](https://core.telegram.org/tdlib), [TGX-Android/Telegram-X](https://github.com/TGX-Android/Telegram-X), [Telegram Android](https://telegram.org/apps/android) y [tgcalls](https://github.com/TelegramMessenger/tgcalls). TGX está bajo GPLv3, Telegram Android bajo GPLv2-or-later y la biblioteca tgcalls tiene licencia LGPLv3. Se usaron sus flujos/documentación como referencia; no se copió código fuente TGX ni Telegram.

Ver [borrador de privacidad](privacy-beta09-draft.md), [brechas](tgx-gap-audit.md) y [estado Play](android-play.md).
