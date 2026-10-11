import { MODEL_PROFILES } from './profiles.js';
import { adaptWithProfile } from './base.js';
export function adaptClaude(ir, overrides = {}) {
  return adaptWithProfile(ir, { ...MODEL_PROFILES.claude, ...overrides });
}
export default adaptClaude;
