export const MAX_CUSTOM_INSTRUCTIONS = 6000;
export const CUSTOM_CONCEPTS = Object.freeze({
  accuracy: { label: '정확함', hint: '조건·근거·검증 기준', instruction: 'Make important constraints and verification criteria explicit; distinguish evidence from assumptions and preserve all facts.' },
  economy: { label: '절약', hint: '짧고 효율적인 프롬프트', instruction: 'Use the fewest effective words and request a concise answer. Remove boilerplate and repetition before reducing detail; never drop meaningful requirements.' },
  natural: { label: '자연스러움', hint: '매끄러운 표현과 문체', instruction: 'Use fluent, natural phrasing appropriate to the context; avoid stock phrases and unnecessary rigid templates.' },
  professional: { label: '전문성', hint: '정확한 용어와 차분한 톤', instruction: 'Use precise domain terminology where useful and a composed professional tone. Do not invent credentials or impose an expert persona.' },
  friendly: { label: '친근함', hint: '부드럽고 편한 말투', instruction: 'Ask for a warm, approachable tone with accessible explanations, avoiding forced enthusiasm or condescension.' },
  clarity: { label: '명료함', hint: '쉽게 이해할 수 있는 설명', instruction: 'State the objective and desired deliverable clearly; ask for plain language and explain necessary technical terms.' },
  structured: { label: '구조화', hint: '단계·목록·표 활용', instruction: 'Organize complex deliverables into useful steps, headings, lists or tables when they help. Preserve any explicit format requested by the original author.' },
  creative: { label: '창의성', hint: '다양한 아이디어와 관점', instruction: 'When the task calls for ideation, invite varied useful perspectives or alternatives without inventing factual claims or changing the task.' },
  detailed: { label: '상세함', hint: '필요한 설명과 예시', instruction: 'Request enough relevant explanation and examples to make the answer usable; avoid irrelevant expansion and do not fabricate examples as observed facts.' },
  actionable: { label: '실용성', hint: '바로 적용할 방법', instruction: 'When relevant, ask for concrete actionable steps and decision criteria grounded in the supplied context; do not invent tools, deadlines or requirements.' },
});
export function normalizeCustomConcepts(value) {
  if (!Array.isArray(value)) return [];
  return Object.keys(CUSTOM_CONCEPTS).filter(id => value.includes(id));
}
export function customConfigurationError(settings) {
  if (settings?.mode !== 'custom') return '';
  if (settings.customType === 'manual') {
    if (typeof settings.customInstructions !== 'string' || !settings.customInstructions.trim()) return '수동 Custom의 최적화 지침을 입력해 주세요.';
    if (settings.customInstructions.length > MAX_CUSTOM_INSTRUCTIONS) return 'Custom 최적화 지침은 6,000자까지 입력할 수 있습니다.';
  } else if (!normalizeCustomConcepts(settings.customConcepts).length) {
    return '자동 Custom에서 콘셉트를 하나 이상 선택해 주세요.';
  }
  return '';
}
