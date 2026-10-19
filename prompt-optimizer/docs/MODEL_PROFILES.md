# 대상 모델별 최적화 지침

이 문서는 1.11.0 초기 번들 규칙의 출처 기록입니다. 1.12.0의 목록·캐시·자동 후보 생성·검증 운영은 [동적 Registry 안내](DYNAMIC_REGISTRY.md)를 따릅니다. 지시문 생성 코드는 `shared/profile-rules.js`에 유지하고 모델 데이터는 Registry로 분리했습니다.

문서 확인일: 2026-10-18. 프로필 리비전: `2026-10-18.1`.

Gemini API가 원문을 재작성할 때 아래 지침을 적용합니다. 이는 공개 지침을 제품에 적용한 설계이며 비공개 아키텍처나 세부 버전별 우열을 추측하지 않습니다. 같은 계열에 별도 근거가 없는 경우 같은 규칙을 공유합니다. 세부 모델마다 임의의 성격을 붙이지 않습니다.

## 근거와 적용 방법

| 대상 | 공식 근거 | 재작성 시 적용 |
| --- | --- | --- |
| OpenAI 공통, GPT-4o | [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) | 작업·참고 자료·출력 조건을 구분하고 필요한 기존 예시만 유지 |
| GPT-4.1 / mini / nano | [GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide) | 문자 그대로 따를 수 있는 명시적 조건·우선순위·출력 명세, 복잡한 작업의 관찰 가능한 단계 |
| OpenAI 추론 계열 | [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices) | 목표·제약·완료 기준 중심, 일괄적인 단계별 사고·내부 사고 공개 요구를 추가하지 않음 |
| GPT-6 Astra / 6.1 Sol / 6 Luna | [GPT-6 prompting best practices](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#prompting-best-practices) | 완료 범위와 필요한 질문 조건, 문체·분량, 변경에 비례한 코딩 검증. 공식 가이드가 가족 공통 출발점으로 제시한 범위에서 공유 |
| Gemini 공통 / 2.5 / 4 | [Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) | 직접적인 지시, 일관된 구분자, 중요한 조건을 앞에, 긴 자료 뒤에 구체적 질문 |
| Gemini 3 계열 | 같은 문서의 Gemini 3 절 | 간결한 목표, 모호한 매개변수 명시, 필요한 응답 분량·말투 지정. 자동 내부 추론을 출력하도록 요구하지 않음 |
| Claude 공통 / 이전 4.x 계열 | [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | 긍정형 지시, 복잡한 자료·예시는 XML로 구분, 긴 문서 뒤의 질문. 짧은 질문에는 불필요한 XML을 붙이지 않음 |
| Claude Opus 5.5 | [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) | 붙여넣은 제3자 자료의 지시와 실제 요청 구분, 최종 결과와 완료 조건 |
| Claude Sonnet 5.5 | [Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5) | 요청 범위, 완료할 산출물과 관련 코딩 검증을 명시 |
| Claude Haiku 5.5 | [Prompting Claude Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5) | 필수 조건 구분, 변경 동작의 검증, 시간에 민감한 사실의 자료 확인 |
| Claude Fable 5.1 | [Prompting Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) | 읽기 쉬운 답변 밀도, 범위 안의 완료, 인용·요약 구분, 필요한 최신 자료 확인 |

모델 명칭은 [OpenAI 모델 목록](https://developers.openai.com/api/docs/models), [Gemini 모델 목록](https://ai.google.dev/gemini-api/docs/models), [Claude 모델 개요](https://platform.claude.com/docs/en/models/overview)에서 확인했습니다. 주요 텍스트 모델을 선정한 목록이며 이미지·음성 전용 모델이나 모든 API 스냅샷을 나열하지 않습니다. 이전 세대와 Preview는 UI에 표시합니다. 현재 목록은 계정별 접근·무료 사용·웹 서비스 노출을 보장하지 않습니다. Gemini 2.5의 기존 이용자 접근 제한 등 실제 제공 상태는 공식 목록에서 별도로 확인해야 합니다.

## 실행 규칙과 한계

- 대상 브랜드와 세부 모델은 `shared/target-models.js`의 허용 목록으로 정규화합니다. 다른 브랜드의 ID나 삭제된 ID는 해당 브랜드 공통 지침으로 돌아갑니다. 기존 설정에는 브랜드 공통이 자동 적용됩니다.
- `providers/remote-optimizer.js`가 선택된 프로필 규칙을 Gemini의 재작성 지시에 직접 넣습니다. 브랜드 이름만 바꾸는 구현이 아닙니다. 원문은 별도 JSON 필드로 전달하고 명칭·수치·부정·코드·출력 형식을 보존하도록 지시합니다.
- 모드(Default/ECO/Precision/Natural/Custom)는 별도 축입니다. 충돌 시 원문의 명시적 조건·사실 보존을 우선합니다. 모델 가이드를 이유로 요청하지 않은 역할·예시·도구를 만들어 붙이지 않습니다.
- 웹 입력창에 넣을 사용자 메시지를 만듭니다. 시스템·개발자 역할, 구조화 출력 스키마, 함수 호출 도구, temperature, thinking/effort 설정은 텍스트로 활성화할 수 없습니다. 대상 모델 선택도 실제 웹 AI나 API 실행 모델을 변경하지 않습니다.
- 미니 도구는 현재 사이트 브랜드에 저장된 프로필을 사용합니다. 웹 페이지의 모델 메뉴는 자동 감지하지 않습니다. 저장된 모델과 실제 모델을 사용자가 맞춰야 합니다.
- 프로필 리비전과 대상 모델 ID는 요청 결과 메타데이터에 남깁니다. 직접 API를 호출한 품질 비교는 이 업데이트에서 수행하지 않았습니다. 기존 1.9.0 홍보 벤치마크를 새 프로필의 성능 증거로 재사용하면 안 됩니다.

## 갱신 및 검증

공식 모델 목록 → 개별 모델 가이드 → 공통 프롬프트 문서 순서로 확인합니다. 새로운 세부 차이는 명시적 근거가 있을 때만 별도 규칙으로 추가하고, 확인일·리비전·출처를 함께 바꿉니다. 공개 아키텍처 설명만으로 특정 구분자나 문체가 최적이라고 결론짓지 않습니다.

자동 검증은 브랜드별 목록 제한, 선택값 유지, 잘못된 ID 복구, 실제 전송 지침의 차이, 원문 보존과 Custom 공존, 페이지의 임의 설정 덮어쓰기 방지, 오래된 결과 배제를 확인합니다. 별도 실제 품질 평가는 같은 원문·모드·대상 모델·예산을 고정하고 공통 지침 대비 작업 성공률·요구 보존·응답 시간·토큰을 비교해야 합니다.
