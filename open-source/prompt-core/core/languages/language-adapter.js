import { MESSAGES } from './messages.js';

const LANGUAGE_NAMES = {
  en: { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese' },
  ko: { ko: '한국어', en: 'English (영어)', ja: '日本語 (일본어)', zh: '中文 (중국어)' },
  ja: { ko: '한국어（韓国語）', en: 'English（英語）', ja: '日本語', zh: '中文（中国語）' },
  zh: { ko: '한국어（韩语）', en: 'English（英语）', ja: '日本語（日语）', zh: '中文' },
};

export function adaptLanguage(plan) {
  const locale = MESSAGES[plan.ir.promptLanguage] ? plan.ir.promptLanguage : 'en';
  const lookup = (key) => {
    const value = MESSAGES[locale][key] || MESSAGES.en[key];
    if (!value) throw new Error('Unknown compiler instruction: ' + key);
    return value;
  };
  const language = LANGUAGE_NAMES[locale][plan.ir.responseLanguage] || 'English';
  const response = {
    en: 'Respond in ' + language + '.',
    ko: '최종 답변은 ' + language + '로 작성하세요.',
    ja: '最終回答は' + language + 'で書いてください。',
    zh: '请用' + language + '回答。',
  }[locale];
  const ending = [...plan.closing.map(lookup), response];
  if (plan.ir.intent.task === 'translation') ending.push(lookup('translation.language'));
  return {
    ...plan,
    objectiveTitle: lookup('head.objective'),
    sections: plan.sections.map((section) => ({
      title: lookup(section.title),
      lines: [...new Set(section.keys)].map(lookup),
      style: section.style,
    })),
    ending,
  };
}
