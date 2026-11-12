/** Owner-supplied catalogue, installed by default; no payment tier or automatic bot permissions. */
export const BUILT_IN_APPS = [
  { id:'groupbutler', username:'GroupButlerEsp_bot', name:'Group Butler Español', description:'Administración de grupos.', category:'Grupos' },
  { id:'antiu', username:'antiubot', name:'AntiU', description:'Control de grupos contra bots y usuarios automatizados.', category:'Grupos' },
  { id:'compressor', username:'anycompressorbot', name:'Any Compressor', description:'Comprime archivos en distintos formatos.', category:'Archivos' },
  { id:'shorten', username:'WRShorten_bot', name:'WR Shorten', description:'Acorta URLs desde su Mini App.', category:'Enlaces' },
  { id:'downloads', username:'mutidlprobot', name:'MultiDL Pro', description:'Descargas de archivos y medios que tengas derecho a descargar.', category:'Archivos' },
  { id:'snake', username:'Wrsnakebot', name:'WR Snake', description:'Juega Snake desde su Mini App.', category:'Juegos' },
] as const;
