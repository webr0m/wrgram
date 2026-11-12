import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../apps/mobile-ui/dist/',import.meta.url));
const markers=['María Fernández','Equipo de diseño','Recordatorio de tu próximo evento','Vista de diseño · datos sintéticos','WRGRAM_FIXTURE','TELEGRAM_API_HASH','TELEGRAM_API_ID','addJavascriptInterface','localStorage','sessionStorage'];
let count=0;
function inspect(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory()){inspect(path);continue;}const text=readFileSync(path,'utf8');for(const marker of markers)if(text.includes(marker))throw new Error('El build móvil contiene un marcador de desarrollo o almacenamiento no permitido.');if(entry.name.endsWith('.map'))throw new Error('No se distribuyen mapas de fuentes de la UI.');count++;}}
inspect(root);console.log(`Interfaz Android validada: ${count} assets locales, sin fixtures ni credenciales de Telegram.`);
