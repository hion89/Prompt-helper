import { RemotePromptOptimizer, API_PROVIDERS, listGeminiModels } from '../providers/remote-optimizer.js';
import { getSettings, normalizeSettings, saveSettings } from '../shared/settings.js';
import { protectStorage, keyStatus, readKey, saveKey, deleteKey } from './credentials.js';

const allowedHosts = new Set(['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai', 'www.perplexity.ai']);
const siteByHost = { 'chatgpt.com': 'chatgpt', 'chat.openai.com': 'chatgpt', 'claude.ai': 'claude', 'gemini.google.com': 'gemini', 'perplexity.ai': 'perplexity', 'www.perplexity.ai': 'perplexity' };
const storageReady = protectStorage().then(async () => {
  await Promise.all([
    chrome.storage.local.remove('po-api-key:openai'),
    chrome.storage.session.remove('po-api-key:openai'),
  ]);
  const stored = await chrome.storage.local.get('settings');
  if (stored.settings) {
    const normalized = normalizeSettings(stored.settings);
    if (JSON.stringify(stored.settings) !== JSON.stringify(normalized)) await chrome.storage.local.set({ settings: normalized });
  }
  return true;
}, () => false);
let remoteBusy = false;
function isExtensionPage(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url || sender.origin);
    return url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id;
  } catch { return false; }
}
function validSender(sender) {
  if (isExtensionPage(sender)) return true;
  if (sender.id !== chrome.runtime.id) return false;
  try { const url = new URL(sender.url); return url.protocol === 'https:' && allowedHosts.has(url.hostname); } catch { return false; }
}
const accepted = new Set(['OPTIMIZE', 'GET_PUBLIC_SETTINGS', 'SET_TOOLBAR_STATE', 'API_STATUS', 'API_SAVE_KEY', 'API_DELETE_KEY', 'API_LIST_MODELS']);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!accepted.has(message?.type)) return false;
  (async () => {
    try {
      if (!validSender(sender)) throw new Error('이 페이지에서는 요청을 처리할 수 없습니다.');
      if (!await storageReady) throw new Error('키 저장소를 보호하지 못했습니다. 확장 프로그램을 다시 로드해 주세요.');
      if (message.type.startsWith('API_')) {
        if (!isExtensionPage(sender)) throw new Error('API 키 설정은 확장 프로그램 설정 화면에서만 가능합니다.');
        if (message.type === 'API_SAVE_KEY') {
          const config = API_PROVIDERS[message.provider];
          if (!config || !await chrome.permissions.contains({ origins: [config.origin] })) throw new Error('선택한 API의 연결 권한을 먼저 허용해 주세요.');
          await saveKey(message.provider, message.key, message.persistent === true);
        }
        if (message.type === 'API_DELETE_KEY') await deleteKey(message.provider);
        if (message.type === 'API_LIST_MODELS') {
          if (message.provider !== 'gemini') throw new Error('Gemini 모델 목록만 조회할 수 있습니다.');
          if (!await chrome.permissions.contains({ origins: [API_PROVIDERS.gemini.origin] })) throw new Error('Gemini API 연결 권한을 먼저 허용해 주세요.');
          const key = await readKey('gemini');
          const models = await listGeminiModels(key);
          sendResponse({ ok: true, models });
          return;
        }
        sendResponse({ ok: true, status: await keyStatus() });
        return;
      }
      const stored = await getSettings();
      if (message.type === 'GET_PUBLIC_SETTINGS') { sendResponse({ ok: true, settings: stored }); return; }
      if (message.type === 'SET_TOOLBAR_STATE') {
        if (isExtensionPage(sender)) throw new Error('페이지 미니 도구 위치는 지원 사이트에서만 변경할 수 있습니다.');
        const siteName = siteByHost[new URL(sender.url).hostname];
        const partial = {};
        if (typeof message.enabled === 'boolean') partial.toolbarEnabled = message.enabled;
        if (message.position === null) {
          const positions = { ...stored.toolbarPositions };
          delete positions[siteName];
          partial.toolbarPositions = positions;
        } else if (message.position !== undefined) {
          const { x, y } = message.position || {};
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new Error('미니 도구 위치가 올바르지 않습니다.');
          partial.toolbarPositions = { ...stored.toolbarPositions, [siteName]: { x, y } };
        }
        if (!Object.keys(partial).length) throw new Error('변경할 미니 도구 설정이 없습니다.');
        const settings = await saveSettings(partial);
        sendResponse({ ok: true, settings });
        return;
      }
      if (typeof message.text !== 'string' || !message.text.trim()) throw new Error('최적화할 요청을 입력해 주세요.');
      if (message.text.length > 12000) throw new Error('Gemini 재작성은 한 번에 12,000자까지 지원합니다.');
      // Sites may choose only the destination AI. Gemini is always the optimizer.
      const incoming = message.settings && typeof message.settings === 'object' ? message.settings : {};
      const overrides = isExtensionPage(sender) ? incoming : { targetModel: incoming.targetModel || stored.targetModel };
      const settings = normalizeSettings({ ...stored, ...overrides });
      if (remoteBusy) throw new Error('다른 Gemini 재작성이 진행 중입니다. 완료 후 다시 눌러 주세요.');
      remoteBusy = true;
      let result;
      try {
        if (!await chrome.permissions.contains({ origins: [API_PROVIDERS.gemini.origin] })) throw new Error('Gemini API 연결 권한이 없습니다. API 설정에서 키를 등록해 주세요.');
        const key = await readKey('gemini');
        if (!key) throw new Error('Gemini API 키를 먼저 등록해 주세요.');
        result = await new RemotePromptOptimizer('gemini', key).optimize(message.text, settings);
      } finally { remoteBusy = false; }
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : '최적화하지 못했습니다.' });
    }
  })();
  return true;
});
// Keep content-toolbar preferences current without exposing local secrets.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const settings = normalizeSettings(changes.settings.newValue);
  chrome.tabs.query({}).then(tabs => Promise.allSettled(
    tabs.filter(tab => Number.isInteger(tab.id)).map(tab => chrome.tabs.sendMessage(tab.id, { type: 'PO_SETTINGS', settings }))
  )).catch(() => {});
});
