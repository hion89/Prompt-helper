# 동적 모델 목록과 프로필 운영

## 구현 범위

최적화 실행은 계속 사용자 개인 Gemini 키를 사용합니다. 모델 Registry는 대상 모델 목록과 제한된 최적화 설정만 제공하며, 사용자 원문·Custom 지침·API 키를 받지 않습니다. OpenRouter는 목록 수집과 운영자가 별도로 활성화한 CI 평가 경로이며 확장 사용자의 요청을 중계하지 않습니다. 기존 모드, 키 저장, Undo, 입력창 보호와 미니 도구를 유지합니다.

팝업에서 제공사 → 모델 검색 → 세부 모델을 선택합니다. 마지막 선택을 제공사별로 기억합니다. NEW는 공개 출시일이 아니라 최근 14일 안에 Registry에서 처음 발견한 모델입니다. 목록에서 사라진 선택 ID도 저장해 두고 해당 제공사 공통 프로필을 사용하므로 일시적인 조회 실패로 설정을 잃지 않습니다.

프로필 상태는 다음과 같습니다.

- `fallback`: 문서 기반 기존 규칙 또는 제공사·계열 기본 규칙. 성능 개선을 실측하지 않았습니다.
- `candidate`: 상속 또는 LLM으로 만든 비활성 후보. LLM이 생성했다고 검증된 것이 아닙니다.
- `validated`: 고정된 실제 API 비교 시험과 설정 검증을 통과한 프로필. 다른 모든 작업의 개선을 보장하지 않습니다.
- `deprecated`: 프로필의 지원 종료 기록. 모델 지원 종료와 관측 중단은 별도 필드입니다.

등록된 후보는 스키마가 맞아도 실제 사용에 연결되지 않습니다. 측정 실패·호출 한도·문서 부족이면 마지막 정상 프로필을 유지합니다. 기본 번들의 기존 공식 문서 기반 규칙은 성능 실험을 하지 않았으므로 `fallback`으로 표시합니다.

## 구조와 데이터

`registry/default-registry.json`이 배포할 JSON 원본이고 `registry/registry.schema.json`이 스키마입니다. `shared/registry-seed.js`는 오프라인 초기 실행용으로 자동 생성합니다. 모델을 추가할 때 JS 목록을 직접 수정하지 않습니다.

각 모델은 제공사·ID·표시명·계열·출시일·기능·문맥 한도·프로필 ID와 버전·후보 ID·API 관측·웹 사용 가능 여부·종료 상태·별칭·최초 발견/갱신 시각·출처를 가집니다. 단순 API 생성 시각을 출시일로 바꾸지 않습니다. Anthropic처럼 공식 문서가 `created_at`을 출시 시각이라고 명시하고 epoch sentinel이 아닌 경우만 출시일을 채웁니다. 알 수 없는 값은 `null` 또는 `unknown`입니다. OpenRouter의 문맥 수치는 해당 경로의 메타데이터이며 웹 서비스의 한도나 첫 제공사의 보장을 의미하지 않습니다.

공식 API ID와 제공사 namespace, OpenRouter의 명시적인 `canonical_slug` 및 `alias_target.slug`로 확인되는 별칭을 정리합니다. 모델 이름이 비슷하다는 이유로 다른 스냅샷을 합치지 않습니다. 서로 다른 API ID의 동등성이 확인되지 않으면 별도 항목을 유지합니다. 음성·이미지 전용 항목과 기존 제외 대상 Perplexity는 표시 대상에서 제외합니다. OpenAI 목록에는 모달리티 정보가 없으므로 명시한 텍스트 모델 ID 필터를 쓰며 확인되지 않은 기능을 만들어 넣지 않습니다.

## 공식 확인 경로

2026-10-18에 아래 문서와 공개 응답을 확인했습니다.

