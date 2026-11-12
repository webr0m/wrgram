# WRGram alpha04 · registro histórico de entrega

> Este archivo documenta el estado de alpha04 en noviembre de 2026. Fue sustituida por el seguimiento de beta09/code13; no usar las afirmaciones antiguas de estado de Play como vigentes. Ver [estado actual](android-play.md).

- Versión `0.4.0-alpha04`, código 4, paquete `cc.webrom.wrgram`.
- AAB Play: `artifacts/android/WRGram-0.4.0-alpha04.aab` (48,660,344 bytes).
- APK directo: `artifacts/android/WRGram-0.4.0-alpha04.apk` (125,036,038 bytes).
- Mapa R8: `artifacts/android/mapping-0.4.0-alpha04.txt`.
- Mismo certificado de subida que alpha03; no se generó otra clave ni se cambió el paquete.

## Cambio

Autodeclaración local de edad y país antes de acceder a Telegram: 18+ en UE, Reino Unido, Australia y territorios de la UE incluidos en la regla; 13+ como mínimo de producto en el resto donde esté permitido. Adolescentes 13–15 y 16–17 siguen dentro del público previsto fuera de las restricciones. Todos los países seleccionados en Play se mantienen.

Fecha de nacimiento solo en memoria. País, resultado, instante y revisión de regla cifrados localmente con clave independiente; aprobación por 30 días y reintento a las 24 horas si no es apto. Cambiar residencia desde Ajustes → Privacidad, licencias y soporte → Actualizar edad o residencia.

**No verifica identidad ni residencia real.** No bloquea descargas de Play, no impide eludir una declaración con datos falsos y no certifica el cumplimiento de todas las normas locales. [Detalle](age-access.md).

## Estado

76 pruebas generales, 48 JUnit y 16 instrumentadas superadas; Lint sin errores, 11 avisos release. Validación de AAB/APK, mismo certificado y alineación de 16 KB superadas. La actualización release de alpha03 en el emulador aislado abrió el control de edad sin autenticación. Falta probar la actualización y mensajería con la cuenta real del propietario.

Cargado manualmente por el propietario y procesado por Play como **4 (0.4.0-alpha04)**. Reutilizado desde la biblioteca y **publicado internamente**, solo para la lista del propietario (1 cuenta), lanzamiento 6 de noviembre de 2026, 1:31 p. m. La cerrada posteriormente apareció en revisión y después **Activa, versión más reciente alpha04, 178 países/regiones**. El envío inicial contenía público 16+; la ampliación guardada a 13–15, 16–17 y adultos todavía requiere envío confirmado. No se comprobó instalación por el enlace cerrado. [Estado e incidencia de concurrencia](android-play.md).

Para instalar/actualizar con la cuenta autorizada: https://play.google.com/apps/internaltest/4700393140236754107. Si ya participas, abre Google Play y busca Actualizar. La propagación puede tardar; no desinstales ni borres datos para actualizar. En el primer arranque de alpha04 deberás completar la declaración local de edad y residencia. No compartas códigos ni contraseñas con soporte.

Política aprobada y publicada en https://wrgram.webrom.cc/android/privacy/; IARC, ficha completa y Seguridad de los datos incluidas en la revisión inicial. Acceso completado directamente por el propietario; estado verificado sin leer secretos ni certificar su funcionamiento. Contenido de la app muestra «Ya estás al día». No se inventaron credenciales ni disponibilidad de IA.

La carga manual ya se completó debido al límite de 5 MiB de la herramienta. No repetirla ni regenerar claves. Los bloqueos anteriores de configuración/datos desaparecieron. El propietario autorizó reiniciar la revisión para incluir 13+, pero Play rechazó el envío por cambios revisados/actualizados simultáneamente; queda **1 cambio de público objetivo pendiente de envío confirmado**. La revisión interna no tuvo errores, solo símbolos nativos; instalación estimada 12.7 MB y actualización 295 KB, no tamaños del AAB ni producción pública.

Después de generar el binario: 80 pruebas generales superadas al desplegar únicamente la política pública; una prueba instrumentada independiente exportó las cuatro vistas debug no autenticadas para Play. No se recompilaron ni modificaron AAB/APK firmados. Consultar [validación](validation.md) y [declaración de datos](play-data-safety.md).

## SHA-256

```text
51626d18b326ecc5054c5a375800790d913696093031bf91ba1d9222a020daf2  WRGram-0.4.0-alpha04.aab
49f03e394aa39a5d9ae76382b6ab975fc3061fc2c3b6f93d6d5e969ea26a3bfb  WRGram-0.4.0-alpha04.apk
```

## Notas publicadas internamente y guardadas en el borrador cerrado

```text
<es-419>
Control regional de edad antes de acceder a Telegram. Autodeclaración local de fecha de nacimiento y residencia; la fecha no se guarda ni se envía. Acceso 18+ en UE, Reino Unido y Australia; mínimo de producto 13+ en el resto donde esté permitido. Actualización de residencia desde ajustes. Conserva la interfaz y mensajería de alpha03. Es una alpha y no verifica identidad ni residencia real; prueba primero con tu cuenta secundaria.
</es-419>
```
