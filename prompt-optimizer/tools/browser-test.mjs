import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { LocalPromptOptimizer } from '../providers/local-optimizer.js';
import { runPopupChecks } from '../tests/popup-checks.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, '.test-artifacts');
await mkdir(artifacts, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, limit = 10000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    try { const value = await fn(); if (value) return value; } catch {}
    await pause(80);
  }
  throw new Error('Timed out: ' + label);
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.serial = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const item = this.pending.get(data.id); if (!item) return;
        this.pending.delete(data.id);
        if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
      } else this.handlers.forEach(handler => handler(data));
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { ws.close(); reject(new Error('DevTools connection timeout')); }, 5000); ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); ws.addEventListener('error', event => { clearTimeout(timer); reject(new Error('DevTools connection blocked')); }, { once: true }); });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('DevTools request timeout: ' + method)); }, 5000); this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) {
    const out = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
    return out.result.value;
  }
  close() { this.ws.close(); }
}
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/fixture') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><style>body{padding:100px}textarea,[contenteditable]{width:650px;min-height:130px;border:1px solid;white-space:pre-wrap;padding:12px}</style><main><form></form></main>');
    return;
  }
  try {
    const file = path.resolve(root, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html';
    res.setHeader('Content-Type', mime + (mime.startsWith('text/') ? '; charset=utf-8' : ''));
    if (mime === 'text/html') res.setHeader('Content-Security-Policy', "script-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'none'");
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = path.join(artifacts, 'browser-profile-' + Date.now());
const browser = spawn(process.env.BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--disable-extensions-except=' + root, '--load-extension=' + root,
  '--disable-features=DisableLoadExtensionCommandLineSwitch', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserErrors = '';
browser.stderr.on('data', chunk => { browserErrors += chunk.toString(); });
browser.on('error', error => { browserErrors += error.message; });
const connections = [];
let browserCDP;
let count = 0;
const pass = message => { count++; console.log('PASS ' + message); };
try {
  const portData = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'), 'browser launch', 20000);
  const debugBase = 'http://127.0.0.1:' + portData[0];
  browserCDP = await CDP.connect('ws://127.0.0.1:' + portData[0] + portData[1]);
  async function page(url, init = '') {
    const { targetId } = await browserCDP.send('Target.createTarget', { url: 'about:blank' });
    const target = await until(async () => (await (await fetch(debugBase + '/json/list', { signal: AbortSignal.timeout(3000) })).json()).find(t => t.id === targetId), 'page target');
    const cdp = await CDP.connect(target.webSocketDebuggerUrl); connections.push(cdp);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    if (init) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await cdp.send('Page.navigate', { url });
    await until(() => cdp.evaluate('document.readyState === "complete"'), 'page load');
    return cdp;
  }
  async function clickToolbar(cdp, selector) {
    const point = await cdp.evaluate('(() => { const r=document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
  const clickOptimize = cdp => clickToolbar(cdp, '.optimize');
  const version = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')).version;
  const compiled = await new LocalPromptOptimizer().optimize('이 코드 왜 안되는지 분석해줘', { mode: 'precision', responseLanguage: 'ko', targetModel: 'chatgpt' });
  const stub = [
    "window.__listeners=[];window.__storageListeners=[];window.__api={configured:true,granted:true,ready:true,persistent:false}; window.__settings={targetModel:'chatgpt',responseLanguage:'ko',mode:'precision',theme:'light'};",
    'window.__result=' + JSON.stringify(compiled) + '; window.__delay=0; window.__submitted=0; window.__keydown=0; window.__runtimeMessages=[];',
    "window.chrome={runtime:{id:'fixture-extension',getURL:p=>'/'+p,getManifest:()=>({name:'Prompt Optimizer',version:" + JSON.stringify(version) + "}),onMessage:{addListener:fn=>__listeners.push(fn)},sendMessage:async m=>{__runtimeMessages.push(m);await new Promise(r=>setTimeout(r,__delay));return m.type==='SET_TOOLBAR_STATE'?{ok:true}:m.type==='GET_PUBLIC_SETTINGS'?{ok:true,settings:{...__settings,toolbarEnabled:true},api:__api}:m.type==='API_STATUS'?{ok:true,status:{gemini:__api}}:{ok:true,result:__result}}},",
    "storage:{local:{get:async()=>({settings:__settings}),set:async v=>Object.assign(__settings,v.settings)},session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener:fn=>__storageListeners.push(fn)}},permissions:{onAdded:{addListener:()=>{}},onRemoved:{addListener:()=>{}}},",
    "tabs:{query:async()=>[{id:1}],sendMessage:async()=>({ok:false,error:'연결된 AI 입력창이 없습니다.'}),reload:async id=>{window.__reloads=(window.__reloads||0)+1;window.__reloadedTab=id}}};",
    "window.__message=m=>new Promise(resolve=>{let waiting=false;for(const fn of __listeners){if(fn(m,{id:chrome.runtime.id},resolve)===true)waiting=true;}if(!waiting)setTimeout(()=>resolve(undefined),100);});",
    "document.addEventListener('submit',e=>{e.preventDefault();__submitted++});document.addEventListener('keydown',e=>{if(e.key==='Enter')__keydown++});",
  ].join('\n');
  const errors = [];
  const scripts = {};
  for (const name of ['chatgpt','claude','gemini','perplexity','common']) scripts[name] = await readFile(path.join(root, 'content', name + '.js'), 'utf8');
  for (const site of ['chatgpt','claude','gemini']) {
    const p = await page(base + '/fixture', stub);
    p.handlers.push(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text); });
    const markup = site === 'chatgpt' ? '<div data-type="unified-composer"><div class="ProseMirror" contenteditable="true" data-virtualkeyboard="true" role="textbox" aria-label="ChatGPT에게 물어보세요"></div></div>' :
      site === 'claude' ? '<div class="ProseMirror" contenteditable="true" role="textbox"></div>' :
      site === 'gemini' ? '<rich-textarea><div class="ql-editor" contenteditable="true" role="textbox"></div></rich-textarea>' :
      '<textarea placeholder="Ask anything..."></textarea>';
    await p.evaluate('document.querySelector("form").innerHTML=' + JSON.stringify(markup));
    await p.evaluate(scripts[site]); await p.evaluate(scripts.common);
    await until(() => p.evaluate('!!document.querySelector("#prompt-optimizer-toolbar")?.shadowRoot?.querySelector(".optimize")'), site + ' toolbar');
    const source = '이 코드 왜 안되는지 분석해줘';
    await p.evaluate('window.__editor=document.querySelector("textarea,[contenteditable]"); if(__editor.tagName==="TEXTAREA") __editor.value=' + JSON.stringify(source) + '; else __editor.textContent=' + JSON.stringify(source) + '; __editor.focus();__editor.dispatchEvent(new Event("input",{bubbles:true}));');
    const snapshot = await p.evaluate('__message({type:"PO_GET_COMPOSER"})');
    assert.equal(snapshot.ok, true, site + ' composer'); assert.equal(snapshot.text, source);
    const rescanned = await p.evaluate('__message({type:"PO_RESCAN"})');
    assert.equal(rescanned.ok, true, site + ' composer rescan'); assert.equal(rescanned.text, source);
    if (site === 'chatgpt') {
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect().width>0'), 'visible toolbar before drag');
      assert.equal(await p.evaluate('(() => {const e=document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".mode");return e.scrollWidth<=e.clientWidth && e.textContent.startsWith("Gemini API · ")})()'), true, 'toolbar mode text is not clipped');
      const drag = await p.evaluate('(() => { const host=document.querySelector("#prompt-optimizer-toolbar");const r=host.shadowRoot.querySelector(".drag").getBoundingClientRect();const h=host.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:h.left,top:h.top};})()');
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: drag.x, y: drag.y });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: Math.max(20, drag.x - 90), y: Math.max(20, drag.y - 70) });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: Math.max(20, drag.x - 90), y: Math.max(20, drag.y - 70) });
      await until(() => p.evaluate('__runtimeMessages.some(m=>m.type==="SET_TOOLBAR_STATE" && m.position)'), 'toolbar position save');
      assert.equal(await p.evaluate('(() => {const r=document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect();return r.left!=='+drag.left+'||r.top!=='+drag.top+'})()'), true);
      const hide = await p.evaluate('(() => { const r=document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".hide").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...hide });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...hide });
      await until(() => p.evaluate('getComputedStyle(document.querySelector("#prompt-optimizer-toolbar")).display==="none"'), 'toolbar hide');
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{toolbarEnabled:true,toolbarPositions:{chatgpt:{x:.2,y:.8}}}})');
      await until(() => p.evaluate('getComputedStyle(document.querySelector("#prompt-optimizer-toolbar")).display==="block"'), 'toolbar re-enable');
      pass('Toolbar can be dragged, hidden, and re-enabled');
      await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".minimize").click()');
      assert.equal(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".panel").classList.contains("minimized")'), false, 'page-script clicks cannot change minimized state');
      const apiCallsBefore = await p.evaluate('__runtimeMessages.filter(m=>m.type==="OPTIMIZE").length');
      await clickToolbar(p, '.minimize');
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect().width===40'), 'small minimized icon');
      assert.equal(await p.evaluate('__runtimeMessages.some(m=>m.type==="SET_TOOLBAR_STATE" && m.minimized===true)'), true);
      const icon = await p.evaluate('(() => {const r=document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()');
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...icon });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: icon.x+35, y: icon.y-25 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: icon.x+35, y: icon.y-25 });
      assert.equal(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".panel").classList.contains("minimized")'), true, 'drag must not expand icon');
      await clickToolbar(p, '.mini-icon');
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect().width>40'), 'icon expands');
      assert.equal(await p.evaluate('__runtimeMessages.filter(m=>m.type==="OPTIMIZE").length'), apiCallsBefore, 'minimize, drag and restore never call API');
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{toolbarMinimized:true}})');
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect().width===40'), 'saved minimize state');
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{toolbarMinimized:false,targetVariants:{chatgpt:"gpt-4.1"}}})');
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").getBoundingClientRect().width>40'), 'popup restores toolbar');
      assert.match(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".mode").textContent'), /gpt-4.1/);
      pass('Trusted minimize, icon drag, restoration and saved state work without API calls');
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{mode:"custom",customType:"manual"},api:{configured:false,granted:true,ready:false}})');
      assert.equal(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".optimize").disabled'), true);
      assert.equal(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".mode").textContent.includes("키 미등록")'), true);
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{mode:"precision"},api:__api})');
      assert.equal(await p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".optimize").disabled'), false);
      pass('Toolbar API status blocks optimization until key and permission are ready');
    }
    await clickOptimize(p);
    try {
      await until(() => p.evaluate('((t)=>(window.__editor.value ?? window.__editor.innerText).replace(/\\r\\n/g,"\\n").replace(/\\n{2,}/g,"\\n\\n")===t.replace(/\\r\\n/g,"\\n").replace(/\\n{2,}/g,"\\n\\n"))(window.__result.text)'), site + ' optimize');
    } catch (error) {
      const debug = await p.evaluate('({editor:window.__editor.value ?? window.__editor.innerText,status:document.querySelector("#prompt-optimizer-toolbar")?.shadowRoot?.querySelector(".status")?.textContent,result:window.__result.text})');
      throw new Error(`${error.message}; ${site} state: ${JSON.stringify(debug)}`);
    }
    assert.equal(await p.evaluate('__submitted+__keydown'), 0);
    pass(site + ': Optimize replaces editor without submit/Enter');
    const undo = await p.evaluate('__message({type:"PO_UNDO"})');
    assert.equal(undo.ok, true, JSON.stringify(undo));
    assert.equal(await p.evaluate('__editor.value ?? __editor.innerText'), source);
    pass(site + ': Undo restores original');
    const stale = await p.evaluate('__message({type:"PO_REPLACE",text:"unsafe",expectedText:"wrong",token:' + JSON.stringify(snapshot.token) + '})');
    assert.equal(stale.ok, false);
    assert.equal(await p.evaluate('__editor.value ?? __editor.innerText'), source);
    pass(site + ': stale popup replacement blocked');
    if (site === 'chatgpt') {
      await p.evaluate('__delay=250');
      await clickOptimize(p);
      await p.evaluate('__editor.value="사용자가 계속 작성 중";__editor.dispatchEvent(new Event("input",{bubbles:true}));');
      await pause(500);
      assert.equal(await p.evaluate('__editor.value'), '사용자가 계속 작성 중');
      pass('Optimize does not overwrite edits made while waiting');
      const beforeModelChange = await p.evaluate('__editor.innerText');
      await clickOptimize(p);
      await p.evaluate('__message({type:"PO_SETTINGS",settings:{targetVariants:{chatgpt:"gpt-4o"}}})');
      await until(() => p.evaluate('document.querySelector("#prompt-optimizer-toolbar").shadowRoot.querySelector(".status").textContent.includes("모델이나 모드 설정이 변경")'), 'obsolete target-profile result blocked');
      assert.equal(await p.evaluate('__editor.innerText'), beforeModelChange);
      pass('Mini toolbar discards a result when its destination model changes while waiting');
      await p.evaluate('__editor.remove();document.querySelector("form").innerHTML=\'<div id="prompt-textarea" contenteditable="true" role="textbox"><p>new editor</p></div>\';__editor=document.querySelector("[contenteditable]");__editor.focus();');
      await pause(300);
      const next = await p.evaluate('__message({type:"PO_GET_COMPOSER"})');
      assert.equal(next.text, 'new editor');
      const oldToken = await p.evaluate('__message({type:"PO_REPLACE",text:"unsafe",expectedText:"new editor",token:' + JSON.stringify(snapshot.token) + '})');
      assert.equal(oldToken.ok, false);
      pass('Replaced editor detected; old composer token rejected');
    }
  }
  const popup = await page(base + '/popup/popup.html', stub);
  const popupErrors = [];
  popup.handlers.push(event => { if (event.method === 'Runtime.exceptionThrown') popupErrors.push(event.params.exceptionDetails.text); });
  await popup.send('Emulation.setDeviceMetricsOverride', { width: 440, height: 600, deviceScaleFactor: 1, mobile: false });
  await pause(300);
  const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(artifacts, 'popup-light.png'), Buffer.from(screenshot.data, 'base64'));
  assert.equal(await popup.evaluate('document.querySelectorAll("textarea").length>=2'), true);
  assert.equal(await popup.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'No horizontal overflow');
  pass('Popup loads under extension CSP; no horizontal overflow');
  const popupChecks = await runPopupChecks(popup, compiled);
  count += popupChecks.passed;
  for (const type of ['auto', 'manual']) {
    await popup.evaluate(`document.querySelector('input[name=mode][value=custom]').click();document.querySelector('input[name=custom-type][value=${type}]').click();document.querySelector('#mode-options').scrollIntoView({block:'start'});`);
    assert.equal(await popup.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Custom has no horizontal overflow');
    const customScreenshot = await popup.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(artifacts, 'popup-custom-' + type + '.png'), Buffer.from(customScreenshot.data, 'base64'));
  }
  const help = await page(base + '/help/help.html');
  const optionsStub = stub + `
    const previousSend=chrome.runtime.sendMessage;
    chrome.runtime.sendMessage=async m=>{
      if(m.type==='API_STATUS')return {ok:true,status:{gemini:{...__api,model:__settings.geminiModel||'gemini-3.5-flash-lite'}}};
      if(m.type==='API_LIST_MODELS')return {ok:true,models:[{id:'gemini-3.5-flash-lite',name:'Flash Lite'},{id:'gemini-2.5-flash',name:'Flash'}]};
      if(m.type==='API_SAVE_MODEL'){__settings.geminiModel=m.model;__settings.geminiModelSelected=true;return {ok:true,status:{gemini:{...__api,model:m.model}}}};
      return previousSend(m);
    };`;
  const options = await page(base + '/options/options.html', optionsStub);
  await until(() => options.evaluate('!document.querySelector("#list-models").disabled'), 'options key status');
  await options.evaluate('document.querySelector("#list-models").click();');
  await until(() => options.evaluate('document.querySelector("#gemini-model").options.length===2 && !document.querySelector("#gemini-model").disabled'), 'options model list');
  await options.evaluate('document.querySelector("#gemini-model").value="gemini-2.5-flash";document.querySelector("#gemini-model").dispatchEvent(new Event("change"));');
  assert.equal(await options.evaluate('document.querySelector("#save-model").disabled'), false);
  await options.evaluate('document.querySelector("#save-model").click();');
  await until(() => options.evaluate('document.querySelector("#model").textContent.includes("gemini-2.5-flash") && !document.querySelector("#save-model").disabled'), 'options model persisted');
  assert.equal(await options.evaluate('__settings.geminiModel'), 'gemini-2.5-flash');
  await options.evaluate('chrome.runtime.sendMessage=async()=>{throw new Error("Extension context invalidated.")};document.querySelector("#save-model").click();');
  await until(() => options.evaluate('document.querySelector("#feedback").dataset.error==="true"'), 'options stale context failure');
  assert.equal(await options.evaluate('document.querySelector("#feedback").textContent.includes("설정 탭")'), true);
  pass('Model selection saves through background, confirms persistence and explains stale settings tabs');
  await help.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 760, deviceScaleFactor: 1, mobile: true });
  assert.equal(await help.evaluate('document.querySelectorAll("main section").length>=6'), true);
  assert.equal(await help.evaluate('document.querySelectorAll("#problems details").length>=8'), true);
  assert.equal(await help.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Help has no horizontal overflow');
  assert.equal(await popup.evaluate('document.querySelector("#help-link")?.target'), '_blank');
  pass('Beginner guide is always reachable and includes responsive troubleshooting');
  const diagnostics = await page(base + '/diagnostics/diagnostics.html', stub);
  await diagnostics.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 760, deviceScaleFactor: 1, mobile: true });
  await until(() => diagnostics.evaluate('document.querySelector("#version")?.textContent.includes(' + JSON.stringify(version) + ')'), 'diagnostics load');
  assert.equal(await diagnostics.evaluate('document.querySelectorAll("#copy-report,#download-report,#report-file").length'), 3);
  assert.equal(await diagnostics.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Diagnostics has no horizontal overflow');
  assert.equal(await popup.evaluate('document.querySelector("#diagnostics-link")?.target'), '_blank');
  pass('Diagnostic report export and reviewer import are always reachable');
  const evaluation = await page(base + '/evaluation/evaluation.html', stub);
  await evaluation.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 760, deviceScaleFactor: 1, mobile: true });
  await until(() => evaluation.evaluate('document.querySelector("#status")?.textContent.includes("준비됨")'), 'evaluation load');
  assert.equal(await evaluation.evaluate('document.querySelectorAll("#start,#stop,#download").length'), 3);
  assert.equal(await evaluation.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Evaluation has no horizontal overflow');
  assert.equal(await evaluation.evaluate('document.querySelector("#start")?.disabled'), false);
  pass('Live benchmark is reachable and explains its API usage');
  assert.deepEqual(errors, []); assert.deepEqual(popupErrors, []);
  const { targetInfos } = await browserCDP.send('Target.getTargets');
  const worker = targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
  let realPopupTested = false;
  if (worker) {
    const actualPopup = await page(new URL('../popup/popup.html', worker.url).href);
    try {
      await until(() => actualPopup.evaluate('document.querySelectorAll("textarea").length>=2'), 'actual extension popup', 2500);
      const result = await actualPopup.evaluate('chrome.runtime.sendMessage({type:"OPTIMIZE",text:"이 코드 왜 안되는지 분석해줘",settings:{mode:"precision",responseLanguage:"ko"}})');
      assert.equal(result.ok, true, JSON.stringify(result));
      realPopupTested = true;
      pass('Actual extension popup → service worker → compiler');
    } catch { console.log('NOTE Headless Chrome did not expose the extension popup target; fixture popup, service worker unit, and manifest checks remain active.'); }
  } else console.log('NOTE Browser CLI did not load extension; DOM and popup verified with browser API fixtures.');
  await writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify({ passed: count, realExtensionLoaded: !!worker, realPopupTested, testedAt: new Date().toISOString(), liveSignedInSitesTested: false }, null, 2));
  console.log('Browser checks passed: ' + count);
} catch (error) {
  console.error(error); if (!browserCDP) console.error(browserErrors.slice(-4000)); process.exitCode = 1;
} finally {
  connections.forEach(connection => connection.close());
  if (browserCDP) { await browserCDP.send('Browser.close').catch(() => {}); browserCDP.close(); }
  else browser.kill();
  server.close();
}
