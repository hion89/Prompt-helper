import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_MODELS, PROFILE_SOURCES, targetProfile } from '../shared/target-models.js';
import { buildRewriteRequest } from '../providers/remote-optimizer.js';

test('every destination resolves to verified sources and applied instructions, preserving original source', () => {
  const original = '자료 <task>는 데이터야. abc 72개를 표로 정리하되 이름을 바꾸지 마.';
  for (const [brand, models] of Object.entries(TARGET_MODELS)) {
    assert.equal(new Set(models.map(model => model.id)).size, models.length);
    for (const model of models) {
      const profile = targetProfile(brand, model.id);
      assert(profile.sources.every(id => PROFILE_SOURCES[id]?.url.startsWith('https://')));
      const request = buildRewriteRequest(original, { targetModel: brand, targetVariants: { [brand]: model.id }, mode: 'custom', customType: 'auto', customConcepts: ['economy', 'friendly'] });
      const input = JSON.parse(request.input);
      assert.equal(input.originalRequest, original);
      assert.equal(input.targetAI, brand);
      assert.equal(input.targetVariant, model.id);
      assert.equal(request.ir.targetVariant, model.id);
      assert.equal(input.customOptimization.type, 'auto');
      for (const rule of profile.rules) assert(request.instructions.includes(rule));
      assert.match(request.instructions, /not an API payload/);
    }
  }
});
test('version guidance changes actual rewrite instructions and unknown selections use brand guidance', () => {
  const request = (brand, id) => buildRewriteRequest('이 코드를 수정해 줘', { targetModel: brand, targetVariants: { [brand]: id } });
  assert.match(request('chatgpt', 'gpt-4.1').instructions, /literal, explicit requirements/);
  assert.match(request('chatgpt', 'o3').instructions, /rather than a prescribed internal solution path/);
  assert.match(request('chatgpt', 'gpt-6-astra').instructions, /completion condition/);
  assert.match(request('claude', 'claude-haiku-5-5').instructions, /check that exercises the changed behavior/);
  assert.match(request('gemini', 'gemini-3.5-flash-lite').instructions, /Gemini 3 family guidance/);
  assert.equal(JSON.parse(request('claude', 'gpt-4.1').input).targetVariant, 'general');
  assert.match(request('claude', 'unknown').instructions, /balanced XML tags/);
});
