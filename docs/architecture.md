# Arquitectura de WRGram

## Objetivo

Cliente de Telegram para web, Android e iOS con herramientas adicionales y bots integrados mediante capacidades explícitas. El cliente de mensajería no debe depender del catálogo comercial de complementos para poder funcionar.

## Estado actual

La web pública tiene landing promocional en `/` y demo en `/app/`, con mensajería ficticia, complementos propios y ocho temas, con WR Gold (negro y dorado) predeterminado. El [cliente MTProto local](telegram.md), excluido del build web público, tiene autenticación, conversaciones e historial paginados, envío de texto y actualizaciones; sus validaciones reales corresponden al propietario. WR IA tiene proveedores Groq/Ollama para texto propio y propuestas de notas, sin acceso a Telegram. Hay una API Fastify de desarrollo y un Worker Cloudflare para servir web/API con generación pública deshabilitada. No hay autenticación propia del producto, base de datos remota, facturación, sandbox ni descarga de complementos externos.

Android tiene una beta nativa independiente en `apps/mobile/android`, con shell Java/AndroidX, UI React/Vite local y TDLib/JNI. El AAB `0.5.0-beta09` (código 13) aparece en la prueba cerrada y en comprobaciones de Play; no está disponible al público. La app no carga la demo web ni llama a la API de Webrom para mensajería. Sesiones TDLib cifradas con claves protegidas por Android Keystore, fuera de backups; notas cifradas por cuenta/chat. El alcance y las pruebas constan en [beta09](beta09.md). Los flujos nuevos requieren validación del propietario. iOS y escritorio .NET siguen pendientes; no hay publicación pública en tiendas.

Los paquetes internos exportan TypeScript fuente. Vite y tsx lo procesan en desarrollo; no son todavía un SDK publicable en npm. Las versiones 0.1.0 indican el contrato inicial, no estabilidad pública.

## Lenguajes

- **TypeScript**: interfaz web, contratos, complementos propios y backend.
- **SQL / PostgreSQL**: futuras suscripciones, perfiles del producto y catálogo. Aún no instalado.
- **Java 17 / AndroidX**: shell Android con enlace JNI de TDLib y WebView local restringido para React/Vite. No carga un sitio remoto.
- **C# / .NET**: escritorio solicitado para después de Android, todavía no implementado.
- **Swift / Kotlin**: posibles integraciones futuras de plataforma, no motores adicionales ya implementados.
- TDLib está escrita en C++; Android la consume como dependencia nativa, sin reimplementar el protocolo.

## Capas

```text
React web demo                    React/Vite empaquetado Android
     │                                      │
     ├──── modelos / servicios / permisos ───┤
     │                                      │
Adaptador mtcute (solo local)     Puente allowlist → TDLib/JNI
     └────────────── Telegram ───────────────┘

Complementos propios ── capacidades permitidas ── servicios del cliente

Backend WRGram (independiente): catálogo, suscripciones, datos propios opcionales
```

`@wrgram/telegram` contiene el contrato de datos de una cuenta ya autenticada, paginación, eventos, claves compuestas y un almacén en memoria independiente de React. El adaptador mtcute del frontend traduce mensajes, permisos y actualizaciones. La autenticación y el ciclo de vida de la sesión quedan en su propietario, no en el backend. No es todavía un SDK estable ni una implementación completa de Telegram. Los [tokens de temas](themes.md) se comparten entre pantallas sin mezclar datos entre demo, modo real e IA.

### Motores propuestos

- **Web: mtcute** por su integración TypeScript y navegador.
- **Móvil: TDLib** por su gestión de conexión, actualizaciones y almacenamiento.
- **Alternativa a probar: TDLib WebAssembly** si reduce suficientemente el coste de mantener dos motores. No asumimos que sea una integración trivial.

La prueba técnica de ambos motores debe preceder a una inversión grande en pantallas. Compartir lenguaje no significa compartir todas las vistas ni todos los detalles de sincronización.

## Complementos

### Implementado

- Manifiestos tipados, identificadores únicos, versión y superficie de integración.
- Registro cerrado de complementos propios.
- Cero permisos por defecto.
- Concesión explícita de los permisos declarados y revocación inmediata.
- Revalidación de concesiones persistidas: si cambia el conjunto de permisos, se requiere consentimiento otra vez.
- Notas locales y preparación de respuestas rápidas.

### No implementado

- Aislamiento de código no confiable, firmas, revisión de paquetes o marketplace.
- Permisos por cuenta/chat, consentimiento granular por recurso y auditoría duradera.
- Contratos de UI declarativa y conectores remotos.
- Compatibilidad pública/semver del SDK.

**`PluginRuntime` es control de capacidades para código propio, no un sandbox.** No se debe permitir importar un módulo remoto o ejecutar scripts con esta protección.

## Bots frente a complementos

1. **Bot externo de Telegram**: interacción con su cuenta, comandos, botones o capacidades oficiales. No requiere conocer su token ni obtiene acceso universal a los chats.
2. **Bot propio**: su token es un secreto de servidor; no se incluye en la aplicación web o móvil.
3. **Complemento local**: herramienta del cliente que recibe solo las capacidades autorizadas.
4. **Conector de servicio externo**: necesita consentimiento de salida de datos, autenticación, límites y una política de retención.

Mini Apps, bots inline y bots conectados a cuentas Business son integraciones oficiales distintas; se deberán verificar sus requisitos por plataforma y tipo de cuenta. No asumimos que un plugin pueda reemplazar sus permisos.

## Backend

Fastify expone salud, catálogo y los endpoints de WR IA. La web usa un catálogo empaquetado, por lo que **la demo de mensajería y complementos no necesita el backend para funcionar**. WR IA sí necesita la API y un proveedor configurado. En Cloudflare, el Worker reutiliza Groq desde `@wrgram/ai-providers`; la generación permanece deshabilitada. Ollama sigue en la API local.

En el futuro alojará cuentas del producto, catálogo, suscripciones, webhooks de pago verificados y sincronización opcional de datos propios. No será el proxy universal de las sesiones personales de Telegram.

## Distribución

- Web: HTTPS, CSP y estrategia de almacenamiento a definir antes del uso real.
- Android: React Native con módulo nativo TDLib y almacenamiento seguro de claves.
- iOS: módulo nativo, compilación en macOS/Xcode y revisión de las reglas de extensiones y compras de Apple.
- No usar Expo Go para asumir soporte de TDLib. Si elegimos Expo, hará falta un development build.
- El despliegue web tiene configuración en `wrangler.jsonc` y sus instrucciones en [deployment.md](deployment.md). No hay PWA, CI remoto ni aplicación móvil publicada. La disponibilidad real del dominio debe comprobarse después de desplegar.
