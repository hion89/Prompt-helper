import test from 'node:test';
import assert from 'node:assert/strict';
test('background protects credentials and always uses Gemini despite legacy provider input', async () => {
  let listener;
  const local = { settings: { optimizerProvider: 'local', obsoletePlaceholder: true }, 'po-api-key:openai': 'legacy-local-key' };
  const session = { 'po-api-key:openai': 'legacy-session-key' };
  const makeStore = entries => ({ async setAccessLevel() {}, async get(key) { return { [key]: entries[key] }; }, async set(values) { Object.assign(entries, values); }, async remove(key) { delete entries[key]; } });
  globalThis.chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: makeStore(local), session: makeStore(session), onChanged: { addListener() {} } },
    permissions: { async contains() { return true; } },
    tabs: { async query() { return []; }, async sendMessage() {} },
  };
  await import('../background/background.js');
  const send = (message, sender) => new Promise(resolve => { const pending = listener(message, sender, resolve); if (!pending) resolve(undefined); });
  const site = { id: 'test-extension', url: 'https://chatgpt.com/' };
  const options = { id: 'test-extension', url: 'chrome-extension://test-extension/options/options.html' };
  assert.equal((await send({ type: 'API_SAVE_KEY', provider: 'gemini', key: 'private-key-test' }, site)).ok, false);
  assert.equal((await send({ type: 'API_STATUS' }, site)).ok, false);
  const save = await send({ type: 'API_SAVE_KEY', provider: 'gemini', key: 'private-key-test' }, options);
  assert.equal(save.ok, true);
  assert(!JSON.stringify(save).includes('private-key-test'));
  const oldFetch = globalThis.fetch;
  let lookupCalls = 0;
  globalThis.fetch = async (url, options) => {
    lookupCalls++;
    assert.equal(options.headers['x-goog-api-key'], 'private-key-test');
    if (options.method === 'GET') {
      assert(url.includes('/v1beta/models?pageSize=1000'));
      return { ok: true, json: async () => ({ models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      ] }) };
    }
    assert.equal(options.method, 'POST');
    assert(url.includes('/models/gemini-3.5-flash-lite:generateContent'));
    return { ok: true, json: async () => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Optimized prompt' }] } }],
      usageMetadata: { totalTokenCount: 24 },
    }) };
  };
  assert.equal((await send({ type: 'API_LIST_MODELS', provider: 'gemini' }, site)).ok, false);
  const modelList = await send({ type: 'API_LIST_MODELS', provider: 'gemini' }, options);
  assert.deepEqual(modelList.models, [{ id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' }]);
  assert(!JSON.stringify(modelList).includes('private-key-test'));
  assert.equal(lookupCalls, 1);
  const pub = await send({ type: 'GET_PUBLIC_SETTINGS' }, site);
  assert(!JSON.stringify(pub).includes('private-key-test'));
  assert.equal('obsoletePlaceholder' in pub.settings, false);
  assert.equal('optimizerProvider' in pub.settings, false);
  assert.equal('obsoletePlaceholder' in local.settings, false, 'startup migration removes obsolete settings');
  assert.equal('po-api-key:openai' in local, false, 'startup migration removes legacy OpenAI local key');
  assert.equal('po-api-key:openai' in session, false, 'startup migration removes legacy OpenAI session key');
  const hidden = await send({ type: 'SET_TOOLBAR_STATE', enabled: false }, site);
  assert.equal(hidden.ok, true);
  assert.equal(hidden.settings.toolbarEnabled, false);
  const moved = await send({ type: 'SET_TOOLBAR_STATE', position: { x: 0.2, y: 0.8 } }, site);
  assert.deepEqual(moved.settings.toolbarPositions.chatgpt, { x: 0.2, y: 0.8 });
  const resetPosition = await send({ type: 'SET_TOOLBAR_STATE', position: null }, site);
  assert.deepEqual(resetPosition.settings.toolbarPositions, {});
  assert.equal((await send({ type: 'SET_TOOLBAR_STATE', position: { x: 2, y: 0 } }, site)).ok, false);
  const result = await send({ type: 'OPTIMIZE', text: 'Explain gravity', settings: { optimizerProvider: 'local', targetModel: 'claude' } }, site);
  assert.equal(result.ok, true);
  assert.equal(result.result.meta.provider, 'gemini');
  assert.equal(result.result.ir.targetModel, 'claude');
  assert.equal(lookupCalls, 2);
  globalThis.fetch = oldFetch;
  const blocked = await send({ type: 'OPTIMIZE', text: 'hello' }, { id: 'other', url: 'https://chatgpt.com/' });
  assert.equal(blocked.ok, false);
  delete globalThis.chrome;
});
