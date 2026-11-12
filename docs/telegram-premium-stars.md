# Auditoría de Telegram Premium y Stars en WRGram beta12

La comparación cubre el código Android y la interfaz que usa TDLib. «Disponible» significa que existe un flujo en WRGram; Telegram sigue decidiendo los permisos, precios y elegibilidad de la cuenta.

| Flujo de Telegram | Estado en WRGram |
| --- | --- |
| Premium: estado, ventajas, límites, stickers y planes regionales | Consulta de Telegram. Los precios se muestran como referencia. |
| Premium: comprar, cambiar o cancelar el plan con dinero real | Se gestiona en Telegram oficial; WRGram refleja el estado. |
| Premium: regalos | Vista previa y canje de códigos. La compra y el envío de Premium no están integrados. |
| Premium: impulsos | Selección y uso de los cupos disponibles. Los impulsos de este flujo no gastan Stars. |
| Stars: saldo, movimientos, filtros, paginación y paquetes | Consulta en WRGram. La recarga con dinero real se hace en Telegram oficial. |
| Stars: facturas de bot, suscripciones recurrentes de bot y reacciones pagadas | Flujo con confirmación. El saldo y el estado final los decide Telegram. |
| Stars: suscripciones de canales | Ahora se pueden crear invitaciones de pago con permiso para invitar; al abrirlas, se puede confirmar el importe recurrente o reutilizar una suscripción vigente. Las suscripciones existentes se consultan y se pueden detener o reanudar según su estado. |
| Stars: ingresos y retirada | Estadísticas según permisos y retirada a Fragment para titulares compatibles y elegibles. |
| Stars: regalos de Telegram | Catálogo, envío y acciones de gestión disponibles según cada regalo. |
| Stars: multimedia y mensajes de pago, sorteos y afiliados | Sin flujos completos en WRGram. |

Referencias: [Telegram Premium](https://core.telegram.org/api/premium), [Telegram Stars](https://core.telegram.org/api/stars), [suscripciones](https://core.telegram.org/api/subscriptions) y [pagos](https://core.telegram.org/api/payments).

Las pruebas del puente comprueban que los flujos de pago con saldo existente no habilitan compras con dinero real. Una validación de extremo a extremo de la nueva invitación requiere un canal de prueba y una segunda cuenta con saldo de Stars. No se necesita realizar una transacción para verificar la bandeja ni las pestañas.
