import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry } from '../../shared/registry-schema.js';
import { discoverModels, mergeDiscovery } from './discovery.mjs';
import { fetchDocuments, generateCandidate, inheritedCandidate, CallBudget, loadGenerationState, saveGenerationState } from './generation.mjs';
import { readJson, atomicWrite, digest } from './files.mjs';
import { publishRegistry, writeBundle } from './publish.mjs';
import { evaluateCandidate, promoteCandidate } from './evaluation.mjs';
export async function runPipeline({ registry, output, cacheDirectory, env = process.env, fetchImpl = globalThis.fetch, at = new Date().toISOString() } = {}) {
  validateRegistry(registry);
  const discovery = await discoverModels({ env, fetchImpl });
  if (!discovery.results.length) return { registry, published: false, discovery };
  let next = mergeDiscovery(registry, discovery.results, at);
  const state = await loadGenerationState(cacheDirectory);
  const budget = new CallBudget({ maxCalls: Number(env.MAX_PROFILE_LLM_CALLS || 0), maxUsd: Number(env.MAX_PROFILE_COST_USD || 0),
    inputUsdPerMillion: Number(env.PROFILE_INPUT_USD_PER_MILLION || 0), outputUsdPerMillion: Number(env.PROFILE_OUTPUT_USD_PER_MILLION || 0), ledger: state.ledger, at });
  const newKeys = new Set(next.models.filter(model => !registry.models.some(old => old.id === model.id && old.brand === model.brand)).map(model => model.brand + ':' + model.id));
  for (const model of next.models) {
    if (model.id === 'general' || model.lifecycle === 'retired') continue;
    const key = model.brand + ':' + model.id;
    if (newKeys.has(key) && !model.candidateProfileId) {
      const candidate = inheritedCandidate(next, model, at); next.profiles.push(candidate); model.candidateProfileId = candidate.id;
      next.changes.push({ at, type: 'candidate', modelKey: key, detail: 'Inherited candidate created; not LLM-generated or performance-validated' });
    }
    // Metadata discovery always works; paid generation requires an explicit, bounded operator configuration.
    if (!env.PROFILE_GENERATOR_API_KEY || budget.ledger.calls >= budget.limit || budget.maxUsd <= 0) continue;
    if (state.attempts[key]?.at && Date.parse(at) - Date.parse(state.attempts[key].at) < 7 * 86400000) continue;
    try {
      const documents = await fetchDocuments(next, model, state.documents, { fetchImpl });
      const documentDigest = digest(documents.map(doc => ({ sourceRef: doc.sourceRef, hash: doc.hash })));
      if (!documents.length || state.attempts[key]?.documentDigest === documentDigest) continue;
      const candidate = await generateCandidate(next, model, documents, {
        key: env.PROFILE_GENERATOR_API_KEY, generatorModel: env.PROFILE_GENERATOR_MODEL, budget, fetchImpl, at,
        beforeCall: async () => { state.ledger = budget.ledger; await saveGenerationState(cacheDirectory, state); },
      });
      if (!candidate) continue;
      next.profiles.push(candidate); model.candidateProfileId = candidate.id;
      next.changes.push({ at, type: 'candidate', modelKey: key, detail: 'Document-grounded LLM candidate; active profile unchanged until measured validation' });
      state.attempts[key] = { at, documentDigest, status: 'candidate' };
    } catch {
      state.attempts[key] = { at, status: 'rejected' };
      next.changes.push({ at, type: 'rejected', modelKey: key, detail: 'Candidate generation or evidence/schema validation failed; active profile retained' });
    }
  }
  const evaluationBudget = new CallBudget({ maxCalls: Number(env.MAX_PROFILE_EVALUATION_CALLS || 0), maxUsd: Number(env.MAX_PROFILE_EVALUATION_USD || 0),
    inputUsdPerMillion: Number(env.EVALUATION_INPUT_USD_PER_MILLION || 0), outputUsdPerMillion: Number(env.EVALUATION_OUTPUT_USD_PER_MILLION || 0), ledger: state.evaluationLedger, at });
  for (const model of next.models) {
    const candidate = next.profiles.find(profile => profile.id === model.candidateProfileId);
    if (candidate?.generation?.kind !== 'llm' || evaluationBudget.ledger.calls >= evaluationBudget.limit || !env.PROFILE_GENERATOR_API_KEY || !env.OPENROUTER_EVAL_API_KEY) continue;
    const attemptKey = 'evaluation:' + candidate.id;
    if (state.attempts[attemptKey]) continue;
    try {
      const report = await evaluateCandidate(next, model, candidate, { optimizerKey: env.PROFILE_GENERATOR_API_KEY, optimizerModel: env.PROFILE_GENERATOR_MODEL,
        targetKey: env.OPENROUTER_EVAL_API_KEY, budget: evaluationBudget, fetchImpl, at,
        beforeCall: async () => { state.evaluationLedger = evaluationBudget.ledger; await saveGenerationState(cacheDirectory, state); } });
      if (!report) continue;
      await atomicWrite(path.join(cacheDirectory, 'evaluations', digest(candidate.id) + '.json'), JSON.stringify(report, null, 2));
      next = promoteCandidate(next, model.id, model.brand, report, at);
      state.attempts[attemptKey] = { at, status: 'promoted', reportSha256: digest(report) };
    } catch {
      state.attempts[attemptKey] = { at, status: 'rejected' };
      next.changes.push({ at, type: 'rejected', modelKey: model.brand + ':' + model.id, detail: 'Live evaluation failed or budget exhausted; previous active profile retained' });
    }
  }
  state.evaluationLedger = evaluationBudget.ledger;
  state.ledger = budget.ledger; await saveGenerationState(cacheDirectory, state);
  next.changes = next.changes.slice(-200); validateRegistry(next);
  const published = await publishRegistry(next, output, { at });
  return { registry: published, published: true, discovery, budget: budget.ledger };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const registry = validateRegistry(await readJson(path.join(root, 'registry/default-registry.json')));
  if (process.argv.includes('--bundle')) { await writeBundle(registry, root); console.log('Registry bundle/schema generated'); }
  else {
    const result = await runPipeline({ registry, output: path.resolve(root, '../docs/registry'), cacheDirectory: path.join(root, '.registry-cache') });
    if (result.published) await writeBundle(result.registry, root);
    await atomicWrite(path.join(root, '.registry-cache/last-run.json'), JSON.stringify({ at: new Date().toISOString(), published: result.published, version: result.registry.version, errors: result.discovery.errors, skipped: result.discovery.skipped, budget: result.budget || null }, null, 2));
    console.log(JSON.stringify({ published: result.published, version: result.registry.version, models: result.registry.models.length, sourceErrors: result.discovery.errors, skipped: result.discovery.skipped, budget: result.budget || null }));
  }
}
