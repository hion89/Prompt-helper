globalThis.__PROMPT_OPTIMIZER_SITE__ = {
  model: 'perplexity',
  name: 'Perplexity',
  selectors: [
    '#ask-input[contenteditable="true"]',
    'textarea#ask-input',
    '[data-testid="ask-input"][contenteditable="true"]',
    '[data-testid="ask-input"] textarea',
    'textarea[placeholder*="Ask" i]',
    'textarea[placeholder*="질문"]',
    '[contenteditable="true"][data-lexical-editor="true"][role="textbox"]',
    '[contenteditable="true"][role="textbox"][aria-label*="Ask" i]'
  ]
};
