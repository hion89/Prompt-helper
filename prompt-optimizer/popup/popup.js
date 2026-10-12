import { DEFAULT_SETTINGS, getSettings, normalizeSettings, saveSettings } from '../shared/settings.js';
import { recordDiagnostic } from '../shared/diagnostics.js';

const LIMIT = 50_000;
const inputLimit = () => 12_000;
const byId = (id) => document.getElementById(id);
const ui = {
  workspace: byId('workspace'), target: byId('target-model'), language: byId('response-language'),
  badge: byId('provider-badge'), engineHint: byId('engine-hint'), processingNote: byId('processing-note'), apiSettings: byId('api-settings'),
  theme: byId('theme'), modes: byId('mode-options'), source: byId('source'), output: byId('output'),
  sourceCount: byId('source-count'), outputCount: byId('output-count'), sourceHint: byId('source-hint'),
  optimize: byId('optimize'), optimizeLabel: byId('optimize-label'), importPage: byId('import-page'),
  copy: byId('copy'), replace: byId('replace'), reset: byId('reset'), undo: byId('undo'),
  detail: byId('result-detail'), resultLanguage: byId('result-language'),
  pageStatus: byId('page-status'), feedback: byId('feedback'), toolbarEnabled: byId('toolbar-enabled'),
  reconnectPage: byId('reconnect-page'), reloadPage: byId('reload-page'),
};
const taskNames = {
  general: '일반 질문', general_question: '일반 질문', question: '일반 질문',
  coding: '코딩', code_analysis: '코드 분석', debugging: '문제 분석',
  code_generation: '코드 작성', summarization: '요약', translation: '번역',
  writing: '글쓰기', rewriting: '다듬기', research: '조사', comparison: '비교',
  brainstorming: '아이디어', planning: '계획', data_analysis: '데이터 분석',
  study: '학습·설명', explanation: '학습·설명', study_explanation: '학습·설명',
};
const languageNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
const siteNames = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity' };
let settings = { ...DEFAULT_SETTINGS };
let initialized = false;
let optimizing = false;
let pageBusy = false;
let copying = false;
let revision = 0;
let tabId = null;
let snapshot = null;
let resultMeta = null;
let draftKey = null;
let pendingDraft = Promise.resolve();
let storageWarningShown = false;

function logFailure(action, error) {
  recordDiagnostic({ scope: 'popup', action, site: snapshot?.site || 'extension', message: errorMessage(error, '알 수 없는 오류') }).catch(() => {});
}

