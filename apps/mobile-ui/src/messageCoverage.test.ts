import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const native = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const read = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('accounts for every MessageContent constructor in the packaged TDLib', () => {
  const bindings = read('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
  const constructors = [...bindings.matchAll(/class (Message\w+) extends MessageContent\b/g)].map(match=>match[1]);
  const handlers = ['NativeSnapshot.java','TdSession.java','ServiceMessages.java','MessageExtras.java']
    .map(file=>read(native+file)).join('\n');
  expect(constructors.length).toBeGreaterThan(100);
  expect(constructors.filter(name=>!new RegExp(`\\bTdApi\\.${name}\\b`).test(handlers))).toEqual([]);
});
