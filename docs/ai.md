# WR IA · Groq online y Ollama local

## Estado y alcance

La web incluye un espacio propio para WR IA y dos proveedores implementados. Android existe como aplicación beta independiente, pero no usa el contrato web `@wrgram/assistant`; su generación pública de IA permanece deshabilitada. **iOS todavía no es una aplicación ejecutable.**

El asistente responde a instrucciones originales escritas en ese espacio. No recibe chats, contactos, sesiones ni mensajes seleccionados de Telegram. No debe usarse para eludir sus términos de uso de datos para IA. El aviso y el prompt de sistema son medidas de UX, no un detector fiable del origen del texto pegado manualmente.

La única herramienta prepara una **propuesta de nota personal**. Se valida con una lista cerrada y nunca se ejecutan funciones arbitrarias del modelo. La persona debe confirmar para guardar la nota en el navegador. No se inserta en un chat ni se envía a Telegram.

## Groq online: desarrollo local

1. Crea una cuenta y una clave en https://console.groq.com/keys. Revisa las cuotas del plan y evita habilitar facturación si solo quieres probar el nivel gratuito.
2. Copia `.env.example` a `.env` si todavía no existe. **No sobrescribas un `.env` existente.**
3. Configura en `.env`:

```dotenv
WRGRAM_AI_PROVIDER=groq
GROQ_API_KEY=tu_clave_privada
WRGRAM_GROQ_MODEL=openai/gpt-oss-20b
```

4. Arranca en dos terminales:

```sh
pnpm dev:api
pnpm dev
```

5. Abre WR IA en http://127.0.0.1:5173/app/. Actualiza su estado y acepta el aviso antes de enviar.

En Windows sin pnpm global, sustituye `pnpm` por `npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm`.

El script de API carga `.env` desde la raíz. Reinicia la API tras cambiar proveedor, modelo o clave. No hay cambio automático de proveedor ni escalado automático a un plan de pago. **La aplicación no puede comprobar si tu cuenta de Groq está facturando**: los controles de gasto se gestionan en Groq. «Cuota gratuita» no significa servicio ilimitado ni una garantía de coste cero de una cuenta con facturación activa.

La clave no usa prefijo `VITE_`, no se entrega al navegador y no se incluye en la compilación web. El historial de la sesión de WR IA se reenvía en cada consulta, con un máximo de 10 mensajes; se pierde al salir del panel o recargar.

## Ollama: alternativa local

Instala Ollama si no está disponible y descarga un modelo compatible con herramientas. La descarga puede ocupar varios GB; no se hace automáticamente.

```sh
ollama pull qwen3:1.7b
```

En `.env`:

```dotenv
WRGRAM_AI_PROVIDER=ollama
WRGRAM_OLLAMA_URL=http://127.0.0.1:11434
WRGRAM_AI_MODEL=qwen3:1.7b
```

Puedes elegir un modelo ya instalado mediante `WRGRAM_AI_MODEL`; debe admitir herramientas. El código no acepta nombres con `cloud` para esta opción, aunque eso no sustituye auditar una instalación personalizada de Ollama. Se usa el servidor configurado: «local» significa local al equipo que aloja la API, no necesariamente al teléfono o navegador.

No hay tarifa por petición del proveedor local, pero el hardware, consumo y alojamiento sí tienen coste. No exponemos Ollama directamente a Internet. Los modelos y sus licencias deben revisarse antes de redistribuirlos.

## API compartida

- `GET /v1/assistant/status`: estado del proveedor y modelo, sin devolver la clave.
- `POST /v1/assistant/chat`: `messages`, `consent: true` y `provider` explícito.
- Proxy web local: `/api/v1/assistant/*` → API de desarrollo.
- Cloudflare: `/api/v1/assistant/*` en el mismo dominio.
- React Native futuro: `createAssistantClient('https://wrgram.webrom.cc/api')`, tras implementar autenticación del producto. `localhost` en un teléfono no apunta a tu ordenador.

Errores de cuota se presentan como tales: no se reintenta sin límite ni se reenvía el prompt a otro proveedor. Hay tiempo máximo de generación, límite de cuerpo, longitud e historial, y cancelación. Cancelar la petición no garantiza que un proveedor remoto no la haya procesado ya.

## Alpha pública

El Worker se despliega con `WRGRAM_AI_ENABLED=false`. No incorpora la clave local ni permite generación. La UI muestra que WR IA está pendiente de habilitar; no hay respuestas falsas.

Antes de habilitarla públicamente hay que implementar autenticación o acceso privado, límites por usuario y presupuesto global, y publicar el tratamiento de datos. El limitador de Cloudflare por IP es **aproximado por ubicación**, no una cuota global ni una defensa suficiente contra abuso. No basta con cambiar la bandera y pegar una clave.

Para guardar una futura clave en Cloudflare se usa un secreto (`wrangler secret put GROQ_API_KEY`), nunca `vars`, código fuente, mensajes de chat ni un archivo público. No hemos configurado esa clave en el despliegue.

## Datos y privacidad

- Groq recibe las instrucciones y contexto de WR IA para inferencia. Consulta su [política de tratamiento y retención](https://console.groq.com/docs/your-data); no prometemos retención cero por defecto. Revisa el control ZDR de la organización.
- El backend no almacena conversaciones de WR IA en una base de datos ni registra deliberadamente sus cuerpos.
- Las notas aprobadas usan `wrgram.assistant.notes.v1` en localStorage, **sin cifrado ni sincronización**. No guardes secretos. Se eliminan desde el panel de notas de WR IA.
- Los errores de API se normalizan para no mostrar claves ni respuestas de diagnóstico privadas del proveedor.
- Las pruebas automáticas usan proveedores simulados. Sin una clave configurada no se ha validado una conversación real con Groq.
