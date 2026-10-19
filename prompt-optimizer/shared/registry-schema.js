export const BRANDS = ['chatgpt', 'claude', 'gemini', 'other'];
export const POLICY_IDS = ['general', 'openai', 'reasoning', 'gpt6', 'gpt41', 'gemini', 'gemini3', 'claude', 'opus55', 'sonnet55', 'haiku55', 'fable51'];
const str = (maxLength = 200) => ({ type: 'string', minLength: 1, maxLength });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const choice = values => ({ type: 'string', enum: values });
const integer = { type: 'integer', minimum: 1, maximum: 1000000000 };
const time = { ...str(40), format: 'date-time' };
const refs = { type: 'array', items: str(), uniqueItems: true, maxItems: 30 };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const OPTIMIZATION_SCHEMA = object({
  instructionStyle: choice(['direct', 'concise']), contextStructure: choice(['task_dependent', 'context_first', 'delimited']),
  reasoningGuidance: choice(['internal_only', 'observable_checks']), outputFormatting: choice(['explicit', 'minimal']),
  fewShotStrategy: choice(['conditional', 'provided_only']), constraintHandling: choice(['preserve']),
  tokenEfficiency: choice(['balanced', 'compact']), multimodalSupport: choice(['provided_only']),
});
const performance = object({
  passed: { type: 'boolean' }, reportSha256: { ...str(64), pattern: '^[a-f0-9]{64}$' },
  profileSha256: { ...str(64), pattern: '^[a-f0-9]{64}$' }, evaluatedCases: integer,
  targetCalls: integer, createdAt: time,
});
export const PROFILE_SCHEMA = object({
  id: str(), modelId: str(), brand: choice(BRANDS), version: integer, policyId: choice(POLICY_IDS),
  status: choice(['fallback', 'candidate', 'validated', 'deprecated']), confidence: choice(['low', 'documented', 'measured']),
  optimization: OPTIMIZATION_SCHEMA,
  recommendations: { type: 'array', items: choice(['verify_scope', 'cite_provided_evidence', 'finish_deliverable', 'state_uncertainty']), uniqueItems: true, maxItems: 4 },
  sourceRefs: refs, validation: object({ schema: { type: 'boolean' }, performance: nullable(performance) }), updatedAt: time,
});
PROFILE_SCHEMA.properties.generation = object({ kind: choice(['inherited', 'llm']), documentDigest: nullable(str(64)), generatorModel: nullable(str()), createdAt: time });
const observation = object({ source: choice(['openai', 'anthropic', 'google', 'openrouter']), id: str(), seenAt: time, contextWindow: nullable(integer), availability: choice(['listed', 'not_observed', 'retired']) });
export const MODEL_SCHEMA = object({
  id: { ...str(), pattern: '^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$' }, brand: choice(BRANDS), provider: str(80), displayName: str(240),
  family: nullable(str(100)), releaseDate: nullable({ ...str(10), format: 'date' }), capabilities: nullable({ type: 'array', items: str(80), maxItems: 40, uniqueItems: true }),
  contextWindow: nullable(integer), profileId: str(), profileVersion: integer, candidateProfileId: nullable(str()),
  aliases: { type: 'array', items: str(), maxItems: 100, uniqueItems: true },
  availability: choice(['unknown', 'listed', 'not_observed', 'retired']), webAvailability: choice(['unknown', 'confirmed', 'unavailable']),
  lifecycle: choice(['unknown', 'active', 'deprecated', 'retired']), sourceRefs: refs, firstSeen: time, lastUpdated: time, isNew: { type: 'boolean' },
  observations: { type: 'array', items: observation, maxItems: 10 },
});
export const REGISTRY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', ...object({
    schemaVersion: { const: 1 }, version: integer, generatedAt: time, profileRevision: str(100),
    sources: { type: 'object', maxProperties: 2000, additionalProperties: object({ title: str(240), url: { ...str(1500), format: 'https-url' } }) },
    models: { type: 'array', items: MODEL_SCHEMA, minItems: 4, maxItems: 5000 },
    profiles: { type: 'array', items: PROFILE_SCHEMA, minItems: 4, maxItems: 15000 },
    changes: { type: 'array', items: object({ at: time, type: choice(['new', 'changed', 'missing', 'candidate', 'rejected', 'promoted', 'rollback']), modelKey: str(240), detail: str(500) }), maxItems: 200 },
  }),
};

