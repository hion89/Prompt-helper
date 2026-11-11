# 보안 / Security

취약점은 공개 Issue나 PR에 상세 내용을 올리지 말고 **dominicjjung@gmail.com**으로 보내 주세요. 영향을 받는 공개 파일 경로, 커밋과 비밀정보 없는 재현 절차를 포함해 주세요. API 키, 접근 토큰, 개인 대화, 프로필 원문은 보내지 마세요. 제보 처리 기한이나 버그 바운티는 보장하지 않습니다.

Please report vulnerabilities privately to **dominicjjung@gmail.com** with affected public file paths, commit and sanitized reproduction steps. Do not post exploit details, credentials or personal data in public issues/PRs. No response SLA or bounty is offered.

## 공개 범위

- `open-source/prompt-core/`: MIT로 재사용 가능한, 확장 1.13.1에서 추출한 오프라인 참고 엔진. 최신 제품 전체 소스가 아닙니다.
- `docs/`: 제품 안내·개인정보처리방침·공개 모델 Registry 데이터. Registry는 실행 코드가 아닌 공개 JSON입니다.
- `.github/`: 공개 파일·무결성 검사와 정적 Pages 게시만 수행합니다. 비공개 생성·평가·제품 빌드는 포함하지 않습니다.

공개 예제에는 네트워크·자격증명·사용자 데이터 처리 기능이 없습니다. 다른 앱에 통합하거나 외부 API·저장 기능을 추가하면 통합자가 보안과 개인정보 처리를 검토해야 합니다. 자동 검사는 알려진 비밀키 패턴·파일 허용 목록·해시·심볼릭 링크 등을 검사하며, 모든 취약점이나 임의의 비밀 문자열이 없음을 보장하지는 않습니다.

## 과거 기록

이 저장소는 예전에 개발 소스와 배포 자료를 포함했습니다. 과거 공개 Git 기록은 여전히 접근 가능할 수 있습니다. 현재 공개 예제의 MIT 허가는 **해당 디렉터리만** 대상으로 하며, 과거 기록 전체를 일괄 재라이선스하지 않습니다. 현재 파일의 검사 결과를 과거 모든 커밋·첨부파일·포크의 완전한 안전성으로 해석하지 마세요. 기록 삭제나 강제 푸시는 수행하지 않았습니다.