function feedback(message = '', kind = 'success', reveal = false) {
  ui.feedback.textContent = message;
  ui.feedback.dataset.kind = kind;
  ui.feedback.hidden = !message;
  if (reveal && message) ui.feedback.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

function errorMessage(error, fallback) {
  const message = typeof error === 'string' ? error : error?.message;
  if (!message) return fallback;
  if (/receiving end|establish connection|no tab|context invalidated|message port|closed before/i.test(message)) {
    return 'AI 페이지를 새로고침한 뒤 다시 시도해 주세요. 지원 사이트의 입력창이 열려 있어야 합니다.';
  }
  return message;
}

function settingsFingerprint(value = settings) {
  return JSON.stringify([value.targetModel, value.responseLanguage, value.mode, value.promptLanguage, value.geminiModel]);
}

function paintSettings() {
  ui.badge.textContent = 'GEMINI API';
  ui.engineHint.textContent = 'Gemini ' + settings.geminiModel + '로 원문을 전송해 재작성합니다. 무료 여부는 API 프로젝트 등급에 따릅니다.';
  ui.processingNote.textContent = 'Gemini API로 전송 · 자동 유료 전환 없음';
  ui.target.value = settings.targetModel;
  ui.language.value = settings.responseLanguage;
  ui.theme.value = settings.theme;
  document.documentElement.dataset.theme = settings.theme;
  for (const radio of ui.modes.querySelectorAll('input')) radio.checked = radio.value === settings.mode;
  ui.toolbarEnabled.checked = settings.toolbarEnabled;
  ui.toolbarEnabled.disabled = !initialized;
}

function paint() {
  const length = ui.source.value.length;
  const oversized = length > inputLimit();
  const hasOutput = Boolean(ui.output.value);
  ui.sourceCount.textContent = length.toLocaleString('ko-KR') + ' / ' + inputLimit().toLocaleString('ko-KR');
  ui.outputCount.textContent = `${ui.output.value.length.toLocaleString('ko-KR')}자`;
  ui.source.setAttribute('aria-invalid', String(oversized));
  ui.source.closest('.textarea-wrap').classList.toggle('invalid', oversized);
  ui.sourceHint.textContent = oversized ? (inputLimit().toLocaleString('ko-KR') + '자 이내로 줄여 주세요') : '평소처럼 편하게 적어 주세요';
  ui.output.closest('.textarea-wrap').classList.toggle('has-result', hasOutput);
  ui.optimize.disabled = !initialized || optimizing || pageBusy || !ui.source.value.trim() || oversized;
  ui.optimize.dataset.loading = String(optimizing);
  ui.optimizeLabel.textContent = optimizing ? 'AI가 의미를 분석하고 있어요…' : 'Optimize Prompt';
  ui.workspace.setAttribute('aria-busy', String(!initialized || optimizing));
  ui.importPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
  ui.copy.disabled = !hasOutput || copying || optimizing;
  ui.replace.disabled = !hasOutput || !snapshot || pageBusy || optimizing;
  ui.reset.disabled = !initialized || pageBusy || (!ui.source.value && !hasOutput);
  ui.undo.hidden = !snapshot?.canUndo;
  ui.undo.disabled = !snapshot?.canUndo || pageBusy || optimizing;
  ui.reconnectPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
  ui.reloadPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
}

function clearResult(reason = '결과 미리보기') {
  ui.output.value = '';
  resultMeta = null;
  ui.detail.textContent = reason;
  ui.resultLanguage.textContent = '의도는 유지하고, 전달은 선명하게';
}

function paintResult(text, meta = {}) {
  ui.output.value = text;
  resultMeta = meta;
  ui.detail.textContent = taskNames[meta.task] || '최적화 완료';
  const responseName = languageNames[meta.responseLanguage];
  const tokens = meta.usage?.totalTokens;
  ui.resultLanguage.textContent = (responseName ? '응답 언어 · ' + responseName : '최적화 완료') + (Number.isFinite(tokens) ? ' · API ' + tokens.toLocaleString() + ' 토큰' : '');
  if (meta.intentMethod === 'llm-rewrite') ui.detail.textContent = 'AI 맞춤 재작성';
}

// Prompts are never written to local/sync storage. The session store stays private
// to extension contexts and disappears on browser shutdown or extension reload.
function persistDraft() {
  if (!draftKey || !chrome.storage.session) return;
  const key = draftKey;
  const value = ui.source.value.length <= LIMIT && (ui.source.value || ui.output.value)
    ? { source: ui.source.value, output: ui.output.value, fingerprint: settingsFingerprint(), meta: resultMeta }
    : null;
  pendingDraft = pendingDraft.catch(() => {}).then(async () => {
    if (value) await chrome.storage.session.set({ [key]: value });
    else await chrome.storage.session.remove(key);
  }).catch(() => {
    if (!storageWarningShown) {
      storageWarningShown = true;
      feedback('초안을 임시 저장하지 못했습니다. 팝업을 닫기 전에 필요한 내용을 복사해 주세요.', 'error');
    }
  });
}

async function restoreDraft() {
  if (!draftKey || !chrome.storage.session) return;
  try {
    const stored = await chrome.storage.session.get(draftKey);
    const draft = stored[draftKey];
    if (!draft || typeof draft.source !== 'string' || draft.source.length > LIMIT) return;
    ui.source.value = draft.source;
    if (draft.fingerprint === settingsFingerprint() && typeof draft.output === 'string' && draft.output.length <= LIMIT * 3) {
      if (draft.output) paintResult(draft.output, draft.meta && typeof draft.meta === 'object' ? draft.meta : {});
    }
  } catch {
    feedback('이전 초안을 불러오지 못했습니다. 새 요청을 작성해 주세요.', 'error');
  }
}

function showPage() {
  if (snapshot) {
    ui.pageStatus.textContent = `${siteNames[snapshot.site] || 'AI 페이지'} 연결됨 · 자동 전송하지 않음`;
    ui.pageStatus.dataset.connected = 'true';
    ui.reloadPage.hidden = true;
  } else {
    ui.pageStatus.textContent = '입력창 연결 안 됨 · 다시 찾기를 눌러 보세요.';
    ui.pageStatus.dataset.connected = 'false';
    ui.reloadPage.hidden = false;
  }
}

async function sendToPage(message) {
  if (!Number.isInteger(tabId)) throw new Error('활성 페이지를 찾지 못했습니다.');
  // Never act on a tab that is no longer the one this popup was opened for.
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== tabId) throw new Error('활성 탭이 바뀌었습니다. 팝업을 다시 열어 주세요.');
  const reply = await chrome.tabs.sendMessage(tabId, message);
  if (!reply?.ok) throw new Error(errorMessage(reply?.error, '페이지 입력창을 찾지 못했습니다. 입력창을 연 뒤 다시 시도해 주세요.'));
  return reply;
}

