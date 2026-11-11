export function applyEcoMode(ir) {
  return {
    ...ir,
    // Deduplicate generated guidance only. Repeated source may be code, data,
    // emphasis, or a deliberate requirement and must remain untouched.
    requirements: [],
    constraints: [],
    analysis: [],
    outputPreferences: { verbosity: 'concise', format: 'adaptive', instructions: ['eco.concise'] },
  };
}
