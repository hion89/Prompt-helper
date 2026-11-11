# Malgyeol Prompt Core — 공개 참고 엔진

말결의 **로컬 프롬프트 구성 엔진**을 읽고 실행하고 수정할 수 있는 독립 JavaScript 예제입니다. 이미 공개된 확장 1.13.1의 로컬 컴파일러를 추출했습니다. **현재 스토어 확장이나 데스크톱 앱 전체의 소스가 아닙니다.** 최신 Gemini 재작성·자동 프로필 생성·개인화·원문 잠금 기능은 포함하지 않습니다.

## 바로 실행하기

Node.js 22 이상과 Git만 필요합니다. npm 패키지 설치, API 키, 계정, 브라우저 권한은 필요 없습니다.

```sh
git clone --depth 1 https://github.com/hion89/Prompt-helper.git
cd Prompt-helper/open-source/prompt-core
npm test
npm run example
```

Windows PowerShell에서도 위 명령을 사용할 수 있습니다. PowerShell 실행 정책이 npm.ps1을 막으면 `npm.cmd test`, `npm.cmd run example`을 사용하세요. Git 없이 받으려면 저장소의 **Code → Download ZIP**을 사용합니다. `--depth 1` 복제는 최신 공개 트리만 받습니다.

```js
import { LocalPromptOptimizer } from './providers/local-optimizer.js';
const optimizer = new LocalPromptOptimizer();
const result = await optimizer.optimize('이 오류의 원인과 수정 방법을 알려줘.', {
  mode: 'precision',
  targetModel: 'chatgpt',
  responseLanguage: 'ko',
});
console.log(result.text);
```

실행은 로컬에서만 이루어지며 HTTP 요청, API 호출, 저장소 접근, 클립보드 접근, 원격 코드 로딩을 하지 않습니다. 출력물을 외부 AI에 붙여 넣는 것은 사용자가 별도로 결정합니다. 프로젝트에 필요한 모듈을 복사해 사용하거나 상대 경로로 import할 수 있습니다. npm 레지스트리에 게시된 패키지는 아닙니다. `private: true`는 실수로 npm에 게시하는 것을 방지하며 MIT 사용 권한을 제한하지 않습니다.

## 구조와 확장 지점

- `core/intent-parser.js`: 키워드 기반 작업·언어 분류. 확정적인 의미 이해가 아닙니다.
- `core/prompt-ir.js`: 원문을 보존하는 중간 표현과 입력 한도(50,000자).
- `core/modes/`: Default·ECO·Precision·Natural의 역사적 규칙.
- `core/adapters/`: 브랜드별 편집 가능한 출력 형식 프리셋.
- `core/languages/`: 한국어·영어·일본어·중국어 안내 문구.
- `core/prompt-builder.js`: 중간 표현 → 모드 → 브랜드 형식 → 언어 → 텍스트.
- `providers/local-optimizer.js`: `optimize(text, settings)` 비동기 인터페이스.
- `tests/`: 원본 회귀 테스트와 독립적인 무네트워크·출처·의미 보존 검증.
- `SOURCE.json`: 원본 공개 커밋, 추출 경로, 각 원본 파일의 SHA-256.

원하는 프롬프트 규칙은 `core/modes/`, 출력 형식은 `core/adapters/profiles.js`에서 변경할 수 있습니다. 사용자 입력을 코드로 평가하거나 원격 모듈을 불러오는 구조는 없습니다. 설정으로 임의 코드를 실행할 수 없습니다.

## 적용 범위와 한계

이 엔진은 원문을 다시 쓰는 LLM이 아니라 **원문을 그대로 포함하고 안내를 덧붙이는 규칙 기반 컴파일러**입니다. 원문 문자열 보존은 최종 AI 답변의 정확성이나 의미 준수를 보장하지 않습니다. 불필요한 안내가 생길 수 있으므로 결과를 검토하세요. 프리셋은 제조사가 검증한 최적 형식이나 모델 아키텍처의 사실을 뜻하지 않습니다. 성능 향상·토큰 절감·AI 문체 제거를 측정하거나 보장하지 않습니다.

- 지원하는 공개 예제 모드는 `default`, `eco`, `precision`, `natural`입니다. 최신 Custom 기능과 ECO의 강한 절약 정책은 포함하지 않습니다.
- `targetModel`은 세부 모델 ID가 아닌 역사적 브랜드 값입니다. `chatgpt`, `claude`, `gemini`, `perplexity` 프리셋은 출력 서식만 바꿉니다. Perplexity 항목은 원본의 역사적 호환성 때문에 남아 있으며 현재 제품 지원을 뜻하지 않습니다.
- 모델 탐색, 최신 Registry 자동 업데이트, API 키 관리, 외부 AI 생성, UI와 브라우저 입력 교체는 제공하지 않습니다.
- 이 공개 예제는 고정된 참고 자료입니다. 최신 제품 변경이 자동으로 동기화되지 않습니다. 기여하려면 Issue/PR에 민감정보 없는 재현 예제를 첨부해 주세요. 수정은 검토 후 반영합니다.

## 재사용 조건

**이 디렉터리의 코드·테스트·예제·문서는 [MIT 라이선스](LICENSE)**로 상업적 사용·수정·재배포할 수 있습니다. 저작권·라이선스 고지를 유지하세요. 이 허가는 저장소의 다른 문서, Registry의 제3자 자료, 로고·상표, 과거 전체 Git 기록이나 비공개 제품 코드에 자동으로 확장되지 않습니다. 말결 이름·로고를 공식 제품처럼 사용하는 권한은 부여하지 않습니다.

보안 제보는 공개 Issue 대신 [보안 안내](../../SECURITY.md)를 확인해 주세요. 비밀키·토큰·사용자 대화·프로필을 이슈나 PR에 올리지 마세요.

---

## English quick guide

This is a self-contained, offline reference compiler extracted from the already-public Malgyeol extension **1.13.1**, not the source of the current extension or desktop app. Node.js 22+ is sufficient; no dependency installation, credentials, API calls, browser permissions or storage access are needed. Run `npm test` and `npm run example` from this directory after a shallow clone.

Use `LocalPromptOptimizer.optimize(text, settings)` or `compilePrompt` from `core/prompt-builder.js`. The compiler keeps the original text and adds heuristic guidance. Its four documented modes and brand formatting presets are historical examples, not validated model-specific optimization claims. Current Custom, stronger ECO, personalization, Gemini rewriting and model discovery are absent. Output quality and token savings are not guaranteed.

Code, tests, examples and documentation **within this directory only** are available under the MIT license. Preserve its notice. Other repository material, third-party Registry content, branding, historical Git objects and private product code are outside this grant. See `SOURCE.json` for exact provenance. Report vulnerabilities privately through `SECURITY.md`; never submit real credentials or personal conversations.
