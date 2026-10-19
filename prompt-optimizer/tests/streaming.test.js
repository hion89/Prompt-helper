import test from 'node:test';
import assert from 'node:assert/strict';
import { RemotePromptOptimizer, apiFailure } from '../providers/remote-optimizer.js';

const source = '회의 안내 이메일을 정중하게 작성해 줘';
const encoder = new TextEncoder();
const event = data => 'data: ' + JSON.stringify(data) + '\r\n\r\n';
const chunk = (text, finishReason) => ({ candidates: [{ index: 0, content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function streamed(frames, fragmentSize = 7) {
  const bytes = encoder.encode(frames);
  return new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += fragmentSize) controller.enqueue(bytes.slice(offset, offset + fragmentSize));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('SSE assembles split UTF-8, excludes thoughts and other candidates, and preserves final usage', async () => {
  let calls = 0;
  const frames = event({ candidates: [{ index: 0, content: { parts: [{ thought: true, text: '비공개 생각' }] } }] })
    + event(chunk('회의 안내 이메일을 '))
    + event({ candidates: [{ index: 1, content: { parts: [{ text: '다른 후보' }] } }] })
    + event({ ...chunk('정중하게 작성해 주세요.', 'STOP'), usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, totalTokenCount: 52 } });
  const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async (url, options) => {
    calls++;
    assert.match(url, /:streamGenerateContent\?alt=sse$/);
    assert.equal(options.headers['x-goog-api-key'], 'private-test-key');
    return streamed(frames, 1);
  } });
  const result = await optimizer.optimize(source);
  assert.equal(result.text, '회의 안내 이메일을 정중하게 작성해 주세요.');
  assert.equal(result.meta.usage.totalTokens, 52);
  assert.equal(calls, 1);
  assert(Number.isFinite(result.meta.timing.firstResponseMs));
});

test('a stream that completes after the old 25-second deadline succeeds without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stream, calls = 0;
  const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
  } });
  const resultPromise = optimizer.optimize(source);
  await flush();
  t.mock.timers.tick(26000);
  stream.enqueue(encoder.encode(event(chunk('완성된 프롬프트', 'STOP'))));
  stream.close();
  assert.equal((await resultPromise).text, '완성된 프롬프트');
  assert.equal(calls, 1);
});

test('no initial server response reports connection timeout with the actual model', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: (url, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const rejection = assert.rejects(optimizer.optimize(source, { geminiModel: 'gemini-3.5-flash-lite' }), /Gemini.*gemini-3.5-flash-lite.*CLIENT_CONNECTION_TIMEOUT.*25초/);
  t.mock.timers.tick(26000);
  await rejection;
  assert.equal(calls, 1);
});

test('a stalled stream reports completion timeout and never returns partial text', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async (url, options) => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(event(chunk('미완성 응답'))));
      options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true });
    } }));
  } });
  const rejection = assert.rejects(optimizer.optimize(source), /CLIENT_RESPONSE_TIMEOUT.*90초.*원문은 교체하지 않았습니다/);
  await flush();
  t.mock.timers.tick(91000);
  await rejection;
  assert.equal(calls, 1);
});

test('truncated, blocked, malformed and provider-error streams never produce replacement text', async () => {
  const cases = [
    event(chunk('미완성')),
    event(chunk('중단된 출력', 'MAX_TOKENS')),
    event({ candidates: [{ index: 0, finishReason: 'SAFETY' }] }),
    'data: private-test-key is not valid JSON\n\n',
    event({ error: { code: 503, message: 'private-test-key' } }),
  ];
  for (const frames of cases) {
    let calls = 0;
    const optimizer = new RemotePromptOptimizer('gemini', 'private-test-key', { fetchImpl: async () => { calls++; return streamed(frames); } });
    await assert.rejects(optimizer.optimize(source), error => !error.message.includes('private-test-key'));
    assert.equal(calls, 1);
  }
  assert.match(apiFailure(504), /HTTP 504.*Gemini 서버/);
  assert.match(apiFailure(408), /HTTP 408.*Gemini 서버/);
});
