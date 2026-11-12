import type { Chat, Message } from '@wrgram/core';

export const DEMO_CHATS: Chat[] = [
  { id: 'design', title: 'Estudio Creativo', initials: 'ec', color: 'violet', kind: 'group', preview: 'Lucía: Me encanta esta dirección ✨', time: '10:42', unread: 2, pinned: true, members: '5 miembros · conversación de ejemplo' },
  { id: 'sofia', title: 'Sofía Martínez', initials: 'SM', color: 'coral', kind: 'private', preview: '¿Un café y lo vemos con calma?', time: '10:38', unread: 1, pinned: true, members: 'Contacto de demostración' },
  { id: 'saved', title: 'Mensajes guardados', initials: '', color: 'blue', kind: 'private', preview: 'Un lugar para tus próximas ideas.', time: '09:56', unread: 0, pinned: true, members: 'Tu espacio personal · demostración' },
  { id: 'product', title: 'Producto & código', initials: 'p/', color: 'mint', kind: 'group', preview: 'Diego: Ya está lista la primera versión.', time: '09:41', unread: 0, members: '8 miembros · conversación de ejemplo' },
  { id: 'wrgram', title: 'WRGram Updates', initials: 'W', color: 'violet', kind: 'channel', preview: 'Una nueva forma de estar conectado.', time: 'Ayer', unread: 0, verified: true, members: 'Canal de demostración' },
  { id: 'bot', title: 'Asistente de ejemplo', initials: '', color: 'amber', kind: 'bot', preview: 'Explora tus complementos en el panel.', time: 'Ayer', unread: 0, members: 'Bot de demostración · sin conexión externa' },
  { id: 'alex', title: 'Álex Rivera', initials: 'AR', color: 'blue', kind: 'private', preview: '¡Perfecto! Hablamos mañana.', time: 'Ayer', unread: 0, members: 'Contacto de demostración' },
];

export const DEMO_MESSAGES: Message[] = [
  { id: 'd1', chatId: 'design', sender: 'Mateo', text: '¡Buenos días, equipo! ☀️\nEstuve pensando en el nuevo espacio que estamos creando.', outgoing: false, time: '10:30' },
  { id: 'd2', chatId: 'design', sender: 'Mateo', text: '¿Y si hacemos que cada conversación tenga sus propias herramientas? Todo en un mismo lugar, sin perder el foco.', outgoing: false, time: '10:31' },
  { id: 'd3', chatId: 'design', sender: 'Tú', text: 'Justo eso tenía en mente. Un espacio más nuestro, no solo otra app de mensajes.', outgoing: true, time: '10:35' },
  { id: 'd4', chatId: 'design', sender: 'Lucía', text: 'Me encanta esta dirección ✨\nPodríamos empezar con notas al lado del chat. Siempre termino perdiendo las ideas entre tantos mensajes.', outgoing: false, time: '10:42' },
  { id: 's1', chatId: 'sofia', sender: 'Sofía', text: '¡Hola! Tengo algunas ideas para el proyecto. ¿Un café y lo vemos con calma?', outgoing: false, time: '10:38' },
  { id: 'p1', chatId: 'product', sender: 'Diego', text: 'Ya está lista la primera versión. Tenemos la estructura, los permisos y un montón de ideas por delante. 🚀', outgoing: false, time: '09:41' },
  { id: 'w1', chatId: 'wrgram', sender: 'WRGram', text: 'Bienvenido a WRGram. Este es el primer prototipo: conversaciones de ejemplo, complementos con permisos y un espacio para tus ideas.\n\nTodavía no está conectado a Telegram.', outgoing: false, time: '09:00' },
  { id: 'b1', chatId: 'bot', sender: 'Asistente de ejemplo', text: 'Este bot es solo una conversación de muestra, no un servicio conectado. Puedes probar las notas y las respuestas rápidas desde Complementos.', outgoing: false, time: '09:00' },
  { id: 'a1', chatId: 'alex', sender: 'Álex', text: '¡Perfecto! Hablamos mañana.', outgoing: false, time: '18:24' },
];
