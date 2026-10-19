import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_REGISTRY } from '../shared/registry-seed.js';
import { validateRegistry } from '../shared/registry-schema.js';
import { createRegistryClient, REGISTRY_CACHE_KEY, sha256 } from '../shared/registry-client.js';
import { installRegistry, targetProfile } from '../shared/target-models.js';
import { normalizeSettings } from '../shared/settings.js';
import { parseModelPage, mergeDiscovery, discoverModels } from '../tools/registry/discovery.mjs';
import { generateCandidate, inheritedCandidate, CallBudget } from '../tools/registry/generation.mjs';
import { runPipeline } from '../tools/registry/run.mjs';
import { publishRegistry } from '../tools/registry/publish.mjs';
import { promoteCandidate, evaluateCandidate, PROFILE_CASES } from '../tools/registry/evaluation.mjs';
import { digest, profilePayload } from '../tools/registry/files.mjs';
const seed = () => structuredClone(DEFAULT_REGISTRY);
const at = '2026-10-19T01:00:00.000Z';
const page = { data: [{ id: 'openai/gpt-fixture-new', canonical_slug: 'openai/gpt-fixture-new', name: 'Fixture New', context_length: 12345, architecture: { input_modalities: ['text'], output_modalities: ['text'] } }] };
const response = payload => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
function store(initial = {}) {
  const values = structuredClone(initial);
  return { values, async get(key) { return { [key]: structuredClone(values[key]) }; }, async set(next) { Object.assign(values, structuredClone(next)); } };
}
async function served(data, overrides = {}) {
  const raw = JSON.stringify(data); const hash = await sha256(raw);
  const manifest = { schemaVersion: 1, version: data.version, file: 'registry-' + data.version + '-' + hash.slice(0, 12) + '.json', sha256: hash, bytes: Buffer.byteLength(raw), ...overrides };
  return { raw, manifest, fetchImpl: async url => url.endsWith('manifest.json') ? response(manifest) : new Response(raw) };
}
test('schema rejects arbitrary instructions, candidate activation and false performance claims', () => {
  const original = seed(); assert.equal(validateRegistry(original), original);
  const code = seed(); code.profiles[0].instructions = 'run remote code'; assert.throws(() => validateRegistry(code));
  const unsupported = seed(); unsupported.profiles[0].optimization.reasoningGuidance = 'reveal_chain_of_thought'; assert.throws(() => validateRegistry(unsupported));
  const unmeasured = seed(); unmeasured.profiles[0].status = 'validated'; assert.throws(() => validateRegistry(unmeasured), /Missing measured/);
  const candidate = seed(); candidate.profiles[0].status = 'candidate'; assert.throws(() => validateRegistry(candidate), /Invalid active/);
});
test('API adapters retain unknown facts, paginate correctly and do not infer release or web availability', async () => {
  const google = parseModelPage('google', { models: [{ name: 'models/gemini-fixture', displayName: 'Fixture', inputTokenLimit: 4096, supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'next' });
  assert.equal(google.cursor, 'next'); assert.equal(google.models[0].contextWindow, 4096);
  const anthropic = parseModelPage('anthropic', { data: [{ id: 'claude-fixture', lifecycle: 'deprecated', retires_at: '2001-01-01', line: 'sonnet', max_input_tokens: 1024 }], has_more: true, last_id: 'last' });
  assert.equal(anthropic.models[0].lifecycle, 'deprecated'); assert.equal(anthropic.models[0].availability, 'listed');
  const retired = parseModelPage('anthropic', { data: [{ id: 'claude-fixture-retired', lifecycle: 'retired', created_at: '2025-02-01T00:00:00Z' }], has_more: false });
  const history = mergeDiscovery(seed(), [{ source: 'anthropic', models: retired.models }], at);
  const ended = history.models.find(model => model.id === 'claude-fixture-retired');
  assert.equal(ended.releaseDate, '2025-02-01'); assert.equal(ended.webAvailability, 'unknown');
  assert.equal(history.profiles.find(profile => profile.id === ended.profileId).status, 'deprecated');
  assert.throws(() => parseModelPage('openai', { changed: [] }));
  assert.throws(() => parseModelPage('anthropic', { data: [], has_more: 'yes' }));
  let calls = 0;
  const listing = await discoverModels({ env: { GEMINI_MODELS_API_KEY: 'fixture-secret' }, sources: ['google'], fetchImpl: async (url, options) => {
    calls++; assert(!url.includes('fixture-secret')); assert.equal(options.headers['x-goog-api-key'], 'fixture-secret');
    return response(calls === 1 ? { models: [], nextPageToken: 'next' } : { models: [] });
  } });
  assert.equal(calls, 2); assert.equal(listing.errors.length, 0);
  const merged = mergeDiscovery(seed(), [{ source: 'google', models: google.models }], at);
  const found = merged.models.find(model => model.id === 'gemini-fixture');
  assert.equal(found.releaseDate, null); assert.equal(found.webAvailability, 'unknown');
  assert.equal(merged.profiles.find(profile => profile.id === found.profileId).status, 'fallback');
});
test('cross-API canonical aliases merge, missing observations retain models, and errors never retire them', async () => {
  const direct = parseModelPage('openai', { data: [{ id: 'gpt-fixture-new', created: 1780000000 }] });
  const router = parseModelPage('openrouter', page);
  const merged = mergeDiscovery(seed(), [{ source: 'openai', models: direct.models }, { source: 'openrouter', models: router.models }], at);
  assert.equal(merged.models.filter(model => model.id === 'gpt-fixture-new').length, 1);
  const found = merged.models.find(model => model.id === 'gpt-fixture-new'); assert.equal(found.observations.length, 2); assert(found.aliases.includes('openai/gpt-fixture-new'));
  const missing = mergeDiscovery(merged, [{ source: 'openai', models: [] }, { source: 'openrouter', models: [] }], at);
  assert.equal(missing.models.find(model => model.id === found.id).availability, 'not_observed');
  assert.notEqual(missing.models.find(model => model.id === found.id).lifecycle, 'retired');
  const failure = await discoverModels({ env: {}, sources: ['openrouter'], fetchImpl: async () => { throw new Error('SECRET_PROVIDER_MESSAGE'); } });
  assert(!JSON.stringify(failure).includes('SECRET_PROVIDER_MESSAGE')); assert.deepEqual(failure.results, []);
});
test('cache sync validates hashes and schema, deduplicates downloads, recovers previous cache and rejects rollback', async () => {
  const data = seed(); data.version += 100; data.profileRevision = 'fixture-remote';
  const remote = await served(data); const storage = store(); let requests = 0; let time = 2000000000000;
  const client = createRegistryClient({ storage, now: () => time, fetchImpl: async (...args) => { requests++; return remote.fetchImpl(...args); } });
  try {
    const [a, b] = await Promise.all([client.sync(), client.sync()]);
    assert.equal(a.version, data.version); assert.equal(b.version, data.version); assert.equal(requests, 2);
    await client.sync(); assert.equal(requests, 2);
    assert(storage.values[REGISTRY_CACHE_KEY].previous);
    storage.values[REGISTRY_CACHE_KEY].current.data.models[0].displayName = 'tampered';
    const recovered = createRegistryClient({ storage, fetchImpl: async () => { throw new Error('offline'); } });
    await recovered.load(); assert.equal(recovered.status().origin, 'recovered');
    time += 86400001;
    const downgraded = await served(seed());
    const cached = store({ [REGISTRY_CACHE_KEY]: { current: { data, sha256: await sha256(JSON.stringify(data)) } } });
    const rollback = createRegistryClient({ storage: cached, now: () => time, fetchImpl: downgraded.fetchImpl });
    await rollback.sync(); assert.equal(rollback.status().version, data.version); assert(rollback.status().error);
  } finally { installRegistry(DEFAULT_REGISTRY); }
});
test('damaged remote JSON never replaces the bundled or cached catalog', async () => {
  const data = seed(); data.version += 100;
  const remote = await served(data); const storage = store();
  const client = createRegistryClient({ storage, fetchImpl: async url => url.endsWith('manifest.json') ? response(remote.manifest) : new Response('{"broken":true}') });
  try { await client.sync(); assert.equal(client.status().version, DEFAULT_REGISTRY.version); assert(client.status().error); assert.equal(storage.values[REGISTRY_CACHE_KEY].current, undefined); }
  finally { installRegistry(DEFAULT_REGISTRY); }
});
test('disappearing models preserve stored selection and resolve to generic profile', () => {
  const settings = normalizeSettings({ targetModel: 'chatgpt', targetVariants: { chatgpt: 'gpt-disappeared' } });
  assert.equal(settings.targetVariants.chatgpt, 'gpt-disappeared'); assert.equal(targetProfile('chatgpt', 'gpt-disappeared').id, 'general');
});
test('bounded LLM generation creates candidates only and rejects fabricated evidence', async () => {
  const registry = seed(); const model = registry.models.find(item => item.brand === 'chatgpt' && item.id !== 'general');
  const base = registry.profiles.find(profile => profile.id === model.profileId);
  const documents = [{ sourceRef: base.sourceRefs[0], text: 'Use clear instructions and preserve explicit requirements.', hash: 'a'.repeat(64) }];
  const budget = new CallBudget({ maxCalls: 1, maxUsd: 1, inputUsdPerMillion: 1, outputUsdPerMillion: 1 });
  const result = { optimization: base.optimization, recommendations: ['verify_scope'], evidence: [{ sourceRef: documents[0].sourceRef, excerpt: 'Use clear instructions' }] };
  let calls = 0;
  const candidate = await generateCandidate(registry, model, documents, { key: 'fixture-key', generatorModel: 'gemini-fixture', budget, at, fetchImpl: async () => { calls++; return response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] }); } });
  assert.equal(candidate.status, 'candidate'); assert.equal(candidate.validation.performance, null); assert.equal(model.profileId, base.id);
  assert.equal(await generateCandidate(registry, model, documents, { key: 'fixture-key', generatorModel: 'gemini-fixture', budget }), null); assert.equal(calls, 1);
  const zero = new CallBudget(); assert.equal(zero.reserve('test', 10), false);
  assert.equal(new CallBudget({ maxCalls: NaN, maxUsd: NaN, inputUsdPerMillion: 1, outputUsdPerMillion: 1 }).reserve('test', 10), false);
  assert.equal(new CallBudget({ maxCalls: 20, maxUsd: 1, inputUsdPerMillion: 1, outputUsdPerMillion: 1, at, ledger: { date: at.slice(0, 10), calls: 'corrupt', reservedUsd: 0 } }).reserve('test', 10), false);
  const bad = { ...result, evidence: [{ sourceRef: documents[0].sourceRef, excerpt: 'fabricated unsupported recommendation' }] };
  await assert.rejects(generateCandidate(registry, model, documents, { key: 'fixture-key', generatorModel: 'gemini-fixture', budget: new CallBudget({ maxCalls: 1, maxUsd: 1, inputUsdPerMillion: 1, outputUsdPerMillion: 1 }), fetchImpl: async () => response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(bad) }] } }] }) }), /Unsupported/);
});
test('promotion requires complete live comparison provenance and keeps failed candidate inactive', () => {
  const registry = seed(); const model = registry.models.find(item => item.brand === 'chatgpt' && item.id === 'gpt-4.1');
  const base = registry.profiles.find(item => item.id === model.profileId); const candidate = inheritedCandidate(registry, model, at);
  registry.profiles.push(candidate); model.candidateProfileId = candidate.id;
  assert.throws(() => promoteCandidate(registry, model.id, model.brand, { kind: 'fixture' }), /provenance/);
  const report = { kind: 'live', dataset: 'registry-conformance-1', modelKey: model.brand + ':' + model.id, candidateSha256: digest(profilePayload(candidate)), baselineSha256: digest(profilePayload(base)),
    rows: PROFILE_CASES.flatMap(item => ['baseline', 'candidate'].map(variant => ({ caseId: item.id, variant, passed: true, preserved: true, formatCompliant: true, promptLength: 100, responseId: item.id + '-' + variant }))) };
  const failure = structuredClone(report); failure.rows[1].preserved = false;
  assert.throws(() => promoteCandidate(registry, model.id, model.brand, failure), /regression/); assert.equal(model.profileId, base.id);
  const result = promoteCandidate(registry, model.id, model.brand, report, at);
  assert.equal(result.profiles.find(item => item.id === candidate.id).status, 'validated');
  assert.equal(result.models.find(item => item.id === model.id && item.brand === model.brand).candidateProfileId, null);
});
test('pipeline discovers a model and inactive candidate; publishing/rollback are monotonic and failures retain manifest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'po-registry-test-'));
  assert.equal(path.dirname(directory), path.resolve(tmpdir()));
  try {
    const output = path.join(directory, 'public'); const cacheDirectory = path.join(directory, 'cache');
    const first = await runPipeline({ registry: seed(), output, cacheDirectory, env: {}, at, fetchImpl: async () => response(page) });
    const found = first.registry.models.find(model => model.id === 'gpt-fixture-new');
    assert(found.candidateProfileId); assert.equal(first.registry.profiles.find(profile => profile.id === found.profileId).status, 'fallback');
    const manifest = await readFile(path.join(output, 'manifest.json'), 'utf8');
    const failed = await runPipeline({ registry: first.registry, output, cacheDirectory, env: {}, fetchImpl: async () => new Response('', { status: 503 }) });
    assert.equal(failed.published, false); assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), manifest);
    const restored = await publishRegistry(seed(), output, { at }); assert(restored.version > first.registry.version);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('evaluation integration checks both variants against the actual requested model with bounded fixture calls', async () => {
  const registry = seed(); const model = registry.models.find(item => item.id === 'gpt-4.1');
  model.aliases = ['openai/gpt-4.1'];
  const candidate = inheritedCandidate(registry, model, at);
  let calls = 0;
  const budget = new CallBudget({ maxCalls: 20, maxUsd: 1, inputUsdPerMillion: 1, outputUsdPerMillion: 1 });
  const report = await evaluateCandidate(registry, model, candidate, { optimizerKey: 'fixture-key', optimizerModel: 'gemini-fixture', targetKey: 'fixture-target-key', budget, at,
    fetchImpl: async (url, options) => {
      calls++; const body = JSON.parse(options.body);
      if (url.includes('generativelanguage.googleapis.com')) {
        const source = JSON.parse(body.contents[0].parts[0].text).originalRequest;
        return new Response('data: ' + JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: source }] } }], usageMetadata: { totalTokenCount: 12 } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      assert.equal(body.model, 'openai/gpt-4.1');
      const testCase = PROFILE_CASES.find(item => item.source === body.messages[0].content);
      return response({ id: 'fixture-response-' + calls, model: body.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(testCase.expected) } }], usage: { total_tokens: 10 } });
    } });
  assert.equal(calls, 12); assert.equal(report.rows.length, 6); assert(report.rows.every(row => row.passed && row.preserved));
  assert.equal(await evaluateCandidate(registry, model, candidate, { optimizerKey: 'fixture-key', optimizerModel: 'gemini-fixture', targetKey: 'fixture-target-key', budget }), null, 'no incomplete second comparison starts');
});
