import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPromptOptimizer } from '../providers/local-optimizer.js';
import { getOptimizerProvider, registerOptimizerProvider, optimizePrompt } from '../providers/optimizer-provider.js';
import { detectLanguage, parseIntent, TASK_CATEGORIES } from '../core/intent-parser.js';
import { MESSAGES } from '../core/languages/messages.js';

const optimizer = new LocalPromptOptimizer();
const example = '이 코드 왜 안되는지 분석해줘';
const categories = {
  general_question: 'Which option would you pick?',
  coding: 'Review this Python code.',
  debugging: example,
  code_generation: 'Write a Python function to validate email addresses.',
  summarization: 'Summarize the following article.',
  translation: 'Translate this paragraph into English.',
  writing: 'Write a short email to Minji.',
  rewriting: 'Rewrite this paragraph to improve the tone.',
  research: 'Research recent battery developments and cite sources.',
  comparison: 'Compare these two laptops.',
  brainstorming: 'Brainstorm names for a coffee shop.',
  planning: 'Plan a three-day trip to Busan.',
  data_analysis: 'Analyze this dataset and explain its missing values.',
  study_explanation: 'Explain how gravity works.',
};

test('scenario A: precision identifies debugging and asks for evidence, checks, and fixes', async () => {
  const result = await optimizer.optimize(example, { targetModel: 'chatgpt', responseLanguage: 'ko', mode: 'precision' });
  assert.equal(result.meta.task, 'debugging');
  assert.ok(result.text.includes(example));
  for (const expected of ['원인', '확인 방법', '수정 방법', '필수 근거', '추측', '우선순위', '성공 조건', '한국어']) {
    assert.ok(result.text.includes(expected), expected);
  }
  assert.equal(result.meta.provider, 'local');
  assert.equal(result.meta.inputCharacters, example.length);
  assert.equal(result.meta.outputCharacters, result.text.length);
});

test('scenario B: ECO is substantially shorter than precision while preserving source', async () => {
  const precision = await optimizer.optimize(example, { mode: 'precision' });
  const eco = await optimizer.optimize(example, { mode: 'eco' });
  assert.ok(eco.text.length < precision.text.length / 3);
  assert.ok(eco.text.includes(example));
  assert.ok(eco.text.includes('간결'));
});

test('scenario C: response and scaffold languages are independent', async () => {
  const englishAnswer = await optimizer.optimize(example, { responseLanguage: 'en' });
  assert.equal(englishAnswer.ir.promptLanguage, 'ko');
  assert.equal(englishAnswer.ir.responseLanguage, 'en');
  assert.match(englishAnswer.text, /English/);
  const englishScaffold = await optimizer.optimize(example, { promptLanguage: 'en', responseLanguage: 'ko', mode: 'precision' });
  assert.match(englishScaffold.text, /Respond in Korean\./);
  assert.match(englishScaffold.text, /## Objective/);
  assert.ok(englishScaffold.text.includes(example));
});

test('scenario D: natural mode preserves meaning and asks for natural style without detector claims', async () => {
  const result = await optimizer.optimize('김민수에게 내일 14:30에 만난다고 이메일을 써줘.', { mode: 'natural' });
  for (const expected of ['김민수', '14:30', '자연스러운 문체', '전문 용어', '문장 길이', '연결 표현']) assert.ok(result.text.includes(expected));
  assert.doesNotMatch(result.text, /100%|탐지|detector|bypass/iu);
});

test('all 14 task categories have a working heuristic', () => {
  assert.deepEqual(Object.keys(categories), TASK_CATEGORIES);
  for (const [task, source] of Object.entries(categories)) assert.equal(parseIntent(source).task, task, source);
  assert.equal(parseIntent('강화학습시킨 로봇이 앞으로 안 가고 제자리에서 버티는데 왜 그런지 분석해줘').task, 'debugging');
});

test('Korean, English, Japanese, Chinese are detected and used by Auto', async () => {
  const samples = {
    ko: '이 코드 왜 안되는지 분석해줘',
    en: 'Explain this problem in simple terms.',
    ja: 'このコードが動かない原因を説明してください。',
    zh: '请解释这段代码为什么无法运行。',
  };
  for (const [language, source] of Object.entries(samples)) {
    assert.equal(detectLanguage(source), language);
    assert.equal((await optimizer.optimize(source, { responseLanguage: 'auto' })).ir.responseLanguage, language);
  }
});

test('code, exact numbers, names, whitespace, and repeated data survive every adapter and mode', async () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = '  Project A-017: keep 0.003 and -42; owner: 김민수.\r\n' +
    fence + 'js\r\nconst items = [1, 1, 2];\r\nitems.push(3);\r\nitems.push(3);\r\n' + fence +
    '\r\nDo not change the API.\r\nDo not change the API.\n  ';
  for (const targetModel of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
    for (const mode of ['default', 'eco', 'precision', 'natural']) {
      const result = await optimizer.optimize(source, { targetModel, mode });
      assert.ok(result.text.includes(source), targetModel + '/' + mode);
      assert.equal(result.ir.sourceText, source);
      assert.equal(result.meta.sourcePreserved, true);
      assert.equal(result.text.split(source).length, 2, 'source appears once');
      assert.doesNotMatch(result.text, /undefined|\[object Object\]/u);
    }
  }
});

