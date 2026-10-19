import { DEFAULT_SETTINGS, getSettings, normalizeSettings, saveSettings } from '../shared/settings.js';
import { recordDiagnostic } from '../shared/diagnostics.js';
import { CUSTOM_CONCEPTS, customConfigurationError } from '../shared/custom.js';
import { TARGET_MODELS, PROFILE_SOURCES, PROFILE_REVISION, selectedTargetProfile, installRegistry } from '../shared/target-models.js';
import { loadCachedRegistry, REGISTRY_CACHE_KEY } from '../shared/registry-client.js';

const LIMIT = 50_000;
const inputLimit = () => 12_000;
const byId = (id) => document.getElementById(id);
const ui = {
  workspace: byId('workspace'), target: byId('target-model'), language: byId('response-language'),
  version: byId('target-version'), profileSummary: byId('target-profile-summary'), profileSources: byId('target-profile-sources'), profileRules: byId('target-profile-rules'), toolbarRestore: byId('toolbar-restore'),
  modelSearch: byId('target-model-search'), searchCount: byId('target-search-count'), profileStatus: byId('target-profile-status'), registryStatus: byId('registry-status'), registryRefresh: byId('registry-refresh'),
  badge: byId('provider-badge'), engineHint: byId('engine-hint'), processingNote: byId('processing-note'), apiSettings: byId('api-settings'),
  theme: byId('theme'), modes: byId('mode-options'), source: byId('source'), output: byId('output'),
  sourceCount: byId('source-count'), outputCount: byId('output-count'), sourceHint: byId('source-hint'),
  optimize: byId('optimize'), optimizeLabel: byId('optimize-label'), importPage: byId('import-page'),
  copy: byId('copy'), replace: byId('replace'), reset: byId('reset'), undo: byId('undo'),
  detail: byId('result-detail'), resultLanguage: byId('result-language'),
  pageStatus: byId('page-status'), feedback: byId('feedback'), toolbarEnabled: byId('toolbar-enabled'),
  reconnectPage: byId('reconnect-page'), reloadPage: byId('reload-page'),
  apiState: byId('api-state'), apiTitle: byId('api-state-title'), apiDetail: byId('api-state-detail'), apiRoute: byId('api-route'),
  apiKeyState: byId('api-key-state'), apiPermissionState: byId('api-permission-state'), apiSetup: byId('api-setup'), apiRefresh: byId('api-refresh'), requestRoute: byId('request-route'),
  custom: byId('custom-options'), customAuto: byId('custom-auto'), customManual: byId('custom-manual'),
  concepts: byId('custom-concepts'), customInstructions: byId('custom-instructions'), customCount: byId('custom-count'), customSelection: byId('custom-selection'),
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
let optimizeStarted = 0;
let pageBusy = false;
let copying = false;
let revision = 0;
let tabId = null;
let snapshot = null;
let resultMeta = null;
let draftKey = null;
let pendingDraft = Promise.resolve();
let storageWarningShown = false;
let apiState = null;
let apiChecking = false;
let apiCheckRevision = 0;
let apiOutcome = null;
let pendingSettingWrites = 0;
let registryBusy = false;
let registryStatus = null;

async function refreshRegistry(force = false) {
  if (registryBusy) return;
  registryBusy = true; ui.registryRefresh.disabled = true; ui.registryStatus.textContent = '모델 목록 확인 중…';
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'MODEL_REGISTRY_STATUS', refresh: force });
    if (!reply?.ok || !reply.registry || !reply.status) throw new Error('Registry unavailable');
    const previous = settingsFingerprint();
    installRegistry(reply.registry); registryStatus = reply.status;
    if (previous !== settingsFingerprint()) { revision++; clearResult('모델 지침 갱신 · 다시 최적화'); persistDraft(); }
  } catch { registryStatus = { ...registryStatus, error: '원격 목록을 확인하지 못해 저장된 목록을 사용합니다.' }; }
  finally { registryBusy = false; ui.registryRefresh.disabled = false; paintSettings(); paint(); }
}

