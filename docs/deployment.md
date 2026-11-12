# Publicación de la alpha web

## Alcance

Cloudflare Worker `wrgram` con assets estáticos de `apps/web/dist` y dominio solicitado `wrgram.webrom.cc`. Configuración: `wrangler.jsonc`. No es una aplicación Android, no produce un `.aab` y no publica en Google Play.

Esta publicación es una **demostración de interfaz**, no un cliente de Telegram con sesiones reales. La generación de WR IA queda deshabilitada por defecto. `.env`, sesiones de usuario y claves de proveedores no se cargan como assets ni se incluyen en el bundle.

## Preparar

Requisitos: Node 22.12+ (preferido 24 LTS), pnpm y acceso delegado de Cloudflare con permisos suficientes sobre Workers y el dominio.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm deploy:check
```

`deploy:check` compila web y ejecuta `wrangler deploy --dry-run` sin publicar. `pnpm deploy` vuelve a comprobar el código y publica; es una acción remota, no un comando de previsualización.

En Windows sin pnpm global: `npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm <comando>`.

Antes del primer despliegue, comprobar que el Worker y el subdominio no contienen otro proyecto. No sustituir registros o servicios existentes sin revisar su uso.

## Configuración

- Custom Domain: `wrgram.webrom.cc`. Cloudflare gestiona el certificado y la asociación DNS.
- No se habilitan direcciones alternativas workers.dev ni preview URLs.
- `/` sirve la landing promocional one-page; `/app/` sirve la demo. Vite compila ambas entradas HTML por separado. `/app` se normaliza a `/app/` por el servidor de assets.
- `/android/privacy/` sirve la política pública aprobada de Android, con CSS del mismo origen, sin scripts ni rastreadores propios. Su publicación no convierte la demo en cliente Telegram real.
- `/api/*` se procesa en el Worker; el resto sirve los assets estáticos, con fallback a la landing.
- `/api/health` y `/api/v1/plugins` son públicos y no contienen datos de usuario.
- `/api/v1/assistant/status` no revela credenciales.
- `/api/v1/assistant/chat` devuelve 503 mientras WR IA está deshabilitada.
- `observability.enabled=false`; no registrar prompts ni secretos al añadir monitorización.
- Cabeceras del frontend en `apps/web/public/_headers`: CSP, protección de framing, política de referer y permisos de cámara/micrófono/geolocalización deshabilitados.
- `Cache-Control: public, max-age=0, must-revalidate, no-transform` impide la inyección automática de Web Analytics en las respuestas de esta app, sin modificar la configuración de otros sitios de la cuenta. No relajamos la CSP para permitir beacons externos.
- La landing permite indexación y tiene canonical y sitemap. `robots.txt` y meta robots excluyen `/app/` del índice; **no son control de acceso**.

La CSP corresponde a una demo sin conexión a Telegram. Antes de añadir MTProto, Workers WASM, multimedia o Mini Apps habrá que revisar y limitar las nuevas fuentes necesarias, no quitar la política entera.

## IA y credenciales

Cloudflare solo tiene el proveedor Groq preparado. Ollama permanece en la API local: un Worker no puede usar el `127.0.0.1` de tu ordenador.

No subir `.env`, claves de Telegram, claves de Groq ni sesiones al sitio. La clave de aplicación de Telegram no es una sesión de usuario; aun así evitamos incorporarla a esta demo pública. Un futuro cliente web real necesariamente expondrá los datos de aplicación que necesite ejecutar en el navegador.

Ver [WR IA](ai.md) antes de habilitar inferencia pública. Se necesita acceso autenticado/privado y control de cuotas, no únicamente una clave.

## Verificación posterior

1. HTTPS válido, landing en `/` y pantalla de WRGram identificada como demo en `/app/`; tiendas como «Próximamente» y contacto a `https://t.me/webrom_bot`.
2. Salud con `service: wrgram-edge` y `telegram: demo`.
3. Catálogo válido y estado de IA `not-configured`.
4. Generación rechazada sin llamar al proveedor.
5. Búsqueda, notas locales, revocación y diálogos operativos.
6. Consola sin errores de aplicación ni violaciones inesperadas de CSP.
7. Inspeccionar el bundle buscando **presencia**, sin imprimir valores, de credenciales conocidas.

## Política Android publicada · 6 de noviembre de 2026

- Aprobación explícita del propietario antes de publicar; responsable público Rodrigo Olmos, Chile, ridrogo@gmail.com.
- Versión Cloudflare `2e0d4966-cb58-445e-b53f-bcfc7c9a0d5e`. Solo se cargaron dos assets nuevos/modificados: `/android/privacy/index.html` y `/android/privacy/privacy.css`; landing/demo sin cambios.
- `pnpm deploy`: typechecks, 80 pruebas generales, build público, dry-run y comprobaciones de secretos conocidos superados. No es auditoría universal de secretos.
- URL https://wrgram.webrom.cc/android/privacy/ verificada HTTP 200, título y responsable correctos, sin placeholders; URL guardada en Play pendiente de revisión. `WRGRAM_AI_ENABLED=false` y observabilidad deshabilitada conservados.

## Política Android: notificaciones push y Firebase · 9 de noviembre de 2026

- Se añadió la sección 5 «Notificaciones push opcionales», Firebase como destinatario y la fecha 9 de noviembre; las secciones siguientes se renumeraron (6–9).
- `pnpm deploy` vía corepack: typecheck, pruebas, build público con 15/18 archivos validados, dry-run y despliegue. Versión Cloudflare `1d798b96-2bdc-4a9b-bd95-f8fd31d58e68`; 6 assets nuevos/modificados, incluido `/android/privacy/index.html`.
- URL verificada HTTP 200 con la sección nueva y la fecha del 9 de noviembre; `WRGRAM_AI_ENABLED=false` y observabilidad se mantienen. La caché de borde revalidó el HTML tras la publicación.
- La declaración de Seguridad de los datos de Play se revisó y no requirió cambios: el identificador de instalación de Firebase ya estaba cubierto por «Dispositivo u otros IDs» (recopilado y compartido).

## Antes de Google Play

Android usa React/Vite empaquetado sobre TDLib nativo. El AAB beta09/code13 aparece en la prueba cerrada y `Descripción` figura junto con esa versión en las comprobaciones de revisión. Play indica 1 de 12 verificadores; exige 12 durante al menos 14 días para poder solicitar producción. La descripción de tienda se actualizó; la política pública aún describe una versión anterior y las divulgaciones deben revisarse con el propietario. No se envió ni publicó nada desde esta sesión. Consultar [android-play.md](android-play.md). Las claves de firma se custodian fuera del repositorio. No prometer una fecha de producción sin cumplir los requisitos de Play.
