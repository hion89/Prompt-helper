const TASK_STEPS = Object.freeze({
  debugging: ['debug.locate', 'debug.cause', 'debug.verify', 'debug.fix'],
  coding: ['code.inspect', 'code.impact', 'code.verify'],
  code_generation: ['generate.spec', 'generate.implement', 'generate.verify'],
  summarization: ['summary.main', 'summary.faithful'],
  translation: ['translate.meaning', 'translate.terms'],
  writing: ['writing.purpose', 'writing.draft'],
  rewriting: ['rewrite.preserve', 'rewrite.improve'],
  research: ['research.scope', 'research.evidence', 'research.uncertainty'],
  comparison: ['compare.criteria', 'compare.evidence'],
  brainstorming: ['ideas.scope', 'ideas.options'],
  planning: ['plan.scope', 'plan.steps'],
  data_analysis: ['data.inspect', 'data.method', 'data.findings'],
  study_explanation: ['explain.concept', 'explain.example'],
  general_question: ['question.answer', 'question.support'],
});

export function applyPrecisionMode(ir) {
  return {
    ...ir,
    context: ['precision.context'],
    requirements: ['precision.priority'],
    constraints: ['preserve', 'precision.noInvent', 'precision.missing'],
    analysis: TASK_STEPS[ir.intent.task] || TASK_STEPS.general_question,
    successCriteria: ['precision.success'],
    outputPreferences: {
      verbosity: 'detailed',
      format: ir.intent.signals.hasExplicitFormat ? 'user-specified' : 'structured',
      instructions: [ir.intent.task === 'debugging' ? 'debug.output' : 'precision.output'],
    },
  };
}