for (const [id, concept] of Object.entries(CUSTOM_CONCEPTS)) {
  const label = document.createElement('label');
  label.className = 'concept-option';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.name = 'custom-concept'; input.value = id;
  const description = document.createElement('span');
  const title = document.createElement('b'); title.textContent = concept.label;
  const hint = document.createElement('small'); hint.textContent = concept.hint;
  description.append(title, hint); label.append(input, description); ui.concepts.append(label);
}

function paintApiState() {
  const ready = apiState?.ready === true;
  let state = !apiState ? (apiChecking ? 'checking' : 'error') : !apiState.configured ? 'missing' : !apiState.granted ? 'permission' : 'ready';
  let title = { checking: 'API 등록 상태 확인 중…', error: 'API 상태 확인 실패', missing: 'API 키 미등록 · 최적화 불가', permission: 'API 연결 권한 필요', ready: 'API 사용 준비 · 키 등록됨' }[state];
  let detail = !apiState ? '상태 확인을 눌러 등록 상태를 다시 확인해 주세요.'
    : !apiState.configured ? '개인 Gemini API 키를 등록하면 최적화를 사용할 수 있습니다.'
    : !apiState.granted ? 'API 설정에서 Chrome의 Gemini 서버 접근 권한을 허용해 주세요.'
    : 'Optimize를 누르면 원문과 선택 설정이 Gemini API로 전송됩니다. 인증과 할당량은 실제 요청 시 확인됩니다.';
  if (ready && optimizing) {
    const seconds = Math.floor((Date.now() - optimizeStarted) / 1000);
    state = 'sending'; title = 'Gemini API로 최적화 중…';
    detail = `응답 대기 ${seconds}초 / 최대 90초. 완성된 결과를 받은 뒤에만 표시합니다.`;
  }
  else if (ready && apiOutcome?.model === settings.geminiModel) {
    state = apiOutcome.ok ? 'success' : 'error';
    title = apiOutcome.ok ? 'Gemini API 응답 확인됨' : '마지막 API 요청 실패';
    detail = apiOutcome.ok ? '마지막 최적화 결과를 Gemini API에서 받았습니다. 다음 요청도 등록한 키를 사용합니다.' : '키는 등록되어 있습니다. 아래 오류 안내에서 인증·모델·할당량 상태를 확인한 뒤 다시 시도하세요.';
  }
  ui.apiState.dataset.state = state;
  ui.apiTitle.textContent = title;
  ui.apiDetail.textContent = detail;
  ui.apiRoute.textContent = ready ? 'Gemini API 사용' : 'API 사용 대기';
  ui.apiKeyState.textContent = !apiState ? '키 확인 안 됨' : apiState.configured ? '✓ 키 등록 · ' + (apiState.persistent ? '브라우저 저장' : '이번 세션') : '○ 키 미등록';
  ui.apiPermissionState.textContent = !apiState ? '권한 확인 안 됨' : apiState.granted ? '✓ 서버 접근 허용' : '○ 서버 접근 미허용';
  ui.apiRefresh.disabled = apiChecking || optimizing;
  ui.badge.textContent = ready ? 'GEMINI API' : 'API 준비 필요';
  const customError = customConfigurationError(settings);
  ui.requestRoute.dataset.state = ready && !customError ? 'ready' : 'blocked';
  ui.requestRoute.textContent = !ready ? 'API 키와 연결 권한을 확인한 뒤 최적화할 수 있습니다.' : customError || ('전송: 나의 요청' + (settings.mode === 'custom' ? (settings.customType === 'manual' ? ' + 수동 최적화 지침' : ' + 선택한 콘셉트') : ' + 선택 설정') + ' → Gemini API');
}

async function refreshApiStatus() {
  const requestRevision = ++apiCheckRevision;
  apiChecking = true;
  paint();
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'API_STATUS' });
    if (!reply?.ok || !reply.status?.gemini) throw new Error('API 등록 상태를 확인하지 못했습니다.');
    if (requestRevision !== apiCheckRevision) return;
    const next = reply.status.gemini;
    if (!next.ready || apiState?.configured !== next.configured || apiState?.persistent !== next.persistent) apiOutcome = null;
    apiState = next;
  } catch {
    if (requestRevision === apiCheckRevision) apiState = null;
  } finally {
    if (requestRevision === apiCheckRevision) { apiChecking = false; paint(); }
  }
}

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
  return JSON.stringify([value.targetModel, selectedTargetProfile(value).id, selectedTargetProfile(value).revision, value.responseLanguage, value.mode, value.promptLanguage, value.geminiModel,
    ...(value.mode === 'custom' ? [value.customType, value.customType === 'manual' ? value.customInstructions : value.customConcepts] : [])]);
}

