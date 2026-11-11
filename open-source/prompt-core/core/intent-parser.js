/** Local, deterministic heuristics. These labels are hints, never new user facts. */
export const TASK_CATEGORIES = Object.freeze([
  'general_question', 'coding', 'debugging', 'code_generation', 'summarization',
  'translation', 'writing', 'rewriting', 'research', 'comparison', 'brainstorming',
  'planning', 'data_analysis', 'study_explanation',
]);

const RULES = [
  ['translation', /\btranslat(?:e|ion|ing)\b|번역|옮겨\s*줘|翻訳|訳して|翻译|译成/iu],
  ['summarization', /\bsummari[sz](?:e|ation|ing)\b|\bsummary\b|\btl;?dr\b|요약|정리해\s*줘|要約|まとめて|总结|摘要/iu],
  ['rewriting', /\brewrit(?:e|ing)\b|\brephras(?:e|ing)\b|\bproofread\b|다듬|고쳐\s*써|교정|자연스럽게|書き直|言い換え|润色|改写/iu],
  ['comparison', /\bcompar(?:e|ison|ing)\b|\bversus\b|\bvs\.?\b|비교|차이점|比較|違い|对比|比较|区别/iu],
  ['research', /\bresearch\b|\binvestigat(?:e|ion)\b|\blook\s+up\b|\bsearch\b|\blatest\b|조사|검색|최신|출처|調査|検索|最新|调查|搜索|研究资料/iu],
  ['brainstorming', /\bbrainstorm\w*\b|\bideas?\b|아이디어|브레인스토밍|発想|アイデア|头脑风暴|点子|创意/iu],
  ['planning', /\bplan(?:ning)?\b|\broadmap\b|\bitinerary\b|\bschedule\b|계획|일정|로드맵|計画|予定|计划|规划|行程/iu],
  ['data_analysis', /\bdata\s+analy(?:sis|[sz]e)\b|\banaly[sz]e\s+(?:this\s+|the\s+)?(?:data|dataset|csv|sales|numbers)\b|\bstatistics?\b|\bdataset\b|데이터\s*분석|통계|매출.{0,80}분석|データ.{0,80}分析|統計|数据.{0,80}分析|统计/iu],
  ['debugging', /\bdebug\w*\b|\bbug\b|\bfix\b|\bcrash\w*\b|\berror\b|\bnot\s+work\w*\b|\bdoesn['’]?t\s+work\b|\bwhy\b[\s\S]{0,70}\bfail\w*\b|디버깅|버그|오류|에러|안\s*(?:되|돼|되는|가|움직)|않.{0,92}(?:이유|원인)|제자리|문제\s*(?:원인|분석)|動かない|エラー|バグ|修正|报错|错误|不工作|无法运行|调试/iu],
  ['code_generation', /\b(?:write|generate|create|build|implement|make)\b[\s\S]{0,90}\b(?:code|function|script|app|website|extension|component|api|program|class)\b|(?:코드|함수|스크립트|앱|웹사이트|확장\s*프로그램|프로그램|컴포넌트).{0,50}(?:작성|만들|구현|개발|생성)|(?:작성|만들|구현|개발|생성).{0,30}(?:코드|함수|프로그램)|(?:コード|関数|アプリ).{0,30}(?:作成|書いて|作って|実装)|(?:编写|写|生成|实现|创建).{0,30}(?:代码|函数|程序|应用)/iu],
  ['coding', /\bcode\b|\bprogramming\b|\brefactor\w*\b|\bjavascript\b|\bpython\b|\btypescript\b|\bsql\b|코드|프로그래밍|리팩터|리팩토|コード|プログラミング|代码|编程/iu],
  ['study_explanation', /\bexplain\b|\bteach\b|\bunderstand\b|\blearn\b|\bwhat\s+(?:is|are)\b|설명|알려\s*줘|이해|학습|가르쳐|とは|説明|教えて|解释|讲解|学习|是什么/iu],
  ['writing', /\bwrite\b|\bdraft\b|\bcompose\b|\bessay\b|\bemail\b|작성|써\s*줘|글쓰기|초안|文章|メール|執筆|写作|写一|撰写|邮件/iu],
];

export function detectLanguage(text) {
  const prose = text.replace(/```[\s\S]*?```/gu, '').replace(/https?:\/\/\S+/gu, '');
  const sample = prose.trim() ? prose : text;
  const count = (pattern) => (sample.match(pattern) || []).length;
  const ko = count(/[\uAC00-\uD7A3]/gu);
  const kana = count(/[\u3040-\u30FF]/gu);
  const han = count(/[\u3400-\u4DBF\u4E00-\u9FFF]/gu);
  const en = count(/[a-z]/giu);
  if (kana && kana * 3 + han >= ko * 2) return 'ja';
  if (ko && ko * 5 >= en && ko >= han) return 'ko';
  if (han && han * 4 >= en) return 'zh';
  if (en) return 'en';
  if (ko) return 'ko';
  if (han) return 'zh';
  return 'en';
}

export function parseIntent(text) {
  // Classify the request, not keywords inside supplied code or quoted data.
  const prose = text.replace(/```[\s\S]*?```/gu, ' ');
  let matches = RULES.filter(([, pattern]) => pattern.test(prose)).map(([task]) => task);
  const hasCode = /```|\b(?:function|const|let|class|def|import)\s+\w+|=>|<\/?(?:html|div|script)\b/u.test(text);
  const hasCodeRequest = matches.includes('coding') || matches.includes('code_generation');
  if (hasCodeRequest && matches[0] === 'rewriting') {
    matches = ['code_generation', ...matches.filter((task) => task !== 'rewriting' && task !== 'code_generation')];
  }
  const task = matches[0] || (hasCode ? 'coding' : 'general_question');
  const lines = text.split(/\r?\n/u).filter((line) => line.trim()).length;
  const listItems = (text.match(/^[\t ]*(?:[-*•]|\d+[.)])[\t ]+/gmu) || []).length;
  return {
    task,
    goal: text.trim(),
    secondaryTasks: matches.filter((item) => item !== task),
    detectedLanguage: detectLanguage(text),
    complexity: text.length > 500 || lines > 4 || listItems > 1 || hasCode ? 'complex' : 'simple',
    signals: {
      hasCode,
      hasNumbers: /\d/u.test(text),
      hasExplicitFormat: /\b(?:json|csv|table|markdown|bullet|format)\b|표\s*형식|표로|형식|形式|格式/iu.test(prose),
      needsSources: task === 'research' || /\b(?:sources?|citations?|latest|current|search)\b|출처|인용|최신|검색|出典|引用|最新|来源|搜索/iu.test(prose),
      longContext: text.length > 8000,
    },
  };
}
