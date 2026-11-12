import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('.', import.meta.url));

const sources = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(root, dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'dist' && entry !== 'node_modules') sources(join(dir, entry), out);
    } else if (/\.(ts|tsx|html|java|xml)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
};

const scanned = ['web/src', 'mobile-ui/src', 'mobile/android/app/src/main', 'web/public/android'].flatMap((dir) => sources(dir));
const label = (path: string) => path.slice(root.length).replace(/\\/g, '/');

describe('textos de cara al usuario coherentes con el estado real', () => {
  it('no filtra rutas internas ni instrucciones de compilación', () => {
    const offenders = scanned.filter((path) => /\.private\/|google-services\.json|y recompila/.test(readFileSync(path, 'utf8')));
    expect(offenders.map(label)).toEqual([]);
  });

  it('no anuncia como próximo lo que ya está en Play ni como pendiente lo que la compilación trae', () => {
    const offenders = scanned.filter((path) => {
      const text = readFileSync(path, 'utf8');
      return /PRÓXIMAMENTE EN<\/small><strong>Google Play|ANDROID \+ IOS, EN CAMINO|Push no está operativo en esta compilación|push FCM hasta que el propietario/.test(text);
    });
    expect(offenders.map(label)).toEqual([]);
  });

  it('mantiene el estado inicial sin cuenta en la versión que se está compilando', () => {
    const properties = readFileSync(join(root, 'mobile/android/version.properties'), 'utf8');
    const versionName = /versionName=(\S+)/.exec(properties)?.[1];
    const versionCode = /versionCode=(\d+)/.exec(properties)?.[1];
    const contract = readFileSync(join(root, 'mobile-ui/src/contract.ts'), 'utf8');
    expect(contract).toContain(`version: '${versionName}'`);
    expect(contract).toContain(`currentVersionCode:${versionCode}`);
    expect(versionName).toMatch(/^1\.0\.0-beta/);
    expect(Number(versionCode)).toBeGreaterThan(33);
  });
});