test('simple default questions stay short, without unconditional role prompting', async () => {
  const result = await optimizer.optimize('What is 2 + 2?', { mode: 'default' });
  assert.ok(result.text.length < 100);
  assert.doesNotMatch(result.text, /expert|role|success criteria/iu);
});

test('50,000-character input is preserved and one character over is rejected', async () => {
  const source = 'x'.repeat(50000);
  const result = await optimizer.optimize(source, { mode: 'eco' });
  assert.ok(result.text.includes(source));
  await assert.rejects(() => optimizer.optimize(source + 'x'), /50,000/);
  await assert.rejects(() => optimizer.optimize(' \n\t '), /Enter a prompt/);
  await assert.rejects(() => optimizer.optimize(null), /Enter a prompt/);
});

test('invalid settings fall back to supported defaults', async () => {
  const result = await optimizer.optimize('Hello', { mode: 'bad', targetModel: 'bad', responseLanguage: 'bad', promptLanguage: 'bad' });
  assert.equal(result.ir.mode, 'default');
  assert.equal(result.ir.targetModel, 'chatgpt');
  assert.equal(result.ir.responseLanguage, 'en');
  assert.equal(result.ir.promptLanguage, 'en');
  assert.equal((await optimizer.optimize('Hello', null)).ir.targetModel, 'chatgpt');
});

test('research handling asks for actual consulted sources and admits unavailable verification', async () => {
  const result = await optimizer.optimize('Research the latest battery technology.', { targetModel: 'perplexity', responseLanguage: 'en', mode: 'precision' });
  assert.match(result.text, /sources actually consulted/u);
  assert.match(result.text, /verification is unavailable/u);
  assert.doesNotMatch(result.text, /https?:\/\//u);
});

test('translation target language does not conflict with selected explanation language', async () => {
  const result = await optimizer.optimize('다음 문장을 영어로 번역해줘: 안녕하세요.', { responseLanguage: 'ko' });
  assert.equal(result.ir.intent.task, 'translation');
  assert.match(result.text, /번역문은 원문에서 요청한 대상 언어/u);
});

test('model profiles are independently configurable without dropping original text', async () => {
  const custom = new LocalPromptOptimizer({
    profileOverrides: { chatgpt: { instructionStructure: 'labels', contextPlacement: 'after-guidance', analysisRequest: 'none', searchHandling: 'none' } },
  });
  const result = await custom.optimize(example, { mode: 'precision', targetModel: 'chatgpt' });
  assert.doesNotMatch(result.text, /## /u);
  assert.ok(result.text.indexOf('제약 조건') < result.text.indexOf(example));
  assert.doesNotMatch(result.text, /장황한 내부 사고/u);
  assert.ok(result.text.includes(example));
});

test('long context gets a concise closing check and remains intact', async () => {
  const source = 'Keep every original requirement. ' + 'context '.repeat(1100);
  const result = await optimizer.optimize(source, { mode: 'default', responseLanguage: 'en' });
  assert.ok(result.text.includes(source));
  assert.match(result.text, /check the full original request/u);
});

test('every instruction is translated in every supported scaffold language', () => {
  for (const locale of ['ko', 'ja', 'zh']) {
    for (const key of Object.keys(MESSAGES.en)) assert.equal(typeof MESSAGES[locale][key], 'string', locale + '/' + key);
  }
});

test('all locales and modes render without undefined instructions', async () => {
  for (const mode of ['default', 'eco', 'precision', 'natural']) {
    for (const promptLanguage of ['ko', 'en', 'ja', 'zh']) {
      for (const source of Object.values(categories)) {
        const result = await optimizer.optimize(source, { mode, promptLanguage });
        assert.ok(result.text.includes(source));
        assert.doesNotMatch(result.text, /undefined|\[object Object\]/u);
      }
    }
  }
});

test('provider abstraction defaults to local and accepts future async providers explicitly', async () => {
  assert.ok(getOptimizerProvider() instanceof LocalPromptOptimizer);
  assert.equal((await optimizePrompt('Hello')).meta.provider, 'local');
  registerOptimizerProvider('fixture', { async optimize(text) { return { text, ir: {}, meta: { provider: 'fixture' } }; } });
  assert.equal((await optimizePrompt('Hello', {}, 'fixture')).meta.provider, 'fixture');
  assert.throws(() => getOptimizerProvider('missing'), /Unknown optimizer provider/u);
  assert.throws(() => registerOptimizerProvider('broken', {}), /optimize/u);
});

test('limit-sized repeated Korean text and blank lines remain safe to classify', async () => {
  for (const source of ['않'.repeat(50000), '\n'.repeat(49999) + 'x']) {
    const result = await optimizer.optimize(source, { mode: 'eco' });
    assert.ok(result.text.includes(source));
    assert.equal(result.ir.sourceText.length, 50000);
  }
});