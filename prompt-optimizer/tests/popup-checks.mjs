import assert from 'node:assert/strict';

export async function runPopupChecks(cdp, compiled) {
  const checks = [];
  const pass = (label) => { checks.push(label); console.log('PASS popup: ' + label); };
  const read = (expression) => cdp.evaluate(expression);
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await read(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Popup condition timed out: ' + expression);
  };
  const setInput = (text) => read(`document.querySelector('#source').value=${JSON.stringify(text)};document.querySelector('#source').dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor('!document.querySelector("#source").disabled');
  assert.equal(await read('document.querySelector("#optimizer-provider")'), null);
  assert.equal(await read('document.querySelector("#provider-badge").textContent'), 'GEMINI API');
  pass('Optimizer engine is fixed to Gemini');
  assert.equal(await read('document.querySelector("#reload-page").hidden'), false);
  await read(`window.__rescans=0;
    chrome.tabs.sendMessage=async (id,m)=>{if(m.type==='PO_RESCAN'){__rescans++;return {ok:true,text:'복구된 입력',site:'chatgpt',token:'rescanned-1',canUndo:false}};return {ok:false,error:'연결 안 됨'}};
    document.querySelector('#reconnect-page').click();`);
  await waitFor('document.querySelector("#page-status").dataset.connected==="true"');
  assert.equal(await read('__rescans'), 1);
  assert.equal(await read('document.querySelector("#reload-page").hidden'), true);
  await read(`chrome.tabs.sendMessage=async()=>({ok:false,error:'입력창을 찾지 못했습니다.'});document.querySelector('#reconnect-page').click();`);
  await waitFor('document.querySelector("#page-status").dataset.connected==="false" && !document.querySelector("#reload-page").hidden');
  await read('window.__reloads=0;document.querySelector("#reload-page").click();');
  await waitFor('__reloads===1');
  assert.equal(await read('__reloadedTab'), 1);
  pass('Input recovery rescans first and exposes explicit page reload after failure');
  assert.equal(await read('document.querySelector("#optimize").disabled'), true);
  await read(`window.__writes=[];window.__sessionWrites=[];window.__removed=[];window.__compilerCalls=0;window.__delay=0;
    chrome.storage.local.set=async v=>{__writes.push(v);Object.assign(__settings,v.settings)};
    chrome.storage.session.set=async v=>{__sessionWrites.push(v)};
    chrome.storage.session.remove=async k=>{__removed.push(k)};
    chrome.runtime.sendMessage=async m=>{__compilerCalls++;await new Promise(r=>setTimeout(r,__delay));return {ok:true,result:__result}};`);
  for (const [selector, value] of [['#target-model', 'claude'], ['#response-language', 'en'], ['#theme', 'dark']]) {
    await read(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)};document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('change',{bubbles:true}));`);
  }
  await read('document.querySelector("input[value=eco]").checked=true;document.querySelector("input[value=eco]").dispatchEvent(new Event("change",{bubbles:true}));');
  await waitFor('__settings.targetModel==="claude" && __settings.responseLanguage==="en" && __settings.mode==="eco" && __settings.theme==="dark"');
  assert.equal(await read('document.documentElement.dataset.theme'), 'dark');
  assert.equal(await read('document.querySelectorAll("input[name=mode]:checked").length'), 1);
  pass('AI, response language, mode and theme persist; mode is exclusive');

  assert.equal(await read('document.querySelector("#toolbar-enabled").checked'), true);
  await read('document.querySelector("#toolbar-enabled").click();');
  await waitFor('__settings.toolbarEnabled===false');
  await read('document.querySelector("#toolbar-enabled").click();');
  await waitFor('__settings.toolbarEnabled===true');
  pass('Page mini toolbar visibility persists and can be re-enabled');

  await setInput('이 코드 왜 안되는지 분석해줘');
  await read('document.querySelector("#optimize").click();document.querySelector("#optimize").click();');
  await waitFor('document.querySelector("#output").value.length>0');
  assert.equal(await read('document.querySelector("#output").value'), compiled.text);
  assert.equal(await read('__compilerCalls'), 1);
  assert.equal(await read('document.querySelector("#copy").disabled'), false);
  assert.equal(await read('__writes.every(v=>Object.keys(v).length===1 && !!v.settings && !("source" in v.settings) && !("output" in v.settings))'), true);
  await waitFor('__sessionWrites.some(v=>Object.values(v).some(x=>x.source && x.output))');
  pass('Optimize compiles once and keeps prompt drafts in session storage only');

  await read('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copied=text;await new Promise(r=>setTimeout(r,30))}}});document.querySelector("#copy").click();document.querySelector("#copy").click();');
  await waitFor('!document.querySelector("#copy").disabled');
  assert.equal(await read('__copied'), compiled.text);
  pass('Copy writes the optimized text');

  await read('window.__delay=150;document.querySelector("#optimize").click();');
  assert.equal(await read('document.querySelector("#optimize").dataset.loading'), 'true');
  await setInput('아직 작성 중인 새로운 요청');
  await waitFor('document.querySelector("#optimize").dataset.loading==="false"');
  assert.equal(await read('document.querySelector("#source").value'), '아직 작성 중인 새로운 요청');
  assert.equal(await read('document.querySelector("#output").value'), '');
  assert.equal(await read('document.querySelector("#copy").disabled'), true);
  pass('An obsolete async result cannot replace a newer draft');

  await setInput('a'.repeat(12_001));
  assert.equal(await read('document.querySelector("#optimize").disabled'), true);
  assert.equal(await read('document.querySelector("#source").value.length'), 12_001);
  assert.equal(await read('document.querySelector("#source").getAttribute("aria-invalid")'), 'true');
  pass('Oversized requests are rejected without silently truncating text');

  await read(`window.__delay=0;window.__page={text:'페이지에 쓴 요청',site:'chatgpt',token:'composer-1',canUndo:false};window.__pageCalls=[];window.__original='';
    chrome.tabs.sendMessage=async (id,m)=>{
      __pageCalls.push({id,...m});
      if(m.type==='PO_GET_COMPOSER') return {ok:true,...__page};
      if(m.token!==__page.token || m.expectedText!==__page.text) return {ok:false,error:'페이지 입력이 바뀌었습니다.'};
      if(m.type==='PO_REPLACE'){__original=__page.text;__page.text=m.text;__page.canUndo=true;return {ok:true}};
      if(m.type==='PO_UNDO'){__page.text=__original;__page.canUndo=false;return {ok:true}};
      return {ok:false,error:'Unexpected message'};
    };
    document.querySelector('#import-page').click();`);
  await waitFor('document.querySelector("#source").value==="페이지에 쓴 요청"');
  await read('document.querySelector("#optimize").click();');
  await waitFor('document.querySelector("#output").value.length>0 && !document.querySelector("#replace").disabled');
  await read('document.querySelector("#replace").click();document.querySelector("#replace").click();');
  await waitFor('!document.querySelector("#undo").hidden && !document.querySelector("#undo").disabled');
  assert.equal(await read('__page.text'), compiled.text);
  assert.equal(await read('__pageCalls.filter(x=>x.type==="PO_REPLACE").length'), 1);
  assert.equal(await read('__pageCalls.find(x=>x.type==="PO_REPLACE").expectedText'), '페이지에 쓴 요청');
  assert.equal(await read('__pageCalls.find(x=>x.type==="PO_REPLACE").token'), 'composer-1');
  assert.equal(await read('__submitted+__keydown'), 0);
  await read('document.querySelector("#undo").click();');
  await waitFor('__page.text==="페이지에 쓴 요청" && document.querySelector("#undo").hidden');
  pass('Explicit import, replacement and Undo use composer tokens without sending');

  await read('__page.text="페이지에서 새로 작성한 내용";document.querySelector("#replace").click();');
  await waitFor('document.querySelector("#feedback").dataset.kind==="error"');
  assert.equal(await read('__page.text'), '페이지에서 새로 작성한 내용');
  assert.equal(await read('document.querySelector("#replace").disabled'), true);
  pass('A stale replacement preserves the page edit and requires another import');

  await read('document.querySelector("#reset").click();');
  assert.equal(await read('document.querySelector("#source").value+document.querySelector("#output").value'), '');
  await waitFor('__removed.length>0');
  assert.equal(await read('document.querySelector("#optimize").disabled'), true);
  pass('Reset clears the popup and its session draft');

  // Restore a useful, neutral state for the caller screenshot.
  await read('document.querySelector("#theme").value="light";document.querySelector("#theme").dispatchEvent(new Event("change",{bubbles:true}));');
  await setInput('이 코드 왜 안되는지 분석해줘');
  await read('document.querySelector("#optimize").click();');
  await waitFor('document.querySelector("#output").value.length>0');
  await read('document.querySelector("#workspace").scrollTop=0;');
  return { passed: checks.length, checks };
}
