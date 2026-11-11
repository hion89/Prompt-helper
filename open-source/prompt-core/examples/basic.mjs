import { LocalPromptOptimizer } from '../providers/local-optimizer.js';

const result = await new LocalPromptOptimizer().optimize(
  'Explain why this Python function fails. Keep the existing API and show a minimal fix.',
  { mode: 'precision', targetModel: 'chatgpt', responseLanguage: 'en' },
);
console.log(result.text);
console.log(JSON.stringify(result.meta, null, 2));
