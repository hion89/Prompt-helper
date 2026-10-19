import { isDeepStrictEqual } from 'node:util';
import { RemotePromptOptimizer } from '../../providers/remote-optimizer.js';
import { compileProfile } from '../../shared/profile-rules.js';
import { validateRegistry } from '../../shared/registry-schema.js';
import { digest, profilePayload } from './files.mjs';
export const PROFILE_CASES = [
  { id: 'facts-ko', source: '팀 알파 회의는 2026-11-03 14:30입니다. 다른 설명 없이 JSON 객체 하나만 출력하고 team, date, time 필드에 각각 알파, 2026-11-03, 14:30을 넣어 주세요. 날짜나 시간을 바꾸지 마세요.',
    anchors: ['알파', '2026-11-03', '14:30', 'team', 'date', 'time'], expected: { team: '알파', date: '2026-11-03', time: '14:30' } },
  { id: 'constraints-en', source: 'Return only a JSON object with invoiceId="A-017", total=0, approved=false. Preserve invoiceId exactly. No Markdown or extra fields.',
    anchors: ['A-017', 'invoiceId', 'total', 'approved', 'false'], expected: { invoiceId: 'A-017', total: 0, approved: false } },
  { id: 'count-en', source: 'Count only the entries in this supplied list: [red, blue, red]. Return only JSON with keys count and uniqueCount, each an integer. Do not add any other fields.',
    anchors: ['red', 'blue', 'count', 'uniqueCount'], expected: { count: 3, uniqueCount: 2 } },
];
export async function evaluateCandidate(registry, model, candidate, { optimizerKey, optimizerModel, targetKey, budget, fetchImpl = globalThis.fetch, beforeCall = async () => {}, at = new Date().toISOString() } = {}) {
  const baseline = registry.profiles.find(profile => profile.id === model.profileId);
  const route = model.aliases.find(alias => alias.includes('/') && alias.split('/')[0] === model.provider) || (model.brand === 'other' && model.id.includes('/') ? model.id : null);
  if (!optimizerKey || !/^gemini-[a-z0-9.-]{1,80}$/.test(optimizerModel || '') || !targetKey || !route || !budget || budget.limit - budget.ledger.calls < PROFILE_CASES.length * 4) return null;
  const rows = [];
  const boundedFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const maxTokens = body.generationConfig?.maxOutputTokens || body.max_tokens;
    if (!budget.reserve(options.body, maxTokens)) throw new Error('Evaluation budget exhausted');
    await beforeCall(); return fetchImpl(url, options);
  };
  for (const testCase of PROFILE_CASES) for (const [variant, profile] of [['baseline', baseline], ['candidate', candidate]]) {
    const started = Date.now();
    const override = { id: model.id, revision: profile.id, ...compileProfile(profile) };
    const optimized = await new RemotePromptOptimizer('gemini', optimizerKey, { fetchImpl: boundedFetch, trustedProfileOverride: override }).optimize(testCase.source, { targetModel: model.brand, targetVariants: { [model.brand]: model.id }, mode: 'precision', geminiModel: optimizerModel });
    if (optimized.text.length > 12000) throw new Error('Oversized evaluation rewrite');
    let rewriteIsAnswer = false; try { rewriteIsAnswer = isDeepStrictEqual(JSON.parse(optimized.text), testCase.expected); } catch {}
    const preserved = !rewriteIsAnswer && testCase.anchors.every(anchor => optimized.text.includes(anchor));
    const response = await boundedFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + targetKey },
      body: JSON.stringify({ model: route, max_tokens: 512, messages: [{ role: 'user', content: optimized.text }] }),
    });
    if (!response.ok) throw new Error('Evaluation target HTTP ' + response.status);
    const payload = await response.json();
    if (typeof payload.id !== 'string' || payload.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete live evaluation');
    const allowedModels = new Set([route, model.id.includes('/') ? model.id : model.provider + '/' + model.id, ...model.aliases.map(alias => alias.includes('/') ? alias : model.provider + '/' + alias)]);
    if (!allowedModels.has(payload.model)) throw new Error('Evaluation response model mismatch');
    let passed = false; try { passed = isDeepStrictEqual(JSON.parse(payload.choices[0].message.content), testCase.expected); } catch {}
    rows.push({ caseId: testCase.id, variant, preserved, passed, formatCompliant: passed, promptLength: optimized.text.length,
      tokens: Number.isFinite(payload.usage?.total_tokens) && Number.isFinite(optimized.meta.usage?.totalTokens) ? payload.usage.total_tokens + optimized.meta.usage.totalTokens : null,
      costUsd: Number.isFinite(payload.usage?.cost) ? payload.usage.cost : null, latencyMs: Date.now() - started, responseId: payload.id });
  }
  return { schemaVersion: 1, kind: 'live', dataset: 'registry-conformance-1', createdAt: at, modelKey: model.brand + ':' + model.id, route,
    baselineSha256: digest(profilePayload(baseline)), candidateSha256: digest(profilePayload(candidate)), rows,
    reservedUsd: budget.ledger.reservedUsd, limitations: 'Small deterministic conformance suite; no claim of general quality improvement. Target cost excludes rewrite cost unless token-rate accounting is configured.' };
}
export function promoteCandidate(registry, modelId, brand, report, at = new Date().toISOString()) {
  const next = structuredClone(validateRegistry(registry));
  const model = next.models.find(item => item.id === modelId && item.brand === brand);
  const candidate = next.profiles.find(item => item.id === model?.candidateProfileId);
  const baseline = next.profiles.find(item => item.id === model?.profileId);
  if (!candidate || candidate.status !== 'candidate' || report?.kind !== 'live' || report.dataset !== 'registry-conformance-1' || report.modelKey !== brand + ':' + modelId || report.candidateSha256 !== digest(profilePayload(candidate)) || report.baselineSha256 !== digest(profilePayload(baseline))) throw new Error('Evaluation provenance mismatch');
  const rows = report.rows;
  if (!Array.isArray(rows) || rows.length !== PROFILE_CASES.length * 2 || new Set(rows.map(row => row.responseId)).size !== rows.length) throw new Error('Incomplete evaluation');
  for (const testCase of PROFILE_CASES) {
    const a = rows.filter(row => row.caseId === testCase.id && row.variant === 'baseline');
    const b = rows.filter(row => row.caseId === testCase.id && row.variant === 'candidate');
    if (a.length !== 1 || b.length !== 1 || !a[0].responseId || !b[0].responseId || !b[0].preserved || !b[0].passed || !b[0].formatCompliant) throw new Error('Candidate conformance regression');
    if (!Number.isFinite(a[0].promptLength) || !Number.isFinite(b[0].promptLength) || b[0].promptLength > Math.max(a[0].promptLength * 1.25, a[0].promptLength + 100)) throw new Error('Candidate length regression');
  }
  candidate.status = 'validated'; candidate.confidence = 'measured'; candidate.updatedAt = at;
  candidate.validation = { schema: true, performance: { passed: true, reportSha256: digest(report), profileSha256: digest(profilePayload(candidate)), evaluatedCases: PROFILE_CASES.length, targetCalls: rows.length, createdAt: at } };
  model.profileId = candidate.id; model.profileVersion = candidate.version; model.candidateProfileId = null; model.lastUpdated = at;
  next.changes.push({ at, type: 'promoted', modelKey: brand + ':' + modelId, detail: 'Live conformance checks passed; no generalized improvement claim' }); next.changes = next.changes.slice(-200);
  return validateRegistry(next);
}
