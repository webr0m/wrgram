# Temas visuales

WRGram incluye **19 paletas base** agrupadas en tres familias, además de temas propios creados o importados por la comunidad. WR Gold (negro y dorado) sigue siendo el valor predeterminado. Las paletas son originales: se inspiran en el estilo de otros clientes, pero no copian su código, sus recursos ni sus nombres internos.

## Catálogo base

| Grupo | Tema | Modo | Estilo |
|---|---|---|---|
| WRGram | WR Gold | Oscuro | Negro y dorado, predeterminado |
| WRGram | Violeta | Claro | Identidad original |
| WRGram | Día | Claro | Blanco, azul y alto contraste |
| WRGram | Noche | Oscuro | Azul profundo, brillo reducido |
| WRGram | Océano | Claro | Tonos marinos |
| WRGram | Bosque | Claro | Verdes naturales |
| WRGram | Terracota | Claro | Superficies cálidas y arcilla |
| WRGram | Grafito | Oscuro | Grises y acento ámbar |
| Telegram | Telegram claro | Claro | Azul y burbujas verdes del cliente oficial |
| Telegram | Telegram oscuro | Oscuro | Azul nocturno y burbujas del cliente oficial |
| Otros clientes | TGX | Oscuro | Turquesa nocturno |
| Otros clientes | Nekogram | Oscuro | Índigo y lavanda |
| Otros clientes | Plus Messenger | Oscuro | Ámbar cálido |
| Otros clientes | AyuGram | Oscuro | Cian eléctrico |
| Otros clientes | Catogram | Claro | Rosa pastel |
| Otros clientes | iMe | Claro | Azul luminoso |
| Otros clientes | Unigram | Oscuro | Azul Fluent |
| Otros clientes | Materialgram | Oscuro | Violeta dinámico |
| Otros clientes | 64Gram | Oscuro | Azul profundo |

Cada paleta define 28 tokens (`canvas`, `surface`, `chat`, `bubble`, `outgoing`, `accent`, fondos de pared, etc.). Las paletas nuevas parten de una base oscura o clara y sobrescriben solo los tokens que cambian.

## Gestor de temas

Se abre desde **Ajustes → Apariencia → Tema, tipografía y fondo → Gestor de temas**. Tiene cuatro pestañas:

- **Temas**: catálogo completo agrupado por familia, con vista previa y estado claro/oscuro.
- **Crear**: nombre (máximo 40 caracteres), paleta base, selector de color para acento, fondo, texto y burbuja propia; tipografía, tamaño (12–24 px), fondo del chat, radio de burbujas (0–22 px) y desenfoque (0–20 px); avisos de contraste WCAG; muestra en vivo; guardar o aplicar sin guardar.
- **Comunidad**: importar un código JSON, un enlace `wrgram://theme/…` o un archivo `.attheme`/`.tdesktop-theme`/`.palette`/`.json`, y compartir el tema activo como código o enlace (copiar o hoja de compartir del sistema).
- **Mis temas**: aplicar, editar, copiar código, copiar enlace, compartir o eliminar hasta 20 temas propios.

Los ajustes rápidos de Ajustes (ocho paletas, tamaño de texto, tipografía, fondo del chat y preferencias de mensajes) siguen disponibles sin abrir el gestor. «Seguir al sistema» alterna Día/Noche con el modo oscuro de Android o Windows y desactiva la selección manual hasta elegir otra paleta. El icono de luna/sol de la barra lateral sigue alternando Día y Noche manualmente.

### Temas por chat

El menú de cada conversación incluye **Tema de este chat**. Permite elegir una paleta base, un tema propio guardado o volver al tema global. La elección se guarda como un mapa `chatId → id de tema` en `appearance.chatThemes` y se aplica solo al área de mensajes con variables CSS locales; no cambia la barra lateral, los ajustes ni la cuenta de Telegram. Es una preferencia local de WRGram: Telegram no ofrece temas de color arbitrarios por chat a TDLib.

## Temas propios y comunidad

- **Formato de código**: JSON `{"format":"wrgram-theme","version":2,"name":"…","scheme":"dark|light","author":"…","palette":{…},"style":{…}}`. `style` es opcional y contiene `fontFamily`, `fontSize`, `wallpaper`, `radius` y `blur`. Los códigos versión 1 se siguen aceptando; la versión 3 o superior se rechaza.
- **Enlaces**: `wrgram://theme/<base64url>`. Al abrirlo, WRGram muestra una vista previa con avisos de contraste y solo aplica el tema tras confirmación del usuario. Android registra el esquema `wrgram://theme/` y entrega el enlace al WebView; en escritorio se puede pegar el enlace en Comunidad.
- **Archivos de Telegram**: `parseThemeFile` acepta propiedades `clave=valor` o `clave: valor` de temas `.attheme`/`.tdesktop-theme` (por ejemplo `windowBg`, `msgOutBg`, `actionBarColor`, `chat_wallpaper`, `0xAARRGGBB` o `#rrggbbaa`), además de JSON de WRGram y enlaces. El nombre del archivo se usa si el tema no trae nombre. Límite de 64 KB.
- **Límites**: código de hasta 8.192 caracteres, nombre de hasta 40, 20 temas guardados. El puente rechaza cada tema de más de 16 KB, listas de más de 32 KB y mapas de temas por chat de más de 8 KB o 100 entradas; toda la petición queda bajo el límite global del puente (64 KB).
- **Validación**: se exigen hex válidos en `canvas`, `surface`, `text`, `accent` y `outgoing`; el resto de tokens se completa desde la paleta base. Se eliminan caracteres de control, campos inyectados y propiedades heredadas; los códigos corruptos o de otro formato se rechazan con un mensaje claro. El contraste texto/fondo, texto/burbuja y texto/acento se avisa antes de aplicar.
- **Compartir**: no hay servidor, galería alojada, código QR ni sincronización automática entre dispositivos. El código o enlace se copia o se comparte con la hoja del sistema, y el archivo se importa con el selector nativo. Todo el intercambio es manual.
- **Premium honesto**: el gestor se etiqueta `WRGRAM PREMIUM · INCLUIDO EN BETA`. WRGram todavía no vende Premium ni tiene facturación, así que la función está disponible sin cobro, suscripción ni activación simulada. `THEME_PREMIUM.enforced` es `false` y no existe una puerta de compra falsa.

