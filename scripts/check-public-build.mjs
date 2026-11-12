import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const targets = process.argv.slice(2);
if (!targets.length) targets.push('apps/web/dist');
const privateKeys = ['TELEGRAM_API_HASH', 'GROQ_API_KEY', 'CLOUDFLARE_API_TOKEN'];
const localValues = new Map();
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && privateKeys.includes(match[1])) {
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value.length > 8) localValues.set(match[1], value);
    }
  }
}
for (const key of privateKeys) {
  if (process.env[key]?.length > 8) localValues.set(key, process.env[key]);
}

let count = 0;
function inspect(directory) {
  if (!existsSync(directory)) throw new Error('Falta un directorio de compilación que debía validarse.');
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { inspect(path); continue; }
    if (!entry.isFile()) continue;
    const bytes = readFileSync(path);
    count++;
    for (const [key, value] of localValues) {
      if (bytes.includes(Buffer.from(value))) throw new Error(`Publicación bloqueada: se detectó ${key} en un artefacto. No se mostrará su valor.`);
    }
    if (bytes.includes(Buffer.from('/__wrgram/telegram/config'))) {
      throw new Error('Publicación bloqueada: la prueba local de Telegram aparece en un artefacto público.');
    }
  }
}

try {
  for (const target of targets) inspect(resolve(root, target));
  console.log(`Build público validado: ${count} archivos sin las credenciales locales conocidas ni el endpoint de Telegram local.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo validar el build público.');
  process.exitCode = 1;
}