async function readPage() {
  const reply = await sendToPage({ type: 'PO_GET_COMPOSER' });
  if (typeof reply.text !== 'string' || !reply.token) throw new Error('페이지 입력창이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
  snapshot = { text: reply.text, token: reply.token, site: reply.site, canUndo: Boolean(reply.canUndo) };
  showPage();
  paint();
  return snapshot;
}

async function reconnectPage() {
  if (ui.reconnectPage.disabled || pageBusy) return;
  pageBusy = true;
  snapshot = null;
  showPage();
  paint();
  feedback('현재 페이지에서 입력창을 다시 찾고 있습니다.');
  try {
    const reply = await sendToPage({ type: 'PO_RESCAN' });
    if (typeof reply.text !== 'string' || !reply.token) throw new Error('입력창이 아직 준비되지 않았습니다.');
    snapshot = { text: reply.text, token: reply.token, site: reply.site, canUndo: Boolean(reply.canUndo) };
    feedback('입력창을 다시 찾았습니다. 이제 페이지에서 가져오기나 Replace를 사용할 수 있습니다.');
  } catch (error) {
    logFailure('reconnect-page', error);
    feedback(`${errorMessage(error, '입력창을 다시 찾지 못했습니다.')} 페이지 입력창을 한 번 클릭한 뒤 다시 찾거나 페이지 새로고침을 눌러 주세요.`, 'error', true);
  } finally {
    pageBusy = false;
    showPage();
    paint();
  }
}

async function reloadPage() {
  if (ui.reloadPage.disabled || pageBusy || !Number.isInteger(tabId)) return;
  pageBusy = true;
  snapshot = null;
  showPage();
  paint();
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== tabId) throw new Error('활성 탭이 바뀌었습니다. 팝업을 다시 열어 주세요.');
    await chrome.tabs.reload(tabId);
    feedback('페이지를 새로고침했습니다. 페이지가 열린 뒤 확장 프로그램을 다시 열어 주세요.');
  } catch (error) {
    logFailure('reload-page', error);
    feedback(errorMessage(error, '페이지를 새로고침하지 못했습니다.'), 'error', true);
  } finally {
    pageBusy = false;
    showPage();
    paint();
  }
}

async function changeSetting(partial) {
  const compilerKeys = new Set(['targetModel', 'responseLanguage', 'mode', 'promptLanguage', 'geminiModel']);
  const compilerChanged = Object.keys(partial).some((key) => compilerKeys.has(key));
  settings = normalizeSettings({ ...settings, ...partial });
  paintSettings();
  if (compilerChanged) {
    revision += 1;
    clearResult(ui.source.value ? '설정 변경 · 다시 최적화' : '결과 미리보기');
    feedback();
    persistDraft();
  }
  paint();
  try {
    // Use partial writes to preserve independent changes in the other contexts.
    await saveSettings(partial);
  } catch {
    feedback('설정을 저장하지 못했습니다. 현재 선택은 이번 팝업에서 계속 사용할 수 있습니다.', 'error');
  }
}

