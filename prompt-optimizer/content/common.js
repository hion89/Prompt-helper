/* Classic isolated-world content script. No dependencies, network, or HTML injection. */
(() => {
  'use strict';
  const site = globalThis.__PROMPT_OPTIMIZER_SITE__;
  if (!site || globalThis.__PROMPT_OPTIMIZER_STARTED__) return;
  globalThis.__PROMPT_OPTIMIZER_STARTED__ = true;

  const MODE_NAMES = { default: 'Default', eco: 'ECO · 토큰 절약', precision: 'Precision · 정확함', natural: 'Natural · 자연스러운 문체', custom: 'Custom' };
  const MAX_SOURCE_LENGTH = 12000;
  const MAX_LENGTH = 100000;
  const host = document.createElement('div');
  host.id = 'prompt-optimizer-toolbar';
  host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483646!important;display:none!important;pointer-events:none!important;max-width:calc(100vw - 24px)!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { color-scheme: light dark; }
    * { box-sizing: border-box; }
    .panel { --bg:#fff; --fg:#24302b; --muted:#627269; --line:#dce5df; --accent:#267754; --hover:#eaf5ee;
      width:max-content;max-width:calc(100vw - 24px);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--fg); }
    .panel.dark { --bg:#1c2722;--fg:#e7f1eb;--muted:#aec3b6;--line:#3a4d40;--accent:#a3e5bd;--hover:#304b3a; }
    .bar { display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:5px 7px;background:var(--bg);border:1px solid var(--line);border-radius:11px;
      box-shadow:0 4px 18px #071c1620;pointer-events:auto; }
    button { appearance:none;border:0;border-radius:7px;background:transparent;color:var(--fg);font:inherit;white-space:nowrap;padding:6px 8px;cursor:pointer; }
    button:hover:not(:disabled) { background:var(--hover); }
    button:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
    button:disabled { opacity:.45;cursor:default; }
    .drag { color:var(--muted);cursor:grab;padding:6px 4px;touch-action:none;user-select:none; }
    .drag:active { cursor:grabbing; }
    .hide { color:var(--muted);padding:6px 5px;font-size:15px;line-height:1; }
    .optimize { font-weight:700;color:var(--accent); }
    .mode { border-left:1px solid var(--line);padding-left:8px;color:var(--muted);font-size:10px;white-space:pre-line;overflow-wrap:anywhere;max-width:210px;flex:0 1 auto; }
    .mini-icon { display:none;width:40px;height:40px;pointer-events:auto;background:var(--bg);border:1px solid var(--line);border-radius:50%;box-shadow:0 4px 18px #071c1620;color:var(--accent);font-size:23px;touch-action:none;user-select:none; }
    .panel.minimized .bar, .panel.minimized .status { display:none; }
    .panel.minimized .mini-icon { display:block; }
    .mode[data-ready="true"] { color:var(--accent); }
    .mode[data-ready="false"] { color:#be3939; }
    .dark .mode[data-ready="false"] { color:#ffaaaa; }
    .mode::before { content:'●';margin-right:4px;font-size:8px; }
    @media (max-width:420px) { .bar { flex-wrap:wrap; } .mode { white-space:normal; } }
    .status { display:none;background:var(--bg);border:1px solid var(--line);border-radius:9px;margin-top:5px;padding:8px 10px;max-width:320px;white-space:normal;pointer-events:auto; }
    .status.visible { display:block; }
    .status.error { color:#be3939; }
    .dark .status.error { color:#ffaaaa; }
    @media (prefers-reduced-motion:no-preference) { button { transition:background .12s; } }
  `;
  const panel = document.createElement('div');
  panel.className = 'panel';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', `Prompt Optimizer · ${site.name}`);
  const dragButton = document.createElement('button');
  dragButton.type = 'button';
  dragButton.className = 'drag';
  dragButton.textContent = '⠿';
  dragButton.title = '끌어서 이동 · 더블클릭하면 입력창 옆으로 복귀';
  dragButton.setAttribute('aria-label', '미니 도구 이동');
  const optimizeButton = document.createElement('button');
  optimizeButton.type = 'button';
  optimizeButton.className = 'optimize';
  optimizeButton.textContent = '✦ Optimize';
  optimizeButton.title = '현재 입력 내용을 최적화합니다. 자동 전송하지 않습니다.';
  const undoButton = document.createElement('button');
  undoButton.type = 'button';
  undoButton.className = 'undo';
  undoButton.textContent = '↶ Undo';
  undoButton.title = '최적화 전 원문으로 복원';
  undoButton.disabled = true;
  const modeBadge = document.createElement('span');
  modeBadge.className = 'mode';
  const hideButton = document.createElement('button');
  hideButton.type = 'button';
  hideButton.className = 'hide';
  hideButton.textContent = '×';
  hideButton.title = '미니 도구 숨기기 · 확장 프로그램 팝업에서 다시 켤 수 있습니다.';
  hideButton.setAttribute('aria-label', '미니 도구 숨기기');
  const minimizeButton = document.createElement('button');
  minimizeButton.type = 'button';
  minimizeButton.className = 'minimize';
  minimizeButton.textContent = '−';
  minimizeButton.title = '작은 아이콘으로 최소화 · 아이콘을 클릭하면 다시 펼칩니다.';
  minimizeButton.setAttribute('aria-label', '미니 도구 최소화');
  const miniIcon = document.createElement('button');
  miniIcon.type = 'button';
  miniIcon.className = 'mini-icon';
  miniIcon.textContent = '✦';
  miniIcon.setAttribute('aria-label', 'Prompt Optimizer 펼치기');
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  bar.append(dragButton, optimizeButton, undoButton, modeBadge, minimizeButton, hideButton);
  panel.append(bar, miniIcon, status);
  shadow.append(style, panel);

  let settings = { mode: 'default', theme: 'system', toolbarEnabled: false, toolbarMinimized: false, toolbarPositions: {} };
  let apiState = null;
  let composer = null;
  let originals = new WeakMap();
  const tokens = new WeakMap();
  const revisions = new WeakMap();
  const documentToken = globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36);
  let nextToken = 0;
  let navigation = 0;
  let pageURL = location.href;
  let operation = null;
  let scanTimer = 0;
  let positionFrame = 0;
  let statusTimer = 0;
  let dragState = null;
  let suppressMiniClick = false;
  let observer = null;
  let resizeObserver = null;
  let observing = false;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');

  function visibleEditor(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"], [data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"]')) return false;
    if (element.matches(':disabled, [readonly], [aria-disabled="true"], [aria-readonly="true"]')) return false;
    if (!(element instanceof HTMLTextAreaElement) && !element.isContentEditable) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 16 || element.getClientRects().length === 0) return false;
    const computed = getComputedStyle(element);
    return computed.display !== 'none' && computed.visibility !== 'hidden';
  }

  function refreshNavigation() {
    if (pageURL === location.href) return;
    pageURL = location.href;
    navigation += 1;
    composer = null;
    originals = new WeakMap();
    showStatus('');
  }

  function findComposer() {
    refreshNavigation();
    const candidates = [];
    for (const selector of site.selectors) {
      try {
        for (const element of document.querySelectorAll(selector)) {
          if (!candidates.includes(element) && visibleEditor(element)) candidates.push(element);
        }
      } catch { /* One stale selector must not break the other fallbacks. */ }
    }
    const active = document.activeElement;
    const focused = candidates.find(element => element === active || element.contains(active));
    composer = focused || (candidates.includes(composer) ? composer : candidates[0]) || null;
    return composer;
  }

  function composerToken(element) {
    if (!tokens.has(element)) tokens.set(element, String(++nextToken));
    return `${documentToken}:${navigation}:${tokens.get(element)}`;
  }

  // innerText preserves rendered paragraphs, line breaks, and pasted code indentation.
  function readText(element) {
    return element instanceof HTMLTextAreaElement ? element.value : (element.innerText ?? element.textContent ?? '');
  }

  // contenteditable editors may render one logical paragraph break as two or
  // more newlines. Ignore only that representation difference, not text edits.
  function canonicalEditorText(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n');
  }

  function canUndo(element) {
    const record = element && originals.get(element);
    return Boolean(record && record.url === location.href && record.optimized === readText(element));
  }

  function showStatus(message, error = false, persistent = false) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.className = `status${message ? ' visible' : ''}${error ? ' error' : ''}`;
    queuePosition();
    if (message && !error && !persistent) statusTimer = setTimeout(() => showStatus(''), 6500);
  }

  function applySettings(value, api) {
    if (api !== undefined) apiState = api;
    settings = { ...settings, ...(value && typeof value === 'object' ? value : {}) };
    const mode = MODE_NAMES[settings.mode] ? settings.mode : 'default';
    const name = mode === 'custom' ? 'Custom · ' + (settings.customType === 'manual' ? '수동' : '자동') : MODE_NAMES[mode];
    const apiLabel = !apiState ? '상태 확인 중' : !apiState.configured ? '키 미등록' : !apiState.granted ? '권한 필요' : '키 등록됨';
    const variant = settings.targetVariants?.[site.model];
    const destination = variant && variant !== 'general' ? variant : site.name + ' 공통';
    modeBadge.textContent = 'Gemini API · ' + apiLabel + ' · ' + name + '\n대상: ' + destination;
    modeBadge.dataset.ready = String(apiState?.ready === true);
    modeBadge.title = `Gemini API ${apiLabel} · 대상 ${destination} · ${name}. 대상 모델은 팝업에서 직접 선택합니다. 실제 웹 AI의 모델을 변경하지 않습니다. 키와 권한 준비 상태이며 실제 인증과 할당량은 요청 시 확인합니다.`;
    panel.classList.toggle('minimized', settings.toolbarMinimized === true);
    miniIcon.title = `Prompt Optimizer 펼치기 · ${destination} · ${name}. 끌어서 이동할 수 있습니다.`;
    panel.classList.toggle('dark', settings.theme === 'dark' || ((settings.theme === 'system' || settings.theme === 'auto') && systemTheme.matches));
    syncToolbarRuntime();
    updateButtons();
  }

  function syncToolbarRuntime() {
    if (!observer) return;
    if (!settings.toolbarEnabled) {
      observer.disconnect();
      resizeObserver?.disconnect();
      observing = false;
      clearTimeout(scanTimer);
      scanTimer = 0;
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    if (!observing && document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'disabled', 'readonly', 'hidden', 'aria-hidden', 'class', 'style'] });
      resizeObserver?.observe(document.documentElement);
      observing = true;
    }
    scan();
  }

  function updateButtons() {
    miniIcon.textContent = operation ? '…' : '✦';
    miniIcon.setAttribute('aria-label', operation ? '최적화 진행 중 · Prompt Optimizer 펼치기' : 'Prompt Optimizer 펼치기');
    optimizeButton.disabled = Boolean(operation) || apiState?.ready !== true;
    optimizeButton.title = apiState?.ready ? '등록한 개인 키로 Gemini API에 원문과 설정을 보내 최적화합니다.' : '확장 프로그램 팝업에서 Gemini API 키와 연결 권한을 확인해 주세요.';
    optimizeButton.textContent = operation ? '최적화 중…' : '✦ Optimize';
    undoButton.disabled = Boolean(operation) || !canUndo(composer);
    undoButton.title = originals.has(composer) && !canUndo(composer)
      ? '입력 내용이 변경되어 덮어쓰기를 방지했습니다.' : '최적화 전 원문으로 복원';
  }

  function queuePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => { positionFrame = 0; positionToolbar(); });
  }

  function positionToolbar() {
    if (dragState) return;
    if (!settings.toolbarEnabled || !composer || !visibleEditor(composer)) {
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    const rect = composer.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) {
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    host.style.setProperty('display', 'block', 'important');
    const width = panel.getBoundingClientRect().width;
    const height = panel.getBoundingClientRect().height;
    const saved = settings.toolbarPositions?.[site.model];
    const availableWidth = Math.max(0, innerWidth - width - 16);
    const availableHeight = Math.max(0, innerHeight - height - 16);
    const automaticLeft = Math.max(12, Math.min(innerWidth - width - 12, rect.right - width));
    const preferredTop = rect.top >= height + 14 ? rect.top - height - 8 : rect.bottom + 8;
    const automaticTop = Math.max(8, Math.min(innerHeight - height - 8, preferredTop));
    const left = saved ? 8 + saved.x * availableWidth : automaticLeft;
    const top = saved ? 8 + saved.y * availableHeight : automaticTop;
    host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    host.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }

  function scan() {
    scanTimer = 0;
    if (!settings.toolbarEnabled) return;
    findComposer();
    if (!host.isConnected && document.documentElement) document.documentElement.append(host);
    updateButtons();
    queuePosition();
  }

  function queueScan() {
    if (settings.toolbarEnabled && !scanTimer) scanTimer = setTimeout(scan, 140);
  }

  function updateSavedPosition(position) {
    const toolbarPositions = { ...(settings.toolbarPositions || {}) };
    if (position) toolbarPositions[site.model] = position;
    else delete toolbarPositions[site.model];
    settings = { ...settings, toolbarPositions };
  }

  function discardInvalidToolbar() {
    // Reloading/updating an extension invalidates content scripts already
    // running in open tabs. Remove the stale toolbar without surfacing an
    // uncaught error; the refreshed page will receive the new script.
    settings = { ...settings, toolbarEnabled: false };
    observer?.disconnect();
    resizeObserver?.disconnect();
    observing = false;
    clearTimeout(scanTimer);
    scanTimer = 0;
    host.remove();
  }

  function persistToolbarState(message) {
    try {
      const pending = chrome.runtime.sendMessage({ type: 'SET_TOOLBAR_STATE', ...message });
      pending?.catch(discardInvalidToolbar);
    } catch { discardInvalidToolbar(); }
  }

  function moveToolbar(clientX, clientY) {
    if (!dragState) return;
    const width = panel.getBoundingClientRect().width;
    const height = panel.getBoundingClientRect().height;
    const left = Math.max(8, Math.min(innerWidth - width - 8, dragState.left + clientX - dragState.x));
    const top = Math.max(8, Math.min(innerHeight - height - 8, dragState.top + clientY - dragState.y));
    host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    host.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }

  function finishToolbarMove() {
    if (!dragState) return;
    const rect = panel.getBoundingClientRect();
    const availableWidth = Math.max(1, innerWidth - rect.width - 16);
    const availableHeight = Math.max(1, innerHeight - rect.height - 16);
    const position = {
      x: Math.max(0, Math.min(1, (rect.left - 8) / availableWidth)),
      y: Math.max(0, Math.min(1, (rect.top - 8) / availableHeight)),
    };
    dragState = null;
    updateSavedPosition(position);
    persistToolbarState({ position });
  }

  function inputEvent(text, type = 'input') {
    try {
      return new InputEvent(type, { bubbles: true, composed: true, cancelable: type === 'beforeinput', inputType: 'insertText', data: text });
    } catch { return new Event(type, { bubbles: true, cancelable: type === 'beforeinput' }); }
  }

  // Only called from an explicit Optimize, Replace, or Undo action. Never dispatch
  // keyboard events, submit forms, click Send, or insert untrusted HTML.
  function writeText(element, text) {
    if (!visibleEditor(element)) throw new Error('입력창이 변경되었습니다. 페이지에서 입력창을 다시 선택해 주세요.');
    if (!(element instanceof HTMLTextAreaElement) && element.querySelector('img, video, audio, iframe, canvas, object, embed, [contenteditable="false"]')) {
      throw new Error('입력창 안에 첨부 콘텐츠가 있어 자동 교체하지 않았습니다. 팝업에서 복사해 필요한 부분에 붙여넣어 주세요.');
    }
    element.focus({ preventScroll: true });
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) throw new Error('이 입력창은 안전하게 편집할 수 없습니다. 팝업에서 복사해 붙여넣어 주세요.');
      setter.call(element, text);
      element.dispatchEvent(inputEvent(text));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.setSelectionRange(text.length, text.length);
    } else {
      const selection = window.getSelection();
      if (!selection) throw new Error('입력창을 선택할 수 없습니다. 팝업에서 복사해 붙여넣어 주세요.');
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      // The native editing path updates ProseMirror / Quill / Lexical and keeps
      // browser undo history. insertText is plain text even when it contains HTML.
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, text); } catch { /* fallback below */ }
      if (!inserted) {
        // Some editors cancel execCommand after handling it themselves.
        if (readText(element) === text) return;
        if (!element.dispatchEvent(inputEvent(text, 'beforeinput'))) {
          if (readText(element) === text) return;
          throw new Error('사이트가 편집을 허용하지 않았습니다. 팝업에서 복사해 붙여넣어 주세요.');
        }
        element.replaceChildren(document.createTextNode(text));
        const caret = document.createRange();
        caret.selectNodeContents(element);
        caret.collapse(false);
        selection.removeAllRanges();
        selection.addRange(caret);
        element.dispatchEvent(inputEvent(text));
      }
    }
  }

  function assertUnchanged(element, expected, token, url) {
    const current = findComposer();
    if (!element || current !== element || !element.isConnected || url !== location.href || (token && token !== composerToken(element))) {
      throw new Error('입력창이나 대화가 변경되었습니다. 현재 입력 내용을 다시 가져와 주세요.');
    }
    if (readText(element) !== expected) throw new Error('입력 내용이 바뀌어 덮어쓰지 않았습니다. 현재 내용을 다시 가져와 주세요.');
  }

  function replaceGuarded(element, text, expected, token, url) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('교체할 프롬프트가 비어 있습니다.');
    if (text.length > MAX_LENGTH) throw new Error('프롬프트가 너무 깁니다. 100,000자 이내로 줄여 주세요.');
    if (typeof expected !== 'string') throw new Error('원문 확인 정보가 없습니다. 현재 입력 내용을 다시 가져와 주세요.');
    assertUnchanged(element, expected, token, url);
    const previous = originals.get(element);
    const original = previous && previous.url === url && previous.optimized === expected ? previous.original : expected;
    try {
      writeText(element, text);
    } catch (error) {
      // A site editor can partly handle an editing event before rejecting it.
      // Keep a recovery point if that changed the document.
      const partial = readText(element);
      if (partial !== expected) originals.set(element, { original, optimized: partial, url });
      updateButtons();
      queuePosition();
      throw error;
    }
    const applied = readText(element);
    originals.set(element, { original, optimized: applied, url });
    updateButtons();
    queuePosition();
    if (applied !== text && canonicalEditorText(applied) !== canonicalEditorText(text)) {
      throw new Error('사이트가 입력 형식을 변경했습니다. 내용을 확인해 주세요. Undo로 원문을 복원할 수 있습니다.');
    }
    showStatus('최적화된 프롬프트를 확인한 뒤 직접 전송해 주세요.');
    return { ok: true };
  }

  function undo(expected, token) {
    const element = findComposer();
    if (operation) throw new Error('최적화가 끝난 뒤 다시 시도해 주세요.');
    const record = element && originals.get(element);
    if (!record || record.url !== location.href) throw new Error('이 입력창에서 복원할 원문이 없습니다.');
    if (token !== undefined && token !== composerToken(element)) throw new Error('입력창이 변경되었습니다. 현재 입력 내용을 다시 가져와 주세요.');
    if (expected !== undefined && expected !== readText(element)) throw new Error('입력 내용이 변경되어 덮어쓰지 않았습니다.');
    if (readText(element) !== record.optimized) throw new Error('최적화 후 직접 편집한 내용이 있어 덮어쓰지 않았습니다.');
    writeText(element, record.original);
    if (readText(element) !== record.original) throw new Error('사이트에서 원문 복원을 처리하지 못했습니다. 입력 내용을 확인해 주세요.');
    originals.delete(element);
    updateButtons();
    showStatus('원문을 복원했습니다.');
    return { ok: true };
  }

  async function optimize() {
    if (operation) return;
    if (!apiState?.ready) return showStatus('Gemini API 키와 연결 권한을 확장 프로그램 팝업에서 확인해 주세요.', true);
    const element = findComposer();
    if (!element) return showStatus('입력창을 찾지 못했습니다. 확장 프로그램 팝업을 이용해 주세요.', true);
    const before = readText(element);
    if (!before.trim()) return showStatus('입력창에 요청을 먼저 작성해 주세요.', true);
    if (before.length > MAX_SOURCE_LENGTH) return showStatus('12,000자 이내의 요청을 입력해 주세요.', true);
    const request = { element, before, token: composerToken(element), url: location.href, revision: revisions.get(element) || 0, configuration: optimizationFingerprint() };
    operation = request;
    updateButtons();
    const started = Date.now();
    const showProgress = () => showStatus(`Gemini API 응답 대기 ${Math.floor((Date.now() - started) / 1000)}초 / 최대 90초…`, false, true);
    showProgress();
    const progressTimer = setInterval(showProgress, 1000);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'OPTIMIZE', text: before, settings: { targetModel: site.model } });
      if (!response?.ok) throw new Error(response?.error || '최적화하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      if (request.configuration !== optimizationFingerprint()) throw new Error('최적화 중 모델이나 모드 설정이 변경되어 적용하지 않았습니다. 다시 Optimize를 눌러 주세요.');
      if ((revisions.get(element) || 0) !== request.revision) throw new Error('최적화 중 입력 내용이 변경되어 덮어쓰지 않았습니다. 다시 Optimize를 눌러 주세요.');
      replaceGuarded(element, response.result?.text, before, request.token, request.url);
    } catch (error) {
      showStatus(error?.message?.includes('Extension context invalidated') ? '확장 프로그램이 업데이트되었습니다. 이 페이지를 새로고침해 주세요.' : (error.message || '최적화하지 못했습니다.'), true);
    } finally {
      clearInterval(progressTimer);
      if (operation === request) operation = null;
      updateButtons();
    }
  }

  function optimizationFingerprint() {
    return JSON.stringify([settings.targetVariants?.[site.model] || 'general', settings.targetProfileRevision, settings.mode, settings.responseLanguage, settings.promptLanguage, settings.geminiModel,
      ...(settings.mode === 'custom' ? [settings.customType, settings.customConcepts] : [])]);
  }

  // Page scripts can see this open shadow root. Only genuine user gestures may
  // start a billed request; programmatic page clicks must never call the API.
  dragButton.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    dragState = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    dragButton.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dragButton.addEventListener('pointermove', event => {
    if (!dragState || !dragButton.hasPointerCapture(event.pointerId)) return;
    moveToolbar(event.clientX, event.clientY);
  });
  dragButton.addEventListener('pointerup', event => {
    if (!dragState) return;
    if (dragButton.hasPointerCapture(event.pointerId)) dragButton.releasePointerCapture(event.pointerId);
    finishToolbarMove();
  });
  dragButton.addEventListener('pointercancel', finishToolbarMove);
  dragButton.addEventListener('dblclick', event => {
    if (!event.isTrusted) return;
    dragState = null;
    updateSavedPosition(null);
    persistToolbarState({ position: null });
    queuePosition();
  });
  function setMinimized(minimized) {
    dragState = null;
    applySettings({ toolbarMinimized: minimized });
    persistToolbarState({ minimized });
    (minimized ? miniIcon : minimizeButton).focus({ preventScroll: true });
  }
  minimizeButton.addEventListener('click', event => { if (event.isTrusted) setMinimized(true); });
  miniIcon.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    suppressMiniClick = false;
    dragState = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    miniIcon.setPointerCapture(event.pointerId);
  });
  miniIcon.addEventListener('pointermove', event => {
    if (!dragState || !miniIcon.hasPointerCapture(event.pointerId)) return;
    if (Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y) > 5) suppressMiniClick = true;
    if (suppressMiniClick) moveToolbar(event.clientX, event.clientY);
  });
  miniIcon.addEventListener('pointerup', event => {
    if (!dragState) return;
    if (miniIcon.hasPointerCapture(event.pointerId)) miniIcon.releasePointerCapture(event.pointerId);
    if (suppressMiniClick) finishToolbarMove();
    else dragState = null;
  });
  miniIcon.addEventListener('pointercancel', () => { suppressMiniClick = true; finishToolbarMove(); });
  miniIcon.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (suppressMiniClick && event.detail !== 0) { suppressMiniClick = false; return; }
    setMinimized(false);
  });
  hideButton.addEventListener('click', event => {
    if (!event.isTrusted) return;
    settings = { ...settings, toolbarEnabled: false };
    syncToolbarRuntime();
    persistToolbarState({ enabled: false });
  });
  optimizeButton.addEventListener('click', event => { if (event.isTrusted) void optimize(); });
  undoButton.addEventListener('click', () => { try { undo(); } catch (error) { showStatus(error.message, true); } });
  document.addEventListener('focusin', event => {
    if (event.target === host) return;
    queueScan();
  }, true);
  document.addEventListener('input', event => {
    if (!settings.toolbarEnabled) return;
    const element = composer;
    if (element && (event.target === element || element.contains(event.target))) {
      revisions.set(element, (revisions.get(element) || 0) + 1);
      updateButtons();
      queuePosition();
    }
  }, true);
  window.addEventListener('resize', () => { if (settings.toolbarEnabled) queuePosition(); }, { passive: true });
  window.addEventListener('scroll', () => { if (settings.toolbarEnabled) queuePosition(); }, { passive: true, capture: true });
  window.addEventListener('popstate', queueScan);
  window.addEventListener('hashchange', queueScan);
  systemTheme.addEventListener('change', () => applySettings(settings));
  // Shadow mutations never enter this observer. Ignore our own host positioning
  // to avoid a MutationObserver -> animation frame feedback loop.
  observer = new MutationObserver(records => {
    if (records.some(record => record.target !== host && !host.contains(record.target))) queueScan();
  });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(queuePosition);
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id && sender.id !== chrome.runtime.id) return false;
    if (message?.type === 'PO_SETTINGS') { applySettings(message.settings, message.api); respond({ ok: true }); return false; }
    if (!message || !['PO_GET_COMPOSER', 'PO_RESCAN', 'PO_REPLACE', 'PO_UNDO'].includes(message.type)) return false;
    try {
      if (message.type === 'PO_RESCAN') composer = null;
      const element = findComposer();
      if (message.type === 'PO_GET_COMPOSER' || message.type === 'PO_RESCAN') {
        if (!element) throw new Error(`${site.name} 입력창을 찾지 못했습니다. 입력창을 클릭한 뒤 다시 시도해 주세요.`);
        if (message.type === 'PO_RESCAN') { updateButtons(); queuePosition(); }
        respond({ ok: true, text: readText(element), site: site.model, canUndo: canUndo(element), token: composerToken(element) });
      } else if (message.type === 'PO_REPLACE') {
        if (operation) throw new Error('입력창에서 최적화가 진행 중입니다. 완료 후 다시 시도해 주세요.');
        if (typeof message.token !== 'string' || !message.token) throw new Error('입력창 확인 정보가 없습니다. 현재 입력 내용을 다시 가져와 주세요.');
        respond(replaceGuarded(element, message.text, message.expectedText, message.token, location.href));
      } else respond(undo(message.expectedText, message.token));
    } catch (error) { respond({ ok: false, error: error.message || '입력창과 연결하지 못했습니다.' }); }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applySettings(changes.settings.newValue || { mode: 'default', theme: 'system' });
  });
  chrome.runtime.sendMessage({ type: 'GET_PUBLIC_SETTINGS' }).then(reply => {
    if (reply?.ok && reply.settings && typeof reply.settings === 'object') applySettings(reply.settings, reply.api);
    else applySettings({ ...settings, toolbarEnabled: true });
  }).catch(() => applySettings({ ...settings, toolbarEnabled: true }));
  applySettings(settings);
  scan();
})();



