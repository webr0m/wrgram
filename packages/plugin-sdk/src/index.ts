export const PERMISSIONS = {
  'notes:read': {
    title: 'Leer tus notas locales',
    description: 'Acceder a las notas privadas que guardes en este navegador.',
  },
  'notes:write': {
    title: 'Guardar tus notas locales',
    description: 'Crear y editar notas asociadas a una conversación.',
  },
  'composer:write': {
    title: 'Preparar un borrador',
    description: 'Insertar texto en el editor. Nunca enviar mensajes por su cuenta.',
  },
} as const;

export type PluginPermission = keyof typeof PERMISSIONS;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: readonly PluginPermission[];
  surface: 'chat-panel' | 'composer';
  availability: 'available' | 'planned';
}

export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  {
    id: 'wrgram.notes', name: 'Notas privadas', version: '0.1.0',
    description: 'Tus ideas, al lado de cada conversación. Solo para ti.',
    author: 'WRGram', permissions: ['notes:read', 'notes:write'],
    surface: 'chat-panel', availability: 'available',
  },
  {
    id: 'wrgram.quick-replies', name: 'Respuestas rápidas', version: '0.1.0',
    description: 'Menos repetir. Más conversar. Tus frases, a un clic.',
    author: 'WRGram', permissions: ['composer:write'],
    surface: 'composer', availability: 'available',
  },
  {
    id: 'wrgram.workflows', name: 'Flujos de trabajo', version: '0.0.0',
    description: 'Conecta conversaciones con tus herramientas de trabajo.',
    author: 'WRGram', permissions: [],
    surface: 'chat-panel', availability: 'planned',
  },
];