function paintSettings() {
  ui.engineHint.textContent = '사용 모델: ' + settings.geminiModel + ' · 무료 여부와 사용 한도는 API 프로젝트 등급에 따릅니다.';
  ui.processingNote.textContent = 'Gemini API로 전송 · 자동 유료 전환 없음';
  ui.target.value = settings.targetModel;
  const profile = selectedTargetProfile(settings);
  const models = TARGET_MODELS[settings.targetModel];
  const search = ui.modelSearch.value.trim().toLocaleLowerCase();
  const filtered = models.filter(model => !search || [model.label, model.id, model.provider].some(text => text.toLocaleLowerCase().includes(search)));
  const selectedId = settings.targetVariants[settings.targetModel];
  const shown = [...filtered];
  if (!shown.some(model => model.id === selectedId)) {
    shown.unshift(models.find(model => model.id === selectedId) || { id: selectedId, label: selectedId + ' · 목록 없음 / 공통 지침', lifecycle: 'unknown' });
  }
  const catalogKey = JSON.stringify([settings.targetModel, PROFILE_REVISION, search, selectedId]);
  if (ui.version.dataset.catalog !== catalogKey) {
    ui.version.replaceChildren(...shown.map(model => {
      const option = document.createElement('option');
      const isNew = model.isNew && Date.now() - Date.parse(model.firstSeen) < 14 * 86400000;
      option.value = model.id; option.textContent = (isNew ? 'NEW · ' : '') + model.label + (model.lifecycle === 'retired' ? ' · 지원 종료 / 공통 지침' : '');
      option.dataset.brand = settings.targetModel;
      return option;
    }));
    ui.version.dataset.catalog = catalogKey;
  }
  ui.version.value = selectedId;
  ui.searchCount.textContent = '검색 결과 ' + filtered.length + ' / ' + models.length + '개 · NEW는 최근 14일 내 최초 발견 모델입니다.';
  ui.profileSummary.textContent = profile.label + ' (' + selectedId + ') · ' + profile.summary;
  ui.profileStatus.textContent = (profile.profileStatus === 'validated' ? '고정 샘플 평가 통과' : '기본·상속 프로필 · 성능 개선 미검증') + (profile.candidatePending ? ' · 신규 후보 검증 대기' : '') + ' · v' + profile.profileVersion;
  if (selectedId !== profile.id) ui.profileStatus.textContent += ' · 저장된 모델을 찾지 못해 공통 지침 적용';
  if (!registryBusy) ui.registryStatus.textContent = registryStatus?.error || ('목록 v' + (registryStatus?.version || '번들') + ' · ' + (registryStatus?.origin || 'bundled') + (registryStatus?.checkedAt ? ' · 확인 ' + new Date(registryStatus.checkedAt).toLocaleDateString('ko-KR') : ''));
  ui.profileRules.replaceChildren(...[profile.summary, '원문의 명시적인 조건과 출력 형식을 우선하고, 작업에 필요한 지침만 적용합니다.', '세부 모델마다 차이가 확인되지 않은 경우 해당 계열의 공통 지침을 사용합니다.'].map(rule => {
    const item = document.createElement('li'); item.textContent = rule; return item;
  }));
  ui.profileSources.replaceChildren(...profile.sources.map(id => {
    const source = PROFILE_SOURCES[id]; const link = document.createElement('a');
    link.href = source.url; link.textContent = source.title + ' ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }));
  ui.profileSources.append(document.createTextNode('프로필 갱신: ' + profile.checked + ' · 같은 계열은 공통 지침을 공유합니다.'));
  ui.language.value = settings.responseLanguage;
  ui.theme.value = settings.theme;
  document.documentElement.dataset.theme = settings.theme;
  for (const radio of ui.modes.querySelectorAll('input')) radio.checked = radio.value === settings.mode;
  ui.toolbarEnabled.checked = settings.toolbarEnabled;
  ui.toolbarEnabled.disabled = !initialized;
  ui.toolbarRestore.hidden = !settings.toolbarEnabled || !settings.toolbarMinimized;
  ui.toolbarRestore.disabled = !initialized;
  ui.custom.hidden = settings.mode !== 'custom';
  ui.custom.disabled = !initialized;
  ui.customAuto.hidden = settings.customType !== 'auto';
  ui.customManual.hidden = settings.customType !== 'manual';
  for (const radio of ui.custom.querySelectorAll('input[name="custom-type"]')) radio.checked = radio.value === settings.customType;
  for (const checkbox of ui.concepts.querySelectorAll('input')) checkbox.checked = settings.customConcepts.includes(checkbox.value);
  if (ui.customInstructions.value !== settings.customInstructions) ui.customInstructions.value = settings.customInstructions;
  ui.customCount.textContent = settings.customInstructions.length.toLocaleString('ko-KR') + ' / 6,000';
  ui.customSelection.textContent = settings.customConcepts.length ? '선택: ' + settings.customConcepts.map(id => CUSTOM_CONCEPTS[id].label).join(' · ') : '콘셉트를 하나 이상 선택해 주세요.';
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
  ui.optimize.disabled = !initialized || optimizing || pageBusy || !apiState?.ready || !ui.source.value.trim() || oversized || Boolean(customConfigurationError(settings));
  ui.optimize.dataset.loading = String(optimizing);
  ui.optimizeLabel.textContent = optimizing ? 'Gemini API 최적화 중…' : 'Optimize · Gemini API';
  ui.workspace.setAttribute('aria-busy', String(!initialized || optimizing));
  ui.importPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
  ui.copy.disabled = !hasOutput || copying || optimizing;
  ui.replace.disabled = !hasOutput || !snapshot || pageBusy || optimizing;
  ui.reset.disabled = !initialized || pageBusy || (!ui.source.value && !hasOutput);
  ui.undo.hidden = !snapshot?.canUndo;
  ui.undo.disabled = !snapshot?.canUndo || pageBusy || optimizing;
  ui.reconnectPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
  ui.reloadPage.disabled = !initialized || pageBusy || optimizing || !Number.isInteger(tabId);
  paintApiState();
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
  if (meta.intentMethod === 'llm-rewrite') ui.detail.textContent = 'Gemini API · ' + (meta.mode === 'custom' ? (meta.customType === 'manual' ? '수동 Custom' : '자동 Custom') : '맞춤 재작성');
}

// Request/result drafts stay in private session storage and disappear on browser
// shutdown or extension reload. Reusable Custom instructions are separate preferences.
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
  const beforeFingerprint = settingsFingerprint();
  settings = normalizeSettings({ ...settings, ...partial, targetVariants: { ...settings.targetVariants, ...partial.targetVariants } });
  const compilerChanged = beforeFingerprint !== settingsFingerprint();
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
    pendingSettingWrites += 1;
    await saveSettings(partial);
  } catch {
    feedback('설정을 저장하지 못했습니다. 현재 선택은 이번 팝업에서 계속 사용할 수 있습니다.', 'error');
  } finally {
    pendingSettingWrites -= 1;
  }
}

async function optimize() {
  if (ui.optimize.disabled || optimizing) return;
  const currentRevision = revision;
  const text = ui.source.value;
  const currentSettings = { ...settings };
  const currentApiRevision = apiCheckRevision;
  optimizeStarted = Date.now();
  optimizing = true;
  const progressTimer = setInterval(() => paintApiState(), 1000);
  feedback();
  clearResult('요청을 정리하고 있어요');
  paint();
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'OPTIMIZE', text, settings: currentSettings });
    if (currentApiRevision === apiCheckRevision) apiOutcome = { ok: reply?.ok === true, model: currentSettings.geminiModel };
    if (revision !== currentRevision) return;
    if (!reply?.ok || typeof reply.result?.text !== 'string' || !reply.result.text.trim()) {
      throw new Error(errorMessage(reply?.error, '프롬프트를 만들지 못했습니다. 다시 시도해 주세요.'));
    }
    paintResult(reply.result.text, reply.result.meta || {});
    persistDraft();
    feedback('최적화했습니다. 내용을 확인한 뒤 복사하거나 입력창에 넣어 주세요.');
    ui.output.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  } catch (error) {
    if (currentApiRevision === apiCheckRevision) apiOutcome = { ok: false, model: currentSettings.geminiModel };
    logFailure('optimize', error);
    if (revision === currentRevision) {
      clearResult('다시 시도해 주세요');
      feedback(errorMessage(error, '최적화 중 오류가 발생했습니다.'), 'error', true);
    }
  } finally {
    clearInterval(progressTimer);
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
function openApiSettings() { chrome.runtime.openOptionsPage().catch(() => feedback('API 설정을 열지 못했습니다.', 'error')); }
ui.apiSettings.addEventListener('click', openApiSettings);
ui.apiSetup.addEventListener('click', openApiSettings);
ui.apiRefresh.addEventListener('click', () => refreshApiStatus());
ui.custom.addEventListener('change', event => {
  if (event.target.matches('input[name="custom-type"]')) changeSetting({ customType: event.target.value });
  if (event.target.matches('input[name="custom-concept"]')) {
    changeSetting({ customConcepts: [...ui.concepts.querySelectorAll('input:checked')].map(input => input.value) });
  }
});
ui.customInstructions.addEventListener('input', () => changeSetting({ customInstructions: ui.customInstructions.value }));
ui.target.addEventListener('change', () => { ui.modelSearch.value = ''; changeSetting({ targetModel: ui.target.value }); });
ui.modelSearch.addEventListener('input', paintSettings);
ui.registryRefresh.addEventListener('click', () => refreshRegistry(true));
ui.version.addEventListener('change', () => changeSetting({ targetVariants: { [settings.targetModel]: ui.version.value } }));
ui.language.addEventListener('change', () => changeSetting({ responseLanguage: ui.language.value }));
ui.theme.addEventListener('change', () => changeSetting({ theme: ui.theme.value }));
ui.modes.addEventListener('change', (event) => {
  if (event.target.matches('input[name="mode"]')) changeSetting({ mode: event.target.value });
});
ui.toolbarEnabled.addEventListener('change', () => changeSetting({ toolbarEnabled: ui.toolbarEnabled.checked, toolbarMinimized: false }));
ui.toolbarRestore.addEventListener('click', () => changeSetting({ toolbarMinimized: false }));
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
  registryStatus = await loadCachedRegistry().catch(() => null);
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
    refreshApiStatus(),
  ]);
  initialized = true;
  for (const control of [ui.target, ui.version, ui.modelSearch, ui.language, ui.theme, ui.modes, ui.source, ui.toolbarEnabled]) control.disabled = false;
  paintSettings();
  paint();
  void refreshRegistry();
}

