# Competencia: qué aprender y cómo diferenciar WRGram

**Revisión documental: 5 de noviembre de 2026.**

Fuentes: páginas oficiales y repositorios enlazados al final. No se instalaron ni auditaron binarios de competidores. Una función anunciada puede variar por plataforma, versión, plan o despliegue; no interpretamos mensajes de marketing como garantías de seguridad, rendimiento o disponibilidad.

## Conclusión principal

**Tener plugins no basta para ser diferente:** exteraGram ya documenta un motor de complementos Python con acceso al cliente Android. Nuestra hipótesis de diferenciación es combinar:

1. Experiencia coherente en web, Android e iOS.
2. Complementos pequeños con permisos comprensibles y acceso mínimo a datos.
3. Bots y herramientas contextuales integrados al flujo del chat, no una simple lista de enlaces.
4. Productividad: notas, tareas y plantillas junto a cada conversación.
5. Monetización de valor propio sin vender desbloqueos ficticios de Telegram Premium.

Esto es un **posicionamiento a validar**, no la afirmación de que nadie más lo ofrece.

## Comparativa

| Referencia | Evidencia documental relevante | Qué adoptar en WRGram | Límites y coste |
|---|---|---|---|
| **exteraGram** | Plugins Python integrados; hooks sobre solicitudes, actualizaciones y mensajes; ajustes propios; interoperabilidad Java y hooks estilo Xposed. | Manifiestos, ciclo de vida, configuración, catálogo y herramientas para desarrolladores. Es la referencia más próxima a la idea de extensiones. | No copiar el acceso general al proceso ni asumir portabilidad a iOS/web. Empezar con contratos declarativos y capacidades limitadas. Su código/plugin no es compatible con nuestro SDK por ser Python. |
| **Nekogram** | Personalización de navegación, emojis e iconos de carpetas; controles de stickers; traducción por mensaje/chat/artículo con varios motores; anuncia transcripción. | Personalización modular, densidad visual y proveedor de traducción configurable. | Traducir/transcribir puede sacar contenido fuera del dispositivo. Requiere revisión de términos, consentimiento y retención; no activarlo globalmente. |
| **Nicegram** | Su FAQ enumera multicuenta, traducción, respuestas rápidas, bloqueo inmediato, selección masiva, caché y herramientas de IA. | Flujos de productividad, respuestas rápidas, caché comprensible, bloqueo local y organización. | No prometer cuentas «ilimitadas», trasladar sesiones o IA sin validar límites, seguridad y términos vigentes. Las características varían entre plataformas. |
| **Plus Messenger** | Personalización de colores/tamaños/temas; opciones de nombre original de archivos, compresión y ajustes del chat. Su ficha de Google Play detalla pestañas por tipo, categorías y acciones masivas. | Filtros por contactos/grupos/canales/bots, favoritos locales, temas, ajustes de tamaño y selección masiva con confirmación. | Diferenciar organización local de carpetas y límites del servidor. No vender cambios visuales como nuevas capacidades del protocolo. |
| **Unigram** | Cliente Windows basado en TDLib reconocido en la página de apps de Telegram; documentación extensa de atajos y navegación. | Navegación por teclado, accesibilidad, paneles adaptables y experiencia cuidada según plataforma. | Es referencia de UX y motor, no una base React Native reutilizable. No estamos añadiendo una versión Windows en esta etapa. |
| **Forkgram / Fork Client Android** | README: orden de chats no leídos, accesos al perfil y primer mensaje, controles de cámara, metadatos de reenvío y fijados locales sin sincronización. | Acciones contextuales, navegación rápida y controles multimedia. Privacidad por defecto, sin telemetría adicional innecesaria. | No copiar todas las modificaciones sin revisión. Los fijados locales no equivalen a aumentar límites de Telegram; los datos de presencia solo pueden mostrar lo que el servidor autoriza. |
| **Telegram X** *(oficial alternativo)* | Telegram lo presenta como cliente experimental Android basado en TDLib. | Referencia técnica para evaluar TDLib y comportamiento móvil. | No atribuirle mejoras concretas no verificadas ni tratarlo como un cliente externo de plugins. |
| **Telegram Web A / K** *(oficiales)* | Clientes web oficiales con código abierto. | Referencia de compatibilidad, autenticación, accesibilidad y comportamiento web. | Son la línea base a alcanzar, no un diferencial. Reutilizar código GPL exige revisar obligaciones; no hemos copiado su código. |

## Funciones recomendadas por prioridad

### P0 — Primero, un cliente confiable

- Autenticación real y sesiones protegidas; cierre de sesión que elimine los datos de sesión.
- Chats, historial paginado, mensajes, estados correctos, reconexión y sincronización.
- Carpetas oficiales, archivo, búsqueda y mensajes guardados.
- Adjuntos, edición, eliminación y formatos de mensaje con semántica compatible.
- Comandos, botones e interacción básica con bots existentes.
- Gestión de errores de privacidad y `FLOOD_WAIT`, sin reintentos agresivos.
- Plan de soporte de funciones básicas y mensajes patrocinados antes de distribuir.

