import { getSettings } from '../shared/settings.js';
import { readDiagnostics, clearDiagnostics, sanitizeDiagnosticMessage } from '../shared/diagnostics.js';

const $ = id => document.getElementById(id);
const manifest = chrome.runtime.getManifest();
let events = [];
let settings = {};

function feedback(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').dataset.error = String(error);
}

function safeSettings(value = {}) {
  return {
    targetModel: value.targetModel,
    responseLanguage: value.responseLanguage,
    mode: value.mode,
    theme: value.theme,
    geminiModel: value.geminiModel,
    geminiModelSelected: value.geminiModelSelected === true,
    toolbarEnabled: value.toolbarEnabled !== false,
  };
}

function addError(container, event) {
  const item = document.createElement('article');
  item.className = 'error-item';
  const meta = document.createElement('div');
  meta.className = 'error-meta';
  for (const value of [new Date(event.time).toLocaleString(), event.site, event.action, 'v' + event.version]) {
    const span = document.createElement('span');
    span.textContent = value;
    meta.append(span);
  }
  const message = document.createElement('div');
  message.className = 'error-message';
  message.textContent = sanitizeDiagnosticMessage(event.message);
  item.append(meta, message);
  container.append(item);
}

function renderLocalErrors() {
  const list = $('error-list');
  list.replaceChildren();
  $('empty-errors').hidden = events.length > 0;
  $('error-count').textContent = events.length + '개';
  for (const event of [...events].reverse()) addError(list, event);
}

function makeReport() {
  return {
    schema: 'prompt-optimizer-diagnostic',
    schemaVersion: 1,
    reportId: crypto.randomUUID?.() || Date.now().toString(36),
    exportedAt: new Date().toISOString(),
    extension: { name: manifest.name, version: manifest.version },
    environment: {
      language: navigator.language,
      platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
      userAgent: navigator.userAgent.slice(0, 300),
    },
    settings: safeSettings(settings),
    userDescription: $('description').value.trim().slice(0, 1500),
    reproductionSteps: $('steps').value.trim().slice(0, 1500),
    recentErrors: events,
    excluded: ['apiKey', 'promptSource', 'optimizedResult', 'pageUrl'],
  };
}

async function copyReport() {
  const text = JSON.stringify(makeReport(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    feedback('진단 보고서를 복사했습니다. dominicjjung@gmail.com으로 붙여넣어 보내세요.');
  } catch {
    feedback('자동 복사에 실패했습니다. JSON 파일로 저장해 보내 주세요.', true);
  }
}

function downloadReport() {
  const blob = new Blob([JSON.stringify(makeReport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prompt-optimizer-report-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  feedback('진단 보고서 파일을 저장했습니다. 이 파일을 dominicjjung@gmail.com으로 보내세요.');
}

function validImportedReport(report) {
  return report && report.schema === 'prompt-optimizer-diagnostic' && report.schemaVersion === 1
    && report.extension && typeof report.extension.version === 'string'
    && Array.isArray(report.recentErrors) && report.recentErrors.length <= 30;
}

function renderImported(report) {
  $('imported-report').hidden = false;
  $('imported-summary').textContent = [
    '보고서 ID: ' + String(report.reportId || '없음').slice(0, 100),
    '생성 시각: ' + new Date(report.exportedAt).toLocaleString(),
    '확장 버전: ' + report.extension.version,
    '환경: ' + String(report.environment?.platform || 'unknown') + ' · ' + String(report.environment?.language || 'unknown'),
    '설정: ' + JSON.stringify(report.settings || {}),
  ].join('\n');
  $('imported-description').textContent = String(report.userDescription || '작성되지 않음').slice(0, 1500);
  $('imported-steps').textContent = String(report.reproductionSteps || '작성되지 않음').slice(0, 1500);
  const list = $('imported-errors');
  list.replaceChildren();
  if (!report.recentErrors.length) list.textContent = '기록된 오류가 없습니다.';
  for (const event of report.recentErrors) addError(list, event);
}

$('copy-report').addEventListener('click', copyReport);
$('download-report').addEventListener('click', downloadReport);
$('clear-errors').addEventListener('click', async () => {
  try {
    await clearDiagnostics();
    events = [];
    renderLocalErrors();
    feedback('이 브라우저에 저장된 오류 기록을 지웠습니다.');
  } catch { feedback('오류 기록을 지우지 못했습니다.', true); }
});
$('report-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) return feedback('보고서 파일이 너무 큽니다.', true);
  try {
    const report = JSON.parse(await file.text());
    if (!validImportedReport(report)) throw new Error('지원하지 않는 보고서 형식입니다.');
    renderImported(report);
    feedback('받은 보고서를 열었습니다.');
  } catch (error) { feedback(error.message || '보고서를 열지 못했습니다.', true); }
  finally { event.target.value = ''; }
});

async function initialize() {
  $('version').textContent = '버전 ' + manifest.version;
  [events, settings] = await Promise.all([readDiagnostics(), getSettings()]);
  renderLocalErrors();
}

initialize().catch(() => feedback('진단 정보를 불러오지 못했습니다. 확장 프로그램을 다시 로드해 주세요.', true));
