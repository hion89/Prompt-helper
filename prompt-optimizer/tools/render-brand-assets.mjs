// Render editable brand layouts with Chrome. No external libraries or API calls.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const assets = path.join(root, 'marketing/malgyeol-1.13.0');
const sources = path.join(assets, 'source');
const artifacts = path.join(root, '.test-artifacts');
const iconsOnly = process.argv.includes('--icons-only');
await Promise.all([mkdir(sources, { recursive: true }), mkdir(artifacts, { recursive: true })]);
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="6" y="6" width="116" height="116" rx="32" fill="#204e40"/><path d="M41 32h46a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H60L37 103V88a14 14 0 0 1-10-13V46a14 14 0 0 1 14-14Z" fill="none" stroke="#f8f7ef" stroke-width="6" stroke-linejoin="round"/><g fill="none" stroke="#b9d9bf" stroke-width="5" stroke-linecap="round"><path d="M44 49c12-5 25 5 40 0"/><path d="M44 61c12-5 25 5 40 0"/><path d="M44 73c8-3 15 2 24 0"/></g></svg>`;
await writeFile(path.join(assets, 'malgyeol-icon.svg'), icon);
const iconData = 'data:image/svg+xml;base64,' + Buffer.from(icon).toString('base64');
const frame = (w, h, body, css = '') => `<!doctype html><html lang="ko"><meta charset="utf-8"><title>말결 홍보 자료</title><style>*{box-sizing:border-box}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}body{position:relative;background:#f7f5ed;color:#204e40;font-family:"Malgun Gothic","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}h1,h2,p{margin:0}img{display:block}.wordmark{display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.04em}.wordmark img{width:48px;height:48px}.eyebrow{font:600 13px "Segoe UI",sans-serif;letter-spacing:.18em}.note{font-size:13px;color:#62756b}${css}</style>${body}</html>`;
const wordmark = `<div class="wordmark"><img src="${iconData}" alt=""><span>말결</span></div>`;
const exampleSource = '다음 주 신입 개발자 온보딩 계획 짜줘. 5일 일정이고 하루 2시간, 마지막 날에는 작은 과제를 해보면 좋겠어.';

// Render the actual extension HTML with isolated browser-API fixtures, never a real key.
const stub = `window.__settings={targetModel:'chatgpt',targetVariants:{chatgpt:'gpt-4.1'},mode:'precision',theme:'light',responseLanguage:'ko'};const noop=()=>{};window.chrome={runtime:{id:'brand-preview',getURL:p=>'/'+p,getManifest:()=>({name:'말결',version:'1.13.0'}),sendMessage:async m=>m.type==='MODEL_REGISTRY_STATUS'?{ok:true,registry:await(await fetch('/registry/default-registry.json')).json(),status:{version:3,origin:'bundled'}}:m.type==='API_STATUS'?{ok:true,status:{gemini:{configured:true,granted:true,ready:true,persistent:false}}}:{ok:false},onMessage:{addListener:noop}},storage:{local:{get:async()=>({settings:__settings}),set:async v=>Object.assign(__settings,v.settings)},session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener:noop}},permissions:{onAdded:{addListener:noop},onRemoved:{addListener:noop}},tabs:{query:async()=>[{id:1}],sendMessage:async()=>({ok:true,text:${JSON.stringify(exampleSource)},site:'chatgpt',token:'example',canUndo:false})}};`;
const layouts = new Map();
if (!iconsOnly) {
  const art = 'data:image/png;base64,' + (await readFile(path.join(assets, 'brand-artwork.png'))).toString('base64');
  layouts.set('marquee-promo-1400x560', { w: 1400, h: 560, html: frame(1400, 560,
    `<img class="art" src="${art}" alt=""><div class="fade"></div><div class="copy">${wordmark}<p class="eyebrow">MALGYEOL · AI PROMPT OPTIMIZER</p><h1>내 뜻을 살리는<br>프롬프트.</h1><p class="sub">평소처럼 쓰면, AI 모델에 맞게 다듬어 드려요.</p><p class="brands">ChatGPT · Claude · Gemini</p><p class="note">개인 Gemini API 키 사용 · 결과를 확인한 뒤 직접 적용</p></div>`,
    `.art{position:absolute;width:1020px;height:680px;object-fit:cover;right:-100px;top:-50px}.fade{position:absolute;inset:0;background:linear-gradient(90deg,#f7f5ed 0%,#f7f5ed 33%,rgba(247,245,237,.88) 43%,transparent 66%)}.copy{position:absolute;left:70px;top:46px}.wordmark{font-size:36px}.wordmark img{width:54px;height:54px}.eyebrow{margin-top:28px;color:#688574;font-size:12px}h1{font-size:65px;line-height:1.17;letter-spacing:-.065em;margin-top:16px}.sub{margin-top:23px;font-size:21px;letter-spacing:-.045em}.brands{margin-top:37px;font-size:17px;font-weight:600}.note{margin-top:13px;font-size:12px}`) });
  layouts.set('small-promo-440x280', { w: 440, h: 280, html: frame(440, 280,
    `<img class="art" src="${art}" alt=""><div class="fade"></div><div class="copy">${wordmark}<h1>내 뜻을 살리는<br>프롬프트</h1><p class="sub">AI 모델에 맞춰, 더 명확하게.</p><p class="note">개인 Gemini API 키 사용</p></div>`,
    `.art{position:absolute;right:-128px;top:10px;width:430px;height:287px;object-fit:cover}.fade{position:absolute;inset:0;background:linear-gradient(90deg,#f7f5ed 0%,#f7f5ed 32%,rgba(247,245,237,.85) 50%,transparent 85%)}.copy{position:absolute;left:25px;top:22px}.wordmark{font-size:23px;gap:8px}.wordmark img{width:34px;height:34px}h1{margin-top:23px;font-size:31px;line-height:1.26;letter-spacing:-.065em}.sub{margin-top:16px;font-size:13px;letter-spacing:-.04em}.note{margin-top:23px;font-size:10px}`) });
  const screenBase = `.wordmark{position:absolute;top:40px;left:52px;font-size:28px}.wordmark img{width:42px;height:42px}.kicker{position:absolute;left:54px;top:128px;font-size:13px;letter-spacing:.12em;color:#638371}.intro{position:absolute;left:52px;top:164px;width:615px}.intro h1{font-size:46px;line-height:1.26;letter-spacing:-.065em}.intro>.sub{font-size:18px;color:#65796c;line-height:1.8;margin-top:18px;letter-spacing:-.035em}.cards{margin-top:28px;display:grid;gap:12px}.card{border:1px solid #d9e1d5;background:#fffdf8;border-radius:18px;padding:19px 22px}.card .label{font-size:12px;color:#5b7e69;margin-bottom:8px;font-weight:700}.card p{font-size:16px;line-height:1.75;color:#344c3d;white-space:pre-line}.after{background:#e9f0e5;border-color:#c9d9c6}.mock{position:absolute;right:50px;top:58px;width:454px;padding:12px;border:1px solid #d1dbcf;border-radius:26px;background:#e5eadd;box-shadow:0 18px 44px #204e401a}iframe{display:block;width:430px;height:646px;border:0;border-radius:15px;background:#fff}.foot{position:absolute;bottom:24px;left:54px;right:50px;display:flex;justify-content:space-between;font-size:11px;color:#6e7f70}.chips{display:flex;flex-wrap:wrap;gap:9px}.chip{border:1px solid #c6d7c6;border-radius:99px;padding:8px 13px;font-size:14px;background:#edf3e8;color:#305e43}`;
  const foot = `<div class="foot"><span>개인 Gemini API 키 사용 · 생성 결과는 적용 전 직접 확인하세요.</span><span>설명용 예시 화면 · 실제 API 호출 없음</span></div>`;
  layouts.set('screenshot-01-workflow-1280x800', { w: 1280, h: 800, preview: 'workflow', html: frame(1280, 800,
    `${wordmark}<p class="kicker">01 / 의도는 그대로, 요청은 선명하게</p><div class="intro"><h1>평소처럼 적으면,<br>말결이 다듬어 드려요.</h1><p class="sub">목적과 조건을 읽고, 사용할 AI에 맞는<br>프롬프트로 재작성합니다.</p><div class="cards"><div class="card"><div class="label">내가 쓴 요청</div><p>${exampleSource}</p></div><div class="card after"><div class="label">재작성 방향 예시</div><p>5일 일정 · 하루 2시간 · 마지막 날 실습<br>날짜별 목표와 활동을 표로 정리</p></div></div></div><div class="mock"><iframe src="/popup/popup.html?preview=workflow" title="말결 실제 팝업 예시"></iframe></div>${foot}`, screenBase) });
  layouts.set('screenshot-02-custom-1280x800', { w: 1280, h: 800, preview: 'custom', html: frame(1280, 800,
    `${wordmark}<p class="kicker">02 / 내 방식으로 조합하는 CUSTOM</p><div class="intro"><h1>원하는 말의 결을<br>직접 골라 보세요.</h1><p class="sub">여러 콘셉트를 함께 선택하거나,<br>나만의 최적화 지침을 직접 작성하세요.</p><div class="cards"><div class="card after"><div class="label">자동 CUSTOM · 여러 요소 조합</div><div class="chips"><span class="chip">✓ 정확함</span><span class="chip">✓ 절약</span><span class="chip">✓ 자연스러움</span><span class="chip">✓ 전문성</span><span class="chip">✓ 친근함</span></div></div><div class="card"><div class="label">수동 CUSTOM · 직접 작성</div><p>“핵심 조건을 유지하고, 실무자가 바로 쓸 수<br>있도록 짧고 친근하게 다듬어 줘.”</p></div></div></div><div class="mock"><iframe src="/popup/popup.html?preview=custom" title="말결 Custom 설정 예시"></iframe></div>${foot}`, screenBase) });
  layouts.set('screenshot-03-models-1280x800', { w: 1280, h: 800, preview: 'models', html: frame(1280, 800,
    `${wordmark}<p class="kicker">03 / 제공사부터 세부 모델까지</p><div class="intro"><h1>같은 요청도,<br>쓸 AI에 맞게.</h1><p class="sub">제공사를 고르면 해당 모델만 표시합니다.<br>모델명 검색과 마지막 선택 기억을 지원합니다.</p><div class="cards"><div class="card after"><div class="label">대상 AI · 프롬프트를 사용할 곳</div><p>ChatGPT / OpenAI · Claude · Gemini<br>세부 모델별 지침과 공식 출처 확인</p></div><div class="card"><div class="label">최적화 엔진 · 프롬프트를 만드는 곳</div><p>등록한 개인 Gemini API 키로 실행<br>다른 AI로 메시지를 자동 전송하지 않아요.</p></div></div></div><div class="mock"><iframe src="/popup/popup.html?preview=models" title="말결 모델 선택 예시"></iframe></div>${foot}`, screenBase) });
  for (const [name, item] of layouts) await writeFile(path.join(sources, name + '.html'), item.html.replaceAll(art, '../brand-artwork.png').replaceAll(iconData, '../malgyeol-icon.svg'));
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }); }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); return new CDP(ws); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Timed out: ' + method)); }, 10000); this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
  close() { this.ws.close(); }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/icon') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<style>html,body{margin:0;background:transparent;width:100%;height:100%}svg{width:100%;height:100%;display:block}</style>${icon}`); return; }
    if (url.pathname === '/store-icon') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(frame(128, 128, `<img style="width:112px;height:112px;margin:8px" src="${iconData}" alt="">`)); return; }
    if (url.pathname.startsWith('/layout/')) { const item = layouts.get(url.pathname.slice(8)); if (!item) throw Error('Unknown layout'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(item.html); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('Outside project');
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream';
    res.setHeader('Content-Type', mime + (mime.startsWith('text/') ? '; charset=utf-8' : ''));
    let content = await readFile(file);
    if (file === path.join(root, 'popup/popup.html')) content = content.toString('utf8').replace('<head>', '<head><script>' + stub + '</script>');
    res.end(content);
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = path.join(artifacts, 'brand-browser-' + Date.now());
const browser = spawn(process.env.BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let launchError;
browser.on('error', e => { launchError = e; });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, name) { for (let i = 0; i < 200; i++) { if (launchError) throw launchError; try { const value = await fn(); if (value) return value; } catch {} await wait(50); } throw Error('Timed out: ' + name); }
let controller, page;
try {
  const [port, endpoint] = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'), 'Chrome startup');
  controller = await CDP.connect('ws://127.0.0.1:' + port + endpoint);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  page = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await page.send('Page.enable'); await page.send('Runtime.enable');
  await page.send('Network.enable'); await page.send('Network.setBlockedURLs', { urls: ['https://*', 'http://*.googleapis.com/*'] });
  async function navigate(url, w, h, transparent = false) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 247, g: 245, b: 237, a: transparent ? 0 : 1 } });
    await page.send('Page.navigate', { url });
    await until(() => page.evaluate('document.readyState==="complete" && document.URL===' + JSON.stringify(url)), 'page load');
    await page.evaluate('document.fonts.ready');
    await until(() => page.evaluate('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'), 'images');
  }
  async function saveScreenshot(file, w, h) {
    const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    const png = Buffer.from(shot.data, 'base64'); assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h); await writeFile(file, png); return png;
  }
  for (const size of [16, 32, 48, 128]) { await navigate(base + '/icon', size, size, true); await saveScreenshot(path.join(root, 'assets/icons/icon' + size + '.png'), size, size); }
  await navigate(base + '/store-icon', 128, 128);
  const storeIcon = await saveScreenshot(path.join(assets, 'store-icon-128.png'), 128, 128); assert.equal(storeIcon[25], 2, 'Store icon must be RGB without alpha');
  if (!iconsOnly) for (const [name, item] of layouts) {
    await navigate(base + '/layout/' + name, item.w, item.h);
    if (item.preview) {
      await until(() => page.evaluate('!!document.querySelector("iframe")?.contentDocument?.querySelector("#source") && !document.querySelector("iframe").contentDocument.querySelector("#source").disabled'), 'popup fixture');
      await page.evaluate(`(async()=>{const w=document.querySelector('iframe').contentWindow,d=w.document;d.querySelector('#source').value=${JSON.stringify(exampleSource)};d.querySelector('#source').dispatchEvent(new w.Event('input',{bubbles:true}));${item.preview === 'custom' ? `d.querySelector('input[name=mode][value=custom]').click();await new Promise(r=>setTimeout(r,150));d.querySelector('#custom-options').scrollIntoView({block:'start'});` : item.preview === 'models' ? `d.querySelector('#target-model-search').value='gpt';d.querySelector('#target-model-search').dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('.target-profile').scrollIntoView({block:'start'});` : `d.querySelector('#mode-options').scrollIntoView({block:'start'});`}await d.fonts.ready;return true})()`);
      await wait(180);
      const overflow = await page.evaluate('[...document.querySelectorAll(".intro,.card,.foot,.copy")].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className)');
      assert.deepEqual(overflow, [], name + ' text overflow');
    }
    const png = await saveScreenshot(path.join(assets, name + '.png'), item.w, item.h); assert.equal(png[25], 2, 'Store images must be RGB without alpha');
    console.log('Rendered ' + name + '.png');
  }
  console.log('Rendered Malgyeol icons and ' + (iconsOnly ? 0 : layouts.size) + ' promotional layouts. No live API calls.');
} finally {
  page?.close(); if (controller) { await controller.send('Browser.close').catch(() => {}); controller.close(); } else browser.kill(); server.close();
}
