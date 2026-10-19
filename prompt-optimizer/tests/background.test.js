import test from 'node:test';
import assert from 'node:assert/strict';
test('background protects credentials and always uses Gemini despite legacy provider input', async () => {
  let listener;
  let permissionAllowed = true;
  const local = { settings: { optimizerProvider: 'local', obsoletePlaceholder: true }, 'po-api-key:openai': 'legacy-local-key' };
  const session = { 'po-api-key:openai': 'legacy-session-key' };
  const makeStore = entries => ({ async setAccessLevel() {}, async get(key) { return { [key]: entries[key] }; }, async set(values) { Object.assign(entries, values); }, async remove(key) { delete entries[key]; } });
  globalThis.chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: makeStore(local), session: makeStore(session), onChanged: { addListener() {} } },
    permissions: { async contains() { return permissionAllowed; } },
    tabs: { async query() { return []; }, async sendMessage() {} },
  };
  await import('../background/background.js');
  const send = (message, sender) => new Promise(resolve => { const pending = listener(message, sender, resolve); if (!pending) resolve(undefined); });
  const site = { id: 'test-extension', url: 'https://chatgpt.com/' };
  const options = { id: 'test-extension', url: 'chrome-extension://test-extension/options/options.html' };
  assert.equal((await send({ type: 'API_SAVE_KEY', provider: 'gemini', key: 'private-key-test' }, site)).ok, false);
  assert.equal((await send({ type: 'API_STATUS' }, site)).ok, false);
  assert.equal((await send({ type: 'API_STATUS' }, options)).status.gemini.ready, false);
  const save = await send({ type: 'API_SAVE_KEY', provider: 'gemini', key: 'private-key-test' }, options);
  assert.equal(save.ok, true);
  assert(!JSON.stringify(save).includes('private-key-test'));
  assert.equal((await send({ type: 'API_SAVE_MODEL', provider: 'gemini', model: 'gemini-2.5-flash' }, site)).ok, false);
  assert.equal((await send({ type: 'API_SAVE_MODEL', provider: 'gemini', model: 'invalid-model' }, options)).ok, false);
  assert.equal(save.status.gemini.ready, true);
  permissionAllowed = false;
  const noPermission = (await send({ type: 'API_STATUS' }, options)).status.gemini;
  assert.equal(noPermission.configured, true);
  assert.equal(noPermission.granted, false);
  assert.equal(noPermission.ready, false);
  permissionAllowed = true;
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
    assert(url.includes('/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse'));
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
  const minimized = await send({ type: 'SET_TOOLBAR_STATE', enabled: true, minimized: true }, site);
  assert.equal(minimized.settings.toolbarEnabled, true);
  assert.equal(minimized.settings.toolbarMinimized, true);
  assert.equal((await send({ type: 'SET_TOOLBAR_STATE', minimized: false }, site)).settings.toolbarMinimized, false);
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
  local.settings = { ...local.settings, targetVariants: { chatgpt: 'gpt-4.1', claude: 'claude-opus-5-5' }, mode: 'custom', customType: 'manual', customInstructions: 'PRIVATE_OWNER_REWRITE_INSTRUCTIONS' };
  const customPublic = await send({ type: 'GET_PUBLIC_SETTINGS' }, site);
  assert.equal(customPublic.api.ready, true);
  assert.equal(customPublic.api.configured, true);
  assert.equal('customInstructions' in customPublic.settings, false);
  assert(!JSON.stringify(customPublic).includes('PRIVATE_OWNER_REWRITE_INSTRUCTIONS'));
  assert.equal('customInstructions' in (await send({ type: 'SET_TOOLBAR_STATE', enabled: true }, site)).settings, false);
  globalThis.fetch = async (url, options) => {
    const input = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.equal(input.customOptimization.type, 'manual');
    assert.equal(input.customOptimization.instructions, 'PRIVATE_OWNER_REWRITE_INSTRUCTIONS');
    assert.equal(input.targetVariant, 'claude-opus-5-5', 'page uses saved destination variant, not the current popup brand or page-supplied version');
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Custom result' }] } }] }) };
  };
  const customResult = await send({ type: 'OPTIMIZE', text: 'Rewrite this', settings: { customType: 'auto', customInstructions: 'UNTRUSTED_OVERRIDE', targetModel: 'claude', targetVariants: { claude: 'claude-haiku-5-5' } } }, site);
  assert.equal(customResult.ok, true);
  assert.equal(customResult.result.meta.customType, 'manual');
  globalThis.fetch = oldFetch;
  const modelSaved = await send({ type: 'API_SAVE_MODEL', provider: 'gemini', model: 'gemini-2.5-flash' }, options);
  assert.equal(modelSaved.ok, true);
  assert.equal(modelSaved.status.gemini.model, 'gemini-2.5-flash');
  assert.equal(local.settings.geminiModel, 'gemini-2.5-flash');
  assert.equal(local.settings.geminiModelSelected, true);
  assert.equal(local.settings.mode, 'custom');
  assert(!JSON.stringify(modelSaved).includes('private-key-test'));
  const blocked = await send({ type: 'OPTIMIZE', text: 'hello' }, { id: 'other', url: 'https://chatgpt.com/' });
  assert.equal(blocked.ok, false);
  delete globalThis.chrome;
});