## Persistencia

- **Android**: `SharedPreferences("appearance")` guarda `theme`, `customTheme` (JSON del tema activo), `customThemes` (JSON de la lista), `auto` (seguir al sistema) y `chatThemes` (mapa `chatId → tema`, máximo 100 entradas). `Palette.get(context)` elige Día o Noche según `uiMode` cuando `auto` está activo y resuelve el tema para las barras del sistema, el fondo de la actividad, la pantalla de bloqueo, las Mini Apps y el color de acento de las notificaciones; si `theme=custom` no se puede leer, cae en WR Gold. Acepta `#rrggbb` y `#rrggbbaa` (CSS RGBA) y valida con criterios estrictos antes de guardar. Los cambios de `uiMode` no recrean la actividad: `onConfigurationChanged` repinta las barras y avisa a la UI.
- **Archivos y enlaces en Android**: `ShellActivity` implementa `onShowFileChooser` para que el selector nativo abra `.attheme`, `.tdesktop-theme` y JSON; el filtro `wrgram://theme/…` captura enlaces de hasta 9.000 caracteres y los entrega al WebView como `wrgram:theme-link` cuando la página ya está cargada y la app desbloqueada.
- **Escritorio**: `DesktopStore` guarda `appearance.custom`, `appearance.customThemes`, `auto`, `chatThemes` y `chrome` como JSON junto al resto de preferencias; `TelegramService` los acepta desde el puente. `DesktopPalette` resuelve las 19 paletas (o el `chrome` validado que envía la UI) para el fondo de la ventana, el splash de arranque y la barra de título DWM de Windows 11.
- **Web/landing**: sigue usando `@wrgram/design-tokens` con las ocho paletas originales y su selector propio. El catálogo de 19 no se inyecta en la landing.

Los temas son archivos de apariencia locales: no incluyen mensajes, cuentas, tokens ni datos de Telegram, y no se sincronizan entre dispositivos.

## Arquitectura

`apps/mobile-ui/src/themes.ts` contiene el catálogo, la resolución preset → paleta completa, el estilo tipográfico (`styleCssVars`), la validación/importación, los avisos de contraste y la serialización. `apps/mobile-ui/src/theme-files.ts` analiza archivos de Telegram (`.attheme`/`.tdesktop-theme`) y códigos/enlaces de WRGram. `App.tsx` aplica cada token como variable CSS inline (`--canvas`, `--surface`, `--accent`, …), fija `data-theme`, `data-scheme` y `color-scheme`, aplica el tema por chat con variables locales en `main.chat-main` y, en escritorio, envía `appearance.chrome` para que el host nativo pinte fondo y barra de título; el CSS de la app consume esas variables y `tokens.css` actúa como respaldo para las ocho paletas históricas. `theme-manager.css` define el gestor y su vista previa aislada, con diseño de pantalla completa en móvil.

No se usan filtros que invierten la pantalla, estilos descargados ni JavaScript externo. «Seguir al sistema» resuelve Día/Noche con el modo oscuro del sistema operativo; la selección manual vuelve a quedar fija al elegir una paleta. iOS sigue sin vistas nativas.

## Verificación

- `themes.test.ts` cubre unicidad y grupos del catálogo, presencia de los clientes no oficiales, honestidad de Premium, resolución de temas desconocidos, variables CSS completas, creación de temas propios, estilo tipográfico, ida y vuelta del código, rechazo de códigos corruptos o sobredimensionados y saneamiento de campos inyectados.
- `theme-files.test.ts` cubre archivos de propiedades de Telegram, colores `0xAARRGGBB`/`#rrggbbaa`, nombres desde el archivo, JSON de WRGram y rechazo de contenido inválido.
- El gestor se probó en la vista de diseño (`?preview=1`) a 390 px y en viewport ancho: aplicar presets, guardar un tema, importar un código válido, rechazar uno inválido, compartir y eliminar el tema activo con vuelta a WR Gold, sin desbordamiento horizontal. En esta ronda se añadieron los controles de estilo, la importación por archivo, los enlaces y los temas por chat; su comportamiento visual se validó con datos sintéticos.
- La validación nativa (`AlphaContractTest`) comprueba 20 identificadores únicos (19 paletas + `custom`), la caída a WR Gold, la resolución del tema personalizado y la conversión de colores CSS RGBA. La compilación Android y la de escritorio se ejecutaron después de estos cambios.

**Límite honesto**: las pruebas visuales usan datos sintéticos y no una cuenta real. Las barras del sistema, la pantalla de bloqueo, las Mini Apps, las notificaciones y la barra de título de Windows con un tema personalizado se validan por contrato y compilación, no en un teléfono o PC con sesión real. El splash nativo de Android 12+ sigue siendo estático: la paleta se aplica cuando arranca la actividad, no en la pantalla de arranque del sistema. `TdApi.java` vendorizado no expone temas en la nube ni paletas por chat de Telegram, así que no se importan temas remotos ni se sincronizan; solo se aceptan archivos, códigos y enlaces locales. Tampoco hay galería alojada, código QR ni sincronización automática entre dispositivos.