// Implements only the schema keywords used above, with unknown object fields rejected.
// Both CI and the extension use this validator; no executable remote schema is loaded.
export function validateSchema(value, schema, path = '$') {
  if (schema.anyOf) {
    for (const option of schema.anyOf) { try { validateSchema(value, option, path); return value; } catch {} }
    throw new Error(path + ': invalid alternative');
  }
  const fail = reason => { throw new Error(path + ': ' + reason); };
  if ('const' in schema && value !== schema.const) fail('const');
  if (schema.enum && !schema.enum.includes(value)) fail('enum');
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !(schema.type === 'integer' ? Number.isSafeInteger(value) : schema.type === type)) fail('type');
  if (type === 'string') {
    if (value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity)) fail('length');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('pattern');
    if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))) fail('date-time');
    if (schema.format === 'date' && (!/^\d{4}-\d\d-\d\d$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value)) fail('date');
    if (schema.format === 'https-url') {
      let parsed; try { parsed = new URL(value); } catch { fail('url'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) fail('https-url');
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) fail('control character');
  }
  if (type === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('range');
  if (type === 'array') {
    if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems || Infinity)) fail('array length');
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('duplicates');
    value.forEach((item, index) => validateSchema(item, schema.items, path + '[' + index + ']'));
  }
  if (type === 'object') {
    if (Object.keys(value).length > (schema.maxProperties || Infinity)) fail('object size');
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail('missing ' + key);
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe key');
      const child = schema.properties?.[key] ?? schema.additionalProperties;
      if (!child) fail('unknown ' + key);
      validateSchema(item, child, path + '.' + key);
    }
  }
  return value;
}
export function validateRegistry(value) {
  validateSchema(value, REGISTRY_SCHEMA);
  const sources = new Set(Object.keys(value.sources));
  const profiles = new Map(value.profiles.map(profile => [profile.id, profile]));
  if (profiles.size !== value.profiles.length) throw new Error('Duplicate profile ID');
  const seen = new Set();
  for (const entry of [...value.models, ...value.profiles]) for (const ref of entry.sourceRefs) if (!sources.has(ref)) throw new Error('Unknown source ' + ref);
  for (const profile of value.profiles) {
    const policies = { chatgpt: ['openai', 'reasoning', 'gpt6', 'gpt41'], gemini: ['gemini', 'gemini3'], claude: ['claude', 'opus55', 'sonnet55', 'haiku55', 'fable51'], other: ['general'] };
    if (!policies[profile.brand].includes(profile.policyId)) throw new Error('Cross-brand policy');
    if (profile.status === 'validated' && (!profile.validation.schema || !profile.validation.performance?.passed || profile.confidence !== 'measured')) throw new Error('Missing measured validation');
    if (profile.status === 'validated' && (profile.validation.performance.evaluatedCases < 3 || profile.validation.performance.targetCalls < profile.validation.performance.evaluatedCases * 2)) throw new Error('Incomplete measured validation');
    if (profile.status !== 'validated' && profile.confidence === 'measured') throw new Error('Unverified measured claim');
  }
  for (const model of value.models) {
    const key = model.brand + ':' + model.id;
    if (seen.has(key)) throw new Error('Duplicate model ' + key);
    seen.add(key);
    const profile = profiles.get(model.profileId);
    if (!profile || profile.modelId !== model.id || profile.brand !== model.brand || profile.version !== model.profileVersion || !['fallback', 'validated', 'deprecated'].includes(profile.status)) throw new Error('Invalid active profile ' + key);
    const candidate = profiles.get(model.candidateProfileId);
    if (model.candidateProfileId && (!candidate || candidate.status !== 'candidate' || candidate.modelId !== model.id || candidate.brand !== model.brand)) throw new Error('Invalid candidate ' + key);
  }
  for (const brand of BRANDS) if (!seen.has(brand + ':general')) throw new Error('Missing generic profile ' + brand);
  return value;
}
