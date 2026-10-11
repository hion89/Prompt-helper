import { API_PROVIDERS } from '../providers/remote-optimizer.js';

// Restrict both stores BEFORE accessing any secret. Content scripts obtain
// public preferences via messages instead of direct storage reads.
export async function protectStorage() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
function keyName(provider) {
  if (!Object.hasOwn(API_PROVIDERS, provider)) throw new Error('지원하지 않는 API 제공업체입니다.');
  return 'po-api-key:' + provider;
}
export async function readKey(provider) {
  const name = keyName(provider);
  const temporary = await chrome.storage.session.get(name);
  if (temporary[name]) return temporary[name];
  return (await chrome.storage.local.get(name))[name] || '';
}
export async function keyStatus() {
  const result = {};
  for (const provider of Object.keys(API_PROVIDERS)) {
    const name = keyName(provider);
    const local = await chrome.storage.local.get(name);
    const session = await chrome.storage.session.get(name);
    result[provider] = { configured: Boolean(session[name] || local[name]), persistent: Boolean(local[name]), model: API_PROVIDERS[provider].model };
  }
  return result; // Never send keys or key fragments back to UI.
}
export async function saveKey(provider, key, persistent = false) {
  const name = keyName(provider);
  if (typeof key !== 'string' || !/^[\x21-\x7e]{10,512}$/.test(key.trim())) throw new Error('공백 없이 올바른 API 키를 입력해 주세요.');
  const value = key.trim();
  if (persistent) {
    await chrome.storage.local.set({ [name]: value });
    await chrome.storage.session.remove(name);
  } else {
    await chrome.storage.session.set({ [name]: value });
    await chrome.storage.local.remove(name);
  }
}
export async function deleteKey(provider) {
  const name = keyName(provider);
  await chrome.storage.session.remove(name);
  await chrome.storage.local.remove(name);
}
