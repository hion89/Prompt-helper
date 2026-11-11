import { LocalPromptOptimizer } from './local-optimizer.js';

// Future providers implement async optimize(text, settings) => { text, ir, meta }.
// Registration is explicit code; settings cannot activate arbitrary remote code.
const providers = new Map([['local', new LocalPromptOptimizer()]]);

export function registerOptimizerProvider(id, provider) {
  if (typeof id !== 'string' || !id.trim() || !provider || typeof provider.optimize !== 'function') {
    throw new TypeError('An optimizer provider needs a non-empty id and optimize(text, settings).');
  }
  providers.set(id, provider);
}

export function getOptimizerProvider(id = 'local') {
  const provider = providers.get(id);
  if (!provider) throw new Error('Unknown optimizer provider: ' + id);
  return provider;
}

export async function optimizePrompt(text, settings = {}, providerId = 'local') {
  return getOptimizerProvider(providerId).optimize(text, settings);
}

export const optimizerProvider = getOptimizerProvider();
export default optimizerProvider;