No es razonable cobrar por una capa de extras si falla esta base.

### P1 — Productividad y personalización

- Notas privadas por chat (**demo implementada**, no notas cifradas de producción).
- Respuestas rápidas propias (**demo implementada**, no Telegram Business Quick Replies).
- Filtros por tipo y no leídos (**demo implementada**), favoritos y etiquetas locales.
- Temas claro/oscuro, tamaño de texto, densidad y preferencias de accesibilidad.
- Paleta de comandos, atajos y acciones contextuales.
- Caché y descargas: límites, progreso, limpieza y nombres originales.
- Multicuenta con contenedores y borrado aislados; no prometer límites no validados.

### P2 — Diferenciación de WRGram

- Panel contextual de bots por conversación: comandos fijados y formularios compatibles.
- Convertir **un mensaje seleccionado** en una tarea o nota, con permiso concreto.
- Espacios de trabajo personales/profesionales y vistas de pendientes.
- SDK declarativo: paneles, formularios, acciones y ajustes con permisos por recurso.
- Registro visible de acceso a datos, revocación y conexiones externas.
- Catálogo revisado, compatibilidad por versión y desactivación segura ante fallos.
- Conectores opt-in a tareas/calendario/CRM con OAuth y límites explícitos.

### P3 — Condicionales, no promesas comerciales

- Traducción y transcripción: análisis de términos, costes y privacidad por proveedor.
- IA generativa/resúmenes: los términos actuales de Telegram contienen restricciones amplias sobre uso de sus datos para IA. Requiere evaluación jurídica y técnica específica, **no basta con ver que otro cliente lo anuncia ni con añadir una casilla de consentimiento**.
- Sincronización cifrada de notas propias: modelo de claves, recuperación y exportación antes de implementarla.
- Automatizaciones: habilitación explícita, vista previa, límites antiabuso y reglas por cuenta.
- Funciones Business, Mini Apps, llamadas y chats secretos: estudiar soporte de motor/plataforma. No asumir que estarán disponibles en la web o en todas las cuentas.

## Qué NO copiar

- Ghost mode que falsee lectura, presencia o escritura.
- Conservar mensajes autodestructivos contra su semántica o prometer recuperación de contenido borrado.
- Desbloquear Telegram Premium, aumentar límites del servidor artificialmente o evitar sus mensajes patrocinados.
- Saltarse restricciones de contenido, privacidad, reenvío o permisos de administradores.
- Automatizar acciones ocultas o enviar mensajes masivos no solicitados.
- Dar acceso completo a conversaciones/sesiones a cualquier complemento.
- Afirmar cifrado de extremo a extremo para todos los chats: los chats en la nube y los chats secretos tienen modelos distintos.

## Monetización propuesta, aún sin implementar

**Gratis:** cliente base usable, accesibilidad, control de seguridad y complementos básicos.

**WRGram Pro, sujeto a validar demanda:** espacios de trabajo avanzados, plantillas personalizadas, conectores profesionales, automatizaciones autorizadas y sincronización opcional de datos propios.

La seguridad y la posibilidad de revocar permisos no deberían ser características de pago. La suscripción de WRGram no incluye Telegram Premium. Las compras móviles y el posible marketplace requieren revisar comisiones y reglas de las tiendas; no elegimos aún un proveedor de pagos.

## Licencias

Nos inspiramos en comportamientos y problemas resueltos, no copiamos código ni marcas. Varios proyectos de referencia y clientes oficiales usan GPL. Antes de reutilizar una línea, un recurso o una dependencia hay que inventariar su licencia, atribución y obligaciones de distribución. Todavía no se ha decidido una licencia de publicación para WRGram.

## Fuentes

- exteraGram: https://plugins.exteragram.app/docs
- Catálogo de plugins exteraGram: https://plugins.exteragram.app/docs/plugin-repositories
- Nekogram: https://nekogram.app/ y https://github.com/Nekogram/Nekogram
- Nicegram: https://nicegram.me/faq
- Plus Messenger: https://www.plusmessenger.org/
- Ficha oficial Plus Messenger: https://play.google.com/store/apps/details?id=org.telegram.plus
- Unigram: https://github.com/UnigramDev/Unigram
- Atajos Unigram: https://github.com/UnigramDev/Unigram/blob/develop/Documentation/Shortcuts.md
- Fork Client Android: https://github.com/forkgram/TelegramAndroid
- Clientes oficiales y licencias: https://telegram.org/apps
- API de bots: https://core.telegram.org/api/bots
- Términos de API: https://core.telegram.org/api/terms

Actualizar esta comparación antes de decidir funciones comerciales o de reutilizar código. No se ha hecho una auditoría independiente de las afirmaciones de privacidad de estos proyectos.
