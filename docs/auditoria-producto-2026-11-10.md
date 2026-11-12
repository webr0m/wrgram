# Auditoría de WRGram · 10 de noviembre de 2026

## Cambios aplicados

| Hallazgo | Corrección | Alcance |
| --- | --- | --- |
| El archivo quedaba en el menú y el estado vacío sugería cargar más sin ofrecer un botón. | Accesos directos a Guardados y Archivados, estados de carga y vacío, contador y paginación visible. El botón de nueva conversación queda junto al pie de la lista. | Android y Windows, con el acceso de nueva conversación en Android. |
| La lista virtual suponía un alto fijo. Un cambio de filtro o de tamaño podía dejar el área visible sin filas. | La ventana se calcula con el alto real, la densidad y el tamaño de texto. Se ajusta al reducir resultados. | Android y Windows. |
| Navegar entre chats requería pasar por la lista y las búsquedas distinguían tildes. | Acceso rápido con Ctrl/Cmd+K o el botón de rayo. Acepta flechas y Enter y devuelve el foco al cerrar. Busca por nombre, usuario y vista previa de los chats cargados. | Android con teclado físico y Windows. El botón está disponible también en pantallas táctiles. |
| Los borradores en foros compartían la clave del chat. Una confirmación tardía podía limpiar el compositor de otra conversación. | Se identifican por cuenta, chat y tema. Android recupera el borrador del tema desde TDLib y ambos puentes verifican el destino antes de enviar. Enter respeta la composición de caracteres del teclado. | Android y Windows. La sincronización de temas corresponde a Android. |
| Una página atrasada podía mezclarse con una consulta nueva y repetir resultados. | La búsqueda invalida páginas de consultas anteriores y deduplica por chat y mensaje. El puente Android valida además el cursor y la consulta. | Búsqueda de mensajes en Android. |
| Los mensajes antiguos eran difíciles de localizar y el fijado solo saltaba si el mensaje ya estaba cargado. | Separadores reales por día, salto al historial de un fijado y calendario conectado a TDLib. El calendario abre el último mensaje hasta el final de la fecha elegida. | Separadores en ambas plataformas. Salto por fecha en chats normales de Android, fuera de foros y chats secretos. |
| La bandeja cargaba todo el catálogo de emojis al arrancar. | El catálogo, el selector y la vista de WR IA se cargan al abrirlos. Se reutilizan formateadores y se evita recalcular filtros o reaplicar temas en cada pulsación. | Interfaz compartida. |

La referencia para el salto es la operación de historial de TDLib. [GetChatMessageByDate](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_message_by_date.html)

## Brechas frente a otros clientes

| Prioridad | Qué seguir implementando | Referencia |
| --- | --- | --- |
| Alta | Buscar conversaciones más allá de la lista cargada, con búsqueda local de TDLib, resultados públicos en una sección separada y recientes por cuenta. En Windows, llevar al puente la búsqueda dentro del chat y el salto a contexto. | [Búsquedas recientes en Telegram](https://telegram.org/blog/shared-links) · [Unigram para Windows](https://github.com/UnigramDev/Unigram) |
| Alta | Dar a Guardados una vista por chat de origen. Añadir filtros y calendario a una galería de multimedia compartida. | [Guardados 2.0](https://telegram.org/blog/new-saved-messages-and-9-more) · [Calendario multimedia](https://telegram.org/blog/shared-media-scrolling-calendar-join-requests-and-more) |
| Alta | Probar push con la app cerrada, cambio de cuenta durante una notificación, reanudación de descargas y consumo con historiales grandes en dispositivos reales. Luego sumar reglas de descarga por red y tamaño. | [Telegram FAQ](https://www.telegram.org/faq) |
| Media | Añadir transcripción de notas de voz con consentimiento y un proveedor bien identificado. Ampliar la traducción individual de Android a una vista de traducción por conversación con un control explícito. | [Nekogram](https://nekogram.app/) |
| Media | Mejorar el envío de vídeo con una vista previa y control de compresión. Exponer densidad e iconos de carpeta donde se usan. | [Plus Messenger](https://plusmessenger.org/) · [Kotatogram](https://github.com/kotatogram/kotatogram-desktop/blob/dev/README.md) |
| Proyecto propio | Integrar llamadas de voz y vídeo. Requiere motor de medios, permisos, audio en segundo plano, manejo de dispositivos y pruebas cruzadas. | [Telegram FAQ](https://www.telegram.org/faq) · [Unigram](https://github.com/UnigramDev/Unigram) |

WRGram ya tiene carpetas, búsqueda de mensajes con filtros en Android, programación de mensajes, Mini Apps y temas propios. La mayor diferencia entre plataformas está en el alcance del puente de Windows, que usa WTelegramClient. La interfaz compartida permite reutilizar controles, pero cada operación necesita soporte en su transporte.

## Verificación

- Pasaron 293 pruebas de Vitest y 93 pruebas unitarias nativas. Android completó lint sin incidencias y Windows compiló sin advertencias.
- El APK de depuración contiene la interfaz actualizada y arrancó en el emulador.
- Las pruebas con datos sintéticos cubrieron calendario, navegación por teclado, archivo, paginación y borradores por tema. Se revisaron la bandeja y el chat a 320 px.
- El JavaScript inicial pasó de 732,83 kB a 576,24 kB en el build local al diferir el selector y el catálogo de emojis.
- Quedan por probar con una cuenta real la búsqueda por fecha de TDLib, la sincronización de borradores entre clientes y la entrega de notificaciones en segundo plano.
