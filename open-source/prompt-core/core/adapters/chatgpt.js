import { MODEL_PROFILES } from './profiles.js';
import { adaptWithProfile } from './base.js';
export function adaptChatGPT(ir, overrides = {}) {
  return adaptWithProfile(ir, { ...MODEL_PROFILES.chatgpt, ...overrides });
}
export default adaptChatGPT;
