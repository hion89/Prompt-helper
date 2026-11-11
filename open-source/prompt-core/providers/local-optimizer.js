import { compilePrompt } from '../core/prompt-builder.js';

/** No API keys, network calls, or remote execution. Provider contract is async. */
export class LocalPromptOptimizer {
  constructor(options = {}) {
    this.id = 'local';
    this.profileOverrides = options.profileOverrides || {};
  }

  async optimize(text, settings = {}) {
    const result = compilePrompt(text, settings, this.profileOverrides[settings?.targetModel] || {});
    return {
      ...result,
      meta: {
        ...result.meta,
        outputCharacters: result.text.length,
        provider: this.id,
        // Heuristic classification is not a promise of model-level understanding.
        intentMethod: 'local-keyword-heuristics',
      },
    };
  }
}

export default LocalPromptOptimizer;
