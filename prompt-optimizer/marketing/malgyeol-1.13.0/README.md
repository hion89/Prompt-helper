# 말결 1.13.0 브랜드 자료

이름: **말결 — AI 프롬프트 최적화**

영문: **Malgyeol**

슬로건: **내 뜻을 살리는 프롬프트.**

- `store-icon-128.png`: 스토어 아이콘, 128×128
- `small-promo-440x280.png`: 작은 프로모션 타일, 440×280
- `marquee-promo-1400x560.png`: 마키 프로모션 타일, 1400×560
- `screenshot-01-workflow-1280x800.png`: 요청 재작성 소개
- `screenshot-02-custom-1280x800.png`: Custom 모드 소개
- `screenshot-03-models-1280x800.png`: 세부 모델 선택 소개

스토어 제출용 PNG는 모두 8비트 RGB이며 알파 채널이 없습니다. 소개 화면에는 실제 확장 HTML과 설명용 예시 데이터를 사용했습니다. 실제 API를 호출하거나 새로운 품질 수치를 측정한 자료는 아닙니다.

`brand-artwork.png`는 내장 imagegen 도구로 생성한 원본 배경 이미지입니다. 최종 생성 프롬프트는 `IMAGEGEN-PROMPT.txt`에 있습니다. 한글 문구와 아이콘은 코드로 별도 조판해 정확한 표기와 규격을 맞췄습니다. 상용 브랜드의 로고나 과거 버전의 성능 수치는 새 이미지에 넣지 않았습니다.

편집 가능한 아이콘은 `malgyeol-icon.svg`, 조판 원본은 `source/*.html`입니다. 저장소의 `node tools/render-brand-assets.mjs`로 전체 이미지를 다시 만듭니다. Node 22 이상과 Chrome이 필요하며 Chrome 경로는 `BROWSER_PATH` 환경 변수로 바꿀 수 있습니다. 이 렌더러는 외부 API를 호출하지 않습니다.

런타임 아이콘만 다시 만들 때에는 `python tools/generate-icons.py` 또는 `node tools/render-brand-assets.mjs --icons-only`를 사용합니다.
