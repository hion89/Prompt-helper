import { EVALUATION_CASES } from './cases.js';
import { scoreEvaluationCase, summarizeEvaluation } from './metrics.js';
import { getSettings } from '../shared/settings.js';

const $ = id => document.getElementById(id);
const ui = { start: $('start'), stop: $('stop'), download: $('download'), status: $('status'), progress: $('progress'), results: $('results'), details: $('details'), summary: $('summary'), summaryCard: $('summary-card') };
let running = false;
let stopRequested = false;
let report = null;
let settings = null;

function setStatus(message, error = false) {
  ui.status.textContent = message;
  ui.status.dataset.error = String(error);
}

function fmt(value, suffix = '') { return Number.isFinite(value) ? value.toLocaleString('ko-KR') + suffix : '—'; }

function appendResult(row) {
  const tr = document.createElement('tr');
  tr.dataset.state = row.completed ? 'ok' : 'error';
  const values = [row.name, row.completed ? '완료' : '실패', row.qualityScore + '점', row.preservationRate + '%', row.intentCorrect ? '일치' : '불일치', row.languageCorrect ? '일치' : '불일치', fmt(row.latencyMs, 'ms'), fmt(row.usage.totalTokens)];
  for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
  ui.results.append(tr);

  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = row.name + ' · ' + row.qualityScore + '점';
  const body = document.createElement('div');
  const meta = document.createElement('p'); meta.className = 'case-meta';
  meta.textContent = `보존 ${row.preservedDetails.length}/${row.preservedDetails.length + row.missingDetails.length} · 출력 ${row.outputCharacters.toLocaleString()}자 · 길이 배율 ${row.expansionRatio ?? '—'}×`;
  body.append(meta);
  if (row.missingDetails.length) { const missing = document.createElement('p'); missing.className = 'missing'; missing.textContent = '누락된 핵심 정보: ' + row.missingDetails.join(', '); body.append(missing); }
  if (row.error) { const error = document.createElement('p'); error.className = 'missing'; error.textContent = row.error; body.append(error); }
  if (row.output) { const pre = document.createElement('pre'); pre.textContent = row.output; body.append(pre); }
  details.append(summary, body); ui.details.append(details);
}

function metric(label, value) {
  const box = document.createElement('div'); box.className = 'metric';
  const name = document.createElement('span'); name.textContent = label;
  const number = document.createElement('b'); number.textContent = value;
  box.append(name, number); return box;
}

function renderSummary(summary) {
  ui.summary.replaceChildren(
    metric('자동 품질 점수', fmt(summary.qualityScore, '점')),
    metric('완료율', fmt(summary.completionRate, '%')),
    metric('핵심 정보 보존', fmt(summary.preservationRate, '%')),
    metric('의도 분류 정확도', fmt(summary.intentAccuracy, '%')),
    metric('언어 정확도', fmt(summary.languageAccuracy, '%')),
    metric('응답시간 중앙값', fmt(summary.latencyMs.median, 'ms')),
    metric('응답시간 P95', fmt(summary.latencyMs.p95, 'ms')),
    metric('총 API 토큰', fmt(summary.tokens.total)),
  );
  ui.summaryCard.hidden = false;
}

async function checkReady() {
  try {
    settings = await getSettings();
    const reply = await chrome.runtime.sendMessage({ type: 'API_STATUS', provider: 'gemini' });
    if (!reply?.ok || !reply.status?.gemini?.configured) {
      setStatus('Gemini API 키를 먼저 등록해 주세요. 평가는 아직 API를 호출하지 않았습니다.', true);
      ui.start.disabled = true;
      return false;
    }
    setStatus(`준비됨 · ${settings.geminiModel} · 시작하면 Gemini 생성 요청 ${EVALUATION_CASES.length}회를 보냅니다.`);
    ui.start.disabled = false;
    return true;
  } catch (error) {
    setStatus(error?.message || 'API 상태를 확인하지 못했습니다.', true);
    ui.start.disabled = true;
    return false;
  }
}

async function runEvaluation() {
  if (running || !await checkReady()) return;
  running = true; stopRequested = false; report = null;
  ui.start.disabled = true; ui.stop.disabled = false; ui.download.disabled = true;
  ui.results.replaceChildren(); ui.details.replaceChildren(); ui.summaryCard.hidden = true; ui.progress.style.width = '0%';
  const rows = [];
  for (let index = 0; index < EVALUATION_CASES.length; index++) {
    if (stopRequested) break;
    const testCase = EVALUATION_CASES[index];
    setStatus(`${index + 1}/${EVALUATION_CASES.length} · ${testCase.name} 측정 중…`);
    const started = performance.now();
    let reply; let error = '';
    try {
      reply = await chrome.runtime.sendMessage({ type: 'OPTIMIZE', text: testCase.source, settings: { ...testCase.settings, targetVariants: settings.targetVariants, geminiModel: settings.geminiModel, geminiModelSelected: settings.geminiModelSelected } });
      if (!reply?.ok) throw new Error(reply?.error || '최적화 요청에 실패했습니다.');
    } catch (failure) { error = failure?.message || String(failure); }
    const row = scoreEvaluationCase(testCase, reply?.result, Math.round(performance.now() - started), error);
    rows.push(row); appendResult(row); ui.progress.style.width = `${(index + 1) / EVALUATION_CASES.length * 100}%`;
  }
  const summary = summarizeEvaluation(rows);
  report = {
    schema: 'prompt-optimizer-benchmark', schemaVersion: 1,
    extensionVersion: chrome.runtime.getManifest().version,
    targetVariants: settings.targetVariants,
    model: settings.geminiModel, createdAt: new Date().toISOString(), stoppedEarly: rows.length < EVALUATION_CASES.length,
    scoreFormula: { preservation: 0.45, intent: 0.20, promptLanguage: 0.20, cleanStart: 0.15 },
    summary, cases: rows,
  };
  renderSummary(summary);
  setStatus(report.stoppedEarly ? `${rows.length}개 항목 측정 후 중지했습니다.` : `평가 완료 · ${rows.length}개 항목을 측정했습니다.`, rows.some(row => !row.completed));
  running = false; ui.stop.disabled = true; ui.download.disabled = false; ui.start.disabled = false;
}

function downloadReport() {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `prompt-optimizer-benchmark-${report.extensionVersion}-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

ui.start.addEventListener('click', runEvaluation);
ui.stop.addEventListener('click', () => { stopRequested = true; ui.stop.disabled = true; setStatus('현재 측정이 끝나면 중지합니다.'); });
ui.download.addEventListener('click', downloadReport);
checkReady();
