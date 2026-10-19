import { validateRegistry } from '../../shared/registry-schema.js';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
export const DISCOVERY_SOURCES = {
  openai: { url: 'https://api.openai.com/v1/models', secret: 'OPENAI_MODELS_API_KEY', doc: 'https://developers.openai.com/api/reference/resources/models/methods/list' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', secret: 'ANTHROPIC_MODELS_API_KEY', doc: 'https://platform.claude.com/docs/en/api/models/list' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/models', secret: 'GEMINI_MODELS_API_KEY', doc: 'https://ai.google.dev/api/models' },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', secret: 'OPENROUTER_MODELS_API_KEY', doc: 'https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties' },
};
const brandFor = { openai: 'chatgpt', anthropic: 'claude', google: 'gemini' };
const positive = number => Number.isSafeInteger(number) && number > 0 && number <= 1000000000 ? number : null;
const text = (value, fallback, max = 200) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : fallback;
const excluded = /(?:embedding|whisper|tts|image|realtime|audio|transcribe|moderation)/i;
export function parseModelPage(source, payload) {
  const records = source === 'google' ? payload?.models : payload?.data;
  if (!Array.isArray(records) || records.length > 5000) throw new Error('Model API response shape changed');
  if (source === 'google' && payload.nextPageToken !== undefined && typeof payload.nextPageToken !== 'string') throw new Error('Invalid Google cursor');
  if (source === 'anthropic' && (typeof payload.has_more !== 'boolean' || (payload.has_more && typeof payload.last_id !== 'string'))) throw new Error('Invalid Anthropic cursor');
  const models = [];
  for (const item of records) {
    if (!item || typeof item !== 'object') throw new Error('Invalid model object');
    let id = source === 'google' ? item.name?.replace(/^models\//, '') : item.id;
    if (typeof id !== 'string' || !(ID.test(id) || (source === 'openrouter' && /^~[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,198}$/.test(id)))) throw new Error('Invalid model ID');
    let provider = source; let brand = brandFor[source] || 'other'; let aliases = [];
    let capabilities = null; let contextWindow = null; let family = null; let releaseDate = null;
    if (source === 'openai') {
      if (!/^(?:gpt-|o\d)/.test(id) || excluded.test(id)) continue;
    } else if (source === 'anthropic') {
      if (item.capabilities !== undefined && item.capabilities !== null && (typeof item.capabilities !== 'object' || Array.isArray(item.capabilities))) throw new Error('Invalid Anthropic capabilities');
      // Anthropic explicitly defines created_at as release time; Unix-epoch sentinels are unknown.
      if (typeof item.created_at === 'string' && Number.isFinite(Date.parse(item.created_at)) && Date.parse(item.created_at) > 0) releaseDate = new Date(item.created_at).toISOString().slice(0, 10);
      family = typeof item.line === 'string' ? text(item.line, null, 100) : null;
      contextWindow = positive(item.max_input_tokens);
      capabilities = item.capabilities && typeof item.capabilities === 'object' ? Object.entries(item.capabilities).filter(([, v]) => v?.supported === true).map(([key]) => key).slice(0, 40) : null;
    } else if (source === 'google') {
      if (!Array.isArray(item.supportedGenerationMethods) || !item.supportedGenerationMethods.every(method => typeof method === 'string' && method.length <= 80)) throw new Error('Missing generation methods');
      if (!item.supportedGenerationMethods.includes('generateContent') || excluded.test(id)) continue;
      contextWindow = positive(item.inputTokenLimit);
      capabilities = [...new Set(item.supportedGenerationMethods.filter(x => typeof x === 'string').slice(0, 40))];
    } else if (source === 'openrouter') {
      const architecture = item.architecture;
      if (!architecture || !Array.isArray(architecture.output_modalities) || !Array.isArray(architecture.input_modalities)) throw new Error('Missing OpenRouter modalities');
      if (![...architecture.input_modalities, ...architecture.output_modalities].every(modality => typeof modality === 'string' && /^[a-z][a-z0-9_-]{0,60}$/.test(modality))) throw new Error('Invalid OpenRouter modalities');
      if (!architecture.output_modalities.includes('text') || !architecture.input_modalities.includes('text')) continue;
      const rawId = id;
      const aliasTarget = typeof item.alias_target?.slug === 'string' && ID.test(item.alias_target.slug) ? item.alias_target.slug : null;
      if (id.startsWith('~') && !aliasTarget) continue;
      provider = (aliasTarget || id).split('/')[0]; brand = brandFor[provider] || 'other';
      if (provider === 'perplexity') continue; // Preserve the project's excluded destination.
      // Explicit canonical_slug is the only alias normalization beyond provider namespaces.
      const canonical = aliasTarget || (typeof item.canonical_slug === 'string' && ID.test(item.canonical_slug) && item.canonical_slug.split('/')[0] === provider ? item.canonical_slug : id);
      const removeNamespace = value => brand === 'other' ? value : value.slice(value.indexOf('/') + 1);
      aliases = [...new Set(rawId.startsWith('~') ? [rawId] : [rawId, removeNamespace(rawId)])]; id = removeNamespace(canonical); aliases = aliases.filter(alias => alias !== id);
      capabilities = [...new Set([...architecture.input_modalities.map(x => 'input:' + x), ...architecture.output_modalities.map(x => 'output:' + x)])].slice(0, 40);
      contextWindow = positive(item.context_length);
    }
    if (!ID.test(id)) throw new Error('Invalid normalized ID');
    const explicitRetired = item.lifecycle === 'retired';
    // Expiration/shutdown dates are notices, not proof that retirement has happened.
    const lifecycle = ['active', 'deprecated', 'retired'].includes(item.lifecycle) ? item.lifecycle : 'unknown';
    models.push({ id, brand, provider, displayName: text(item.display_name || item.displayName || item.name, id, 240).replace(/^models\//, ''), family, releaseDate, capabilities, contextWindow,
      aliases, lifecycle, availability: explicitRetired ? 'retired' : 'listed', source, sourceUrl: DISCOVERY_SOURCES[source].doc });
  }
  return { models, cursor: source === 'google' ? payload.nextPageToken || null : source === 'anthropic' && payload.has_more ? payload.last_id : null };
}
export async function discoverModels({ env = process.env, fetchImpl = globalThis.fetch, maxPages = 10, sources = Object.keys(DISCOVERY_SOURCES) } = {}) {
  const results = []; const errors = []; const skipped = [];
  for (const source of sources) {
    const config = DISCOVERY_SOURCES[source]; const key = env[config.secret];
    if (!key && source !== 'openrouter') { skipped.push(source); continue; }
    try {
      const all = []; let cursor = null; const cursors = new Set(); let completed = false;
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(config.url); const headers = { Accept: 'application/json' };
        if (source === 'google') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); headers['x-goog-api-key'] = key; }
        if (source === 'anthropic') { url.searchParams.set('limit', '1000'); for (const stage of ['active', 'deprecated', 'retired']) url.searchParams.append('lifecycle[]', stage); if (cursor) url.searchParams.set('after_id', cursor); headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
        if ((source === 'openai' || source === 'openrouter') && key) headers.Authorization = 'Bearer ' + key;
        const response = await fetchImpl(url.href, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const raw = await response.text(); if (raw.length > 8 * 1024 * 1024) throw new Error('Response too large');
        const parsed = parseModelPage(source, JSON.parse(raw)); all.push(...parsed.models); cursor = parsed.cursor;
        if (!cursor) { completed = true; break; }
        if (cursors.has(cursor)) throw new Error('Repeated cursor'); cursors.add(cursor);
      }
      if (!completed) throw new Error('Pagination limit');
      results.push({ source, models: all });
    } catch (error) {
      // Never include raw provider messages, request headers or a secret-bearing URL.
      errors.push({ source, error: /^HTTP \d+$/.test(error.message) ? error.message : 'Discovery failed; previous observations retained' });
    }
  }
  return { results, errors, skipped };
}
export function mergeDiscovery(previous, results, at = new Date().toISOString()) {
  const next = structuredClone(validateRegistry(previous)); const changes = [];
  const keyOf = item => item.brand + ':' + item.id;
  const models = new Map(next.models.map(model => [keyOf(model), model]));
  const aliases = new Map(next.models.flatMap(model => model.aliases.map(alias => [model.brand + ':' + alias, keyOf(model)])));
  for (const { source, models: found } of results) {
    const seen = new Set();
    const ref = 'models-' + source;
    next.sources[ref] = { title: source + ' Models API', url: DISCOVERY_SOURCES[source].doc };
    for (const observation of found) {
      const existingAlias = observation.aliases.map(alias => observation.brand + ':' + alias).find(key => models.has(key) || aliases.has(key));
      const key = models.has(keyOf(observation)) ? keyOf(observation) : aliases.get(keyOf(observation)) || (existingAlias && (aliases.get(existingAlias) || existingAlias)) || keyOf(observation); seen.add(key);
      let model = models.get(key); const isNew = !model;
      if (!model) {
        const generic = next.profiles.find(profile => profile.brand === observation.brand && profile.modelId === 'general');
        const relative = next.models.find(item => observation.family && item.brand === observation.brand && item.family === observation.family && item.lifecycle !== 'retired');
        const relativeProfile = relative ? next.profiles.find(profile => profile.id === relative.profileId) : generic;
        // A new version must not inherit instructions explicitly naming an older version.
        const inherited = relativeProfile.policyId === generic.policyId ? relativeProfile : generic;
        const profileId = key + '@1';
        next.profiles.push({ ...structuredClone(inherited), id: profileId, modelId: observation.id, version: 1, status: 'fallback', confidence: 'low', validation: { schema: true, performance: null }, updatedAt: at });
        model = { id: observation.id, brand: observation.brand, provider: observation.provider, displayName: observation.displayName,
          family: observation.family, releaseDate: null, capabilities: null, contextWindow: null, profileId, profileVersion: 1,
          candidateProfileId: null, aliases: [], availability: 'unknown', webAvailability: 'unknown', lifecycle: 'unknown', sourceRefs: [], firstSeen: at, lastUpdated: at, isNew: true, observations: [] };
        models.set(key, model); changes.push({ at, type: 'new', modelKey: key, detail: 'Discovered; inherited profile, performance unverified' });
      }
      const before = JSON.stringify(model);
      model.observations = model.observations.filter(item => item.source !== source);
      model.observations.push({ source, id: observation.id, seenAt: at, contextWindow: observation.contextWindow, availability: observation.availability });
      const firstParty = source !== 'openrouter';
      if (firstParty || !model.capabilities) model.capabilities = observation.capabilities ?? model.capabilities;
      if (firstParty || !model.contextWindow) model.contextWindow = observation.contextWindow ?? model.contextWindow;
      model.family = observation.family ?? model.family;
      model.releaseDate = observation.releaseDate ?? model.releaseDate;
      if (firstParty || isNew) model.displayName = observation.displayName;
      // An aggregator cannot resurrect a retirement reported by the first-party API.
      if (firstParty || model.lifecycle !== 'retired') { model.availability = observation.availability; if (observation.lifecycle !== 'unknown') model.lifecycle = observation.lifecycle; }
      if (model.lifecycle === 'retired') {
        const ended = next.profiles.find(profile => profile.id === model.profileId);
        ended.status = 'deprecated'; ended.updatedAt = at;
        if (ended.confidence === 'measured') ended.confidence = 'documented';
        model.candidateProfileId = null;
      }
      model.aliases = [...new Set([...model.aliases, ...observation.aliases, observation.id])].filter(alias => alias !== model.id && (!models.has(model.brand + ':' + alias) || model.brand + ':' + alias === key)).slice(0, 100);
      for (const alias of model.aliases) aliases.set(model.brand + ':' + alias, key);
      model.sourceRefs = [...new Set([...model.sourceRefs, ref])];
      if (before !== JSON.stringify(model)) { model.lastUpdated = at; if (!isNew) changes.push({ at, type: 'changed', modelKey: key, detail: 'API metadata or observation refreshed' }); }
    }
    for (const model of models.values()) {
      if (model.id === 'general' || seen.has(keyOf(model))) continue;
      const old = model.observations.find(item => item.source === source);
      if (old && old.availability === 'listed') {
        old.availability = 'not_observed';
        if (model.observations.every(item => item.availability !== 'listed') && model.lifecycle !== 'retired') model.availability = 'not_observed';
        changes.push({ at, type: 'missing', modelKey: keyOf(model), detail: 'Not observed in this scoped listing; not marked retired' });
      }
    }
  }
  next.models = [...models.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  next.changes = [...next.changes, ...changes].slice(-200);
  return validateRegistry(next);
}
