# Propuesta local de privacidad · WRGram beta05

**BORRADOR PARA REVISIÓN DEL PROPIETARIO; NO PUBLICADO.** Complementa `docs/privacy-beta04-draft.md`. No se cambió la política pública, Seguridad de los datos ni formularios Play.

- **Actualizaciones:** WRGram consulta con Play Core si Google Play ofrece un código superior para esta instalación. Play recibe la consulta de versión/estado y responde con disponibilidad, código, prioridad y progreso. No se consulta API privada ni servidor propio. La API oficial no devuelve changelog; el usuario puede abrir la ficha de Google Play para ver las notas de la pista y puede iniciar el flujo oficial de actualización.
- **Número de teléfono:** si el usuario pulsa una solicitud de teléfono de un bot, WRGram muestra el número que TDLib tiene para su cuenta y pide confirmación. Al confirmar, envía el contacto a ese bot por Telegram. Cancelar no transmite ni guarda el número.
- **Ubicación:** se pide permiso Android solo después de pulsar “Continuar”. Si Android tiene una ubicación reciente, WRGram muestra coordenadas/precisión y pide confirmación adicional antes de enviarla al bot mediante Telegram. Si se deniega el permiso o no hay ubicación reciente, no se envía. No se conserva historial ni se usa para edad/residencia.
- **Encuestas:** el usuario ingresa pregunta y opciones, revisa y confirma el envío al bot. El contenido lo recibe Telegram y el bot.

Beta05/code9 está cargada como borrador de prueba cerrada, con notas `es-419` guardadas; no se envió a revisión. beta04/code8 se preservó. Verificar el comportamiento real con bots/dispositivos de prueba y revisar estas divulgaciones antes de revisión.
