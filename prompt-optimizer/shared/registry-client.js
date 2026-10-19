import { DEFAULT_REGISTRY } from './registry-seed.js';
import { validateRegistry } from './registry-schema.js';
import { installRegistry } from './target-models.js';

export const REGISTRY_CACHE_KEY = 'po-model-registry';
export const REGISTRY_BASE_URL = 'https://hion89.github.io/Prompt-helper/registry/';
export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
export async function sha256(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function verifyProfileHashes(data) {
  for (const profile of data.profiles) {
    if (profile.status !== 'validated') continue;
    const payload = { brand: profile.brand, modelId: profile.modelId, policyId: profile.policyId, optimization: profile.optimization, recommendations: profile.recommendations, sourceRefs: profile.sourceRefs };
    if (await sha256(JSON.stringify(payload)) !== profile.validation.performance.profileSha256) throw new Error('검증 프로필 해시 불일치');
  }
  return data;
}
async function readBounded(response, limit) {
  if (!response.ok) throw new Error('Registry 서버 응답 오류');
  const size = Number(response.headers?.get('content-length'));
  if (size > limit) throw new Error('Registry 용량 초과');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > limit) throw new Error('Registry 용량 초과');
    return text;
  }
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > limit) throw new Error('Registry 용량 초과'); chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export function createRegistryClient({ storage, fetchImpl = globalThis.fetch, now = Date.now, baseUrl = REGISTRY_BASE_URL } = {}) {
  let saved = {}; let loaded = false; let loading; let pending; let data = DEFAULT_REGISTRY; let origin = 'bundled';
  const validEntry = async entry => {
    if (!entry?.data || typeof entry.sha256 !== 'string') return null;
    const raw = JSON.stringify(entry.data);
    if (new TextEncoder().encode(raw).length > MAX_REGISTRY_BYTES || await sha256(raw) !== entry.sha256) return null;
    try { return await verifyProfileHashes(validateRegistry(entry.data)); } catch { return null; }
  };
  async function load() {
    if (loaded) return data;
    if (loading) return loading;
    loading = (async () => {
      try { saved = (await storage.get(REGISTRY_CACHE_KEY))[REGISTRY_CACHE_KEY] || {}; } catch { saved = {}; }
      const current = await validEntry(saved.current); const previous = current ? null : await validEntry(saved.previous);
      data = current || previous || DEFAULT_REGISTRY;
      origin = current ? 'cache' : previous ? 'recovered' : 'bundled';
      installRegistry(data); loaded = true; return data;
    })();
    return loading;
  }
  function status() {
    return { version: data.version, generatedAt: data.generatedAt, origin, modelCount: data.models.length,
      checkedAt: saved.checkedAt || null, attemptedAt: saved.attemptedAt || null, error: saved.error || null, syncing: Boolean(pending) };
  }
  async function request(url, limit, etag) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl.call(globalThis, url, { method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-cache', headers: etag ? { 'If-None-Match': etag } : {}, signal: controller.signal });
      if (response.status === 304) return { unchanged: true };
      return { text: await readBounded(response, limit), etag: response.headers?.get('etag') || null };
    } finally { clearTimeout(timer); }
  }
  async function sync({ force = false } = {}) {
    await load();
    if (pending) return pending;
    const elapsed = now() - (saved.attemptedAt || 0);
    if (elapsed < 60000 || (!force && (now() - (saved.checkedAt || 0) < 86400000 || elapsed < 3600000))) return status();
    pending = (async () => {
      const attemptedAt = now();
      try {
        const response = await request(baseUrl + 'manifest.json', 4096, origin === 'cache' || origin === 'remote' ? saved.etag : null);
        if (response.unchanged) {
          saved = { ...saved, attemptedAt, checkedAt: now(), error: null }; await storage.set({ [REGISTRY_CACHE_KEY]: saved }); return status();
        }
        const manifest = JSON.parse(response.text);
        if (manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.version) || manifest.version < data.version || !/^registry-[1-9][0-9]*-[a-f0-9]{12}\.json$/.test(manifest.file) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes > MAX_REGISTRY_BYTES || manifest.bytes < 1) throw new Error('Registry manifest 검증 실패');
        if (manifest.version === data.version) {
          // Same-version payload replacements are forbidden, including on a compromised/stale CDN.
          if (saved.current && manifest.sha256 !== (saved.publishedSha256 || saved.current.sha256)) throw new Error('Registry 버전 충돌');
          saved = { ...saved, attemptedAt, checkedAt: now(), etag: response.etag, error: null }; await storage.set({ [REGISTRY_CACHE_KEY]: saved }); return status();
        }
        const payload = await request(baseUrl + manifest.file, MAX_REGISTRY_BYTES);
        if (new TextEncoder().encode(payload.text).length !== manifest.bytes || await sha256(payload.text) !== manifest.sha256) throw new Error('Registry 무결성 검증 실패');
        const next = await verifyProfileHashes(validateRegistry(JSON.parse(payload.text)));
        if (next.version !== manifest.version) throw new Error('Registry 버전 불일치');
        const current = { data: next, sha256: await sha256(JSON.stringify(next)) };
        const previous = { data, sha256: await sha256(JSON.stringify(data)) };
        const nextSaved = { current, previous, attemptedAt, checkedAt: now(), etag: response.etag, error: null, publishedSha256: manifest.sha256 };
        await storage.set({ [REGISTRY_CACHE_KEY]: nextSaved });
        saved = nextSaved; data = next; origin = 'remote'; installRegistry(next); return status();
      } catch {
        saved = { ...saved, attemptedAt, error: '모델 목록 갱신에 실패해 마지막 정상 목록을 사용합니다.' };
        await storage.set({ [REGISTRY_CACHE_KEY]: saved }).catch(() => {});
        return status();
      }
    })();
    try { return await pending; } finally { pending = null; }
  }
  return { load, sync, status, snapshot: () => structuredClone(data) };
}
export async function loadCachedRegistry(storage = chrome.storage.local) {
  const client = createRegistryClient({ storage }); await client.load(); return client.status();
}
