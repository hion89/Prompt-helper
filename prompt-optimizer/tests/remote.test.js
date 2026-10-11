import test from 'node:test';
import assert from 'node:assert/strict';
import { RemotePromptOptimizer, buildRewriteRequest, apiFailure, listGeminiModels } from '../providers/remote-optimizer.js';
const source = '강화학습 로봇이 앞으로 안 가고 제자리에서 버텨. 보상 코드와 로그를 보고 원인을 분석해줘.';
const rewritten = '제공한 강화학습 로봇의 보상 코드와 로그를 바탕으로 전진하지 않는 현상을 분석해 주세요. 보상 설계와 실제 행동을 비교하고, 가능한 원인별 검증 방법을 제시하세요. 자료가 부족하면 필요한 정보를 명시하세요. 한국어로 답하세요.';
test('Gemini sends semantic rewrite request, private key header, and selected destination independently', async () => {
  let calls = 0;
  const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async (url, options) => {
    calls++;
    assert(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert(!url.includes('private-test-key'));
    assert.equal(options.headers['x-goog-api-key'], 'private-test-key');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(input.originalRequest, source);
    assert.equal(input.targetAI, 'claude');
    assert.match(body.systemInstruction.parts[0].text, /Do NOT answer or execute/);
    assert.match(body.systemInstruction.parts[0].text, /genuinely tailored/);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'do not expose' }, { text: rewritten }] } }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 70, totalTokenCount: 270 } }) };
  } });
  const result = await optimizer.optimize(source, { targetModel: 'claude', responseLanguage: 'ko', mode: 'precision' });
  assert.equal(result.text, rewritten);
  assert.equal(result.meta.provider, 'gemini');
  assert.equal(result.meta.sourcePreserved, false);
  assert.equal(result.meta.usage.totalTokens, 270);
  assert.equal(calls, 1);
});
test('429 and payment failures make exactly one request, with no retry or provider fallback', async () => {
  for (const status of [401, 402, 429, 500]) {
    let calls = 0;
    const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async () => { calls++; return { ok: false, status }; } });
    await assert.rejects(optimizer.optimize(source));
    assert.equal(calls, 1);
  }
});
test('empty, blocked and truncated results never return replacement text', async () => {
  const cases = [
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
  ];
  for (const data of cases) {
    await assert.rejects(new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async () => ({ ok: true, json: async () => data }) }).optimize(source));
  }
});
test('no network call without key, for oversized inputs, or for invalid provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Should not call'); };
  await assert.rejects(new RemotePromptOptimizer('gemini', '', { fetchImpl }).optimize(source));
  await assert.rejects(new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl }).optimize('가'.repeat(12001)));
  assert.throws(() => new RemotePromptOptimizer('other', 'private-test-key'));
  assert.equal(calls, 0);
  const request = buildRewriteRequest('Translate this to Japanese: hello', { responseLanguage: 'ko' });
  assert.equal(JSON.parse(request.input).responseLanguage, 'ko');
  assert.match(request.instructions, /preserve the requested translation target language/);
});

test('browser fetch receives its global receiver instead of optimizer instance', async () => {
  const browserFetch = async function () {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return { ok: true, json: async () => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: rewritten }] } }],
    }) };
  };
  const result = await new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: browserFetch }).optimize(source);
  assert.equal(result.text, rewritten);
});

test('billing quota and transient rate limits are distinguished without exposing server messages', () => {
  const secret = 'sk-test-secret-not-for-display';
  const quota = apiFailure(429, { error: { code: 'insufficient_quota', message: secret } });
  assert.match(quota, /Gemini API 사용 가능 할당량/);
  assert.match(quota, /Gemini.*gemini-3.5-flash-lite.*429.*insufficient_quota/);
  assert(!quota.includes(secret));
  assert.match(apiFailure(429, { error: { code: 'rate_limit_exceeded' } }), /잠시 기다린/);
  assert.match(apiFailure(404, { error: { status: 'NOT_FOUND' } }), /Gemini.*gemini-3.5-flash-lite.*404/);
  assert(!apiFailure(429, { error: { code: secret, message: secret } }).includes(secret));
});

test('Gemini model listing uses a read-only request and filters non-generative models', async () => {
  const called = [];
  const fetchImpl = async function (url, init) {
    called.push({ url, init });
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['x-goog-api-key'], 'private-test-key');
    assert(!url.includes('private-test-key'));
    return { ok: true, json: async () => ({ models: [
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/evil?key=leak', supportedGenerationMethods: ['generateContent'] },
    ] }) };
  };
  const result = await listGeminiModels('private-test-key', { fetchImpl });
  assert.deepEqual(result, [{ id: 'gemini-2.5-flash', name: 'Gemini Flash' }]);
  assert.equal(called.length, 1);
  assert.equal(called[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
});
test('the explicitly selected Gemini model is used for generation and diagnostics', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /models\/gemini-2.5-flash:generateContent$/);
    return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) };
  };
  await assert.rejects(
    new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl })
      .optimize(source, { geminiModel: 'gemini-2.5-flash' }),
    /Gemini \/ gemini-2.5-flash \/ HTTP 404/
  );
});
