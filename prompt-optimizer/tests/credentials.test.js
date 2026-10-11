import test from 'node:test';
import assert from 'node:assert/strict';
import { protectStorage, readKey, saveKey, deleteKey, keyStatus } from '../background/credentials.js';
test('keys are restricted, status never reveals them, session is default, persistence and deletion work', async () => {
  const levels = [];
  function store(name) {
    const entries = {};
    return { async setAccessLevel(level) { levels.push([name, level.accessLevel]); }, async get(key) { return { [key]: entries[key] }; }, async set(value) { Object.assign(entries, value); }, async remove(key) { delete entries[key]; } };
  }
  globalThis.chrome = { storage: { local: store('local'), session: store('session') } };
  await protectStorage();
  assert.deepEqual(levels, [['local', 'TRUSTED_CONTEXTS'], ['session', 'TRUSTED_CONTEXTS']]);
  await saveKey('gemini', 'test-key-not-real');
  assert.equal(await readKey('gemini'), 'test-key-not-real');
  assert.equal((await keyStatus()).gemini.persistent, false);
  assert(!JSON.stringify(await keyStatus()).includes('test-key-not-real'));
  await saveKey('gemini', 'another-test-key', true);
  assert.equal((await keyStatus()).gemini.persistent, true);
  await saveKey('gemini', 'session-replacement-key', false);
  assert.equal((await keyStatus()).gemini.persistent, false);
  await deleteKey('gemini');
  assert.equal(await readKey('gemini'), '');
  assert.equal((await keyStatus()).gemini.configured, false);
  await assert.rejects(saveKey('unknown', 'test-key-not-real'));
  await assert.rejects(saveKey('openai', 'valid-looking-legacy-key'));
  delete globalThis.chrome;
});
