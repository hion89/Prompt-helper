import { applyDefaultMode } from './default.js';
import { applyEcoMode } from './eco.js';
import { applyPrecisionMode } from './precision.js';
import { applyNaturalMode } from './natural.js';

const processors = Object.freeze({ default: applyDefaultMode, eco: applyEcoMode, precision: applyPrecisionMode, natural: applyNaturalMode });
export function processMode(ir) {
  return (processors[ir.mode] || processors.default)(ir);
}
