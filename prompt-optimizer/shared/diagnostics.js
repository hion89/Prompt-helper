export const DIAGNOSTIC_KEY = 'diagnosticEvents';
export const MAX_DIAGNOSTICS = 30;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function sanitizeDiagnosticMessage(value) {
  let message = typeof value === 'string' ? value : value?.message || String(value || '알 수 없는 오류');
  message = message
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/\bsk-[0-9A-Za-z_-]{10,}/gi, '[REDACTED_API_KEY]')
    .replace(/(authorization|x-goog-api-key)\s*[:=]\s*\S+/gi, '$1: [REDACTED]')
    .replace(/https?:\/\/([^\s/?#]+)[^\s]*/gi, 'https://$1/[REDACTED_PATH]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return message.slice(0, 500) || '알 수 없는 오류';
}

function normalizeEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const time = Number.isFinite(Date.parse(value.time)) ? new Date(value.time).toISOString() : new Date().toISOString();
  let currentVersion = 'unknown';
  try { currentVersion = chrome.runtime.getManifest?.().version || currentVersion; } catch {}
  return {
    time,
    scope: String(value.scope || 'extension').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'extension',
    action: String(value.action || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'unknown',
    site: String(value.site || 'extension').replace(/[^a-z0-9._-]/gi, '').slice(0, 64) || 'extension',
    message: sanitizeDiagnosticMessage(value.message),
    version: String(value.version || currentVersion).slice(0, 24),
  };
}

export async function readDiagnostics() {
  const stored = await chrome.storage.local.get(DIAGNOSTIC_KEY);
  const cutoff = Date.now() - MAX_AGE_MS;
  return (Array.isArray(stored[DIAGNOSTIC_KEY]) ? stored[DIAGNOSTIC_KEY] : [])
    .map(normalizeEvent)
    .filter(event => event && Date.parse(event.time) >= cutoff)
    .slice(-MAX_DIAGNOSTICS);
}

let pendingWrite = Promise.resolve();
export function recordDiagnostic(event) {
  const normalized = normalizeEvent(event);
  const next = pendingWrite.catch(() => {}).then(async () => {
    const events = await readDiagnostics();
    events.push(normalized);
    await chrome.storage.local.set({ [DIAGNOSTIC_KEY]: events.slice(-MAX_DIAGNOSTICS) });
  });
  pendingWrite = next;
  return next;
}

export async function clearDiagnostics() {
  await chrome.storage.local.remove(DIAGNOSTIC_KEY);
}
