import { createPromptIR } from './prompt-ir.js';
import { processMode } from './modes/index.js';
import { adaptModel } from './adapters/index.js';
import { adaptLanguage } from './languages/language-adapter.js';

function renderSection(section, profile) {
  const title = profile.instructionStructure === 'markdown' ? '## ' + section.title : section.title + ':';
  const content = section.style === 'bullets'
    ? section.lines.map((line) => '- ' + line).join('\n')
    : section.lines.join(' ');
  return title + '\n' + content;
}

export function renderPrompt(plan) {
  // Do not trim or normalize sourceText, including intentional whitespace.
  if (plan.compact) {
    const guidance = [...new Set(plan.sections.flatMap((section) => section.lines))];
    return [plan.ir.sourceText, ...guidance, ...plan.ending].join('\n\n');
  }
  const original = renderSection({ title: plan.objectiveTitle, lines: [plan.ir.sourceText], style: 'prose' }, plan.profile);
  const sections = plan.sections.map((section) => renderSection(section, plan.profile));
  const parts = plan.profile.contextPlacement === 'after-guidance'
    ? [...sections, original]
    : [original, ...sections];
  return [...parts, ...plan.ending].join('\n\n');
}

export function compilePrompt(text, settings = {}, profileOverrides = {}) {
  const ir = processMode(createPromptIR(text, settings));
  const modelPlan = adaptModel(ir, profileOverrides);
  const localizedPlan = adaptLanguage(modelPlan);
  return {
    text: renderPrompt(localizedPlan),
    ir,
    meta: {
      task: ir.intent.task,
      detectedLanguage: ir.intent.detectedLanguage,
      responseLanguage: ir.responseLanguage,
      promptLanguage: ir.promptLanguage,
      targetModel: ir.targetModel,
      mode: ir.mode,
      complexity: ir.intent.complexity,
      sourcePreserved: true,
      inputCharacters: text.length,
      modelProfile: modelPlan.profile.name,
    },
  };
}
