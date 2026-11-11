# 말결 · Malgyeol

**내 뜻을 살리는 프롬프트.** 말결은 요청의 목적과 조건을 정리하는 Chrome 확장 프로그램입니다.

- [제품 소개](https://hion89.github.io/Prompt-helper/)
- **[공개 소스 시작하기 · Open-source prompt core](open-source/prompt-core/README.md)**
- [고객 지원](https://hion89.github.io/Prompt-helper/support.html) · [개인정보처리방침](https://hion89.github.io/Prompt-helper/privacy-policy.html)
- [보안 제보](SECURITY.md)

## 읽고, 실행하고, 재사용하기

`open-source/prompt-core/`에는 이전에 공개됐던 말결 **1.13.1의 로컬 프롬프트 구성 엔진**을 독립적으로 실행할 수 있게 정리했습니다. 원본 소스·출처 해시·회귀 테스트·예제·한국어/영어 안내를 제공합니다. **해당 디렉터리는 MIT 라이선스**이므로 고지를 유지하면 수정·상업적 사용·재배포할 수 있습니다.

```sh
git clone --depth 1 https://github.com/hion89/Prompt-helper.git
cd Prompt-helper/open-source/prompt-core
npm test
npm run example
```

Node.js 22 이상만 필요합니다. 의존성 설치, API 키, 계정, 네트워크 호출은 필요 없습니다. Windows에서는 `npm.cmd`도 사용할 수 있습니다. [자세한 API와 한계](open-source/prompt-core/README.md)를 확인하세요.

이 참고 엔진은 규칙으로 원문에 지침을 덧붙입니다. **현재 확장·데스크톱 앱 전체 소스 또는 최신 Gemini 재작성 엔진을 공개한 것은 아닙니다.** 최신 제품은 별도 비공개 저장소에서 개발합니다. 모델별 최적화 효과나 토큰 절감은 보장하지 않습니다. 공개 예제 개선은 민감정보 없는 Issue/PR로 제안하거나 포크에서 진행할 수 있습니다.

## 저장소 범위와 라이선스

| 경로 | 내용 | 재사용 조건 |
| --- | --- | --- |
| `open-source/prompt-core/` | 고정된 오프라인 참고 엔진·테스트·예제·문서 | [MIT](open-source/prompt-core/LICENSE) |
| `docs/` | 공개 안내·지원·정책·모델 Registry | MIT 일괄 적용 대상 아님. 인용한 제조사 자료는 원출처 조건 확인 |
| `.github/` | 공개 파일 검증·Pages 배포 | 운영용 공개 코드, 별도 라이선스 허가 없음 |

로고·말결 상표와 과거 전체 Git 기록은 위 MIT 허가에 포함되지 않습니다. 모델 Registry를 읽을 때 사용자의 키나 프롬프트를 이 저장소에 보내지 않습니다. 공개 모델 데이터의 출처 표시는 유지하세요. 과거 공개 소스가 Git 이력에 남을 수 있으며, 자세한 경계와 신고 방법은 [SECURITY.md](SECURITY.md)에 설명합니다.

## English

The **[MIT-licensed offline prompt core](open-source/prompt-core/README.md)** is a runnable reference extracted from the already-public Malgyeol extension **1.13.1**. It includes provenance hashes, tests and an example. Node.js 22+ is sufficient; no packages, credentials or API calls are needed. Clone with `--depth 1`, enter `open-source/prompt-core`, and run `npm test` / `npm run example`.

This is **not the full source of the current extension or desktop app**. Only the reference directory is MIT-licensed; other repository material, branding, third-party model data and historical Git objects are outside that grant. The heuristic compiler does not guarantee improved answers or token savings. See the reference README and [security policy](SECURITY.md) before contributing.

문의 / Contact: dominicjjung@gmail.com