initialize().catch(() => {
  initialized = true;
  for (const control of [ui.target, ui.version, ui.modelSearch, ui.language, ui.theme, ui.modes, ui.source, ui.toolbarEnabled]) control.disabled = false;
  paintSettings();
  showPage();
  paint();
  feedback('일부 기능을 준비하지 못했습니다. 확장 프로그램을 새로고침한 뒤 다시 열어 주세요.', 'error');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[REGISTRY_CACHE_KEY] && !registryBusy) {
    const previous = settingsFingerprint();
    loadCachedRegistry().then(status => {
      registryStatus = status;
      if (previous !== settingsFingerprint()) { revision++; clearResult('모델 지침 갱신 · 다시 최적화'); persistDraft(); }
      paintSettings(); paint();
    }).catch(() => {});
  }
  if ((area === 'local' || area === 'session') && changes['po-api-key:gemini']) {
    apiOutcome = null;
    refreshApiStatus();
  }
  if (area !== 'local' || !changes.settings) return;
  if (pendingSettingWrites) return;
  const previous = settingsFingerprint();
  settings = normalizeSettings(changes.settings.newValue);
  if (previous !== settingsFingerprint()) {
    revision += 1;
    clearResult(ui.source.value ? '설정 변경 · 다시 최적화' : '결과 미리보기');
    persistDraft();
  }
  paintSettings();
  paint();
});
chrome.permissions.onAdded?.addListener(() => refreshApiStatus());
chrome.permissions.onRemoved?.addListener(() => refreshApiStatus());
