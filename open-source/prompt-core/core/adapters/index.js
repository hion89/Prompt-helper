import { adaptChatGPT } from './chatgpt.js';
import { adaptClaude } from './claude.js';
import { adaptGemini } from './gemini.js';
import { adaptPerplexity } from './perplexity.js';
const adapters = Object.freeze({ chatgpt: adaptChatGPT, claude: adaptClaude, gemini: adaptGemini, perplexity: adaptPerplexity });
export function adaptModel(ir, profileOverrides = {}) {
  return (adapters[ir.targetModel] || adapters.chatgpt)(ir, profileOverrides);
}
