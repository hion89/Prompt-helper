export function applyNaturalMode(ir) {
  return {
    ...ir,
    constraints: ['natural.preserve'],
    outputPreferences: {
      verbosity: 'balanced',
      format: 'adaptive',
      instructions: ['natural.voice', 'natural.rhythm', 'natural.clean'],
    },
  };
}
