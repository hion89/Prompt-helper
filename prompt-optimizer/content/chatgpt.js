/* Keep site selectors here: providers can change their composer markup. */
globalThis.__PROMPT_OPTIMIZER_SITE__ = {
  model: 'chatgpt',
  name: 'ChatGPT',
  selectors: [
    '#prompt-textarea[contenteditable="true"]',
    '#prompt-textarea[contenteditable="plaintext-only"]',
    'textarea#prompt-textarea',
    'textarea[data-testid="prompt-textarea"]',
    '[data-type="unified-composer"] [contenteditable]:not([contenteditable="false"])',
    '[data-testid="composer"] [contenteditable]:not([contenteditable="false"])',
    'main [data-virtualkeyboard="true"][contenteditable]:not([contenteditable="false"])',
    'main .ProseMirror[contenteditable]:not([contenteditable="false"])',
    'form [role="textbox"][contenteditable]:not([contenteditable="false"])',
    'form [contenteditable]:not([contenteditable="false"])',
    'textarea[placeholder*="ChatGPT" i]',
    'textarea[placeholder*="물어보세요"]',
    'form textarea[placeholder*="Message" i]',
    'form textarea[placeholder*="메시지"]',
    'form textarea'
  ]
};
