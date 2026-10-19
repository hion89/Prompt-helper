# 동적 모델 Registry 구현 계획

기존 구조를 확인했습니다. Manifest V3와 storage 권한을 사용하며, 팝업이 사용자 설정을 local에, 초안을 session에 저장합니다. 백그라운드는 키 보호와 Gemini 생성 요청을 처리하고 content script는 입력창 연결·교체·미니 도구만 처리합니다. Default/ECO/Precision/Natural/Custom은 재작성 지시와 별도입니다. 모델 지침은 shared/target-models.js에서 주입됩니다. Node 테스트·CDP 모의 브라우저·Python ZIP 패키징을 사용합니다.

기존 키 저장·생성·오류 처리·모드·미니 도구는 유지합니다. 다음 경계를 추가합니다.

- registry/: 권위 있는 JSON 원본, JSON Schema, 버전 manifest. seed JS는 JSON에서 자동 생성하는 오프라인 초기값입니다.
- shared/registry-schema.js: 스키마와 교차 참조 검증. remote JSON에는 실행 코드나 자유 형식 지시를 넣지 않습니다.
- shared/profile-rules.js: 기존 공식 문서 기반 규칙과 제한된 옵션을 지시문으로 바꾸는 로컬 코드입니다.
- shared/registry-client.js: 캐시 읽기, SHA-256 검증, HTTPS JSON 동기화, 마지막 정상본 복구.
- shared/target-models.js, settings.js: Registry 조회와 기존 선택값 유지, 새 모델·지원 종료·프로필 상태.
- popup/: 브랜드별 검색, 모델 목록, NEW·프로필 상태와 동기화 상태.
- tools/registry/: 제공사 어댑터, 탐색·중복 정리, 문서 캐시, 후보 생성, 평가·승격·원자적 게시·복구 도구.
- .github/workflows/: 하루 한 번 탐색과 검증·게시. 기존 Pages 워크플로는 그대로 재사용합니다.
- docs/registry/: GitHub Pages가 제공할 읽기 전용 JSON. 민감한 키는 Actions Secrets에만 둡니다.

확장 사용자에게 모델 탐색용 OpenAI/Anthropic 키를 요구하지 않습니다. 최적화 실행 키는 계속 개인 Gemini 키입니다. 신규 모델은 공통 지침으로 즉시 등록하되 후보는 실제 평가 없이는 활성화하지 않습니다. 인증된 목록에 없다는 사실만으로 지원 종료를 추정하지 않습니다. 운영 Secrets와 Pages 배포는 별도 외부 환경이며 로컬 구현 성공과 실제 운영 활성화를 구분해 보고합니다.
