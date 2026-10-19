import { DEFAULT_REGISTRY } from './registry-seed.js';
import { validateRegistry } from './registry-schema.js';
import { compileProfile } from './profile-rules.js';

export const TARGET_BRANDS = Object.freeze({ chatgpt: 'ChatGPT / OpenAI', gemini: 'Gemini', claude: 'Claude', other: 'Other / OpenRouter' });
let activeRegistry = validateRegistry(DEFAULT_REGISTRY);
export let PROFILE_REVISION = activeRegistry.profileRevision;
export let PROFILE_CHECKED = activeRegistry.generatedAt.slice(0, 10);
export let PROFILE_SOURCES = activeRegistry.sources;
export let TARGET_MODELS = buildCatalog();
function buildCatalog() {
  return Object.fromEntries(Object.keys(TARGET_BRANDS).map(brand => [brand, activeRegistry.models.filter(item => item.brand === brand).map(item => {
    const profile = activeRegistry.profiles.find(profile => profile.id === item.profileId);
    return { ...item, label: item.displayName, family: profile.policyId, sources: profile.sourceRefs };
  })]));
}
export function registrySnapshot() { return structuredClone(activeRegistry); }
export function installRegistry(value) {
  const checked = validateRegistry(value);
  activeRegistry = structuredClone(checked);
  PROFILE_REVISION = checked.profileRevision;
  PROFILE_CHECKED = checked.generatedAt.slice(0, 10);
  PROFILE_SOURCES = activeRegistry.sources;
  TARGET_MODELS = buildCatalog();
}
export function targetProfile(brand = 'chatgpt', id = 'general') {
  const list = TARGET_MODELS[brand] || TARGET_MODELS.chatgpt;
  const selected = list.find(item => item.id === id || item.aliases.includes(id)) || list.find(item => item.id === 'general');
  const profile = activeRegistry.profiles.find(item => item.id === selected.profileId);
  const fallback = activeRegistry.profiles.find(item => item.brand === selected.brand && item.modelId === 'general');
  const effective = selected.lifecycle === 'retired' || profile.status === 'deprecated' ? fallback : profile;
  return { ...selected, ...compileProfile(effective), profileId: effective.id, profileVersion: effective.version,
    profileStatus: effective.status, candidatePending: Boolean(selected.candidateProfileId), confidence: effective.confidence,
    sources: effective.sourceRefs, revision: PROFILE_REVISION + ':' + effective.id + '@' + effective.version, checked: effective.updatedAt.slice(0, 10) };
}
export function selectedTargetProfile(settings) {
  return targetProfile(settings.targetModel, settings.targetVariants?.[settings.targetModel]);
}
export function knownModelBrand(id) {
  return activeRegistry.models.find(item => item.id !== 'general' && (item.id === id || item.aliases.includes(id)))?.brand;
}
export function normalizeTargetId(brand, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/.test(id)) return 'general';
  const selected = TARGET_MODELS[brand]?.find(model => model.id === id || model.aliases.includes(id));
  if (selected) return selected.id;
  const known = knownModelBrand(id);
  return known && known !== brand ? 'general' : id;
}
