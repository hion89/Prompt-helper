export const EVALUATION_CASES = Object.freeze([
  {
    id: 'debug-ko', name: '한국어 오류 분석', expectedTask: 'debugging', expectedPromptLanguage: 'ko',
    source: '결제 API에서 주문 A-017을 처리하면 HTTP 429가 발생해. 자동 재시도는 하지 말고 가능한 원인, 확인 순서, 수정 방법을 표로 정리해줘.',
    settings: { targetModel: 'chatgpt', responseLanguage: 'ko', promptLanguage: 'ko', mode: 'precision' },
    criticalDetails: ['A-017', 'HTTP 429', '자동 재시도'],
  },
  {
    id: 'summary-ko', name: '조건부 요약', expectedTask: 'summarization', expectedPromptLanguage: 'ko',
    source: '아래 회의록을 5개 핵심 bullet로 요약하고, 결정 사항과 담당자를 분리해줘. 예산은 3,500만원이고 담당자는 김민수야.',
    settings: { targetModel: 'claude', responseLanguage: 'ko', promptLanguage: 'ko', mode: 'default' },
    criticalDetails: ['5개', '3,500만원', '김민수'],
  },
  {
    id: 'translation-ko', name: '번역 조건 보존', expectedTask: 'translation', expectedPromptLanguage: 'ko',
    source: 'Project Aurora의 출시 안내문을 영어로 번역해줘. 제품명은 번역하지 말고 2026-11-03과 14:30 표기를 그대로 유지해.',
    settings: { targetModel: 'gemini', responseLanguage: 'ko', promptLanguage: 'ko', mode: 'precision' },
    criticalDetails: ['Project Aurora', '2026-11-03', '14:30'],
  },
  {
    id: 'code-en', name: '영어 코드 생성', expectedTask: 'code_generation', expectedPromptLanguage: 'en',
    source: 'Write a JavaScript function named normalizeInvoice that preserves invoiceId, rejects negative totals, and uses no external dependencies.',
    settings: { targetModel: 'chatgpt', responseLanguage: 'en', promptLanguage: 'en', mode: 'precision' },
    criticalDetails: ['normalizeInvoice', 'invoiceId', 'no external dependencies'],
  },
  {
    id: 'research-en', name: '출처 기반 조사', expectedTask: 'research', expectedPromptLanguage: 'en',
    source: 'Research current solid-state battery commercialization progress. Cite sources actually consulted and distinguish confirmed facts from forecasts through 2030.',
    settings: { targetModel: 'chatgpt', responseLanguage: 'en', promptLanguage: 'en', mode: 'precision' },
    criticalDetails: ['solid-state battery', '2030', 'confirmed facts'],
  },
  {
    id: 'natural-ko', name: '자연스러운 이메일', expectedTask: 'writing', expectedPromptLanguage: 'ko',
    source: '박서연에게 10월 18일 오후 4시 회의를 30분 늦춰달라는 정중하지만 너무 딱딱하지 않은 이메일을 써줘.',
    settings: { targetModel: 'claude', responseLanguage: 'ko', promptLanguage: 'ko', mode: 'natural' },
    criticalDetails: ['박서연', '10월 18일', '30분'],
  },
  {
    id: 'comparison-ko', name: '다기준 비교', expectedTask: 'comparison', expectedPromptLanguage: 'ko',
    source: '노트북 Alpha 14와 Beta Air를 무게, 배터리, RAM 16GB 기준으로 비교하고 출장용으로 하나를 추천해줘. 가격은 비교에서 제외해.',
    settings: { targetModel: 'gemini', responseLanguage: 'ko', promptLanguage: 'ko', mode: 'default' },
    criticalDetails: ['Alpha 14', 'Beta Air', 'RAM 16GB', '가격'],
  },
  {
    id: 'data-en', name: '데이터 분석 제약', expectedTask: 'data_analysis', expectedPromptLanguage: 'en',
    source: 'Analyze the CSV sales data for Q1 and Q2. Keep missing values visible, calculate median revenue by region, and return a Markdown table plus three findings.',
    settings: { targetModel: 'chatgpt', responseLanguage: 'en', promptLanguage: 'en', mode: 'precision' },
    criticalDetails: ['Q1', 'Q2', 'median revenue', 'Markdown'],
  },
]);
