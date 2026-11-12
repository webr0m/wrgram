# WRGram 0.5.0-beta06 · flujo switch-inline

`0.5.0-beta06`, versionCode 10. Continúa beta05/code9, cuyo AAB se conserva. El AAB code10 está cargado en el borrador de prueba cerrada y sus notas `es-419` quedaron guardadas; no se envió a revisión.

## Flujo agregado

- Los botones `switch_inline_query` que permiten elegir destino abren un selector con solo los tipos de chat declarados por el bot.
- Primero se elige un chat; WRGram consulta entonces al bot para preparar resultados, sin enviar un mensaje al destino.
- El mensaje inline se envía solo al tocar un resultado. Después se abre el chat destino.
- La selección está ligada a la cuenta y al chat de origen, caduca en 60 segundos y se cancela si el botón o el contexto cambian.
- Los botones de destino `current` mantienen el flujo beta04. Los enlaces internos como destino siguen sin implementarse.

## Multimedia y errores de carga

- TDLib actualiza objetos `File` en sitio estable para que las vistas registradas no vuelvan a pisar con una referencia antigua el estado completo de descarga.
- El endpoint local de WebView anuncia el tamaño y soporte `Range`; responde `206` al pedir segmentos para seeking y metadatos de video.
- Límites de descarga entrante: video 512 MB, imagen/audio 128 MB y otros archivos 32 MB. Los videos enviados como documentos usan MIME/nombre para presentarse como reproducibles cuando el formato lo permite.
- La interfaz recibe estados de carga y fallo y permite reintentar; una miniatura fallida no bloquea cargar el original. El fallo opcional de anuncios patrocinados se separa del historial y tiene reintento explícito.

## Pruebas y límites

97 pruebas web, typecheck, tests unitarios release y 3 pruebas instrumentadas focalizadas (caché actualizada, miniaturas y rangos de video) pasan. La suite instrumentada completa tuvo 3 fallos ligados al estado del emulador (clave de sesión, condición de acceso y cliente TDLib), así que no queda marcada como totalmente verde. Falta probar con bots/cuentas reales y formatos/códecs reales. El borrador está guardado en Play, pero no se envió a revisión.

Ver `docs/tgx-gap-audit.md`, `docs/privacy-beta06-draft.md` y `artifacts/android/BETA06.md`.
