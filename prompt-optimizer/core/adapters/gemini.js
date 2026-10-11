import { MODEL_PROFILES } from './profiles.js';
import { adaptWithProfile } from './base.js';
export function adaptGemini(ir, overrides = {}) {
  return adaptWithProfile(ir, { ...MODEL_PROFILES.gemini, ...overrides });
}
export default adaptGemini;
