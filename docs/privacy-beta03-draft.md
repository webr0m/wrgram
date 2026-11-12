# Propuesta de extensión de privacidad · WRGram 0.5.0-beta03

**BORRADOR LOCAL; NO PUBLICADO NI APLICADO A PLAY.** Complementa `docs/privacy-beta02-draft.md`. La política pública continúa describiendo alpha04. Revisar con el propietario y verificar los servicios de los bots antes de publicar.

## Teclados de bots y callbacks

WRGram muestra las filas y etiquetas que TDLib recibe de Telegram para teclados de respuesta e inline. Los datos callback y URLs no se envían al JavaScript general de la interfaz: al pulsar, el puente nativo identifica fila/columna y TDLib envía el callback al bot; el bot puede responder con texto o una URL. Los enlaces externos pasan por confirmación. Botones de inicio de sesión, compra, contraseña o solicitudes de datos/dispositivo que no se implementan permanecen deshabilitados.

Las Mini Apps inline y de menú se abren con la URL autorizada por TDLib dentro de un WebView aislado por origen. Una Mini App de reply keyboard puede emitir `web_app_data_send`; antes de transmitirlo, WRGram muestra el contenido y requiere confirmación explícita. Solo tras confirmar se envía a Telegram mediante `SendWebAppData` para ese bot. El contenido enviado se entrega al bot y puede ser procesado por sus servidores; WRGram no lo guarda ni lo usa en otras conversaciones. Cancelar no envía el contenido.

## Límites de esta descripción

El botón web puede contener contexto de lanzamiento definido por Telegram que se entrega al servicio remoto. Revalidar este flujo con bots de prueba controlados por el propietario; determinar qué datos firmados aparecen en las URLs y confirmar la retención del backend. No afirmar recepción push ni integración completa con todas las funciones del SDK de Telegram.

La tanda se prepara como beta03/code7 porque el AAB code6 de beta02 está cargado como borrador en Play. Beta03 no está subida; no se cambió la ficha, la política pública, Seguridad de los datos ni la declaración de anuncios.
