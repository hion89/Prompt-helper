import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_KEY, MAX_DIAGNOSTICS, sanitizeDiagnosticMessage, recordDiagnostic, readDiagnostics, clearDiagnostics } from '../shared/diagnostics.js';

test('diagnostics redact secrets, cap history, and can be cleared', async () => {
  const stored = {};
  globalThis.chrome = {
    runtime: { getManifest: () => ({ version: '1.8.0' }) },
    storage: { local: {
      async get(key) { return { [key]: structuredClone(stored[key]) }; },
      async set(value) { Object.assign(stored, structuredClone(value)); },
      async remove(key) { delete stored[key]; },
    } },
  };
  const secret = 'AIzaSyExampleSecretValue123456789';
  assert(!sanitizeDiagnosticMessage('key=' + secret + ' https://example.com/private?q=1').includes(secret));
  assert.equal(sanitizeDiagnosticMessage('https://example.com/private?q=1').includes('/private'), false);
  for (let index = 0; index < MAX_DIAGNOSTICS + 5; index++) {
    await recordDiagnostic({ scope: 'popup', action: 'test-' + index, site: 'chatgpt', message: 'failure ' + index + ' ' + secret });
  }
  const events = await readDiagnostics();
  assert.equal(events.length, MAX_DIAGNOSTICS);
  assert.equal(events[0].action, 'test-5');
  assert(events.every(event => !event.message.includes(secret)));
  assert.equal(events.at(-1).version, '1.8.0');
  await clearDiagnostics();
  assert.equal(DIAGNOSTIC_KEY in stored, false);
  delete globalThis.chrome;
});
