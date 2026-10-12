import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreEvaluationCase, summarizeEvaluation } from '../evaluation/metrics.js';

const fixture = { id: 'x', name: 'fixture', source: 'A-017 오류를 분석해줘', expectedTask: 'debugging', expectedPromptLanguage: 'ko', criticalDetails: ['A-017', '429'] };

test('evaluation score measures completion, preservation, intent, language and clean output', () => {
  const row = scoreEvaluationCase(fixture, { text: 'A-017 및 429 오류의 원인을 확인하고 수정 절차를 제시하세요.', meta: { task: 'debugging', usage: { totalTokens: 120 } } }, 800);
  assert.equal(row.qualityScore, 100);
  assert.equal(row.preservationRate, 100);
  assert.equal(row.languageCorrect, true);
  assert.equal(row.usage.totalTokens, 120);
});

test('evaluation summary includes failed cases in rates and quality score', () => {
  const good = scoreEvaluationCase(fixture, { text: 'A-017 및 429 오류의 원인을 분석하세요.', meta: { task: 'debugging', usage: { totalTokens: 100 } } }, 500);
  const failed = scoreEvaluationCase({ ...fixture, id: 'y' }, null, 1000, 'quota');
  const summary = summarizeEvaluation([good, failed]);
  assert.equal(summary.completionRate, 50);
  assert.equal(summary.preservationRate, 50);
  assert.equal(summary.qualityScore, 50);
  assert.equal(summary.latencyMs.median, 500);
  assert.equal(summary.tokens.total, 100);
});