| 수집원 | 문서 | 인증·응답 |
| --- | --- | --- |
| OpenAI | [List models](https://developers.openai.com/api/reference/resources/models/methods/list) | Bearer 키, `data[]`, 기본 ID·생성시각·소유자. 문맥 한도를 추측하지 않음 |
| Anthropic | [List Models](https://platform.claude.com/docs/en/api/models/list) | `x-api-key`, `anthropic-version`, `data[]`, `has_more/last_id`, `line`, `max_input_tokens`, `capabilities`, `lifecycle` |
| Google | [Models API](https://ai.google.dev/api/models) | `x-goog-api-key`, `models[]`, `nextPageToken`, `supportedGenerationMethods`, `inputTokenLimit` |
| OpenRouter | [Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) | 공개 GET을 우선 사용하며 키 지정도 가능. `data[]`, `canonical_slug`, `alias_target`, 모달리티·문맥 정보. offset/limit을 생략하면 전체 목록을 받음 |

공식 API는 등록한 운영 계정에서 보이는 모델 목록입니다. 모든 사용자의 API 접근이나 ChatGPT/Claude/Gemini 웹 메뉴 노출을 증명하지 않습니다. 정상 조회에서 누락되면 `not_observed`로 기록하고 삭제하지 않습니다. 제공사의 명시적인 `lifecycle=retired`를 종료 신호로 사용하며, 예정일이 지났다는 사실만으로 종료를 단정하지 않습니다.

## 실행과 게시

로컬에서 저장소 루트가 아닌 `prompt-optimizer` 폴더 기준으로 실행합니다.

```sh
node tools/registry/run.mjs --bundle
node tools/registry/run.mjs
node --test tests/registry.test.js
```

두 번째 명령은 환경에 설정된 운영 키를 사용합니다. 생성·평가 한도가 0인 기본값에서는 모델 목록 조회만 수행합니다. 키가 없는 제공사는 건너뛰고 공개 OpenRouter 조회로 확장할 수 있습니다. 인증 키는 환경 변수/Actions Secrets에만 두며 명령행 인수·JSON·공개 로그에 넣지 않습니다.

`docs/registry`에는 불변 버전 파일과 작은 `manifest.json`을 게시합니다. payload를 먼저 쓰고 manifest를 마지막에 원자적으로 바꿉니다. 이전 파일은 복구용으로 남깁니다. 캐시가 이전 버전으로 되돌아가는 것을 막으므로 복구도 새 Registry 버전으로 게시합니다.

```sh
node tools/registry/publish.mjs --rollback ../docs/registry/registry-이전버전-해시.json
```

실제 파일명을 지정해야 합니다. JS나 환경 변수를 복구 자료로 받지 않습니다.

## GitHub 운영 설정

`.github/workflows/model-registry.yml`은 매일 02:17 UTC(한국 11:17)에 실행합니다. 주기는 해당 파일의 `on.schedule.cron`을 수정합니다. GitHub 스케줄은 지연될 수 있으므로 정확한 시각의 실행을 보장하지 않습니다. 기본 브랜치에 워크플로가 올라가야 예약 실행이 활성화됩니다. Actions에서 수동 실행도 가능합니다.

저장소 Settings → Actions → General에서 이 워크플로의 `contents: write` 사용을 허용하고 Pages 소스를 GitHub Actions로 둡니다. 검증 후 지정한 공개 JSON/자동 생성 seed 파일만 커밋하며 force push하지 않습니다. 새 커밋이 있으면 재사용 Pages 워크플로를 직접 호출합니다. `GITHUB_TOKEN`으로 만든 커밋이 별도 push 워크플로를 다시 시작하지 않는 문제를 이 경로로 피합니다. 보호 브랜치가 bot push를 막으면 기존 원격 목록을 유지하고 작업이 실패하므로 PR 기반 게시로 운영 정책을 조정해야 합니다.

공식 목록을 추가하려면 Settings → Secrets and variables → Actions의 Secrets에 필요한 키만 등록합니다.

- `OPENAI_MODELS_API_KEY`
- `ANTHROPIC_MODELS_API_KEY`
- `GEMINI_MODELS_API_KEY`
- `OPENROUTER_MODELS_API_KEY` (공개 조회가 가능하면 생략)

유료 후보 생성과 실제 평가를 켜려면 추가 Secrets가 필요합니다.

- `PROFILE_GENERATOR_API_KEY`: 운영용 Gemini 키. 확장 사용자의 키를 수집하지 않습니다.
- `OPENROUTER_EVAL_API_KEY`: 고정 시험을 대상 모델에 실행할 운영용 키.

Variables 설정은 다음과 같습니다. 모델 ID는 운영 계정이 실제로 접근할 수 있는 Gemini ID를 지정하세요.

| Variable | 기본값 | 의미 |
| --- | --- | --- |
| `PROFILE_GENERATOR_MODEL` | 미지정 | 후보 생성과 재작성 평가에 사용할 Gemini 모델 |
| `MAX_PROFILE_LLM_CALLS` | 0 | 하루 후보 생성 요청 수. 코드 상한 20 |
| `MAX_PROFILE_COST_USD` | 0 | 후보 생성의 하루 예상 비용 예약 한도. 코드 상한 5달러 |
| `PROFILE_INPUT_USD_PER_MILLION` | 0 | 운영 모델 입력 토큰 단가의 보수적인 상한 |
| `PROFILE_OUTPUT_USD_PER_MILLION` | 0 | 운영 모델 출력 토큰 단가의 보수적인 상한 |
| `MAX_PROFILE_EVALUATION_CALLS` | 0 | 재작성+대상 모델 평가 호출 합계. 한 후보의 완전한 시험에 12회 필요, 코드 상한 20 |
| `MAX_PROFILE_EVALUATION_USD` | 0 | 평가 하루 예상 비용 예약 한도. 코드 상한 5달러 |
| `EVALUATION_INPUT_USD_PER_MILLION` | 0 | 재작성·대상 모델 모두를 포함하는 입력 단가 상한 |
| `EVALUATION_OUTPUT_USD_PER_MILLION` | 0 | 재작성·대상 모델 모두를 포함하는 출력 단가 상한 |

금액은 최신 요금에 맞춰 운영자가 지정하는 예상 비용 제한이며 제공사의 결제 한도를 대신하지 않습니다. 단가가 없으면 생성·평가를 실행하지 않습니다. 요청 전에 한도를 예약하고 실패한 호출도 차감합니다. 자동 재시도하지 않으며 재분석 실패는 7일의 재시도 간격을 둡니다. 공개 문서와 일일 호출 장부는 비밀키가 없는 Actions 캐시에 보관하고 실패하더라도 장부 저장 단계를 실행합니다.

LLM과 평가는 기본적으로 꺼져 있습니다. Secrets를 등록해도 한도와 단가를 명시하지 않으면 요금이 발생하는 생성 요청은 시작하지 않습니다. 메타데이터 자동 탐색과 공통 프로필은 계속 동작합니다.

## 후보 생성과 평가

허용한 공식 호스트의 기존 모델·계열 가이드만 가져오고 공개 문서를 캐시합니다. 등록되지 않은 모델별 가이드 URL을 만들어 검색한 척하지 않습니다. 새 모델 전용 문서가 없으면 제공사 공통 문서와 상속 프로필을 사용합니다. 모델별 차이는 근거가 없으면 만들지 않습니다.

LLM에는 문서를 신뢰할 수 없는 참고 자료로 전달하고 허용된 enum 설정과 짧은 정확한 근거 발췌만 받습니다. 실제 문서에 없는 발췌, 필드 추가, 옵션 변조는 거절합니다. 자유 형식 지시나 소스 코드가 사용자 실행 경로로 전달되지 않습니다. 설정을 재작성 지시로 바꾸는 코드는 전부 확장 내부에 번들됩니다. [Chrome의 원격 호스팅 코드 안내](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)에 따라 JSON 데이터만 동기화합니다.

실제 평가는 한국어 사실 추출·영어 조건 보존·목록 계산의 고정 시험 3개를 기본/후보 프로필 양쪽에서 재작성하고 동일 대상 모델에 실행합니다. 모델 응답 ID와 응답 모델의 일치, 원문 핵심 조건, 작업 성공, JSON 형식, 프롬프트 길이, 제공된 토큰·대상 비용·지연을 기록합니다. 없는 사용량·비용은 `null`이며 추정 측정치로 채우지 않습니다. 후보의 모든 조건 시험 통과와 길이 비열화를 확인하고 후보/기본 프로필 해시가 일치하는 완전한 보고서만 승격합니다. 실제 호출 없는 테스트 fixture는 운영 성능 증거로 게시하지 않습니다.

이 작은 시험은 문학·장문·멀티모달·전문 분야의 전체 성능을 검증하지 않습니다. `validated`는 이 시험의 적합성 결과이고 보편적 최적성이나 개선률이 아닙니다. 운영 보고서는 Actions artifact로 남기고 공개 프로필에는 보고서 해시와 검증 범위만 담습니다.

## 확장 캐시와 장애 대응

시작/팝업 실행에서 캐시를 확인하고 하루가 지났으면 원격 manifest를 확인합니다. 수동 갱신은 1분 간격을 제한하고 실패 후 자동 재조회는 1시간 이상 기다립니다. ETag와 단일 진행 작업으로 중복 다운로드를 줄입니다.

HTTPS 고정 경로, 리다이렉트 금지, SHA-256·크기·버전·Schema·모델/프로필 연결 검사를 통과해야 `chrome.storage.local`에 한 번에 반영합니다. 현재/이전 정상본을 함께 보관합니다. 실패하면 마지막 정상 캐시 → 이전 정상 캐시 → 번들 순으로 사용합니다. 캐시가 있어도 인터넷 없이 Gemini API 최적화를 실행할 수 있다는 뜻은 아닙니다.

SHA-256은 manifest와 payload의 일치 및 손상 검출입니다. 배포 계정 자체가 침해된 경우의 작성자 인증 서명은 아니므로 GitHub 저장소와 Actions 권한을 안전하게 관리해야 합니다. 새 데이터는 다운그레이드하지 않으며 서버 복구도 새 버전으로 게시합니다.

실패 원인은 작업 요약과 `.registry-cache/last-run.json`, 모델 변경 기록, UI의 저장된 목록 안내에서 확인합니다. 프롬프트·키·환경 변수 전체는 로그에 쓰지 않습니다. 프로필 설정 오류나 API 구조 변경은 기존 Registry를 지키고 해당 수집원만 건너뜁니다.
