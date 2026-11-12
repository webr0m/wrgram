# Hoja de ruta

> **Actualización:** las etapas/checklists inferiores son un plan histórico y no reflejan por sí solas el estado actual. Android ya alcanzó la fuente local `0.5.0-beta20` (código 24), con TDLib real y las capacidades descritas en [paridad de clientes](client-parity.md) y [BETA20](../artifacts/android/BETA20.md). beta13 (código 17) está en revisión en Play, beta12 (código 16) es la versión publicada para verificadores y beta14–beta20 solo existen en local; falta la validación del propietario con una cuenta real y las divulgaciones de Play. La lista de [pendientes vigentes](../apps/mobile-ui/src/SettingsPage.tsx) es la referencia de alcance.

## Etapa 0 — Base interactiva (actual)

- [x] Monorepo TypeScript, scripts y dependencias fijadas.
- [x] Interfaz web adaptable con identidad WRGram.
- [x] Chats, búsqueda y envío estrictamente de demostración.
- [x] Primeros contratos de Telegram y complementos.
- [x] Notas locales por chat, respuestas rápidas y permisos revocables.
- [x] API mínima independiente del cliente.
- [x] Pruebas unitarias y HTTP, comprobación TypeScript y build web.
- [x] Revisión documental de competencia.

**Salida:** demo navegable, sin requerir una cuenta ni datos privados de Telegram.

## Etapa 1 — Prueba real de Telegram web

Avance técnico: pantalla local con mtcute para teléfono/código/2FA, consulta de títulos y envío a la propia cuenta. Está excluida de producción y **pendiente de prueba de extremo a extremo por el propietario**. No se marcan como completadas las verificaciones de cuenta real ni de sincronización. Ver [telegram.md](telegram.md).

- [ ] Obtener `api_id` y `api_hash` propios en https://my.telegram.org.
- [ ] Revisar licencia y versión de mtcute; probar Workers/IndexedDB y transporte.
- [ ] Ampliar contrato de autenticación: teléfono/código/2FA y QR según soporte.
- [ ] Separar inequívocamente modo demo y modo real; no mezclar sus datos.
- [ ] Iniciar/cerrar sesión con una cuenta de pruebas y tratar cancelación/expiración.
- [ ] Cargar chats e historial paginado; mapear IDs sin pérdida de precisión.
- [ ] Recibir/enviar texto, suscribirse a actualizaciones y reconectar sin duplicados.
- [ ] Estados de envío correctos; nunca mostrar entrega confirmada antes de la respuesta real.
- [ ] Manejar errores de privacidad y `FLOOD_WAIT`.
- [ ] Redactar logs y establecer almacenamiento y limpieza segura de sesión.

**Salida:** prueba limitada de conexión, no distribución pública de un cliente incompleto. No activar un login aparente sin motor detrás.

## Etapa 2 — Cliente base usable

- [ ] Archivo, carpetas oficiales, búsqueda remota y mensajes guardados.
- [ ] Respuestas, edición, eliminación, reacciones, entidades de texto y adjuntos.
- [ ] Sincronización de lectura, escritura, presencia y mensajes autodestructivos según API.
- [ ] Caché con límites, descargas y estados de conexión.
- [ ] Multicuenta aislada y preferencias por cuenta.
- [ ] Bots reales: comandos, botones e inline; Mini Apps con revisión de seguridad aparte.
- [ ] Inventario de compatibilidad de funciones básicas, incluyendo mensajes patrocinados.
- [ ] Pruebas de contrato, integración con cuenta de pruebas, E2E y auditoría de accesibilidad.

**Salida:** cobertura y límites explícitos; revisión de cumplimiento antes de ofrecerlo al público.

## Etapa 3 — WRGram como herramienta de trabajo

- [ ] Notas persistidas con IDs reales compuestos por cuenta y chat.
- [ ] Plantillas editables, favoritos, etiquetas y recordatorios locales.
- [ ] Espacios de trabajo y panel contextual de bots.
- [ ] Temas, densidad, tamaño de texto y atajos avanzados.
- [ ] Acciones sobre mensajes seleccionados con permisos por recurso.
- [ ] Registro de capacidades y conexiones externas.

## Etapa móvil — Prueba temprana, producto después de estabilizar contratos

- [x] Base nativa Android con TDLib/JNI, acceso por teléfono/código/2FA, chats privados/grupos y texto; pendiente de validación real del propietario.
- [x] Ocho temas y sesión cifrada con clave protegida por Android Keystore; sin backup de datos.
- [ ] Validar TDLib en Android antes de generar una app extensa.
- [ ] Auditar/elegir puente nativo; comprobar licencia y mantenimiento.
- [ ] Completar pruebas de almacenamiento de claves, ciclo de vida y dispositivos físicos. La primera implementación se hace con vistas Android nativas, sin React Native.
- [ ] Validar TDLib/iOS en macOS y soporte de notificaciones/ciclo de vida.
- [ ] Desarrollar vistas nativas y reutilizar modelos/permisos del monorepo.
- [ ] Evaluar diferencias reales de plataforma: tareas en segundo plano, llamadas y secretos.

Prioridad confirmada: terminar y validar Android primero; luego escritorio .NET; después repositorios privados en GitHub y GitLab, excluyendo credenciales, claves de firma y sesiones. [Preparación de Play Console](android-play.md).

## Etapa 4 — Plataforma y monetización

- [ ] Backend con PostgreSQL y cuentas del producto separadas de Telegram.
- [ ] Definir SDK declarativo y aislamiento; pruebas con complementos maliciosos antes de terceros.
- [ ] Revisión, firmas, compatibilidad, actualización segura y revocación del catálogo.
- [ ] Validar propuesta de pago antes de crear cobros.
- [ ] Verificación de compras y webhooks; reglas de App Store/Google Play.
- [ ] Política de privacidad, retención/exportación/eliminación y evaluación legal.
- [ ] Despliegue HTTPS, CI, monitorización sin contenido de mensajes y revisión de seguridad.

## Condicionales

Traducción, transcripción, IA, automatizaciones y llamadas no tienen fecha comprometida. Dependen de evaluación de términos, motor, costes, permisos y plataforma. Ver [análisis de competencia](competition.md).
