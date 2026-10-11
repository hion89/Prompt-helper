export const DEFAULT_SETTINGS = Object.freeze({
  targetModel: 'chatgpt', responseLanguage: 'auto', mode: 'default', theme: 'system', promptLanguage: 'auto', geminiModel: 'gemini-3.5-flash-lite', geminiModelSelected: false,
  toolbarEnabled: true, toolbarPositions: {},
});
const choices = {
  targetModel: ['chatgpt', 'claude', 'gemini', 'perplexity'],
  responseLanguage: ['auto', 'ko', 'en', 'ja', 'zh'],
  mode: ['default', 'eco', 'precision', 'natural'],
  theme: ['system', 'light', 'dark'],
  promptLanguage: ['auto', 'ko', 'en'],
};
export function normalizeSettings(value = {}) {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  result.geminiModelSelected = value.geminiModelSelected === true;
  if (typeof value.geminiModel === 'string' && /^gemini-[a-z0-9.-]{1,80}$/.test(value.geminiModel)
      && (value.geminiModel !== 'gemini-2.5-flash-lite' || result.geminiModelSelected)) result.geminiModel = value.geminiModel;
  if (typeof value.toolbarEnabled === 'boolean') result.toolbarEnabled = value.toolbarEnabled;
  if (value.toolbarPositions && typeof value.toolbarPositions === 'object' && !Array.isArray(value.toolbarPositions)) {
    const positions = {};
    for (const site of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
      const position = value.toolbarPositions[site];
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        positions[site] = { x: Math.max(0, Math.min(1, position.x)), y: Math.max(0, Math.min(1, position.y)) };
      }
    }
    result.toolbarPositions = positions;
  }
  for (const [key, allowed] of Object.entries(choices)) {
    if (allowed.includes(value[key])) result[key] = value[key];
  }
  return result;
}
export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return normalizeSettings(settings);
}
// Serialize rapid preference writes within this context. Never store prompts here.
let pendingWrite = Promise.resolve();
export function saveSettings(partial) {
  const next = pendingWrite.catch(() => {}).then(async () => {
    const settings = normalizeSettings({ ...await getSettings(), ...partial });
    await chrome.storage.local.set({ settings });
    return settings;
  });
  pendingWrite = next;
  return next;
}
