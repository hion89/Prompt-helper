import { MODEL_PROFILES } from './profiles.js';
import { adaptWithProfile } from './base.js';
export function adaptPerplexity(ir, overrides = {}) {
  return adaptWithProfile(ir, { ...MODEL_PROFILES.perplexity, ...overrides });
}
export default adaptPerplexity;
