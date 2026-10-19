import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings, getSettings, saveSettings } from '../shared/settings.js';

test('invalid/missing storage settings are normalized without unknown keys', () => {
  for (const bad of [null, false, [], 'wrong', {}]) assert.deepEqual(normalizeSettings(bad), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ mode: 'precision', targetModel: 'invalid', apiKey: 'ignored' }), { ...DEFAULT_SETTINGS, mode: 'precision' });
});
test('legacy Gemini default moves to current default while explicit selection is preserved', () => {
  assert.equal(normalizeSettings({ geminiModel: 'gemini-2.5-flash-lite' }).geminiModel, 'gemini-3.5-flash-lite');
  assert.equal(normalizeSettings({ geminiModel: 'gemini-2.5-flash-lite', geminiModelSelected: true }).geminiModel, 'gemini-2.5-flash-lite');
  assert.equal(normalizeSettings({ geminiModel: 'gemini-3.1-flash-lite', geminiModelSelected: true }).geminiModel, 'gemini-3.1-flash-lite');
});
test('legacy provider selections are removed because Gemini is fixed', () => {
  assert.equal('optimizerProvider' in normalizeSettings({ optimizerProvider: 'local' }), false);
  assert.equal('optimizerProvider' in normalizeSettings({ optimizerProvider: 'openai' }), false);
});
test('Custom preferences migrate, filter concepts, and bound reusable instructions', () => {
  const custom = normalizeSettings({ mode: 'custom', customType: 'manual', customInstructions: 'a'.repeat(6001), customConcepts: ['friendly', 'accuracy', 'friendly', 'unknown'] });
  assert.equal(custom.mode, 'custom');
  assert.equal(custom.customType, 'manual');
  assert.equal(custom.customInstructions.length, 6000);
  assert.deepEqual(custom.customConcepts, ['accuracy', 'friendly']);
  assert.equal(normalizeSettings({ customType: 'invalid', customInstructions: 123 }).customType, 'auto');
  assert.deepEqual(normalizeSettings({ customConcepts: [] }).customConcepts, []);
  assert.deepEqual(normalizeSettings({ mode: 'custom' }).customConcepts, ['accuracy', 'clarity']);
});
test('toolbar visibility and per-site positions are normalized', () => {
  const configured = normalizeSettings({ toolbarEnabled: false, toolbarPositions: { chatgpt: { x: 1.4, y: -1 }, gemini: { x: 0.25, y: 0.75 }, unknown: { x: 0.5, y: 0.5 } } });
  assert.equal(configured.toolbarEnabled, false);
  assert.deepEqual(configured.toolbarPositions, { chatgpt: { x: 1, y: 0 }, gemini: { x: 0.25, y: 0.75 } });
  assert.deepEqual(normalizeSettings({ toolbarPositions: { chatgpt: { x: 'bad', y: 0 } } }).toolbarPositions, {});
});
test('destination variants are brand-scoped and migrate safely; minimize is separate from hiding', () => {
  const normalized = normalizeSettings({ targetModel: 'claude', targetVariants: { chatgpt: 'gpt-4.1', claude: 'gpt-4.1', gemini: 'gemini-3.5-flash-lite', unknown: 'x' }, toolbarMinimized: true });
  assert.deepEqual(normalized.targetVariants, { chatgpt: 'gpt-4.1', claude: 'general', gemini: 'gemini-3.5-flash-lite', other: 'general' });
  assert.equal(normalized.toolbarMinimized, true);
  assert.equal(normalized.toolbarEnabled, true);
  assert.equal(normalizeSettings({ targetModel: 'perplexity' }).targetModel, 'chatgpt');
  assert.equal(normalizeSettings({ targetVariants: { chatgpt: 'openai/gpt-4.1' } }).targetVariants.chatgpt, 'gpt-4.1');
  assert.equal(normalizeSettings({ targetVariants: { claude: 'openai/gpt-4.1' } }).targetVariants.claude, 'general');
});
test('rapid preference writes preserve previous settings and recover after errors', async () => {
  let stored = {};
  let fail = false;
  globalThis.chrome = { storage: { local: {
    async get() { return structuredClone(stored); },
    async set(value) { if (fail) { fail = false; throw new Error('storage failure'); } stored = structuredClone(value); },
  } } };
  const writes = [saveSettings({ mode: 'eco' }), saveSettings({ theme: 'dark' }), saveSettings({ responseLanguage: 'ja' })];
  await Promise.all(writes);
  assert.deepEqual(await getSettings(), { ...DEFAULT_SETTINGS, mode: 'eco', theme: 'dark', responseLanguage: 'ja' });
  assert.deepEqual(Object.keys(stored), ['settings']);
  fail = true;
  await assert.rejects(saveSettings({ mode: 'precision' }), /storage failure/);
  await saveSettings({ targetModel: 'claude' });
  assert.equal((await getSettings()).targetModel, 'claude');
  await saveSettings({ toolbarEnabled: false, toolbarPositions: { claude: { x: 0.2, y: 0.8 } } });
  assert.equal((await getSettings()).toolbarEnabled, false);
  assert.deepEqual((await getSettings()).toolbarPositions, { claude: { x: 0.2, y: 0.8 } });
  assert.equal((await getSettings()).theme, 'dark', 'toolbar update preserves unrelated settings');
  await Promise.all([saveSettings({ targetVariants: { chatgpt: 'gpt-4.1' } }), saveSettings({ targetVariants: { claude: 'claude-opus-5-5' } })]);
  assert.deepEqual((await getSettings()).targetVariants, { chatgpt: 'gpt-4.1', gemini: 'general', claude: 'claude-opus-5-5', other: 'general' });
  delete globalThis.chrome;
});
