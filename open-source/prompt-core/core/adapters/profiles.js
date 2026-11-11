/**
 * Editable presentation presets, not claims about a model's inherent preferences.
 * Tune these after evaluating your own tasks; no vendor API or remote config runs.
 *
 * instructionStructure: markdown | labels
 * contextPlacement: before-guidance | after-guidance
 * constraintExpression/outputExpression: bullets | prose
 * analysisRequest: evidence-summary | none (never hidden chain-of-thought)
 * longContext: closing-recap | none
 * searchHandling: sources-when-needed | none
 */
export const MODEL_PROFILES = Object.freeze({
  chatgpt: Object.freeze({
    name: 'ChatGPT', instructionStructure: 'markdown', contextPlacement: 'before-guidance',
    constraintExpression: 'bullets', outputExpression: 'prose',
    analysisRequest: 'evidence-summary', longContext: 'closing-recap', searchHandling: 'sources-when-needed',
  }),
  claude: Object.freeze({
    name: 'Claude', instructionStructure: 'markdown', contextPlacement: 'after-guidance',
    constraintExpression: 'prose', outputExpression: 'prose',
    analysisRequest: 'evidence-summary', longContext: 'closing-recap', searchHandling: 'sources-when-needed',
  }),
  gemini: Object.freeze({
    name: 'Gemini', instructionStructure: 'labels', contextPlacement: 'before-guidance',
    constraintExpression: 'bullets', outputExpression: 'bullets',
    analysisRequest: 'evidence-summary', longContext: 'closing-recap', searchHandling: 'sources-when-needed',
  }),
  perplexity: Object.freeze({
    name: 'Perplexity', instructionStructure: 'labels', contextPlacement: 'before-guidance',
    constraintExpression: 'prose', outputExpression: 'prose',
    analysisRequest: 'evidence-summary', longContext: 'closing-recap', searchHandling: 'sources-when-needed',
  }),
});
