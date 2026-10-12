import { detectLanguage } from '../core/intent-parser.js';

const PREAMBLE = /^(?:네[,.!\s]|물론|다음은|아래는|요청하신|sure[,.!\s]|certainly|here(?:'s| is)|the optimized prompt|以下|もちろん|当然|下面是)/iu;

const finite = value => Number.isFinite(value) ? value : null;
const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const percentile = (values, ratio) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
};

export function scoreEvaluationCase(testCase, result, latencyMs, error = '') {
  const output = typeof result?.text === 'string' ? result.text.trim() : '';
  const details = testCase.criticalDetails || [];
  const folded = output.toLocaleLowerCase('en-US');
  const kept = details.filter(detail => folded.includes(String(detail).toLocaleLowerCase('en-US')));
  const completed = Boolean(output) && !error;
  const preservation = details.length ? kept.length / details.length : 1;
  const intentCorrect = completed && result?.meta?.task === testCase.expectedTask;
  const detectedLanguage = completed ? detectLanguage(output) : null;
  const languageCorrect = completed && detectedLanguage === testCase.expectedPromptLanguage;
  const cleanStart = completed && !PREAMBLE.test(output) && !/^```/u.test(output);
  const qualityScore = completed
    ? Math.round(100 * (preservation * 0.45 + Number(intentCorrect) * 0.20 + Number(languageCorrect) * 0.20 + Number(cleanStart) * 0.15))
    : 0;
  const usage = result?.meta?.usage || {};
  return {
    id: testCase.id, name: testCase.name, completed, error: String(error || '').slice(0, 500), latencyMs: finite(latencyMs),
    expectedTask: testCase.expectedTask, actualTask: result?.meta?.task || null, intentCorrect,
    expectedPromptLanguage: testCase.expectedPromptLanguage, detectedLanguage, languageCorrect,
    preservedDetails: kept, missingDetails: details.filter(detail => !kept.includes(detail)),
    preservationRate: round(preservation * 100), cleanStart, qualityScore,
    inputCharacters: testCase.source.length, outputCharacters: output.length,
    expansionRatio: output ? round(output.length / testCase.source.length, 2) : null,
    usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), totalTokens: finite(usage.totalTokens) },
    output,
  };
}

export function summarizeEvaluation(rows) {
  const total = rows.length;
  const completed = rows.filter(row => row.completed);
  const latencies = completed.map(row => row.latencyMs).filter(Number.isFinite);
  const tokens = completed.map(row => row.usage.totalTokens).filter(Number.isFinite);
  const detailTotal = rows.reduce((sum, row) => sum + row.preservedDetails.length + row.missingDetails.length, 0);
  const detailKept = rows.reduce((sum, row) => sum + row.preservedDetails.length, 0);
  const rate = count => total ? round(count / total * 100) : 0;
  return {
    totalCases: total,
    completedCases: completed.length,
    completionRate: rate(completed.length),
    qualityScore: total ? round(rows.reduce((sum, row) => sum + row.qualityScore, 0) / total) : 0,
    preservationRate: detailTotal ? round(detailKept / detailTotal * 100) : 0,
    intentAccuracy: rate(rows.filter(row => row.intentCorrect).length),
    languageAccuracy: rate(rows.filter(row => row.languageCorrect).length),
    cleanStartRate: rate(rows.filter(row => row.cleanStart).length),
    latencyMs: {
      average: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95),
    },
    tokens: {
      total: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null,
      average: tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : null,
    },
    medianExpansionRatio: percentile(completed.map(row => row.expansionRatio).filter(Number.isFinite), 0.5),
  };
}
