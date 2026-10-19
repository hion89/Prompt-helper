import { parseIntent } from './intent-parser.js';

export const MAX_INPUT_CHARACTERS = 50000;
const MODELS = ['chatgpt', 'claude', 'gemini', 'other', 'perplexity'];
const MODES = ['default', 'eco', 'precision', 'natural', 'custom'];
const LANGUAGES = ['auto', 'ko', 'en', 'ja', 'zh'];

export function createPromptIR(sourceText, settings = {}, parsed) {
  if (typeof sourceText !== 'string' || !sourceText.trim()) {
    throw new Error('최적화할 내용을 입력해 주세요. / Enter a prompt to optimize.');
  }
  if (sourceText.length > MAX_INPUT_CHARACTERS) {
    throw new Error('입력은 50,000자까지 지원합니다. / Prompts must be 50,000 characters or fewer.');
  }
  parsed ||= parseIntent(sourceText);
  settings ||= {};
  const selectedLanguage = LANGUAGES.includes(settings.responseLanguage) ? settings.responseLanguage : 'auto';
  const promptLanguage = LANGUAGES.includes(settings.promptLanguage) ? settings.promptLanguage : 'auto';
  return {
    version: 1,
    targetModel: MODELS.includes(settings.targetModel) ? settings.targetModel : 'chatgpt',
    responseLanguage: selectedLanguage === 'auto' ? parsed.detectedLanguage : selectedLanguage,
    promptLanguage: promptLanguage === 'auto' ? parsed.detectedLanguage : promptLanguage,
    mode: MODES.includes(settings.mode) ? settings.mode : 'default',
    // Source is authoritative; never summarize, translate, or deduplicate it.
    sourceText,
    intent: parsed,
    context: [],
    requirements: [],
    constraints: [],
    analysis: [],
    successCriteria: [],
    outputPreferences: { verbosity: 'balanced', format: 'adaptive', instructions: [] },
  };
}
