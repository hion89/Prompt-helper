export function applyDefaultMode(ir) {
  const requirements = [];
  if (ir.intent.task === 'debugging') requirements.push('default.debug');
  if (ir.intent.complexity === 'complex') requirements.push('default.organize');
  return {
    ...ir,
    requirements,
    constraints: ir.intent.complexity === 'complex' ? ['preserve'] : [],
    outputPreferences: { verbosity: 'balanced', format: 'adaptive', instructions: [] },
  };
}
