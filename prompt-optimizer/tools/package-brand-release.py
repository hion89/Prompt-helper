"""Build the extension upload ZIP and an explicitly separate store submission kit."""
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf8'))
version = manifest['version']
subprocess.run([sys.executable, str(root / 'tools/package-store.py')], check=True)
submission = root / 'store-submission'
upload = submission / 'upload' / f'malgyeol-{version}.zip'
assets = root / 'marketing' / f'malgyeol-{version}'
kit = submission / 'releases' / f'malgyeol-{version}'
for directory in ['extension', 'store-images', 'listing']:
    (kit / directory).mkdir(parents=True, exist_ok=True)
shutil.copyfile(upload, kit / 'extension' / upload.name)
dimensions = {'store-icon-128.png': (128, 128), 'small-promo-440x280.png': (440, 280),
              'marquee-promo-1400x560.png': (1400, 560), 'screenshot-01-workflow-1280x800.png': (1280, 800),
              'screenshot-02-custom-1280x800.png': (1280, 800), 'screenshot-03-models-1280x800.png': (1280, 800)}
for filename, size in dimensions.items():
    content = (assets / filename).read_bytes()
    assert content[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', content[16:24]) == size, filename
    assert content[24:26] == bytes([8, 2]), 'Store images must be 24-bit RGB without alpha: ' + filename
    shutil.copyfile(assets / filename, kit / 'store-images' / filename)

listing = f'''# 스토어 표시명

말결 — AI 프롬프트 최적화

## 짧은 설명

내 뜻을 살리는 프롬프트. 개인 Gemini API 키로 요청의 의도와 조건을 분석하고 대상 AI 모델에 맞는 프롬프트로 다듬습니다.

## 상세 설명

'''
marketing = (root / 'marketing/MARKETING_KIT.md').read_text(encoding='utf8')
listing += marketing.split('## 스토어 소개 · 복사용\n\n', 1)[1].split('\n## 짧은 소개', 1)[0]
listing += f'''\n\n## 이번 업데이트 · {version}

사용자가 제공한 한글 말결 로고를 적용하고 딥 그린·크림 디자인으로 화면과 홍보 이미지를 다시 구성했습니다. 기존 설정과 개인 Gemini API 키, 최적화 기능은 유지됩니다. 기존 항목을 업데이트해 사용하세요.

## 공개 URL · 기존 주소 유지

- 홈페이지: https://hion89.github.io/Prompt-helper/
- 지원: https://hion89.github.io/Prompt-helper/support.html
- 개인정보처리방침: https://hion89.github.io/Prompt-helper/privacy-policy.html
- 문의: dominicjjung@gmail.com
'''
(kit / 'listing/STORE-LISTING-KO.md').write_text(listing, encoding='utf8')
(kit / 'listing/REVIEW-NOTES.md').write_text('''말결은 기존 Prompt Optimizer의 이름과 디자인을 변경한 동일 확장 프로그램입니다. 1.13.0 대비 권한, 개인 Gemini API 키 저장 방식과 요청 전송 경로는 변경하지 않았습니다. 기존 스토어 항목에 새 패키지를 업로드하여 업데이트합니다.

옵션 화면에서 심사자가 직접 발급한 Gemini API 키를 등록하고 API 서버 연결 권한을 허용한 뒤 팝업에 요청을 입력해 Optimize를 실행합니다. 유효한 키 없이는 실제 API 재작성을 실행할 수 없습니다. 키는 개발자에게 보내거나 심사 메모에 기재하지 않습니다.

사용자가 결과를 확인한 뒤 복사 또는 Replace로 적용하며 메시지를 자동 제출하지 않습니다. 홍보 소개 화면의 입력과 결과는 기능 설명을 위한 예시이며 실제 품질 측정치가 아닙니다.
''', encoding='utf8')
(kit / 'START-HERE.md').write_text(f'''# 말결 {version} 스토어 업데이트 자료

**‘새 패키지 업로드’에는 `extension/{upload.name}`만 선택하세요.**

이 자료 묶음 ZIP 전체는 확장 프로그램 패키지가 아니므로 업로드하지 않습니다.

1. Chrome Web Store Developer Dashboard에서 기존 Prompt Optimizer 항목을 엽니다. 새 항목을 만들지 않습니다.
2. 패키지 화면에서 `extension/{upload.name}`을 업로드합니다.
3. 스토어 이름과 설명을 `listing/STORE-LISTING-KO.md`의 문구로 변경합니다.
4. 스토어 아이콘에 `store-images/store-icon-128.png`를 올립니다.
5. 캡처화면에는 `screenshot-01`, `02`, `03` PNG를, 작은 프로모션 타일에는 `small-promo-440x280.png`, 마키에는 `marquee-promo-1400x560.png`를 올립니다. 이전 이름이 들어간 이미지도 교체하세요.
6. 개인정보처리방침·지원·홈페이지 URL은 기존 주소를 유지합니다. 배포된 페이지에서 새 이름이 보이는지 확인합니다.
7. 검토용 메모가 필요하면 `listing/REVIEW-NOTES.md`를 참고한 뒤 심사를 제출합니다.

기존 스토어 항목을 업데이트하면 확장 ID와 설정 저장소가 유지됩니다. 개발자 모드에서 별도의 폴더를 새 확장으로 로드하면 다른 ID가 될 수 있으므로, 기존 개발용 확장은 같은 폴더를 업데이트하고 새로고침하세요.

이번 자료는 패키지와 이미지를 준비한 상태입니다. 스토어 심사 제출·승인은 별도입니다. 무료 API 사용 여부와 호출 한도는 사용자 프로젝트 설정에 따릅니다.
''', encoding='utf8')
(submission / 'README-FIRST.md').write_text(f'''# 말결 {version} — 최신 스토어 제출 자료

최신 안내는 `releases/malgyeol-{version}/START-HERE.md`에 있습니다.

- 업로드할 확장 패키지: `upload/{upload.name}`
- 새 홍보 이미지와 복사 문구: `releases/malgyeol-{version}/`
- 전체 제출 자료 ZIP: `malgyeol-{version}-store-kit.zip`

이 폴더는 Git에서 제외되어 있습니다. 이전 버전의 자료는 보관용입니다. 기존 Chrome Web Store 항목에 새 패키지를 올려 업데이트하세요.
''', encoding='utf8')
checksums = {}
for file in sorted(kit.rglob('*')):
    if file.is_file() and file.name != 'checksums.json': checksums[file.relative_to(kit).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
(kit / 'checksums.json').write_text(json.dumps(checksums, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
archive = submission / f'malgyeol-{version}-store-kit.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=9) as zipped:
    for file in sorted(kit.rglob('*')):
        if file.is_file(): zipped.write(file, file.relative_to(kit).as_posix())
with ZipFile(archive) as zipped: assert zipped.testzip() is None
print(json.dumps({'upload': str(upload), 'storeKit': str(archive), 'folder': str(kit), 'storeImages': len(dimensions)}, ensure_ascii=False))
