import { API_PROVIDERS } from '../providers/remote-optimizer.js';
import { sanitizeDiagnosticMessage } from '../shared/diagnostics.js';
const $ = id => document.getElementById(id);
const provider = 'gemini';
let status = {}, busy = false, currentModel = API_PROVIDERS.gemini.model;
let listedModels = [];
function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').dataset.error = String(error); }
function errorText(error) {
  const message = error?.message || '설정을 처리하지 못했습니다.';
  if (/context invalidated|receiving end|message port|closed before/i.test(message)) return '확장 프로그램이 업데이트되어 이 설정 탭의 연결이 끊겼습니다. 이 탭을 닫고 확장 팝업에서 API 설정을 다시 열어 주세요.';
  return sanitizeDiagnosticMessage(message);
}
function paint() {
  $('model').textContent = '사용 모델: ' + currentModel;
  $('billing').textContent = '무료 등급 프로젝트에서 지원 한도 내로 이용할 수 있습니다. 유료 프로젝트의 키는 해당 요금이 적용됩니다. 무료 등급 입력·응답은 Google 제품 개선에 사용될 수 있으므로 제공업체 정책을 확인하세요.';
  $('key-link').href = 'https://aistudio.google.com/apikey';
  $('pricing-link').href = 'https://ai.google.dev/gemini-api/docs/pricing';
  const saved = status[provider];
  $('key-status').textContent = saved?.configured ? '키 등록됨 · ' + (saved.persistent ? '브라우저에 저장' : '이번 브라우저 세션 동안 저장') : '등록된 키 없음';
  $('delete').disabled = busy || !saved?.configured;
  $('save').disabled = busy;
  $('api-key').disabled = busy;
  $('remember').disabled = busy;
  $('list-models').disabled = busy || !saved?.configured;
  $('gemini-model').disabled = busy || !listedModels.length;
  $('save-model').disabled = busy || !listedModels.some(item => item.id === $('gemini-model').value);
  const selected = $('gemini-model').value;
  $('model-selection').textContent = !listedModels.length ? '모델 목록을 조회하면 저장할 모델을 선택할 수 있습니다.' : !selected ? '모델을 선택해 주세요.' : selected === currentModel ? '현재 저장된 모델입니다. 같은 모델도 다시 저장할 수 있습니다.' : '선택 중: ' + selected + ' · 아래 저장 버튼을 눌러야 적용됩니다.';
}
async function request(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply?.ok) throw new Error(reply?.error || '설정을 처리하지 못했습니다.');
  status = reply.status || status;
  if (typeof status.gemini?.model === 'string') currentModel = status.gemini.model;
  paint();
  return reply;
}
$('gemini-model').addEventListener('change', paint);
$('list-models').addEventListener('click', async () => {
  if (busy) return;
  busy = true; paint(); feedback('Gemini 모델 목록을 조회하고 있습니다.');
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'API_LIST_MODELS', provider: 'gemini' });
    if (!reply?.ok) throw new Error(reply?.error || '모델 목록을 조회하지 못했습니다.');
    listedModels = Array.isArray(reply.models) ? reply.models : [];
    const select = $('gemini-model');
    select.replaceChildren();
    if (!listedModels.length) {
      select.add(new Option('생성 가능한 Gemini 모델이 조회되지 않았습니다.', ''));
      feedback('이 키에서 generateContent를 지원하는 Gemini 모델이 조회되지 않았습니다. 프로젝트와 키를 확인해 주세요.', true);
    } else {
      for (const item of listedModels) select.add(new Option(item.name + ' (' + item.id + ')', item.id));
      if (listedModels.some(item => item.id === currentModel)) {
        select.value = currentModel;
        feedback('현재 모델을 목록에서 확인했습니다. 다른 모델을 선택하면 저장 버튼을 누르세요.');
      } else {
        select.add(new Option('모델을 선택해 주세요. 현재 모델은 이 목록에 없습니다.', ''), 0);
        select.value = '';
        feedback('현재 모델 ' + currentModel + '은(는) 이 키의 목록에 없습니다. 모델을 선택해 저장하세요.', true);
      }
    }
  } catch (error) { listedModels = []; feedback(errorText(error), true); }
  finally { busy = false; paint(); }
});
$('save-model').addEventListener('click', async () => {
  if (busy) return;
  const model = $('gemini-model').value;
  if (!listedModels.some(item => item.id === model)) return;
  busy = true; paint();
  try {
    const reply = await request({ type: 'API_SAVE_MODEL', provider, model });
    if (reply.status?.gemini?.model !== model) throw new Error('선택한 모델의 저장 결과를 확인하지 못했습니다. API 설정을 다시 열어 확인해 주세요.');
    feedback(model + '을(를) 사용할 모델로 저장했습니다. 이제 팝업에서 Gemini API로 최적화해 보세요.');
  } catch (error) { feedback('모델 저장 실패: ' + errorText(error), true); }
  finally { busy = false; paint(); }
});
$('key-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const key = $('api-key').value.trim(), persistent = $('remember').checked;
  if (!/^[\x21-\x7e]{10,512}$/.test(key)) return feedback('올바른 API 키를 공백 없이 입력해 주세요.', true);
  // Request in the user's click gesture, before any asynchronous work.
  const permission = chrome.permissions.request({ origins: [API_PROVIDERS[provider].origin] });
  busy = true; paint(); feedback('');
  try {
    if (!await permission) throw new Error('API 연결 권한이 허용되지 않았습니다. 키는 저장하지 않았습니다.');
    await request({ type: 'API_SAVE_KEY', provider, key, persistent });
    $('api-key').value = '';
    listedModels = [];
    feedback('Gemini API 키를 저장했습니다. 실제 인증은 모델 조회 또는 Optimize 시 확인됩니다.');
  } catch (error) { feedback(errorText(error), true); }
  finally { busy = false; paint(); }
});
$('delete').addEventListener('click', async () => {
  if (busy) return;
  busy = true; paint();
  try { await request({ type: 'API_DELETE_KEY', provider }); listedModels = []; $('api-key').value = ''; feedback('등록된 Gemini API 키를 삭제했습니다.'); }
  catch (error) { feedback(errorText(error), true); }
  finally { busy = false; paint(); }
});
paint();
request({ type: 'API_STATUS' }).catch(error => feedback(errorText(error), true));
