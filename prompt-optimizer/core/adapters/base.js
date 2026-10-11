export function adaptWithProfile(ir, profile) {
  const compact = ir.mode === 'eco' || (ir.intent.complexity === 'simple' && ir.mode !== 'precision');
  const constraints = [...ir.constraints];
  if (ir.intent.signals.needsSources && profile.searchHandling === 'sources-when-needed') {
    constraints.push(ir.mode === 'eco' ? 'sources.short' : 'sources');
  }
  const analysis = [...ir.analysis];
  if (ir.mode === 'precision' && profile.analysisRequest === 'evidence-summary') {
    analysis.push('analysis.evidence');
  }
  const sections = [
    { title: 'head.context', keys: ir.context, style: 'prose' },
    { title: 'head.requirements', keys: ir.requirements, style: 'bullets' },
    { title: 'head.analysis', keys: analysis, style: 'bullets' },
    { title: 'head.constraints', keys: constraints, style: profile.constraintExpression },
    { title: 'head.output', keys: ir.outputPreferences.instructions, style: profile.outputExpression },
    { title: 'head.success', keys: ir.successCriteria, style: 'prose' },
  ].filter((section) => section.keys.length);
  return {
    ir,
    profile,
    compact,
    sections,
    // A closing reminder keeps constraints visible without duplicating long source.
    closing: ir.intent.signals.longContext && ir.mode !== 'eco' && profile.longContext === 'closing-recap'
      ? ['long.recap'] : [],
  };
}