async function optimize() {
  if (ui.optimize.disabled || optimizing) return;
  const currentRevision = revision;
  const text = ui.source.value;
  const currentSettings = { ...settings };
  optimizing = true;
  feedback();
  clearResult('요청을 정리하고 있어요');
  paint();
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'OPTIMIZE', text, settings: currentSettings });
    if (revision !== currentRevision) return;
    if (!reply?.ok || typeof reply.result?.text !== 'string' || !reply.result.text.trim()) {
      throw new Error(errorMessage(reply?.error, '프롬프트를 만들지 못했습니다. 다시 시도해 주세요.'));
    }
    paintResult(reply.result.text, reply.result.meta || {});
    persistDraft();
    feedback('최적화했습니다. 내용을 확인한 뒤 복사하거나 입력창에 넣어 주세요.');
    ui.output.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  } catch (error) {
    logFailure('optimize', error);
    if (revision === currentRevision) {
      clearResult('다시 시도해 주세요');
      feedback(errorMessage(error, '최적화 중 오류가 발생했습니다.'), 'error', true);
    }
  } finally {
    optimizing = false;
    paint();
  }
}

async function importPage() {
  if (ui.importPage.disabled || pageBusy) return;
  pageBusy = true;
  paint();
  try {
    const page = await readPage();
    if (!page.text.trim()) {
      feedback('페이지 입력창이 비어 있습니다. 먼저 요청을 작성해 주세요.', 'error', true);
      return;
    }
    if (page.text.length > inputLimit()) {
      feedback('페이지 요청이 12,000자를 넘습니다. 입력창의 내용을 줄인 뒤 가져와 주세요.', 'error', true);
      return;
    }
    revision += 1;
    ui.source.value = page.text;
    clearResult();
    persistDraft();
    feedback('페이지의 요청을 가져왔습니다. 모드를 고르고 최적화해 보세요.');
    ui.source.focus();
  } catch (error) {
    logFailure('import-page', error);
    snapshot = null;
    showPage();
    feedback(errorMessage(error, '페이지에서 요청을 가져오지 못했습니다.'), 'error', true);
  } finally {
    pageBusy = false;
    paint();
  }
}

async function replacePage() {
  if (ui.replace.disabled || pageBusy || !snapshot) return;
  const expected = { ...snapshot };
  const text = ui.output.value;
  pageBusy = true;
  paint();
  try {
    await sendToPage({ type: 'PO_REPLACE', text, expectedText: expected.text, token: expected.token });
    try { await readPage(); } catch { snapshot = null; showPage(); }
    feedback('AI 입력창에 넣었습니다. 내용을 확인한 후 직접 전송해 주세요.', 'success', true);
  } catch (error) {
    logFailure('replace-page', error);
    // Do not silently accept a new snapshot after a failed compare-and-swap.
    // An explicit import is required before another replacement can occur.
    snapshot = null;
    showPage();
    feedback(`${errorMessage(error, '입력창의 내용을 바꾸지 못했습니다.')} 페이지에서 가져오기로 입력 내용을 다시 확인해 주세요.`, 'error', true);
  } finally {
    pageBusy = false;
    paint();
  }
}

async function undoPage() {
  if (ui.undo.disabled || pageBusy || !snapshot) return;
  const expected = { ...snapshot };
  pageBusy = true;
  paint();
  try {
    await sendToPage({ type: 'PO_UNDO', expectedText: expected.text, token: expected.token });
    try { await readPage(); } catch { snapshot = null; showPage(); }
    feedback('페이지 입력창을 원문으로 복구했습니다.', 'success', true);
  } catch (error) {
    logFailure('undo-page', error);
    snapshot = null;
    showPage();
    feedback(errorMessage(error, '원문을 복구하지 못했습니다. 페이지 입력창의 내용을 확인해 주세요.'), 'error', true);
  } finally {
    pageBusy = false;
    paint();
  }
}

function legacyCopy() {
  const focused = document.activeElement;
  ui.output.focus();
  ui.output.select();
  const copied = document.execCommand('copy');
  if (focused instanceof HTMLElement) focused.focus();
  return copied;
}

async function copyOutput() {
  if (ui.copy.disabled || copying) return;
  copying = true;
  paint();
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(ui.output.value);
    } catch {
      if (!legacyCopy()) throw new Error('복사하지 못했습니다. 결과를 선택한 뒤 Ctrl+C로 복사해 주세요.');
    }
    feedback('프롬프트를 복사했습니다.', 'success', true);
  } catch (error) {
    feedback(errorMessage(error, '복사하지 못했습니다.'), 'error', true);
  } finally {
    copying = false;
    paint();
  }
}

ui.source.addEventListener('input', () => {
  revision += 1;
  clearResult(ui.source.value ? '입력 변경 · 다시 최적화' : '결과 미리보기');
  if (ui.source.value.length > inputLimit()) feedback('현재 엔진은 최대 ' + inputLimit().toLocaleString('ko-KR') + '자까지 지원합니다.', 'error');
  else feedback();
  paint();
  persistDraft();
});
ui.apiSettings.addEventListener('click', () => chrome.runtime.openOptionsPage().catch(() => feedback('API 설정을 열지 못했습니다.', 'error')));
ui.target.addEventListener('change', () => changeSetting({ targetModel: ui.target.value }));
ui.language.addEventListener('change', () => changeSetting({ responseLanguage: ui.language.value }));
ui.theme.addEventListener('change', () => changeSetting({ theme: ui.theme.value }));
ui.modes.addEventListener('change', (event) => {
  if (event.target.matches('input[name="mode"]')) changeSetting({ mode: event.target.value });
});
ui.toolbarEnabled.addEventListener('change', () => changeSetting({ toolbarEnabled: ui.toolbarEnabled.checked }));
ui.optimize.addEventListener('click', optimize);
ui.importPage.addEventListener('click', importPage);
ui.reconnectPage.addEventListener('click', reconnectPage);
ui.reloadPage.addEventListener('click', reloadPage);
ui.replace.addEventListener('click', replacePage);
ui.undo.addEventListener('click', undoPage);
ui.copy.addEventListener('click', copyOutput);
ui.reset.addEventListener('click', () => {
  if (ui.reset.disabled) return;
  revision += 1;
  ui.source.value = '';
  clearResult();
  feedback('팝업의 요청과 결과를 비웠습니다.');
  persistDraft();
  paint();
  ui.source.focus();
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    optimize();
  }
});

async function initialize() {
  const [saved, active] = await Promise.allSettled([
    getSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  if (saved.status === 'fulfilled') settings = normalizeSettings(saved.value);
  else feedback('저장된 설정을 읽지 못해 기본 설정으로 시작합니다.', 'error');
  if (active.status === 'fulfilled' && Number.isInteger(active.value[0]?.id)) tabId = active.value[0].id;
  draftKey = `po-popup-draft:${tabId ?? 'standalone'}`;
  paintSettings();
  await Promise.allSettled([
    restoreDraft(),
    readPage().catch(() => { snapshot = null; showPage(); }),
  ]);
  initialized = true;
  for (const control of [ui.target, ui.language, ui.theme, ui.modes, ui.source, ui.toolbarEnabled]) control.disabled = false;
  paintSettings();
  paint();
}

initialize().catch(() => {
  initialized = true;
  for (const control of [ui.target, ui.language, ui.theme, ui.modes, ui.source, ui.toolbarEnabled]) control.disabled = false;
  paintSettings();
  showPage();
  paint();
  feedback('일부 기능을 준비하지 못했습니다. 확장 프로그램을 새로고침한 뒤 다시 열어 주세요.', 'error');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  settings = normalizeSettings(changes.settings.newValue);
  paintSettings();
  paint();
});
